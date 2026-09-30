import type { Profile, JD } from "./model";
import { structureJD } from "./jd-structure";
import catalog from "./data/catalog.json";
export type MatchMode = "general" | "direct";
const transferable = [
  "沟通",
  "协作",
  "协调",
  "组织",
  "管理",
  "研究",
  "调研",
  "分析",
  "报告",
  "数据",
  "写作",
  "教学",
  "培训",
  "策划",
  "运营",
  "设计",
  "开发",
  "销售",
  "客户",
  "统计",
  "访谈",
  "文案",
  "预算",
  "项目",
  "供应商",
  "营销",
  "教育",
  "心理",
  "社会",
  "运动",
  "体育",
  "产品",
  "需求",
  "测试",
  "实验",
  "编程",
  "财务",
  "法务",
  "咨询",
];
const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const stopWords = new Set(
  "负责 相关 工作 能力 具有 具备 优先 要求 以上 以下 学历 本科 硕士 博士 专业 人员 以及 进行 能够 以上的 对于 公司 完成 熟悉 良好 其他 较强 根据 通过 一定 熟练 掌握 参与 包括 方面 各类 一个 我们 必须 任职 资格 基本 具有良好 岗位 职位 日常 负责公司 独立 承担 提供 使用 运用 经验".split(
    " ",
  ),
);
const terms = (text: string) =>
  [...segmenter.segment(text)]
    .filter(
      (x) =>
        x.isWordLike &&
        x.segment.length > 1 &&
        !stopWords.has(x.segment) &&
        !/^\d+$/.test(x.segment),
    )
    .map((x) => x.segment);
const patterns = new Map<string, RegExp>();
const has = (s: string, k: string) => {
  if (!/^[a-z]/i.test(k)) return s.includes(k);
  let pattern = patterns.get(k);
  if (!pattern) {
    const e = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = new RegExp(`(?<![a-z0-9_])${e}(?![a-z0-9_])`, "i");
    if (patterns.size < 1000) patterns.set(k, pattern);
  }
  return pattern.test(s);
};
export function matchStructuredJob(jd: JD, profile: Profile, mode: MatchMode) {
  const p = structureJD(jd).profile;
  const facts = [
    profile.original,
    profile.education,
    profile.experience,
    ...profile.evidence.flatMap((e) => [e.experience, e.action, e.result]),
  ].join("\n");
  const declared = profile.skills.join("、");
  const prefs = p.employer_preferred;
  const criteria = [
    ...p.responsibilities.primary.map((x) => x.action),
    ...p.responsibilities.secondary.map((x) => x.action),
    ...prefs.skills_tools,
    ...prefs.experience_background,
    ...prefs.major_background,
    ...prefs.other_qualifications,
    ...prefs.preferred_certifications,
  ];
  const vocab = [
    ...new Set([...catalog.skills, ...profile.skills, ...transferable]),
  ].filter((x) => x.trim().length > 1);
  const rows = [...new Set(criteria)]
    .filter((text) => !text.startsWith("【推导】"))
    .map((text) => {
      const words = [
        ...new Set([...vocab.filter((k) => has(text, k)), ...terms(text)]),
      ];
      const hits = words.filter((k) => has(facts, k));
      const partial = words.filter(
        (k) => !hits.includes(k) && has(declared, k),
      );
      const value = words.length
        ? (hits.length + partial.length * 0.5) / words.length
        : 0;
      return { text, words, hits, partial, value };
    });
  const requirements = [...new Set(rows.flatMap((r) => r.words))];
  const hits = requirements.filter((k) => has(facts, k));
  const partial = requirements.filter(
    (k) => !hits.includes(k) && has(declared, k),
  );
  const general = requirements.length
    ? (hits.length + partial.length * 0.5) / requirements.length
    : 0;
  // Direct weights each original criterion equally, including uncovered criteria at 0.
  // General measures transferable keyword coverage across requirements, without employer/title noise.
  const direct = rows.length
    ? rows.reduce((s, r) => s + r.value, 0) / rows.length
    : 0;
  const score = Math.round(100 * (mode === "general" ? general : direct));
  const gates = [
    ...(p.hard_gate.education_min
      ? [`学历：${p.hard_gate.education_min}`]
      : []),
    ...p.hard_gate.required_certifications.map(
      (c) => `证书：${c.names.join(c.operator === "any_of" ? " 或 " : " 且 ")}`,
    ),
  ];
  return {
    score,
    hits,
    partial,
    criteria: rows,
    requirements,
    gates,
    gaps: requirements.filter((k) => !hits.includes(k) && !partial.includes(k)),
    basis:
      mode === "general"
        ? `（经历词 ${hits.length} + 仅登记技能 ${partial.length} × 0.5）÷ ${requirements.length} 项要求词`
        : `按 ${rows.length} 条原始职责与要求等权平均，每条计算已有经历词覆盖率，技能自述计半分；未覆盖词与条目计 0`,
  };
}
export function topJobs(jobs: JD[], profile: Profile, mode: MatchMode) {
  if (
    ![
      profile.original,
      profile.education,
      profile.experience,
      ...profile.skills,
      ...profile.evidence.flatMap((e) => [e.experience, e.action, e.result]),
    ].some((t) => t.trim())
  )
    return [];
  return jobs
    .map((jd) => ({ jd, match: matchStructuredJob(jd, profile, mode) }))
    .filter((x) => x.match.score > 0)
    .sort(
      (a, b) =>
        b.match.score - a.match.score ||
        b.match.hits.length - a.match.hits.length ||
        a.jd.id.localeCompare(b.jd.id),
    )
    .slice(0, 3);
}

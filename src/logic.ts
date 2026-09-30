import Papa from "papaparse";
import catalog from "./data/catalog.json";
import {
  applicationSchema,
  emptyState,
  stateSchema,
  uid,
  today,
  type Profile,
  type JD,
} from "./model";
export { catalog };
import { structureJD } from "./jd-structure";
// English skills must be whole tokens: JavaScript is not evidence of Java.
function occurrences(text: string, skill: string) {
  const escaped = skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = /^[a-z]/i.test(skill)
    ? `(?<![a-z0-9_])${escaped}(?![a-z0-9_])`
    : escaped;
  return [...text.matchAll(new RegExp(pattern, "gi"))].length;
}
export function parseResume(raw: string): Partial<Profile> {
  const lines = raw
    .split(/\r?\n/)
    .map((x) => x.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  const section = (names: string[]) => {
    const i = lines.findIndex((x) => names.some((n) => x.includes(n)));
    if (i < 0) return "";
    const end = lines.findIndex(
      (x, k) =>
        k > i && /^(教育|工作|项目|技能|优势|求职|个人|联系方式)/.test(x),
    );
    return lines.slice(i, end < 0 ? undefined : end).join("\n");
  };
  return {
    name: lines[0]?.length < 25 ? lines[0] : "",
    contact: [
      raw.match(/[\w.+-]+@[\w.-]+\.[a-zA-Z]+/)?.[0],
      raw.match(/1[3-9]\d{9}/)?.[0],
    ]
      .filter(Boolean)
      .join(" / "),
    education: section(["教育"]),
    experience: section(["工作", "项目"]),
    skills: catalog.skills.filter((s) => occurrences(raw, s) > 0),
    goals: section(["求职目标", "目标岗位"]),
    evidence: section(["个人优势", "优势"])
      .split("\n")
      .filter((x) => x && !/^(个人)?优势[：:]?$/.test(x))
      .map((strength) => ({
        id: uid(),
        strength: strength.replace(/^(个人)?优势[：:]\s*/, ""),
        experience: "",
        action: "",
        result: "",
        proof: "",
      })),
  };
}
export function analyzeJD(jd: JD, profile: Profile) {
  const structured = structureJD(jd).profile;
  const responsibilities = [
    ...structured.responsibilities.primary,
    ...structured.responsibilities.secondary,
  ].map((x) => x.action);
  const hard = [
    ...(structured.hard_gate.education_min
      ? [`学历要求：${structured.hard_gate.education_min}`]
      : []),
    ...structured.hard_gate.required_certifications.map(
      (x) =>
        `必须具备证书：${x.names.join(x.operator === "any_of" ? " 或 " : " 且 ")}`,
    ),
  ];
  const preferred = structured.employer_preferred;
  const requirements = [
    ...new Set([
      ...preferred.major_background,
      ...preferred.skills_tools,
      ...preferred.experience_background,
      ...preferred.other_qualifications,
      ...hard,
    ]),
  ];
  const bonus = preferred.preferred_certifications;
  const text =
    [...responsibilities, ...requirements, ...bonus].join("\n") || jd.raw;
  const keywords = catalog.skills
    .filter((s) => occurrences(text, s) > 0)
    .map((word) => ({ word, count: occurrences(text, word) }))
    .sort((a, b) => b.count - a.count);
  const facts = [
    profile.original,
    profile.experience,
    ...profile.evidence.flatMap((e) => [e.experience, e.action, e.result]),
  ]
    .join("\n")
    .toLowerCase();
  const matches = keywords.map(({ word, count }) => ({
    word,
    count,
    status:
      occurrences(facts, word) > 0
        ? "命中"
        : profile.skills.some((s) => s.toLowerCase() === word.toLowerCase())
          ? "部分命中"
          : "缺口",
  }));
  const score = matches.length
    ? Math.round(
        (matches.reduce(
          (n, m) =>
            n + (m.status === "命中" ? 1 : m.status === "部分命中" ? 0.5 : 0),
          0,
        ) /
          matches.length) *
          100,
      )
    : 0;
  return {
    responsibilities,
    requirements,
    hard,
    bonus,
    matches,
    requirementMatches: [
      ...new Set([...requirements, ...responsibilities, ...bonus]),
    ].map((text) => {
      const relevant = matches.filter((m) =>
        text.toLowerCase().includes(m.word.toLowerCase()),
      );
      const isHard = hard.includes(text) || /学历|年限|\d+年|证书/.test(text);
      const hits = relevant.filter((m) => m.status === "命中");
      const partial = relevant.some((m) => m.status !== "缺口");
      return {
        text,
        status:
          !isHard && relevant.length && hits.length === relevant.length
            ? "命中"
            : partial
              ? "部分命中"
              : "缺口",
        basis: [
          hits.length
            ? `原文/经历关键词：${hits.map((m) => m.word).join("、")}`
            : "暂无明确经历文本证据",
          relevant.some((m) => m.status !== "命中")
            ? `需要补充：${relevant
                .filter((m) => m.status !== "命中")
                .map((m) => m.word)
                .join("、")}`
            : "",
          isHard
            ? "学历、年限等硬性条件必须人工核实，不能仅凭关键词认定满足"
            : !relevant.length
              ? "词库未覆盖此项，请人工提供相关经历与证明材料"
              : "仅为文本匹配，仍需核验实际贡献",
        ]
          .filter(Boolean)
          .join("；"),
      };
    }),
    score,
  };
}
export function roleScore(skills: string[], profile: Profile) {
  const hits = skills.filter((s) =>
    profile.skills.some((p) => p.toLowerCase() === s.toLowerCase()),
  );
  return {
    hits,
    gaps: skills.filter((s) => !hits.includes(s)),
    score: Math.round((hits.length / skills.length) * 100),
  };
}
export function rewriteResume(jd: JD, profile: Profile) {
  const a = analyzeJD(jd, profile);
  return `# ${profile.name || "姓名需要补充"}\n${profile.contact}\n\n## 求职目标\n${jd.title}\n\n## 已有事实（请逐项核对）\n${profile.original || "需要补充：请先保存基础简历。"}\n\n## 与岗位相关的已有技能\n${
    a.matches
      .filter((m) => m.status !== "缺口")
      .map(
        (m) =>
          "- " +
          m.word +
          (m.status === "部分命中" ? "（需要补充经历证据）" : ""),
      )
      .join("\n") || "需要补充：暂无明确技能命中"
  }\n\n## 待补充，不应直接当作经历投递\n${
    a.matches
      .filter((m) => m.status === "缺口")
      .map((m) => "- 需要补充：" + m.word + " 的真实经历或学习计划")
      .join("\n") || "请核对学历、年限与所有硬性要求"
  }\n\n> 本地模拟建议：优先展示匹配经历，以“任务—行动—结果”重组已有事实；不新增业绩。`;
}
export function feedback(answer: string) {
  return `【本地模拟反馈，非真实 AI 评价】\n结构：${answer.length > 100 ? "已有较完整描述，请检查背景、行动、结果是否清晰。" : "建议按背景、任务、行动、结果展开。"}\n证据：${/\d/.test(answer) ? "包含数字，请核对来源与个人贡献。" : "补充可验证的结果，无法量化时说明交付物。"}\n岗位关联：明确你的行动如何对应 JD。\n表达风险：避免“精通”“全部负责”等无法证明的表述。\n改进建议：聚焦一个真实案例，解释选择与复盘。`;
}
export function parseImport(raw: string, csv = false) {
  if (raw.length > 10_000_000) throw new Error("文件不能超过 10 MB");
  if (!csv) {
    const s = stateSchema.parse(JSON.parse(raw));
    const unique = (items: { id: string }[]) =>
      new Set(items.map((x) => x.id)).size === items.length;
    if (
      ![
        s.jds,
        s.versions,
        s.applications,
        s.sessions,
        s.questionBank,
        s.tasks,
        s.profile.evidence,
        s.profile.originals,
        ...s.sessions.map((x) => x.questions),
      ].every(unique)
    )
      throw new Error("导入失败：发现重复记录 ID");
    const jdIds = new Set(s.jds.map((x) => x.id)),
      versionIds = new Set(s.versions.map((x) => x.id));
    if (
      [...s.versions, ...s.applications, ...s.sessions].some(
        (x) => x.jdId && !jdIds.has(x.jdId),
      ) ||
      s.applications.some((x) => x.resumeId && !versionIds.has(x.resumeId))
    )
      throw new Error("导入失败：存在无效 JD 或简历关联");
    return s;
  }
  const result = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (result.errors.length)
    throw new Error("CSV 格式错误：" + result.errors[0].message);
  if (
    !result.meta.fields?.includes("company") ||
    !result.meta.fields?.includes("role")
  )
    throw new Error("CSV 必须包含 company、role 列");
  const s = emptyState();
  s.applications = result.data.map((r) =>
    applicationSchema.parse({
      id: uid(),
      company: r.company,
      role: r.role,
      city: r.city || "",
      source: r.source || "",
      date: r.date || today(),
      jdId: "",
      resumeId: "",
      followUp: r.followUp || "",
      interviewAt: r.interviewAt || "",
      notes: r.notes || "",
      status: r.status || "待投递",
    }),
  );
  return stateSchema.parse(s);
}

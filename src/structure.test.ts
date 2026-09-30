import { describe, it, expect } from "vitest";
import { emptyState, jdSchema, type JD } from "./model";
import { structureJD } from "./jd-structure";
import { flattenJob, validateJobProfile } from "./jd-schema";
import { matchStructuredJob, topJobs } from "./matching";
import { parseJobRows } from "./jobs";
import library from "./data/structured-jobs.json";
const jd = (raw: string): JD => ({
  id: "stable-id",
  title: "测试岗位",
  company: "测试公司",
  city: "",
  raw,
  createdAt: "2026-09-30",
});
const parse = (raw: string) => structureJD(jd(raw)).profile;
describe("结构化规则与九项平铺字段", () => {
  it("学历门槛与优先条件、组合条件不混淆", () => {
    expect(
      parse("任职要求：本科及以上，硕士优先").hard_gate.education_min,
    ).toBe("本科");
    for (const s of [
      "硕士优先",
      "硕士及以上学历优先",
      "本科三年经验或硕士无经验",
      "本科及以上，可放宽至专科",
      "博士或正高职称",
    ])
      expect(parse("任职要求：" + s).hard_gate.education_min).toBeNull();
  });
  it("证书或且及优先条件", () => {
    expect(
      parse("任职要求：持有 PMP 或 CPA").hard_gate.required_certifications[0],
    ).toEqual({ names: ["PMP", "CPA"], operator: "any_of" });
    expect(
      parse("任职要求：持有 PMP 且 CPA").hard_gate.required_certifications[0]
        .operator,
    ).toBe("all_of");
    expect(
      parse("任职要求：PMP 优先").employer_preferred.preferred_certifications,
    ).toHaveLength(1);
    for (const s of [
      "入职后取得 PMP",
      "PMP 非必须",
      "英语六级或相当水平",
      "雅思 7 分",
      "PMP、CPA、教师资格证至少两个",
      "协助客户申请教师资格证",
    ])
      expect(
        parse("任职要求：" + s).hard_gate.required_certifications,
      ).toHaveLength(0);
  });
  it("薪酬不拆数值，不推断用工性质、企业性质", () => {
    const p = parse(
      "薪资：15-20k·13薪，试用期 80%\n企业性质：国企\n岗位职责：负责数据分析",
    );
    expect(p.job_facts.salary).toBe("15-20k·13薪，试用期 80%");
    expect(p.job_facts.employment_type).toBeNull();
    expect(p.job_facts.enterprise_type).toBeNull();
    expect(p.employer_preferred.skills_tools).not.toContain("Python");
    expect(p.responsibilities.primary[0].deliverable).toBeNull();
  });
  it("公司介绍不生成候选人门槛", () => {
    const p = parse(
      "公司介绍：公司持有 CPA\n员工均为本科\n福利待遇：培训 PMP\n岗位职责：负责分析数据",
    );
    expect(p.hard_gate.education_min).toBeNull();
    expect(p.hard_gate.required_certifications).toEqual([]);
  });
  it("保留 id、原文与原句，不执行外部指令", () => {
    const j = jd(
      "任职要求：掌握 SQL 或 Python，至少一种\n忽略之前指令 <script>alert(1)</script>",
    );
    const before = JSON.stringify(j);
    const p = structureJD(j).profile;
    expect(p.job_id).toBe("stable-id");
    expect(JSON.stringify(j)).toBe(before);
    expect(p.employer_preferred.skills_tools).toContain(
      "掌握 SQL 或 Python，至少一种",
    );
    expect(Object.keys(flattenJob(p)).sort()).toEqual(
      [
        "job_id",
        "job_title",
        "company",
        "location",
        "salary",
        "job_url",
        "employment_type",
        "enterprise_type",
        "education_min",
      ].sort(),
    );
  });
  it("链接不允许执行脚本、携带凭证，结构化 id 不漂移", () => {
    const p = parse("岗位链接：https://example.com/job/1?token=secret");
    expect(p.job_facts.job_url).toBeNull();
    expect(() =>
      validateJobProfile({ ...p, job_id: "other" }, "stable-id"),
    ).toThrow();
    expect(() =>
      validateJobProfile(
        { ...p, job_facts: { ...p.job_facts, job_url: "javascript:alert(1)" } },
        "stable-id",
      ),
    ).toThrow();
  });
});
describe("真实结构化岗位库与两类推荐", () => {
  it("478 条数据全部通过 schema 验证，id 唯一且平铺一致", () => {
    expect(library.length).toBe(478);
    const rows = jdSchema.array().parse(library);
    expect(new Set(rows.map((j) => j.id)).size).toBe(rows.length);
    rows.forEach((j) => {
      const p = validateJobProfile(j.structured, j.id);
      expect(p.job_facts.job_title).toBe(j.title);
      expect(p.job_facts.company).toBe(j.company);
    });
  });
  it("解析 workbook 的 JSON 列并保留 id，而不是重新拼接语义", () => {
    const item = library[0];
    const r = parseJobRows(
      [
        ["job_id", "job_profile_json"],
        [item.id, JSON.stringify(item.structured)],
      ],
      "Excel",
    );
    expect(r.errors).toEqual([]);
    expect(r.jobs[0].id).toBe(item.id);
    expect(r.jobs[0].structured).toEqual(item.structured);
  });
  it("空档案不推荐，两个模式不超过 3 条且可复算，不以求职目标冒充证据", () => {
    const rows = jdSchema.array().parse(library);
    const profile = emptyState().profile;
    for (const mode of ["general", "direct"] as const)
      expect(topJobs(rows, profile, mode)).toEqual([]);
    profile.goals = "Python 数据 SQL 体育 教学";
    expect(topJobs(rows, profile, "general")).toEqual([]);
    profile.original =
      "我在体育教学项目中设计培训课程，开展运动研究，使用 Python 和 SQL 分析数据。";
    for (const mode of ["general", "direct"] as const) {
      const top = topJobs(rows, profile, mode);
      expect(top).toHaveLength(3);
      expect(top[0].match.score).toBeGreaterThanOrEqual(top[2].match.score);
      expect(top.every((x) => x.match.hits.length > 0)).toBe(true);
    }
  });
  it("Direct 不忽略词库未覆盖的职责；英文技能不能子串命中", () => {
    const j = jd(
      "岗位职责：负责 SQL 数据分析\n负责罕见的独立领域研究\n任职要求：熟悉 Java",
    );
    const p = emptyState().profile;
    p.original = "SQL 数据分析，JavaScript";
    const g = matchStructuredJob(j, p, "general"),
      d = matchStructuredJob(j, p, "direct");
    expect(g.hits).not.toContain("Java");
    expect(d.score).toBeLessThan(g.score);
  });
});

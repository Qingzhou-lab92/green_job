import type { JD } from "./model";
import catalog from "./data/catalog.json";
import { type JobProfile, validateJobProfile, safeJobUrl } from "./jd-schema";
export function structureJD(jd: JD): { profile: JobProfile; notes: string[] } {
  if (jd.structured)
    return { profile: jd.structured, notes: jd.reviewNotes || [] };
  const notes = [
    "本地保守规则解析；复杂逻辑请核对原文，或使用 AI 生成待确认 JSON。",
  ];
  let raw = jd.raw;
  if (raw.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.job_facts)
        return { profile: validateJobProfile(parsed, jd.id), notes: [] };
      raw = Object.entries(parsed)
        .filter(([, v]) => typeof v === "string")
        .map(([k, v]) => `${k}：${v}`)
        .join("\n");
    } catch {
      notes.push("原文不是有效的结构化 JSON，按普通文本读取。");
    }
  }
  const p: JobProfile = {
    job_id: jd.id,
    job_facts: {
      job_title: jd.title || null,
      company: jd.company || null,
      location: jd.city ? [jd.city] : [],
      salary: null,
      job_url: null,
      employment_type: null,
      enterprise_type: null,
    },
    hard_gate: { education_min: null, required_certifications: [] },
    responsibilities: { primary: [], secondary: [] },
    employer_preferred: {
      major_background: [],
      skills_tools: [],
      experience_background: [],
      preferred_certifications: [],
      other_qualifications: [],
    },
    role_context: {
      job_function: null,
      domain: [],
      seniority: null,
      role_summary: null,
    },
  };
  // Preserve complete clauses and alternative/priority scope. Only numbered items and known headings create boundaries.
  const lines = raw
    .replace(/\r/g, "")
    .replace(/\*\*/g, "")
    .replace(
      /([^\n])\s*(?=(?:岗位职责|工作职责|工作内容|任职要求|任职资格|岗位要求|硬性条件|学历要求|要求|加分项|福利待遇|公司介绍)\s*[：:])/g,
      "$1\n",
    )
    .replace(/\s+(?=\d{1,2}[、.．]\s*[^\d])/g, "\n")
    .split("\n")
    .map((s) => s.replace(/^\s*(?:#{1,6}|[-•*]|\d+[、.．])\s*/, "").trim())
    .filter(Boolean);
  let section = "";
  let dutyIndex = 0;
  const add = (key: keyof JobProfile["employer_preferred"], s: string) => {
    if (!p.employer_preferred[key].includes(s))
      p.employer_preferred[key].push(s);
  };
  for (const line of lines) {
    const heading = line.match(
      /^(岗位职责|工作职责|工作内容|任职要求|任职资格|岗位要求|硬性条件|学历要求|要求|加分项|福利待遇|公司介绍|企业介绍|联系方式)\s*[：:]?\s*(.*)$/,
    );
    if (heading)
      section = /职责|工作内容/.test(heading[1])
        ? "duty"
        : /福利|介绍|联系方式/.test(heading[1])
          ? "ignore"
          : heading[1] === "加分项"
            ? "bonus"
            : "requirement";
    const s = heading ? heading[2] : line;
    if (!s) continue;
    const labeled = (names: string) =>
      s.match(new RegExp(`^(?:${names})\\s*[：:]\\s*(.+)$`))?.[1]?.trim();
    const salary = labeled("薪资|薪酬|薪资待遇|工资|salary");
    if (salary && !/竞争力|competitive/i.test(salary))
      p.job_facts.salary = salary;
    const url = labeled("岗位URL|岗位链接|职位链接|job_url");
    if (url) {
      p.job_facts.job_url = safeJobUrl(url);
      if (!p.job_facts.job_url)
        notes.push("岗位链接无效或包含敏感参数，未保存链接。");
    }
    const employment = labeled("用工类型|工作性质|employment_type");
    if (employment)
      p.job_facts.employment_type =
        (
          {
            全职: "full_time",
            兼职: "part_time",
            实习: "internship",
            合同制: "contract",
          } as const
        )[employment as "全职"] ||
        (["full_time", "part_time", "internship", "contract", "other"].includes(
          employment,
        )
          ? (employment as JobProfile["job_facts"]["employment_type"])
          : null);
    const enterprise = labeled("企业性质|企业类型|enterprise_type");
    if (enterprise)
      p.job_facts.enterprise_type =
        (
          {
            央企: "central_soe",
            地方国企: "local_soe",
            民营: "private",
            民营企业: "private",
            外资: "foreign",
            外资企业: "foreign",
          } as const
        )[enterprise as "央企"] ||
        (["central_soe", "local_soe", "private", "foreign", "other"].includes(
          enterprise,
        )
          ? (enterprise as JobProfile["job_facts"]["enterprise_type"])
          : null);
    if (section === "ignore") continue;
    if (section === "duty") {
      if (
        /(?:负责|参与|开展|完成|协助|配合|制定|维护|推动|管理|分析|设计|开发|建立|提供|组织|执行|沟通|研究|撰写|掌握|了解)/.test(
          s,
        )
      )
        p.responsibilities.primary.push({
          criterion_id: `resp_${String(++dutyIndex).padStart(2, "0")}`,
          action: s,
          deliverable: null,
        });
      continue;
    }
    const isRequirement =
      section === "requirement" ||
      section === "bonus" ||
      /^(硬性条件|学历|教育要求|技能|经验|专业|资格|证书|必须|须|要求|熟悉|熟练|掌握|具备|本科|硕士|博士)/.test(
        s,
      );
    if (!isRequirement) continue;
    const bonus = section === "bonus" || /优先|加分/.test(s);
    const ambiguous =
      /可放宽|放宽至|或者|同等|相当|入职后|非必须|非必需|不要求|不限|至少.{0,6}(?:两|2|二)|任选/.test(
        s,
      ) || /(?:本科|硕士|博士).{0,20}或/.test(s);
    const education = s.match(
      /(博士|硕士|研究生|本科|大专|专科|高中|中专)(?:及以上|以上)?(?:学历|毕业)?/,
    );
    if (education) {
      const educationClause = s
        .slice(education.index || 0)
        .split(/[，,；;]/)[0];
      const onlyPreferred = /优先|加分/.test(educationClause);
      if (!ambiguous && !onlyPreferred && section !== "bonus")
        p.hard_gate.education_min =
          education[1] === "研究生" ? "硕士" : education[1];
      if (ambiguous || bonus || onlyPreferred) {
        add("other_qualifications", s);
        notes.push("学历存在优先或组合条件，请按完整原句核实。");
      }
    }
    const certNames = [
      ...new Set(
        s.match(
          /CET[- ]?[46]|TEM[- ]?[48]|英语[四六]级|[四六]级|雅思|托福|IELTS|TOEFL|PMP|CPA|教师资格证|法律职业资格证|注册会计师|驾驶证|普通话[^，。；;]{0,8}(?:证书|证)/gi,
        ) || [],
      ),
    ];
    if (certNames.length) {
      if (bonus) add("preferred_certifications", s);
      else if (
        ambiguous ||
        (/(?:或|任一)/.test(s) && /(?:且|和|及)/.test(s)) ||
        /\d+(?:分|年)|有效期|客户|协助.{0,6}(?:考|申请)|公司持有/.test(s)
      ) {
        add("other_qualifications", s);
        notes.push("证书存在条件或范围限制，未简化为硬门槛。");
      } else if (/持有|具备|通过|取得|须|必须|要求|证书|资格证/.test(s))
        p.hard_gate.required_certifications.push({
          names: certNames,
          operator: /或|任一/.test(s) ? "any_of" : "all_of",
        });
      else {
        add("other_qualifications", s);
        notes.push("证书约束强度不明确，请核实。");
      }
    }
    if (/专业|学科/.test(s)) add("major_background", s);
    if (/经验|经历|年限|\d+年/.test(s)) add("experience_background", s);
    if (
      /技能|工具|熟悉|熟练|掌握/.test(s) ||
      catalog.skills.some((k) => s.toLowerCase().includes(k.toLowerCase()))
    )
      add("skills_tools", s);
    if (
      !education &&
      !certNames.length &&
      !/专业|学科|经验|经历|年限|技能|工具|熟悉|熟练|掌握/.test(s)
    )
      add("other_qualifications", s);
  }
  p.role_context.role_summary =
    p.responsibilities.primary
      .slice(0, 2)
      .map((d) => d.action)
      .join("；") || null;
  return { profile: p, notes: [...new Set(notes)] };
}
export function structuredJD(jd: JD): JD {
  const { profile, notes } = structureJD(jd);
  return { ...jd, structured: profile, reviewNotes: notes };
}

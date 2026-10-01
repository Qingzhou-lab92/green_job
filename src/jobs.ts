import { type JD, type Profile, uid } from "./model";
import { analyzeJD } from "./logic";
import Papa from "papaparse";
import { validateJobProfile } from "./jd-schema";

const labels = {
  title: [
    "招聘岗位",
    "招聘职位",
    "岗位名称",
    "职位名称",
    "职位标题",
    "目标岗位",
    "岗位",
    "职位",
    "title",
    "role",
    "position",
    "jobtitle",
  ],
  company: [
    "公司名称",
    "企业名称",
    "用人单位",
    "招聘单位",
    "公司",
    "企业",
    "company",
    "employer",
  ],
  city: [
    "工作地点",
    "工作地址",
    "工作城市",
    "所在城市",
    "办公地点",
    "地点",
    "城市",
    "地区",
    "city",
    "location",
  ],
} as const;
const clean = (text: string) =>
  text
    .replace(/\*\*|__/g, "")
    .replace(/^\s*(?:#{1,6}|[-•·])\s*/, "")
    .replace(/【([^】]+)】|\[([^\]]+)\]/g, "$1$2：")
    .trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function extractJDFields(raw: string) {
  const fields: Partial<Pick<JD, "title" | "company" | "city">> = {};
  const inferred: string[] = [];
  const all = Object.values(labels).flat().join("|");
  const normalized = raw
    .replace(/\r\n?/g, "\n")
    .replace(/\*\*|__/g, "")
    .replace(/[|｜；;]/g, "\n")
    .replace(new RegExp(`([^\\n])\\s+(?=(?:${all})\\s*[：:=])`, "gi"), "$1\n");
  const lines = normalized.split("\n").map(clean).filter(Boolean);
  for (const key of ["title", "company", "city"] as const) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const names = labels[key].map(escape).join("|");
      const match = line.match(
        new RegExp(`^(?:${names})(?:\\s*[：:=]\\s*|\\s+)(.*)$`, "i"),
      );
      if (match?.[1]?.trim()) {
        fields[key] = match[1].trim();
        break;
      }
      if (new RegExp(`^(?:${names})\\s*[：:=]?$`, "i").test(line)) {
        const next = lines[i + 1];
        if (
          next &&
          !new RegExp(
            `^(?:${all}|岗位职责|任职要求|薪资|福利)(?:\\s|[：:=]|$)`,
            "i",
          ).test(next)
        ) {
          fields[key] = next;
          break;
        }
      }
    }
  }
  if (!fields.title) {
    const first = lines[0];
    if (
      first &&
      first.length <= 45 &&
      !/[：:=]/.test(first) &&
      /(?:工程师|分析师|设计师|经理|专员|运营|顾问|开发|实习生|产品助理|researcher|engineer|designer|analyst|manager)$/i.test(
        first,
      )
    ) {
      fields.title = first;
      inferred.push("岗位名称根据首行推测，请核对");
    }
  }
  const missing = (["title", "company", "city"] as const)
    .filter((k) => !fields[k])
    .map((k) => ({ title: "岗位名称", company: "公司", city: "地点" })[k]);
  return { fields, missing, inferred };
}
export type JobSheet = { name: string; rows: unknown[][] };
const headers = {
  ...labels,
  raw: [
    "jd原文",
    "jd",
    "岗位描述",
    "职位描述",
    "职位详情",
    "岗位详情",
    "description",
    "raw",
  ],
  duties: ["岗位职责", "工作职责", "职责", "工作内容", "responsibilities"],
  requirements: [
    "任职要求",
    "岗位要求",
    "职位要求",
    "招聘要求",
    "要求",
    "requirements",
  ],
  skills: ["技能", "技能要求", "核心技能", "skills"],
  hard: ["硬性条件", "学历要求", "学历", "hard"],
  bonus: ["加分项", "优先条件", "bonus"],
};
const headerKey = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_：:]/g, "");
const valueText = (value: unknown) =>
  value instanceof Date
    ? value.toISOString().slice(0, 10)
    : String(value ?? "").trim();
export function parseJobRows(rows: unknown[][], source: string) {
  const headerIndex = rows.findIndex((row) => row.some((c) => valueText(c)));
  if (headerIndex < 0) throw new Error("表格为空，请先填写岗位数据。");
  const header = rows[headerIndex].map(headerKey);
  const categoryColumn = header.findIndex((h) =>
    ["matchcategory", "databasematchcategory", "原库分类"].includes(h),
  );
  const databaseCategory = (row: unknown[]) => {
    const category =
      categoryColumn >= 0 ? valueText(row[categoryColumn]).toLowerCase() : "";
    return category === "direct" || category === "general"
      ? category
      : undefined;
  };
  const profileColumn = header.indexOf("jobprofilejson");
  if (profileColumn >= 0) {
    const jobs: JD[] = [],
      errors: string[] = [];
    if (rows.length > 1001) throw new Error("每次最多导入 1000 行岗位。");
    rows.slice(headerIndex + 1).forEach((row, i) => {
      if (!row.some((c) => valueText(c))) return;
      try {
        const parsed = JSON.parse(valueText(row[profileColumn]));
        const idColumn = header.indexOf("jobid");
        const p = validateJobProfile(
          parsed,
          idColumn >= 0 ? valueText(row[idColumn]) : parsed.job_id,
        );
        const rawColumn = header.indexOf("原始jd");
        jobs.push({
          id: p.job_id,
          title: p.job_facts.job_title || "",
          company: p.job_facts.company || "",
          city: p.job_facts.location.join("、"),
          structured: p,
          database_match_category: databaseCategory(row),
          raw:
            rawColumn >= 0
              ? valueText(row[rawColumn])
              : JSON.stringify(p, null, 2),
          source,
          createdAt: new Date().toISOString(),
          reviewNotes: ["导入的结构化数据，请核对原始出处与招聘状态。"],
        });
      } catch (e) {
        errors.push(
          `第 ${headerIndex + i + 2} 行：结构化 JSON 无效，${e instanceof Error ? e.message : "无法读取"}`,
        );
      }
    });
    return { jobs, errors };
  }
  const columns = Object.fromEntries(
    Object.entries(headers).map(([key, names]) => [
      key,
      header.findIndex((h) => names.some((n) => headerKey(n) === h)),
    ]),
  ) as Record<keyof typeof headers, number>;
  if (columns.title < 0)
    throw new Error(
      "缺少岗位名称列。支持“岗位名称 / 职位 / title / role”等表头，请下载模板参考。",
    );
  if (
    ["raw", "duties", "requirements", "skills"].every(
      (k) => columns[k as keyof typeof columns] < 0,
    )
  )
    throw new Error(
      "至少需要“JD 原文、岗位职责、任职要求、技能”中的一列，才能计算有依据的匹配分。",
    );
  const data = rows.slice(headerIndex + 1);
  if (data.length > 1000)
    throw new Error("每次最多导入 1000 行岗位，请拆分工作表。");
  const jobs: JD[] = [];
  const errors: string[] = [];
  data.forEach((row, index) => {
    if (!row.some((c) => valueText(c))) return;
    const get = (k: keyof typeof columns) =>
      columns[k] >= 0 ? valueText(row[columns[k]]) : "";
    const title = get("title"),
      company = get("company"),
      city = get("city");
    const body = [
      get("raw"),
      ...(["duties", "requirements", "skills", "hard", "bonus"] as const).map(
        (k) =>
          get(k)
            ? `${{ duties: "岗位职责", requirements: "任职要求", skills: "技能要求", hard: "硬性条件", bonus: "加分项" }[k]}：${get(k)}`
            : "",
      ),
    ]
      .filter(Boolean)
      .join("\n");
    if (!title || !body) {
      errors.push(
        `第 ${headerIndex + index + 2} 行：${!title ? "缺少岗位名称" : "缺少岗位描述或要求"}`,
      );
      return;
    }
    if ([title, company, city, body].some((x) => x.length > 150000)) {
      errors.push(`第 ${headerIndex + index + 2} 行：文本过长`);
      return;
    }
    jobs.push({
      id: uid(),
      database_match_category: databaseCategory(row),
      title,
      company,
      city,
      raw: [
        `岗位：${title}`,
        company && `公司：${company}`,
        city && `地点：${city}`,
        body,
      ]
        .filter(Boolean)
        .join("\n"),
      source,
      createdAt: new Date().toISOString(),
    });
  });
  if (!jobs.length && !errors.length)
    throw new Error("工作表只有表头，没有可导入的岗位。");
  return { jobs, errors };
}
export async function readJobFile(file: File): Promise<JobSheet[]> {
  if (file.size > 10_000_000) throw new Error("文件不能超过 10 MB。");
  if (/\.csv$/i.test(file.name)) {
    const parsed = Papa.parse<string[]>(await file.text(), {
      skipEmptyLines: true,
    });
    if (parsed.errors.length)
      throw new Error("CSV 格式错误：" + parsed.errors[0].message);
    return [{ name: "CSV", rows: parsed.data }];
  }
  if (!/\.xlsx$/i.test(file.name))
    throw new Error("请使用 .xlsx 或 UTF-8 CSV；旧版 .xls 请先另存为 .xlsx。");
  const { default: readXlsxFile } = await import("read-excel-file/universal");
  const sheets = await readXlsxFile(await file.arrayBuffer());
  if (sheets.length > 20)
    throw new Error("工作簿超过 20 张工作表，请拆分后导入。");
  return sheets.map((sheet) => ({ name: sheet.sheet, rows: sheet.data }));
}
export function jobKey(jd: JD) {
  return [jd.company, jd.title, jd.city, jd.raw]
    .map((x) => x.trim().replace(/\s+/g, " ").toLowerCase())
    .join("\u0000");
}
export function uniqueJobs(existing: JD[], incoming: JD[]) {
  const seen = new Set(existing.map(jobKey));
  const ids = new Set(existing.map((j) => j.id));
  return incoming.filter((j) => {
    const key = jobKey(j);
    if (seen.has(key) || ids.has(j.id)) return false;
    ids.add(j.id);
    seen.add(key);
    return true;
  });
}
export function rankJobs(jobs: JD[], profile: Profile) {
  return jobs
    .map((jd) => ({ jd, analysis: analyzeJD(jd, profile) }))
    .sort(
      (a, b) =>
        b.analysis.score - a.analysis.score ||
        b.analysis.matches.filter((m) => m.status === "命中").length -
          a.analysis.matches.filter((m) => m.status === "命中").length ||
        a.jd.title.localeCompare(b.jd.title, "zh-CN"),
    );
}
export const jobCsvTemplate =
  "\uFEFF岗位名称,公司,地点,岗位职责,任职要求,技能,硬性条件,加分项\n数据分析师,示例公司,上海,分析业务数据并制作报告,熟悉 SQL 和 Python,SQL、Python,本科,\n";

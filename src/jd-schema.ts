import { z } from "zod";
const value = z.string().max(200000).nullable();
const list = z.array(z.string().max(200000)).max(1000);
const duty = z.object({
  criterion_id: z.string(),
  action: z.string(),
  deliverable: value,
});
export const jobProfileSchema = z
  .object({
    job_id: z.string().min(1).max(200),
    job_facts: z.object({
      job_title: value,
      company: value,
      location: list,
      salary: value,
      job_url: value,
      employment_type: z
        .enum(["full_time", "part_time", "internship", "contract", "other"])
        .nullable(),
      enterprise_type: z
        .enum(["central_soe", "local_soe", "private", "foreign", "other"])
        .nullable(),
    }),
    hard_gate: z.object({
      education_min: value,
      required_certifications: z
        .array(
          z.object({ names: list, operator: z.enum(["any_of", "all_of"]) }),
        )
        .max(100),
    }),
    responsibilities: z.object({
      primary: z.array(duty).max(1000),
      secondary: z.array(duty).max(1000),
    }),
    employer_preferred: z.object({
      major_background: list,
      skills_tools: list,
      experience_background: list,
      preferred_certifications: list,
      other_qualifications: list,
    }),
    role_context: z.object({
      job_function: value,
      domain: list,
      seniority: z
        .enum(["intern", "entry_level", "mid_level", "senior", "manager"])
        .nullable(),
      role_summary: value,
    }),
  })
  .strict();
export type JobProfile = z.infer<typeof jobProfileSchema>;
export const flatLabels = {
  job_id: "岗位 ID",
  job_title: "岗位名称",
  company: "公司",
  location: "地点",
  salary: "薪资",
  job_url: "岗位链接",
  employment_type: "用工类型",
  enterprise_type: "企业性质",
  education_min: "最低学历",
} as const;
export function flattenJob(p: JobProfile) {
  return {
    job_id: p.job_id,
    ...p.job_facts,
    education_min: p.hard_gate.education_min,
  };
}
export function safeJobUrl(value: string | null) {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (!["https:", "http:"].includes(u.protocol) || u.username || u.password)
      return null;
    if (
      [...u.searchParams.keys()].some((k) =>
        /token|session|secret|auth|key|password/i.test(k),
      )
    )
      return null;
    return value;
  } catch {
    return null;
  }
}
export function validateJobProfile(input: unknown, id: string) {
  const p = jobProfileSchema.parse(input);
  if (p.job_id !== id) throw new Error("岗位 ID 必须与当前记录一致。");
  if (p.job_facts.job_url && !safeJobUrl(p.job_facts.job_url))
    throw new Error("岗位链接必须是无凭证、无会话密钥的 HTTP(S) 链接。");
  const duties = [
    ...p.responsibilities.primary,
    ...p.responsibilities.secondary,
  ];
  if (new Set(duties.map((d) => d.criterion_id)).size !== duties.length)
    throw new Error("职责 ID 不得重复。");
  return p;
}

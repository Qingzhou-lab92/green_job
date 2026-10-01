// Explicit, opt-in simulations. Never called as a fallback after a live API failure.
import { type JD, uid } from "./model";
import { structureJD } from "./jd-structure";
import { extractJDFields } from "./jobs";
import {
  CandidateProfileSchema,
  type ConfirmedCandidate,
  type JobSnapshot,
  type JobMatchResult,
  type MatchCriterion,
  type ResumeAdvice,
} from "./workflow-model";
import { criteriaFor } from "./workflow";
export function demoCandidate(resume: string, supplement: string) {
  const source = resume || supplement;
  return CandidateProfileSchema.parse({
    basic: {},
    preferences: { preferred_conditions: {}, excluded_conditions: {} },
    education: [],
    coursework: [],
    experiences: [],
    skills: [],
    certifications: [],
    projects: [
      {
        id: "demo-project",
        fact_type: "projects",
        content: source,
        skills_involved: [],
        user_actions: [],
        metrics: null,
        evidence: source,
        source: { raw_text: source },
        source_tag: resume ? "resume" : "user_supplement",
        confirmed: null,
      },
    ],
    inferred_transferable_skills: [],
    unknown: [
      "演示数据 / 模拟结果：此画像将全文作为一条样例事实，请配置 AI 后进行真实拆解。",
    ],
    fact_evidence: {},
  });
}
export function demoSnapshot(jd: JD): JobSnapshot {
  const p = structureJD({ ...jd, ...extractJDFields(jd.raw).fields }).profile;
  const evidence = jd.raw;
  return {
    structured_job: {
      ...p,
      responsibilities: {
        primary: p.responsibilities.primary.map((x) => ({ ...x, evidence })),
        secondary: p.responsibilities.secondary.map((x) => ({
          ...x,
          evidence,
        })),
      },
    },
    jd_display_analysis: {
      keywords: [{ keyword: p.job_facts.job_title || "演示岗位", evidence }],
      key_requirements: [],
    },
    hard_constraints: [],
    job_snapshot_id: uid(),
    created_at: new Date().toISOString(),
    raw_jd: jd.raw,
    mode: "demo",
    database_match_category: null,
  };
}
export function demoMatch(
  c: ConfirmedCandidate,
  j: JobSnapshot,
): JobMatchResult {
  const criteria = criteriaFor(j, c),
    fact = c.profile.projects[0];
  const point = (p: {
    criterion_id: string;
    requirement: string;
  }): MatchCriterion => ({
    ...p,
    evidence_type: fact ? "direct" : "none",
    candidate_evidence: fact
      ? [{ fact_id: fact.id, quote: fact.evidence }]
      : [],
    reasoning: "演示数据 / 模拟结果：固定展示证据映射，不代表实际匹配。",
    dimension_status: "assessable",
  });
  return {
    job_id: j.structured_job.job_id,
    match_category: "direct",
    category_reason: "演示数据 / 模拟结果：固定归入 direct，仅展示流程。",
    R_analysis: {
      primary: criteria.primary.map(point),
      secondary: criteria.secondary.map(point),
    },
    P_analysis: criteria.P.map(point),
    U_analysis: criteria.U.map((p) => ({
      ...p,
      evidence_type: "none",
      candidate_evidence: [],
      reasoning: "演示未评估偏好",
      dimension_status: "assessable",
    })),
    evidence_analysis:
      fact && [...criteria.primary, ...criteria.secondary, ...criteria.P].length
        ? [
            {
              fact_id: fact.id,
              action: fact.evidence,
              method: null,
              result: null,
            },
          ]
        : [],
    major_gaps: [],
    minor_gaps: [],
    conditional_items: [],
    data_risks: ["模拟结果不可用于真实求职决策"],
  };
}
export function demoAdvice(c: ConfirmedCandidate, jobId: string): ResumeAdvice {
  const fact = c.profile.projects[0];
  return {
    job_id: jobId,
    changes: fact
      ? [
          {
            change_id: uid(),
            action: "keep",
            source_section: "原文",
            original_text: c.resume_text,
            suggested_text: c.resume_text,
            rationale: "演示数据 / 模拟结果：保留原文示范接受流程。",
            job_evidence: "",
            candidate_evidence: [{ fact_id: fact.id, quote: fact.evidence }],
            fact_source: [fact.id],
          },
        ]
      : [],
    questions: ["配置 AI 服务后生成真实定向建议"],
    improvement_plan: [],
  };
}

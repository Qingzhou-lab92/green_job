// Synthetic contract fixtures, used by automated tests only.
import { emptyState, type State } from "./model";
import {
  emptyWorkflow,
  type CandidateProfile,
  type ConfirmedCandidate,
  type JobSnapshot,
  type JobMatchResult,
  type MatchReport,
  type ResumeAdvice,
} from "./workflow-model";
import { criteriaFor, calculateScores, top3 } from "./workflow";
export const fixtureResume =
  "王宁\n本科 统计学\n分析用户访谈。使用 SQL 整理数据。完成分析报告。\n技能 SQL\n证书 PMP\n偏好杭州";
export const fixtureRawJD =
  "岗位：数据分析师\n公司：测试公司\n地点：杭州\n薪资：15-20k\n职责：分析用户反馈；提交分析报告。\n要求：使用 SQL。\n必要学历：本科。";
export function fixtureProfile(): CandidateProfile {
  const fact = (
    id: string,
    fact_type: "education" | "projects" | "certifications",
    content: string,
  ) => ({
    id,
    fact_type,
    content,
    skills_involved: [],
    user_actions: [],
    metrics: null,
    evidence: content,
    source: { raw_text: content },
    source_tag: "resume" as const,
    confirmed: true,
  });
  return {
    basic: { name: "王宁" },
    preferences: {
      preferred_conditions: { city: ["杭州"] },
      excluded_conditions: {},
    },
    education: [fact("e1", "education", "本科 统计学")],
    coursework: [],
    experiences: [],
    skills: [],
    certifications: [fact("c1", "certifications", "证书 PMP")],
    projects: [
      fact("p1", "projects", "分析用户访谈。使用 SQL 整理数据。完成分析报告。"),
    ],
    inferred_transferable_skills: [],
    unknown: [],
    fact_evidence: { name: "王宁", "preference:city": "偏好杭州" },
  };
}
export function fixtureCandidate(): ConfirmedCandidate {
  return {
    profile_version: "pv1",
    confirmed_at: "2026-09-30",
    profile: fixtureProfile(),
    resume_text: fixtureResume,
    user_supplement: "",
    mode: "live",
  };
}
export function fixtureJob(id = "j1"): JobSnapshot {
  return {
    job_snapshot_id: "snapshot-" + id,
    raw_jd: fixtureRawJD,
    created_at: "2026-09-30",
    mode: "live",
    database_match_category: null,
    structured_job: {
      job_id: id,
      job_facts: {
        job_title: "数据分析师",
        company: "测试公司",
        location: ["杭州"],
        salary: "15-20k",
        job_url: null,
        employment_type: null,
        enterprise_type: null,
      },
      hard_gate: { education_min: "本科", required_certifications: [] },
      responsibilities: {
        primary: [
          {
            criterion_id: "resp_01",
            action: "分析用户反馈",
            deliverable: null,
            evidence: "分析用户反馈",
          },
        ],
        secondary: [
          {
            criterion_id: "resp_02",
            action: "提交分析报告",
            deliverable: "分析报告",
            evidence: "提交分析报告",
          },
        ],
      },
      employer_preferred: {
        major_background: [],
        skills_tools: ["使用 SQL"],
        experience_background: [],
        preferred_certifications: [],
        other_qualifications: [],
      },
      role_context: {
        job_function: "数据分析",
        domain: [],
        seniority: null,
        role_summary: "分析用户反馈，提交分析报告",
      },
    },
    jd_display_analysis: {
      keywords: [{ keyword: "SQL", evidence: "使用 SQL" }],
      key_requirements: [],
    },
    hard_constraints: [
      {
        id: "h1",
        requirement: "本科",
        evidence: "必要学历：本科",
        strength: "required",
        operator: "all_of",
        minimum: null,
        relaxable: false,
        atoms: [{ field: "education", value: "本科" }],
      },
    ],
  };
}
export function fixtureMatch(
  job = fixtureJob(),
  candidate = fixtureCandidate(),
): JobMatchResult {
  const criteria = criteriaFor(job, candidate);
  const point = (
    p: { criterion_id: string; requirement: string },
    evidence_type: "direct" | "strong_transfer" | "weak_transfer",
  ) => ({
    ...p,
    evidence_type,
    candidate_evidence: [{ fact_id: "p1", quote: "使用 SQL 整理数据" }],
    reasoning: "测试合成证据映射",
    dimension_status: "assessable" as const,
  });
  return {
    job_id: job.structured_job.job_id,
    match_category: "direct",
    category_reason: "统计学教育与数据分析方向直接相关",
    R_analysis: {
      primary: criteria.primary.map((p) => point(p, "direct")),
      secondary: criteria.secondary.map((p) => point(p, "strong_transfer")),
    },
    P_analysis: criteria.P.map((p) => point(p, "weak_transfer")),
    U_analysis: criteria.U.map((p) => ({
      ...p,
      evidence_type: "direct",
      candidate_evidence: [{ fact_id: "preference:city", quote: "杭州" }],
      reasoning: "地点匹配",
      dimension_status: "assessable",
    })),
    evidence_analysis: [
      {
        fact_id: "p1",
        action: "分析用户访谈",
        method: "使用 SQL 整理数据",
        result: "完成分析报告",
      },
    ],
    major_gaps: [],
    minor_gaps: [],
    conditional_items: [],
    data_risks: [],
  };
}
export function fixtureState(): State {
  const state = emptyState(),
    job = fixtureJob();
  state.profile.original = fixtureResume;
  state.workflow = {
    ...emptyWorkflow(),
    confirmed_candidate_profile: fixtureCandidate(),
  };
  state.jds = [
    {
      id: "j1",
      title: "数据分析师",
      company: "测试公司",
      city: "杭州",
      raw: fixtureRawJD,
      createdAt: "2026-09-30",
      v2: job,
    },
  ];
  return state;
}
export function fixtureReport(): MatchReport {
  const job = fixtureJob(),
    result = calculateScores(fixtureMatch(), job, fixtureCandidate());
  return {
    report_id: "report1",
    profile_version: "pv1",
    scoring_config_version: "v2",
    created_at: "2026-09-30",
    status: "current",
    mode: "live",
    job_snapshots: [job],
    results: [result],
    excluded_jobs: [],
    direct_top3: top3([result], "direct"),
    general_top3: [],
  };
}
export function fixtureAdvice(): ResumeAdvice {
  return {
    job_id: "j1",
    changes: [
      {
        change_id: "change1",
        action: "rewrite",
        source_section: "项目",
        original_text: "分析用户访谈。使用 SQL 整理数据。完成分析报告。",
        suggested_text: "使用 SQL 整理数据，分析用户访谈，完成分析报告。",
        rationale: "按行动方法结果表达",
        job_evidence: "分析用户反馈",
        candidate_evidence: [
          { fact_id: "p1", quote: "使用 SQL 整理数据。完成分析报告。" },
        ],
        fact_source: ["p1"],
      },
    ],
    questions: [],
    improvement_plan: [],
  };
}

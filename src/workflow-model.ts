import { z } from "zod";
import { jobProfileSchema } from "./jd-schema";

const text = z.string().max(200000);
const id = z.string().min(1).max(200);
const nonempty = text.refine((x) => !!x.trim(), "必需文本为空");
const strings = z.array(text).max(1000);
export const factTypes = [
  "education",
  "coursework",
  "experiences",
  "skills",
  "certifications",
  "projects",
] as const;
export const preferenceKeys = [
  "city",
  "job_function",
  "industry",
  "enterprise_type",
  "employment_type",
  "other",
] as const;
export const FactSchema = z
  .object({
    id,
    fact_type: z.enum(factTypes),
    content: nonempty,
    skills_involved: strings,
    user_actions: strings,
    metrics: text.nullable(),
    evidence: nonempty,
    source: z.object({
      file: text.optional(),
      page: z.number().int().positive().nullable().optional(),
      paragraph: text.nullable().optional(),
      raw_text: nonempty,
    }),
    source_tag: z.enum(["resume", "user_supplement"]),
    confirmed: z.boolean().nullable(),
  })
  .strict();
const preferences = z.record(z.enum(preferenceKeys), strings);
export const CandidateProfileSchema = z
  .object({
    basic: z.record(text),
    preferences: z.object({
      preferred_conditions: preferences,
      excluded_conditions: preferences,
    }),
    education: z.array(FactSchema),
    coursework: z.array(FactSchema),
    experiences: z.array(FactSchema),
    skills: z.array(FactSchema),
    certifications: z.array(FactSchema),
    projects: z.array(FactSchema),
    inferred_transferable_skills: z.array(
      z.object({
        id,
        level: text,
        rationale: text,
        evidence: nonempty,
        confidence: z.enum(["low", "medium", "high"]),
        confirmation_status: z.enum(["pending", "confirmed", "rejected"]),
      }),
    ),
    unknown: strings,
    fact_evidence: z.record(text),
  })
  .strict();
export const ConfirmedCandidateSchema = z.object({
  profile_version: id,
  confirmed_at: text,
  profile: CandidateProfileSchema,
  resume_text: text,
  user_supplement: text,
  mode: z.enum(["live", "demo"]),
});
const responsibility = z
  .object({
    criterion_id: id,
    action: nonempty,
    deliverable: text.nullable(),
    evidence: nonempty,
  })
  .strict();
export const JobProfileSchema = jobProfileSchema.extend({
  responsibilities: z.object({
    primary: z.array(responsibility),
    secondary: z.array(responsibility),
  }),
});
export const DisplayAnalysisSchema = z.object({
  keywords: z.array(z.object({ keyword: nonempty, evidence: nonempty })),
  key_requirements: z.array(
    z.object({ criterion_id: id, requirement: nonempty, evidence: nonempty }),
  ),
});
// Constraints stay beside the core Job Profile, preserving its six top-level fields.
export const HardConstraintSchema = z.object({
  id,
  requirement: nonempty,
  evidence: nonempty,
  strength: z.enum(["required", "preferred"]),
  operator: z.enum(["all_of", "any_of", "at_least"]),
  minimum: z.number().int().positive().nullable(),
  relaxable: z.boolean(),
  atoms: z
    .array(
      z.object({
        field: z.enum(["education", "certification", "other"]),
        value: nonempty,
      }),
    )
    .min(1),
});
export const JDExtractionSchema = z
  .object({
    structured_job: JobProfileSchema,
    jd_display_analysis: DisplayAnalysisSchema,
    hard_constraints: z.array(HardConstraintSchema),
  })
  .strict();
export const JobSnapshotSchema = JDExtractionSchema.extend({
  job_snapshot_id: id,
  raw_jd: nonempty,
  created_at: text,
  mode: z.enum(["live", "demo"]),
  database_match_category: z.enum(["direct", "general"]).nullable(),
});
export const CandidateEvidenceSchema = z
  .object({ fact_id: id, quote: nonempty })
  .strict();
export const MatchCriterionSchema = z
  .object({
    criterion_id: id,
    requirement: nonempty,
    evidence_type: z.enum([
      "direct",
      "strong_transfer",
      "weak_transfer",
      "none",
    ]),
    candidate_evidence: z.array(CandidateEvidenceSchema),
    reasoning: text,
    dimension_status: z.enum(["assessable", "not_assessable"]),
  })
  .strict();
export const JobMatchResultSchema = z
  .object({
    job_id: id,
    match_category: z.enum(["direct", "general"]),
    category_reason: nonempty,
    R_analysis: z
      .object({
        primary: z.array(MatchCriterionSchema),
        secondary: z.array(MatchCriterionSchema),
      })
      .strict(),
    P_analysis: z.array(MatchCriterionSchema),
    U_analysis: z.array(MatchCriterionSchema),
    evidence_analysis: z.array(
      z
        .object({
          fact_id: id,
          action: text.nullable(),
          method: text.nullable(),
          result: text.nullable(),
        })
        .strict(),
    ),
    major_gaps: strings,
    minor_gaps: strings,
    conditional_items: strings,
    data_risks: strings,
  })
  .strict();
export const GateResultSchema = z.object({
  eligibility_status: z.enum(["PASS", "CONDITIONAL", "EXCLUDED"]),
  reasons: z.array(
    z.object({
      exclusion_reason: text,
      job_evidence: text,
      candidate_evidence: text,
    }),
  ),
});
const dimension = z.object({
  score: z.number().min(0).max(100),
  dimension_status: z.enum(["assessable", "not_assessable"]),
  assessable: z.number().min(0).max(1),
});
export const ScoredJobSchema = z.object({
  job_id: id,
  job_snapshot_id: id,
  database_match_category: z.enum(["direct", "general"]).nullable(),
  gate: GateResultSchema,
  analysis: JobMatchResultSchema,
  dimensions: z.object({
    R: dimension,
    P: dimension,
    U: dimension,
    E: dimension,
  }),
  total_score: z.number().min(0).max(100),
  assessable_weight: z.number().min(0).max(1),
});
export const MatchReportSchema = z
  .object({
    report_id: id,
    profile_version: id,
    scoring_config_version: z.literal("v2"),
    created_at: text,
    status: z.enum(["current", "stale"]),
    mode: z.enum(["live", "demo"]),
    job_snapshots: z.array(JobSnapshotSchema),
    results: z.array(ScoredJobSchema),
    excluded_jobs: z.array(z.object({ job_id: id, gate: GateResultSchema })),
    direct_top3: z.array(id).max(3),
    general_top3: z.array(id).max(3),
  })
  .superRefine((report, ctx) => {
    const fail = (message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    const snapshots = new Map(
      report.job_snapshots.map((j) => [j.structured_job.job_id, j]),
    );
    const results = new Map(report.results.map((r) => [r.job_id, r]));
    const covered = [
      ...report.results.map((r) => r.job_id),
      ...report.excluded_jobs.map((r) => r.job_id),
    ];
    if (
      snapshots.size !== report.job_snapshots.length ||
      new Set(report.job_snapshots.map((j) => j.job_snapshot_id)).size !==
        snapshots.size ||
      new Set(covered).size !== covered.length ||
      covered.length !== snapshots.size ||
      covered.some((id) => !snapshots.has(id))
    )
      fail("报告岗位缺失或重复");
    for (const r of report.results)
      if (
        r.analysis.job_id !== r.job_id ||
        snapshots.get(r.job_id)?.job_snapshot_id !== r.job_snapshot_id ||
        r.gate.eligibility_status === "EXCLUDED"
      )
        fail("报告结果与岗位快照不一致");
    if (
      report.excluded_jobs.some((r) => r.gate.eligibility_status !== "EXCLUDED")
    )
      fail("排除记录状态无效");
    for (const category of ["direct", "general"] as const) {
      const ids =
        category === "direct" ? report.direct_top3 : report.general_top3;
      if (
        new Set(ids).size !== ids.length ||
        ids.some((id) => {
          const r = results.get(id);
          return (
            !r ||
            r.analysis.match_category !== category ||
            r.total_score <= 60 ||
            r.assessable_weight < 0.6
          );
        })
      )
        fail("Top 3 必须引用本报告符合门槛的唯一岗位");
    }
  });
export const ResumeAdviceSchema = z
  .object({
    job_id: id,
    changes: z.array(
      z
        .object({
          change_id: id,
          action: z.enum([
            "keep",
            "move_earlier",
            "compress",
            "delete",
            "supplement",
            "rewrite",
          ]),
          source_section: text,
          original_text: text,
          suggested_text: text,
          rationale: text,
          job_evidence: text,
          candidate_evidence: z.array(CandidateEvidenceSchema),
          fact_source: strings,
        })
        .strict(),
    ),
    questions: strings,
    improvement_plan: strings,
  })
  .strict();
export const SelectedJobSchema = z.object({
  selected_job_id: id,
  report_id: id,
  profile_version: id,
  job_snapshot_id: id,
  selected_match_result: ScoredJobSchema,
});
export const WorkflowSchema = z.object({
  version: z.literal(2),
  mode: z.enum(["live", "demo"]),
  confirmed_candidate_profile: ConfirmedCandidateSchema.nullable(),
  candidate_draft: z
    .object({
      profile: CandidateProfileSchema,
      resume_text: text,
      user_supplement: text,
    })
    .nullable(),
  reports: z.array(MatchReportSchema).max(1000),
  selected: SelectedJobSchema.nullable(),
  resume_advice_draft: z
    .object({ advice: ResumeAdviceSchema, selection: SelectedJobSchema })
    .nullable(),
});
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
export type ConfirmedCandidate = z.infer<typeof ConfirmedCandidateSchema>;
export type JobSnapshot = z.infer<typeof JobSnapshotSchema>;
export type MatchCriterion = z.infer<typeof MatchCriterionSchema>;
export type JobMatchResult = z.infer<typeof JobMatchResultSchema>;
export type MatchReport = z.infer<typeof MatchReportSchema>;
export type ScoredJob = z.infer<typeof ScoredJobSchema>;
export type GateResult = z.infer<typeof GateResultSchema>;
export type ResumeAdvice = z.infer<typeof ResumeAdviceSchema>;
export type Workflow = z.infer<typeof WorkflowSchema>;
export const emptyWorkflow = (): Workflow => ({
  version: 2,
  mode: "live",
  confirmed_candidate_profile: null,
  candidate_draft: null,
  reports: [],
  selected: null,
  resume_advice_draft: null,
});

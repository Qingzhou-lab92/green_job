import { type State, type JD, uid } from "./model";
import { safeJobUrl } from "./jd-schema";
import {
  CandidateProfileSchema,
  MatchReportSchema,
  ResumeAdviceSchema,
  factTypes,
  preferenceKeys,
  emptyWorkflow,
  type CandidateProfile,
  type ConfirmedCandidate,
  type JobSnapshot,
  type JobMatchResult,
  type MatchCriterion,
  type GateResult,
  type ScoredJob,
  type MatchReport,
  type ResumeAdvice,
} from "./workflow-model";

export const scoringConfig = {
  version: "v2",
  minScore: 60,
  minAssessableWeight: 0.6,
  directLimit: 3,
  generalLimit: 3,
} as const;
export const evidenceCoefficients = {
  direct: 1,
  strong_transfer: 0.8,
  weak_transfer: 0.5,
  none: 0,
} as const;
const normalized = (s: string) => s.replace(/\s+/g, "").toLowerCase();
const contains = (source: string, quote: string) =>
  !!quote.trim() && normalized(source).includes(normalized(quote));
export const candidateFacts = (p: CandidateProfile) =>
  factTypes.flatMap((t) => p[t]);
export const workflowOf = (s: State) => s.workflow ?? emptyWorkflow();
export function validateCandidateSources(
  profile: CandidateProfile,
  resume: string,
  supplement: string,
) {
  const facts = candidateFacts(profile);
  const ids = [
    ...facts.map((f) => f.id),
    ...profile.inferred_transferable_skills.map((f) => f.id),
  ];
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => id.startsWith("preference:"))
  )
    throw new Error("画像事实 ID 重复或使用了保留前缀");
  for (const type of factTypes)
    for (const f of profile[type]) {
      if (f.fact_type !== type) throw new Error("事实类型与分组不一致");
      const source = f.source_tag === "resume" ? resume : supplement;
      if (!contains(source, f.source.raw_text) || !contains(source, f.evidence))
        throw new Error(`画像事实 ${f.id} 引用了材料之外的证据`);
    }
  for (const [key, value] of Object.entries(profile.basic))
    if (
      value &&
      !contains(resume + "\n" + supplement, profile.fact_evidence[key] || "")
    )
      throw new Error(`基本信息 ${key} 缺少可追溯引用`);
  for (const kind of ["preferred_conditions", "excluded_conditions"] as const)
    for (const key of preferenceKeys) {
      if (
        profile.preferences[kind][key]?.length &&
        !contains(
          resume + "\n" + supplement,
          profile.fact_evidence[
            `${kind === "preferred_conditions" ? "preference" : "excluded"}:${key}`
          ] || "",
        )
      )
        throw new Error(`偏好 ${key} 没有明确输入证据`);
    }
  for (const t of profile.inferred_transferable_skills)
    if (!contains(resume + "\n" + supplement, t.evidence))
      throw new Error("可迁移能力缺少原文证据");
  return profile;
}
export function confirmCandidate(
  state: State,
  draft: CandidateProfile,
  resume: string,
  supplement: string,
): State {
  const profile = CandidateProfileSchema.parse(draft);
  if (!resume.trim() && !supplement.trim())
    throw new Error("请提供简历或补充信息");
  validateCandidateSources(profile, resume, supplement);
  for (const f of candidateFacts(profile)) f.confirmed = true;
  const version = uid(),
    now = new Date().toISOString();
  const previous = state.profile.original;
  if (
    previous &&
    previous !== resume &&
    !state.profile.originals.some((o) => o.text === previous)
  )
    state = {
      ...state,
      profile: {
        ...state.profile,
        originals: [
          ...state.profile.originals,
          { id: uid(), createdAt: now, text: previous },
        ],
      },
    };
  return {
    ...state,
    profile: {
      ...state.profile,
      name: profile.basic.name || state.profile.name,
      contact: profile.basic.contact || state.profile.contact,
      education: profile.education.map((f) => f.content).join("\n"),
      experience: [...profile.experiences, ...profile.projects]
        .map((f) => f.content)
        .join("\n"),
      skills: profile.skills.map((f) => f.content),
      original: resume,
      originals:
        state.profile.original === resume
          ? state.profile.originals
          : [
              ...state.profile.originals,
              { id: uid(), createdAt: now, text: resume },
            ],
    },
    workflow: {
      ...workflowOf(state),
      candidate_draft: null,
      confirmed_candidate_profile: {
        profile_version: version,
        confirmed_at: now,
        profile,
        resume_text: resume,
        user_supplement: supplement,
        mode: workflowOf(state).mode,
      },
      reports: workflowOf(state).reports.map((r) => ({
        ...r,
        status: "stale",
      })),
    },
  };
}
export function requireConfirmed(state: State): ConfirmedCandidate {
  const c = state.workflow?.confirmed_candidate_profile;
  if (!c || candidateFacts(c.profile).some((f) => f.confirmed !== true))
    throw new Error("画像未确认：请先在“认识我”确认画像");
  if (c.mode !== workflowOf(state).mode)
    throw new Error("工作区模式变化，请重新确认画像");
  if (c.resume_text !== state.profile.original)
    throw new Error("简历材料已变化：请重新确认画像");
  return c;
}
export function validateSnapshot(snapshot: JobSnapshot, jobId: string) {
  const p = snapshot.structured_job;
  if (p.job_id !== jobId) throw new Error("岗位 ID 不一致");
  if (!p.job_facts.job_title?.trim()) throw new Error("缺少关键字段：岗位名称");
  if (
    p.job_facts.job_url &&
    (!safeJobUrl(p.job_facts.job_url) ||
      !snapshot.raw_jd.includes(p.job_facts.job_url))
  )
    throw new Error("岗位链接无效或不在输入材料中");
  const duties = [
    ...p.responsibilities.primary,
    ...p.responsibilities.secondary,
  ];
  if (new Set(duties.map((d) => d.criterion_id)).size !== duties.length)
    throw new Error("职责 ID 重复");
  const evidence = [
    ...duties,
    ...snapshot.jd_display_analysis.keywords,
    ...snapshot.jd_display_analysis.key_requirements,
    ...snapshot.hard_constraints,
  ];
  for (const item of evidence)
    if (!contains(snapshot.raw_jd, item.evidence))
      throw new Error("JD 证据无法追溯至原文");
  return snapshot;
}
const degreeLevels: Record<string, number> = {
  中专: 1,
  高中: 1,
  专科: 2,
  大专: 2,
  本科: 3,
  学士: 3,
  硕士: 4,
  博士: 5,
};
function degree(text: string) {
  return Object.entries(degreeLevels)
    .filter(([n]) => text.includes(n))
    .reduce((m, [, v]) => Math.max(m, v), 0);
}
type Truth = "pass" | "fail" | "unknown";
export function hardGate(
  candidate: ConfirmedCandidate,
  job: JobSnapshot,
): GateResult {
  if (candidateFacts(candidate.profile).some((f) => f.confirmed !== true))
    throw new Error("未确认画像禁止 Hard Gate");
  const p = candidate.profile,
    facts = candidateFacts(p),
    reasons: GateResult["reasons"] = [];
  let excluded = false,
    conditional = false;
  const education = p.education.filter(
    (f) => !/(?:在读|肄业|未毕业)/.test(f.content),
  );
  const highest = Math.max(0, ...education.map((f) => degree(f.content)));
  const evaluate = (field: string, value: string): Truth => {
    if (field === "education") {
      const minimum = degree(value);
      return !minimum || !highest
        ? "unknown"
        : highest >= minimum
          ? "pass"
          : "fail";
    }
    if (field === "certification")
      return p.certifications.some((f) => contains(f.content, value))
        ? "pass"
        : "unknown";
    return facts.some((f) => normalized(f.content) === normalized(value))
      ? "pass"
      : "unknown";
  };
  const constraints = [...job.hard_constraints];
  {
    const h = job.structured_job.hard_gate;
    if (
      h.education_min &&
      !constraints.some((c) => c.atoms.some((a) => a.field === "education"))
    )
      constraints.push({
        id: "education",
        requirement: h.education_min,
        evidence: h.education_min,
        strength: "required",
        operator: "all_of",
        minimum: null,
        relaxable: false,
        atoms: [{ field: "education", value: h.education_min }],
      });
    h.required_certifications.forEach((group, i) => {
      if (
        !group.names.every((name) =>
          constraints.some((c) =>
            c.atoms.some(
              (a) =>
                a.field === "certification" &&
                normalized(a.value) === normalized(name),
            ),
          ),
        )
      )
        constraints.push({
          id: "certificate" + i,
          requirement: group.names.join(
            group.operator === "any_of" ? " 或 " : " 且 ",
          ),
          evidence: group.names.join("、"),
          strength: "required",
          operator: group.operator,
          minimum: null,
          relaxable: false,
          atoms: group.names.map((value) => ({
            field: "certification",
            value,
          })),
        });
    });
  }
  for (const rule of constraints) {
    if (rule.strength === "preferred") continue;
    const values = rule.atoms.map((a) => evaluate(a.field, a.value));
    const need =
      rule.operator === "all_of"
        ? values.length
        : rule.operator === "any_of"
          ? 1
          : rule.minimum || values.length;
    const yes = values.filter((x) => x === "pass").length,
      unknown = values.filter((x) => x === "unknown").length;
    let result: Truth =
      yes >= need ? "pass" : yes + unknown < need ? "fail" : "unknown";
    if (rule.relaxable || /可放宽|相当水平|同等水平/.test(rule.requirement))
      result = result === "pass" ? "pass" : "unknown";
    if (result === "pass") continue;
    if (result === "fail") excluded = true;
    else conditional = true;
    reasons.push({
      exclusion_reason:
        (result === "fail" ? "必要条件明确不符：" : "条件待确认：") +
        rule.requirement,
      job_evidence: rule.evidence,
      candidate_evidence: rule.atoms.some((a) => a.field === "education")
        ? education.map((f) => f.evidence).join("；") || "未提供证据"
        : "当前材料暂未体现完整证据",
    });
  }
  const f = job.structured_job.job_facts,
    r = job.structured_job.role_context;
  const jobValues: Record<string, string[]> = {
    city: f.location,
    job_function: r.job_function ? [r.job_function] : [],
    industry: r.domain,
    enterprise_type: f.enterprise_type ? [f.enterprise_type] : [],
    employment_type: f.employment_type ? [f.employment_type] : [],
    other: [],
  };
  const aliases: Record<string, string> = {
    央企: "central_soe",
    地方国企: "local_soe",
    民营: "private",
    民营企业: "private",
    私企: "private",
    外资: "foreign",
    外资企业: "foreign",
    全职: "full_time",
    兼职: "part_time",
    实习: "internship",
    合同制: "contract",
  };
  for (const key of preferenceKeys)
    for (const value of p.preferences.excluded_conditions[key] || []) {
      const wanted = aliases[value] || value;
      const match = jobValues[key].some(
        (v) =>
          normalized(v) === normalized(wanted) ||
          (key === "city" && normalized(v).startsWith(normalized(wanted))) ||
          (key === "enterprise_type" &&
            value === "国企" &&
            ["central_soe", "local_soe"].includes(v)),
      );
      if (match) excluded = true;
      else if (!jobValues[key].length) conditional = true;
      if (match || !jobValues[key].length)
        reasons.push({
          exclusion_reason: match
            ? `用户排除条件：${value}`
            : `排除条件待确认：${value}`,
          job_evidence: jobValues[key].join("、") || "JD 未提供该信息",
          candidate_evidence: p.fact_evidence["excluded:" + key] || value,
        });
    }
  return {
    eligibility_status: excluded
      ? "EXCLUDED"
      : conditional
        ? "CONDITIONAL"
        : "PASS",
    reasons,
  };
}
export function criteriaFor(job: JobSnapshot, c: ConfirmedCandidate) {
  const p = job.structured_job;
  return {
    primary: p.responsibilities.primary.map((r) => ({
      criterion_id: r.criterion_id,
      requirement: r.action,
    })),
    secondary: p.responsibilities.secondary.map((r) => ({
      criterion_id: r.criterion_id,
      requirement: r.action,
    })),
    P: Object.entries(p.employer_preferred).flatMap(([field, values]) =>
      values.map((requirement, i) => ({
        criterion_id: `P_${field}_${i + 1}`,
        requirement,
      })),
    ),
    U: preferenceKeys
      .filter((k) => c.profile.preferences.preferred_conditions[k]?.length)
      .map((k) => ({
        criterion_id: "U_" + k,
        requirement: c.profile.preferences.preferred_conditions[k]!.join("、"),
      })),
  };
}
export function evidenceIndex(c: ConfirmedCandidate) {
  return new Map<string, string>([
    ...candidateFacts(c.profile)
      .filter((f) => f.confirmed)
      .map(
        (f) =>
          [f.id, [f.content, f.evidence, f.source.raw_text].join("\n")] as [
            string,
            string,
          ],
      ),
    ...c.profile.inferred_transferable_skills
      .filter((f) => f.confirmation_status === "confirmed")
      .map((f) => [f.id, f.evidence] as [string, string]),
    ...preferenceKeys
      .filter((k) => c.profile.preferences.preferred_conditions[k]?.length)
      .map(
        (k) =>
          [
            "preference:" + k,
            c.profile.preferences.preferred_conditions[k]!.join("、"),
          ] as [string, string],
      ),
  ]);
}
export function validateMatch(
  result: JobMatchResult,
  job: JobSnapshot,
  c: ConfirmedCandidate,
) {
  if (result.job_id !== job.structured_job.job_id)
    throw new Error("匹配返回了其他岗位 ID");
  const expected = criteriaFor(job, c),
    index = evidenceIndex(c);
  for (const [points, requirements] of [
    [result.R_analysis.primary, expected.primary],
    [result.R_analysis.secondary, expected.secondary],
    [result.P_analysis, expected.P],
    [result.U_analysis, expected.U],
  ] as const) {
    if (
      points.length !== requirements.length ||
      new Set(points.map((p) => p.criterion_id)).size !== points.length
    )
      throw new Error("评分点缺失或重复");
    for (const p of points) {
      const e = requirements.find((x) => x.criterion_id === p.criterion_id);
      if (!e || e.requirement !== p.requirement)
        throw new Error("评分点 ID 或要求与快照不一致");
      if (p.dimension_status !== "assessable")
        throw new Error("明确要求必须可评估，缺证据计 0");
      if ((p.evidence_type === "none") !== !p.candidate_evidence.length)
        throw new Error("证据类型与证据引用不一致");
      for (const quote of p.candidate_evidence)
        if (!contains(index.get(quote.fact_id) || "", quote.quote))
          throw new Error("匹配引用了不存在、未确认或不一致的候选人证据");
    }
  }
  const relevant = new Set(
    [
      ...result.R_analysis.primary,
      ...result.R_analysis.secondary,
      ...result.P_analysis,
    ].flatMap((p) => p.candidate_evidence.map((e) => e.fact_id)),
  );
  const experienceIds = new Set(
    [...c.profile.experiences, ...c.profile.projects, ...c.profile.coursework]
      .filter((f) => relevant.has(f.id))
      .map((f) => f.id),
  );
  if (
    result.evidence_analysis.length !== experienceIds.size ||
    new Set(result.evidence_analysis.map((e) => e.fact_id)).size !==
      result.evidence_analysis.length
  )
    throw new Error("证据可信度条目缺失或重复");
  for (const e of result.evidence_analysis) {
    if (!experienceIds.has(e.fact_id))
      throw new Error("E 包含未实际支撑岗位的经历");
    const parts = [e.action, e.method, e.result].filter(
      (x): x is string => !!x,
    );
    if (new Set(parts.map(normalized)).size !== parts.length)
      throw new Error("E 的行动、方法、结果不能使用同一句重复计分");
    if (parts.some((q) => !contains(index.get(e.fact_id) || "", q)))
      throw new Error("E 引用了不存在的行动、方法或结果");
  }
  return result;
}
const rounded = (n: number) => Math.round(n * 100) / 100;
const neutral = () => ({
  score: 50,
  dimension_status: "not_assessable" as const,
  assessable: 0,
});
function aggregate(points: MatchCriterion[]) {
  return points.length
    ? {
        score:
          points.reduce(
            (s, p) => s + evidenceCoefficients[p.evidence_type] * 100,
            0,
          ) / points.length,
        dimension_status: "assessable" as const,
        assessable: 1,
      }
    : neutral();
}
export function calculateScores(
  result: JobMatchResult,
  job: JobSnapshot,
  c: ConfirmedCandidate,
  gate = hardGate(c, job),
): ScoredJob {
  validateMatch(result, job, c);
  const primary = aggregate(result.R_analysis.primary),
    secondary = aggregate(result.R_analysis.secondary);
  const R = {
    score: primary.score * 0.8 + secondary.score * 0.2,
    dimension_status:
      primary.assessable || secondary.assessable
        ? ("assessable" as const)
        : ("not_assessable" as const),
    assessable: primary.assessable * 0.8 + secondary.assessable * 0.2,
  };
  const P = aggregate(result.P_analysis);
  const u = preferenceKeys.map((k) =>
    result.U_analysis.find((p) => p.criterion_id === "U_" + k),
  );
  const U = {
    score:
      u.reduce(
        (s, p) => s + (p ? evidenceCoefficients[p.evidence_type] * 100 : 50),
        0,
      ) / u.length,
    dimension_status: result.U_analysis.length
      ? ("assessable" as const)
      : ("not_assessable" as const),
    assessable: result.U_analysis.length / u.length,
  };
  const E = result.evidence_analysis.length
    ? {
        score:
          result.evidence_analysis.reduce(
            (s, e) =>
              s +
              (e.action ? 50 : 0) +
              (e.method ? 25 : 0) +
              (e.result ? 25 : 0),
            0,
          ) / result.evidence_analysis.length,
        dimension_status: "assessable" as const,
        assessable: 1,
      }
    : result.R_analysis.primary.length +
        result.R_analysis.secondary.length +
        result.P_analysis.length
      ? { score: 0, dimension_status: "assessable" as const, assessable: 1 }
      : neutral();
  return {
    job_id: result.job_id,
    job_snapshot_id: job.job_snapshot_id,
    database_match_category: job.database_match_category,
    gate,
    analysis: result,
    dimensions: { R, P, U, E },
    total_score: rounded(
      R.score * 0.4 + P.score * 0.3 + U.score * 0.2 + E.score * 0.1,
    ),
    assessable_weight:
      R.assessable * 0.4 +
      P.assessable * 0.3 +
      U.assessable * 0.2 +
      E.assessable * 0.1,
  };
}
export function top3(results: ScoredJob[], category: "direct" | "general") {
  const unique = new Map<string, ScoredJob>();
  for (const r of results) if (!unique.has(r.job_id)) unique.set(r.job_id, r);
  return [...unique.values()]
    .filter(
      (r) =>
        r.gate.eligibility_status !== "EXCLUDED" &&
        r.analysis.match_category === category &&
        r.total_score > scoringConfig.minScore &&
        r.assessable_weight >= scoringConfig.minAssessableWeight,
    )
    .sort(
      (a, b) =>
        b.total_score - a.total_score ||
        b.assessable_weight - a.assessable_weight ||
        a.job_id.localeCompare(b.job_id),
    )
    .slice(0, 3)
    .map((r) => r.job_id);
}
export function reportIsCurrent(report: MatchReport, state: State) {
  const c = state.workflow?.confirmed_candidate_profile;
  return (
    report.status === "current" &&
    report.scoring_config_version === "v2" &&
    !!c &&
    c.mode === workflowOf(state).mode &&
    report.mode === c.mode &&
    candidateFacts(c.profile).every((f) => f.confirmed === true) &&
    report.profile_version === c.profile_version &&
    c.resume_text === state.profile.original &&
    report.job_snapshots.every((s) => {
      const j = state.jds.find((j) => j.id === s.structured_job.job_id);
      return (
        s.mode === report.mode &&
        j?.v2?.job_snapshot_id === s.job_snapshot_id &&
        j.raw === s.raw_jd &&
        JSON.stringify(j.v2) === JSON.stringify(s)
      );
    })
  );
}
export function reconcileWorkflow(state: State): State {
  if (!state.workflow) return state;
  return {
    ...state,
    workflow: {
      ...state.workflow,
      reports: state.workflow.reports.map((r) =>
        reportIsCurrent(r, state) ? r : { ...r, status: "stale" },
      ),
    },
  };
}
export function selectJob(
  state: State,
  reportId: string,
  jobId: string,
): State {
  const w = workflowOf(state),
    report = w.reports.find((r) => r.report_id === reportId);
  if (!report || !reportIsCurrent(report, state))
    throw new Error("画像版本或 JD 快照不一致，报告已过期；请重新匹配");
  if (![...report.direct_top3, ...report.general_top3].includes(jobId))
    throw new Error("只能选择当前报告 Top 3 中的一个岗位");
  const result = report.results.find((r) => r.job_id === jobId)!;
  return {
    ...state,
    workflow: {
      ...w,
      selected: {
        selected_job_id: jobId,
        report_id: reportId,
        profile_version: report.profile_version,
        job_snapshot_id: result.job_snapshot_id,
        selected_match_result: result,
      },
      resume_advice_draft: null,
    },
  };
}
export function currentSelection(state: State) {
  const w = workflowOf(state),
    selection = w.selected,
    report = w.reports.find((r) => r.report_id === selection?.report_id);
  if (!selection || !report || !reportIsCurrent(report, state))
    throw new Error("请从当前有效报告选择一个岗位；旧报告需重新匹配");
  const result = report.results.find(
      (r) => r.job_id === selection.selected_job_id,
    ),
    job = report.job_snapshots.find(
      (j) => j.job_snapshot_id === selection.job_snapshot_id,
    );
  if (
    !result ||
    !job ||
    JSON.stringify(result) !==
      JSON.stringify(selection.selected_match_result) ||
    selection.profile_version !== report.profile_version ||
    ![...report.direct_top3, ...report.general_top3].includes(
      selection.selected_job_id,
    )
  )
    throw new Error("选岗上下文已失效，请重新选择");
  return { selection, report, job, candidate: requireConfirmed(state) };
}
export function validateAdvice(advice: ResumeAdvice, state: State) {
  ResumeAdviceSchema.parse(advice);
  const { selection, job, candidate } = currentSelection(state),
    index = evidenceIndex(candidate);
  if (advice.job_id !== selection.selected_job_id)
    throw new Error("改写返回了其他岗位，禁止混合 JD");
  if (
    new Set(advice.changes.map((c) => c.change_id)).size !==
    advice.changes.length
  )
    throw new Error("修改项 ID 重复");
  for (const change of advice.changes) {
    if (
      change.original_text &&
      !candidate.resume_text.includes(change.original_text)
    )
      throw new Error("修改项引用的原简历片段不存在");
    if (change.action !== "supplement" && !change.original_text.trim())
      throw new Error("非补充修改必须指向原简历片段");
    if (change.job_evidence && !contains(job.raw_jd, change.job_evidence))
      throw new Error("改写缺少真实 JD 依据");
    for (const q of change.candidate_evidence)
      if (!contains(index.get(q.fact_id) || "", q.quote))
        throw new Error("改写引用了无效候选人证据");
    if (change.action === "delete" && change.suggested_text)
      throw new Error("删除项不应生成替换内容");
    if (change.suggested_text && !change.candidate_evidence.length)
      throw new Error("建议文本缺少已确认事实证据");
    if (
      change.fact_source.some(
        (id) => !change.candidate_evidence.some((e) => e.fact_id === id),
      ) ||
      (change.suggested_text && !change.fact_source.length)
    )
      throw new Error("事实来源未与证据对应");
    const sources =
      change.candidate_evidence
        .map((e) => index.get(e.fact_id) || "")
        .join("\n") + change.original_text;
    const numbers = change.suggested_text.match(/\d+(?:\.\d+)?/g) || [];
    if (numbers.some((n) => !sources.includes(n)))
      throw new Error("建议文本包含证据之外的数字");
    for (const word of ["精通", "熟练", "主导", "独立负责"])
      if (change.suggested_text.includes(word) && !sources.includes(word))
        throw new Error("建议文本可能升级事实：" + word);
  }
  return advice;
}
export function assembleResume(
  original: string,
  advice: ResumeAdvice,
  accepted: string[],
) {
  let text = original;
  const used = new Set<string>();
  for (const c of advice.changes.filter((c) =>
    accepted.includes(c.change_id),
  )) {
    if (c.action === "supplement") {
      text += "\n" + c.suggested_text;
      continue;
    }
    if (used.has(c.original_text) || !text.includes(c.original_text))
      throw new Error("选中的修改片段重叠，请分次接受或手动编辑");
    used.add(c.original_text);
    if (c.action === "move_earlier") {
      text = text.replace(c.original_text, "");
      text = c.suggested_text + "\n" + text;
    } else
      text = text.replace(
        c.original_text,
        c.action === "delete" ? "" : c.suggested_text,
      );
  }
  return text;
}
export function saveResumeVersion(
  state: State,
  content: string,
  title: string,
): State {
  const { selection } = currentSelection(state);
  if (!content.trim() || !title.trim())
    throw new Error("请填写版本名称并接受或编辑建议");
  return {
    ...state,
    versions: [
      ...state.versions,
      {
        id: uid(),
        jdId: selection.selected_job_id,
        title,
        content,
        createdAt: new Date().toISOString(),
        report_id: selection.report_id,
        profile_version: selection.profile_version,
        job_snapshot_id: selection.job_snapshot_id,
      },
    ],
  };
}
export function storeReport(
  state: State,
  report: MatchReport,
  jobs: JD[],
): State {
  MatchReportSchema.parse(report);
  if (requireConfirmed(state).profile_version !== report.profile_version)
    throw new Error("画像版本不一致，请重新匹配");
  const next = {
    ...state,
    jds: state.jds.map((j) => jobs.find((x) => x.id === j.id) || j),
  };
  if (!reportIsCurrent(report, next))
    throw new Error("JD 快照不一致，请重新匹配");
  return {
    ...next,
    workflow: {
      ...workflowOf(state),
      reports: [report, ...workflowOf(state).reports],
      selected: null,
      resume_advice_draft: null,
    },
  };
}

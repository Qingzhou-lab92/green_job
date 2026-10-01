import { useState, useRef } from "react";
import {
  CheckCircle2,
  TriangleAlert,
  Circle,
  Upload,
  Plus,
  Trash2,
} from "lucide-react";
import { Button, Panel, Field, Modal, Tag, Empty, type Props } from "./App";
import { type JD, type State, uid, jdSchema } from "./model";
import {
  CandidateProfileSchema,
  JobSnapshotSchema,
  factTypes,
  preferenceKeys,
  type CandidateProfile,
  type JobSnapshot,
  type MatchReport,
  type ScoredJob,
  type ResumeAdvice,
} from "./workflow-model";
import {
  readConfig,
  parseCandidateProfileWithLLM,
  parseJDWithLLM,
  runMatchingWorkflow,
  rewriteResumeWithLLM,
} from "./ai";
import {
  workflowOf,
  confirmCandidate,
  requireConfirmed,
  storeReport,
  reportIsCurrent,
  selectJob,
  currentSelection,
  validateAdvice,
  assembleResume,
  saveResumeVersion,
  evidenceCoefficients,
  validateSnapshot,
} from "./workflow";
import { demoCandidate, demoSnapshot, demoAdvice } from "./workflow-demo";
import { readResumeDocument } from "./documents";
import { FlatJobFields } from "./FlatJobFields";
import { download } from "./storage";
import { safeJobUrl } from "./jd-schema";
import { readJobFile, parseJobRows, uniqueJobs, type JobSheet } from "./jobs";

function useStep() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [progress, setProgress] = useState("");
  const last = useRef<(() => Promise<void>) | null>(null);
  const run = async (task: () => Promise<void>) => {
    last.current = task;
    setError("");
    setBusy(true);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "步骤失败，请重试");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };
  const status = (
    <>
      {busy && (
        <div className="notice" role="status">
          {progress || "正在处理，请稍候…"}
        </div>
      )}
      {error && (
        <div className="alert error" role="alert">
          <div>
            <strong>当前步骤未完成</strong>
            <p>{error}</p>
            <span>原数据已保留。请检查材料或 AI 配置后重试。</span>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => last.current && void run(last.current)}
            >
              重试当前步骤
            </Button>
          </div>
        </div>
      )}
    </>
  );
  return { busy, error, progress, setProgress, run, status };
}
function allowAI(state: State, step: string, count = 1) {
  if (workflowOf(state).mode === "demo") return true;
  const c = readConfig();
  if (!c.key.trim())
    throw new Error(`${step}：请先在“设置与数据”中配置 AI 服务`);
  return confirm(
    `${step}将把相关简历和 JD 发送到 ${new URL(c.baseUrl).origin}。本次最多 ${count} 次 AI 请求，可能产生费用。继续？`,
  );
}
function ModeNotice({ state }: { state: State }) {
  return workflowOf(state).mode === "demo" ? (
    <div className="notice">
      演示数据 / 模拟结果 · 当前为显式演示工作区，不进行真实 AI
      调用。清空演示数据后可使用自己的材料。
    </div>
  ) : (
    <div className="notice">
      MVP v2 · 仅已确认事实参与匹配；无 API Key 时请先在“设置与数据”中配置 AI
      服务。
    </div>
  );
}
const factNames: Record<(typeof factTypes)[number], string> = {
  education: "教育",
  coursework: "课程",
  experiences: "经历",
  skills: "技能",
  certifications: "证书",
  projects: "项目",
};
const prefNames: Record<(typeof preferenceKeys)[number], string> = {
  city: "城市",
  job_function: "岗位方向",
  industry: "行业",
  enterprise_type: "企业类型",
  employment_type: "工作性质",
  other: "其他偏好",
};

export function CandidatePage({ state, update }: Props) {
  const w = workflowOf(state),
    saved = w.confirmed_candidate_profile;
  const [raw, setRaw] = useState(
      w.candidate_draft?.resume_text ?? state.profile.original,
    ),
    [supplement, setSupplement] = useState(
      w.candidate_draft?.user_supplement ?? saved?.user_supplement ?? "",
    ),
    [draft, setDraft] = useState<CandidateProfile | null>(() =>
      w.candidate_draft?.profile
        ? structuredClone(w.candidate_draft.profile)
        : saved
          ? structuredClone(saved.profile)
          : null,
    ),
    [filename, setFilename] = useState("粘贴的简历"),
    [format, setFormat] = useState("text");
  const step = useStep();
  const [manual, setManual] = useState<string[]>([]);
  const editFact = (
    type: (typeof factTypes)[number],
    id: string,
    content: string,
  ) => {
    if (!draft) return;
    setDraft({
      ...draft,
      [type]: draft[type].map((f) =>
        f.id === id
          ? {
              ...f,
              content,
              evidence: content,
              source: { raw_text: content },
              source_tag: "user_supplement",
              confirmed: null,
            }
          : f,
      ),
    });
    setManual((m) => [...m, content]);
  };
  return (
    <div className="space-y-6">
      <ModeNotice state={state} />
      {step.status}
      <div className="two-col">
        <Panel
          title="基础简历原文"
          action={<Tag>PDF / DOCX / TXT / Markdown</Tag>}
        >
          <textarea
            className="resume-text"
            aria-label="原始简历"
            value={raw}
            disabled={step.busy}
            onChange={(e) => setRaw(e.target.value)}
          />
          <div className="actions wrap">
            <label className="btn secondary">
              <Upload size={15} />
              {step.busy ? "正在处理…" : "导入简历文档"}
              <input
                hidden
                aria-label="导入简历文档"
                type="file"
                accept=".pdf,.docx,.txt,.md,.markdown"
                disabled={step.busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file)
                    void step.run(async () => {
                      const result = await readResumeDocument(file);
                      setRaw(result.text);
                      setFilename(result.filename);
                      setFormat(result.format);
                    });
                }}
              />
            </label>
            <Button
              disabled={step.busy || !raw.trim()}
              onClick={() =>
                void step.run(async () => {
                  await update((s) => {
                    const originals = [...s.profile.originals],
                      now = new Date().toISOString();
                    if (
                      s.profile.original &&
                      s.profile.original !== raw &&
                      !originals.some((o) => o.text === s.profile.original)
                    )
                      originals.push({
                        id: uid(),
                        createdAt: now,
                        text: s.profile.original,
                      });
                    return {
                      ...s,
                      profile: {
                        ...s.profile,
                        original: raw,
                        originals: [
                          ...originals,
                          {
                            id: uid(),
                            createdAt: now,
                            text: raw,
                            filename,
                            format,
                          },
                        ],
                      },
                    };
                  });
                })
              }
            >
              保存原文
            </Button>
          </div>
          <p className="helper">
            文件仅在本地提取文本。扫描 PDF 暂不支持
            OCR；多栏文档请核对顺序。保存原文不等于确认画像。
          </p>
          <details>
            <summary>简历档案库 · {state.profile.originals.length} 份</summary>
            {state.profile.originals.map((o) => (
              <div className="history-row" key={o.id}>
                <span>
                  {o.filename || "原文历史"} ·{" "}
                  {o.format?.toUpperCase() || "TEXT"} ·{" "}
                  {new Date(o.createdAt).toLocaleString()}
                </span>
                <button
                  className="text-btn"
                  onClick={() => {
                    if (
                      raw !== state.profile.original &&
                      !confirm("载入会替换当前未保存文本，继续？")
                    )
                      return;
                    setRaw(o.text);
                  }}
                >
                  载入解析
                </button>
                <button
                  className="text-btn"
                  onClick={() => download("resume-original.txt", o.text)}
                >
                  导出原文
                </button>
              </div>
            ))}
          </details>
        </Panel>
        <Panel title="补充信息与画像确认">
          <Field label="用户补充信息">
            <textarea
              rows={8}
              disabled={step.busy}
              value={supplement}
              onChange={(e) => setSupplement(e.target.value)}
              placeholder="补充课程、项目、个人贡献、求职偏好和明确排除条件。"
            />
          </Field>
          <p className="helper">
            原简历与补充信息分开保留来源。可迁移能力是推断，需要逐条确认；旧版档案不自动视为已确认画像。
          </p>
          {saved && (
            <p>
              当前画像版本：{saved.profile_version.slice(0, 8)} ·{" "}
              {new Date(saved.confirmed_at).toLocaleString()}
            </p>
          )}
          <Button
            disabled={step.busy || !(raw.trim() || supplement.trim())}
            onClick={() =>
              void step.run(async () => {
                if (!allowAI(state, "AI 拆解画像")) return;
                const expected = saved?.profile_version;
                const p =
                  w.mode === "demo"
                    ? demoCandidate(raw, supplement)
                    : await parseCandidateProfileWithLLM({
                        resume_text: raw,
                        user_supplement: supplement,
                        current_profile: saved?.profile,
                      });
                CandidateProfileSchema.parse(p);
                await update((s) => {
                  if (
                    workflowOf(s).confirmed_candidate_profile
                      ?.profile_version !== expected
                  )
                    throw new Error("画像版本变化，请重试");
                  return {
                    ...s,
                    workflow: {
                      ...workflowOf(s),
                      candidate_draft: {
                        profile: p,
                        resume_text: raw,
                        user_supplement: supplement,
                      },
                    },
                  };
                });
                setDraft(p);
                setManual([]);
              })
            }
          >
            AI 拆解画像
          </Button>
        </Panel>
      </div>
      {draft && (
        <>
          <Panel
            title="画像草稿 · 核对后确认"
            action={<Tag>{saved ? "编辑将创建新版本" : "待确认"}</Tag>}
          >
            <div className="form-grid grid-2">
              {["name", "contact"].map((key) => (
                <Field label={key === "name" ? "姓名" : "联系方式"} key={key}>
                  <input
                    value={draft.basic[key] || ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDraft({
                        ...draft,
                        basic: { ...draft.basic, [key]: v },
                        fact_evidence: { ...draft.fact_evidence, [key]: v },
                      });
                      setManual((m) => [...m, v]);
                    }}
                  />
                </Field>
              ))}
            </div>
            <div className="two-col">
              {factTypes.map((type) => (
                <section className="analysis-box" key={type}>
                  <h3>{factNames[type]}</h3>
                  {draft[type].map((f) => (
                    <div className="gap-card" key={f.id}>
                      <textarea
                        aria-label={`${factNames[type]}事实 ${f.id}`}
                        value={f.content}
                        onChange={(e) => editFact(type, f.id, e.target.value)}
                      />
                      <p className="helper">
                        来源：{f.source_tag === "resume" ? "简历" : "用户补充"}{" "}
                        · {f.source.file || "输入文本"}
                      </p>
                      <details>
                        <summary>查看原文证据</summary>
                        <p>{f.evidence}</p>
                        <p>{f.source.raw_text}</p>
                      </details>
                      <Button
                        variant="ghost danger-text"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            [type]: draft[type].filter((x) => x.id !== f.id),
                          })
                        }
                      >
                        <Trash2 size={14} />
                        删除条目
                      </Button>
                    </div>
                  ))}
                  {!draft[type].length && <p>当前材料暂未体现</p>}
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const id = uid();
                      setDraft({
                        ...draft,
                        [type]: [
                          ...draft[type],
                          {
                            id,
                            fact_type: type,
                            content: "",
                            skills_involved: [],
                            user_actions: [],
                            metrics: null,
                            evidence: "",
                            source: { raw_text: "" },
                            source_tag: "user_supplement",
                            confirmed: null,
                          },
                        ],
                      });
                    }}
                  >
                    补充{factNames[type]}
                  </Button>
                </section>
              ))}
            </div>
          </Panel>
          <Panel title="求职偏好与排除条件">
            <div className="two-col">
              {(["preferred_conditions", "excluded_conditions"] as const).map(
                (kind) => (
                  <div className="form-grid" key={kind}>
                    <h3>
                      {kind === "preferred_conditions"
                        ? "明确偏好（参与 U）"
                        : "明确排除（进入 Hard Gate）"}
                    </h3>
                    {preferenceKeys.map((key) => (
                      <Field
                        key={key}
                        label={`${kind === "preferred_conditions" ? "偏好" : "排除"} · ${prefNames[key]}`}
                      >
                        <input
                          placeholder="多项用顿号分隔；未提供则留空"
                          value={(draft.preferences[kind][key] || []).join(
                            "、",
                          )}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft({
                              ...draft,
                              preferences: {
                                ...draft.preferences,
                                [kind]: {
                                  ...draft.preferences[kind],
                                  [key]: v
                                    .split(/[、，,]/)
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                },
                              },
                              fact_evidence: {
                                ...draft.fact_evidence,
                                [`${kind === "preferred_conditions" ? "preference" : "excluded"}:${key}`]:
                                  v,
                              },
                            });
                            setManual((m) => [...m, v]);
                          }}
                        />
                      </Field>
                    ))}
                  </div>
                ),
              )}
            </div>
          </Panel>
          <Panel title="可迁移能力 · 推断与事实分开">
            {draft.inferred_transferable_skills.map((t) => (
              <div className="gap-card" key={t.id}>
                <h3>{t.level}</h3>
                <p>{t.rationale}</p>
                <p>证据：{t.evidence}</p>
                <Tag>
                  {t.confidence} · {t.confirmation_status}
                </Tag>
                <div className="actions">
                  {(["confirmed", "rejected"] as const).map((status) => (
                    <Button
                      key={status}
                      variant="secondary"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          inferred_transferable_skills:
                            draft.inferred_transferable_skills.map((x) =>
                              x.id === t.id
                                ? { ...x, confirmation_status: status }
                                : x,
                            ),
                        })
                      }
                    >
                      {status === "confirmed" ? "确认" : "拒绝"}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {!draft.inferred_transferable_skills.length && (
              <p>暂无推断。仅确认后的条目可参与匹配。</p>
            )}
            <h3>未知信息</h3>
            {draft.unknown.map((s, i) => (
              <p key={i}>{s}</p>
            ))}
            {!draft.unknown.length && (
              <p>未列出未知项，请自行检查材料完整性。</p>
            )}
          </Panel>
          <Button
            disabled={step.busy}
            onClick={() =>
              void step.run(async () => {
                const supplementWithEdits = [
                  supplement,
                  ...manual.filter(Boolean),
                ].join("\n");
                await update((s) =>
                  confirmCandidate(s, draft, raw, supplementWithEdits),
                );
                setSupplement(supplementWithEdits);
                setManual([]);
              })
            }
          >
            确认并保存画像
          </Button>
        </>
      )}
    </div>
  );
}

export function MatchingPoints({ result }: { result: ScoredJob }) {
  const a = result.analysis;
  const groups = [
    { name: "职责 · Primary", points: a.R_analysis.primary, weight: 0.4 * 0.8 },
    {
      name: "职责 · Secondary",
      points: a.R_analysis.secondary,
      weight: 0.4 * 0.2,
    },
    { name: "企业条件", points: a.P_analysis, weight: 0.3 },
    { name: "用户偏好", points: a.U_analysis, weight: 0.2 },
  ];
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.name}>
          <h3>{g.name}</h3>
          {!g.points.length && (
            <p>未提供该维度输入 · 中性分 50，不计为可评估。</p>
          )}
          {g.points.map((p) => (
            <details className="gap-card" key={p.criterion_id}>
              <summary>
                <span className="actions wrap">
                  {p.evidence_type === "direct" ? (
                    <CheckCircle2 size={16} />
                  ) : p.evidence_type === "none" ? (
                    <Circle size={16} />
                  ) : (
                    <TriangleAlert size={16} />
                  )}
                  <Tag tone={p.evidence_type === "none" ? "amber" : "green"}>
                    {p.evidence_type === "direct"
                      ? "强匹配"
                      : p.evidence_type === "none"
                        ? "当前材料暂未体现"
                        : "可迁移"}
                  </Tag>
                  <span>{p.requirement}</span>
                </span>
              </summary>
              <p>岗位要求：{p.requirement}</p>
              {p.candidate_evidence.length ? (
                p.candidate_evidence.map((e, i) => (
                  <p key={i}>
                    候选人证据 [{e.fact_id}]：{e.quote}
                  </p>
                ))
              ) : (
                <p>未提供证据</p>
              )}
              <p>迁移解释 / 评分依据：{p.reasoning}</p>
              <p>
                固定证据系数 {evidenceCoefficients[p.evidence_type]}
                ，同组均权；总分贡献{" "}
                {(
                  (evidenceCoefficients[p.evidence_type] * 100 * g.weight) /
                  (g.name === "用户偏好" ? 6 : g.points.length)
                ).toFixed(2)}{" "}
                分。
              </p>
              {p.evidence_type === "none" && (
                <p>缺口：当前材料暂未体现；可补充真实经历和证明材料。</p>
              )}
            </details>
          ))}
        </section>
      ))}
    </div>
  );
}
function Keywords({ snapshot }: { snapshot: JobSnapshot }) {
  return (
    <div>
      <h3>Keywords · 可追溯关键词</h3>
      <div className="tags">
        {snapshot.jd_display_analysis.keywords.map((k, i) => (
          <details key={i}>
            <summary>
              <Tag>{k.keyword}</Tag>
            </summary>
            <p>{k.evidence}</p>
          </details>
        ))}
      </div>
      {!snapshot.jd_display_analysis.keywords.length && <p>未提取关键词。</p>}
    </div>
  );
}

export function JDWorkflowPage({
  state,
  update,
  go,
  initialId,
}: { go: (n: number) => void; initialId: string } & Props) {
  const [selected, setSelected] = useState(initialId || state.jds[0]?.id || ""),
    [editing, setEditing] = useState<JD | null>(null),
    [preview, setPreview] = useState<JobSnapshot | null>(null);
  const step = useStep(),
    jd = state.jds.find((j) => j.id === selected);
  const report = workflowOf(state).reports.find(
    (r) =>
      reportIsCurrent(r, state) && r.results.some((m) => m.job_id === jd?.id),
  );
  const result = report?.results.find((m) => m.job_id === jd?.id);
  const savePreview = () =>
    void step.run(async () => {
      if (!editing || !preview) return;
      validateSnapshot(preview, editing.id);
      const facts = preview.structured_job.job_facts;
      await update((s) => {
        const existing = s.jds.find((j) => j.id === editing.id);
        if (existing && existing.raw !== preview.raw_jd)
          throw new Error("JD 原文变化，请新建修订稿");
        const next = {
          ...editing,
          title: facts.job_title || "",
          company: facts.company || "",
          city: facts.location.join("、"),
          raw: preview.raw_jd,
          structured: preview.structured_job,
          v2: preview,
        };
        return {
          ...s,
          jds: existing
            ? s.jds.map((j) => (j.id === next.id ? next : j))
            : [...s.jds, next],
        };
      });
      setSelected(editing.id);
      setEditing(null);
      setPreview(null);
    });
  return (
    <div className="space-y-6">
      <ModeNotice state={state} />
      {step.status}
      <div className="toolbar">
        <span>岗位资料库 / {state.jds.length} 份 JD</span>
        <Button
          onClick={() => {
            setEditing({
              id: uid(),
              title: "",
              company: "",
              city: "",
              raw: "",
              createdAt: new Date().toISOString(),
            });
            setPreview(null);
          }}
        >
          <Plus size={16} />
          新增 JD
        </Button>
      </div>
      <div className="master-detail">
        <div className="panel selection-list">
          {state.jds.map((j) => (
            <button
              className={j.id === selected ? "selected" : ""}
              key={j.id}
              onClick={() => setSelected(j.id)}
            >
              <strong>{j.title}</strong>
              <small>
                {j.company} · {j.v2 ? "v2 结构化" : "待 AI 结构化"}
              </small>
            </button>
          ))}
        </div>
        {jd ? (
          <Panel
            title={jd.title || "待结构化 JD"}
            action={
              <div className="actions wrap">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(jd);
                    setPreview(null);
                  }}
                >
                  重新结构化
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing({
                      ...jd,
                      id: uid(),
                      v2: undefined,
                      structured: undefined,
                      createdAt: new Date().toISOString(),
                    });
                    setPreview(null);
                  }}
                >
                  新建修订稿
                </Button>
                <Button
                  variant="ghost danger-text"
                  onClick={() => {
                    if (
                      confirm("删除该 JD？关联投递和简历保留，旧报告会过期。")
                    )
                      void step.run(async () => {
                        await update((s) => ({
                          ...s,
                          jds: s.jds.filter((j) => j.id !== jd.id),
                          versions: s.versions.map((v) =>
                            v.jdId === jd.id ? { ...v, jdId: "" } : v,
                          ),
                          applications: s.applications.map((a) =>
                            a.jdId === jd.id ? { ...a, jdId: "" } : a,
                          ),
                          sessions: s.sessions.map((a) =>
                            a.jdId === jd.id ? { ...a, jdId: "" } : a,
                          ),
                        }));
                      });
                  }}
                >
                  <Trash2 size={15} />
                </Button>
              </div>
            }
          >
            {jd.v2 ? (
              <>
                <FlatJobFields profile={jd.v2.structured_job} />
                <Keywords snapshot={jd.v2} />
                <p className="helper">
                  快照 {jd.v2.job_snapshot_id.slice(0, 8)} · 原始 JD
                  永久保留；修改原文请新建修订稿。
                </p>
                {result ? (
                  <>
                    <h3>Matching Points · 逐项匹配</h3>
                    <MatchingPoints result={result} />
                  </>
                ) : (
                  <p>暂无当前画像版本的匹配报告。请到岗位分析发起匹配。</p>
                )}
                <Button variant="secondary" onClick={() => go(3)}>
                  前往岗位分析
                </Button>
              </>
            ) : (
              <div className="notice">
                历史 JD 已保留，需要 LLM 结构化后才能进入 v2 匹配。
              </div>
            )}
            <details>
              <summary>查看 JD 原文</summary>
              <pre className="plain-output">{jd.raw}</pre>
            </details>
          </Panel>
        ) : (
          <Empty title="选择或新增一份 JD" />
        )}
      </div>
      {editing && (
        <Modal
          title="JD 结构化草稿"
          onClose={() => {
            if (!step.busy) {
              setEditing(null);
              setPreview(null);
            }
          }}
        >
          <div className="form-grid">
            <Field label="JD 原文">
              <textarea
                rows={10}
                disabled={
                  step.busy || state.jds.some((j) => j.id === editing.id)
                }
                value={editing.raw}
                onChange={(e) => {
                  setEditing({ ...editing, raw: e.target.value });
                  setPreview(null);
                }}
              />
            </Field>
            <p className="helper">
              以 Markdown / 纯文本提交；已有 JD 原文只读。任何 API
              或校验失败都不会覆盖原记录。
            </p>
            <Button
              disabled={step.busy || !editing.raw.trim()}
              onClick={() =>
                void step.run(async () => {
                  if (!allowAI(state, "AI JD 结构化")) return;
                  const snapshot =
                    workflowOf(state).mode === "demo"
                      ? demoSnapshot(editing)
                      : await parseJDWithLLM(editing);
                  JobSnapshotSchema.parse(snapshot);
                  validateSnapshot(snapshot, editing.id);
                  setPreview(snapshot);
                })
              }
            >
              AI 拆解 JD
            </Button>
            {preview && (
              <>
                <FlatJobFields profile={preview.structured_job} />
                <Keywords snapshot={preview} />
                <Button disabled={step.busy} onClick={savePreview}>
                  确认保存 JD
                </Button>
              </>
            )}
            {step.status}
          </div>
        </Modal>
      )}
    </div>
  );
}

function ResultCard({
  result,
  report,
  state,
  onSelect,
}: {
  result: ScoredJob;
  report: MatchReport;
  state: State;
  onSelect: () => void;
}) {
  const snapshot = report.job_snapshots.find(
      (j) => j.job_snapshot_id === result.job_snapshot_id,
    )!,
    f = snapshot.structured_job.job_facts;
  return (
    <article className="recommendation-card" data-testid="top-job">
      <div className="toolbar">
        <Tag>{result.analysis.match_category}</Tag>
        <strong className="score-pill">{result.total_score.toFixed(2)}</strong>
      </div>
      <small>匹配参考分，不代表录用概率</small>
      <h3>{f.job_title}</h3>
      <p>
        {f.company} · {f.location.join("、") || "地点未提供"}
      </p>
      <p>
        {f.salary || "薪资未提供"} · {f.enterprise_type || "企业性质未提供"}
      </p>
      <p>{result.analysis.category_reason}</p>
      <div className="tags">
        {result.analysis.R_analysis.primary
          .filter((p) => p.evidence_type !== "none")
          .slice(0, 2)
          .map((p) => (
            <Tag tone="green" key={p.criterion_id}>
              {p.requirement}
            </Tag>
          ))}
      </div>
      <Tag tone="amber">
        {result.gate.eligibility_status === "CONDITIONAL"
          ? "条件待确认"
          : "Hard Gate 通过"}{" "}
        · 可评估权重 {Math.round(result.assessable_weight * 100)}%
      </Tag>
      <details>
        <summary>R/P/U/E · 匹配点与证据</summary>
        <div className="tags">
          {Object.entries(result.dimensions).map(([key, d]) => (
            <Tag key={key}>
              {key} {d.score.toFixed(2)}
              {d.dimension_status === "not_assessable" ? " · 不可评估" : ""}
            </Tag>
          ))}
        </div>
        <MatchingPoints result={result} />
        <Keywords snapshot={snapshot} />
        <h3>缺口与待确认条件</h3>
        {[
          ...result.analysis.major_gaps,
          ...result.analysis.minor_gaps,
          ...result.analysis.conditional_items,
          ...result.analysis.data_risks,
          ...result.gate.reasons.map((g) => g.exclusion_reason),
        ].map((s, i) => (
          <p key={i}>{s}</p>
        ))}
        <h3>E · 实际使用的相关经历</h3>
        {result.analysis.evidence_analysis.map((e) => (
          <p key={e.fact_id}>
            [{e.fact_id}] 行动：{e.action || "未提供证据"}；方法：
            {e.method || "未提供证据"}；结果：{e.result || "未提供证据"}
          </p>
        ))}
      </details>
      <div className="actions wrap">
        <Button disabled={!reportIsCurrent(report, state)} onClick={onSelect}>
          选择此岗位精修
        </Button>
        {safeJobUrl(f.job_url) && (
          <a
            className="text-btn"
            href={f.job_url!}
            target="_blank"
            rel="noopener noreferrer"
          >
            岗位原始链接
          </a>
        )}
      </div>
    </article>
  );
}

export function RoleWorkflowPage({
  state,
  update,
  go,
}: Props & { go: (n: number) => void }) {
  const step = useStep(),
    w = workflowOf(state);
  const [chosen, setChosen] = useState<string[]>(state.jds.map((j) => j.id)),
    [reportId, setReportId] = useState(w.reports[0]?.report_id || ""),
    [library, setLibrary] = useState<JD[] | null>(null),
    [picked, setPicked] = useState<string[]>([]),
    [search, setSearch] = useState(""),
    [sheets, setSheets] = useState<JobSheet[]>([]),
    [sheetIndex, setSheetIndex] = useState(0);
  const report =
    w.reports.find((r) => r.report_id === reportId) || w.reports[0];
  let tablePreview: { jobs: JD[]; errors: string[] } = { jobs: [], errors: [] };
  if (sheets.length)
    try {
      tablePreview = parseJobRows(sheets[sheetIndex].rows, "用户导入岗位表");
    } catch (e) {
      tablePreview.errors = [e instanceof Error ? e.message : "表格无效"];
    }
  return (
    <div className="space-y-6">
      <ModeNotice state={state} />
      {step.status}
      <Panel
        title="本次匹配范围"
        action={
          <Tag>
            画像{" "}
            {w.confirmed_candidate_profile?.profile_version.slice(0, 8) ||
              "未确认"}
          </Tag>
        }
      >
        <p>
          选择本次需要比较的真实岗位。未结构化 JD 先调用 LLM，随后执行 Hard
          Gate、分类和逐项证据匹配。报告只覆盖所选范围。
        </p>
        <div className="actions wrap">
          <Button
            variant="secondary"
            onClick={() =>
              void step.run(async () => {
                const data = await import("./data/structured-jobs.json");
                setLibrary(jdSchema.array().parse(data.default));
                setPicked([]);
              })
            }
          >
            从 478 条结构化岗位库选择
          </Button>
          <label className="btn secondary">
            <Upload size={15} />
            导入 Excel / CSV 岗位
            <input
              type="file"
              hidden
              accept=".xlsx,.csv"
              aria-label="导入岗位表"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f)
                  void step.run(async () => {
                    setSheets(await readJobFile(f));
                    setSheetIndex(0);
                  });
              }}
            />
          </label>
          <Button variant="secondary" onClick={() => go(2)}>
            管理 JD
          </Button>
        </div>
        <div
          className="selection-list"
          style={{ maxHeight: 260, overflow: "auto" }}
        >
          {state.jds.map((j) => (
            <label className="checkbox" key={j.id}>
              <input
                type="checkbox"
                checked={chosen.includes(j.id)}
                disabled={step.busy}
                onChange={(e) =>
                  setChosen(
                    e.target.checked
                      ? [...chosen, j.id]
                      : chosen.filter((id) => id !== j.id),
                  )
                }
              />
              {j.title} · {j.company} · {j.v2 ? "已有快照" : "待 LLM 结构化"}
            </label>
          ))}
        </div>
        <div className="actions wrap">
          <Button
            variant="secondary"
            onClick={() => setChosen(state.jds.map((j) => j.id))}
          >
            全选当前 JD
          </Button>
          <Button
            disabled={step.busy || !chosen.length}
            onClick={() =>
              void step.run(async () => {
                requireConfirmed(state);
                if (!allowAI(state, "生成匹配报告", chosen.length * 2)) return;
                const original = new Map(
                  state.jds
                    .filter((j) => chosen.includes(j.id))
                    .map((j) => [j.id, JSON.stringify(j)]),
                );
                const result = await runMatchingWorkflow(
                  state,
                  chosen,
                  step.setProgress,
                );
                await update((s) => {
                  if (
                    [...original].some(
                      ([id, json]) =>
                        JSON.stringify(s.jds.find((j) => j.id === id)) !== json,
                    )
                  )
                    throw new Error("匹配期间 JD 变化，请重新生成");
                  return storeReport(s, result.report, result.jobs);
                });
                setReportId(result.report.report_id);
              })
            }
          >
            生成 Direct / General 报告（{chosen.length} 个岗位）
          </Button>
        </div>
        <p className="helper">
          分数由代码计算：R 40% + P 30% + U 20% + E
          10%。正式匹配没有关键词评分回退。
        </p>
      </Panel>
      {report ? (
        <>
          <div className="toolbar wrap">
            <Field label="历史匹配报告">
              <select
                value={report.report_id}
                onChange={(e) => setReportId(e.target.value)}
              >
                {w.reports.map((r) => (
                  <option key={r.report_id} value={r.report_id}>
                    {new Date(r.created_at).toLocaleString()} ·{" "}
                    {r.status === "stale" ? "已过期" : "当前"} ·{" "}
                    {r.job_snapshots.length} 岗位
                  </option>
                ))}
              </select>
            </Field>
            <Tag>
              {report.mode === "demo"
                ? "演示数据 / 模拟结果"
                : "LLM 证据 + 代码计分"}
            </Tag>
          </div>
          {!reportIsCurrent(report, state) && (
            <div className="notice" role="alert">
              此报告已过期（画像或 JD
              快照变化），不可用于简历改写。请重新生成报告。
            </div>
          )}
          {(["direct", "general"] as const).map((category) => {
            const ids =
              category === "direct" ? report.direct_top3 : report.general_top3;
            return (
              <Panel
                key={category}
                title={`${category === "direct" ? "Direct" : "General"} Top 3`}
                action={<Tag>{ids.length} 个达标岗位</Tag>}
              >
                <p className="helper">
                  {category === "direct"
                    ? "教育、课程、研究或经历与岗位方向直接相关"
                    : "主要依赖跨专业、通用或可迁移能力"}{" "}
                  · 总分 &gt; 60 且可评估权重 ≥ 0.6，不足 3 个不补齐。
                </p>
                {ids.length ? (
                  <div className="recommendation-grid">
                    {ids.map((id) => (
                      <ResultCard
                        key={id}
                        result={report.results.find((r) => r.job_id === id)!}
                        report={report}
                        state={state}
                        onSelect={() =>
                          void step.run(async () => {
                            await update((s) =>
                              selectJob(s, report.report_id, id),
                            );
                            go(4);
                          })
                        }
                      />
                    ))}
                  </div>
                ) : (
                  <Empty title="本次没有达到推荐门槛的岗位">
                    <p>可补充真实事实、明确偏好或扩大岗位范围后重试。</p>
                  </Empty>
                )}
              </Panel>
            );
          })}
          <Panel title="全部匹配结果与排除记录">
            <details>
              <summary>
                查看 {report.results.length} 个已评分岗位 /{" "}
                {report.excluded_jobs.length} 个排除岗位
              </summary>
              {report.results.map((r) => (
                <div className="gap-card" key={r.job_id}>
                  <h3>
                    {
                      report.job_snapshots.find(
                        (j) => j.structured_job.job_id === r.job_id,
                      )?.structured_job.job_facts.job_title
                    }
                  </h3>
                  <p>
                    {r.analysis.match_category} · {r.total_score} 分 ·
                    可评估权重 {r.assessable_weight} · 原库分类{" "}
                    {r.database_match_category || "未提供"}
                  </p>
                  <MatchingPoints result={r} />
                </div>
              ))}
              {report.excluded_jobs.map((j) => (
                <div className="gap-card" key={j.job_id}>
                  <h3>
                    {
                      report.job_snapshots.find(
                        (s) => s.structured_job.job_id === j.job_id,
                      )?.structured_job.job_facts.job_title
                    }
                  </h3>
                  {j.gate.reasons.map((r, i) => (
                    <p key={i}>
                      {r.exclusion_reason}
                      <br />
                      岗位证据：{r.job_evidence}
                      <br />
                      候选人证据：{r.candidate_evidence}
                    </p>
                  ))}
                </div>
              ))}
            </details>
          </Panel>
        </>
      ) : (
        <Empty title="尚未生成 v2 匹配报告">
          <p>先确认画像，然后选择岗位开始匹配。</p>
        </Empty>
      )}
      {library && (
        <Modal title="选择岗位库记录" onClose={() => setLibrary(null)}>
          <input
            aria-label="搜索岗位库"
            placeholder="岗位、公司、城市"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <p>岗位为历史快照，不保证仍在招聘。导入后仍需 LLM 生成 v2 快照。</p>
          <div
            className="selection-list"
            style={{ maxHeight: 350, overflow: "auto" }}
          >
            {library
              .filter((j) => (j.title + j.company + j.city).includes(search))
              .slice(0, 100)
              .map((j) => (
                <label className="checkbox" key={j.id}>
                  <input
                    type="checkbox"
                    checked={picked.includes(j.id)}
                    onChange={(e) =>
                      setPicked(
                        e.target.checked
                          ? [...picked, j.id]
                          : picked.filter((id) => id !== j.id),
                      )
                    }
                  />
                  {j.title} · {j.company} · {j.city}
                </label>
              ))}
          </div>
          <div className="actions wrap">
            <Button
              variant="secondary"
              onClick={() =>
                setPicked(
                  library
                    .filter((j) =>
                      (j.title + j.company + j.city).includes(search),
                    )
                    .map((j) => j.id),
                )
              }
            >
              选择全部搜索结果
            </Button>
            <Button
              disabled={!picked.length}
              onClick={() =>
                void step.run(async () => {
                  const additions = uniqueJobs(
                    state.jds,
                    library.filter((j) => picked.includes(j.id)),
                  );
                  await update((s) => ({
                    ...s,
                    jds: [...s.jds, ...uniqueJobs(s.jds, additions)],
                  }));
                  setChosen((ids) => [
                    ...new Set([...ids, ...additions.map((j) => j.id)]),
                  ]);
                  setLibrary(null);
                })
              }
            >
              确认导入 {picked.length} 个岗位
            </Button>
          </div>
        </Modal>
      )}
      {!!sheets.length && (
        <Modal title="预览岗位表导入" onClose={() => setSheets([])}>
          <Field label="工作表">
            <select
              aria-label="工作表"
              value={sheetIndex}
              onChange={(e) => setSheetIndex(Number(e.target.value))}
            >
              {sheets.map((s, i) => (
                <option key={s.name} value={i}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          {tablePreview.errors.map((e) => (
            <p role="alert" key={e}>
              {e}
            </p>
          ))}
          <p>
            {tablePreview.jobs.length} 条记录，
            {tablePreview.jobs.length -
              uniqueJobs(state.jds, tablePreview.jobs).length}{" "}
            条重复
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>岗位</th>
                  <th>公司</th>
                  <th>地点</th>
                </tr>
              </thead>
              <tbody>
                {tablePreview.jobs.slice(0, 20).map((j) => (
                  <tr key={j.id}>
                    <td>{j.title}</td>
                    <td>{j.company}</td>
                    <td>{j.city}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button
            disabled={
              !!tablePreview.errors.length ||
              !uniqueJobs(state.jds, tablePreview.jobs).length
            }
            onClick={() =>
              void step.run(async () => {
                const incoming = uniqueJobs(state.jds, tablePreview.jobs);
                await update((s) => ({
                  ...s,
                  jds: [...s.jds, ...uniqueJobs(s.jds, incoming)],
                }));
                setChosen((ids) => [...ids, ...incoming.map((j) => j.id)]);
                setSheets([]);
              })
            }
          >
            确认导入 {uniqueJobs(state.jds, tablePreview.jobs).length} 个岗位
          </Button>
          <Button variant="secondary" onClick={() => setSheets([])}>
            取消
          </Button>
        </Modal>
      )}
    </div>
  );
}

export function ResumeWorkflowPage({
  state,
  update,
  go,
}: Props & { go: (n: number) => void }) {
  const step = useStep(),
    w = workflowOf(state);
  let context: ReturnType<typeof currentSelection> | null = null,
    selectionError = "";
  try {
    context = currentSelection(state);
  } catch (e) {
    selectionError = e instanceof Error ? e.message : "未选择岗位";
  }
  const stored = w.resume_advice_draft;
  const [advice, setAdvice] = useState<ResumeAdvice | null>(
      stored &&
        stored.selection.report_id === w.selected?.report_id &&
        stored.selection.selected_job_id === w.selected?.selected_job_id
        ? stored.advice
        : null,
    ),
    [accepted, setAccepted] = useState<string[]>([]),
    [content, setContent] = useState(""),
    [title, setTitle] = useState("");
  const selectedId = w.selected?.selected_job_id;
  return (
    <div className="space-y-6">
      <ModeNotice state={state} />
      {step.status}
      {!context ? (
        <div className="notice" role="alert">
          {selectionError}
          <Button variant="secondary" onClick={() => go(3)}>
            前往岗位分析选岗
          </Button>
        </div>
      ) : (
        <>
          <Panel
            title="唯一目标岗位"
            action={<Tag>报告 {context.report.report_id.slice(0, 8)}</Tag>}
          >
            <h3>
              {context.job.structured_job.job_facts.job_title} ·{" "}
              {context.job.structured_job.job_facts.company}
            </h3>
            <p>
              画像 {context.selection.profile_version.slice(0, 8)} · JD 快照{" "}
              {context.selection.job_snapshot_id.slice(0, 8)}
              。本次只复用已选结果，不重新评分。
            </p>
            <Button
              disabled={step.busy}
              onClick={() =>
                void step.run(async () => {
                  if (!allowAI(state, "定向简历改写")) return;
                  const expected = currentSelection(state).selection;
                  const next =
                    w.mode === "demo"
                      ? demoAdvice(context!.candidate, expected.selected_job_id)
                      : await rewriteResumeWithLLM(state);
                  validateAdvice(next, state);
                  await update((s) => {
                    if (
                      JSON.stringify(currentSelection(s).selection) !==
                      JSON.stringify(expected)
                    )
                      throw new Error("选岗或版本变化，请重试");
                    return {
                      ...s,
                      workflow: {
                        ...workflowOf(s),
                        resume_advice_draft: {
                          advice: next,
                          selection: expected,
                        },
                      },
                    };
                  });
                  setAdvice(next);
                  setAccepted([]);
                  setContent("");
                  setTitle(
                    context!.job.structured_job.job_facts.job_title +
                      " · 定向版",
                  );
                })
              }
            >
              生成 AI 定向改写建议
            </Button>
          </Panel>
          <div className="resume-grid">
            <Panel title="逐项要求与证据">
              <div className="resume-document requirement-advice">
                <MatchingPoints
                  result={context.selection.selected_match_result}
                />
              </div>
            </Panel>
            <Panel title="建议改写版 · 可编辑">
              <textarea
                className="resume-document editor"
                aria-label="建议改写版"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="逐条接受下方修改后生成预览，也可自行编辑。"
              />
            </Panel>
          </div>
          {advice && advice.job_id === selectedId && (
            <Panel title="逐条接受或编辑修改">
              {advice.changes.map((change) => (
                <article className="gap-card" key={change.change_id}>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={accepted.includes(change.change_id)}
                      onChange={(e) =>
                        setAccepted(
                          e.target.checked
                            ? [...accepted, change.change_id]
                            : accepted.filter((id) => id !== change.change_id),
                        )
                      }
                    />
                    {change.action} · {change.source_section}
                  </label>
                  <details>
                    <summary>原文与事实来源</summary>
                    <p>{change.original_text}</p>
                    <p>JD：{change.job_evidence}</p>
                    {change.candidate_evidence.map((e, i) => (
                      <p key={i}>
                        [{e.fact_id}] {e.quote}
                      </p>
                    ))}
                  </details>
                  <Field label={`建议 ${change.change_id}`}>
                    <textarea
                      value={change.suggested_text}
                      onChange={(e) =>
                        setAdvice({
                          ...advice,
                          changes: advice.changes.map((c) =>
                            c.change_id === change.change_id
                              ? { ...c, suggested_text: e.target.value }
                              : c,
                          ),
                        })
                      }
                    />
                  </Field>
                  <p>{change.rationale}</p>
                </article>
              ))}
              <h3>待补充问题 / 改进计划</h3>
              {[...advice.questions, ...advice.improvement_plan].map((q, i) => (
                <p key={i}>{q}</p>
              ))}
              <Button
                disabled={!accepted.length}
                onClick={() =>
                  void step.run(async () => {
                    setContent(
                      assembleResume(
                        context!.candidate.resume_text,
                        advice,
                        accepted,
                      ),
                    );
                  })
                }
              >
                接受所选修改并预览
              </Button>
            </Panel>
          )}
          <div className="toolbar wrap">
            <input
              aria-label="版本名称"
              placeholder="版本名称"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button
              disabled={!content.trim() || !title.trim()}
              onClick={() =>
                void step.run(async () => {
                  const expected = context!.selection;
                  await update((s) => {
                    if (
                      JSON.stringify(currentSelection(s).selection) !==
                      JSON.stringify(expected)
                    )
                      throw new Error("报告或选岗变化，请重新加载");
                    return saveResumeVersion(s, content, title);
                  });
                })
              }
            >
              保存新版本
            </Button>
            <Button
              variant="secondary"
              disabled={!content}
              onClick={() => download("resume.txt", content)}
            >
              导出 TXT
            </Button>
            <Button
              variant="secondary"
              disabled={!content}
              onClick={() =>
                download("resume.md", content, "text/markdown;charset=utf-8")
              }
            >
              导出 Markdown
            </Button>
          </div>
        </>
      )}
      <Panel title="已保存的简历版本">
        <p className="helper">
          历史版本与原始简历永久保留；新版本关联报告、画像版本和 JD 快照。
        </p>
        {state.versions.map((v) => (
          <div className="history-row" key={v.id}>
            <span>
              {v.title} · {new Date(v.createdAt).toLocaleString()} ·{" "}
              {v.profile_version?.slice(0, 8) || "旧版"}
            </span>
            <Button
              variant="secondary"
              onClick={() => download(v.title + ".txt", v.content)}
            >
              导出版本
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                void step.run(async () => {
                  const jd = state.jds.find((j) => j.id === v.jdId);
                  if (!jd)
                    throw new Error("关联 JD 已删除，请在看板手动新建记录");
                  if (state.applications.some((a) => a.resumeId === v.id)) {
                    go(5);
                    return;
                  }
                  await update((s) => ({
                    ...s,
                    applications: [
                      ...s.applications,
                      {
                        id: uid(),
                        company: jd.company,
                        role: jd.title,
                        city: jd.city,
                        source: "定向简历版本",
                        date: new Date().toLocaleDateString("sv-SE"),
                        jdId: jd.id,
                        resumeId: v.id,
                        followUp: "",
                        interviewAt: "",
                        notes: "",
                        status: "待投递",
                      },
                    ],
                  }));
                  go(5);
                })
              }
            >
              加入投递看板
            </Button>
            <Button
              variant="ghost danger-text"
              onClick={() => {
                if (confirm("删除这个简历版本？原始简历保留。"))
                  void step.run(async () => {
                    await update((s) => ({
                      ...s,
                      versions: s.versions.filter((x) => x.id !== v.id),
                      applications: s.applications.map((a) =>
                        a.resumeId === v.id ? { ...a, resumeId: "" } : a,
                      ),
                    }));
                  });
              }}
            >
              删除版本
            </Button>
          </div>
        ))}
      </Panel>
    </div>
  );
}

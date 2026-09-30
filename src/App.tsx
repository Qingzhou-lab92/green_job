import { useState, useEffect, useRef, type ReactNode } from "react";
import {
  LayoutDashboard,
  UserRound,
  Compass,
  ScanText,
  FilePenLine,
  Columns3,
  MessagesSquare,
  Settings,
  BriefcaseBusiness,
  ArrowUpRight,
  ArrowRight,
  Plus,
  Search,
  X,
  Menu,
  ShieldCheck,
  Download,
  Upload,
  Trash2,
  ChevronRight,
  Sparkles,
  CalendarDays,
  Database,
  CircleHelp,
  FileText,
  CheckCircle2,
} from "lucide-react";
import {
  type State,
  type Profile,
  type JD,
  type Application,
  statuses,
  emptyState,
  uid,
  today,
} from "./model";
import { readState, writeState, clearState, download } from "./storage";
import { demoState } from "./demo";
import {
  catalog,
  parseResume,
  analyzeJD,
  roleScore,
  rewriteResume,
  feedback,
  parseImport,
} from "./logic";
import { askAI, readConfig, saveConfig, type AIConfig } from "./ai";
const pages = [
  {
    name: "概览",
    icon: LayoutDashboard,
    sub: "把求职的每一步，掌握在自己手里。",
  },
  {
    name: "认识我",
    icon: UserRound,
    sub: "从真实经历出发，建立你的职业档案。",
  },
  {
    name: "岗位分析",
    icon: Compass,
    sub: "找到值得探索的方向，让每个建议都有依据。",
  },
  {
    name: "JD 拆解器",
    icon: ScanText,
    sub: "读懂岗位期待，找到经验与机会的交点。",
  },
  {
    name: "简历定制",
    icon: FilePenLine,
    sub: "同一份真实经历，为不同岗位清晰表达。",
  },
  { name: "投递看板", icon: Columns3, sub: "记录每一次尝试，跟进每一个机会。" },
  {
    name: "面试陪练",
    icon: MessagesSquare,
    sub: "把真实经历，练成有结构、有证据的回答。",
  },
  { name: "设置与数据", icon: Settings, sub: "数据由你掌握，AI 由你选择。" },
];
type Update = (fn: (s: State) => State) => Promise<void>;
function Button({
  children,
  onClick,
  variant = "",
  disabled = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={"btn " + variant}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <FileText size={30} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function Tag({ children, tone = "" }: { children: ReactNode; tone?: string }) {
  return <span className={"tag " + tone}>{children}</span>;
}
function Panel({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const old = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,textarea,[tabindex="0"]',
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      old?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="modal"
      >
        <div className="panel-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="关闭" onClick={onClose}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [page, setPage] = useState(0),
    [mobile, setMobile] = useState(false),
    [saving, setSaving] = useState(false);
  const current = useRef<State>(emptyState()),
    queue = useRef(Promise.resolve());
  useEffect(() => {
    readState()
      .then((s) => {
        current.current = s;
        setState(s);
      })
      .catch(() =>
        setError(
          "无法读取浏览器数据库。请允许此站点存储数据，或在普通浏览窗口中重试。",
        ),
      );
  }, []);
  const update: Update = (fn) => {
    setSaving(true);
    const op = queue.current.then(async () => {
      const next = fn(current.current);
      await writeState(next);
      current.current = next;
      setState(next);
    });
    queue.current = op.catch((e) => {
      setError(
        "保存失败：" + (e instanceof Error ? e.message : "浏览器存储不可用"),
      );
    });
    return op.finally(() => setSaving(false));
  };
  const run = async (
    fn: () => Promise<unknown>,
    message = "已保存到当前浏览器",
  ) => {
    try {
      await fn();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试");
    }
  };
  const go = (n: number) => {
    setPage(n);
    setMobile(false);
    window.scrollTo(0, 0);
  };
  useEffect(() => {
    if (notice) {
      const t = setTimeout(() => setNotice(""), 4500);
      return () => clearTimeout(t);
    }
  }, [notice]);
  return (
    <div className="app">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            go(0);
          }}
        >
          <span className="brand-mark">
            <BriefcaseBusiness size={23} />
          </span>
          <span>
            Career Desk<small>个人求职工作台</small>
          </span>
        </a>
        <div className="nav-caption">工作空间</div>
        <nav>
          {pages.slice(0, 7).map((p, i) => (
            <button
              key={p.name}
              onClick={() => go(i)}
              className={page === i ? "active" : ""}
            >
              <p.icon size={19} />
              <span>{p.name}</span>
              {page === i && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <ShieldCheck size={20} />
            <strong>你的资料，只属于你</strong>
            <p>
              默认保存在当前浏览器
              <br />
              建议定期导出备份
            </p>
          </div>
          <button
            className={"settings-link " + (page === 7 ? "active" : "")}
            onClick={() => go(7)}
          >
            <Settings size={18} />
            设置与数据
          </button>
          <div className="user-card">
            <div className="avatar">
              {state?.profile.name?.slice(0, 1) || "我"}
            </div>
            <div>
              <strong>{state?.profile.name || "我的工作空间"}</strong>
              <small>本地个人档案</small>
            </div>
            <span className="online" />
          </div>
        </div>
      </aside>
      {mobile && (
        <button
          aria-label="关闭导航"
          className="nav-overlay"
          onClick={() => setMobile(false)}
        />
      )}
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-toggle"
              aria-label="打开导航"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>工作空间</span>
            <ChevronRight size={14} />
            <strong>{pages[page].name}</strong>
          </div>
          <div className="storage-status">
            <span className="online" />
            {saving ? "正在保存…" : "本地存储"}
            <span className="top-date">
              {new Date().toLocaleDateString("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "short",
              })}
            </span>
          </div>
        </header>
        <div className="workspace">
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CAREER, IN PROGRESS</div>
              <h1>
                {page === 0
                  ? `你好，${state?.profile.name?.replace("（演示）", "") || "求职者"}`
                  : pages[page].name}
                {page === 0 && <span className="heading-dot">.</span>}
              </h1>
              <p>{pages[page].sub}</p>
            </div>
            {page === 0 && (
              <Button onClick={() => go(5)}>
                <Plus size={16} />
                记录投递
              </Button>
            )}
          </div>
          {error && (
            <div role="alert" className="alert error">
              {error}
              <button aria-label="关闭错误" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!state ? (
            <div className="empty">
              {error
                ? "数据尚未载入，请检查浏览器存储后刷新。"
                : "正在读取本地工作空间…"}
            </div>
          ) : (
            <>
              {page === 0 && (
                <Overview state={state} update={update} go={go} run={run} />
              )}
              {page === 1 && (
                <ProfilePage state={state} update={update} run={run} />
              )}
              {page === 2 && <Roles profile={state.profile} />}
              {page === 3 && <JDPage state={state} update={update} run={run} />}
              {page === 4 && (
                <Resumes state={state} update={update} run={run} />
              )}
              {page === 5 && <Board state={state} update={update} run={run} />}
              {page === 6 && (
                <Practice state={state} update={update} run={run} />
              )}
              {page === 7 && (
                <SettingsPage
                  state={state}
                  update={update}
                  run={run}
                  onClear={async () => {
                    await queue.current;
                    await clearState();
                    localStorage.removeItem("career-desk-ai");
                    current.current = emptyState();
                    setState(current.current);
                  }}
                />
              )}
            </>
          )}
          <footer>
            <ShieldCheck size={13} />
            本地优先 · 无账号 · 无追踪<span>CAREER DESK / 让下一步更清晰</span>
          </footer>
        </div>
      </main>
      {notice && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          {notice}
        </div>
      )}
    </div>
  );
}
type Props = {
  state: State;
  update: Update;
  run: (fn: () => Promise<unknown>, message?: string) => Promise<void>;
};
function Overview({
  state,
  update,
  go,
  run,
}: Props & { go: (n: number) => void }) {
  const [task, setTask] = useState("");
  const counts = statuses.map(
    (status) => state.applications.filter((a) => a.status === status).length,
  );
  const upcoming = state.applications
    .filter(
      (a) => a.interviewAt && a.interviewAt >= today() && a.status !== "结束",
    )
    .sort((a, b) => a.interviewAt.localeCompare(b.interviewAt));
  const followups = state.applications.filter(
    (a) =>
      a.followUp &&
      a.followUp <= today() &&
      !["结束", "Offer"].includes(a.status),
  );
  return (
    <div className="space-y-6">
      {!state.profile.original && (
        <div className="welcome-strip">
          <div>
            <strong>从一份简历，开始你的下一程</strong>
            <p>建立个人档案，或载入虚构演示数据体验完整流程。</p>
          </div>
          <div className="actions">
            <Button
              variant="secondary"
              onClick={() => {
                if (
                  state.applications.length ||
                  state.jds.length ||
                  state.profile.name ||
                  state.tasks.length ||
                  state.sessions.length ||
                  state.versions.length
                ) {
                  if (!confirm("演示会替换现有数据，确认已备份并继续？"))
                    return;
                }
                void run(() => update(() => demoState()), "已载入虚构演示数据");
              }}
            >
              体验演示
            </Button>
            <Button onClick={() => go(1)}>
              建立档案
              <ArrowRight size={15} />
            </Button>
          </div>
        </div>
      )}
      <div className="stats-grid">
        {[
          {
            label: "总投递记录",
            value: state.applications.length,
            sub: "每一次尝试，都在积累",
            icon: BriefcaseBusiness,
          },
          {
            label: "面试阶段",
            value: counts[3],
            sub: "把准备转化成表现",
            icon: MessagesSquare,
          },
          {
            label: "已获 Offer",
            value: counts[4],
            sub: "离理想的工作更近一步",
            icon: CheckCircle2,
          },
          {
            label: "待跟进事项",
            value: followups.length,
            sub: "今天及已到期的跟进",
            icon: CalendarDays,
          },
        ].map((c, i) => (
          <div className={"stat-card stat-" + i} key={c.label}>
            <div className="stat-label">
              {c.label}
              <c.icon size={19} />
            </div>
            <div className="stat-value">
              {String(c.value).padStart(2, "0")}
              <span>{i === 2 ? "份" : "项"}</span>
            </div>
            <small>{c.sub}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-grid">
        <div className="space-y-6">
          <Panel
            title="我的求职方向"
            action={
              <button className="text-btn" onClick={() => go(1)}>
                编辑档案
                <ArrowUpRight size={15} />
              </button>
            }
          >
            <div className="target-row">
              <div className="target-icon">
                <Compass size={26} />
              </div>
              <div>
                <h3>{state.profile.goals || "还没有设置目标岗位"}</h3>
                <p>以你的经历为起点，探索更合适的机会</p>
              </div>
            </div>
            <div className="skill-line">
              <span>我的技能</span>
              <div className="tags">
                {state.profile.skills.length ? (
                  state.profile.skills
                    .slice(0, 8)
                    .map((s) => <Tag key={s}>{s}</Tag>)
                ) : (
                  <small>在“认识我”中添加你的技能</small>
                )}
              </div>
            </div>
          </Panel>
          <Panel
            title="投递进展"
            action={
              <button className="text-btn" onClick={() => go(5)}>
                查看看板
                <ArrowUpRight size={15} />
              </button>
            }
          >
            <div className="funnel">
              {statuses.map((s, i) => (
                <div className="funnel-row" key={s}>
                  <span>
                    <i className={"status-dot color-" + i} />
                    {s}
                  </span>
                  <div className="bar-track">
                    <div
                      className={"bar-fill color-" + i}
                      style={{
                        width: `${(counts[i] / Math.max(...counts, 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>{counts[i]}</strong>
                </div>
              ))}
            </div>
            <p className="panel-foot">当前状态分布 · 随看板实时更新</p>
          </Panel>
          <Panel
            title="近期面试"
            action={<Tag>{upcoming.length} 场待准备</Tag>}
          >
            {upcoming.length ? (
              <div className="list">
                {upcoming.slice(0, 4).map((a) => (
                  <button
                    className="interview-row"
                    key={a.id}
                    onClick={() => go(6)}
                  >
                    <span className="calendar-block">
                      <CalendarDays size={20} />
                    </span>
                    <span>
                      <strong>{a.role}</strong>
                      <small>
                        {a.company} · {a.interviewAt.replace("T", " ")}
                      </small>
                    </span>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </div>
            ) : (
              <Empty title="暂时没有安排面试">
                <p>在投递卡片中添加面试时间，提前为机会做好准备。</p>
              </Empty>
            )}
          </Panel>
        </div>
        <div className="space-y-6">
          <section className="next-card">
            <span className="eyebrow">
              <Sparkles size={15} /> MAKE YOUR NEXT MOVE
            </span>
            <h2>下一步，更有方向</h2>
            <p>
              {!state.profile.original
                ? "先保存一份基础简历，让岗位匹配有据可依。"
                : upcoming.length
                  ? "面试即将到来，挑一个真实项目练习 STAR 表达。"
                  : followups.length
                    ? "有投递到了跟进日期，记下进展并规划下一步。"
                    : "为你的优势补上证据，让每一句表达都站得住。"}
            </p>
            <button
              onClick={() =>
                go(
                  !state.profile.original
                    ? 1
                    : upcoming.length
                      ? 6
                      : followups.length
                        ? 5
                        : 1,
                )
              }
            >
              开始行动
              <ArrowRight size={17} />
            </button>
            <div className="decorative-ring" />
          </section>
          <Panel
            title="待办清单"
            action={
              <span className="muted">
                {state.tasks.filter((t) => t.done).length}/{state.tasks.length}
              </span>
            }
          >
            <div className="todo-list">
              {state.tasks.map((t) => (
                <div className="todo" key={t.id}>
                  <input
                    aria-label={t.text}
                    type="checkbox"
                    checked={t.done}
                    onChange={() =>
                      run(() =>
                        update((s) => ({
                          ...s,
                          tasks: s.tasks.map((x) =>
                            x.id === t.id ? { ...x, done: !x.done } : x,
                          ),
                        })),
                      )
                    }
                  />
                  <span className={t.done ? "done" : ""}>{t.text}</span>
                  <button
                    className="icon-btn"
                    aria-label={"删除待办 " + t.text}
                    onClick={() => {
                      if (confirm("删除这条待办？"))
                        void run(() =>
                          update((s) => ({
                            ...s,
                            tasks: s.tasks.filter((x) => x.id !== t.id),
                          })),
                        );
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {!state.tasks.length && (
                <p className="muted">把下一步拆成一件小事。</p>
              )}
            </div>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (task.trim())
                  void run(async () => {
                    await update((s) => ({
                      ...s,
                      tasks: [
                        ...s.tasks,
                        { id: uid(), text: task.trim(), done: false },
                      ],
                    }));
                    setTask("");
                  });
              }}
            >
              <input
                aria-label="新增待办"
                placeholder="添加一个小目标…"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                required
              />
              <button className="icon-btn" aria-label="添加待办">
                <Plus size={18} />
              </button>
            </form>
          </Panel>
          <div className="backup-note">
            <Database size={21} />
            <div>
              <strong>给你的努力留一份备份</strong>
              <p>清理浏览器数据可能丢失资料。定期导出，安心继续。</p>
              <button className="text-btn" onClick={() => go(7)}>
                管理我的数据
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function ProfilePage({ state, update, run }: Props) {
  const [draft, setDraft] = useState<Profile>(state.profile),
    [raw, setRaw] = useState(state.profile.original),
    [skill, setSkill] = useState(""),
    [parsed, setParsed] = useState<Partial<Profile> | null>(null);
  return (
    <div className="space-y-6">
      <div className="notice">
        <ShieldCheck size={18} />
        原始简历单独保存，解析只生成待确认草稿。每次保存原文会保留历史快照。
      </div>
      <div className="two-col">
        <Panel title="基础简历原文" action={<Tag>TXT / Markdown</Tag>}>
          <textarea
            className="resume-text"
            aria-label="原始简历"
            placeholder="粘贴你的简历全文…"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
          <div className="actions wrap">
            <label className="btn secondary">
              <Upload size={15} />
              导入文本
              <input
                type="file"
                accept=".txt,.md,.markdown"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void run(async () => {
                      if (f.size > 2_000_000)
                        throw new Error("简历不能超过 2 MB");
                      setRaw(await f.text());
                    }, "已读取文本，请确认保存原文");
                  e.target.value = "";
                }}
              />
            </label>
            <Button
              disabled={!raw.trim()}
              onClick={() =>
                run(() =>
                  update((s) => ({
                    ...s,
                    profile: {
                      ...s.profile,
                      original: raw,
                      originals: [
                        ...s.profile.originals,
                        {
                          id: uid(),
                          createdAt: new Date().toISOString(),
                          text: raw,
                        },
                      ],
                    },
                  })),
                )
              }
            >
              保存原文
            </Button>
            <Button
              variant="secondary"
              disabled={!raw.trim()}
              onClick={() => setParsed(parseResume(raw))}
            >
              解析为档案草稿
            </Button>
          </div>
          <p className="helper">
            PDF / DOCX 暂未支持。请从文档复制文本，或另存为 TXT 后导入。
          </p>
          {state.profile.originals.length > 0 && (
            <details>
              <summary>
                原始简历历史 · {state.profile.originals.length} 份
              </summary>
              {state.profile.originals.map((o) => (
                <div className="history-row" key={o.id}>
                  <span>{new Date(o.createdAt).toLocaleString()}</span>
                  <button
                    className="text-btn"
                    onClick={() => download("resume-original.txt", o.text)}
                  >
                    导出原文
                  </button>
                </div>
              ))}
            </details>
          )}
        </Panel>
        <Panel title="我的职业档案" action={<Tag>可手动编辑</Tag>}>
          <div className="form-grid">
            {(
              [
                ["name", "姓名"],
                ["contact", "联系方式"],
                ["goals", "求职目标"],
              ] as const
            ).map(([key, label]) => (
              <Field label={label} key={key}>
                <input
                  value={draft[key]}
                  onChange={(e) =>
                    setDraft({ ...draft, [key]: e.target.value })
                  }
                />
              </Field>
            ))}
            <Field label="教育经历">
              <textarea
                value={draft.education}
                onChange={(e) =>
                  setDraft({ ...draft, education: e.target.value })
                }
              />
            </Field>
            <Field label="工作 / 项目经历">
              <textarea
                value={draft.experience}
                onChange={(e) =>
                  setDraft({ ...draft, experience: e.target.value })
                }
              />
            </Field>
            <Field label="技能（直接修改；点击 × 删除）">
              <div className="editable-tags">
                {draft.skills.map((s, i) => (
                  <div key={i}>
                    <input
                      aria-label={"技能 " + (i + 1)}
                      value={s}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          skills: draft.skills.map((x, k) =>
                            k === i ? e.target.value : x,
                          ),
                        })
                      }
                    />
                    <button
                      aria-label={"删除技能 " + s}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          skills: draft.skills.filter((_, k) => k !== i),
                        })
                      }
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </Field>
            <div className="inline-form">
              <input
                aria-label="新技能"
                placeholder="添加技能，如 SQL"
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
              />
              <Button
                variant="secondary"
                disabled={!skill.trim()}
                onClick={() => {
                  setDraft({
                    ...draft,
                    skills: [...new Set([...draft.skills, skill.trim()])],
                  });
                  setSkill("");
                }}
              >
                <Plus size={15} />
                添加
              </Button>
            </div>
            <Button
              onClick={() =>
                run(() =>
                  update((s) => ({
                    ...s,
                    profile: {
                      ...draft,
                      skills: [
                        ...new Set(
                          draft.skills.map((s) => s.trim()).filter(Boolean),
                        ),
                      ],
                      original: s.profile.original,
                      originals: s.profile.originals,
                    },
                  })),
                )
              }
            >
              保存档案
            </Button>
          </div>
        </Panel>
      </div>
      <Panel
        title="经历证据库"
        action={
          <Button
            variant="secondary"
            onClick={() =>
              setDraft({
                ...draft,
                evidence: [
                  ...draft.evidence,
                  {
                    id: uid(),
                    strength: "",
                    experience: "",
                    action: "",
                    result: "",
                    proof: "",
                  },
                ],
              })
            }
          >
            <Plus size={15} />
            新增优势
          </Button>
        }
      >
        <p className="helper">
          每项优势都连接一个真实故事。编辑后点击“保存证据库”，不要填写未经证实的结果。
        </p>
        {draft.evidence.length ? (
          draft.evidence.map((ev, i) => (
            <div className="evidence-card" key={ev.id}>
              <div className="panel-head">
                <h3>优势证据 {String(i + 1).padStart(2, "0")}</h3>
                <button
                  className="icon-btn danger-text"
                  aria-label="删除优势"
                  onClick={() => {
                    if (confirm("删除这项优势及其证据？"))
                      setDraft({
                        ...draft,
                        evidence: draft.evidence.filter((x) => x.id !== ev.id),
                      });
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="form-grid grid-2">
                {(
                  [
                    ["strength", "优势"],
                    ["experience", "真实经历"],
                    ["action", "我的具体行动"],
                    ["result", "结果 / 交付物"],
                    ["proof", "可证明材料（链接或说明）"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    <textarea
                      value={ev[key]}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          evidence: draft.evidence.map((x) =>
                            x.id === ev.id
                              ? { ...x, [key]: e.target.value }
                              : x,
                          ),
                        })
                      }
                    />
                  </Field>
                ))}
              </div>
            </div>
          ))
        ) : (
          <Empty title="让优势有证据可循">
            <p>添加一次真实经历，记录你做了什么、结果如何。</p>
          </Empty>
        )}
        <Button
          onClick={() =>
            run(() =>
              update((s) => ({
                ...s,
                profile: { ...s.profile, evidence: draft.evidence },
              })),
            )
          }
        >
          保存证据库
        </Button>
      </Panel>
      {parsed && (
        <Modal title="确认解析草稿" onClose={() => setParsed(null)}>
          <p className="notice">
            本地规则解析可能遗漏信息。确认后仅填入右侧草稿；保存档案后才会持久化，原文保持独立。
          </p>
          <pre className="plain-output">
            {Object.entries(parsed)
              .map(
                ([k, v]) =>
                  `${({ name: "姓名", contact: "联系方式", education: "教育经历", experience: "项目经历", skills: "技能", goals: "求职目标", evidence: "优势（需要补充真实经历与证据）" } as Record<string, string>)[k]}：${Array.isArray(v) ? v.map((x) => (typeof x === "string" ? x : "strength" in x ? x.strength : x.text)).join("、") : v || "未识别"}`,
              )
              .join("\n\n")}
          </pre>
          <Button
            onClick={() => {
              setDraft({
                ...draft,
                ...Object.fromEntries(
                  Object.entries(parsed).filter(([, value]) =>
                    Array.isArray(value) ? value.length > 0 : Boolean(value),
                  ),
                ),
              });
              setParsed(null);
            }}
          >
            应用到档案草稿
          </Button>
        </Modal>
      )}
    </div>
  );
}
function Roles({ profile }: { profile: Profile }) {
  return (
    <div className="space-y-6">
      <div className="notice">
        <CircleHelp size={18} />
        以下均为探索建议，不是录用概率。评分 = 已登记技能命中数 ÷
        模板技能总数；不推断人格与潜力。
      </div>
      <div className="role-grid">
        {catalog.roles.map((r, i) => {
          const a = roleScore(r.skills, profile);
          return (
            <section className="panel role-card" key={r.name}>
              <div className="panel-head">
                <span className="role-number">0{i + 1} / DIRECTION</span>
                <Tag tone={a.score >= 60 ? "green" : ""}>建议探索</Tag>
              </div>
              <div className="role-title">
                <h2>{r.name}</h2>
                <strong>
                  {a.score}
                  <small>%</small>
                </strong>
              </div>
              <div className="meter">
                <span style={{ width: a.score + "%" }} />
              </div>
              <p className="helper">
                依据：{a.hits.length} / {r.skills.length} 项登记技能命中
              </p>
              <h4>匹配强项</h4>
              <p>{a.hits.join("、") || "暂无已登记技能命中"}</p>
              <h4>短板与补强建议</h4>
              <p>
                {a.gaps.length
                  ? `待补充 ${a.gaps.join("、")} 的学习或真实经历证据。`
                  : "技能已命中，仍需逐项准备真实经历与作品。"}
              </p>
              <div className="role-action">
                <ArrowUpRight size={17} />
                <span>{r.action}</span>
              </div>
              <details>
                <summary>查看完整评分依据</summary>
                <p>
                  模板技能：{r.skills.join("、")}
                  。每项等权，仅比较技能名称；登记技能不等于已证明能力。学历、年限等须对照具体
                  JD 单独核实。
                </p>
              </details>
            </section>
          );
        })}
      </div>
    </div>
  );
}
function AIAction({
  task,
  data,
  mock,
  onResult,
  label = "生成 AI 建议",
}: {
  task: string;
  data: unknown;
  mock: string;
  onResult: (text: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div>
      <Button
        disabled={busy}
        variant="secondary"
        onClick={async () => {
          setError("");
          try {
            const c = readConfig();
            if (
              c.key &&
              !confirm(
                `本次将把当前相关简历、JD 或回答发送到 ${new URL(c.baseUrl).origin}。确认发送？`,
              )
            )
              return;
            setBusy(true);
            onResult(await askAI(task, data, mock, c));
          } catch (e) {
            setError(e instanceof Error ? e.message : "请求失败");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles size={16} />
        {busy ? "正在生成，请稍候…" : label}
      </Button>
      <p className="helper">
        {readConfig().key
          ? "使用已配置服务商，发送前会确认。"
          : "未配置 Key：使用明确标记的本地模拟结果。"}
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </div>
  );
}
function JDPage({ state, update, run }: Props) {
  const [selected, setSelected] = useState(state.jds[0]?.id || ""),
    [editing, setEditing] = useState<JD | null>(null),
    [suggestion, setSuggestion] = useState("");
  const jd = state.jds.find((j) => j.id === selected),
    a = jd ? analyzeJD(jd, state.profile) : null;
  return (
    <div className="space-y-6">
      <div className="toolbar">
        <div className="muted">岗位资料库 / {state.jds.length} 份 JD</div>
        <Button
          onClick={() =>
            setEditing({
              id: uid(),
              title: "",
              company: "",
              city: "",
              raw: "",
              createdAt: new Date().toISOString(),
            })
          }
        >
          <Plus size={16} />
          新增 JD
        </Button>
      </div>
      <div className="master-detail">
        <div className="panel selection-list">
          {state.jds.map((j) => (
            <button
              key={j.id}
              className={selected === j.id ? "selected" : ""}
              onClick={() => {
                setSelected(j.id);
                setSuggestion("");
              }}
            >
              <strong>{j.title}</strong>
              <small>
                {j.company || "公司待补充"} · {j.city || "地点待补充"}
              </small>
              <ChevronRight size={15} />
            </button>
          ))}
          {!state.jds.length && (
            <Empty title="还没有 JD">
              <p>粘贴岗位描述，建立你的机会资料库。</p>
            </Empty>
          )}
        </div>
        <div>
          {jd && a ? (
            <Panel
              title={jd.title}
              action={
                <div className="actions">
                  <Button variant="secondary" onClick={() => setEditing(jd)}>
                    编辑
                  </Button>
                  <Button
                    variant="ghost danger-text"
                    onClick={() => {
                      if (
                        confirm(
                          "删除该 JD？关联投递、简历和练习会保留，关联字段会清空。",
                        )
                      )
                        void run(() =>
                          update((s) => ({
                            ...s,
                            jds: s.jds.filter((j) => j.id !== jd.id),
                            applications: s.applications.map((x) =>
                              x.jdId === jd.id ? { ...x, jdId: "" } : x,
                            ),
                            versions: s.versions.map((x) =>
                              x.jdId === jd.id ? { ...x, jdId: "" } : x,
                            ),
                            sessions: s.sessions.map((x) =>
                              x.jdId === jd.id ? { ...x, jdId: "" } : x,
                            ),
                          })),
                        );
                    }}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              }
            >
              <p className="muted">
                {jd.company} · {jd.city}
              </p>
              <div className="match-summary">
                <strong>
                  {a.score}
                  <small>%</small>
                </strong>
                <div>
                  <h3>技能文本匹配度</h3>
                  <p>
                    命中计 1，部分命中计 0.5；除以识别技能数。不是录用概率。
                  </p>
                </div>
              </div>
              <div className="tags">
                {a.matches.map((m) => (
                  <Tag
                    key={m.word}
                    tone={
                      m.status === "命中"
                        ? "green"
                        : m.status === "缺口"
                          ? "red"
                          : "amber"
                    }
                  >
                    {m.word} · {m.count} 次 · {m.status}
                  </Tag>
                ))}
                {!a.matches.length && (
                  <p className="muted">
                    未识别到词库技能，请人工查看任职要求，匹配分数暂不具备参考意义。
                  </p>
                )}
              </div>
              <p className="helper">
                命中 = 简历/经历包含关键词；部分命中 = 仅登记了技能；缺口 =
                尚无文本证据。关键词命中不证明能力。
              </p>
              <div className="grid-2 form-grid">
                {(
                  [
                    ["responsibilities", "岗位职责"],
                    ["requirements", "任职要求"],
                    ["hard", "硬性条件 · 必须人工核实"],
                    ["bonus", "加分项"],
                  ] as const
                ).map(([key, label]) => (
                  <div className="analysis-box" key={key}>
                    <h3>{label}</h3>
                    <ul>
                      {a[key].length ? (
                        a[key].map((x, i) => (
                          <li key={i}>
                            {x}
                            {key === "hard" && <Tag tone="amber">待核实</Tag>}
                          </li>
                        ))
                      ) : (
                        <li>本地规则未识别，请检查原文并补充。</li>
                      )}
                    </ul>
                  </div>
                ))}
              </div>
              <h3>逐项要求匹配 · 建议</h3>
              <div className="table-scroll">
                <table className="requirement-table">
                  <thead>
                    <tr>
                      <th>JD 要求</th>
                      <th>匹配</th>
                      <th>依据 / 需要补充</th>
                    </tr>
                  </thead>
                  <tbody>
                    {a.requirementMatches.map((m, i) => (
                      <tr key={i}>
                        <td>{m.text}</td>
                        <td>
                          <Tag tone={m.status === "命中" ? "green" : "amber"}>
                            {m.status}
                          </Tag>
                        </td>
                        <td>{m.basis}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="mt-6">切入建议与证据缺口</h3>
              <p>
                建议优先展示{" "}
                {a.matches
                  .filter((m) => m.status === "命中")
                  .map((m) => m.word)
                  .join("、") || "与职责相关"}{" "}
                的真实经历。需要补充：
                {a.matches
                  .filter((m) => m.status !== "命中")
                  .map((m) => m.word)
                  .join("、") || "关键成果的证明材料"}
                。
              </p>
              <AIAction
                task="拆解 JD，逐项说明与档案的匹配、硬性条件的不确定性、切入建议与证据缺口。"
                data={{ jd, profile: state.profile }}
                mock={
                  "【本地模拟建议】\n优先使用已有经历说明职责匹配；对于 " +
                  (a.matches
                    .filter((m) => m.status !== "命中")
                    .map((m) => m.word)
                    .join("、") || "硬性条件") +
                  "，需要补充真实证据。"
                }
                onResult={setSuggestion}
              />
              {suggestion && <pre className="plain-output">{suggestion}</pre>}
              <details>
                <summary>查看 JD 原文</summary>
                <pre className="plain-output">{jd.raw}</pre>
              </details>
            </Panel>
          ) : (
            <Empty title="选择一份 JD 查看拆解">
              <p>本地分析无需 API Key。</p>
            </Empty>
          )}
        </div>
      </div>
      {editing && (
        <Modal title="编辑岗位描述" onClose={() => setEditing(null)}>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await update((s) => ({
                  ...s,
                  jds: s.jds.some((j) => j.id === editing.id)
                    ? s.jds.map((j) => (j.id === editing.id ? editing : j))
                    : [...s.jds, editing],
                }));
                setSelected(editing.id);
                setEditing(null);
              });
            }}
          >
            <Field label="JD 原文">
              <textarea
                required
                rows={9}
                value={editing.raw}
                onChange={(e) =>
                  setEditing({ ...editing, raw: e.target.value })
                }
              />
            </Field>
            <Button
              variant="secondary"
              onClick={() => {
                const get = (name: string) =>
                  editing.raw.match(
                    new RegExp(
                      "(?:^|\\n)\\s*(?:" + name + ")[：:]\\s*([^\\n]+)",
                    ),
                  )?.[1] || "";
                setEditing({
                  ...editing,
                  title: get("岗位|职位|岗位名称") || editing.title,
                  company: get("公司|公司名称") || editing.company,
                  city: get("地点|城市|工作地点") || editing.city,
                });
              }}
            >
              从原文提取基础字段
            </Button>
            {(
              [
                ["title", "岗位名称"],
                ["company", "公司"],
                ["city", "地点"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  required={key === "title"}
                  value={editing[key]}
                  onChange={(e) =>
                    setEditing({ ...editing, [key]: e.target.value })
                  }
                />
              </Field>
            ))}
            <p className="helper">
              支持“岗位：… / 公司：… / 地点：…”格式；未识别字段请手工填写。
            </p>
            <Button type="submit">保存并拆解</Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Resumes({ state, update, run }: Props) {
  const [jdId, setJdId] = useState(state.jds[0]?.id || ""),
    [content, setContent] = useState(""),
    [title, setTitle] = useState(""),
    [selected, setSelected] = useState(""),
    [baseId, setBaseId] = useState("");
  const baseText =
    state.profile.originals.find((o) => o.id === baseId)?.text ??
    state.profile.original;
  const baseProfile = { ...state.profile, original: baseText };
  const jd = state.jds.find((j) => j.id === jdId),
    a = jd ? analyzeJD(jd, baseProfile) : null;
  return (
    <div className="space-y-6">
      <div className="toolbar wrap">
        <Field label="目标 JD">
          <select
            value={jdId}
            onChange={(e) => {
              setJdId(e.target.value);
              setContent("");
              setSelected("");
            }}
          >
            <option value="">选择岗位描述</option>
            {state.jds.map((j) => (
              <option key={j.id} value={j.id}>
                {j.company} · {j.title}
              </option>
            ))}
          </select>
        </Field>
        <Field label="基础简历">
          <select
            aria-label="基础简历"
            value={baseId}
            onChange={(e) => {
              setBaseId(e.target.value);
              setContent("");
              setSelected("");
            }}
          >
            <option value="">当前保存的原始简历</option>
            {state.profile.originals.map((o, i) => (
              <option key={o.id} value={o.id}>
                原文历史 {i + 1} · {new Date(o.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </Field>
        {jd && (
          <Button
            disabled={!baseText}
            onClick={() => {
              setContent(rewriteResume(jd, baseProfile));
              setTitle(jd.title + " · 定制版");
              setSelected("");
            }}
          >
            <Sparkles size={16} />
            生成本地建议版
          </Button>
        )}
      </div>
      {!baseText && <div className="notice">请先在“认识我”保存基础简历。</div>}
      <div className="resume-grid">
        <Panel title="原简历 · 只读">
          <pre className="resume-document">
            {baseText || "尚未保存原始简历"}
          </pre>
        </Panel>
        <Panel title="JD 要求与匹配">
          <div className="resume-document">
            {jd && a ? (
              <>
                <h3>{jd.title}</h3>
                <p>{jd.raw}</p>
                <h4>命中与缺口</h4>
                {a.matches.map((m) => (
                  <p key={m.word}>
                    <Tag tone={m.status === "命中" ? "green" : "amber"}>
                      {m.status}
                    </Tag>{" "}
                    {m.word}
                  </p>
                ))}
                <p className="helper">
                  无证据的内容必须补充核实，不可改写成已具备的经历。
                </p>
              </>
            ) : (
              <p>先选择一份 JD。</p>
            )}
          </div>
        </Panel>
        <Panel title="建议改写版 · 可编辑">
          <textarea
            className="resume-document editor"
            aria-label="建议改写版"
            placeholder="生成建议后，在这里逐句核对并编辑…"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </Panel>
      </div>
      {jd && baseText && (
        <AIAction
          task="针对 JD 重组润色基础简历。只能使用原文和证据库中已有事实；无法证明的内容逐项写需要补充。不要新增技能、经历或业绩。"
          data={{
            jd,
            original: baseText,
            evidence: state.profile.evidence,
          }}
          mock={rewriteResume(jd, baseProfile)}
          onResult={(text) => {
            setContent(text);
            setTitle(jd.title + " · AI 建议版");
            setSelected("");
          }}
          label="生成 AI 改写建议"
        />
      )}
      <div className="toolbar wrap">
        <input
          aria-label="版本名称"
          placeholder="版本名称"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Button
          disabled={!content.trim() || !jd || !title.trim()}
          onClick={() =>
            run(
              () =>
                update((s) => ({
                  ...s,
                  versions: [
                    ...s.versions,
                    {
                      id: uid(),
                      jdId,
                      title,
                      content,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                })),
              "已另存为新版本",
            )
          }
        >
          保存新版本
        </Button>
        <Button
          variant="secondary"
          disabled={!content.trim()}
          onClick={() => download("resume.txt", content)}
        >
          <Download size={15} />
          TXT
        </Button>
        <Button
          variant="secondary"
          disabled={!content.trim()}
          onClick={() =>
            download("resume.md", content, "text/markdown;charset=utf-8")
          }
        >
          <Download size={15} />
          Markdown
        </Button>
      </div>
      <Panel title="已保存的简历版本">
        {state.versions.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>版本名称</th>
                  <th>目标岗位 / 关联 JD</th>
                  <th>创建时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {state.versions.map((v) => (
                  <tr key={v.id}>
                    <td>
                      {v.title}
                      {selected === v.id && <Tag>编辑中</Tag>}
                    </td>
                    <td>
                      {state.jds.find((j) => j.id === v.jdId)?.title ||
                        "原 JD 已删除"}
                    </td>
                    <td>{new Date(v.createdAt).toLocaleString()}</td>
                    <td>
                      <div className="actions">
                        <button
                          className="text-btn"
                          onClick={() => {
                            setContent(v.content);
                            setTitle(v.title);
                            setJdId(v.jdId);
                            setSelected(v.id);
                          }}
                        >
                          载入
                        </button>
                        <button
                          className="icon-btn danger-text"
                          aria-label="删除简历版本"
                          onClick={() => {
                            if (
                              confirm(
                                "删除该版本？投递记录保留，关联版本字段会清空。",
                              )
                            )
                              void run(() =>
                                update((s) => ({
                                  ...s,
                                  versions: s.versions.filter(
                                    (x) => x.id !== v.id,
                                  ),
                                  applications: s.applications.map((x) =>
                                    x.resumeId === v.id
                                      ? { ...x, resumeId: "" }
                                      : x,
                                  ),
                                })),
                              );
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="还没有定制版本">
            <p>生成、核对、保存，让每份简历都有明确目标。</p>
          </Empty>
        )}
      </Panel>
    </div>
  );
}
function Board({ state, update, run }: Props) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [editing, setEditing] = useState<Application | null>(null),
    [dragging, setDragging] = useState("");
  const list = state.applications.filter(
    (a) =>
      (a.company + a.role + a.city + a.notes)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!filter || a.status === filter),
  );
  const move = (id: string, status: Application["status"]) =>
    run(
      () =>
        update((s) => ({
          ...s,
          applications: s.applications.map((a) =>
            a.id === id ? { ...a, status } : a,
          ),
        })),
      "状态已更新",
    );
  return (
    <div className="space-y-6">
      <div className="toolbar wrap">
        <div className="search-box">
          <Search size={17} />
          <input
            aria-label="搜索投递"
            placeholder="搜索公司、岗位、城市…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="筛选投递状态"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">所有状态</option>
          {statuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="muted grow">{list.length} 个机会</span>
        <Button
          onClick={() =>
            setEditing({
              id: uid(),
              company: "",
              role: "",
              city: "",
              source: "",
              date: today(),
              jdId: "",
              resumeId: "",
              followUp: "",
              interviewAt: "",
              notes: "",
              status: "待投递",
            })
          }
        >
          <Plus size={16} />
          新增投递
        </Button>
      </div>
      <div className="notice">
        拖动卡片即可流转；手机或键盘操作可使用卡片底部的状态菜单。
      </div>
      <div className="kanban">
        {statuses
          .filter((s) => !filter || s === filter)
          .map((status) => {
            const i = statuses.indexOf(status);
            const cards = list.filter((a) => a.status === status);
            return (
              <section
                key={status}
                className={"kanban-column " + (dragging ? "drop-ready" : "")}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (state.applications.some((a) => a.id === id))
                    void move(id, status);
                  setDragging("");
                }}
              >
                <div className="column-head">
                  <i className={"status-dot color-" + i} />
                  <h2>{status}</h2>
                  <span>{cards.length}</span>
                </div>
                <div className="column-body">
                  {cards.map((a) => (
                    <article
                      className="job-card"
                      key={a.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", a.id);
                        setDragging(a.id);
                      }}
                      onDragEnd={() => setDragging("")}
                    >
                      <button
                        className="job-open"
                        onClick={() => setEditing(a)}
                      >
                        <div className={"company-icon color-" + i}>
                          {a.company.slice(0, 1)}
                        </div>
                        <strong>{a.company}</strong>
                        <h3>{a.role}</h3>
                        <p>
                          {a.city || "城市待定"} · {a.source || "来源待补充"}
                        </p>
                        <div className="tags">
                          {a.jdId && <Tag>关联 JD</Tag>}
                          {a.resumeId && <Tag>定制简历</Tag>}
                        </div>
                        {a.followUp && (
                          <small className={a.followUp <= today() ? "due" : ""}>
                            <CalendarDays size={13} />
                            {a.followUp} 跟进
                          </small>
                        )}
                      </button>
                      <select
                        aria-label={`${a.company}状态`}
                        value={a.status}
                        onChange={(e) =>
                          void move(
                            a.id,
                            e.target.value as Application["status"],
                          )
                        }
                      >
                        {statuses.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </article>
                  ))}
                  {!cards.length && (
                    <div className="column-empty">
                      暂无记录
                      <br />
                      <small>把新的机会放在这里</small>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
      </div>
      {editing && (
        <Modal
          title={
            state.applications.some((a) => a.id === editing.id)
              ? "编辑投递记录"
              : "新增投递记录"
          }
          onClose={() => setEditing(null)}
        >
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await update((s) => ({
                  ...s,
                  applications: s.applications.some((a) => a.id === editing.id)
                    ? s.applications.map((a) =>
                        a.id === editing.id ? editing : a,
                      )
                    : [...s.applications, editing],
                }));
                setEditing(null);
              });
            }}
          >
            <div className="form-grid grid-2">
              {(
                [
                  ["company", "公司", "text"],
                  ["role", "岗位", "text"],
                  ["city", "城市", "text"],
                  ["source", "来源", "text"],
                  ["date", "投递日期", "date"],
                  ["followUp", "下次跟进日期", "date"],
                  ["interviewAt", "面试时间", "datetime-local"],
                ] as const
              ).map(([key, label, type]) => (
                <Field key={key} label={label}>
                  <input
                    type={type}
                    required={key === "company" || key === "role"}
                    value={editing[key]}
                    onChange={(e) =>
                      setEditing({ ...editing, [key]: e.target.value })
                    }
                  />
                </Field>
              ))}
              <Field label="状态">
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      status: e.target.value as Application["status"],
                    })
                  }
                >
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="关联 JD">
                <select
                  value={editing.jdId}
                  onChange={(e) =>
                    setEditing({ ...editing, jdId: e.target.value })
                  }
                >
                  <option value="">不关联</option>
                  {state.jds.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.company} · {j.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="关联简历版本">
                <select
                  value={editing.resumeId}
                  onChange={(e) =>
                    setEditing({ ...editing, resumeId: e.target.value })
                  }
                >
                  <option value="">不关联</option>
                  {state.versions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="备注">
              <textarea
                value={editing.notes}
                onChange={(e) =>
                  setEditing({ ...editing, notes: e.target.value })
                }
              />
            </Field>
            <div className="actions">
              <Button type="submit">保存记录</Button>
              {state.applications.some((a) => a.id === editing.id) && (
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirm("永久删除这条投递记录？"))
                      void run(async () => {
                        await update((s) => ({
                          ...s,
                          applications: s.applications.filter(
                            (a) => a.id !== editing.id,
                          ),
                        }));
                        setEditing(null);
                      });
                  }}
                >
                  删除记录
                </Button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Practice({ state, update, run }: Props) {
  const [jdId, setJdId] = useState(state.jds[0]?.id || ""),
    [role, setRole] = useState(
      state.jds[0]?.title || state.profile.goals || "",
    ),
    [selected, setSelected] = useState(state.sessions[0]?.id || ""),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [category, setCategory] = useState("");
  const session = state.sessions.find((s) => s.id === selected),
    jd = state.jds.find((j) => j.id === jdId);
  return (
    <div className="space-y-6">
      <Panel title="开始一次有准备的练习">
        <div className="toolbar wrap">
          <Field label="目标岗位">
            <input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="如：产品经理"
            />
          </Field>
          <Field label="关联 JD">
            <select value={jdId} onChange={(e) => setJdId(e.target.value)}>
              <option value="">通用练习</option>
              {state.jds.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title} · {j.company}
                </option>
              ))}
            </select>
          </Field>
          <Button
            disabled={!role.trim()}
            onClick={() =>
              run(async () => {
                const id = uid();
                await update((s) => ({
                  ...s,
                  sessions: [
                    {
                      id,
                      jdId,
                      role,
                      createdAt: new Date().toISOString(),
                      status: "面试中",
                      questions: catalog.questions.map((q) => ({
                        id: uid(),
                        category: q.category,
                        text: q.text
                          .replace("{role}", role)
                          .replace(
                            "{requirement}",
                            jd
                              ? analyzeJD(jd, state.profile).requirements[0] ||
                                  jd.title
                              : "核心职责",
                          ),
                        answer: "",
                        improve: false,
                        feedback: "",
                      })),
                    },
                    ...s.sessions,
                  ],
                }));
                setSelected(id);
                setAnswers({});
              }, "已创建面试中记录")
            }
          >
            开始练习
            <ArrowRight size={16} />
          </Button>
        </div>
      </Panel>
      <div className="master-detail">
        <div className="space-y-6">
          <Panel title="练习记录">
            <div className="selection-list">
              {state.sessions.map((s) => (
                <button
                  className={selected === s.id ? "selected" : ""}
                  key={s.id}
                  onClick={() => {
                    setSelected(s.id);
                    setAnswers({});
                  }}
                >
                  <strong>{s.role}</strong>
                  <small>
                    {new Date(s.createdAt).toLocaleDateString()} · {s.status}
                  </small>
                </button>
              ))}
              {!state.sessions.length && (
                <p className="muted">开始后自动创建记录。</p>
              )}
            </div>
          </Panel>
          <Panel title={`我的题库 · ${state.questionBank.length}`}>
            <div className="question-bank">
              {state.questionBank.map((q) => (
                <div key={q.id}>
                  <Tag>{q.category}</Tag>
                  <p>{q.text}</p>
                  {session && (
                    <button
                      className="text-btn"
                      onClick={() =>
                        run(() =>
                          update((s) => ({
                            ...s,
                            sessions: s.sessions.map((x) =>
                              x.id === session.id
                                ? {
                                    ...x,
                                    questions: [
                                      ...x.questions,
                                      {
                                        ...q,
                                        id: uid(),
                                        answer: "",
                                        feedback: "",
                                        improve: false,
                                      },
                                    ],
                                  }
                                : x,
                            ),
                          })),
                        )
                      }
                    >
                      加入本次练习
                    </button>
                  )}
                  <button
                    className="icon-btn"
                    aria-label="删除题库题目"
                    onClick={() => {
                      if (confirm("从题库删除该题？"))
                        void run(() =>
                          update((s) => ({
                            ...s,
                            questionBank: s.questionBank.filter(
                              (x) => x.id !== q.id,
                            ),
                          })),
                        );
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {!state.questionBank.length && (
                <p className="muted">练习中的题目可保存到这里。</p>
              )}
            </div>
          </Panel>
        </div>
        <div>
          {session ? (
            <Panel
              title={session.role + " · " + session.status}
              action={
                <Button
                  variant="secondary"
                  disabled={session.status === "已完成"}
                  onClick={() =>
                    run(() =>
                      update((s) => ({
                        ...s,
                        sessions: s.sessions.map((x) =>
                          x.id === session.id ? { ...x, status: "已完成" } : x,
                        ),
                      })),
                    )
                  }
                >
                  结束练习
                </Button>
              }
            >
              <select
                className="mb-5"
                aria-label="题目分类"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">所有题型</option>
                {catalog.questions.map((q) => (
                  <option key={q.category}>{q.category}</option>
                ))}
              </select>
              {session.questions
                .filter((q) => !category || q.category === category)
                .map((q, i) => (
                  <div className="practice-question" key={q.id}>
                    <div className="panel-head">
                      <Tag>{q.category}</Tag>
                      <button
                        className="text-btn"
                        disabled={state.questionBank.some(
                          (x) => x.text === q.text,
                        )}
                        onClick={() =>
                          run(() =>
                            update((s) => ({
                              ...s,
                              questionBank: s.questionBank.some(
                                (x) => x.text === q.text,
                              )
                                ? s.questionBank
                                : [
                                    ...s.questionBank,
                                    {
                                      ...q,
                                      id: uid(),
                                      answer: "",
                                      feedback: "",
                                    },
                                  ],
                            })),
                          )
                        }
                      >
                        保存到题库
                      </button>
                    </div>
                    <h3>
                      {String(i + 1).padStart(2, "0")} / {q.text}
                    </h3>
                    <textarea
                      rows={5}
                      aria-label={q.category + "回答"}
                      placeholder="写下你的回答：背景、任务、行动、结果…"
                      value={answers[q.id] ?? q.answer}
                      onChange={(e) =>
                        setAnswers({ ...answers, [q.id]: e.target.value })
                      }
                    />
                    <div className="toolbar wrap">
                      <Button
                        variant="secondary"
                        onClick={() =>
                          run(() =>
                            update((s) => ({
                              ...s,
                              sessions: s.sessions.map((x) =>
                                x.id === session.id
                                  ? {
                                      ...x,
                                      questions: x.questions.map((t) =>
                                        t.id === q.id
                                          ? {
                                              ...t,
                                              answer: answers[q.id] ?? q.answer,
                                            }
                                          : t,
                                      ),
                                    }
                                  : x,
                              ),
                            })),
                          )
                        }
                      >
                        保存回答
                      </Button>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          checked={q.improve}
                          onChange={() =>
                            run(() =>
                              update((s) => ({
                                ...s,
                                sessions: s.sessions.map((x) =>
                                  x.id === session.id
                                    ? {
                                        ...x,
                                        questions: x.questions.map((t) =>
                                          t.id === q.id
                                            ? { ...t, improve: !t.improve }
                                            : t,
                                        ),
                                      }
                                    : x,
                                ),
                              })),
                            )
                          }
                        />
                        标记待改进
                      </label>
                    </div>
                    <AIAction
                      task="从结构、证据、岗位关联、表达风险、改进建议五个维度反馈回答，不要虚构候选人事实。"
                      data={{
                        question: q.text,
                        answer: answers[q.id] ?? q.answer,
                        jd: state.jds.find((j) => j.id === session.jdId),
                        role: session.role,
                      }}
                      mock={feedback(answers[q.id] ?? q.answer)}
                      label="获取回答反馈"
                      onResult={(text) =>
                        void run(() =>
                          update((s) => ({
                            ...s,
                            sessions: s.sessions.map((x) =>
                              x.id === session.id
                                ? {
                                    ...x,
                                    questions: x.questions.map((t) =>
                                      t.id === q.id
                                        ? {
                                            ...t,
                                            feedback: text,
                                            answer: answers[q.id] ?? q.answer,
                                          }
                                        : t,
                                    ),
                                  }
                                : x,
                            ),
                          })),
                        )
                      }
                    />
                    {q.feedback && (
                      <pre className="plain-output">{q.feedback}</pre>
                    )}
                  </div>
                ))}
            </Panel>
          ) : (
            <Empty title="为下一场面试热身">
              <p>选择岗位后开始，五类问题会自动生成并保存。</p>
            </Empty>
          )}
        </div>
      </div>
    </div>
  );
}
function SettingsPage({
  state,
  update,
  run,
  onClear,
}: Props & { onClear: () => Promise<void> }) {
  const [config, setConfig] = useState<AIConfig>(readConfig),
    [show, setShow] = useState(false),
    [imported, setImported] = useState<State | null>(null),
    [csv, setCsv] = useState(false),
    [test, setTest] = useState("");
  const preview = async (f: File) => {
    if (f.size > 10_000_000) throw new Error("文件不能超过 10 MB");
    const isCsv = f.name.toLowerCase().endsWith(".csv");
    setImported(parseImport(await f.text(), isCsv));
    setCsv(isCsv);
  };
  return (
    <div className="space-y-6">
      <div className="two-col">
        <Panel
          title="AI 接口配置"
          action={<Tag>{config.key ? "自有 Key" : "本地模拟模式"}</Tag>}
        >
          <div className="notice">
            只有主动使用 AI 并确认发送时，相关文本才会直接传给你配置的服务商。无
            Key 也能使用全部本地功能。
          </div>
          <form
            className="form-grid"
            onSubmit={(e) => {
              e.preventDefault();
              void run(
                async () => saveConfig(config),
                "AI 配置已保存在当前浏览器",
              );
            }}
          >
            <Field label="Base URL">
              <input
                type="url"
                required
                value={config.baseUrl}
                onChange={(e) =>
                  setConfig({ ...config, baseUrl: e.target.value })
                }
              />
            </Field>
            <Field label="模型名称">
              <input
                required
                value={config.model}
                onChange={(e) =>
                  setConfig({ ...config, model: e.target.value })
                }
              />
            </Field>
            <Field label="API Key">
              <input
                type={show ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder="留空使用本地模拟"
                value={config.key}
                onChange={(e) => setConfig({ ...config, key: e.target.value })}
              />
            </Field>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={show}
                onChange={(e) => setShow(e.target.checked)}
              />
              显示 Key
            </label>
            <div className="actions wrap">
              <Button type="submit">保存配置</Button>
              <Button
                variant="secondary"
                onClick={() =>
                  run(async () => {
                    setConfig({ ...config, key: "" });
                    localStorage.removeItem("career-desk-ai");
                  }, "已移除保存的 AI 配置")
                }
              >
                移除 Key
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  run(async () => {
                    if (
                      config.key &&
                      !confirm(
                        "向配置的服务商发送一句测试问候以验证连接？可能产生少量费用。",
                      )
                    )
                      return;
                    setTest("正在测试…");
                    try {
                      setTest(
                        await askAI(
                          "用中文回复连接成功。",
                          { message: "你好" },
                          "【本地模拟】未配置 Key，本地模式可用。",
                          config,
                        ),
                      );
                    } catch (e) {
                      setTest("测试未通过");
                      throw e;
                    }
                  }, "测试完成")
                }
              >
                测试连接
              </Button>
            </div>
            {test && <pre className="plain-output">{test}</pre>}
          </form>
          <p className="helper">
            Base URL 例如 https://api.example.com/v1，自动追加
            /chat/completions。Key 以明文保存在此浏览器的
            localStorage，页面脚本与浏览器扩展可能读取；只在可信设备使用，建议设置低额度并定期轮换。不会写入代码或备份。
          </p>
        </Panel>
        <Panel title="数据管理" action={<Database size={19} />}>
          <div className="data-action">
            <div>
              <h3>备份你的工作空间</h3>
              <p>
                导出档案、JD、简历版本、投递、待办、题库与练习；不含 AI 配置。
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                download(
                  `job-agent-backup-${today()}.json`,
                  JSON.stringify(state, null, 2),
                  "application/json",
                )
              }
            >
              <Download size={16} />
              导出全部数据
            </Button>
          </div>
          <div className="data-action">
            <div>
              <h3>恢复备份 / 导入投递</h3>
              <p>
                JSON 使用本应用备份格式；CSV
                追加投递记录。导入前会预览，不会直接覆盖。
              </p>
            </div>
            <label className="btn secondary">
              <Upload size={16} />
              选择 JSON / CSV
              <input
                type="file"
                accept=".json,.csv"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void run(() => preview(f), "文件已校验，请预览并确认");
                  e.target.value = "";
                }}
              />
            </label>
            <button
              className="text-btn"
              onClick={() =>
                download(
                  "applications-template.csv",
                  "company,role,city,source,date,status,followUp,interviewAt,notes\n示例公司,产品经理,杭州,官网,2026-09-30,待投递,,,示例记录",
                  "text/csv;charset=utf-8",
                )
              }
            >
              下载 CSV 模板
              <Download size={14} />
            </button>
          </div>
          <div className="data-action">
            <div>
              <h3>体验演示数据</h3>
              <p>
                使用完全虚构的档案和投递记录。会替换现有工作空间，请先备份。
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                if (confirm("载入演示会替换全部个人数据。已备份并确认继续？"))
                  void run(() => update(() => demoState()), "演示数据已载入");
              }}
            >
              载入演示数据
            </Button>
          </div>
          <div className="data-action">
            <div>
              <h3 className="danger-text">清空全部本地数据</h3>
              <p>
                删除本应用的个人数据和 AI 配置，不影响其他站点。此操作无法撤销。
              </p>
            </div>
            <Button
              variant="danger"
              onClick={() => {
                if (
                  confirm(
                    "确认清空所有档案、投递、练习和 API Key？请先导出备份。",
                  )
                )
                  void run(async () => {
                    await onClear();
                    setConfig(readConfig());
                    setImported(null);
                    setTest("");
                  }, "全部本地数据已清空");
              }}
            >
              <Trash2 size={16} />
              清空全部数据
            </Button>
          </div>
        </Panel>
      </div>
      <Panel title="隐私与使用边界">
        <div className="grid-2 form-grid">
          <div>
            <h3>数据默认不离开浏览器</h3>
            <p>
              个人资料保存在
              IndexedDB。不同设备、浏览器和网站域名的数据相互独立。清除站点数据、使用隐私模式或更换域名可能导致资料不可访问，请定期导出备份。
            </p>
          </div>
          <div>
            <h3>AI 输出必须人工核实</h3>
            <p>
              JD
              与简历作为不可信数据输入，提示模型忽略其中的指令。应用不执行模型返回的代码或
              HTML，不自动投递、不登录招聘网站、不抓取数据。模型仍可能产生不准确内容，投递前务必逐句核对。
            </p>
          </div>
        </div>
      </Panel>
      {imported && (
        <Modal
          title={csv ? "预览 CSV 投递导入" : "预览 JSON 备份恢复"}
          onClose={() => setImported(null)}
        >
          <div className="notice">
            {csv
              ? "确认后追加投递记录，现有资料保留。"
              : "确认后替换所有个人数据，API 配置保持不变。建议先导出当前备份。"}
          </div>
          <div className="import-counts">
            <p>档案：{imported.profile.name || "无"}</p>
            <p>
              {imported.jds.length} 份 JD · {imported.versions.length}{" "}
              个简历版本
            </p>
            <p>
              {imported.applications.length} 条投递 · {imported.sessions.length}{" "}
              次练习
            </p>
            <p>
              {imported.tasks.length} 条待办 · {imported.questionBank.length}{" "}
              道题库题目
            </p>
          </div>
          <pre className="plain-output">
            {JSON.stringify(
              {
                profile: imported.profile,
                applications: imported.applications.slice(0, 5),
              },
              null,
              2,
            ).slice(0, 6000)}
          </pre>
          <Button
            onClick={() =>
              run(async () => {
                await update((s) =>
                  csv
                    ? {
                        ...s,
                        applications: [
                          ...s.applications,
                          ...imported.applications,
                        ],
                      }
                    : imported,
                );
                setImported(null);
              }, "数据导入完成")
            }
          >
            确认{csv ? "追加投递" : "替换并恢复"}
          </Button>
        </Modal>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { type JD, type Profile, jdSchema } from "./model";
import { topJobs, type MatchMode } from "./matching";
import { safeJobUrl } from "./jd-schema";
export default function TopJobRecommendations({
  profile,
  jobs,
  onOpen,
}: {
  profile: Profile;
  jobs: JD[];
  onOpen: (jd: JD) => void;
}) {
  const [library, setLibrary] = useState<JD[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [mode, setMode] = useState<MatchMode>("general");
  useEffect(() => {
    let active = true;
    import("./data/structured-jobs.json")
      .then((m) => {
        const data = jdSchema.array().parse(m.default);
        if (active) setLibrary(data);
      })
      .catch(() => {
        if (active) setError("岗位库载入失败，请刷新重试。");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const combined = useMemo(
    () => [...jobs, ...library.filter((j) => !jobs.some((p) => p.id === j.id))],
    [jobs, library],
  );
  const ranked = useMemo(
    () => topJobs(combined, profile, mode),
    [combined, profile, mode],
  );
  const hasProfile = Boolean(
    profile.original.trim() ||
    profile.experience.trim() ||
    profile.skills.length,
  );
  return (
    <section className="panel recommendations">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">PROFILE TO OPPORTUNITY</div>
          <h2>最匹配的 3 个岗位</h2>
          <p>
            结构化岗位库 {library.length} 条 · 我的 JD {jobs.length} 条
          </p>
        </div>
        <div className="segmented" role="group" aria-label="匹配类型">
          {(["general", "direct"] as const).map((m) => (
            <button
              key={m}
              aria-pressed={m === mode}
              onClick={() => setMode(m)}
            >
              {m === "general" ? "General · 能力探索" : "Direct · 逐项匹配"}
            </button>
          ))}
        </div>
      </div>
      <p className="helper">
        {mode === "general"
          ? "General：按可迁移能力关键词覆盖率寻找值得探索的岗位。"
          : "Direct：逐条比较真实职责、专业、技能及经历要求，未覆盖条目也纳入分母。"}{" "}
        两类均为本地文本匹配建议，不证明同岗经历或满足招聘条件。
      </p>
      {loading ? (
        <p role="status">正在读取结构化岗位库…</p>
      ) : error ? (
        <p role="alert">{error}</p>
      ) : !hasProfile ? (
        <p>请先在“认识我”保存简历与档案，再生成推荐。</p>
      ) : !ranked.length ? (
        <p>
          暂无有证据的匹配结果。请补全真实经历与技能；不会用零分岗位凑足 3 个。
        </p>
      ) : (
        <div className="recommendation-grid">
          {ranked.map(({ jd, match }, i) => (
            <article
              className="recommendation-card"
              key={jd.id}
              data-testid="top-job"
            >
              <div className="toolbar">
                <span className="tag">0{i + 1}</span>
                <strong className="score-pill">
                  {match.score}
                  <small>%</small>
                </strong>
              </div>
              <h3>{jd.title}</h3>
              <p>
                {jd.company || "公司待补充"} · {jd.city || "地点待补充"}
              </p>
              <div className="tags">
                {match.hits.slice(0, 6).map((w) => (
                  <span className="tag green" key={w}>
                    {w}
                  </span>
                ))}
              </div>
              <p className="helper">{match.basis}。关键词不等于能力证明。</p>
              <details>
                <summary>评分依据与待核实条件</summary>
                <p>
                  证据词：{match.hits.join("、") || "暂无"}；仅登记：
                  {match.partial.join("、") || "无"}。
                </p>
                <p>需补充：{match.gaps.join("、") || "真实成果证明"}。</p>
                {match.criteria.map((r, k) => (
                  <p key={k}>
                    {r.text}
                    <br />
                    <small>
                      经历词：{r.hits.join("、") || "暂无"}；覆盖{" "}
                      {Math.round(r.value * 100)}%
                    </small>
                  </p>
                ))}
                {match.gates.map((g) => (
                  <p key={g}>待核实 · {g}</p>
                ))}
                <p>
                  未推断学历、年限或证书已满足。求职目标不作为已有经历计分。
                </p>
              </details>
              <div className="actions wrap">
                <button className="btn secondary" onClick={() => onOpen(jd)}>
                  {jobs.some((j) => j.id === jd.id)
                    ? "查看拆解"
                    : "加入 JD 并查看"}
                </button>
                {safeJobUrl(jd.structured?.job_facts.job_url || null) && (
                  <a
                    className="text-btn"
                    href={jd.structured!.job_facts.job_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    来源链接
                  </a>
                )}
              </div>
              <small className="helper">
                {jd.source || "我的 JD"} · 招聘状态待核实
              </small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

import type { Application } from "./model";
const localDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const valid = (text: string) => {
  const d = new Date(text);
  return Number.isFinite(d.getTime()) ? d : null;
};
export function getApplicationTimeLabels(a: Application, now = new Date()) {
  const labels: string[] = [],
    events: {
      type: "follow-up" | "interview";
      at: string;
      application: Application;
    }[] = [];
  if (a.status === "结束") return { labels: ["已结束"], next: null, events };
  if (a.followUp && valid(a.followUp + "T00:00:00")) {
    labels.push(
      a.followUp < localDay(now)
        ? "跟进已逾期"
        : a.followUp === localDay(now)
          ? "今日跟进"
          : "待跟进",
    );
    events.push({
      type: "follow-up",
      at: a.followUp + "T00:00",
      application: a,
    });
  }
  if (a.interviewAt && valid(a.interviewAt)) {
    const d = valid(a.interviewAt)!;
    labels.push(
      d < now
        ? "面试时间已过"
        : localDay(d) === localDay(now)
          ? "今日面试"
          : "待面试",
    );
    events.push({ type: "interview", at: a.interviewAt, application: a });
  }
  const next =
    events
      .filter((e) =>
        e.type === "follow-up"
          ? e.at.slice(0, 10) >= localDay(now)
          : valid(e.at)! >= now,
      )
      .sort((a, b) => a.at.localeCompare(b.at))[0] || null;
  return { labels, next, events };
}
export function detectScheduleConflicts(applications: Application[]) {
  const results: {
    ids: string[];
    kind: "conflict" | "close" | "follow-ups";
    message: string;
  }[] = [];
  const active = applications.filter((a) => a.status !== "结束");
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++) {
      const a = active[i],
        b = active[j],
        at = valid(a.interviewAt),
        bt = valid(b.interviewAt);
      if (!at || !bt) continue;
      const minutes = Math.abs(+at - +bt) / 60000;
      if (minutes === 0)
        results.push({
          ids: [a.id, b.id],
          kind: "conflict",
          message: "时间冲突：面试开始时间完全相同",
        });
      else if (localDay(at) === localDay(bt) && minutes < 60)
        results.push({
          ids: [a.id, b.id],
          kind: "close",
          message: "安排过近，请确认：同日面试开始时间相隔不足 60 分钟",
        });
    }
  const days = new Map<string, string[]>();
  for (const a of active)
    if (a.followUp && valid(a.followUp + "T00:00:00"))
      days.set(a.followUp, [...(days.get(a.followUp) || []), a.id]);
  for (const [day, ids] of days)
    if (ids.length > 1)
      results.push({
        ids,
        kind: "follow-ups",
        message: `${day} 当日有多个跟进任务`,
      });
  return results;
}
export function upcomingSchedule(
  applications: Application[],
  now = new Date(),
) {
  const end = new Date(now);
  end.setDate(end.getDate() + 7);
  return applications
    .flatMap((a) => getApplicationTimeLabels(a, now).events)
    .filter((e) =>
      e.type === "follow-up"
        ? e.at.slice(0, 10) >= localDay(now) &&
          e.at.slice(0, 10) < localDay(end)
        : valid(e.at)! >= now && valid(e.at)! < end,
    )
    .sort((a, b) => a.at.localeCompare(b.at));
}

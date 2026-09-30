import { describe, it, expect } from "vitest";
import { extractJDFields, parseJobRows, rankJobs, uniqueJobs } from "./jobs";
import { demoState } from "./demo";
import { stateSchema, emptyState } from "./model";
import { parseImport } from "./logic";
import { openDB } from "idb";
import { readState, clearState } from "./storage";
import "fake-indexeddb/auto";
describe("JD 提取回归", () => {
  it.each([
    "岗位：数据分析师\n公司：示例公司\n地点：上海",
    "## 职位名称\n数据分析师\n公司名称\n示例公司\n工作地点\n上海",
    "**招聘职位：** 数据分析师 | **企业名称：** 示例公司 | **工作城市：** 上海",
    "Job title: 数据分析师 Company: 示例公司 Location: 上海",
    "【岗位名称】数据分析师\n【公司】示例公司\n【工作地点】上海",
  ])("支持常见格式 %s", (raw) => {
    expect(extractJDFields(raw).fields).toEqual({
      title: "数据分析师",
      company: "示例公司",
      city: "上海",
    });
  });
  it("无法识别时明确报告缺失，不生成空值覆盖已有字段", () => {
    const r = extractJDFields("任职要求：熟悉 SQL\n岗位职责：数据处理");
    expect(r.fields).toEqual({});
    expect(r.missing).toHaveLength(3);
  });
  it("首行职位为推测，不能把职责当作岗位名称", () => {
    expect(
      extractJDFields("数据分析师\n岗位职责：数据处理").inferred,
    ).toHaveLength(1);
    expect(extractJDFields("岗位职责：数据处理").fields.title).toBeUndefined();
  });
});
describe("结构化岗位和排序", () => {
  it("中文表头转换为 JD，支持预览与去重", () => {
    const p = parseJobRows(
      [
        ["岗位名称", "公司", "任职要求"],
        ["分析师", "某公司", "SQL"],
      ],
      "Excel",
    );
    expect(p.errors).toEqual([]);
    expect(p.jobs[0].raw).toContain("任职要求：SQL");
    expect(uniqueJobs(p.jobs, p.jobs)).toEqual([]);
  });
  it("错误行不能静默丢弃", () => {
    const p = parseJobRows(
      [
        ["role", "skills"],
        ["数据分析师", "SQL"],
        ["", "React"],
      ],
      "CSV",
    );
    expect(p.errors[0]).toContain("第 3 行");
    expect(p.jobs).toHaveLength(1);
  });
  it("缺失必需表头被拒绝", () => {
    expect(() => parseJobRows([["公司"], ["测试"]], "CSV")).toThrow("岗位名称");
    expect(() => parseJobRows([["岗位名称"], ["分析师"]], "CSV")).toThrow(
      "至少需要",
    );
  });
  it("最高匹配置顶，档案更改后重新排序，输入顺序不被修改", () => {
    const jobs = parseJobRows(
      [
        ["role", "skills"],
        ["前端", "React"],
        ["分析", "SQL"],
      ],
      "Excel",
    ).jobs;
    const p = emptyState().profile;
    p.skills = ["SQL"];
    const ranked = rankJobs(jobs, p);
    expect(ranked[0].jd.title).toBe("分析");
    expect(ranked[0].analysis.score).toBe(50);
    expect(jobs[0].title).toBe("前端");
    p.skills = ["React"];
    expect(rankJobs(jobs, p)[0].jd.title).toBe("前端");
  });
});
describe("五阶段状态迁移", () => {
  it("旧备份笔试并入已投递，保留备注且不重复追加", () => {
    const original = demoState();
    const legacy = JSON.parse(JSON.stringify(original));
    legacy.applications[2].status = "笔试";
    legacy.applications[2].notes = "原备注";
    const next = parseImport(JSON.stringify(legacy));
    expect(next.applications).toHaveLength(6);
    expect(next.applications[2].status).toBe("已投递");
    expect(next.applications[2].notes).toContain("原备注");
    expect(next.applications[2].notes).toContain("原状态：笔试");
    expect(stateSchema.parse(next)).toEqual(next);
  });
  it("历史浏览器数据可以继续读取，不因删除状态无法启动", async () => {
    await clearState();
    const d = await openDB("career-desk", 1);
    const legacy = JSON.parse(JSON.stringify(demoState()));
    legacy.applications[2].status = "笔试";
    await d.put("workspace", legacy, "state");
    const s = await readState();
    expect(s.applications[2].status).toBe("已投递");
    expect(s.applications[2].notes).toContain("笔试");
    await clearState();
  });
});

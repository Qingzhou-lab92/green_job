import { test, expect, type Page } from "@playwright/test";
import {
  fixtureResume,
  fixtureRawJD,
  fixtureProfile,
  fixtureJob,
  fixtureMatch,
  fixtureCandidate,
  fixtureAdvice,
} from "../src/workflow-fixtures";

async function backup(page: Page) {
  await page.getByRole("button", { name: "设置与数据", exact: true }).click();
  const wait = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出全部数据", exact: true }).click();
  const file = await wait;
  const fs = await import("node:fs/promises");
  return JSON.parse(await fs.readFile((await file.path())!, "utf8"));
}

test("真实模式接口契约：四个节点、双 Top 3、版本链、失败重试与过期保护", async ({
  page,
}) => {
  const errors: string[] = [];
  const calls = { profile: 0, jd: 0, match: 0, rewrite: 0 };
  let invalid = false;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.addInitScript(() =>
    localStorage.setItem(
      "career-desk-ai",
      JSON.stringify({
        baseUrl: "https://ai.example.test/v1",
        model: "contract-test",
        key: "browser-test-placeholder",
      }),
    ),
  );
  await page.route(
    "https://ai.example.test/v1/chat/completions",
    async (route) => {
      const body = route.request().postDataJSON();
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].content).not.toContain(
        "browser-test-placeholder",
      );
      const data = JSON.parse(body.messages[1].content).untrustedData;
      let output: unknown;
      if (data.selected_match_result) {
        calls.rewrite++;
        output = { ...fixtureAdvice(), job_id: data.target_job.job_id };
      } else if (data.criteria) {
        calls.match++;
        const j = { ...fixtureJob(data.job.job_id), structured_job: data.job };
        const c = { ...fixtureCandidate(), profile: data.candidate };
        const result = fixtureMatch(j, c);
        if (data.job.job_facts.job_title === "业务协调员") {
          result.match_category = "general";
          result.category_reason =
            "跨专业使用访谈和信息整理经验，非直接专业方向";
        }
        output = result;
      } else if (data.raw_jd) {
        calls.jd++;
        const j = fixtureJob(data.job_id);
        if (data.raw_jd.includes("业务协调员"))
          j.structured_job.job_facts.job_title = "业务协调员";
        output = {
          structured_job: j.structured_job,
          jd_display_analysis: j.jd_display_analysis,
          hard_constraints: j.hard_constraints,
        };
      } else {
        calls.profile++;
        output = fixtureProfile();
      }
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                content: invalid ? "not JSON" : JSON.stringify(output),
              },
            },
          ],
        },
      });
    },
  );
  await page.goto("/");
  await page.getByRole("button", { name: "认识我", exact: true }).click();
  await page.getByLabel("原始简历").fill(fixtureResume);
  await page.getByRole("button", { name: "AI 拆解画像", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "画像草稿 · 核对后确认" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认并保存画像" }).click();
  await expect(
    page.getByText("当前画像版本：", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "JD 拆解器", exact: true }).click();
  for (const title of ["数据分析师", "业务协调员"]) {
    await page.getByRole("button", { name: "新增 JD", exact: true }).click();
    await page
      .getByLabel("JD 原文")
      .fill(fixtureRawJD.replace("数据分析师", title));
    await page.getByRole("button", { name: "AI 拆解 JD", exact: true }).click();
    await expect(
      page.getByRole("dialog").locator(".flat-fields"),
    ).toContainText(title);
    await page.getByRole("button", { name: "确认保存 JD" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "岗位分析", exact: true }).click();
  await page
    .getByRole("button", { name: /生成 Direct \/ General 报告/ })
    .click();
  await expect(page.getByTestId("top-job")).toHaveCount(2);
  await expect(page.getByTestId("top-job").first()).toContainText("75.07");
  await page
    .getByTestId("top-job")
    .first()
    .getByRole("button", { name: "选择此岗位精修" })
    .click();
  await page.getByRole("button", { name: "生成 AI 定向改写建议" }).click();
  await page.getByRole("checkbox", { name: /rewrite/ }).check();
  await page.getByRole("button", { name: "接受所选修改并预览" }).click();
  await expect(page.getByLabel("建议改写版")).toHaveValue(
    /使用 SQL 整理数据，分析用户访谈/,
  );
  await page.getByRole("button", { name: "保存新版本" }).click();
  await expect(page.getByRole("button", { name: "加入投递看板" })).toHaveCount(
    1,
  );
  await page.getByRole("button", { name: "加入投递看板" }).click();
  await expect(page.locator(".job-card")).toHaveCount(1);
  const saved = await backup(page);
  expect(saved.workflow.mode).toBe("live");
  expect(saved.workflow.reports[0].direct_top3).toHaveLength(1);
  expect(saved.workflow.reports[0].general_top3).toHaveLength(1);
  expect(saved.versions[0].report_id).toBe(saved.workflow.selected.report_id);
  expect(saved.profile.original).toBe(fixtureResume);
  expect(saved.applications[0].resumeId).toBe(saved.versions[0].id);
  expect(JSON.stringify(saved)).not.toContain("browser-test-placeholder");
  expect(calls).toEqual({ profile: 1, jd: 2, match: 2, rewrite: 1 });
  await page.reload();
  await page.getByRole("button", { name: "简历精修", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "生成 AI 定向改写建议" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "认识我", exact: true }).click();
  invalid = true;
  await page.getByRole("button", { name: "AI 拆解画像", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("JSON");
  const failed = await backup(page);
  expect(failed.workflow.confirmed_candidate_profile).toEqual(
    saved.workflow.confirmed_candidate_profile,
  );
  expect(failed.workflow.reports).toEqual(saved.workflow.reports);
  await page.getByRole("button", { name: "认识我", exact: true }).click();
  await page.getByRole("button", { name: "AI 拆解画像", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  invalid = false;
  await page.getByRole("button", { name: "重试当前步骤" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "确认并保存画像" }).click();
  await page.getByRole("button", { name: "简历精修", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("旧报告需重新匹配");
  await expect(
    page.getByRole("button", { name: "生成 AI 定向改写建议" }),
  ).toHaveCount(0);
  expect(calls.rewrite).toBe(1);
  const stale = await backup(page);
  expect(stale.workflow.reports[0].status).toBe("stale");
  expect(stale.versions).toEqual(saved.versions);
  await page.getByRole("button", { name: "清空全部数据", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("全部本地数据已清空");
  await page
    .locator('input[accept=".json,.csv"]')
    .setInputFiles({
      name: "v2-restore.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(saved)),
    });
  await page.getByRole("button", { name: "确认替换并恢复" }).click();
  await page.getByRole("button", { name: "简历精修", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "生成 AI 定向改写建议" }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

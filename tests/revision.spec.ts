import { test, expect } from "@playwright/test";
test("PDF 和 DOCX 本地提取、原文档案库、失败保护与备份恢复", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "认识我", exact: true }).click();
  await page
    .getByLabel("导入简历文档")
    .setInputFiles("tests/fixtures/resume.docx");
  await expect(page.getByLabel("原始简历")).toContainText("测试求职者");
  await expect(page.getByLabel("原始简历")).toContainText("SQL");
  await page.getByRole("button", { name: "保存原文", exact: true }).click();
  await page.getByRole("button", { name: "AI 拆解画像", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("配置 AI 服务");
  await page
    .getByLabel("导入简历文档")
    .setInputFiles("tests/fixtures/resume.pdf");
  await expect(page.getByLabel("原始简历")).toContainText("Resume Candidate");
  await page.getByRole("button", { name: "保存原文", exact: true }).click();
  await page.locator("summary").filter({ hasText: "简历档案库" }).click();
  await expect(page.getByText("resume.docx · DOCX")).toBeVisible();
  await expect(page.getByText("resume.pdf · PDF")).toBeVisible();
  await page.getByLabel("导入简历文档").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("invalid"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("原始简历")).toContainText("Resume Candidate");
  await page.reload();
  await page.getByRole("button", { name: "认识我", exact: true }).click();
  await page.locator("summary").filter({ hasText: "简历档案库" }).click();
  await page.getByRole("button", { name: "载入解析" }).first().click();
  await expect(page.getByLabel("原始简历")).toContainText("测试求职者");
  await page.getByRole("button", { name: "设置与数据", exact: true }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出全部数据" }).click();
  const file = await download;
  const fs = await import("node:fs/promises");
  const data = JSON.parse(await fs.readFile((await file.path())!, "utf8"));
  expect(
    data.profile.originals.map((x: { format: string }) => x.format),
  ).toEqual(["docx", "pdf"]);
  expect(errors).toEqual([]);
});
test("v2 九字段、证据展示、单岗位选岗与岗位库导入", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示", exact: true }).click();
  await page.getByRole("button", { name: "认识我", exact: true }).click();
  await page.getByRole("button", { name: "AI 拆解画像", exact: true }).click();
  await page.getByRole("button", { name: "确认并保存画像" }).click();
  await page.getByRole("button", { name: "JD 拆解器", exact: true }).click();
  await page.getByRole("button", { name: "重新结构化", exact: true }).click();
  await page.getByRole("button", { name: "AI 拆解 JD", exact: true }).click();
  await page.getByRole("button", { name: "确认保存 JD" }).click();
  await expect(page.locator(".flat-fields>div")).toHaveCount(9);
  await page.getByRole("button", { name: "简历精修", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("选择一个岗位");
  await expect(
    page.getByRole("heading", { name: "原简历 · 只读" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "岗位分析", exact: true }).click();
  await page.getByRole("button", { name: "从 478 条结构化岗位库选择" }).click();
  await page.getByLabel("搜索岗位库").fill("体育教师");
  await expect(
    page.getByRole("dialog").getByRole("checkbox").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .getByRole("button", { name: /生成 Direct \/ General 报告/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Direct Top 3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "General Top 3", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("top-job")).toHaveCount(1);
  const first = page.getByTestId("top-job").first();
  const title = await first.locator("h3").first().innerText();
  await first.getByRole("button", { name: "选择此岗位精修" }).click();
  await expect(
    page.getByRole("heading", { name: title, exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "逐项要求与证据" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "JD 拆解器", exact: true }).click();
  await expect(page.locator(".flat-fields>div")).toHaveCount(9);
  await expect(
    page.getByRole("heading", { name: "Matching Points · 逐项匹配" }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "JD 拆解器", exact: true }).click();
  await page
    .locator(".selection-list button")
    .filter({ hasText: title })
    .click();
  await expect(page.locator(".flat-fields")).toContainText(title);
  await page.screenshot({
    path: "test-results/glass-jd-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "岗位分析", exact: true }).click();
  await expect(page.getByTestId("top-job")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/glass-ranking-desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/glass-ranking-mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  expect(errors).toEqual([]);
});

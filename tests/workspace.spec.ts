import { test, expect } from "@playwright/test";
test("本地完整流程、备份恢复、无 Key 模拟与数据清空", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "你好，林晓." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "认识我", exact: true }).click();
  const raw = await page.getByLabel("原始简历").inputValue();
  await page.getByRole("button", { name: "解析为档案草稿" }).click();
  await page.getByRole("button", { name: "应用到档案草稿" }).click();
  await expect(page.getByLabel("原始简历")).toHaveValue(raw);
  await page.getByRole("button", { name: "保存档案", exact: true }).click();
  await page.getByRole("button", { name: "JD 拆解器", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "技能文本匹配度" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "新增 JD", exact: true }).click();
  await page
    .getByLabel("JD 原文")
    .fill(
      "岗位：前端开发\n公司：测试公司\n地点：上海\n要求：React TypeScript SQL\n本科及以上",
    );
  await page.getByRole("button", { name: "从原文提取基础字段" }).click();
  await expect(page.getByLabel("岗位名称")).toHaveValue("前端开发");
  await page.getByRole("button", { name: "保存并拆解" }).click();
  await expect(
    page.getByRole("heading", { name: "前端开发", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "简历定制", exact: true }).click();
  await page.getByRole("button", { name: "生成本地建议版" }).click();

  await expect(page.getByLabel("建议改写版")).not.toHaveValue("");
  await page.getByRole("button", { name: "保存新版本" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "投递看板", exact: true }).click();
  await page.getByRole("button", { name: "新增投递", exact: true }).click();
  await page.getByLabel("公司", { exact: true }).fill("自动测试公司");
  await page.getByLabel("岗位", { exact: true }).fill("产品经理");
  await page.getByRole("button", { name: "保存记录" }).click();
  await page.getByLabel("自动测试公司状态").selectOption("面试");
  await page.reload();
  await page.getByRole("button", { name: "投递看板", exact: true }).click();
  await expect(page.getByLabel("自动测试公司状态")).toHaveValue("面试");
  await page.getByRole("button", { name: "面试陪练", exact: true }).click();
  await page.getByRole("button", { name: "开始练习", exact: true }).click();
  await expect(page.locator(".practice-question")).toHaveCount(5);
  await page
    .getByLabel("自我介绍回答", { exact: true })
    .fill(
      "我在校园项目中负责访谈和需求分析，整理了需求清单，交付一份可交互原型。",
    );
  await page.getByRole("button", { name: "获取回答反馈" }).first().click();
  await expect(page.locator(".practice-question").first()).toContainText(
    "本地模拟反馈",
  );
  await page.getByRole("button", { name: "保存到题库" }).first().click();
  await page.getByRole("button", { name: "结束练习" }).click();
  await page.getByRole("button", { name: "设置与数据", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出全部数据" }).click();
  const file = await downloaded;
  const filePath = await file.path();
  expect(filePath).toBeTruthy();
  await page.getByRole("button", { name: "清空全部数据", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("全部本地数据已清空");
  const fs = await import("node:fs/promises");
  await page.locator('input[accept=".json,.csv"]').setInputFiles({
    name: "restore.json",
    mimeType: "application/json",
    buffer: await fs.readFile(filePath!),
  });
  await expect(page.getByRole("dialog")).toContainText("7 条投递");
  await page.getByRole("button", { name: "确认替换并恢复" }).click();
  await page.getByRole("button", { name: "面试陪练", exact: true }).click();
  await expect(page.locator(".practice-question").first()).toContainText(
    "本地模拟反馈",
  );
  await expect(page.getByLabel("自我介绍回答", { exact: true })).toHaveValue(
    /校园项目/,
  );
  expect(errors).toEqual([]);
});
test("手机七页及设置页无文档横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示", exact: true }).click();
  for (const name of [
    "认识我",
    "岗位分析",
    "JD 拆解器",
    "简历定制",
    "投递看板",
    "面试陪练",
    "设置与数据",
    "概览",
  ]) {
    await page.getByRole("button", { name: "打开导航" }).click();
    await page.getByRole("button", { name, exact: true }).click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `页面 ${name} 不应横向溢出`,
    ).toBe(true);
  }
  await page.screenshot({
    path: "test-results/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
});

test("拖拽、取消导入和 AI 响应只作为文本显示", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "体验演示", exact: true }).click();
  await page.screenshot({
    path: "test-results/desktop.png",
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: "投递看板", exact: true }).click();
  const card = page.locator(".job-card").filter({ hasText: "青禾科技" });
  await card.dragTo(
    page
      .locator(".kanban-column")
      .filter({
        has: page.getByRole("heading", { name: "已投递", exact: true }),
      }),
  );
  await expect(page.getByLabel("青禾科技（演示）状态")).toHaveValue("已投递");
  await page.getByRole("button", { name: "设置与数据", exact: true }).click();
  await page
    .locator('input[accept=".json,.csv"]')
    .setInputFiles({
      name: "sample.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("company,role\n仅预览公司,设计师"),
    });
  await expect(page.getByRole("dialog")).toContainText("1 条投递");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page
    .getByLabel("Base URL", { exact: true })
    .fill("https://ai.example.test/v1");
  await page.getByLabel("模型名称", { exact: true }).fill("test-model");
  await page
    .getByLabel("API Key", { exact: true })
    .fill("synthetic-test-value");
  await page.getByRole("button", { name: "保存配置", exact: true }).click();
  await page.route(
    "https://ai.example.test/v1/chat/completions",
    async (route) => {
      const body = route.request().postDataJSON();
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].content).toContain("untrustedData");
      expect(body.messages[1].content).not.toContain("synthetic-test-value");
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                content:
                  "<script>window.compromised=true</script> 建议检查证据",
              },
            },
          ],
        },
      });
    },
  );
  await page.getByRole("button", { name: "JD 拆解器", exact: true }).click();
  await page.getByRole("button", { name: "生成 AI 建议", exact: true }).click();
  await expect(page.locator(".plain-output").first()).toContainText("<script>");
  expect(await page.evaluate(() => "compromised" in window)).toBe(false);
  await page.getByRole("button", { name: "投递看板", exact: true }).click();
  await expect(page.locator(".job-card")).toHaveCount(6);
  expect(errors).toEqual([]);
});

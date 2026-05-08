import { test, expect } from '@playwright/test';

test.describe('Hippo Cockpit 集成测试', () => {

  test('页面加载显示空状态和关键元素', async ({ page }) => {
    await page.goto('/cockpit');

    await expect(page.locator('#chatContainer')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('发送消息开始对话');

    await expect(page.locator('#messageInput')).toBeVisible();
    await expect(page.locator('#sendBtn')).toBeVisible();
    await expect(page.locator('#stopBtn')).toBeHidden();
    await expect(page.locator('#stopBtn')).toBeAttached();

    await expect(page.locator('#sessionList')).toBeVisible();
    await expect(page.locator('#newSessionBtn')).toBeVisible();

    await expect(page.locator('#themeToggle')).toBeVisible();
  });

  test('输入框交互', async ({ page }) => {
    await page.goto('/cockpit');

    const input = page.locator('#messageInput');
    await expect(input).toBeEmpty();

    await input.fill('你好，请帮我写一个 Hello World 程序');
    await expect(input).toHaveValue('你好，请帮我写一个 Hello World 程序');

    const sendBtn = page.locator('#sendBtn');
    await expect(sendBtn).toBeEnabled();
  });

  test('停止按钮默认隐藏', async ({ page }) => {
    await page.goto('/cockpit');

    const stopBtn = page.locator('#stopBtn');
    await expect(stopBtn).toBeHidden();
    await expect(stopBtn).toBeAttached();
  });

  test('新建会话', async ({ page }) => {
    await page.goto('/cockpit');

    const newSessionBtn = page.locator('#newSessionBtn');
    await newSessionBtn.click();

    await page.waitForTimeout(500);

    const sessionItems = page.locator('#sessionList .session-item');
    const count = await sessionItems.count();
    expect(count).toBeGreaterThanOrEqual(1);

    const firstSession = sessionItems.first();
    await expect(firstSession).toHaveClass(/active/);
  });

  test('切换主题', async ({ page }) => {
    await page.goto('/cockpit');

    const themeToggle = page.locator('#themeToggle');
    const initialTheme = await page.locator('html').getAttribute('data-theme');

    await themeToggle.click();
    await page.waitForTimeout(300);

    const afterFirstClick = await page.locator('html').getAttribute('data-theme');
    expect(afterFirstClick).not.toBe(initialTheme);

    await themeToggle.click();
    await page.waitForTimeout(300);

    const afterSecondClick = await page.locator('html').getAttribute('data-theme');
    expect(afterSecondClick).toBe(initialTheme);
  });

  test('会话列表渲染分组', async ({ page }) => {
    await page.goto('/cockpit');

    await page.waitForTimeout(1000);

    const categories = page.locator('.session-category');
    const categoryCount = await categories.count();
    expect(categoryCount).toBeGreaterThanOrEqual(1);

    const firstCategory = categories.first();
    await expect(firstCategory).not.toBeEmpty();
  });

  test('右侧面板 — 各分区存在且可展开折叠', async ({ page }) => {
    await page.goto('/cockpit');

    const sections = page.locator('.sidebar-section');
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(4);

    const headers = page.locator('.sidebar-section-header');
    const headerCount = await headers.count();
    expect(headerCount).toBe(count);

    const firstHeader = headers.first();
    const firstBody = firstHeader.locator('..').locator('.sidebar-section-body');

    const initialShow = await firstBody.evaluate(el => el.classList.contains('show'));

    await firstHeader.click();
    await page.waitForTimeout(200);
    const afterClick = await firstBody.evaluate(el => el.classList.contains('show'));
    expect(afterClick).toBe(!initialShow);

    await firstHeader.click();
    await page.waitForTimeout(200);
    const afterSecondClick = await firstBody.evaluate(el => el.classList.contains('show'));
    expect(afterSecondClick).toBe(initialShow);
  });

  test('右侧面板 — Token 统计区域渲染', async ({ page }) => {
    await page.goto('/cockpit');

    const tokenVisual = page.locator('#tokenVisual');
    await expect(tokenVisual).toBeVisible();

    await expect(page.locator('#tvPercent')).toContainText('0%');
    await expect(page.locator('#tvUsage')).toContainText('0');
    await expect(page.locator('#tvPrompt')).toContainText('0');
    await expect(page.locator('#tvCompletion')).toContainText('0');
    await expect(page.locator('#tvSessionTotal')).toContainText('0');

    await expect(page.locator('#trendChart')).toBeVisible();
    await expect(page.locator('.token-trend-empty')).toContainText('等待更多数据...');
  });

  test('右侧面板 — 实时监控区域渲染', async ({ page }) => {
    await page.goto('/cockpit');

    await page.locator('.sidebar-section-header').filter({ hasText: '实时监控' }).click();
    await page.waitForTimeout(300);

    const metricsPanel = page.locator('#metricsPanel');
    await expect(metricsPanel).toBeVisible();

    await expect(page.locator('#metLlmTotal')).toContainText('0');
    await expect(page.locator('#metLlmSuccessRate')).toContainText('0%');
    await expect(page.locator('#metToolTotal')).toContainText('0');
    await expect(page.locator('#metToolSuccessRate')).toContainText('0%');
    await expect(page.locator('#metMemSearchCount')).toContainText('0');
    await expect(page.locator('#metMemHitRate')).toContainText('0%');
  });

  test('右侧面板 — 文件变更区域渲染', async ({ page }) => {
    await page.goto('/cockpit');

    await page.locator('.sidebar-section-header').filter({ hasText: '文件变更' }).click();
    await page.waitForTimeout(300);

    const fileChangesPanel = page.locator('#fileChangesPanel');
    await expect(fileChangesPanel).toBeVisible();

    await expect(page.locator('#fileChangesEmpty')).toContainText('暂无文件变更');
    await expect(page.locator('#fileChangesList')).toBeAttached();
  });

  test('提示词模式 — 角色选项和自定义按钮', async ({ page }) => {
    await page.goto('/cockpit');

    const promptModeBar = page.locator('#promptModeBar');
    await expect(promptModeBar).toBeVisible();

    const promptModeOptions = page.locator('#promptModeOptions');
    await expect(promptModeOptions).toBeVisible();
    await expect(promptModeOptions.locator('.prompt-mode-btn').first()).toBeVisible({ timeout: 5000 });
    const optionCount = await promptModeOptions.locator('.prompt-mode-btn').count();
    expect(optionCount).toBeGreaterThanOrEqual(1);

    const promptCustomBtn = page.locator('#promptCustomBtn');
    await expect(promptCustomBtn).toBeVisible();
    await expect(promptCustomBtn).toBeEnabled();
  });

  test('压缩按钮存在且可点击', async ({ page }) => {
    await page.goto('/cockpit');

    const compactBtn = page.locator('#compactBtn');
    await expect(compactBtn).toBeVisible();
    await expect(compactBtn).toBeEnabled();
    await expect(compactBtn).toContainText('压缩');
  });

  test('SSE 状态指示器存在', async ({ page }) => {
    await page.goto('/cockpit');

    const sseStatus = page.locator('#sseStatus');
    await expect(sseStatus).toBeAttached();
    await expect(sseStatus).toContainText('SSE');
  });

  test('Token 详情按钮可点击打开弹窗', async ({ page }) => {
    await page.goto('/cockpit');

    const tokenDetailsBtn = page.locator('#tokenDetailsBtn');
    await expect(tokenDetailsBtn).toBeVisible();
    await expect(tokenDetailsBtn).toBeEnabled();

    const tokenModal = page.locator('#tokenDetailsModal');
    await expect(tokenModal).toBeHidden();

    await tokenDetailsBtn.click();
    await page.waitForTimeout(300);
    await expect(tokenModal).toBeVisible();

    const closeBtn = page.locator('#closeTokenModal');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await page.waitForTimeout(300);
    await expect(tokenModal).toBeHidden();
  });
});
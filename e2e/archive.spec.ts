import { expect, test } from '@playwright/test';

test('absentee can discover, search and filter the August archive', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('把缺席的时间');
  await expect(page.getByText('演示内容', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: '浏览全部会议' }).click();
  await expect(page).toHaveURL(/\/meeting-knowledge\/meetings\/$/);

  const results = page.locator('[data-meeting-card]:visible');
  await expect(results).toHaveCount(3);

  await page.getByRole('searchbox', { name: '搜索会议知识' }).fill('Agent');
  await expect(results).toHaveCount(1);
  await expect(page.getByRole('status')).toContainText('找到 1 场');

  await page.getByRole('button', { name: /知识管理/ }).click();
  await expect(results).toHaveCount(1);

  await page.getByRole('button', { name: '清空筛选' }).click();
  await expect(results).toHaveCount(3);
});

test('reader can open a meeting and copy a provenance-aware Agent package', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./meetings/');
  await page.getByRole('link', { name: '把讨论变成 Agent 可读上下文', exact: true }).click();

  await expect(page.getByRole('heading', { level: 1 })).toContainText('把讨论变成 Agent 可读上下文');
  await expect(page.getByRole('heading', { name: '道 · 法 · 术 · 器 · 势' })).toBeVisible();

  const prompt = await page.locator('[data-prompt-source]').inputValue();
  expect(prompt).toContain('【公开来源与状态】');
  expect(prompt).toContain('【知识卡】');
  expect(prompt).toContain('【局限】');

  await page.getByRole('button', { name: '复制 Agent Prompt' }).click();
  await expect(page.getByRole('status')).toContainText('已复制');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('会议知识教练');
});

test('reader can use the honest chronological index and enter the curated learning map', async ({ page }) => {
  await page.goto('./learning/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('八月阅读索引');
  await expect(page.getByRole('link', { name: '进入策展学习地图' })).toHaveAttribute(
    'href',
    '/meeting-knowledge/insights/august-learning-path/'
  );

  const steps = page.locator('[data-learning-step]');
  await expect(steps).toHaveCount(3);
  await expect(steps.first()).toContainText('月初');
  await expect(steps.last()).toContainText('月末');
});

test('fixture build publishes a canonical sitemap and robots reference', async ({ request }) => {
  const sitemapResponse = await request.get('./sitemap.xml');
  expect(sitemapResponse.status()).toBe(200);
  const sitemap = await sitemapResponse.text();
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

  expect(locations).toHaveLength(9);
  expect(new Set(locations).size).toBe(9);
  expect(locations.every((url) => url.startsWith('https://example.com/meeting-knowledge/'))).toBe(true);
  expect(sitemap).not.toContain('<priority>');
  expect(sitemap).not.toContain('<changefreq>');

  const robotsResponse = await request.get('./robots.txt');
  expect(robotsResponse.status()).toBe(200);
  await expect.poll(async () => robotsResponse.text()).toContain(
    'Sitemap: https://example.com/meeting-knowledge/sitemap.xml'
  );
});

test('reader can discover a monthly insight, inspect its sources and copy its Agent prompt', async ({
  page,
  context
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');

  await expect(page.getByRole('link', { name: '月度洞察', exact: true })).toHaveAttribute(
    'href',
    '/meeting-knowledge/insights/'
  );
  await page.getByRole('link', { name: '查看月度洞察' }).click();
  await expect(page).toHaveURL(/\/meeting-knowledge\/insights\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('月度洞察');
  await expect(page.locator('[data-synthesis-card]')).toHaveCount(1);

  await page
    .getByRole('link', { name: '虚构月度洞察：从理解到行动的学习闭环', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    '虚构月度洞察：从理解到行动的学习闭环'
  );
  await expect(page.locator('#synthesis-sections article')).toHaveCount(2);
  await expect(page.locator('#five-layers li')).toHaveCount(5);
  await expect(page.locator('#related-meetings article')).toHaveCount(3);
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);

  const prompt = await page.locator('[data-prompt-source]').inputValue();
  expect(prompt).toContain('自动化测试使用的虚构月度学习材料');
  const copyButton = page.getByRole('button', { name: '复制综合 Agent Prompt' });
  await copyButton.click();
  await expect(page.locator('[data-copy-status]')).toContainText('已复制');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(prompt);
  await expect(copyButton).toHaveText('复制综合 Agent Prompt', { timeout: 3_000 });
});

test('subpath navigation, keyboard focus and 404 remain usable', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused();

  await page.goto('./does-not-exist/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('这卷档案尚未收录');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('link', { name: '返回知识场' })).toHaveAttribute(
    'href',
    '/meeting-knowledge/'
  );
});

test('reduced-motion preference disables ornamental transitions', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');

  const animationDuration = await page.locator('.hero__title').evaluate((element) => {
    return getComputedStyle(element).animationDuration;
  });
  expect(animationDuration).toBe('0s');
});

test('core reading pages do not create viewport-level horizontal overflow', async ({ page }) => {
  for (const route of [
    './',
    './meetings/',
    './meetings/2026-08-12-agent-context/',
    './learning/',
    './coverage/',
    './insights/',
    './insights/fixture-monthly-learning-loop/'
  ]) {
    await page.goto(route);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth
    }));
    expect(dimensions.document, `${route} should fit the viewport`).toBeLessThanOrEqual(
      dimensions.viewport + 1
    );
  }
});

import { expect, test } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

interface PublishedMeeting {
  id: string;
  title: string;
  abstract: string;
  forAbsentees: string;
  contentStatus: 'complete' | 'partial' | 'insufficient';
  confidence: 'high' | 'medium' | 'low';
  tags: string[];
  coreTopics: Array<{ title: string; explanation: string }>;
  transferableKnowledge: Array<{ principle: string }>;
  discussion: Array<{ heading: string }>;
  actions: Array<{ action: string }>;
  limitations: string[];
  claimsToVerify: string[];
  agentKit: { knowledgeCards: Array<{ name: string; content: string }> };
  sourceAnchors: Array<{ time: string }>;
}

interface PublishedSynthesis {
  id: string;
  title: string;
  abstract: string;
  relatedMeetings: string[];
  sections: Array<{ heading: string }>;
  agentKit: { prompt: string };
}

const contentDirectory = path.resolve('content/meetings');
const publishedMeetings = readdirSync(contentDirectory)
  .filter((filename) => filename.endsWith('.json'))
  .map((filename) =>
    JSON.parse(readFileSync(path.join(contentDirectory, filename), 'utf8')) as PublishedMeeting
  );
const synthesisDirectory = path.resolve('content/syntheses');
const publishedSyntheses = readdirSync(synthesisDirectory)
  .filter((filename) => filename.endsWith('.json'))
  .map((filename) =>
    JSON.parse(readFileSync(path.join(synthesisDirectory, filename), 'utf8')) as PublishedSynthesis
  );

const majorSections = [
  ['goals', '读完你会获得'],
  ['discussion', '核心讨论'],
  ['knowledge', '可迁移知识'],
  ['five-layers', '道 · 法 · 术 · 器 · 势'],
  ['actions', '行动清单'],
  ['agent-kit', '带去和 Agent 对流'],
  ['evidence', '证据与边界']
] as const;

test('published homepage exposes every real August meeting', async ({ page }) => {
  await page.goto('./');

  await expect(page.getByText('演示内容', { exact: true })).toHaveCount(0);
  await expect(page.locator('.hero__stats dt').first()).toHaveText(String(publishedMeetings.length));
  await expect(page.locator('.latest-section .meeting-card')).toHaveCount(
    Math.min(publishedMeetings.length, 3)
  );
  await expect(page.getByRole('link', { name: '浏览全部会议' })).toHaveAttribute(
    'href',
    '/meeting-knowledge/meetings/'
  );
});

test('coverage ledger states the complete August evidence boundary', async ({ page }) => {
  await page.goto('./coverage/');

  const partial = publishedMeetings.filter(({ contentStatus }) => contentStatus === 'partial').length;
  const insufficient = publishedMeetings.filter(({ contentStatus }) => contentStatus === 'insufficient').length;
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('覆盖与边界');
  await expect(page.getByText('可访问妙记与公开页一一对应')).toBeVisible();
  await expect(page.locator('.coverage-grid article').first()).toContainText(`${publishedMeetings.length} ↔ ${publishedMeetings.length}`);
  await expect(page.locator('.coverage-grid article').nth(1)).toContainText(`0 / ${partial} / ${insufficient}`);
  await expect(page.getByText('无产物会议不制造正文')).toBeVisible();
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
});

test('sitemap and robots expose every canonical public route', async ({ request }) => {
  const sitemapResponse = await request.get('./sitemap.xml');
  expect(sitemapResponse.status()).toBe(200);
  expect(sitemapResponse.headers()['content-type']).toContain('application/xml');
  const sitemap = await sitemapResponse.text();
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expectedCount = 5 + publishedMeetings.length + publishedSyntheses.length;

  expect(locations).toHaveLength(expectedCount);
  expect(new Set(locations).size).toBe(expectedCount);
  expect(locations.every((url) => url.startsWith('https://example.github.io/meeting-knowledge/'))).toBe(true);
  expect(locations.some((url) => url.endsWith('/404.html'))).toBe(false);
  for (const meeting of publishedMeetings) {
    expect(locations).toContain(`https://example.github.io/meeting-knowledge/meetings/${meeting.id}/`);
  }
  for (const synthesis of publishedSyntheses) {
    expect(locations).toContain(`https://example.github.io/meeting-knowledge/insights/${synthesis.id}/`);
  }

  const robotsResponse = await request.get('./robots.txt');
  expect(robotsResponse.status()).toBe(200);
  expect(await robotsResponse.text()).toContain(
    'Sitemap: https://example.github.io/meeting-knowledge/sitemap.xml'
  );
});

test('real archive supports full-text search, exact tags and reset', async ({ page }) => {
  await page.goto('./meetings/');
  const visibleResults = page.locator('[data-meeting-card]:visible');
  const query = '宠物鲜食';
  const expectedQueryCount = publishedMeetings.filter((meeting) =>
    [
      meeting.title,
      meeting.abstract,
      meeting.forAbsentees,
      ...meeting.tags,
      ...meeting.coreTopics.flatMap((topic) => [topic.title, topic.explanation])
    ].some((value) => value.includes(query))
  ).length;
  const tag = '智能硬件';
  const expectedTagCount = publishedMeetings.filter((meeting) => meeting.tags.includes(tag)).length;
  expect(expectedQueryCount).toBeGreaterThan(0);
  expect(expectedTagCount).toBeGreaterThan(0);

  await expect(visibleResults).toHaveCount(publishedMeetings.length);
  await page.getByRole('searchbox', { name: '搜索会议知识' }).fill(query);
  await expect(visibleResults).toHaveCount(expectedQueryCount);
  await expect(visibleResults).toContainText('AI 驱动宠物鲜食运营');
  await expect(page.getByRole('status')).toHaveText(`找到 ${expectedQueryCount} 场会议`);

  await page.getByRole('button', { name: '清空筛选' }).click();
  await page.getByRole('button', { name: new RegExp(tag) }).click();
  await expect(visibleResults).toHaveCount(expectedTagCount);
  await expect(page.getByRole('status')).toHaveText(`找到 ${expectedTagCount} 场会议`);

  await page.getByRole('button', { name: '清空筛选' }).click();
  await expect(visibleResults).toHaveCount(publishedMeetings.length);
});

test('all real meeting pages expose every learning block and copyable prompt', async ({
  page,
  context
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  for (const meeting of publishedMeetings) {
    await page.goto(`./meetings/${meeting.id}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(meeting.title);

    for (const [id, heading] of majorSections) {
      await expect(page.locator(`#${id}`), `${meeting.id} must render #${id}`).toBeVisible();
      await expect(page.locator(`#${id}`).getByRole('heading', { name: heading })).toBeVisible();
    }

    await expect(page.locator('#discussion .topic-index article')).toHaveCount(
      meeting.coreTopics.length
    );
    await expect(page.locator('#discussion .discussion-flow article')).toHaveCount(
      meeting.discussion.length
    );
    await expect(page.locator('#knowledge .knowledge-ledger article')).toHaveCount(
      meeting.transferableKnowledge.length
    );
    await expect(page.locator('#five-layers li')).toHaveCount(5);
    await expect(page.locator('#actions [role="row"]')).toHaveCount(meeting.actions.length + 1);
    await expect(page.locator('#evidence time')).toHaveCount(meeting.sourceAnchors.length);

    if (meeting.sourceAnchors.length === 0) {
      expect(meeting.contentStatus).toBe('insufficient');
      expect(meeting.coreTopics).toHaveLength(0);
      expect(meeting.discussion).toHaveLength(0);
      await expect(page.locator('#evidence')).toContainText('没有任何可用转写');
      await expect(page.locator('#evidence')).toContainText('无法建立真实来源时间锚点');
    }

    const prompt = await page.locator('[data-prompt-source]').inputValue();
    expect(prompt.length).toBeGreaterThan(120);
    expect(prompt).toContain(`公开 slug：${meeting.id}`);
    expect(prompt).toContain(`内容状态：${meeting.contentStatus}`);
    expect(prompt).toContain(`置信度：${meeting.confidence}`);
    expect(prompt).toContain('【知识卡】');
    expect(prompt).toContain(meeting.agentKit.knowledgeCards[0].name);
    expect(prompt).toContain('【局限】');
    expect(prompt).toContain(meeting.limitations[0]);
    if (meeting.claimsToVerify.length) {
      expect(prompt).toContain('【待验证主张】');
      expect(prompt).toContain(meeting.claimsToVerify[0]);
    }
    await page.getByRole('button', { name: '复制 Agent Prompt' }).click();
    await expect(page.locator('[data-copy-status]')).toContainText('已复制');
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(prompt);
  }
});

test('real chronological index covers all meetings and links to the curated learning map', async ({ page }) => {
  await page.goto('./learning/');
  const steps = page.locator('[data-learning-step]');

  await expect(steps).toHaveCount(publishedMeetings.length);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('八月阅读索引');
  await expect(page.getByRole('link', { name: '进入策展学习地图' })).toHaveAttribute(
    'href',
    '/meeting-knowledge/insights/august-learning-path/'
  );
  await expect(steps.first()).toContainText('月初');
  await expect(steps.last()).toContainText('月末');
  for (const meeting of publishedMeetings) {
    await expect(page.getByRole('link', { name: meeting.title })).toHaveAttribute(
      'href',
      `/meeting-knowledge/meetings/${meeting.id}/`
    );
  }
});

test('real monthly insights render dynamically and keep every source link valid', async ({
  page,
  context
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./insights/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('月度洞察');

  if (publishedSyntheses.length === 0) {
    await expect(page.locator('[data-synthesis-card]')).toHaveCount(0);
    await expect(page.getByText('月度洞察正在整理')).toBeVisible();
    return;
  }

  await expect(page.locator('[data-synthesis-card]')).toHaveCount(publishedSyntheses.length);
  for (const synthesis of publishedSyntheses) {
    await page.goto(`./insights/${synthesis.id}/`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(synthesis.title);
    await expect(page.locator('#synthesis-sections article')).toHaveCount(synthesis.sections.length);
    await expect(page.locator('#related-meetings article')).toHaveCount(
      synthesis.relatedMeetings.length
    );
    for (const meetingId of synthesis.relatedMeetings) {
      expect(publishedMeetings.some(({ id }) => id === meetingId)).toBe(true);
      const sourceCard = page.locator('#related-meetings article').filter({
        has: page.locator(`a[href$="/meetings/${meetingId}/"]`)
      });
      await expect(sourceCard).toHaveCount(1);
      await expect(sourceCard.locator(`a[href$="/meetings/${meetingId}/"]`).first()).toBeVisible();
    }

    const prompt = await page.locator('[data-prompt-source]').inputValue();
    expect(prompt.length).toBeGreaterThan(80);
    await page.getByRole('button', { name: '复制综合 Agent Prompt' }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(prompt);
  }
});

test('published subpath, keyboard flow, 404 and reduced-motion remain correct', async ({ page }) => {
  await page.goto('./');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: '跳到主要内容' })).toBeFocused();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  await expect(page.locator('.hero__title')).toHaveCSS('animation-duration', '0s');

  const response = await page.goto('./not-a-published-meeting/');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('这卷档案尚未收录');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('link', { name: '返回知识场' })).toHaveAttribute(
    'href',
    '/meeting-knowledge/'
  );
});

test('every published route stays inside the Pages subpath without viewport overflow', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  const routes = [
    './',
    './meetings/',
    './learning/',
    './coverage/',
    './insights/',
    ...publishedSyntheses.map(({ id }) => `./insights/${id}/`),
    ...publishedMeetings.map(({ id }) => `./meetings/${id}/`)
  ];

  for (const route of routes) {
    const response = await page.goto(route);
    expect(response?.status(), `${route} should load`).toBe(200);
    expect(new URL(page.url()).pathname).toMatch(/^\/meeting-knowledge\//);

    const audit = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      stylesheetUrls: [...document.styleSheets].map((sheet) => sheet.href).filter(Boolean),
      invalidInternalLinks: [...document.querySelectorAll<HTMLAnchorElement>('a[href^="/"]')]
        .map((link) => link.getAttribute('href'))
        .filter((href) => href && !href.startsWith('/meeting-knowledge/'))
    }));

    expect(audit.document, `${route} should not overflow`).toBeLessThanOrEqual(audit.viewport + 1);
    expect(audit.invalidInternalLinks, `${route} should prefix internal links`).toEqual([]);
    expect(audit.stylesheetUrls.every((url) => url?.includes('/meeting-knowledge/'))).toBe(true);
  }

  expect(consoleErrors, 'published pages should not log console errors').toEqual([]);
  expect(pageErrors, 'published pages should not raise uncaught errors').toEqual([]);
});

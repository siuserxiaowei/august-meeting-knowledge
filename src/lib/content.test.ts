import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  buildMeetingAgentPackage,
  buildLearningPath,
  loadMeetingsFrom,
  loadMeetings,
  formatDate,
  resolveContentDirectory,
  summarizeMeetings,
  validateMeeting
} from './content';

const fixtureDirectory = path.resolve('tests/fixtures/content');

describe('meeting content', () => {
  it('loads schema-complete JSON and sorts newest first', async () => {
    const meetings = await loadMeetingsFrom(fixtureDirectory);

    expect(meetings).toHaveLength(3);
    expect(meetings.map(({ date }) => date)).toEqual([
      '2026-08-21',
      '2026-08-12',
      '2026-08-03'
    ]);
    expect(meetings[0].agentKit.prompt).toContain('请');
  });

  it('returns an empty collection for an absent content directory', async () => {
    await expect(loadMeetingsFrom(path.join(fixtureDirectory, 'missing'))).resolves.toEqual([]);
  });

  it('rejects missing schema fields and malformed time anchors', () => {
    expect(() => validateMeeting(null, 'null.json')).toThrow(/不是 JSON 对象/);
    expect(() => validateMeeting({ id: 'too-small' }, 'broken.json')).toThrow(/缺少字段/);
    expect(() =>
      validateMeeting(
        {
          ...validMeeting,
          coreTopics: [{ title: '主题', explanation: '说明', anchor: '9:30' }]
        },
        'bad-anchor.json'
      )
    ).toThrow(/时间锚点/);
    expect(() =>
      validateMeeting({ ...validMeeting, discussion: [null] }, 'bad-discussion.json')
    ).toThrow(/时间锚点/);
  });

  it('preserves empty evidence arrays for a transcript-free insufficient page', () => {
    const meeting = validateMeeting(
      {
        ...validMeeting,
        contentStatus: 'insufficient',
        confidence: 'low',
        coreTopics: [],
        discussion: [],
        sourceAnchors: [],
        limitations: ['没有可用转写或发言记录。']
      },
      'transcript-free.json'
    );

    expect(meeting.coreTopics).toEqual([]);
    expect(meeting.discussion).toEqual([]);
    expect(meeting.sourceAnchors).toEqual([]);
  });

  it.each([
    [{ ...validMeeting, id: 'Not A Slug' }, /公开 slug/],
    [{ ...validMeeting, date: '2026-09-01' }, /2026 年 8 月日期/],
    [{ ...validMeeting, sourceType: 'transcript' }, /sourceType/],
    [{ ...validMeeting, contentStatus: 'draft' }, /contentStatus/],
    [{ ...validMeeting, confidence: 'certain' }, /confidence/]
  ])('rejects invalid metadata values', (meeting, message) => {
    expect(() => validateMeeting(meeting, 'invalid.json')).toThrow(message);
  });

  it('rejects private source identifiers anywhere in public content', () => {
    expect(() =>
      validateMeeting(
        {
          ...validMeeting,
          agentKit: { ...validMeeting.agentKit, minute_token: 'private-value' }
        },
        'leaked.json'
      )
    ).toThrow(/私有来源标识/);
    expect(() =>
      validateMeeting(
        { ...validMeeting, discussion: [{ heading: '测试', narrative: '测试', anchors: ['00:00:01'], detail: { note_id: 'secret' } }] },
        'nested-leak.json'
      )
    ).toThrow(/私有来源标识/);
  });

  it('reports malformed JSON with the public filename', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'meeting-json-'));
    await writeFile(path.join(directory, 'broken.json'), '{ nope', 'utf8');
    await expect(loadMeetingsFrom(directory)).rejects.toThrow(/broken\.json 不是有效 JSON/);
    await rm(directory, { recursive: true });
  });

  it('rejects duplicate public ids while loading', async () => {
    await expect(loadMeetingsFrom(path.resolve('tests/fixtures/duplicates'))).rejects.toThrow(
      /重复的会议 id/
    );
  });

  it('summarizes duration and quality status for the archive', async () => {
    const meetings = await loadMeetingsFrom(fixtureDirectory);
    expect(summarizeMeetings(meetings)).toEqual({
      total: 3,
      complete: 2,
      partial: 1,
      insufficient: 0,
      totalMinutes: 200,
      learningHours: 3.3
    });

    const variants = [
      { ...validMeeting, id: 'duration-mmss', duration: '45:30', contentStatus: 'insufficient' },
      { ...validMeeting, id: 'duration-natural', duration: '1小时 15分钟', contentStatus: 'partial' },
      { ...validMeeting, id: 'duration-hour', duration: '2h', contentStatus: 'complete' }
    ] as typeof meetings;
    expect(summarizeMeetings(variants)).toMatchObject({
      total: 3,
      complete: 1,
      partial: 1,
      insufficient: 1,
      totalMinutes: 241
    });
  });

  it('builds an honest chronological index grouped by calendar phase', async () => {
    const meetings = await loadMeetingsFrom(fixtureDirectory);
    const path = buildLearningPath(meetings);

    expect(path.map(({ meeting }) => meeting.date)).toEqual([
      '2026-08-03',
      '2026-08-12',
      '2026-08-21'
    ]);
    expect(path.map(({ stage }) => stage)).toEqual(['月初', '月中', '月末']);
    expect(path.every(({ sequence }) => sequence > 0)).toBe(true);
    expect(buildLearningPath([])).toEqual([]);
  });

  it('builds a portable Agent package with public provenance and evidence boundaries', () => {
    const promptPackage = buildMeetingAgentPackage(validMeeting as never);

    expect(promptPackage).toContain('【公开来源与状态】');
    expect(promptPackage).toContain('公开 slug：fixture-meeting');
    expect(promptPackage).toContain('内容状态：complete（完整提炼）');
    expect(promptPackage).toContain('置信度：high（高置信度）');
    expect(promptPackage).toContain('【知识卡】\n1. 原则卡');
    expect(promptPackage).toContain('【待验证主张】\n1. 需要外部核验的测试主张');
    expect(promptPackage).toContain('【局限】\n1. 只是一份测试材料');
    expect(promptPackage).toContain('【公开证据锚点】\n00:01:00｜主题出现');
  });

  it('resolves the configured or default public content directory and loads it', async () => {
    const previous = process.env.MEETING_CONTENT_DIR;
    process.env.MEETING_CONTENT_DIR = 'tests/fixtures/content';
    expect(resolveContentDirectory()).toBe(fixtureDirectory);
    await expect(loadMeetings()).resolves.toHaveLength(3);

    delete process.env.MEETING_CONTENT_DIR;
    expect(resolveContentDirectory()).toBe(path.resolve('content/meetings'));
    if (previous !== undefined) process.env.MEETING_CONTENT_DIR = previous;
  });

  it('formats an August date in Chinese without timezone drift', () => {
    expect(formatDate('2026-08-03')).toMatch(/8月3日/);
  });
});

const validMeeting = {
  id: 'fixture-meeting',
  sourceTitle: '测试来源',
  title: '用于校验的会议',
  date: '2026-08-01',
  duration: '01:00:00',
  sourceType: 'minutes',
  contentStatus: 'complete',
  confidence: 'high',
  abstract: '这是一段只用于单元测试的独立摘要，不对应任何真实会议。',
  forAbsentees: '理解会议知识提炼的基本结构。',
  learningGoals: ['理解结构'],
  coreTopics: [{ title: '主题', explanation: '说明', anchor: '00:01:00' }],
  transferableKnowledge: [
    { principle: '原则', whyItMatters: '原因', howToUse: '做法', boundary: '边界' }
  ],
  discussion: [{ heading: '讨论', narrative: '叙述', anchors: ['00:02:00'] }],
  actions: [{ action: '行动', owner: '读者', when: '会后', success: '完成' }],
  daoFaShuQiShi: {
    dao: { label: '道', summary: '方向' },
    fa: { label: '法', summary: '方法' },
    shu: { label: '术', summary: '动作' },
    qi: { label: '器', summary: '工具' },
    shi: { label: '势', summary: '趋势' }
  },
  agentKit: {
    context: '测试背景',
    prompt: '请基于测试背景回答。',
    questions: ['问题'],
    knowledgeCards: [{ name: '原则卡', content: '内容' }]
  },
  claimsToVerify: ['需要外部核验的测试主张'],
  limitations: ['只是一份测试材料'],
  privacy: '不含真实信息。',
  tags: ['测试'],
  sourceAnchors: [{ time: '00:01:00', note: '主题出现' }]
};

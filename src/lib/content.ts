import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export type ContentStatus = 'complete' | 'partial' | 'insufficient';
export type Confidence = 'high' | 'medium' | 'low';

export interface Meeting {
  id: string;
  sourceTitle: string;
  title: string;
  date: string;
  duration: string;
  sourceType: 'minutes';
  contentStatus: ContentStatus;
  confidence: Confidence;
  abstract: string;
  forAbsentees: string;
  learningGoals: string[];
  coreTopics: Array<{ title: string; explanation: string; anchor: string }>;
  transferableKnowledge: Array<{
    principle: string;
    whyItMatters: string;
    howToUse: string;
    boundary: string;
  }>;
  discussion: Array<{ heading: string; narrative: string; anchors: string[] }>;
  actions: Array<{ action: string; owner: string; when: string; success: string }>;
  daoFaShuQiShi: Record<
    'dao' | 'fa' | 'shu' | 'qi' | 'shi',
    { label: string; summary: string }
  >;
  agentKit: {
    context: string;
    prompt: string;
    questions: string[];
    knowledgeCards: Array<{ name: string; content: string }>;
  };
  claimsToVerify: string[];
  limitations: string[];
  privacy: string;
  tags: string[];
  sourceAnchors: Array<{ time: string; note: string }>;
}

const requiredKeys: Array<keyof Meeting> = [
  'id',
  'sourceTitle',
  'title',
  'date',
  'duration',
  'sourceType',
  'contentStatus',
  'confidence',
  'abstract',
  'forAbsentees',
  'learningGoals',
  'coreTopics',
  'transferableKnowledge',
  'discussion',
  'actions',
  'daoFaShuQiShi',
  'agentKit',
  'claimsToVerify',
  'limitations',
  'privacy',
  'tags',
  'sourceAnchors'
];

const anchorPattern = /^\d{2}:\d{2}:\d{2}$/;
const privateKeyPattern = /(?:minute[_-]?token|note[_-]?id|(?:source|private|feishu).*(?:url|link|token))/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function findPrivateKey(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findPrivateKey(item);
      if (match) return match;
    }
    return undefined;
  }
  if (!isRecord(value)) return undefined;

  for (const [key, child] of Object.entries(value)) {
    if (privateKeyPattern.test(key)) return key;
    const match = findPrivateKey(child);
    if (match) return match;
  }
  return undefined;
}

function collectAnchors(value: Record<string, unknown>): unknown[] {
  const coreTopics = Array.isArray(value.coreTopics) ? value.coreTopics : [];
  const discussion = Array.isArray(value.discussion) ? value.discussion : [];
  const sourceAnchors = Array.isArray(value.sourceAnchors) ? value.sourceAnchors : [];
  return [
    ...coreTopics.map((topic) => (isRecord(topic) ? topic.anchor : undefined)),
    ...discussion.flatMap((section) =>
      isRecord(section) && Array.isArray(section.anchors) ? section.anchors : [undefined]
    ),
    ...sourceAnchors.map((anchor) => (isRecord(anchor) ? anchor.time : undefined))
  ];
}

export function validateMeeting(value: unknown, filename = 'unknown.json'): Meeting {
  if (!isRecord(value)) throw new Error(`${filename} 不是 JSON 对象`);
  const missing = requiredKeys.filter((key) => !(key in value));
  if (missing.length) throw new Error(`${filename} 缺少字段：${missing.join('、')}`);

  const privateKey = findPrivateKey(value);
  if (privateKey) throw new Error(`${filename} 含私有来源标识：${privateKey}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value.id))) {
    throw new Error(`${filename} 的 id 必须是公开 slug`);
  }
  if (!/^2026-08-(?:0[1-9]|[12]\d|3[01])$/.test(String(value.date))) {
    throw new Error(`${filename} 的 date 必须是 2026 年 8 月日期`);
  }
  if (value.sourceType !== 'minutes') throw new Error(`${filename} 的 sourceType 必须为 minutes`);
  if (!['complete', 'partial', 'insufficient'].includes(String(value.contentStatus))) {
    throw new Error(`${filename} 的 contentStatus 无效`);
  }
  if (!['high', 'medium', 'low'].includes(String(value.confidence))) {
    throw new Error(`${filename} 的 confidence 无效`);
  }
  if (collectAnchors(value).some((anchor) => typeof anchor !== 'string' || !anchorPattern.test(anchor))) {
    throw new Error(`${filename} 存在无效时间锚点，应为 HH:MM:SS`);
  }

  return value as unknown as Meeting;
}

export async function loadMeetingsFrom(directory: string): Promise<Meeting[]> {
  let filenames: string[];
  try {
    filenames = (await readdir(directory)).filter((filename) => filename.endsWith('.json'));
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return [];
    throw error;
  }

  const meetings = await Promise.all(
    filenames.map(async (filename) => {
      const absolutePath = path.join(directory, filename);
      const raw = await readFile(absolutePath, 'utf8');
      try {
        return validateMeeting(JSON.parse(raw), filename);
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error(`${filename} 不是有效 JSON`);
        throw error;
      }
    })
  );

  const ids = new Set<string>();
  for (const meeting of meetings) {
    if (ids.has(meeting.id)) throw new Error(`发现重复的会议 id：${meeting.id}`);
    ids.add(meeting.id);
  }

  return meetings.sort((left, right) => right.date.localeCompare(left.date));
}

export function resolveContentDirectory(): string {
  const configured = process.env.MEETING_CONTENT_DIR || 'content/meetings';
  return path.resolve(configured);
}

export async function loadMeetings(): Promise<Meeting[]> {
  return loadMeetingsFrom(resolveContentDirectory());
}

function durationMinutes(duration: string): number {
  const colonParts = duration.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/);
  if (colonParts) {
    const [, first, second, third] = colonParts;
    if (third !== undefined) return Number(first) * 60 + Number(second) + Number(third) / 60;
    return Number(first) + Number(second) / 60;
  }

  const hours = Number(duration.match(/(\d+(?:\.\d+)?)\s*(?:小时|h)/i)?.[1] ?? 0);
  const minutes = Number(duration.match(/(\d+(?:\.\d+)?)\s*(?:分钟|min)/i)?.[1] ?? 0);
  return hours * 60 + minutes;
}

export function summarizeMeetings(meetings: readonly Meeting[]) {
  const totalMinutes = Math.round(meetings.reduce((sum, meeting) => sum + durationMinutes(meeting.duration), 0));
  return {
    total: meetings.length,
    complete: meetings.filter(({ contentStatus }) => contentStatus === 'complete').length,
    partial: meetings.filter(({ contentStatus }) => contentStatus === 'partial').length,
    insufficient: meetings.filter(({ contentStatus }) => contentStatus === 'insufficient').length,
    totalMinutes,
    learningHours: Math.round((totalMinutes / 60) * 10) / 10
  };
}

const calendarPhases = [
  { stage: '月初', intention: '按录音日期查看 8 月上旬的公开材料。' },
  { stage: '月中', intention: '按录音日期查看 8 月中旬的公开材料。' },
  { stage: '月末', intention: '按录音日期查看 8 月下旬的公开材料。' }
] as const;

export function buildLearningPath(meetings: readonly Meeting[]) {
  const chronological = [...meetings].sort((left, right) => left.date.localeCompare(right.date));
  return chronological.map((meeting, index) => {
    const day = Number(meeting.date.slice(-2));
    const stageIndex = day <= 10 ? 0 : day <= 20 ? 1 : 2;
    return {
      sequence: index + 1,
      ...calendarPhases[stageIndex],
      meeting
    };
  });
}

function numberedList(values: readonly string[], emptyText: string): string {
  if (values.length === 0) return emptyText;
  return values.map((value, index) => `${index + 1}. ${value}`).join('\n');
}

export function buildMeetingAgentPackage(meeting: Meeting): string {
  return [
    `【公开来源与状态】\n公开 slug：${meeting.id}\n内容状态：${meeting.contentStatus}（${statusLabels[meeting.contentStatus]}）\n置信度：${meeting.confidence}（${confidenceLabels[meeting.confidence]}）`,
    `【会议背景】\n${meeting.agentKit.context}`,
    `【主提示词】\n${meeting.agentKit.prompt}`,
    `【知识卡】\n${numberedList(
      meeting.agentKit.knowledgeCards.map(({ name, content }) => `${name}：${content}`),
      '本页没有可携带的知识卡。'
    )}`,
    `【待验证主张】\n${numberedList(meeting.claimsToVerify, '本页没有单列待验证主张。')}`,
    `【局限】\n${numberedList(meeting.limitations, '本页没有单列局限。')}`,
    `【公开证据锚点】\n${
      meeting.sourceAnchors.length
        ? meeting.sourceAnchors.map(({ time, note }) => `${time}｜${note}`).join('\n')
        : '没有可用的公开证据锚点；不得据标题或常识补写会议内容。'
    }`,
    meeting.agentKit.questions.length
      ? `【可继续追问】\n${numberedList(meeting.agentKit.questions, '')}`
      : ''
  ].filter(Boolean).join('\n\n');
}

export function formatDate(date: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Shanghai'
  }).format(new Date(`${date}T12:00:00+08:00`));
}

export const statusLabels: Record<ContentStatus, string> = {
  complete: '完整提炼',
  partial: '部分提炼',
  insufficient: '证据不足'
};

export const confidenceLabels: Record<Confidence, string> = {
  high: '高置信度',
  medium: '中等置信度',
  low: '低置信度'
};

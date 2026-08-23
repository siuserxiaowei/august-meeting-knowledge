import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const layerKeys = ['dao', 'fa', 'shu', 'qi', 'shi'] as const;
const layerLabels = { dao: '道', fa: '法', shu: '术', qi: '器', shi: '势' } as const;
const publicSlugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const privateKeyPattern =
  /(?:minute[_-]?token|note[_-]?id|meeting[_-]?id|(?:source|private|feishu|lark).*(?:url|link|token|id))/i;
const privateResourceUrlPattern =
  /(?<![a-z0-9.-])(?:(?:https?:)?\/\/)?(?:[a-z0-9-]+\.)*(?:feishu\.cn|larksuite\.com|larkoffice\.com)(?:[/:][^\s"'<>]*)?/i;
const publicFeishuDocsPattern =
  /(?:(?:https?:)?\/\/)?(?:open\.(?:feishu\.cn|larksuite\.com)|www\.feishu\.cn)(?:[/:][^\s"'<>]*)?/gi;
const privateResourceIdPattern =
  /\b(?:obcn|doxcn|doccn|wikcn|bascn|fldcn|boxcn|nodcn)[a-z0-9_-]{12,}\b/i;

export interface SynthesisSection {
  heading: string;
  summary: string;
  takeaways: string[];
}

export interface SynthesisLayer {
  label: '道' | '法' | '术' | '器' | '势';
  summary: string;
}

export interface Synthesis {
  id: string;
  title: string;
  abstract: string;
  audience: string[];
  sections: SynthesisSection[];
  daoFaShuQiShi: Record<(typeof layerKeys)[number], SynthesisLayer>;
  agentKit: {
    context: string;
    prompt: string;
    questions: string[];
    knowledgeCards: Array<{ name: string; content: string }>;
  };
  relatedMeetings: string[];
  claimsToVerify: string[];
  limitations: string[];
  tags: string[];
}

const requiredKeys: Array<keyof Synthesis> = [
  'id',
  'title',
  'abstract',
  'audience',
  'sections',
  'daoFaShuQiShi',
  'agentKit',
  'relatedMeetings',
  'claimsToVerify',
  'limitations',
  'tags'
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function containsPrivateKey(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsPrivateKey);
  if (!isRecord(value)) return false;

  return Object.entries(value).some(
    ([key, child]) => privateKeyPattern.test(normalizeSensitiveText(key)) || containsPrivateKey(child)
  );
}

function containsPrivateResourceUrl(value: unknown): boolean {
  if (typeof value === 'string') {
    const normalized = normalizeSensitiveText(value).replace(publicFeishuDocsPattern, '');
    return privateResourceUrlPattern.test(normalized);
  }
  if (Array.isArray(value)) return value.some(containsPrivateResourceUrl);
  if (!isRecord(value)) return false;
  return Object.values(value).some(containsPrivateResourceUrl);
}

function containsPrivateResourceId(value: unknown): boolean {
  if (typeof value === 'string') return privateResourceIdPattern.test(normalizeSensitiveText(value));
  if (Array.isArray(value)) return value.some(containsPrivateResourceId);
  if (!isRecord(value)) return false;
  return Object.values(value).some(containsPrivateResourceId);
}

function normalizeSensitiveText(value: string): string {
  let normalized = value.normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/gu, '');
  for (let pass = 0; pass < 2; pass += 1) {
    try {
      const decoded = decodeURIComponent(normalized);
      if (decoded === normalized) break;
      normalized = decoded;
    } catch {
      break;
    }
  }
  return normalized;
}

function assertExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string,
  filename: string
) {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${filename} 的 ${field} 含未定义字段`);
}

function assertNonEmptyString(value: unknown, field: string, filename: string) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${filename} 的 ${field} 必须是非空文本`);
  }
}

function assertStringArray(
  value: unknown,
  field: string,
  filename: string,
  { allowEmpty = true }: { allowEmpty?: boolean } = {}
) {
  if (
    !Array.isArray(value) ||
    (!allowEmpty && value.length === 0) ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw new Error(`${filename} 的 ${field} 必须是${allowEmpty ? '' : '非空'}文本数组`);
  }
}

function validateSections(value: unknown, filename: string) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${filename} 的 sections 必须是非空章节数组`);
  }

  value.forEach((section, index) => {
    if (!isRecord(section)) throw new Error(`${filename} 的 sections[${index}] 必须是对象`);
    assertExactKeys(section, ['heading', 'summary', 'takeaways'], `sections[${index}]`, filename);
    assertNonEmptyString(section.heading, `sections[${index}].heading`, filename);
    assertNonEmptyString(section.summary, `sections[${index}].summary`, filename);
    assertStringArray(section.takeaways, `sections[${index}].takeaways`, filename, {
      allowEmpty: false
    });
  });
}

function validateLayers(value: unknown, filename: string) {
  if (!isRecord(value)) throw new Error(`${filename} 的 daoFaShuQiShi 必须是对象`);
  assertExactKeys(value, layerKeys, 'daoFaShuQiShi', filename);

  for (const key of layerKeys) {
    const layer = value[key];
    if (!isRecord(layer)) {
      throw new Error(`${filename} 的 daoFaShuQiShi.${key} 必须是对象`);
    }
    assertExactKeys(layer, ['label', 'summary'], `daoFaShuQiShi.${key}`, filename);
    if (layer.label !== layerLabels[key]) {
      throw new Error(`${filename} 的 daoFaShuQiShi.${key}.label 无效`);
    }
    assertNonEmptyString(layer.summary, `daoFaShuQiShi.${key}.summary`, filename);
  }
}

function validateAgentKit(value: unknown, filename: string) {
  if (!isRecord(value)) throw new Error(`${filename} 的 agentKit 必须是对象`);
  assertExactKeys(
    value,
    ['context', 'prompt', 'questions', 'knowledgeCards'],
    'agentKit',
    filename
  );
  assertNonEmptyString(value.context, 'agentKit.context', filename);
  assertNonEmptyString(value.prompt, 'agentKit.prompt', filename);
  assertStringArray(value.questions, 'agentKit.questions', filename);

  if (!Array.isArray(value.knowledgeCards)) {
    throw new Error(`${filename} 的 agentKit.knowledgeCards 必须是数组`);
  }
  value.knowledgeCards.forEach((card, index) => {
    if (!isRecord(card)) {
      throw new Error(`${filename} 的 agentKit.knowledgeCards[${index}] 必须是对象`);
    }
    assertExactKeys(
      card,
      ['name', 'content'],
      `agentKit.knowledgeCards[${index}]`,
      filename
    );
    assertNonEmptyString(card.name, `agentKit.knowledgeCards[${index}].name`, filename);
    assertNonEmptyString(card.content, `agentKit.knowledgeCards[${index}].content`, filename);
  });
}

export function validateSynthesis(value: unknown, filename = 'unknown.json'): Synthesis {
  if (!isRecord(value)) throw new Error(`${filename} 不是 JSON 对象`);
  const missing = requiredKeys.filter((key) => !(key in value));
  if (missing.length) throw new Error(`${filename} 缺少字段：${missing.join('、')}`);

  if (containsPrivateKey(value)) {
    throw new Error(`${filename} 含私有来源标识（字段路径已隐藏）`);
  }
  if (containsPrivateResourceUrl(value)) {
    throw new Error(`${filename} 含私有来源链接（具体值已隐藏）`);
  }
  if (containsPrivateResourceId(value)) {
    throw new Error(`${filename} 含私有来源标识（具体值已隐藏）`);
  }
  assertExactKeys(value, requiredKeys, '顶层对象', filename);

  if (!publicSlugPattern.test(String(value.id))) {
    throw new Error(`${filename} 的 id 必须是公开 slug`);
  }
  assertNonEmptyString(value.title, 'title', filename);
  assertNonEmptyString(value.abstract, 'abstract', filename);
  assertStringArray(value.audience, 'audience', filename, { allowEmpty: false });
  validateSections(value.sections, filename);
  validateLayers(value.daoFaShuQiShi, filename);
  validateAgentKit(value.agentKit, filename);
  assertStringArray(value.relatedMeetings, 'relatedMeetings', filename, { allowEmpty: false });
  const relatedMeetings = value.relatedMeetings as string[];
  if (relatedMeetings.some((id) => !publicSlugPattern.test(id))) {
    throw new Error(`${filename} 的 relatedMeetings 只能包含公开 slug`);
  }
  if (new Set(relatedMeetings).size !== relatedMeetings.length) {
    throw new Error(`${filename} 的 relatedMeetings 含重复引用`);
  }
  assertStringArray(value.claimsToVerify, 'claimsToVerify', filename);
  assertStringArray(value.limitations, 'limitations', filename, { allowEmpty: false });
  assertStringArray(value.tags, 'tags', filename, { allowEmpty: false });

  return value as unknown as Synthesis;
}

export async function loadSynthesesFrom(
  directory: string,
  publishedMeetingIds: readonly string[]
): Promise<Synthesis[]> {
  let filenames: string[];
  try {
    filenames = (await readdir(directory))
      .filter((filename) => filename.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return [];
    throw error;
  }

  const entries = await Promise.all(
    filenames.map(async (filename) => {
      const raw = await readFile(path.join(directory, filename), 'utf8');
      let synthesis: Synthesis;
      try {
        synthesis = validateSynthesis(JSON.parse(raw), filename);
      } catch (error) {
        if (error instanceof SyntaxError) throw new Error(`${filename} 不是有效 JSON`);
        throw error;
      }

      return { filename, synthesis };
    })
  );

  const ids = new Set<string>();
  for (const { synthesis } of entries) {
    if (ids.has(synthesis.id)) throw new Error(`发现重复的综合洞察 id：${synthesis.id}`);
    ids.add(synthesis.id);
  }

  for (const { filename, synthesis } of entries) {
    if (filename !== `${synthesis.id}.json`) {
      throw new Error(`${filename} 的文件名必须与 id 一致`);
    }
  }

  const syntheses = entries.map(({ synthesis }) => synthesis);
  const published = new Set(publishedMeetingIds);
  for (const synthesis of syntheses) {
    const missingMeeting = synthesis.relatedMeetings.find((id) => !published.has(id));
    if (missingMeeting) {
      throw new Error(`${synthesis.id}.json 引用了不存在的公开会议：${missingMeeting}`);
    }
  }

  return syntheses.sort((left, right) => left.title.localeCompare(right.title, 'zh-CN'));
}

export function resolveSynthesisDirectory(): string {
  return path.resolve(process.env.SYNTHESIS_CONTENT_DIR || 'content/syntheses');
}

export async function loadSyntheses(publishedMeetingIds: readonly string[]): Promise<Synthesis[]> {
  return loadSynthesesFrom(resolveSynthesisDirectory(), publishedMeetingIds);
}

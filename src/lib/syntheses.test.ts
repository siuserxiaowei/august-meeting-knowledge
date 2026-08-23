import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadSyntheses,
  loadSynthesesFrom,
  resolveSynthesisDirectory,
  validateSynthesis
} from './syntheses';

const fixtureDirectory = path.resolve('tests/fixtures/syntheses');
const fixtureMeetingIds = [
  '2026-08-03-knowledge-orientation',
  '2026-08-12-agent-context',
  '2026-08-21-transfer-loop'
];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true }))
  );
});

describe('monthly synthesis content', () => {
  it('loads public synthesis JSON and resolves only published meeting slugs', async () => {
    const syntheses = await loadSynthesesFrom(fixtureDirectory, fixtureMeetingIds);

    expect(syntheses).toHaveLength(1);
    expect(syntheses[0]).toMatchObject({
      id: 'fixture-monthly-learning-loop',
      relatedMeetings: fixtureMeetingIds
    });
    expect(syntheses[0].agentKit.prompt).toContain('虚构');
  });

  it('returns an empty collection when the synthesis directory is absent or empty', async () => {
    await expect(
      loadSynthesesFrom(path.join(fixtureDirectory, 'missing'), fixtureMeetingIds)
    ).resolves.toEqual([]);

    const directory = await makeTemporaryDirectory();
    await expect(loadSynthesesFrom(directory, fixtureMeetingIds)).resolves.toEqual([]);
  });

  it('rejects missing or malformed public schema fields', () => {
    expect(() => validateSynthesis(null, 'null.json')).toThrow(/不是 JSON 对象/);
    expect(() => validateSynthesis({ id: 'too-small' }, 'broken.json')).toThrow(/缺少字段/);
    expect(() =>
      validateSynthesis({ ...validSynthesis, id: 'Not A Slug' }, 'invalid-id.json')
    ).toThrow(/公开 slug/);
    expect(() =>
      validateSynthesis(
        { ...validSynthesis, sections: [{ heading: '只有标题' }] },
        'bad-section.json'
      )
    ).toThrow(/sections/);
    expect(() =>
      validateSynthesis(
        { ...validSynthesis, daoFaShuQiShi: { ...validSynthesis.daoFaShuQiShi, dao: null } },
        'bad-layers.json'
      )
    ).toThrow(/daoFaShuQiShi/);
    expect(() =>
      validateSynthesis(
        { ...validSynthesis, agentKit: { ...validSynthesis.agentKit, questions: [false] } },
        'bad-agent-kit.json'
      )
    ).toThrow(/agentKit/);
  });

  it('rejects private source keys and private Feishu resource URLs without echoing values', () => {
    const privateValue = 'https://example.feishu.cn/minutes/private-resource-value';

    expect(() =>
      validateSynthesis(
        {
          ...validSynthesis,
          agentKit: { ...validSynthesis.agentKit, minute_token: 'private-token-value' }
        },
        'private-key.json'
      )
    ).toThrow(/含私有来源标识/);

    try {
      validateSynthesis(
        {
          ...validSynthesis,
          sections: [{ ...validSynthesis.sections[0], summary: privateValue }]
        },
        'private-url.json'
      );
      throw new Error('应拦截私有资源 URL');
    } catch (error) {
      expect(String(error)).toMatch(/含私有来源链接/);
      expect(String(error)).not.toContain(privateValue);
    }
  });

  it.each([
    'ｈｔｔｐｓ：／／private．feishu．cn／minutes／encoded-resource',
    'https%3A%2F%2Fprivate.feishu.cn%2Fminutes%2Fencoded-resource',
    '//private.feishu.cn/minutes/encoded-resource',
    'private.feishu.cn/minutes/encoded-resource',
    'obcnabcdefghijklmnopqrstuvwx',
    'obcn\u200babcdefghijklmnopqrstuvwx'
  ])('normalizes obfuscated private identifiers before rejecting them', (privateValue) => {
    try {
      validateSynthesis(
        {
          ...validSynthesis,
          sections: [{ ...validSynthesis.sections[0], summary: privateValue }]
        },
        'obfuscated-private-value.json'
      );
      throw new Error('应拦截规范化后的私有标识');
    } catch (error) {
      expect(String(error)).toMatch(/含私有来源(?:链接|标识)/);
      expect(String(error)).not.toContain(privateValue);
    }
  });

  it('allows links to public Feishu developer documentation', () => {
    expect(() =>
      validateSynthesis(
        {
          ...validSynthesis,
          sections: [
            {
              ...validSynthesis.sections[0],
              summary: '公开参考：https://open.feishu.cn/document/home/index'
            }
          ]
        },
        'public-docs.json'
      )
    ).not.toThrow();
  });

  it('normalizes obfuscated private field names before rejecting them', () => {
    expect(() =>
      validateSynthesis(
        {
          ...validSynthesis,
          agentKit: { ...validSynthesis.agentKit, 'ｍｉｎｕｔｅ＿ｔｏｋｅｎ': 'hidden' }
        },
        'obfuscated-key.json'
      )
    ).toThrow(/含私有来源标识/);
  });

  it('rejects filenames that differ from ids, duplicate ids and malformed JSON', async () => {
    const mismatchedDirectory = await makeTemporaryDirectory();
    await writeFile(
      path.join(mismatchedDirectory, 'different-name.json'),
      JSON.stringify(validSynthesis),
      'utf8'
    );
    await expect(
      loadSynthesesFrom(mismatchedDirectory, ['fixture-meeting'])
    ).rejects.toThrow(/文件名必须与 id 一致/);

    const duplicateDirectory = await makeTemporaryDirectory();
    await Promise.all(
      ['first.json', 'second.json'].map((filename) =>
        writeFile(
          path.join(duplicateDirectory, filename),
          JSON.stringify({ ...validSynthesis, id: filename.replace('.json', '') }),
          'utf8'
        )
      )
    );
    await writeFile(
      path.join(duplicateDirectory, 'second.json'),
      JSON.stringify({ ...validSynthesis, id: 'first' }),
      'utf8'
    );
    await expect(loadSynthesesFrom(duplicateDirectory, ['fixture-meeting'])).rejects.toThrow(
      /重复的综合洞察 id/
    );

    const malformedDirectory = await makeTemporaryDirectory();
    await writeFile(path.join(malformedDirectory, 'broken.json'), '{ nope', 'utf8');
    await expect(loadSynthesesFrom(malformedDirectory, fixtureMeetingIds)).rejects.toThrow(
      /broken\.json 不是有效 JSON/
    );
  });

  it('fails the build contract when a related meeting slug is invalid, repeated or missing', async () => {
    expect(() =>
      validateSynthesis(
        { ...validSynthesis, relatedMeetings: ['Private ID'] },
        'invalid-related.json'
      )
    ).toThrow(/relatedMeetings/);
    expect(() =>
      validateSynthesis(
        { ...validSynthesis, relatedMeetings: ['fixture-meeting', 'fixture-meeting'] },
        'duplicate-related.json'
      )
    ).toThrow(/重复/);

    const directory = await makeTemporaryDirectory();
    await writeFile(
      path.join(directory, `${validSynthesis.id}.json`),
      JSON.stringify({ ...validSynthesis, relatedMeetings: ['not-published'] }),
      'utf8'
    );
    await expect(loadSynthesesFrom(directory, ['fixture-meeting'])).rejects.toThrow(
      /引用了不存在的公开会议/
    );
  });

  it('resolves configured and default directories, then loads through the public helper', async () => {
    const previous = process.env.SYNTHESIS_CONTENT_DIR;
    process.env.SYNTHESIS_CONTENT_DIR = 'tests/fixtures/syntheses';

    expect(resolveSynthesisDirectory()).toBe(fixtureDirectory);
    await expect(loadSyntheses(fixtureMeetingIds)).resolves.toHaveLength(1);

    delete process.env.SYNTHESIS_CONTENT_DIR;
    expect(resolveSynthesisDirectory()).toBe(path.resolve('content/syntheses'));
    if (previous !== undefined) process.env.SYNTHESIS_CONTENT_DIR = previous;
  });
});

async function makeTemporaryDirectory() {
  const directory = await mkdtemp(path.join(tmpdir(), 'meeting-synthesis-'));
  temporaryDirectories.push(directory);
  return directory;
}

const validSynthesis = {
  id: 'fixture-synthesis',
  title: '虚构月度学习闭环',
  abstract: '这是一段只用于自动化测试的虚构综合摘要，不对应任何真实会议或真实人物。',
  audience: ['需要验证站点的虚构读者'],
  sections: [
    {
      heading: '虚构章节',
      summary: '用虚构内容验证章节可以独立阅读。',
      takeaways: ['先理解，再做一个可观察的小实验。']
    }
  ],
  daoFaShuQiShi: {
    dao: { label: '道', summary: '虚构方向' },
    fa: { label: '法', summary: '虚构方法' },
    shu: { label: '术', summary: '虚构动作' },
    qi: { label: '器', summary: '虚构工具' },
    shi: { label: '势', summary: '虚构环境' }
  },
  agentKit: {
    context: '这是用于测试的虚构综合背景。',
    prompt: '请仅基于虚构背景帮助虚构读者设计学习闭环。',
    questions: ['哪一步最值得先验证？'],
    knowledgeCards: [{ name: '虚构卡片', content: '把结论变成可观察的小实验。' }]
  },
  relatedMeetings: ['fixture-meeting'],
  claimsToVerify: ['这条虚构主张仍需验证。'],
  limitations: ['测试 fixture 不代表真实会议结论。'],
  tags: ['虚构测试']
};

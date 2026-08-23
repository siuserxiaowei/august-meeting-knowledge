import { describe, expect, it } from 'vitest';
import { deriveTags, filterMeetings, normalizeSearchText } from './search';

const meetings = [
  {
    id: 'agent-context',
    title: '让 Agent 读懂会议上下文',
    abstract: '把隐性讨论整理成可复用的知识卡。',
    forAbsentees: '掌握上下文组装方法。',
    tags: ['AI Agent', '知识管理'],
    coreTopics: [{ title: '上下文工程', explanation: '背景、约束与问题', anchor: '00:01:00' }]
  },
  {
    id: 'content-loop',
    title: '内容复盘闭环',
    abstract: '用行动和证据完成复盘。',
    forAbsentees: '建立反馈闭环。',
    tags: ['内容策略', '知识管理'],
    coreTopics: [{ title: '反馈', explanation: '把结果带回流程', anchor: '00:01:00' }]
  }
];

describe('front-end meeting search', () => {
  it('normalizes whitespace, case and full-width spaces', () => {
    expect(normalizeSearchText('  AI　Agent  ')).toBe('ai agent');
  });

  it('matches title, summary, tag and core-topic text', () => {
    expect(filterMeetings(meetings, { query: 'agent', tag: '' })).toHaveLength(1);
    expect(filterMeetings(meetings, { query: '隐性讨论', tag: '' })[0].id).toBe('agent-context');
    expect(filterMeetings(meetings, { query: '反馈', tag: '' })[0].id).toBe('content-loop');
  });

  it('combines query and exact tag filters', () => {
    expect(filterMeetings(meetings, { query: '知识', tag: 'AI Agent' })).toHaveLength(1);
    expect(filterMeetings(meetings, { query: '复盘', tag: 'AI Agent' })).toHaveLength(0);
  });

  it('returns all meetings for empty filters without mutating source order', () => {
    const result = filterMeetings(meetings, { query: '　', tag: '' });
    expect(result).toEqual(meetings);
    expect(result).not.toBe(meetings);
  });

  it('derives unique tags ordered by frequency then Chinese collation', () => {
    expect(deriveTags(meetings)).toEqual([
      { name: '知识管理', count: 2 },
      { name: 'AI Agent', count: 1 },
      { name: '内容策略', count: 1 }
    ]);

    expect(deriveTags([{ tags: ['中文乙', '中文甲', '中文甲'] }])).toEqual([
      { name: '中文甲', count: 1 },
      { name: '中文乙', count: 1 }
    ]);
    expect(deriveTags([])).toEqual([]);
  });
});

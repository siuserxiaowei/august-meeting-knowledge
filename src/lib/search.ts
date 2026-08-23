export interface SearchableMeeting {
  id: string;
  title: string;
  abstract: string;
  forAbsentees: string;
  tags: string[];
  coreTopics: Array<{ title: string; explanation: string; anchor: string }>;
}

export interface MeetingFilters {
  query: string;
  tag: string;
}

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}

export function filterMeetings<T extends SearchableMeeting>(
  meetings: readonly T[],
  filters: MeetingFilters
): T[] {
  const query = normalizeSearchText(filters.query);
  return meetings.filter((meeting) => {
    const matchesTag = !filters.tag || meeting.tags.includes(filters.tag);
    if (!matchesTag) return false;
    if (!query) return true;

    const searchable = [
      meeting.title,
      meeting.abstract,
      meeting.forAbsentees,
      ...meeting.tags,
      ...meeting.coreTopics.flatMap((topic) => [topic.title, topic.explanation])
    ]
      .map(normalizeSearchText)
      .join(' ');

    return searchable.includes(query);
  });
}

export function deriveTags(meetings: readonly Pick<SearchableMeeting, 'tags'>[]) {
  const counts = new Map<string, number>();
  for (const meeting of meetings) {
    for (const tag of new Set(meeting.tags)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  const collator = new Intl.Collator('zh-CN');
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => {
      const countDifference = right.count - left.count;
      if (countDifference) return countDifference;
      const leftIsLatin = /^[\u0000-\u024f]/.test(left.name);
      const rightIsLatin = /^[\u0000-\u024f]/.test(right.name);
      if (leftIsLatin !== rightIsLatin) return leftIsLatin ? -1 : 1;
      return collator.compare(left.name, right.name);
    });
}

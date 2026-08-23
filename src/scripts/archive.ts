const searchInput = document.querySelector<HTMLInputElement>('[data-archive-search]');
const cards = [...document.querySelectorAll<HTMLElement>('[data-meeting-card]')];
const filterButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-tag-filter]')];
const clearButton = document.querySelector<HTMLButtonElement>('[data-clear-filters]');
const resultStatus = document.querySelector<HTMLElement>('[data-result-status]');
const emptyState = document.querySelector<HTMLElement>('[data-no-results]');

let selectedTag = '';

function normalize(value: string) {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/\s+/g, ' ').trim();
}

function updateArchive() {
  const query = normalize(searchInput?.value ?? '');
  let visible = 0;

  for (const card of cards) {
    const tags = JSON.parse(card.dataset.tags ?? '[]') as string[];
    const matchesQuery = !query || (card.dataset.search ?? '').includes(query);
    const matchesTag = !selectedTag || tags.includes(selectedTag);
    const matches = matchesQuery && matchesTag;
    card.hidden = !matches;
    if (matches) visible += 1;
  }

  for (const button of filterButtons) {
    const active = button.dataset.tagFilter === selectedTag;
    button.setAttribute('aria-pressed', String(active));
  }

  if (resultStatus) resultStatus.textContent = `找到 ${visible} 场会议`;
  if (emptyState) emptyState.hidden = visible !== 0;
  if (clearButton) clearButton.hidden = !query && !selectedTag;
}

searchInput?.addEventListener('input', updateArchive);
for (const button of filterButtons) {
  button.addEventListener('click', () => {
    selectedTag = selectedTag === button.dataset.tagFilter ? '' : button.dataset.tagFilter ?? '';
    updateArchive();
  });
}
clearButton?.addEventListener('click', () => {
  selectedTag = '';
  if (searchInput) searchInput.value = '';
  updateArchive();
  searchInput?.focus();
});

updateArchive();

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  throw new Error('Clipboard API unavailable');
}

for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy-prompt]')) {
  const originalLabel = button.textContent ?? '复制 Agent Prompt';
  button.addEventListener('click', async () => {
    const panel = button.closest<HTMLElement>('[data-agent-kit]');
    const source = panel?.querySelector<HTMLTextAreaElement>('[data-prompt-source]');
    const status = panel?.querySelector<HTMLElement>('[data-copy-status]');
    if (!source || !status) return;

    try {
      await writeClipboard(source.value);
      status.textContent = '已复制，可以交给你的 Agent 了。';
      button.textContent = '已复制';
    } catch {
      status.textContent = '复制失败，请选中下方提示词手动复制。';
      source.classList.remove('visually-hidden');
      source.focus();
      source.select();
    }

    window.setTimeout(() => {
      button.textContent = originalLabel;
    }, 2400);
  });
}

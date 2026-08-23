export function normalizeBase(input?: string): string {
  const segment = (input ?? '').trim().replace(/^\/+|\/+$/g, '');
  return segment ? `/${segment}/` : '/';
}

export function withBase(target: string, base = '/'): string {
  if (/^(?:[a-z][a-z\d+.-]*:|#)/i.test(target)) return target;

  const normalizedBase = normalizeBase(base);
  const normalizedTarget = target.replace(/^\/+/, '');
  if (!normalizedTarget) return normalizedBase;
  if (normalizedBase !== '/' && target.startsWith(normalizedBase)) return target;
  return `${normalizedBase}${normalizedTarget}`;
}

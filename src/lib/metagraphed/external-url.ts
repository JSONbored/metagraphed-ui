const SAFE_EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:"]);

export function safeExternalHref(href: string | undefined): string | undefined {
  const trimmed = href?.trim();
  if (!trimmed) return undefined;

  try {
    const url = new URL(trimmed);
    return SAFE_EXTERNAL_URL_PROTOCOLS.has(url.protocol) ? trimmed : undefined;
  } catch {
    return undefined;
  }
}

export function isSafeExternalHref(href: string | undefined): boolean {
  return safeExternalHref(href) !== undefined;
}

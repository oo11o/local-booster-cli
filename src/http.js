import { readFileSync } from 'node:fs';

let version = '0.1.0';
try {
  const pkg = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  version = pkg.version || version;
} catch {
  // ignore — fall back to placeholder version
}

export const USER_AGENT = `dzo/${version}`;
export { version };

export class HttpError extends Error {}

// GET a URL and return the body text. Normalizes network errors, timeouts,
// and non-2xx responses into HttpError with a readable message.
export async function fetchText(url, { timeoutMs = 120000 } = {}) {
  let res;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: { Accept: '*/*', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new HttpError(`request timed out after ${Math.round(timeoutMs / 1000)}s`);
    }
    throw new HttpError(`network error: ${err?.message || err}`);
  }
  if (!res.ok) {
    throw new HttpError(`HTTP ${res.status} ${res.statusText}`.trim());
  }
  return res.text();
}

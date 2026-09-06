import { loadLocalConfig } from './localConfig.js';

// No secrets in this file. The real `run` key and host link live only in the
// git-ignored local settings file (see localConfig.js) or in env vars / flags.
export const DEFAULT_BASE_URL = 'http://dzo.lh'; // harmless loopback dev host
export const DEFAULT_TIMEOUT_SEC = 120;

// Precedence: explicit flag > env var > local git-ignored file.
export function resolveRun(flag) {
  const run = flag ?? process.env.DZO_RUN ?? loadLocalConfig().run;
  if (run == null || run === '') {
    throw new Error(
      'no run key — set "run" in dzo.local.json, or pass --run / DZO_RUN',
    );
  }
  return String(run);
}

// Endpoint path for the sync request (e.g. "/cron/directSinhro.php"). Kept
// out of the source — set it in dzo.local.json.
export function resolveSyncPath(flag) {
  const raw = flag ?? process.env.DZO_SYNC_PATH ?? loadLocalConfig().syncPath;
  if (raw == null || raw === '') {
    throw new Error(
      'no sync path — set "syncPath" in dzo.local.json, or pass --sync-path / DZO_SYNC_PATH',
    );
  }
  const path = String(raw).trim();
  return path.startsWith('/') ? path : `/${path}`;
}

// Query-parameter names for the sync request, kept out of the source.
// dzo.local.json "queryParams" must supply all four keys: hash, cdb, run, type.
const QUERY_PARAM_KEYS = ['hash', 'cdb', 'run', 'type'];

export function resolveQueryParams() {
  const names = loadLocalConfig().queryParams;
  if (!names || typeof names !== 'object') {
    throw new Error('no queryParams — set "queryParams" in dzo.local.json');
  }
  const missing = QUERY_PARAM_KEYS.filter((k) => !names[k]);
  if (missing.length > 0) {
    throw new Error(`queryParams missing key(s): ${missing.join(', ')}`);
  }
  return names;
}

export function resolveBaseUrl(flag) {
  const local = loadLocalConfig().baseUrl;
  const raw = flag ?? process.env.DZO_BASE_URL ?? local ?? DEFAULT_BASE_URL;
  return String(raw).replace(/\/+$/, '');
}

export function resolveTimeoutMs(flag) {
  const raw = flag ?? process.env.DZO_TIMEOUT ?? DEFAULT_TIMEOUT_SEC;
  const sec = Number(raw);
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`invalid timeout: ${raw}`);
  }
  return Math.round(sec * 1000);
}

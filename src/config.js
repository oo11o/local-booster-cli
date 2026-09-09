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
      'no run key — set "run" in conf.json, or pass --run / DZO_RUN',
    );
  }
  return String(run);
}

// Endpoint path for the sync request (e.g. "/cron/directSinhro.php"). Kept
// out of the source — set it in conf.json.
export function resolveSyncPath(flag) {
  const raw = flag ?? process.env.DZO_SYNC_PATH ?? loadLocalConfig().syncPath;
  if (raw == null || raw === '') {
    throw new Error(
      'no sync path — set "syncPath" in conf.json, or pass --sync-path / DZO_SYNC_PATH',
    );
  }
  const path = String(raw).trim();
  return path.startsWith('/') ? path : `/${path}`;
}

// Query-parameter names for the sync request, kept out of the source.
// conf.json "queryParams" must supply all four keys: hash, cdb, run, type.
const QUERY_PARAM_KEYS = ['hash', 'cdb', 'run', 'type'];

export function resolveQueryParams() {
  const names = loadLocalConfig().queryParams;
  if (!names || typeof names !== 'object') {
    throw new Error('no queryParams — set "queryParams" in conf.json');
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

// SSH host/options for the `sql` module. `host` follows the usual
// precedence; `options` (extra ssh flags, e.g. ["-o", "BatchMode=yes"])
// comes from conf.json only — there's no sane flag/env shape for an array.
export function resolveSsh(flag) {
  const local = loadLocalConfig().ssh || {};
  const host = flag ?? process.env.DZO_SSH_HOST ?? local.host;
  if (host == null || host === '') {
    throw new Error(
      'no ssh host — set "ssh.host" in conf.json, or pass --ssh-host / DZO_SSH_HOST',
    );
  }
  return { host: String(host), options: Array.isArray(local.options) ? local.options : [] };
}

// DB connection details for the `sql` module, from conf.json "db" with
// DZO_DB_* env overrides.
const DB_KEYS = ['container', 'host', 'user', 'password', 'database'];

export function resolveDb() {
  const local = loadLocalConfig().db || {};
  const db = {
    container: process.env.DZO_DB_CONTAINER ?? local.container,
    sudo: local.sudo ?? true,
    host: process.env.DZO_DB_HOST ?? local.host,
    port: process.env.DZO_DB_PORT ?? local.port,
    user: process.env.DZO_DB_USER ?? local.user,
    password: process.env.DZO_DB_PASSWORD ?? local.password,
    database: process.env.DZO_DB_NAME ?? local.database,
  };
  const missing = DB_KEYS.filter((k) => db[k] == null || db[k] === '');
  if (missing.length > 0) {
    throw new Error(`db config missing key(s): ${missing.join(', ')} — set "db" in conf.json`);
  }
  return db;
}

// A named SQL template from conf.json "sqlTemplates".
export function resolveSqlTemplate(name) {
  const templates = loadLocalConfig().sqlTemplates || {};
  const sql = templates[name];
  if (sql == null || sql === '') {
    const known = Object.keys(templates);
    const hint = known.length > 0 ? `known templates: ${known.join(', ')}` : 'no templates configured';
    throw new Error(`no sql template named '${name}' — ${hint}`);
  }
  return sql;
}

export function resolveTimeoutMs(flag) {
  const raw = flag ?? process.env.DZO_TIMEOUT ?? DEFAULT_TIMEOUT_SEC;
  const sec = Number(raw);
  if (!Number.isFinite(sec) || sec <= 0) {
    throw new Error(`invalid timeout: ${raw}`);
  }
  return Math.round(sec * 1000);
}

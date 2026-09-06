import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Local, git-ignored settings file. Holds everything endpoint-specific that
// must not be committed — the real `run` key, host link, sync path, and the
// query-parameter names.
//
// Looked up, first hit wins:
//   1. $DZO_CONFIG                       (explicit path)
//   2. ./dzo.local.json                  (cwd)
//   3. dzo.local.json next to package.json
//   4. ~/.dzo.json                       (per-user)
//
// Shape:
//   {
//     "run": "…",
//     "baseUrl": "https://…",
//     "syncPath": "/…/….php",
//     "queryParams": { "hash": "…", "cdb": "…", "run": "…", "type": "…" }
//   }
const FILE_NAME = 'dzo.local.json';

function candidatePaths() {
  const paths = [];
  if (process.env.DZO_CONFIG) paths.push(process.env.DZO_CONFIG);
  paths.push(join(process.cwd(), FILE_NAME));
  paths.push(new URL(`../${FILE_NAME}`, import.meta.url).pathname);
  paths.push(join(homedir(), '.dzo.json'));
  return paths;
}

let cache;

export function loadLocalConfig() {
  if (cache !== undefined) return cache;
  for (const path of candidatePaths()) {
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    if (text.trim() === '') continue;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        cache = parsed;
        return cache;
      }
    } catch {
      throw new Error(`invalid JSON in ${path}`);
    }
  }
  cache = {};
  return cache;
}

// test helper
export function resetLocalConfigCache() {
  cache = undefined;
}

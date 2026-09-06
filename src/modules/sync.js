import {
  resolveBaseUrl,
  resolveTimeoutMs,
  resolveRun,
  resolveSyncPath,
  resolveQueryParams,
} from '../config.js';
import { fetchText, HttpError } from '../http.js';
import { parseSyncResponse } from '../parse.js';
import { ok, fail, info } from '../output.js';

const HASH_RE = /^[0-9a-f]{32}$/i;

// Known sync tables — listed for reference only, never used to reject input.
export const SINHRO_TABLES = [
  'tenders',
  'contracts',
  'plans',
];

const USAGE = 'dzo sync [type] <hash>';

// `names` maps the logical field to the real query-parameter name, and comes
// from dzo.local.json ("queryParams") — no endpoint naming lives in source.
function buildUrl(base, { path, names, hash, type, cdb, run }) {
  const u = new URL(`${base}${path}`);
  u.searchParams.set(names.hash, hash);
  u.searchParams.set(names.cdb, String(cdb));
  u.searchParams.set(names.run, run);
  u.searchParams.set(names.type, type);
  return u.toString();
}

export default {
  name: 'sync',
  summary: 'Trigger a re-sync of one record',
  usage: USAGE,
  help: `Usage: ${USAGE}

Trigger a re-sync of a single DZO record and print the record URL on success,
or 'false' on failure.

Arguments:
  type    Record type, sent verbatim as type= (default: tenders)
  hash    32-character hex record id

Known types: ${SINHRO_TABLES.join(', ')}
(the type is not validated — any string is sent as-is)

Module flags:
  --cdb=<n>   CDB_Number query value (default: 0)
  --run=<k>   run= key override (default: dzo.local.json "run", env: DZO_RUN)
  --sync-path=<p>  endpoint path override (default: dzo.local.json "syncPath",
                   env: DZO_SYNC_PATH)
  --raw       Print the untouched response body and exit
  --url       Print the request URL without calling it

Examples:
  dzo sync 7a2cbf03808840c29991d84ce89b9931
  dzo sync contracts 7a2cbf03808840c29991d84ce89b9931
  dzo sync --url tenders 7a2cbf03808840c29991d84ce89b9931

Exit codes:
  0  success — record URL printed
  1  server returned false
  2  response payload not recognized
  3  network failure, timeout, or non-2xx HTTP status
  64 usage error`,

  async run(positionals, flags) {
    let type;
    let hash;

    if (positionals.length === 1) {
      type = 'tenders';
      hash = positionals[0];
    } else if (positionals.length === 2) {
      [type, hash] = positionals;
    } else {
      fail(`usage: ${USAGE}`);
      return 64;
    }

    if (!HASH_RE.test(hash)) {
      fail(`invalid hash '${hash}' — expected 32 hex characters\nusage: ${USAGE}`);
      return 64;
    }

    let baseUrl;
    let timeoutMs;
    let run;
    let syncPath;
    let names;
    try {
      baseUrl = resolveBaseUrl(flags['base-url']);
      timeoutMs = resolveTimeoutMs(flags.timeout);
      run = resolveRun(flags.run);
      syncPath = resolveSyncPath(flags['sync-path']);
      names = resolveQueryParams();
    } catch (err) {
      fail(err.message);
      return 64;
    }

    const cdb = flags.cdb ?? 0;
    const url = buildUrl(baseUrl, { path: syncPath, names, hash, type, cdb, run });

    if (flags.url) {
      ok(url);
      return 0;
    }

    let body;
    try {
      info(`syncing ${type}/${hash} …`);
      body = await fetchText(url, { timeoutMs });
    } catch (err) {
      if (err instanceof HttpError) {
        fail(err.message);
        return 3;
      }
      throw err;
    }

    if (flags.raw) {
      process.stdout.write(body.endsWith('\n') ? body : `${body}\n`);
      return 0;
    }

    const result = parseSyncResponse(body);

    if (result.status === 'ok') {
      const recordUrl = `${baseUrl}/${type}/${result.id}`;
      info(result.action === 'add' ? 'record created' : 'record updated');
      if (flags.json) {
        ok(
          JSON.stringify({
            status: 'ok',
            action: result.action,
            id: result.id,
            url: recordUrl,
          }),
        );
      } else {
        ok(recordUrl);
      }
      return 0;
    }

    if (result.status === 'false') {
      if (flags.json) {
        ok(JSON.stringify({ status: 'false' }));
      } else {
        ok('false');
      }
      return 1;
    }

    fail('unrecognized response payload:');
    process.stderr.write(`${result.raw}\n`);
    if (flags.json) {
      ok(JSON.stringify({ status: 'unknown', raw: result.raw }));
    }
    return 2;
  },
};

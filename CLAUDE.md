# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm test` / `node --test` — run the full test suite (`test/*.test.js`).
- `node --test test/parse.test.js` — run one test file.
- `node --test --test-name-pattern="add payload"` — run tests matching a name.
- `node bin/dzo.js <module> [args]` — run the CLI locally without installing.
- `node bin/dzo.js sync --url <hash>` — print the request URL without making a call (useful for inspecting config resolution).
- `npm i -g .` — install the `dzo` command globally.

Node.js 18+ required. Zero runtime dependencies — do not add any.

## Version control

There is currently no `.git` directory; the repo history was deleted to purge a
leaked key. Do not run `git` commands here unless explicitly asked.

## Architecture

`dzo` is a module-hosted CLI. `bin/dzo.js` → `src/cli.js` `run()` dispatches on
the first positional to a module in the `MODULES` map. Each module (`src/modules/*.js`)
is an object with `{ name, summary, usage, help, run(positionals, flags, ctx) }`
and returns a numeric exit code. `help` is itself a module and is invoked by
`cli.js` for the no-arg overview and for `-h`/`--help` on any module.

Global flags are parsed with `node:util` `parseArgs` in **non-strict** mode, so
module-specific flags (`--cdb`, `--run`, `--sync-path`, `--raw`, `--url`) are
read straight off the `flags` object without being declared. Non-strict mode
only binds `--flag=value`; `--flag value` for unknown flags won't work.

### Config resolution (`src/config.js` + `src/localConfig.js`)

No secrets, real hosts, endpoint paths, or query-parameter names live in
source. `resolveRun`, `resolveBaseUrl`, and `resolveSyncPath` resolve with
precedence **explicit flag → env var (`DZO_RUN` / `DZO_BASE_URL` /
`DZO_SYNC_PATH`) → local file**. `resolveQueryParams` reads only the local
file's `queryParams` object (keys `hash`, `cdb`, `run`, `type` → real param
names). `run`, `syncPath`, and `queryParams` throw a usage error (exit 64)
when unset; `baseUrl` falls back to the `http://dzo.lh` dev placeholder.

`localConfig.js` reads the first existing, non-empty `conf.json` from:
`$DZO_CONFIG` → `./conf.json` (cwd) → the file next to `package.json` →
`~/.dzo.json`. Result is cached per process (`resetLocalConfigCache()` for
tests). Malformed JSON throws with the path. This file is git-ignored.

### The `sync` module

Hits a PHP endpoint that returns xdebug warning HTML followed by the real
payload. `src/parse.js` `parseSyncResponse` deliberately does not parse the
HTML — it isolates the tail after the last `</table>`/`</font>`, then:
1. matches a literal `false` **before** any brace hunting (the `{main}()` in
   xdebug call stacks is a decoy);
2. direct-JSON-parses the tail, accepting either `{"update":N}` (record
   re-synced) or `{"add":N}` (record created), returning
   `{ status:'ok', id, action:'update'|'add' }`;
3. falls back to the last `{"update":N}`/`{"add":N}` match anywhere in the body;
4. otherwise `{ status:'unknown', raw }`.

Exit codes: `0` ok, `1` server `false`, `2` unrecognized payload, `3` network/
HTTP failure, `64` usage error. Regression fixtures live in `test/fixtures/`.

### The `sql` module

Runs templated SQL against the stage DB over SSH. The transport and SQL
concerns are deliberately split into two libs so the transport is reusable
by any future module:

- `src/ssh.js` — generic "run a command on a host" transport. `buildSshArgs`
  is a pure argv builder; `runSsh` spawns `ssh` via `node:child_process`
  `spawn` with an **argv array and no `shell: true`**, so the local shell
  never re-interprets anything. It knows nothing about SQL/mysql.
- `src/sql.js` — templating and the mysql/docker command. `escapeSqlLiteral`
  quotes every value (numbers included); `renderTemplate` substitutes
  `{{name}}` placeholders and **throws** on both a missing param and an
  unused one (typo guards). `buildMysqlCommand` builds the remote
  `docker exec ... mysql ...` string; `runQuery`/`runTemplate` are the reuse
  entry points other modules should call.

The remote SQL text always travels on the child process's **stdin**, never
inside the command string — this is what makes single-quote injection in a
param harmless (it becomes part of one already-escaped literal, never new
shell/SQL syntax). `sudo` on the stage host is assumed passwordless, so
there's no TTY (`ssh -t`) and no `docker exec -it`. The DB password rides as
`MYSQL_PWD=<value>`, prefixed into the *remote* command string (not the
local ssh process's env — `docker exec -e MYSQL_PWD` only forwards a var
already present in the remote shell that invokes it) and forwarded into the
container with `docker exec -e MYSQL_PWD`; `sudo -E` preserves it across the
`sudo` hop. This avoids mysql's "insecure password" warning that `-p<pass>`
prints to stderr.

`resolveSsh`, `resolveDb`, and `resolveSqlTemplate` (in `src/config.js`)
follow the same flag → env → conf.json precedence and throw-with-a-fix-hint
style as the `sync` module's resolvers. `conf.json` gains `ssh` (`host`,
`options`), `db` (`container`, `sudo`, `host`, `port`, `user`, `password`,
`database`), and `sqlTemplates` (name → SQL with `{{name}}` placeholders).

Exit codes: `0` ok, `1` zero rows with `--require-rows`, `3` ssh/mysql
failure, `64` usage error (bad `name=value`, unknown template, missing
config). `--print` resolves and prints the ssh argv (password redacted) and
SQL without connecting — the `sql` module's equivalent of `sync --url`.

### Output convention (`src/output.js`)

`ok()` writes the result line to **stdout** (the only thing on stdout).
`info()` writes status chatter to **stderr**, suppressed by `--quiet`.
`fail()` writes errors to stderr. Keep stdout parseable.

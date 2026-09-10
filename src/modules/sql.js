import { resolveTimeoutMs, resolveSsh, resolveDb, resolveSqlTemplate } from '../config.js';
import { renderTemplate, buildMysqlCommand, runQuery, parseBatchRows, assertReadOnly } from '../sql.js';
import { SshError } from '../ssh.js';
import { ok, fail, info } from '../output.js';

const USAGE = 'dzo sql <template> [name=value ...]  |  dzo sql --query=<sql>';

// name=value CLI args → { name: value }
function parseParams(positionals) {
  const params = {};
  for (const arg of positionals) {
    const eq = arg.indexOf('=');
    if (eq === -1) {
      throw new Error(`expected name=value, got '${arg}'`);
    }
    params[arg.slice(0, eq)] = arg.slice(eq + 1);
  }
  return params;
}

export default {
  name: 'sql',
  summary: 'Run a templated SQL query on the stage DB over SSH',
  usage: USAGE,
  help: `Usage: ${USAGE}

Run a named SQL template (from conf.json "sqlTemplates") against the stage
database over SSH + docker exec + mysql, or run an ad-hoc query with
--query. Prints mysql's own table output on stdout.

Read-only: only SELECT / WITH / SHOW / EXPLAIN / DESCRIBE statements are
allowed. DELETE, DROP, UPDATE, INSERT and all other write/DDL verbs are
refused (exit 64) before anything is sent to the server.

Arguments:
  template     Template name from conf.json "sqlTemplates"
  name=value   Fills {{name}} placeholders in the template

Module flags:
  --query=<sql>     Run this SQL directly, bypassing templates
  --print           Print the resolved ssh/mysql command (password redacted)
                     and the SQL, without connecting
  --ssh-host=<h>    ssh host override (default: conf.json "ssh.host",
                     env: DZO_SSH_HOST)
  --require-rows    Exit 1 if the query returns zero rows

Note: due to non-strict flag parsing, --query needs the '=' form
(--query="SELECT 1"), not a following space-separated argument.

Examples:
  dzo sql tender-id id=12345
  dzo sql --query="SELECT id FROM site_tender LIMIT 10"
  dzo sql --print tender-id id=12345
  dzo sql --json tender-id id=12345

Exit codes:
  0  success — result printed
  1  zero rows returned and --require-rows was given
  3  ssh/mysql failure
  64 usage error (bad name=value, unknown template, missing config,
      or non-read-only SQL)`,

  async run(positionals, flags) {
    let sql;
    try {
      if (flags.query) {
        if (positionals.length > 0) {
          fail(`usage: ${USAGE}`);
          return 64;
        }
        sql = String(flags.query);
      } else {
        const [template, ...rest] = positionals;
        if (!template) {
          fail(`usage: ${USAGE}`);
          return 64;
        }
        const templateSql = resolveSqlTemplate(template);
        const params = parseParams(rest);
        sql = renderTemplate(templateSql, params);
      }
      assertReadOnly(sql);
    } catch (err) {
      fail(err.message);
      return 64;
    }

    let ssh;
    let db;
    let timeoutMs;
    try {
      ssh = resolveSsh(flags['ssh-host']);
      db = resolveDb();
      timeoutMs = resolveTimeoutMs(flags.timeout);
    } catch (err) {
      fail(err.message);
      return 64;
    }

    const batch = Boolean(flags.json);
    const command = buildMysqlCommand({
      container: db.container,
      sudo: db.sudo,
      host: db.host,
      port: db.port,
      user: db.user,
      password: db.password,
      database: db.database,
      batch,
    });

    if (flags.print) {
      const redacted = command.replace(/MYSQL_PWD='(?:[^'\\]|\\.)*'/, "MYSQL_PWD='***'");
      const argv = ['ssh', ...ssh.options, ssh.host, redacted];
      ok(`argv: ${JSON.stringify(argv)}\nstdin (SQL):\n${sql}`);
      return 0;
    }

    let stdout;
    try {
      info('running query …');
      stdout = await runQuery(sql, { sshHost: flags['ssh-host'], timeoutMs, batch });
    } catch (err) {
      if (err instanceof SshError) {
        fail(err.message);
        return 3;
      }
      throw err;
    }

    if (flags.json) {
      const { rows } = parseBatchRows(stdout);
      if (rows.length === 0 && flags['require-rows']) {
        ok(JSON.stringify([]));
        return 1;
      }
      ok(JSON.stringify(rows));
      return 0;
    }

    const trimmed = stdout.replace(/\n+$/, '');
    if (trimmed === '' && flags['require-rows']) {
      ok('');
      return 1;
    }
    ok(trimmed);
    return 0;
  },
};

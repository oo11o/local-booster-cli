import { runSsh } from './ssh.js';
import { resolveSsh, resolveDb, resolveSqlTemplate } from './config.js';

// Escape a value as a single-quoted MySQL string literal. Everything is
// quoted, including numbers — MySQL coerces, and it removes a whole class
// of "is this a number or not" bugs.
export function escapeSqlLiteral(value) {
  const s = String(value);
  const escaped = s
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '\\"')
    .replace(/\0/g, '\\0')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return `'${escaped}'`;
}

const PLACEHOLDER_RE = /\{\{(\w+)\}\}/g;

// Substitute every {{name}} in `sql` with the escaped value of params[name].
// Throws on a placeholder with no matching param, and on a param that the
// template never references — both are typo signals, and a silent typo
// here would run the wrong query against stage.
export function renderTemplate(sql, params = {}) {
  const used = new Set();
  const rendered = sql.replace(PLACEHOLDER_RE, (_match, name) => {
    if (!(name in params)) {
      throw new Error(`template references {{${name}}} but no value was given`);
    }
    used.add(name);
    return escapeSqlLiteral(params[name]);
  });

  const unused = Object.keys(params).filter((k) => !used.has(k));
  if (unused.length > 0) {
    throw new Error(`param(s) not used by template: ${unused.join(', ')}`);
  }

  return rendered;
}

// Single-quote a value for embedding in the remote shell command string.
// This is the one unavoidable layer of quoting — ssh always concatenates
// its trailing args into a command run by the remote shell.
function shQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

// Build the remote `docker exec ... mysql ...` command string. The SQL
// itself never appears here — it travels separately, over stdin.
//
// The password rides as MYSQL_PWD, set in the remote shell's environment
// and forwarded into the container with `docker exec -e MYSQL_PWD` — this
// avoids mysql's "using a password on the command line is insecure"
// warning that `-p<pass>` would print to stderr. `docker exec -e NAME`
// (no `=value`) only forwards a var already present in the *remote* shell
// executing `docker exec`, so MYSQL_PWD=<value> must be part of the same
// command string, not the local ssh process's environment.
export function buildMysqlCommand({ container, sudo, host, port, user, password, database, batch }) {
  const parts = [];
  parts.push(`MYSQL_PWD=${shQuote(password)}`);
  if (sudo) parts.push('sudo', '-E');
  parts.push('docker', 'exec', '-e', 'MYSQL_PWD', '-i', shQuote(container));
  parts.push('mysql', '-h', shQuote(host));
  if (port) parts.push('-P', shQuote(port));
  parts.push('-u', shQuote(user));
  if (batch) parts.push('--batch', '--raw');
  parts.push(shQuote(database));
  return parts.join(' ');
}

// Run raw SQL against the configured stage DB over ssh. `opts.exec`
// defaults to runSsh and can be overridden in tests. The SQL text is the
// child process's stdin — it never appears in the command string or in
// `ps` output.
export async function runQuery(sql, opts = {}) {
  const { exec = runSsh, sshHost, timeoutMs, batch = false } = opts;
  const ssh = resolveSsh(sshHost);
  const db = resolveDb();

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

  const result = await exec(command, {
    host: ssh.host,
    options: ssh.options,
    stdin: sql,
    timeoutMs,
  });
  return result.stdout;
}

// Resolve a named template, fill in params, and run it.
export async function runTemplate(name, params = {}, opts = {}) {
  const sql = resolveSqlTemplate(name);
  const rendered = renderTemplate(sql, params);
  return runQuery(rendered, opts);
}

// Parse `mysql --batch --raw` TSV output into { columns, rows }.
export function parseBatchRows(text) {
  const trimmed = String(text ?? '').replace(/\r\n/g, '\n').trim();
  if (trimmed === '') {
    return { columns: [], rows: [] };
  }
  const lines = trimmed.split('\n');
  const columns = lines[0].split('\t');
  const rows = lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row = {};
    columns.forEach((col, i) => {
      row[col] = cells[i] === 'NULL' ? null : cells[i];
    });
    return row;
  });
  return { columns, rows };
}
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;

function paint(code, s) {
  return useColor ? `[${code}m${s}[0m` : s;
}

let quiet = false;
export function setQuiet(v) {
  quiet = Boolean(v);
}

// The payload / result line — the only thing on stdout.
export function ok(line) {
  process.stdout.write(`${line}\n`);
}

// Status chatter — stderr, suppressed by --quiet.
export function info(msg) {
  if (!quiet) process.stderr.write(`${paint('2', msg)}\n`);
}

export function fail(msg) {
  process.stderr.write(`${paint('31', 'error')}: ${msg}\n`);
}

import { spawn } from 'node:child_process';

// Generic remote-command transport. No SQL/mysql awareness lives here —
// that's src/sql.js's job. Kept reusable for any future module that needs
// to run something on the configured host.

export class SshError extends Error {
  constructor(message, { stderr } = {}) {
    super(message);
    this.name = 'SshError';
    this.stderr = stderr;
  }
}

// Pure argv builder — exported so tests can assert on shape without
// spawning a process. `options` are extra ssh flags from conf.json
// (e.g. ["-o", "BatchMode=yes"]); `command` is the remote command string.
export function buildSshArgs({ host, options = [], command }) {
  if (!host) throw new Error('buildSshArgs: host is required');
  const args = [...options, host];
  if (command != null) args.push(command);
  return args;
}

// Run `command` on `host` over ssh, piping `stdin` (if given) to the remote
// process, and resolve { stdout, stderr }. Uses an argv array — never
// `shell: true` — so the local shell never re-interprets anything.
export function runSsh(command, { host, options = [], stdin, timeoutMs = 120000 } = {}) {
  const args = buildSshArgs({ host, options, command });

  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn('ssh', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      reject(new SshError(`failed to spawn ssh: ${err.message}`));
      return;
    }

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new SshError(`ssh failed: ${err.message}`, { stderr }));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          new SshError(`ssh timed out after ${Math.round(timeoutMs / 1000)}s`, { stderr }),
        );
        return;
      }
      if (code !== 0) {
        reject(new SshError(`ssh exited with code ${code}: ${stderr.trim()}`, { stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });

    if (stdin != null) {
      child.stdin.write(stdin);
    }
    child.stdin.end();
  });
}
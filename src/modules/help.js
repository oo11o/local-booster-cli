import { version } from '../http.js';
import { DEFAULT_BASE_URL, DEFAULT_TIMEOUT_SEC } from '../config.js';

const GLOBAL_FLAGS_TEXT = `Options:
  --base-url=<url>   API base URL (default: ${DEFAULT_BASE_URL}, env: DZO_BASE_URL)
  --timeout=<sec>    Request timeout in seconds (default: ${DEFAULT_TIMEOUT_SEC})
  --json             Machine-readable output
  --quiet            Suppress status messages on stderr
  -v, --version      Print version
  -h, --help         Show help

Local settings file (git-ignored): dzo.local.json in the project root or
~/.dzo.json, or a path in $DZO_CONFIG. Keys: "run", "baseUrl". Flags and
env vars still win over it.`;

function moduleList(MODULES) {
  const names = [...MODULES.keys()];
  const width = Math.max(...names.map((n) => n.length));
  return names
    .map((n) => `  ${n.padEnd(width)}  ${MODULES.get(n).summary}`)
    .join('\n');
}

function overview(MODULES) {
  return `dzo — DZO command line tool

Usage: dzo <module> [args] [options]

Modules:
${moduleList(MODULES)}

${GLOBAL_FLAGS_TEXT}

Run 'dzo help <module>' for details on a module.`;
}

export default {
  name: 'help',
  summary: 'Show help for dzo or one of its modules',
  usage: 'dzo help [module]',
  help: `Usage: dzo help [module]

Show the dzo overview, or the full help text for one module.

Examples:
  dzo help          Overview and module list
  dzo help sync     Full help for the sync module`,

  run(positionals, _flags, ctx = {}) {
    const MODULES = ctx.MODULES;
    const target = positionals[0];

    if (!target) {
      process.stdout.write(`${overview(MODULES)}\n`);
      return 0;
    }

    const mod = MODULES.get(target);
    if (!mod) {
      process.stderr.write(`Unknown module '${target}'\n\n`);
      process.stderr.write(`Modules:\n${moduleList(MODULES)}\n`);
      return 64;
    }

    process.stdout.write(`${mod.help}\n`);
    return 0;
  },
};

export { version };

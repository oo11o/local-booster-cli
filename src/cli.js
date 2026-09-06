import { parseArgs } from 'node:util';
import syncModule from './modules/sync.js';
import helpModule from './modules/help.js';
import { fail, setQuiet } from './output.js';
import { version } from './http.js';

export const MODULES = new Map([
  ['sync', syncModule],
  ['help', helpModule],
]);

const GLOBAL_OPTIONS = {
  'base-url': { type: 'string' },
  timeout: { type: 'string' },
  json: { type: 'boolean' },
  quiet: { type: 'boolean' },
  version: { type: 'boolean', short: 'v' },
  help: { type: 'boolean', short: 'h' },
};

export async function run(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: GLOBAL_OPTIONS,
      allowPositionals: true,
      strict: false,
    });
  } catch (err) {
    fail(err.message);
    return 64;
  }

  const { values: flags, positionals } = parsed;
  setQuiet(flags.quiet);

  if (flags.version && positionals.length === 0) {
    process.stdout.write(`dzo ${version}\n`);
    return 0;
  }

  const moduleName = positionals[0];

  // No module → overview on stdout, exit 0.
  if (!moduleName) {
    return helpModule.run([], flags, { MODULES, stream: 'stdout' });
  }

  const mod = MODULES.get(moduleName);
  if (!mod) {
    fail(`unknown module '${moduleName}'`);
    process.stderr.write("Run 'dzo help' to see available modules.\n");
    return 64;
  }

  const rest = positionals.slice(1);

  // -h/--help anywhere → full help for that module, on stdout, exit 0.
  if (flags.help) {
    return helpModule.run([moduleName], flags, { MODULES, stream: 'stdout' });
  }

  return mod.run(rest, flags, { MODULES });
}

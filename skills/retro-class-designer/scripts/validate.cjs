#!/usr/bin/env node
// Generated portable entry. Uses only Node built-ins; run --help for usage.
require('./validation-runtime.cjs').main(process.argv.slice(2), require('./validation-build.json'))
  .catch(error => { console.error(JSON.stringify({ valid: false, errors: [error.message] })); process.exitCode = 1; });

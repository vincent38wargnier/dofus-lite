const { getQuickJS } = require('quickjs-emscripten');
const { createSandbox } = require('../src/platform/sandboxCore.js');
async function sandboxBot(source) { return createSandbox(await getQuickJS(), source); }
module.exports = { sandboxBot };

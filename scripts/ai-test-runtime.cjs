// Webpack entry: the portable project uses the very same referee and API.
const { checkAiCode, benchmarkAiCode, aiTestCases, inspectAiSource, checkAiAction } = require('../src/bots/aiCodeTesting');
const { COMBAT_RULES_VERSION } = require('../src/engine/engine');
module.exports = { checkAiCode, benchmarkAiCode, aiTestCases, inspectAiSource, checkAiAction, COMBAT_RULES_VERSION };

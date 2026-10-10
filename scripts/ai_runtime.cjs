// Load the existing engine in Node without bundling the browser or changing RNG.
const fs = require('node:fs');
const path = require('node:path');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const original = require.extensions['.js'];
require.extensions['.js'] = (module, filename) => {
  if (!filename.startsWith(root + path.sep) || filename.includes(`${path.sep}node_modules${path.sep}`)) return original(module, filename);
  const source = fs.readFileSync(filename, 'utf8');
  if (!/^\s*(?:import |export )/m.test(source)) return original(module, filename);
  const compiled = babel.transformSync(source, {
    filename, babelrc: false, configFile: false,
    plugins: ['@babel/plugin-transform-modules-commonjs'],
  });
  module._compile(compiled.code, filename);
};
module.exports = { root };

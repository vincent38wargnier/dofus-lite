// A closed public allowlist: never copy the legacy public/ directory.
process.env.NODE_ENV = 'production';
process.env.BABEL_ENV = 'production';
process.env.REACT_APP_PLATFORM = '1';
process.env.GENERATE_SOURCEMAP = 'false';
const fs = require('node:fs'), path = require('node:path'), webpack = require('webpack');
const root = path.resolve(__dirname, '..');
require('./platform/prepare_public.cjs');
require('react-scripts/config/env');
const paths = require('react-scripts/config/paths');
paths.appPublic = path.join(root, 'web-public'); paths.appHtml = path.join(paths.appPublic, 'index.html');
paths.appBuild = path.join(root, 'build-platform'); paths.appIndexJs = path.join(root, 'src/platform/index.js');
const config = require('react-scripts/config/webpack.config')('production');
config.plugins.push(new webpack.NormalModuleReplacementPlugin(/legacyCatalogue$/, path.join(root, 'src/platform/emptyCatalogue.js')));
config.plugins.push(new webpack.NormalModuleReplacementPlugin(/maisonSource\.json$/, path.join(root, 'src/platform/closedSource.json')));
config.plugins.push(new webpack.NormalModuleReplacementPlugin(/(?:^|\/)builtins$/, path.join(root, 'src/platform/builtins.js')));
config.plugins.push(new webpack.NormalModuleReplacementPlugin(/forgemagieObservations\.json$/, path.join(root, 'src/platform/emptyObservations.json')));
fs.mkdirSync(paths.appBuild, { recursive: true });
webpack(config, (error, stats) => {
  if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; return; }
  const forbidden = /src\/engine\/(?:legacyCatalogue|legacyClassData|spellLibrary|monsterData|equipmentData|dungeonData|dungeonMaps|dofusMaps|forgemagieData)\./;
  const modules = stats.toJson({ all: false, modules: true, nestedModules: true }).modules || [];
  const flatten = list => list.flatMap(m => [m, ...flatten(m.modules || [])]);
  const leaks = flatten(modules).filter(m => forbidden.test(m.name || m.identifier || ''));
  if (leaks.length) { console.error('The public build contains a private catalog:', leaks.map(m => m.name)); process.exitCode = 1; return; }
  // Remove stale files, keep only this compilation and explicitly public files.
  const current = new Set(Object.keys(stats.compilation.assets));
  for (const file of fs.readdirSync(paths.appBuild, { recursive: true })) {
    const p = path.join(paths.appBuild, file);
    if (fs.statSync(p).isFile() && !current.has(file) && !fs.existsSync(path.join(paths.appPublic, file))) fs.unlinkSync(p);
  }
  for (const file of fs.readdirSync(paths.appPublic)) if (file !== 'index.html') fs.cpSync(path.join(paths.appPublic, file), path.join(paths.appBuild, file), { recursive: true });
  console.log(stats.toString({ all: false, warnings: true, timings: true, assets: true }));
});

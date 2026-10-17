const path = require('node:path'), webpack = require('webpack');
const root = path.resolve(__dirname, '..');
webpack({ mode: 'production', target: 'node22', context: root, entry: { runtime: './server/runtime-entry.cjs', library: './server/library-entry.cjs' },
  devtool: false, output: { path: path.join(root, 'server/generated'), filename: '[name].cjs', library: { type: 'commonjs2' } },
  optimization: { minimize: false }, performance: { hints: false },
  plugins: [new webpack.DefinePlugin({ 'process.env.REACT_APP_PLATFORM': '"1"', 'process.env.NODE_ENV': '"test"' }),
    new webpack.NormalModuleReplacementPlugin(/legacyCatalogue$/, path.join(root, 'src/platform/emptyCatalogue.js'))],
}, (error, stats) => { if (error || stats.hasErrors()) { console.error(error || stats.toString({ all: false, errors: true })); process.exitCode = 1; }
  else console.log('Private server combat runtime built.'); });

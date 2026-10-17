const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../build-platform');
const files=fs.readdirSync(root,{recursive:true}).filter(f=>fs.statSync(path.join(root,f)).isFile());
for(const f of files){assert.ok(!/(^|\/)(src|server|dofus-local|adventures|models|skills)\//.test(f),f);assert.ok(!/\.map$|runtime\.cjs$|authoring-kit\.zip$|ai-coding/.test(f),f);}
assert.ok(files.includes('index.html'));assert.ok(files.includes('vendor/quickjs.wasm'));
const js=files.filter(f=>/^static\/js\/.*\.js$/.test(f)).map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
for(const name of ['Caverne de Nowel','Bouftou Royal','Winterfell —','Les Huit Mémoires','Roi de la Nuit'])assert.ok(!js.includes(name),'Private content included: '+name);
console.log(`Public artifact passed: ${files.length} allowlisted files; no source maps, engine SDK, themed catalog or adventure assets.`);

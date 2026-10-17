// Explicitly public engine dependencies and blank authoring templates only.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..'),target=path.join(root,'web-public');
function copy(from,to){fs.mkdirSync(path.dirname(to),{recursive:true});fs.copyFileSync(from,to);}
copy(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm'),path.join(target,'vendor/quickjs.wasm'));
const ruffle=path.dirname(require.resolve('@ruffle-rs/ruffle/package.json'));
const {limitedRuffle}=require('./limited_ruffle.cjs');
for(const name of fs.readdirSync(ruffle))if(/\.(js|wasm)$/.test(name)||/license/i.test(name)) {
  const destination=path.join(target,'ruffle',name);
  if(name.endsWith('.js')){fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,limitedRuffle(name,fs.readFileSync(path.join(ruffle,name),'utf8')));}
  else copy(path.join(ruffle,name),destination);
}
const templates=path.join(root,'public/templates/character-artwork');
for(const dir of ['blank','guides'])for(const file of fs.readdirSync(path.join(templates,dir)))if(/\.(png|svg)$/.test(file))copy(path.join(templates,dir,file),path.join(target,'templates/character-artwork',dir,file));
const guide=`<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Créer une apparence · Arena Forge</title><link rel="stylesheet" href="guide.css"><main><a href="/">← Arena Forge</a><h1>Une silhouette. Votre identité.</h1><p>Ces gabarits sont vides : dessinez votre personnage, ou utilisez le prompt de chaque image dans l’Atelier. Importez ensuite vos PNG.</p><img width="256" height="256" src="guides/idle-front.svg" alt="Gabarit avec pieds à 128,224"><table><thead><tr><th>Fichiers PNG</th><th>Dimensions</th><th>Images</th></tr></thead><tbody><tr><td>portrait, idle-front, idle-back</td><td>256 × 256</td><td>1</td></tr><tr><td>walk-front/back, cast-front/back</td><td>1536 × 256</td><td>6</td></tr><tr><td>hit-front/back</td><td>768 × 256</td><td>3</td></tr></tbody></table><p>Les trois premières images sont requises. Les animations sont facultatives. Fond transparent, pieds à (128,224) dans chaque case. Face vers le sud-est ; dos vers le nord-ouest.</p><p><a href="../character-artwork-kit.zip" download>Télécharger tous les gabarits</a></p><p>2 Mio par PNG, 12 Mio par apparence. Les images et leurs données se partagent ; aucun code du jeu n’est inclus.</p></main></html>`;
fs.writeFileSync(path.join(target,'templates/character-artwork/index.html'),guide);
fs.writeFileSync(path.join(target,'templates/character-artwork/guide.css'),'body{background:#111a18;color:#eceee6;font:17px/1.6 system-ui;margin:0}main{max-width:800px;margin:40px auto;padding:24px}a{color:#c5f16b}td,th{padding:14px;border-bottom:1px solid #40534a;text-align:left}table{width:100%;font-size:14px}img{background:#263b33;border-radius:20px}');
const {writeContentZip}=require('../../server/generated/library.cjs');
const files=new Map();for(const dir of ['blank','guides'])for(const file of fs.readdirSync(path.join(templates,dir)))if(/\.(png|svg)$/.test(file))files.set(dir+'/'+file,fs.readFileSync(path.join(templates,dir,file)));
files.set('README.txt','Arena Forge — blank artwork templates. Transparent RGBA PNG, frames 256×256, feet 128,224. Required: portrait, idle-front, idle-back. Optional walk/cast: 6 frames; hit: 3 frames. No game source or character content included.');
fs.writeFileSync(path.join(target,'templates/character-artwork-kit.zip'),writeContentZip(files));
console.log('Public runtime dependencies and blank templates prepared.');

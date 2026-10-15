// Original code-drawn guides, generated from the actual engine coordinates.
// No native background artwork is copied into the portable kit.
require('./ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const puppeteer = require('puppeteer-core');
const { buildSpellFx } = require('./build_spell_fx_templates.cjs');
const { MAPS } = require('../src/engine/maps');
const { visualPromptCatalogue, visualPromptText, VISUAL_SUPPORT } = require('../src/content/visualPrompts');
const ARTWORK = require('../src/ui/characterArtworkSpec.json');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'public/templates/ai-design');
const esc = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const write = (name, value) => { const target = path.join(output, name); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
const svg = (width, height, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
const palette = { WALKABLE: '#e6e7d3', BLOCKS_LOS: '#596663', BLOCKS_MOVE: '#8ba7b2', VOID: 'transparent', A: '#246aab', B: '#b64537' };

function mapGeometry(map, art) {
  const hw = art?.hw || 28, hh = hw / 2, top = art?.top ?? hw * 2.4;
  const originX = art?.originX ?? map.height;
  const canvas = { width: Math.ceil(art?.width || (map.width + map.height) * hw),
    height: Math.ceil(art?.height || top + (map.width + map.height) * hh + hh * 1.3 + 8) };
  const cells = [];
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const obstacle = map.obstacles[`${x},${y}`];
    const elevation = art?.elevations?.[`${x},${y}`] || 0;
    const cx = (x - y + originX) * hw, cy = top + (x + y + 1) * hh - elevation;
    cells.push({ x, y, type: obstacle?.type || 'FLOOR', blocksMove: !!obstacle?.blocksMove, blocksLos: !!obstacle?.blocksLos,
      elevation, center: [cx, cy], polygon: [[cx, cy - hh], [cx + hw, cy], [cx, cy + hh], [cx - hw, cy]] });
  }
  const reference = { board: map, projection: art ? { hw, top, originX, elevations: art.elevations, width: art.width, height: art.height } : null };
  return { format: 'dofus-lite-map-design-reference', version: 1, importable: false,
    mapId: map.id, name: map.name.replace('🗺 ', ''), sourceHash: crypto.createHash('sha256').update(JSON.stringify(reference)).digest('hex'),
    note: 'Design reference only. Both ZIP importers retain existing mapId; this does not enable map PNGs or new geometry.',
    canvas, projection: { kind: 'orthographic-2:1', hw, hh, top, originX, coordinates: 'top-left pixels, no crop or scale',
      centerX: '(x-y+originX)*hw', centerY: 'top+(x+y+1)*hh-elevation', source: art ? 'native-renderer' : 'procedural-renderer' },
    legend: palette, board: { width: map.width, height: map.height }, spawns: map.spawns, startingCells: map.startingCells, cells };
}

function mapSvg(geometry, labels) {
  const hw = geometry.projection.hw;
  const cells = geometry.cells.filter(cell => cell.type !== 'VOID').sort((a, b) => a.x + a.y - b.x - b.y);
  const base = cells.map(cell => `<polygon points="${cell.polygon.map(p => p.join(',')).join(' ')}" fill="${cell.blocksLos ? palette.BLOCKS_LOS : cell.blocksMove ? palette.BLOCKS_MOVE : palette.WALKABLE}" stroke="#ffffff" stroke-opacity="${labels ? '.65' : '.2'}" stroke-width=".6"/>`).join('');
  const overlay = labels ? cells.map(cell => {
    const team = geometry.startingCells.findIndex(starts => starts.some(pos => pos.x === cell.x && pos.y === cell.y));
    const [x, y] = cell.center;
    return (team >= 0 ? `<polygon points="${cell.polygon.map(p => p.join(',')).join(' ')}" fill="none" stroke="${palette[team === 0 ? 'A' : 'B']}" stroke-width="2.5"/>` : '')
      + `<text x="${x}" y="${y + 2.5}" text-anchor="middle" font-family="Arial,sans-serif" font-size="${Math.min(7, hw / 3)}" fill="${cell.blocksLos ? '#ffffff' : '#2c433e'}">${team >= 0 ? `${team === 0 ? 'A' : 'B'} ` : ''}${cell.x},${cell.y}</text>`;
  }).join('') : '';
  return svg(geometry.canvas.width, geometry.canvas.height, `<g id="footprint">${base}</g><g id="technical-overlay-hide-before-final-export">${overlay}</g>`);
}

const start = `# Générer tous les visuels avec une IA

Ouvrez **index.html** : le guide fonctionne aussi hors ligne, sans compte ni accès au dépôt. Choisissez votre thème, puis utilisez les prompts avec une IA qui sait créer des images. Ce dossier contient des gabarits techniques, pas des illustrations de thème déjà produites.

## Parcours

1. Utilisez prompts/00-direction-artistique.txt pour la palette, les silhouettes et la liste de fichiers. Les règles mécaniques restent dans les prompts runtime-class/runtime-dungeon du kit.
2. Pour chaque classe ou monstre DISTINCT, validez d'abord idle-front.png. Donnez cette image de référence à l'IA pour le dos, le portrait et les animations : les prompts 01–09 détaillent chaque fichier. Utilisez les guides et canevas dans character/. Les doublons d'un monstre peuvent partager leurs images.
3. Créez une icône par sort avec le prompt 10 et spell-icon-guide.svg. Le nom de fichier doit correspondre au chemin icon déclaré ; les animations et sons des sorts restent ceux du visualSpellId choisi.
4. Pour le décor, choisissez le terrain dans la galerie. Joignez maps/<mapId>/guide.png, clean.png et geometry.json. Le prompt.txt de ce dossier fixe les dimensions du terrain choisi. Les prompts 12–14 couvrent la carte complète, les couches et les objets isolés.
5. Le prompt 11 couvre chaque famille d'équipement, y compris familiers et montures ; le prompt 15 produit une couverture facultative, et le 16 un brief d'effets/sons. Les tailles d'équipement/couverture sont des conventions de travail, pas des formats d'import.
6. Pour les animations de sorts originales, le prompt 17 décrit un effet complet ; les prompts 18–23 détaillent lancement, projectile, traînée, impact, aura et rayon. Ouvrez spell-fx/index.html pour l'aperçu animé hors ligne. Le dossier contient six gabarits, un schéma JSON et quatre exemples complets. Ces sources ne sont pas encore importables en combat.
7. Vérifiez chaque image, puis les fichiers et les règles avant livraison. Livrez le ZIP jouable et les sources de design séparément. Pour une aventure avec héros équipés, préparez les héros dans l'Atelier, activez « Prêt à jouer », puis utilisez « Exporter l’aventure ». Le guide complet est dans ../../references/content-packages.md dans le kit portable.

## Ce qui s'importe aujourd'hui

| Élément | Sortie | Statut |
| --- | --- | --- |
| Classe / monstre / boss | 3 PNG de 256×256, plus 6 planches facultatives | Importable |
| Icône de sort | PNG 64×64, chemin déclaré | Importable |
| Équipement | Statistiques + forme/couleur intégrées | Export Atelier ; PNG libre non importable |
| Décor et couches de carte | PNG aux dimensions de geometry.json | Design préparatoire |
| Effet de sort original | effect.json + 1–6 planches PNG ; aperçu fourni | Design préparatoire |
| Illustration ou son original | Sources séparées | Design préparatoire |

Le ZIP content.json ne doit contenir que son manifeste et les PNG de personnages/sorts déclarés. Le ZIP atelier.json vient de l'export du jeu et conserve aussi les héros, règles et équipements. **Aucun de ces ZIP ne charge un décor de carte ou une image d'objet libre.** Ne mettez donc ni les guides, ni les sources, ni cette documentation dans un ZIP jouable. Le kit de création complet n'est pas lui-même un package à importer.

## Cartes : le visuel ne définit pas les règles

geometry.json reprend les cellules du moteur, leurs obstacles, leurs blocages de déplacement/ligne de vue, les départs A/B et la projection utilisée par le rendu. Les trois arènes procédurales utilisent leur projection de repli ; les autres gardent les dimensions et reliefs importés. Les illustrations du client ne sont pas redistribuées dans ces gabarits.

La légende est disponible dans geometry.json : sol clair = praticable, gris sombre = obstacle bloquant la vue, bleu-gris = obstacle laissant passer la vue, transparent = hors terrain. Les lettres A/B et coordonnées doivent disparaître du rendu final. Chaque contour de case et chaque passage doivent rester au même endroit ; une jolie image ne suffit pas à vérifier cet alignement. Superposez guide.svg à l'image et contrôlez toutes les zones de départ et tous les couloirs. Évitez les objets hauts devant les cases jouables. background/ground/scenery sont des noms de travail pour les sources, pas des champs reconnus par le moteur.

## Contrôle des PNG

Dans le kit décompressé, depuis le dossier retro-class-designer :

\x60\x60\x60bash
node scripts/check-visuals.cjs character /chemin/vers/artwork/mon-heros
node scripts/check-visuals.cjs icon /chemin/vers/icons/mon-sort.png
node scripts/check-spell-fx.cjs /chemin/vers/design-sources/spell-fx/mon-sort
\x60\x60\x60

Le contrôle vérifie dimensions, alpha, images non vides par frame, encodage et limites de taille. Il ne juge pas le style, la stabilité des pieds, la continuité du mouvement ni l'équilibre du personnage. Examinez face/dos, les quatre directions par miroir, les six pas, les six poses de lancer et les trois réactions, en taille réelle. Un personnage mort disparaît : aucune image de mort n'est requise.

Les outils d'image ne garantissent pas la taille exacte ou les vrais fonds transparents. Corrigez les sorties avant import ; n'inventez pas de réussite. Les fichiers blank/ sont volontairement vides et le vérificateur doit les refuser comme images finales.
`;

function html(prompts, maps) {
  const status = support => support === 'importable' ? 'Importable' : support === 'reference' ? 'Plan de création' : 'Design préparatoire';
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kit visuel IA · Dofus Koliséum</title>
<style>*{box-sizing:border-box}body{margin:0;background:#f1f0e8;color:#28392f;font:15px/1.65 system-ui,sans-serif}main{max-width:1160px;margin:auto;padding:48px 24px}h1{font-size:clamp(32px,5vw,54px);line-height:1.12;margin:12px 0}h2{font-size:27px;margin:42px 0 18px}h3{margin:0;font-size:17px}a{color:#496c39}p{max-width:850px}.tag{letter-spacing:.15em;font-size:12px;font-weight:750;color:#738752}.intro{display:grid;grid-template-columns:1.5fr 1fr;gap:32px;align-items:center}.hero{padding:24px;background:#e3e9d5;border:1px solid #c6d4ae;border-radius:20px}.hero img{width:100%;display:block}.note{background:#fffaf0;border:1px solid #e0d3b5;padding:18px 22px;border-radius:14px}.steps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.steps>div,.prompt,.map{padding:18px;border:1px solid #d4dbc9;border-radius:14px;background:#fffef9}.steps b{display:block}.prompts{display:grid;grid-template-columns:1fr 1fr;gap:12px}.prompt small{display:block;color:#718063;margin:6px 0}.prompt summary{cursor:pointer;font-weight:650}.prompt pre{white-space:pre-wrap;font:13px/1.6 system-ui;max-height:300px;overflow:auto}.actions{display:flex;gap:12px;flex-wrap:wrap;margin:14px 0}.actions>a,button{display:inline-block;border:1px solid #cbd5ba;border-radius:8px;padding:9px 13px;background:#eaf0df;color:#405431;text-decoration:none;cursor:pointer;font:inherit}.search{width:100%;padding:14px;border-radius:10px;border:1px solid #bbc9a8;background:white;font:inherit;margin-bottom:18px}.maps{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.map img{width:100%;height:170px;object-fit:contain;background:repeating-conic-gradient(#f3f5ec 0% 25%,#fff 0% 50%) 0/16px 16px}.map small{display:block;color:#718063}.map a{font-size:13px}.map[hidden]{display:none}code{font-size:12px;overflow-wrap:anywhere}.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:13px;margin:14px 0}.legend i{display:inline-block;width:15px;height:15px;vertical-align:middle;margin-right:6px;border:1px solid #aab5a6}.details{color:#65775c;font-size:13px}button:focus-visible,a:focus-visible{outline:3px solid #729256;outline-offset:2px}@media(max-width:700px){main{padding:24px 16px}.intro,.steps,.prompts{grid-template-columns:1fr}.maps{grid-template-columns:1fr 1fr}.hero{display:none}.map{padding:10px}.map img{height:130px}}</style>
<main><div class="intro"><div><span class="tag">L’ATELIER · KIT VISUEL IA</span><h1>Tous les visuels.<br>Un même univers.</h1><p>Personnages, monstres, sorts, objets et cartes : ${prompts.length} prompts détaillés, les bons gabarits et ${maps.length} terrains de référence.</p><div class="actions"><a href="START-HERE.md">Mode d’emploi</a><a href="prompts/all-prompts.txt" download>Tous les prompts</a><a href="inventory.json" download>Liste des fichiers</a></div><p class="details">Ouvrez cette page depuis le kit décompressé pour travailler hors ligne.</p></div><div class="hero"><img src="maps/dungeon_2083/guide.png" alt="Guide technique du terrain du Bouftou Royal"><p class="details">Un guide tiré du moteur : cases, obstacles et départs.</p></div></div>
<div class="note"><strong>Images importables aujourd’hui :</strong> personnages, monstres et icônes de sorts. Les décors de carte, PNG d’équipement, couvertures et effets originaux restent des designs préparatoires. Conservez-les dans vos sources, hors du ZIP jouable.</div>
<h2>Du thème aux fichiers</h2><div class="steps"><div><b>1. Fixez votre univers</b>Palette, lumière, silhouettes et références communes.</div><div><b>2. Générez chaque élément</b>Un prompt par image ; une identité stable entre les poses.</div><div><b>3. Vérifiez puis importez</b>Dimensions, transparence et animations avant le ZIP.</div></div>
<h2>Prompts prêts à copier</h2><p>Remplacez le thème et la description en tête du prompt. Joignez les références indiquées. Les mêmes 9 images servent aux héros, monstres et boss.</p><div class="prompts">${prompts.map(row => `<article class="prompt"><h3>${esc(row.title)}</h3><small>${status(row.support)}${row.width ? ` · ${row.width} × ${row.height}` : ''}</small><details><summary>Lire le prompt</summary><pre>${esc(row.prompt)}</pre></details><div class="actions"><button type="button" data-copy="${row.id}">Copier</button><a href="prompts/${row.id}.txt" download>Télécharger</a></div><span role="status" class="details"></span></article>`).join('')}</div>
<h2>Gabarits de personnages et d’icônes</h2><p>Chaque frame mesure 256 × 256, avec les pieds en (128, 224). Les guides sont à masquer avant export.</p><div class="actions">${ARTWORK.files.map(f => `<a href="character/guides/${f.name.replace('.png', '.svg')}">${esc(f.label)}</a>`).join('')}<a href="spell-icon-guide.svg">Icône de sort · 64 × 64</a><a href="equipment-guide.svg">Design d’objet · 256 × 256</a></div>
<h2>Animations de sorts</h2><p>Un prompt complet, six gabarits et quatre exemples animés : lancement, projectile, traînée, impact, aura et rayon. Vérifiez vos PNG et leur timing dans l’aperçu hors ligne. Ces effets restent des sources de design ; leur lecture en combat n’est pas encore intégrée.</p><div class="actions"><a href="spell-fx/index.html">Ouvrir l’aperçu animé</a><a href="prompts/17-animation-sort-complete.txt" download>Prompt complet d’effet</a><a href="spell-fx/SPEC.md">Règles des animations</a></div>
<h2>${maps.length} guides de cartes</h2><p>Choisissez un terrain, puis donnez son guide PNG et son JSON à l’IA. Le prompt de chaque carte précise son canevas. Aucun décor du client n’est inclus ; ces images représentent la géométrie.</p><div class="legend"><span><i style="background:${palette.WALKABLE}"></i>Sol praticable</span><span><i style="background:${palette.BLOCKS_LOS}"></i>Bloque le passage et la vue</span><span><i style="background:${palette.BLOCKS_MOVE}"></i>Bloque le passage seulement</span><span>A / B : placements</span></div><input class="search" type="search" aria-label="Rechercher un terrain" placeholder="Bouftou, arène, Nowel…"><div class="maps">${maps.map(map => `<article class="map" data-search="${esc(`${map.id} ${map.name}`.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())}"><img src="maps/${map.id}/guide.png" loading="lazy" alt="Guide ${esc(map.name)}"><h3>${esc(map.name)}</h3><small>${map.width} × ${map.height} px · ${map.walkable} cases libres</small><code>${map.id}</code><div class="actions"><a href="maps/${map.id}/prompt.txt" download>Prompt</a><a href="maps/${map.id}/guide.png" download>Guide PNG</a><a href="maps/${map.id}/clean.png" download>Sans repères</a><a href="maps/${map.id}/guide.svg" download>SVG</a><a href="maps/${map.id}/geometry.json" download>Géométrie JSON</a></div></article>`).join('')}</div>
<h2>Livraison du package</h2><p>Les règles de sorts, niveaux, budgets et équipements restent celles du kit complet. Pour un donjon avec héros déjà équipés : importez vos créations, préparez les héros, activez <b>Prêt à jouer</b>, puis exportez l’aventure depuis l’Atelier. Un design généré ne rend pas une nouvelle mécanique exécutable.</p></main>
<script>const prompts=${JSON.stringify(Object.fromEntries(prompts.map(p => [p.id, p.prompt]))).replaceAll('<', '\\u003c')};document.querySelectorAll('[data-copy]').forEach(button=>button.addEventListener('click',async()=>{const row=button.closest('article');try{await navigator.clipboard.writeText(prompts[button.dataset.copy]);row.querySelector('[role=status]').textContent='Prompt copié.';}catch(e){row.querySelector('details').open=true;const range=document.createRange();range.selectNodeContents(row.querySelector('pre'));const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);row.querySelector('[role=status]').textContent='Texte sélectionné : utilisez Copier.';}}));document.querySelector('.search').addEventListener('input',event=>{const q=event.target.value.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();document.querySelectorAll('[data-search]').forEach(card=>card.hidden=!card.dataset.search.includes(q));});</script></html>`;
}

async function build() {
  await buildSpellFx();
  const manifestPath = path.join(root, 'public/dofus-local/manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('Import the native map manifest first; do not silently approximate its projection.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const prompts = visualPromptCatalogue(), maps = [];
  for (const row of prompts) write(`prompts/${row.id}.txt`, row.prompt + '\n');
  write('prompts/all-prompts.txt', visualPromptText()); write('START-HERE.md', start);
  for (const kind of ['guides', 'blank']) for (const file of ARTWORK.files) {
    const name = kind === 'guides' ? file.name.replace('.png', '.svg') : file.name;
    write(`character/${kind}/${name}`, fs.readFileSync(path.join(root, 'public/templates/character-artwork', kind, name)));
  }
  write('character/spec.json', JSON.stringify(ARTWORK, null, 2));
  for (const [name, size, margin] of [['spell-icon', 64, 5], ['equipment', 256, 24]]) {
    write(`${name}-guide.svg`, svg(size, size, `<g id="artwork"/><g id="hide-before-export" fill="none" stroke="#789574"><rect x=".5" y=".5" width="${size - 1}" height="${size - 1}"/><rect x="${margin}" y="${margin}" width="${size - 2 * margin}" height="${size - 2 * margin}" stroke-dasharray="2 3"/><path d="M${size / 2} 0V${size}M0 ${size / 2}H${size}" stroke-dasharray="2 3"/></g>`));
  }
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true });
  try {
    const page = await browser.newPage();
    for (const file of ARTWORK.files) {
      const stem = `character/guides/${file.name.replace('.png', '')}`;
      await page.setViewport({ width: file.frames * ARTWORK.frameSize, height: ARTWORK.frameSize, deviceScaleFactor: 1 });
      await page.setContent(`<body style="margin:0">${fs.readFileSync(path.join(output, `${stem}.svg`), 'utf8')}</body>`);
      await page.screenshot({ path: path.join(output, `${stem}.png`), omitBackground: true });
    }
    for (const [name, size] of [['spell-icon', 64], ['equipment', 256]]) {
      await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
      await page.setContent(`<body style="margin:0">${fs.readFileSync(path.join(output, `${name}-guide.svg`), 'utf8')}</body>`);
      await page.screenshot({ path: path.join(output, `${name}-guide.png`), omitBackground: true });
    }
    for (const map of Object.values(MAPS)) {
      const art = manifest.maps[map.id];
      if (map.sourceId != null && !art) throw new Error(`Missing renderer projection for ${map.id}`);
      const geometry = mapGeometry(map, art), folder = `maps/${map.id}`;
      write(`${folder}/geometry.json`, JSON.stringify(geometry));
      write(`${folder}/prompt.txt`, `THEME / CE QUE JE VEUX CREER: [votre thème et votre ambiance].\nMAP ID: ${map.id} (${geometry.name}).\nEXACT CANVAS: ${geometry.canvas.width}x${geometry.canvas.height} pixels.\nAttach guide.png, clean.png and geometry.json from this folder.\n\n${prompts.find(p => p.id === '12-carte-complete').prompt}\n`);
      await page.setViewport({ ...geometry.canvas, deviceScaleFactor: 1 });
      for (const [name, labels] of [['guide', true], ['clean', false]]) {
        const drawing = mapSvg(geometry, labels); write(`${folder}/${name}.svg`, drawing);
        await page.setContent(`<body style="margin:0">${drawing}</body>`);
        await page.screenshot({ path: path.join(output, folder, `${name}.png`), omitBackground: true });
      }
      maps.push({ id: map.id, name: geometry.name, ...geometry.canvas, walkable: geometry.cells.filter(c => !c.blocksMove).length });
    }
  } finally { await browser.close(); }
  write('index.html', html(prompts, maps));
  write('inventory.json', JSON.stringify({ version: 1, support: VISUAL_SUPPORT, character: ARTWORK, prompts: prompts.map(({ prompt, ...row }) => row),
    maps, spellFx: { guide: 'spell-fx/index.html', schema: 'spell-fx/fx.schema.json', templates: 'spell-fx/templates.json', runtimeImportable: false },
    note: 'Authoring assets only. Do not place this inventory or templates in a playable ZIP.' }, null, 2));
  console.log(`Visual kit: ${prompts.length} prompts, ${maps.length} map guides, ${ARTWORK.files.length} character templates → ${output}`);
}

module.exports = { mapGeometry, mapSvg, build };
if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });

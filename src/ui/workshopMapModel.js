import { customMapErrors, MAP_ART_MAX_BYTES } from '../engine/customMaps';
import { readCharacterArtwork, writeArtworkRecords, verifyArtworkPixels } from './characterArtwork';
import { newCreationId } from './creationsStore';

export const MAP_PALETTES = { meadow: { name: 'Prairie', ground: '#68754f', detail: '#899763' }, snow: { name: 'Neige', ground: '#b5cbd5', detail: '#e1ebed' },
  desert: { name: 'Sable', ground: '#b8905c', detail: '#d7b783' }, night: { name: 'Terre sombre', ground: '#414657', detail: '#667085' } };
export const MAP_BRUSHES = [{ id: 'free', label: 'Gomme', hint: 'Rend la case libre.' }, { id: 'barricade', label: 'Barricade', hint: 'Bloque le déplacement, laisse passer la vue.' },
  { id: 'pillar', label: 'Pilier', hint: 'Bloque le déplacement et la vue.' }, { id: 'brazier', label: 'Brasero', hint: 'Bloque le déplacement, laisse passer la vue.' },
  { id: 'A', label: 'Départ allié', hint: '8 à 32 cases bleues.' }, { id: 'B', label: 'Départ ennemi', hint: '8 à 32 cases rouges.' }];
const key = p => `${p.x},${p.y}`;
export function newWorkshopMap(size = 12, id = `custom-${newCreationId()}`) {
  const hw = Math.floor(1440 / (size * 2)), count = size >= 20 ? 32 : 8;
  return { version: 1, id, name: 'Mon terrain', description: '', width: size, height: size,
    background: { artworkId: 'new-map', file: 'ground.png', width: 1536, height: 1024, hw, top: 110, originX: size + 1 },
    obstacles: [], startingCells: [0, 1].map(team => Array.from({ length: count }, (_, i) => ({
      x: team ? size - 2 - Math.floor(i / 8) : 1 + Math.floor(i / 8), y: Math.floor((size - 8) / 2) + i % 8 }))) };
}
export function paintMapCell(map, p, brush) {
  if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height || !MAP_BRUSHES.some(b => b.id === brush)) return map;
  const existing = map.obstacles.find(c=>key(c)===key(p)), camp = map.startingCells.findIndex(list=>list.some(c=>key(c)===key(p)));
  if ((existing?.prop === brush) || (brush === 'free' && !existing && camp < 0) || (brush === 'A' && camp === 0) || (brush === 'B' && camp === 1)) return map;
  if ((brush === 'A' || brush === 'B') && !map.startingCells[brush === 'A' ? 0 : 1].some(c => key(c) === key(p)) && map.startingCells[brush === 'A' ? 0 : 1].length >= 32) return map;
  const obstacles = map.obstacles.filter(c => key(c) !== key(p)), startingCells = map.startingCells.map(camp => camp.filter(c => key(c) !== key(p)));
  if (brush === 'A' || brush === 'B') startingCells[brush === 'A' ? 0 : 1].push({ ...p });
  else if (brush !== 'free') obstacles.push({ ...p, type: brush === 'pillar' ? 'WALL' : 'BUSH', prop: brush });
  return { ...map, obstacles, startingCells };
}
export function mapPoint(map, x, y) {
  const b = map.background; return { x: (x - y + b.originX) * b.hw, y: b.top + (x + y + 1) * b.hw / 2 };
}
export function mapDiamond(map, x, y) {
  const p = mapPoint(map, x, y), w = map.background.hw;
  return `${p.x},${p.y - w / 2} ${p.x + w},${p.y} ${p.x},${p.y + w / 2} ${p.x - w},${p.y}`;
}
export function workshopMapGuide(map) {
  const b = map.background, obstacles = new Set(map.obstacles.map(key)), a = new Set(map.startingCells[0].map(key)), z = new Set(map.startingCells[1].map(key));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${b.width}" height="${b.height}" viewBox="0 0 ${b.width} ${b.height}"><rect width="100%" height="100%" fill="#202b31"/>${Array.from({ length: map.width * map.height }, (_, i) => {
    const x = i % map.width, y = Math.floor(i / map.width), k = `${x},${y}`;
    return `<polygon points="${mapDiamond(map, x, y)}" fill="${obstacles.has(k) ? '#656674' : a.has(k) ? '#65bded' : z.has(k) ? '#e78279' : '#d9e2de'}" stroke="#5c6971" stroke-width="1"/>`;
  }).join('')}</svg>`;
}
export function mapBackgroundPrompt(map, brief = '') {
  const b = map.background;
  return `Crée uniquement le sol de « ${map.name} ». Thème : ${brief || map.description || 'paysage fantasy original'}.\nFichier : ${b.file}, PNG RGBA, exactement ${b.width} × ${b.height} pixels, maximum 8 Mio.\nUtilise le gabarit SVG joint sans changer son cadrage. Projection isométrique 2:1, ${map.width} × ${map.height} cases. Centre d’une case (x,y) : X=(x-y+${b.originX})×${b.hw}, Y=${b.top}+(x+y+1)×${b.hw / 2}.\nDessine un sol plat texturé, lisible sous de petits personnages. Les cases colorées sont des guides, pas des couleurs à reproduire. Supprime la grille et les repères dans le PNG final. Garde la même emprise du sol.\nAucun personnage, texte, interface, mur, arbre, pilier, barricade, brasero, gouffre, escalier ou relief qui suggère une collision. Le jeu ajoute les obstacles séparément, sur les cases peintes dans l’éditeur. Les cases foncées du guide restent du sol sous ces objets. Ne peins pas de passages impossibles. Aucun élément d’un autre jeu. Fond transparent hors du terrain recommandé.\nLivre le PNG lui-même, sans ZIP ni JSON. Il sera importé par « Importer le sol ». L’image ne modifie jamais les cases ou les placements.`;
}
export function mapPropsPrompt(map) {
  return `Crée les trois décors de « ${map.name} ». Thème : ${map.description || 'fantasy originale, cohérente avec le sol joint'}.\nUn seul PNG RGBA transparent, exactement 768 × 256 pixels, maximum 8 Mio : trois images de 256 × 256 côte à côte, sans marge entre elles. De gauche à droite : PILIER, BRASERO, BARRICADE. Vue isométrique 2:1, même éclairage, pas de texte ni de cases dessinées. Chaque objet tient sur une seule case.\nPlace le CENTRE DE SON EMPRISE AU SOL (pas son pixel le plus bas) à (128,208) dans le cadre du pilier, (128,204) dans celui du brasero et (128,196) dans celui de la barricade. Les pieds avant peuvent descendre jusqu’à y=228 ; laisse le bord inférieur transparent. Aucun fond, ombre géante ou obstacle de plusieurs cases. Le moteur ajuste leur largeur et les place au centre des cases bloquées.\nLe pilier bloque le passage et la vue. Les deux autres bloquent seulement le passage. Le feu est un décor, pas une zone de dégâts. Livre le PNG sans JSON. Il remplacera ces trois formes dans la carte ; les collisions resteront celles peintes dans l’éditeur.`;
}
export async function proceduralMapGround(map, palette = 'meadow') {
  const b = map.background, colors = MAP_PALETTES[palette] || MAP_PALETTES.meadow;
  const canvas = document.createElement('canvas'); canvas.width = b.width; canvas.height = b.height;
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const p = mapPoint(map, x, y), hw = b.hw;
    ctx.beginPath(); ctx.moveTo(p.x, p.y - hw / 2); ctx.lineTo(p.x + hw, p.y); ctx.lineTo(p.x, p.y + hw / 2); ctx.lineTo(p.x - hw, p.y); ctx.closePath();
    ctx.fillStyle = (x * 17 + y * 29) % 7 === 0 ? colors.detail : colors.ground; ctx.fill(); ctx.strokeStyle = colors.ground; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = colors.detail; ctx.globalAlpha = .35;
    for (let n = 0; n < 4; n++) { const a = ((x * 29 + y * 13 + n * 41) % 100) / 100 - .5, c = ((x * 11 + y * 23 + n * 17) % 100) / 100 - .5; ctx.fillRect(p.x + (a - c) * hw * .65, p.y + (a + c) * hw * .32, Math.max(2,hw*.06), 1); }
    ctx.globalAlpha = 1;
  }
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Impossible de dessiner le sol.');
  return blob;
}
export async function verifyMapGround(file, map) {
  if (!file?.size || file.size > MAP_ART_MAX_BYTES) throw new Error('Sol : PNG de 8 Mio maximum.');
  const bytes = new Uint8Array(await file.arrayBuffer()), view = new DataView(bytes.buffer), b = map.background;
  if (bytes.length < 24 || ![137,80,78,71,13,10,26,10].every((n,i) => bytes[i] === n) || view.getUint32(16) !== b.width || view.getUint32(20) !== b.height) throw new Error(`Sol : PNG de ${b.width} × ${b.height} pixels requis.`);
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const canvas = document.createElement('canvas'); canvas.width = b.width; canvas.height = b.height; const ctx = canvas.getContext('2d'); ctx.drawImage(img,0,0);
    if (!ctx.getImageData(0,0,b.width,b.height).data.some((v,i) => i % 4 === 3 && v > 0)) throw new Error('Le PNG du sol est vide.');
  } finally { URL.revokeObjectURL(url); }
}
export async function verifyMapProps(file) {
  await verifyMapGround(file, { background: { width:768,height:256 } });
  await verifyArtworkPixels(file, { width:768,height:256,frames:3,pose:'prop' });
}
export async function saveWorkshopMap(map, { ground, palette, props } = {}) {
  const errors = customMapErrors(map); if (errors.length) throw new Error(errors.join(' '));
  let images = {};
  if (map.background.artworkId !== 'new-map') images = { ...(await readCharacterArtwork(map.background.artworkId)).images };
  const file = ground || (palette ? await proceduralMapGround(map, palette) : images[map.background.file]) || await proceduralMapGround(map);
  await verifyMapGround(file, map); images[map.background.file] = file;
  if(props) { await verifyMapProps(props); images[map.background.propsFile] = props; }
  const id = newCreationId();
  await writeArtworkRecords([{ id, name: map.name, version: 1, images }]);
  return { ...map, background: { ...map.background, artworkId: id } };
}

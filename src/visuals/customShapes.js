// Original vector artwork. Only known shapes and six-digit colours are ever
// interpolated, so saved appearances cannot introduce URLs or SVG markup.
export const CUSTOM_COLORS = [
  { name: 'Améthyste', value: '#8964cf' }, { name: 'Océan', value: '#378bc2' },
  { name: 'Émeraude', value: '#36987d' }, { name: 'Or', value: '#cc9b39' },
  { name: 'Corail', value: '#d87558' }, { name: 'Rose', value: '#c96696' },
];
export const DEFAULT_CUSTOM_COLOR = CUSTOM_COLORS[0].value;
export const EQUIPMENT_SHAPES = [
  { id: 'equipment', name: 'Silhouette', detail: 'Selon la famille' },
  { id: 'crystal', name: 'Cristal', detail: 'Facettes lumineuses' },
  { id: 'rune', name: 'Rune', detail: 'Sceau gravé' },
];
export const CHARACTER_SHAPES = [
  { id: 'wanderer', name: 'Voyageur', detail: 'Cape & masque' },
  { id: 'warden', name: 'Gardien', detail: 'Armure sculptée' },
  { id: 'mystic', name: 'Mystique', detail: 'Étoffes & lumière' },
];
export const validShapeColor = color => typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
export const defaultEquipmentAppearance = () => ({ shape: 'equipment', color: DEFAULT_CUSTOM_COLOR });
export const validEquipmentAppearance = value => !!value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === 2 && EQUIPMENT_SHAPES.some(shape => shape.id === value.shape) && validShapeColor(value.color);
const svgUrl = (body, width = 96, height = 96) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`)}`;
// A shared material palette keeps tiny inventory icons and full-size portraits
// legible in every saved colour. Lighting is derived; the saved colour is exact.
const ink = '#101521';
const blend = (hex, toward, amount) => `#${[1, 3, 5].map(offset => Math.round(
  parseInt(hex.slice(offset, offset + 2), 16) * (1 - amount) + parseInt(toward.slice(offset, offset + 2), 16) * amount,
).toString(16).padStart(2, '0')).join('')}`;
function materials(color) {
  const light = blend(color, '#ffffff', .62), dark = blend(color, '#101521', .58);
  return `<defs>
    <linearGradient id="enamel" x1="0" y1="0" x2=".85" y2="1"><stop stop-color="${light}"/><stop offset=".34" stop-color="${color}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${blend(color, '#090f1a', .8)}"/></linearGradient>
    <linearGradient id="silver" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f3f3eb"/><stop offset=".35" stop-color="#b9c6d3"/><stop offset=".52" stop-color="#5e728a"/><stop offset=".77" stop-color="#d5e1e5"/><stop offset="1" stop-color="#4e5c75"/></linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f4e4b6"/><stop offset=".46" stop-color="#c5a77b"/><stop offset="1" stop-color="#765b47"/></linearGradient>
    <linearGradient id="obsidian" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#475062"/><stop offset=".48" stop-color="#252d3d"/><stop offset="1" stop-color="#111927"/></linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <radialGradient id="aura"><stop stop-color="${color}" stop-opacity=".32"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>
    <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#2b3241"/><stop offset="1" stop-color="#111722"/></linearGradient>
  </defs>`;
}
const enamel = 'url(#enamel)', shade = 'url(#shade)', silver = 'url(#silver)', gold = 'url(#gold)', black = 'url(#obsidian)';
// Original, faceted artwork. Each equipment family has its own silhouette.
const glyphs = {
  1: `<path d="M27 17c-3 20 2 34 21 41 20-7 25-21 21-41" fill="none" stroke="${silver}" stroke-width="3"/><path d="M32 23c0 15 4 23 16 28 13-5 17-13 16-28" fill="none" stroke="#dbe7ee" stroke-opacity=".25"/><path d="m48 42 20 19-20 25-20-25Z" fill="${gold}"/><path d="m48 47 14 15-14 18-14-18Z" fill="${enamel}"/><path d="m48 47-4 16 4 17 14-18Z" fill="${shade}"/><path d="m48 48-14 14 10 1Z" fill="#fff" opacity=".55"/><circle cx="48" cy="42" r="3" fill="${silver}"/>`,
  2: `<path d="M29 13c32 7 49 41 45 70l-8-9C70 47 47 26 29 20Z" fill="${silver}"/><path d="M29 18C54 28 70 52 69 74l-8-6C61 48 45 34 34 29Z" fill="${enamel}"/><path d="m29 15-7 51 50 16" fill="none" stroke="#c2d1e3" stroke-width="1.2"/><path d="m16 78 53-56" fill="none" stroke="${gold}" stroke-width="2.8"/><path d="m63 20 15-5-5 15-4-8Z" fill="${silver}"/><path d="m15 78 1-10 9-2-1 10Z" fill="${enamel}"/>`,
  3: `<path d="m23 79 36-43 5 4-33 46Z" fill="${black}"/><path d="m26 81 35-44" fill="none" stroke="${gold}" stroke-width="2"/><path d="m46 27 18-18 16 22-19 20Z" fill="${gold}"/><path d="m49 27 15-14 12 18-15 16Z" fill="${enamel}"/><path d="m64 13-4 19 1 15 15-16Z" fill="${shade}"/><path d="m49 27 11 5 4-19Z" fill="#fff" opacity=".65"/><path d="m43 39 16 13M38 47l13 11" fill="none" stroke="${silver}" stroke-width="2.4"/><path d="M37 15h6m-3-3v6m41 26h6m-3-3v6" fill="none" stroke="#d9dfe9" stroke-width="1.2"/>`,
  4: `<path d="m26 85 28-56 5 2-27 56Z" fill="${gold}"/><path d="m31 72 8-16 4 2-8 16Z" fill="${enamel}"/><path d="M57 43 42 28 55 12 77 13 84 29 69 46l7-20-12-7-12 9Z" fill="${silver}"/><path d="m64 21 9 9-11 12-8-13Z" fill="${enamel}"/><path d="m64 21-2 21 11-12Z" fill="${shade}"/><path d="m47 42 13 6-2 5-14-6Z" fill="${black}"/><path d="m48 42 11 5" fill="none" stroke="#f4e4b6" stroke-width="1.4"/>`,
  5: `<g transform="rotate(-36 48 48)"><path d="M33 11 40 33 36 62 27 62 27 33Z" fill="${silver}"/><path d="m33 11-2 47h5l4-25Z" fill="${enamel}"/><path d="M22 59h20v5H22Z" fill="${gold}"/><path d="M29 64h7v17h-7Z" fill="${black}"/><path d="m29 68 7 3m-7 3 7 3" fill="none" stroke="#c5a77b" stroke-width="1.5"/></g><g transform="rotate(32 54 48)"><path d="m60 10 8 20-2 29H54V30Z" fill="${silver}"/><path d="m60 10-1 45h7l2-25Z" fill="${enamel}"/><path d="M49 56h22v6H49Z" fill="${gold}"/><path d="M57 62h7v21h-7Z" fill="${black}"/><path d="m57 68 7 3m-7 3 7 3" fill="none" stroke="#c5a77b" stroke-width="1.5"/><path d="M56 81h10v4H56Z" fill="${silver}"/></g>`,
  6: `<path d="m62 13 20-5-5 20-36 39-11-10Z" fill="${silver}"/><path d="m78 12-4 13-37 38-3-4Z" fill="${enamel}"/><path d="m62 14 16-2-44 47-4-2Z" fill="#f4f5ee" opacity=".55"/><path d="m24 51 24 24-6 4-9-9-15 16-7-7 16-15-8-9Z" fill="${black}"/><path d="m22 50 7 2 21 20-5 6-6-8-12-12-8-3Z" fill="${gold}"/><path d="m16 75 7 7m-4-11 8 7m-4-11 7 7" fill="none" stroke="${enamel}" stroke-width="3"/><path d="m10 80 6-5 7 8-5 5Z" fill="${silver}"/>`,
  7: `<path d="m29 82 21-47 8 3-19 49Z" fill="${black}"/><path d="m32 80 20-43" fill="none" stroke="${gold}" stroke-width="2"/><path d="m34 69 9 4m-6-11 9 4m-6-11 9 4" fill="none" stroke="${enamel}" stroke-width="4"/><path d="m29 18 14-7 39 18-2 24-13 7-40-20Z" fill="${silver}"/><path d="m29 18 38 18v24L27 40Z" fill="${enamel}"/><path d="m43 11 39 18-15 7-38-18Z" fill="${silver}"/><path d="m67 36 15-7-2 24-13 7Z" fill="${shade}"/><path d="m38 25 19 9v13L37 37Z" fill="${black}"/><path d="m46 28 6 9-7 5-5-9Z" fill="${gold}"/><path d="m28 19 39 18" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="1.2"/>`,
  8: `<path d="m53 41 15-23 5 3-16 26Z" fill="${black}"/><path d="m64 12 12 7 5-9-11-7Z" fill="none" stroke="${gold}" stroke-width="4"/><path d="m40 39 20 12-3 21-25 16-11-28Z" fill="${silver}"/><path d="m40 43 16 10-8 18-16 17-4-25Z" fill="${enamel}"/><path d="m40 44-8 32 16-5 8-18Z" fill="${shade}"/><path d="m40 44-8 32" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.5"/>`,
  9: `<ellipse cx="48" cy="59" rx="23" ry="22" fill="none" stroke="${gold}" stroke-width="8"/><ellipse cx="48" cy="59" rx="17.5" ry="17" fill="none" stroke="#f7e9c2" stroke-opacity=".4" stroke-width="1.5"/><path d="m29 23 15-11 22 8 7 15-23 20-24-17Z" fill="${silver}"/><path d="m33 24 12-8 18 7 6 11-20 17-19-14Z" fill="${enamel}"/><path d="m45 16-4 16 8 19 20-17-15-3Z" fill="${shade}"/><path d="m33 24 8 8 4-16 9 15 9-8Z" fill="#fff" opacity=".5"/><path d="m30 37 11-5 8 19" fill="none" stroke="#e9f2ff" stroke-opacity=".5"/>`,
  10: `<path d="m14 35 16-6 41 5 12 11-3 26-19-5-38 4-10-9Z" fill="${black}"/><path d="m15 38 19-3 33 6 14 8-1 17-17-5-37 3-12-6Z" fill="${shade}"/><path d="m16 41 65 12m-65 4 64 2" fill="none" stroke="${enamel}" stroke-width="2"/><path d="m38 28 24 3 8 18-8 24-25-3-7-20Z" fill="${gold}"/><path d="m42 34 15 2 6 15-5 15-15-2-6-15Z" fill="${black}"/><path d="m49 39 10 12-9 10-9-13Z" fill="${enamel}"/><circle cx="21" cy="49" r="2" fill="${silver}"/><circle cx="74" cy="56" r="2" fill="${silver}"/>`,
  11: `<g opacity=".75" transform="translate(29 -6)"><path d="m19 25 22-3-4 31 17 15-4 9-32-1-4-9Z" fill="${black}"/><path d="m19 25 22-3-4 20-17 3Z" fill="${enamel}"/><path d="m15 66 37 3-2 8-32-1Z" fill="${silver}"/></g><path d="m20 28 24-5-5 36 18 14-2 11-36 1-7-9Z" fill="${black}"/><path d="m20 28 24-5-3 22-22 7Z" fill="${enamel}"/><path d="m22 30 18-4-4 18-15 4Z" fill="${shade}"/><path d="m18 52 23-6-2 10-22 6Z" fill="${gold}"/><path d="m15 74 19-5 21 7-1 7-35 1-7-8Z" fill="${silver}"/><path d="m25 60 9-2m-11 8 12-3" fill="none" stroke="#c5a77b" stroke-width="2"/>`,
  16: `<path d="m48 10 26 17 7 31-14 23-18-12-19 12-15-23 9-31Z" fill="${black}"/><path d="m48 10 26 17-4 21-21 12-26-14 1-19Z" fill="${enamel}"/><path d="m48 10-2 38 23-16 5-5Z" fill="${shade}"/><path d="m47 13 3 36-8 12-6-5 8-14Z" fill="${silver}"/><path d="m24 40 19 9-3 7-16-8Zm29 9 19-11-1 9-17 10Z" fill="#0a101c"/><path d="m25 42 16 8m15 1 13-8" fill="none" stroke="#eaf1ff" stroke-width="1.7"/><path d="m20 48 18 10-8 19-13-19Zm38 11 16-11 4 10-12 19Z" fill="${silver}"/><path d="m22 50 11 9-5 10Zm41 10 10-8-7 18Z" fill="${shade}"/><path d="m48 59 8 6-7 12-9-12Z" fill="${enamel}"/>`,
  17: `<path d="m34 14 13 8 16-9 4 19 17 45-24-4-13 12-17-12-17 4 17-45Z" fill="${shade}"/><path d="m34 14 13 15 16-16-5 29 7 33-18 10-6-39Z" fill="${enamel}"/><path d="m31 33-14 39 15-7 9-31Zm25 10 8 25 15 5-16-42Z" fill="${black}"/><path d="m34 16 13 17 16-18m-46 59 15-5 15 12 14-10 19 5" fill="none" stroke="${gold}" stroke-width="1.6"/><path d="m47 31 6 5-6 8-6-8Z" fill="${silver}"/><path d="m43 45 4 33" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="1.2"/>`,
  18: `<path d="M58 63c32 13 33-27 17-26 10 15-3 24-17 18" fill="${shade}"/><path d="m22 44-2-27 21 16 11-1 21-15-1 31-8 15 3 16H29l-1-19Z" fill="${enamel}"/><path d="m23 23 17 15-15 5Zm46 1L55 38l14 6Z" fill="${black}"/><path d="m25 49 20 9 23-11-10 19-3 14H40l-2-14Z" fill="${silver}"/><path d="m30 47 12 4-2 6-9-4Zm21 3 12-6-2 10-10 3Z" fill="#0d1724"/><path d="m46 56 7 1-5 7-5-4Z" fill="${shade}"/><path d="m36 70 3 10m18-10-2 10" fill="none" stroke="${gold}" stroke-width="2"/>`,
  19: `<path d="m24 86 34-63 6 3-32 64Z" fill="${black}"/><path d="m28 82 31-56" fill="none" stroke="${gold}" stroke-width="2"/><path d="M52 14 65 20l17-2c-8 11-5 24 2 34-15 7-27 1-31-9L35 34Z" fill="${silver}"/><path d="m54 19 10 6 12-3c-4 10-3 18 2 27-12 2-17-2-20-9l-15-8Z" fill="${enamel}"/><path d="m64 25-6 15 20 9c-5-9-6-17-2-27Z" fill="${shade}"/><path d="m56 14 11 6-4 8-11-6Z" fill="${gold}"/>`,
  81: `<path d="M35 23c-1-15 25-15 26 0" fill="none" stroke="${gold}" stroke-width="4"/><path d="m24 24 42-5 12 16-2 43-49 7-9-16Z" fill="${black}"/><path d="m25 28 39-4 6 15-40 6Z" fill="${enamel}"/><path d="m29 43 39-5 2 37-41 6Z" fill="${shade}"/><path d="m31 55 30-4 2 18-31 5Z" fill="${enamel}"/><path d="m33 26 6-1 1 27-6 1Zm23-3 6-1 3 27-6 1Z" fill="${gold}"/><path d="m31 55 30-4m-26 17 23-4" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.2"/>`,
  82: `<path d="m48 8 33 15-5 37-28 28-28-28-5-37Z" fill="${silver}"/><path d="m48 13 28 13-5 32-23 24-23-24-5-32Z" fill="${enamel}"/><path d="m48 13 28 13-5 32-23 24Z" fill="${shade}"/><path d="m48 22 18 10-3 22-15 18-15-18-3-22Z" fill="${black}"/><path d="m48 30 10 16-10 17-10-17Z" fill="${gold}"/><path d="m48 32 1 16-9-2Z" fill="#fff" opacity=".4"/>`,
  97: `<path d="m23 34 20-22 25 8 12 23-8 16-17-6-5 11 19 16H24l14-28-14-8Z" fill="${shade}"/><path d="m43 12 7 17-12 23-14-8-1-10Z" fill="${silver}"/><path d="m50 29 18-9 12 23-14 6-14-8Z" fill="${enamel}"/><path d="m42 51 9 3-8 15 20 10H29Z" fill="${black}"/><path d="m56 33 10-1-4 7-6-2Z" fill="#eaf5ff"/><path d="m24 34 20-18m-15 24 17-17" fill="none" stroke="${gold}" stroke-width="2"/>`,
};
const crystal = `<path d="m48 8 21 21 11 33-32 27-32-27 11-33Z" fill="${shade}"/><path d="m48 8-9 25-23 29 11-33Z" fill="${silver}"/><path d="m48 8 9 25 23 29-11-33Z" fill="${enamel}"/><path d="m39 33 18 0-9 56Z" fill="${enamel}"/><path d="m16 62 23-29 9 56Z" fill="${shade}"/><path d="m57 33 23 29-32 27Z" fill="${black}"/><path d="m48 8-9 25 9 56 9-56Z" fill="none" stroke="#e4f0ff" stroke-opacity=".5" stroke-width="1"/><path d="m48 8 9 25-9 10-9-10Z" fill="#fff" opacity=".3"/><path d="m15 22 2 5 5 2-5 2-2 5-2-5-5-2 5-2Zm65 48 1 4 4 1-4 1-1 4-1-4-4-1 4-1Z" fill="#dfeafc"/>`;
const rune = `<path d="m48 11 31 18v37L48 85 17 66V29Z" fill="${gold}"/><path d="m48 14 28 17v33L48 82 20 64V31Z" fill="${black}"/><path d="m48 20 23 14v27L48 75 25 61V34Z" fill="none" stroke="${enamel}" stroke-width="1.6"/><path d="m48 26 13 22-13 22-13-22Z" fill="${shade}"/><path d="m48 26 13 22-13 22-13-22Zm0 0v44M29 48h38" fill="none" stroke="${enamel}" stroke-width="2.8"/><path d="m48 27 4 14 7 7-11 8-11-8 7-7Z" fill="${enamel}"/><path d="m48 30 2 13-2 10-2-10Z" fill="#f4f5ef"/><path d="M32 26v5m32-5v5M31 66v5m34-5v5" fill="none" stroke="${gold}" stroke-width="1.2"/>`;
export function equipmentShapeImage(type, appearance) {
  if (!validEquipmentAppearance(appearance)) return null;
  const { color, shape } = appearance;
  const glyph = shape === 'crystal' ? crystal : shape === 'rune' ? rune : glyphs[type] || glyphs[6];
  return svgUrl(`${materials(color)}
    <rect x="1" y="1" width="94" height="94" rx="21" fill="url(#plate)"/>
    <rect x="1.5" y="1.5" width="93" height="93" rx="20.5" fill="none" stroke="#8b96b0" stroke-opacity=".3"/>
    <circle cx="45" cy="38" r="47" fill="url(#aura)"/>
    <path d="M12 30V21a9 9 0 0 1 9-9h9M66 84h9a9 9 0 0 0 9-9v-9" fill="none" stroke="${color}" stroke-opacity=".4" stroke-width="1"/>
    <ellipse cx="49" cy="83" rx="25" ry="4" fill="#050912" opacity=".4"/>
    <g stroke-linejoin="round" stroke-linecap="round">${glyph}</g>`);
}

export function characterShapeId(shape = 'wanderer', color = DEFAULT_CUSTOM_COLOR) {
  if (!CHARACTER_SHAPES.some(entry => entry.id === shape) || !validShapeColor(color)) return null;
  return `shape-v1-${shape}-${color.slice(1).toLowerCase()}`;
}
export function parseCharacterShape(id) {
  const match = typeof id === 'string' && /^shape-v1-(wanderer|warden|mystic)-([a-f0-9]{6})$/.exec(id);
  return match ? { shape: match[1], color: `#${match[2]}` } : null;
}

// The three figures have distinct cuts, armour and silhouettes. Their feet keep
// the same (128,224) anchor, including the planted foot in each walk frame.
function figure(shape, color, back, pose, frame) {
  const stride = pose === 'walk' ? [0, 7, 12, 0, -7, -12][frame % 6] : 0;
  const casting = pose === 'cast' ? [0, 12, 42, 57, 32, 0][frame % 6] : 0;
  const lean = pose === 'hit' ? [0, -7, -3][frame % 3] : 0;
  const bob = stride ? -2 : 0;
  const glow = casting > 20;
  const leg = (far = false) => `<g transform="translate(${far ? -stride : stride} ${stride && (far ? stride < 0 : stride > 0) ? -5 : 0})">
    <path d="${far ? 'm132 153 17 2-1 35 7 28-14 2-11-30Z' : 'm110 151 19 4-5 35-5 33-14-3 1-33Z'}" fill="${black}"/>
    <path d="${far ? 'm136 184 13-1 5 30-11 2Z' : 'm106 185 17 3-5 28-14-3Z'}" fill="${shape === 'warden' ? silver : shade}"/>
    <path d="${far ? 'm142 211 12-1 12 10-2 4-24-2Z' : 'm105 211 14 4 3 9-26 0-1-5Z'}" fill="${black}"/>
    <path d="${far ? 'm143 213 9-1 8 6-18-1Z' : 'm105 214 11 2 1 5-17-1Z'}" fill="${silver}"/>
    </g>`;
  const hand = (x, y) => `<path d="m${x} ${y} 7-2 5 8-3 7-8-3Z" fill="${black}"/><path d="m${x + 1} ${y} 6-1 2 4-7 2Z" fill="${silver}"/>`;
  const head = shape === 'warden'
    ? `<path d="m116 37 18-8 19 13 9 25-13 17-29-6-12-17Z" fill="${silver}"/>
       <path d="m133 31 20 11 5 16-24 6-16-12Z" fill="${enamel}"/><path d="m134 32 1 29 20-15Z" fill="${shade}"/>
       <path d="m123 54 34-1-1 15-18 10-17-12Z" fill="${black}"/>
       ${back ? `<path d="m118 49 14 15 18-7-2 18-17 8-14-12Z" fill="${shade}"/><path d="m131 63 1 18" stroke="${gold}" fill="none"/>`
      : `<path d="m131 60 26-3-2 5-23 3Z" fill="${color}"/><path d="m136 61 18-2" stroke="#e9f7ff" stroke-width="1.4"/><path d="m127 65 9 6 3 11-13-7Z" fill="${silver}"/><path d="m155 64-9 11-3 8 12-8Z" fill="${silver}"/>`}
       <path d="m129 32 4-13 8 14-6 14Z" fill="${gold}"/>`
    : shape === 'mystic'
      ? `<path d="m110 62 11-24 16-10 17 17 6 22-12 15-27-2Z" fill="${shade}"/>
         <path d="m121 38 16-10 17 17-9-6-12 8-9 24-14-9Z" fill="${enamel}"/>
         ${back ? `<path d="m117 57 18-17 15 10-6 24-15 10Z" fill="${enamel}"/><path d="m135 41-7 35" stroke="${gold}" fill="none"/>`
        : `<path d="m133 47 17-3 5 18-13 15-16-7Z" fill="${silver}"/><path d="m133 59 6 2-1 4-6-1Zm10-1 8-3-1 5-6 3Z" fill="${black}"/><path d="m142 45 1 16-4 10" fill="none" stroke="${gold}" stroke-width="2"/>`}
         <path d="m119 38-3-14 19 8 14-12 5 18-13-4-8 9Z" fill="${gold}"/>`
      : '';
  const wandererHead = `<path d="m108 68 3-28 18-13 23 10 10 24-12 20-25-2Z" fill="${shade}"/>
    <path d="m111 40 18-13 23 10 10 24-16-15-14-7-11 15-4 21-9-7Z" fill="${enamel}"/>
    ${back ? `<path d="m115 51 18-12 16 11-10 26-15 6-8-7Z" fill="${enamel}"/><path d="m132 42-7 33" fill="none" stroke="#fff" stroke-opacity=".22"/>`
    : `<path d="m130 48 16-2 10 15-11 14-18-7Z" fill="#b8b4b3"/><path d="m128 61 24-4-2 12-13 10-12-7Z" fill="${black}"/><path d="m133 55 5 1m7-2 6-1" fill="none" stroke="#151e2b" stroke-width="2"/><path d="m128 62 20-3" fill="none" stroke="${gold}" stroke-width="1.5"/>`}
    <path d="m110 68 14 8 28-5-9 14-23 2-14-9Z" fill="${shade}"/>`;
  const cloak = shape === 'mystic'
    ? `<path d="m105 79 42-2 17 29 9 82-25-12-16 29-18-17-23 12 2-95Z" fill="${shade}"/><path d="m102 93-5 91 18-7 16 22 12-27-11-74Z" fill="${enamel}"/><path d="m100 182 14-7 17 22 13-27 23 14" fill="none" stroke="${gold}" stroke-width="1.5"/>`
    : shape === 'warden'
      ? `<path d="m107 76 39 2 17 47-8 67-25-14-39 11-9-17 15-76Z" fill="${shade}"/><path d="m105 87-14 90 36-9-8-79Z" fill="${enamel}"/><path d="m93 180 37-10 23 15" fill="none" stroke="${gold}" stroke-width="2"/>`
      : `<path d="m115 78-21 11-10 55-20 27 38-7 10 17 16-14 22 6 11-30-20-64Z" fill="${shade}"/><path d="m103 91-14 48-23 29 35-12 16-57Z" fill="${enamel}"/><path d="m68 167 32-7 10 12" fill="none" stroke="${gold}" stroke-width="1.5"/>`;
  const torso = shape === 'warden'
    ? `<path d="m106 83 28-5 22 12-7 47-15 21-25-14-7-27Z" fill="${silver}"/>
       <path d="m110 89 22-7 19 10-7 34-13 14-22-14Z" fill="${enamel}"/><path d="m132 82 19 10-7 34-13 14Z" fill="${shade}"/>
       <path d="m109 100 22 13 19-14-5 18-15 12-19-12Z" fill="${silver}"/><path d="m129 98 7 8-6 11-7-9Z" fill="${gold}"/>
       <path d="m107 135 22 9 18-9-1 15-16 9-21-10Z" fill="${black}"/><path d="m106 146 22 9 18-7 5 25-17-5-10 5-20-6Z" fill="${enamel}"/>`
    : shape === 'mystic'
      ? `<path d="m114 78 22 3 15 13-12 51-7 28-21-22-4-47Z" fill="${black}"/>
         <path d="m114 78 9 11-4 41 13 29 6-57 13-8-8 48 6 38-17 16-28-37 4-57Z" fill="${enamel}"/>
         <path d="m114 80 8 9-3 40 13 29 6-56 11-8" fill="none" stroke="${gold}" stroke-width="2"/><path d="m128 92 8 10-8 14-6-12Z" fill="${silver}"/>
         <path d="m123 141 19-1-2 7-13 3Z" fill="${gold}"/>`
      : `<path d="m114 80 24-2 16 16-15 39 6 21-23 13-17-16 2-29-8-23Z" fill="${black}"/>
         <path d="m114 84 18 5 17-1-10 25-11 12-16-10Z" fill="${enamel}"/><path d="m130 89 19-1-10 25-11 12Z" fill="${shade}"/>
         <path d="m111 118 14 10 15-9-5 23-13 6-15-8Z" fill="${silver}"/><path d="m122 132 12-5-3 12-8 3Z" fill="${shade}"/>
         <path d="m104 144 35-6 4 10-34 6Z" fill="${gold}"/><path d="m105 151 19 8-11 34-12-11Zm22 5 16-6 8 25-10 10Z" fill="${enamel}"/>`;
  const shoulder = shape === 'warden'
    ? `<path d="m102 84-17 15 3 19 23-5 4-20Z" fill="${silver}"/><path d="m104 88-14 12 4 10 14-4Z" fill="${enamel}"/>`
    : `<path d="m104 87-15 14 5 18 18-12Z" fill="${enamel}"/><path d="m93 100 13-8" fill="none" stroke="${gold}" stroke-width="1.6"/>`;
  const frontArm = `<g transform="rotate(${-casting} 150 94)">
    <path d="m146 89 12 2 15 28-10 30-10-6 7-23-15-16Z" fill="${black}"/>
    <path d="m149 87 13 6 8 17-16 2-10-12Z" fill="${shape === 'warden' ? silver : enamel}"/>
    <path d="m159 119 13 3-7 23-12-5Z" fill="${shape === 'warden' ? enamel : silver}"/>
    <path d="m158 130 10 4" fill="none" stroke="${gold}" stroke-width="2"/>${hand(153, 141)}
    ${glow ? `<circle cx="163" cy="160" r="23" fill="url(#aura)"/><path d="m163 150 6 10-6 11-6-11Z" fill="${enamel}"/><path d="m163 152 1 8-1 8-2-8Z" fill="#f2f7ff"/>` : ''}</g>`;
  return `<ellipse cx="128" cy="225" rx="36" ry="7" fill="${ink}" opacity=".18"/>
    <g transform="translate(${lean} ${bob})" stroke-linecap="round" stroke-linejoin="round">
    ${shape === 'mystic' ? `<ellipse cx="127" cy="54" rx="30" ry="34" fill="none" stroke="${gold}" stroke-width="1.3" opacity=".7"/><path d="m126 15 3 5-3 5-3-5Z" fill="${color}"/>` : ''}
    ${cloak}${leg(true)}${leg(false)}
    <path d="m98 101-13 29 7 23 11-5-4-18 12-21Z" fill="${black}"/><path d="m87 129 11-4 6 20-12 5Z" fill="${enamel}"/>${hand(92, 147)}
    ${torso}${shoulder}${frontArm}
    ${back ? `<path d="m113 80 20 6 17-3-7 56-13 33-22-22Z" fill="${shade}"/><path d="m115 87 15 8 15-5-12 69-4-30Z" fill="${enamel}"/><path d="m119 98 11 7 10-4-11 23Z" fill="none" stroke="${gold}" stroke-width="1.6"/>` : ''}
    ${shape === 'wanderer' ? wandererHead : head}
    ${shape === 'mystic' ? `<path d="m85 116-1 16 1 12 5-15Z" fill="${silver}"/><path d="m84 122 1 16 3-9Z" fill="${color}"/>` : ''}
    </g>`;
}
export function characterShapeImage(shape, color, { pose = 'static', back = false, frames = 1 } = {}) {
  if (!CHARACTER_SHAPES.some(entry => entry.id === shape) || !validShapeColor(color)) return null;
  if (pose === 'portrait') return svgUrl(`${materials(color)}<defs><clipPath id="portrait"><rect x="2" y="2" width="252" height="252" rx="44"/></clipPath></defs>
    <g clip-path="url(#portrait)"><rect width="256" height="256" fill="url(#plate)"/><circle cx="126" cy="100" r="132" fill="url(#aura)"/>
    <circle cx="128" cy="120" r="89" fill="none" stroke="${color}" stroke-opacity=".25" stroke-width="1"/>
    <path d="M38 120h14m152 0h14M128 30v14" stroke="#d4c4ab" stroke-opacity=".5"/>
    <g transform="translate(-149 -32) scale(2.15)">${figure(shape, color, false, 'static', 0)}</g>
    <path d="M20 186v39a11 11 0 0 0 11 11h27m140 0h27a11 11 0 0 0 11-11v-39" fill="none" stroke="${color}" stroke-opacity=".7" stroke-width="1.4"/>
    </g><rect x="2.5" y="2.5" width="251" height="251" rx="43.5" fill="none" stroke="#8490a5" stroke-opacity=".3"/>`, 256, 256);
  return svgUrl(`${materials(color)}${Array.from({ length: frames }, (_, i) => `<g transform="translate(${256 * i} 0)"><g${back ? ' transform="translate(256 0) scale(-1 1)"' : ''}>${figure(shape, color, back, pose, i)}</g></g>`).join('')}`, frames * 256, 256);
}

// Original geometry: no imported client map, terrain cells or placements.
const background = { artworkId: 'winterfell-battlefield-v2', file: 'courtyard.png', propsFile: 'props.png', width: 1536, height: 1024,
  hw: 48, top: 200, originX: 16 };
const battlefield = { version: 1, id: 'custom-winterfell-courtyard', name: 'Winterfell · La cour du dernier brasier',
  description: 'La porte brisée donne sur une cour enneigée. Les vivants défendent le brasier ; les morts traversent la brèche.',
  width: 13, height: 13, background,
  startingCells: [
    [{ x: 2, y: 9 }, { x: 3, y: 10 }, { x: 1, y: 10 }, { x: 1, y: 8 }, { x: 3, y: 9 }, { x: 2, y: 11 }, { x: 4, y: 10 }, { x: 2, y: 8 }],
    [{ x: 10, y: 3 }, { x: 9, y: 2 }, { x: 11, y: 2 }, { x: 9, y: 1 }, { x: 11, y: 4 }, { x: 8, y: 2 }, { x: 10, y: 1 }, { x: 10, y: 4 }],
  ],
  obstacles: [
    { x: 6, y: 6, type: 'BUSH', prop: 'brazier' },
    { x: 4, y: 4, type: 'ROCK', prop: 'pillar' }, { x: 8, y: 8, type: 'ROCK', prop: 'pillar' },
    { x: 4, y: 7, type: 'BUSH', prop: 'barricade' }, { x: 8, y: 5, type: 'BUSH', prop: 'barricade' },
  ],
};
module.exports = battlefield;

if (require.main === module) {
  const fs = require('node:fs');
  const grid = [];
  const point = (x, y) => [768 + (x - y) * 48, 200 + (x + y) * 24];
  for (let n = 0; n <= 13; n++) for (const [a, b] of [[point(n, 0), point(n, 13)], [point(0, n), point(13, n)]]) {
    grid.push(`<path d="M${a}L${b}" stroke="#768b97" stroke-width="1" opacity=".4"/>`);
  }
  fs.mkdirSync(`${__dirname}/sources`, { recursive: true });
  fs.writeFileSync(`${__dirname}/sources/courtyard-guide.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="1536" height="1024" viewBox="0 0 1536 1024"><rect width="1536" height="1024" fill="#131c25"/><polygon points="768,200 1392,512 768,824 144,512" fill="#a3b1b9"/>${grid.join('')}<path d="M144,502L768,190L1392,502" fill="none" stroke="#465765" stroke-width="24"/><text x="768" y="80" text-anchor="middle" fill="white" font-family="sans-serif" font-size="24">WINTERFELL — GEOMETRY REFERENCE ONLY</text><text x="768" y="930" text-anchor="middle" fill="white" font-family="sans-serif" font-size="18">Flat courtyard: preserve all four corners. No obstacles, figures, grid or text in final painting.</text></svg>`);
}

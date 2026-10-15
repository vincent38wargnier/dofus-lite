const { chapters } = require('./story.cjs');
const final = require('../winterfell-last-stand/battlefield.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
module.exports = chapters.map((chapter, i) => {
  if (i === 7) return { ...clone(final), id: 'custom-thrones-long-night', name: chapter.map,
    // Keep the large battlefield, but fight at the breach instead of spending
    // several full initiative cycles crossing an empty snowfield.
    startingCells: [[{ x: 11, y: 19 }, { x: 14, y: 19 }, { x: 17, y: 19 }, { x: 20, y: 19 },
      { x: 12, y: 20 }, { x: 19, y: 20 }, { x: 14, y: 21 }, { x: 17, y: 21 }],
    [{ x: 16, y: 13 }, ...Array.from({ length: 32 }, (_, j) => ({ x: 7 + j % 8 * 2, y: 13 - Math.floor(j / 8) }))
      .filter(p => p.x !== 16 || p.y !== 13).slice(0, 31)]] };
  const n = [4, 6].includes(i) ? 22 : 18, hw = n === 22 ? 32 : 36;
  const obstacles = [], taken = new Set();
  const add = (x, y, prop = 'pillar') => {
    if (taken.has(`${x},${y}`)) return;
    taken.add(`${x},${y}`); obstacles.push({ x, y, type: prop === 'pillar' ? 'ROCK' : 'BUSH', prop });
  };
  if (i === 0) { for (const [x, y] of [[5, 6], [11, 6], [5, 10], [11, 10]]) add(x, y); add(8, 8, 'brazier'); }
  if (i === 1) { for (let x = 2; x < 16; x++) if (![6, 7, 12, 13].includes(x)) add(x, 9, x % 4 ? 'barricade' : 'brazier'); }
  if (i === 2) { for (let y = 5; y < 13; y++) if (![8, 9].includes(y)) { add(7, y); add(10, y); } }
  if (i === 3) { for (let x = 2; x < 16; x++) if (![5, 6, 12, 13].includes(x)) add(x, 9, 'barricade'); add(4, 12, 'brazier'); add(12, 12, 'brazier'); }
  if (i === 4) { for (const [x, y] of [[7, 8], [8, 8], [14, 10], [15, 10], [10, 13], [16, 7]]) add(x, y); for (let x = 3; x < 18; x += 3) add(x, 14, 'barricade'); }
  if (i === 5) { for (let y = 5; y < 12; y++) if (![8, 9, 10].includes(y)) { add(6, y, 'barricade'); add(12, y, 'barricade'); } add(9, 10, 'barricade'); }
  if (i === 6) { for (const [x, y] of [[5, 7], [6, 7], [15, 7], [16, 7], [8, 11], [9, 11], [15, 13], [16, 13]]) add(x, y); }
  const heroY = n === 22 ? 16 : 11, enemyY = n === 22 ? 10 : i === 5 ? 8 : i === 3 ? 7 : 6;
  const cells = (xs, ys, count) => ys.flatMap(y => xs.map(x => ({ x, y })))
    .filter(p => !taken.has(`${p.x},${p.y}`)).slice(0, count);
  const startingCells = [cells([6, 8, 10, 12], [heroY, heroY + 1, heroY + 2], 8),
    cells([6, 8, 10, 12, 5, 7, 9, 13], [enemyY, enemyY - 1, enemyY - 2, enemyY - 3, enemyY - 4], 32)];
  return { version: 1, id: `custom-thrones-${chapter.key}`, name: chapter.map,
    description: `${chapter.objective} ${chapter.tactic} Terrain original de la campagne des Huit Mémoires.`,
    width: n, height: n, obstacles, startingCells,
    background: { artworkId: `thrones-map-${chapter.key}-v1`, file: 'battlefield.png', propsFile: 'props.png', width: 1536, height: 1024, hw, top: 150, originX: n + 2 } };
});

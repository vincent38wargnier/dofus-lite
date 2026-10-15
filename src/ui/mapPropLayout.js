// Anchor scenery at its footprint centre, not its lowest visible pixel.
// Existing 256 px atlas frames are ordered pillar / brazier / barricade.
export const MAP_PROP_FRAMES = {
  pillar: { frame: 0, anchorX: 128, anchorY: 208, scale: .95 },
  brazier: { frame: 1, anchorX: 128, anchorY: 204, scale: .9 },
  barricade: { frame: 2, anchorX: 128, anchorY: 196, scale: .85 },
};
export function mapPropLayout(obstacle, L) {
  const { frame, anchorX, anchorY, scale } = MAP_PROP_FRAMES[obstacle.prop];
  const ground = L.ground(obstacle), size = L.hw * 2 * scale;
  return { frame, size, ground, left: ground.x - size * anchorX / 256,
    top: ground.y - size * anchorY / 256,
    zIndex: 10 + (obstacle.x + obstacle.y) * 4 + 2 };
}

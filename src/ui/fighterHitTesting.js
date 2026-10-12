// The DOM rectangle includes transparent space around a sprite. Pick its
// painted pixels instead, including pixels outside the nominal figure box.
const spriteHitTests = new WeakMap();
const MIN_ALPHA = 32;

export function containsPoint(rect, x, y) {
  return !!rect && rect.width > 0 && rect.height > 0
    && x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
}

export function spritePixel(rect, x, y, width, height, mirrored = false) {
  if (!containsPoint(rect, x, y)) return null;
  const px = Math.min(width - 1, Math.floor((x - rect.left) * width / rect.width));
  return { x: mirrored ? width - 1 - px : px, y: Math.min(height - 1, Math.floor((y - rect.top) * height / rect.height)) };
}

export function registerSpriteHitTest(element, test) {
  spriteHitTests.set(element, test);
  return () => { if (spriteHitTests.get(element) === test) spriteHitTests.delete(element); };
}

// A compact alpha mask is shared by the frames of a custom animation. Release
// the temporary RGBA canvas after decoding; no extra canvas per rendered frame.
export function imageAlphaMask(image) {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const alpha = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = rgba[i * 4 + 3];
  const mask = { width: canvas.width, height: canvas.height, alpha };
  canvas.width = canvas.height = 0;
  return mask;
}

export function imageMaskContains(mask, rect, x, y, frames, frame, mirrored) {
  const width = mask.width / frames;
  const pixel = spritePixel(rect, x, y, width, mask.height, mirrored);
  return !!pixel && mask.alpha[pixel.y * mask.width + frame * width + pixel.x] >= MIN_ALPHA;
}

function bodyContains(token, x, y) {
  const figure = token.querySelector('.figure');
  const custom = figure?.querySelector('.custom-character-sprite');
  const test = custom && spriteHitTests.get(custom);
  const customHit = test?.(x, y);
  if (customHit != null) return customHit;
  const canvas = figure?.querySelector('ruffle-player')?.shadowRoot?.querySelector('canvas');
  if (canvas?.width && canvas?.height) {
    const pixel = spritePixel(canvas.getBoundingClientRect(), x, y, canvas.width, canvas.height, token.dataset.mirror === 'true');
    if (!pixel) return false;
    try {
      // Native actors use Ruffle's Canvas renderer. Read the current animation
      // frame, so facing, accessories, movement and resizing stay in sync.
      const context = canvas.getContext('2d');
      if (context) return context.getImageData(pixel.x, pixel.y, 1, 1).data[3] >= MIN_ALPHA;
    } catch (_) { /* Loading/unreadable art falls back to its small figure. */ }
  }
  return containsPoint(figure?.getBoundingClientRect(), x, y);
}

export function fighterUnderPointer(board, x, y) {
  const tokens = [...board.querySelectorAll('.token[data-fighter-id]')].reverse()
    .sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex));
  // Visible bodies take precedence over a neighbour's health bar or ring.
  let token = tokens.find(t => bodyContains(t, x, y));
  for (const selector of ['.ring', '.mini-hp']) {
    if (token) break;
    token = tokens.find(t => containsPoint(t.querySelector(selector)?.getBoundingClientRect(), x, y));
  }
  return token ? { id: token.dataset.fighterId, anchor: token.querySelector('.figure') } : null;
}

export function groundUnderPointer(board, x, y) {
  // elementsFromPoint also returns the floor underneath transparent figure
  // rectangles. SVG hit-testing respects map elevations and cropped layouts.
  const cell = board.ownerDocument.elementsFromPoint?.(x, y).find(element =>
    board.contains(element) && element.matches('[data-cell], [data-placement-cell]'));
  const position = cell?.dataset.placementCell || cell?.dataset.cell;
  if (!position) return null;
  const [cx, cy] = position.split(',').map(Number);
  return { x: cx, y: cy };
}

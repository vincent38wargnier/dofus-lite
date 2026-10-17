import { crc32 } from '../content/zip';

export const COVER_PATH = 'cover.png';
export const COVER_LIMIT = 4 * 1048576;

// Covers are inert PNGs, outside the catalogue's shared media namespace.
export function inspectCover(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const fail = message => { throw new Error('Couverture : ' + message); };
  if (bytes.length > COVER_LIMIT) fail('4 Mio maximum.');
  if (bytes.length < 45 || [137,80,78,71,13,10,26,10].some((n,i) => bytes[i] !== n)) fail('image PNG attendue.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16), height = view.getUint32(20);
  if (width < 320 || height < 160 || width > 4096 || height > 4096 || width * height > 8 * 1048576) fail('dimensions comprises entre 320 × 160 et 4096 × 4096, 8 mégapixels maximum.');
  let position = 8, data = false, end = false;
  while (position + 12 <= bytes.length) {
    const length = view.getUint32(position), next = position + 12 + length;
    if (next > bytes.length) fail('fichier tronqué.');
    const type = String.fromCharCode(...bytes.subarray(position + 4, position + 8));
    if (position === 8 && (type !== 'IHDR' || length !== 13)) fail('en-tête invalide.');
    if (type === 'acTL') fail('utilisez une image fixe.');
    if (crc32(bytes.subarray(position + 4, next - 4)) !== view.getUint32(next - 4)) fail('fichier corrompu.');
    if (type === 'IDAT') data = true;
    if (type === 'IEND') { if (length !== 0 || next !== bytes.length) fail('fin de fichier invalide.'); end = true; break; }
    position = next;
  }
  if (!data || !end) fail('image incomplète.');
  return { width, height, bytes: bytes.length };
}

export async function prepareCover(file) {
  if (!file || file.size > 12 * 1048576) throw new Error('Choisissez une image PNG, JPEG ou WebP de moins de 12 Mio.');
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Couverture : PNG, JPEG ou WebP uniquement.');
  const image = await createImageBitmap(file);
  try {
    if (image.width < 320 || image.height < 160) throw new Error('Couverture : au moins 320 × 160 pixels.');
    const ratio = Math.min(1, 1600 / image.width, 1000 / image.height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.width * ratio); canvas.height = Math.round(image.height * ratio);
    const context = canvas.getContext('2d');
    context.fillStyle = '#111b19'; context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Cette image n’a pas pu être préparée.');
    const bytes = new Uint8Array(await blob.arrayBuffer()); inspectCover(bytes); return bytes;
  } finally { image.close(); }
}

import { PACKAGE_LIMITS as LIMIT } from './packageLimits';

const check = (ok, message) => { if (!ok) throw new Error(message); };
const table = Array.from({ length: 256 }, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
const safeName = name => name === 'content.json' || name === 'class.json'
  || /^icons\/(?:[a-z][a-z0-9_-]*\.png)?$/.test(name)
  || /^artwork\/(?:[a-z][a-z0-9_-]*\/)?(?:[a-z][a-z0-9_-]*\.png)?$/.test(name);

async function inflateBrowser(bytes, size) {
  let stream;
  try { stream = new DecompressionStream('deflate-raw'); }
  catch (_) { throw new Error('Ce navigateur ne lit pas les ZIP compressés. Utilisez Chrome récent ou exportez le ZIP sans compression (STORE).'); }
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const output = new Uint8Array(size); let offset = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      check(offset + value.length <= size, 'ZIP : taille décompressée excessive.');
      output.set(value, offset); offset += value.length;
    }
    check(offset === size, 'ZIP : taille décompressée incorrecte.');
  } finally { await reader.cancel().catch(() => {}); }
  return output;
}

export async function readContentZip(input, inflate = inflateBrowser, { limits = LIMIT, allowName = safeName } = {}) {
  const LIMIT = limits;
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  check(bytes.length >= 22 && bytes.length <= LIMIT.zipBytes, `ZIP : archive vide, invalide ou supérieure à ${LIMIT.zipBytes / 1048576} Mio.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = offset => view.getUint16(offset, true), u32 = offset => view.getUint32(offset, true);
  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (u32(offset) === 0x06054b50 && offset + 22 + u16(offset + 20) === bytes.length) { end = offset; break; }
  }
  check(end >= 0, 'ZIP : répertoire introuvable.');
  check(u16(end + 4) === 0 && u16(end + 6) === 0 && u16(end + 8) === u16(end + 10), 'ZIP multi-disques non accepté.');
  const count = u16(end + 10), start = u32(end + 16);
  check(count > 0 && count <= LIMIT.files && start + u32(end + 12) === end, 'ZIP : trop de fichiers ou répertoire invalide.');
  const entries = [], names = new Set(), spans = [];
  let offset = start, total = 0;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < count; i++) {
    check(offset + 46 <= end && u32(offset) === 0x02014b50, 'ZIP : entrée invalide.');
    const flags = u16(offset + 8), method = u16(offset + 10), packed = u32(offset + 20), size = u32(offset + 24);
    const nameLength = u16(offset + 28), extra = u16(offset + 30), comment = u16(offset + 32), local = u32(offset + 42);
    check(offset + 46 + nameLength + extra + comment <= end, 'ZIP : entrée tronquée.');
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    check(allowName(name) && !names.has(name), `ZIP : chemin interdit ou dupliqué « ${name} ». Le manifeste doit être à la racine.`);
    names.add(name);
    check(u16(offset + 6) <= 20 && u16(offset + 34) === 0 && !(flags & ~0x0808)
      && [0, 8].includes(method) && ((u32(offset + 38) >>> 16) & 0xf000) !== 0xa000,
    `${name} : ZIP chiffré, lien symbolique, ZIP64 ou compression non prise en charge.`);
    const directory = name.endsWith('/');
    check(directory ? size === 0 : size > 0 && size <= (name.endsWith('.json') ? LIMIT.jsonBytes : LIMIT.pngBytes), `${name} : taille non autorisée.`);
    total += size; check(total <= LIMIT.expandedBytes, `ZIP : maximum ${LIMIT.expandedBytes / 1048576} Mio décompressés.`);
    check(local + 30 <= start && u32(local) === 0x04034b50, `${name} : en-tête local invalide.`);
    const data = local + 30 + u16(local + 26) + u16(local + 28);
    check(data <= start && data + packed <= start && u16(local + 4) <= 20 && u16(local + 6) === flags && u16(local + 8) === method
      && decoder.decode(bytes.subarray(local + 30, local + 30 + u16(local + 26))) === name, `${name} : en-têtes incohérents.`);
    const checksum = u32(offset + 16);
    if (!(flags & 8)) check(u32(local + 14) === checksum && u32(local + 18) === packed && u32(local + 22) === size, `${name} : tailles incohérentes.`);
    check(!spans.some(([a, b]) => local < b && data + packed > a), 'ZIP : entrées superposées.');
    spans.push([local, data + packed]);
    entries.push({ name, directory, method, size, packed: bytes.subarray(data, data + packed), checksum });
    offset += 46 + nameLength + extra + comment;
  }
  check(offset === end, 'ZIP : répertoire incohérent.');
  const files = new Map();
  for (const entry of entries) {
    const raw = entry.method === 0 ? entry.packed.slice() : await inflate(entry.packed, entry.size);
    check(raw.length === entry.size && crc32(raw) === entry.checksum, `${entry.name} : fichier corrompu (taille ou CRC).`);
    if (!entry.directory) files.set(entry.name, raw);
  }
  return files;
}

// STORE makes downloaded templates portable, including browsers without a
// native inflater. No executable or external dependency enters the package.
export function writeContentZip(files) {
  const encoder = new TextEncoder(), locals = [], centrals = []; let offset = 0;
  for (const [name, value] of files) {
    const path = encoder.encode(name), bytes = typeof value === 'string' ? encoder.encode(value) : value;
    const local = new Uint8Array(30 + path.length + bytes.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x800, true); lv.setUint16(12, 33, true);
    lv.setUint32(14, crc32(bytes), true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, path.length, true);
    local.set(path, 30); local.set(bytes, 30 + path.length); locals.push(local);
    const central = new Uint8Array(46 + path.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x800, true); cv.setUint16(14, 33, true);
    cv.setUint32(16, crc32(bytes), true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, path.length, true);
    cv.setUint32(42, offset, true); central.set(path, 46); centrals.push(central); offset += local.length;
  }
  const centralSize = centrals.reduce((sum, bytes) => sum + bytes.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, files.size, true); ev.setUint16(10, files.size, true);
  ev.setUint32(12, centralSize, true); ev.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + end.length); let cursor = 0;
  for (const bytes of [...locals, ...centrals, end]) { output.set(bytes, cursor); cursor += bytes.length; }
  return output;
}

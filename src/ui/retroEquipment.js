import { equipmentItem } from '../engine/customEquipment';

const SLOTS = [['hat', 1, [16]], ['cape', 2, [17, 81]], ['pet', 3, [18]]];

// The client links accessories by item type + gfx, not by the inventory ID.
// Use the fighter's own equipment snapshot, including in simulations/replays.
export function fighterAccessories(fighter, assets) {
  const parameters = {}, imports = [];
  if (fighter.isMonster || fighter.isSummon) return { parameters, imports };
  for (const [slot, index, types] of SLOTS) {
    const item = equipmentItem(fighter.loadout?.slots?.[slot], fighter.loadout);
    if (!item || !types.includes(item.type) || item.customEquipment?.appearance) continue;
    const name = `${item.type}_${item.gfx}`;
    const url = assets?.accessories?.symbols[name];
    if (!url) continue;
    parameters[`accessory${index}`] = name;
    imports.push({ name, url });
  }
  return { parameters, imports };
}

function joinBytes(parts) {
  const result = new Uint8Array(parts.reduce((length, part) => length + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function uint16(value) { return new Uint8Array([value & 255, value >> 8]); }
function string(value) { return new Uint8Array([...Array.from(value, c => c.charCodeAt(0)), 0]); }
function tag(code, payload) {
  const head = uint16((code << 6) | Math.min(payload.length, 63));
  if (payload.length < 63) return joinBytes([head, payload]);
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, payload.length, true);
  return joinBytes([head, size, payload]);
}

// Import into the actor's own symbol dictionary before its first frame. This
// lets the original GAC attachment clips draw the gear in their native layers.
// Nothing is flattened to an icon or positioned on top of the HTML token.
export async function withAccessoryImports(buffer, imports) {
  if (!imports?.length) return buffer;
  const data = new Uint8Array(buffer);
  let body;
  if (data[0] === 67) {
    body = new Uint8Array(await new Response(new Blob([data.slice(8)])
      .stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  } else if (data[0] === 70) body = data.slice(8);
  else throw new Error('Format SWF non pris en charge');
  const start = Math.ceil((5 + 4 * (body[0] >> 3)) / 8) + 4;
  const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
  let cursor = start, nextId = 1;
  // Each original definition starts with its character ID. Reserve imported
  // IDs above every original symbol, instead of assuming a fixed safe range.
  const definitions = new Set([2, 6, 7, 10, 11, 14, 20, 21, 22, 32, 33, 34, 35, 36, 37, 39, 46, 48, 60, 75, 83, 84, 87, 90, 91]);
  while (cursor < body.length) {
    const header = view.getUint16(cursor, true), code = header >> 6;
    let size = header & 63;
    cursor += 2;
    if (size === 63) { size = view.getUint32(cursor, true); cursor += 4; }
    if (cursor + size > body.length) throw new Error('Bibliothèque SWF tronquée');
    if (definitions.has(code)) nextId = Math.max(nextId, view.getUint16(cursor, true) + 1);
    if ([56, 57, 71].includes(code)) {
      let link = cursor;
      if (code !== 56) {
        while (link < cursor + size && body[link]) link += 1;
        link += code === 71 ? 3 : 1;
      }
      const count = view.getUint16(link, true); link += 2;
      for (let i = 0; i < count; i += 1) {
        nextId = Math.max(nextId, view.getUint16(link, true) + 1); link += 2;
        while (link < cursor + size && body[link]) link += 1;
        link += 1;
      }
    }
    cursor += size;
    if (!code) break;
  }
  const groups = new Map();
  for (const { name, url } of imports) {
    if (!groups.has(url)) groups.set(url, new Set());
    groups.get(url).add(name);
  }
  const additions = [];
  for (const [url, names] of groups) {
    const entries = [];
    for (const name of names) entries.push(joinBytes([uint16(nextId++), string(name)]));
    const symbols = joinBytes([uint16(entries.length), ...entries]);
    additions.push(tag(71, joinBytes([string(url), new Uint8Array([1, 0]), symbols])));
    additions.push(tag(56, symbols));
  }
  const result = joinBytes([data.slice(0, 8), body.slice(0, start), ...additions, body.slice(start)]);
  result[0] = 70;
  new DataView(result.buffer).setUint32(4, result.length, true);
  return result.buffer;
}

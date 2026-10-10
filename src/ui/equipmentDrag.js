import { EQUIPMENT_LEVEL, EQUIPMENT_SLOTS, ITEMS, effectDefinition } from '../engine/equipment';
import { replaceEquipment, swapEquipment } from '../engine/forgedItems';

export function canEquipInSlot(item, slotId, level) {
  return !!item && item.level <= level && !!EQUIPMENT_SLOTS.find(s => s.id === slotId)?.types.includes(item.type)
    && !item.effects.some(([id]) => effectDefinition(id).kind === 'unsupported');
}

export function canDropEquipment(loadout, drag, slotId) {
  if (!drag || drag.fromSlot === slotId || !canEquipInSlot(ITEMS[drag.itemId], slotId, loadout.level ?? EQUIPMENT_LEVEL)) return false;
  if (!drag.fromSlot) return true;
  const from = EQUIPMENT_SLOTS.find(s => s.id === drag.fromSlot);
  if (!from || loadout.slots[drag.fromSlot] !== drag.itemId) return false;
  const replaced = ITEMS[loadout.slots[slotId]];
  return !loadout.slots[slotId] || (!!replaced && from.types.includes(replaced.type));
}

export function dropEquipment(loadout, drag, slotId) {
  if (!canDropEquipment(loadout, drag, slotId)) return loadout;
  return drag.fromSlot ? swapEquipment(loadout, drag.fromSlot, slotId) : replaceEquipment(loadout, slotId, drag.itemId);
}

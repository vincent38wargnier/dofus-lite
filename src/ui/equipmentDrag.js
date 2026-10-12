import { customEquipmentItem, equipmentItem, equipCustomItem, validateCustomEquipment } from '../engine/customEquipment';
import { EQUIPMENT_LEVEL, EQUIPMENT_SLOTS, effectDefinition } from '../engine/equipment';
import { replaceEquipment, swapEquipment, validateForgedItem } from '../engine/forgedItems';

export function canEquipInSlot(item, slotId, level) {
  return !!item && (!item.customEquipment || validateCustomEquipment(item.customEquipment).valid) && item.level <= level && !!EQUIPMENT_SLOTS.find(s => s.id === slotId)?.types.includes(item.type)
    && !item.effects.some(([id]) => effectDefinition(id).kind === 'unsupported');
}

export function canDropEquipment(loadout, drag, slotId) {
  const item = drag?.customEquipment && drag.customEquipment.id === drag.itemId ? customEquipmentItem(drag.customEquipment) : equipmentItem(drag?.itemId, loadout);
  if (!drag || drag.fromSlot === slotId || !canEquipInSlot(item, slotId, loadout.level ?? EQUIPMENT_LEVEL)) return false;
  if (drag.forgedItem && validateForgedItem(item, drag.forgedItem)) return false;
  if (!drag.fromSlot) return true;
  const from = EQUIPMENT_SLOTS.find(s => s.id === drag.fromSlot);
  if (!from || loadout.slots[drag.fromSlot] !== drag.itemId) return false;
  const replaced = equipmentItem(loadout.slots[slotId], loadout);
  return !loadout.slots[slotId] || (!!replaced && from.types.includes(replaced.type));
}

export function dropEquipment(loadout, drag, slotId) {
  if (!canDropEquipment(loadout, drag, slotId)) return loadout;
  if (drag.fromSlot) return swapEquipment(loadout, drag.fromSlot, slotId);
  const next = replaceEquipment(drag.customEquipment ? equipCustomItem(loadout, slotId, drag.customEquipment) : loadout, slotId, drag.itemId);
  if (!drag.forgedItem) return next;
  return { ...next, forgedItems: { ...next.forgedItems, [slotId]: JSON.parse(JSON.stringify(drag.forgedItem)) } };
}

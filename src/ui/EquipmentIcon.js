import React, { useState } from 'react';
import { itemIcon } from '../engine/equipment';

export default function EquipmentIcon({ item, className = '' }) {
  const [failed, setFailed] = useState(null);
  const url = itemIcon(item);
  return url && failed !== url ? <img className={`equipment-icon ${className}`} src={url} alt="" loading="lazy" onError={() => setFailed(url)} />
    : <span className={`equipment-icon equipment-placeholder ${className}`} aria-hidden="true">◇</span>;
}

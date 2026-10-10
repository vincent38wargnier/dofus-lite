import { PACKAGE_SCHEMA, schemaErrors } from './packageSchema';
import { authoredSpellErrors, authoredSpellWarnings, newAuthoredSpell, normalizeAuthoredSpell, EFFECT_TYPES } from '../engine/authoredSpells';
import { emptyLoadout } from '../engine/equipment';
import { MAPS } from '../engine/maps';
import { getMonster, KANOJEDO_MAP_ID } from '../engine/monsters';
import { resolveCustomMonster } from '../engine/customMonsters';
import ARTWORK_SPEC from '../ui/characterArtworkSpec.json';

export { PACKAGE_SCHEMA };
const masks = { self: 32, ally: 4, otherAlly: 6, enemy: 1, fighter: 0 };
const clone = value => JSON.parse(JSON.stringify(value));

export function compilePackageSpell(spell, existingIds = []) {
  const raw = newAuthoredSpell(existingIds);
  const { key, counterplay, icon, ...fields } = spell;
  return normalizeAuthoredSpell({ ...raw, ...fields, key: raw.key,
    description: `${spell.description}\nContre-jeu : ${counterplay}`.slice(0, 800),
    effects: spell.effects.map(effect => { const { target, ...rest } = effect; return { ...rest, targetMask: masks[target] }; }),
    critEffects: spell.critEffects.map(effect => { const { target, ...rest } = effect; return { ...rest, targetMask: masks[target] }; }),
    ...(icon ? { iconFile: icon } : {}),
  });
}

export function packageBalanceErrors(spell) {
  const errors = [];
  for (const [effects, critical] of [[spell.effects, false], [spell.critEffects, true]]) {
    const damage = effects.filter(effect => ['damage', 'lifeSteal'].includes(effect.kind));
    const area = damage.some(effect => effect.zone !== 'Pa');
    // Wide guardrails, not a claim of competitive balance. Cooldowns buy a
    // limited burst budget; unlimited raw values never become acceptable.
    const burst = spell.cooldown >= 2 ? 2 : 1;
    const ceiling = (area ? 9 : 12) * (critical ? 1.35 : 1) * burst;
    if (damage.reduce((sum, effect) => sum + effect.max, 0) / spell.pa > ceiling) errors.push(`Dégâts ${critical ? 'critiques' : 'normaux'} : maximum ${ceiling.toFixed(2)} dégâts bruts par PA, toutes les lignes additionnées.`);
    if (effects.filter(effect => effect.kind === 'heal').reduce((sum, effect) => sum + effect.max, 0) > spell.pa * 15 * burst) errors.push('Soin : maximum 15 PV bruts par PA (30 avec une relance ≥ 2).');
    const budget = { buffPa: 2, buffPm: 3, removePa: 3, removePm: 3, buffDamage: 20, buffPower: 150, buffStat: 150, armor: 20, resistBuff: 30, resistDebuff: 30 };
    for (const [kind, max] of Object.entries(budget)) {
      if (effects.filter(effect => effect.kind === kind).reduce((sum, effect) => sum + effect.max, 0) > max) errors.push(`${kind} : plafond par lancer ${max}, toutes les lignes additionnées.`);
    }
    for (const effect of effects) {
      if (effect.kind === 'buffPa' && (spell.cooldown < effect.duration + 1 || spell.maxPerTurn !== 1 || effect.max >= spell.pa)) errors.push('Bonus PA : gain < coût, un lancer par tour, relance supérieure à la durée.');
      if (['buffDamage', 'buffPower', 'buffStat', 'armor', 'resistBuff', 'buffPm'].includes(effect.kind)
        && effect.duration > 0 && (spell.cooldown <= effect.duration || spell.maxPerTurn !== 1)) errors.push(`${effect.kind} : un lancer par tour et relance supérieure à la durée pour éviter le cumul sans limite.`);
      if (effect.kind === 'heal' && ['enemy', 'fighter'].includes(effect.target)) errors.push('Le soin doit cibler self, ally ou otherAlly.');
      if (!EFFECT_TYPES[effect.kind].element && effect.element !== undefined) errors.push(`${effect.kind} n’utilise pas de champ element.`);
      if (!EFFECT_TYPES[effect.kind].stat && effect.stat !== undefined) errors.push(`${effect.kind} n’utilise pas de champ stat.`);
    }
  }
  return [...new Set(errors)];
}

export function validateContentManifest(manifest) {
  const errors = schemaErrors(manifest), warnings = [];
  if (errors.length) return { errors, warnings };
  if (manifest.type === 'class' ? !manifest.class || manifest.dungeon : !manifest.dungeon || manifest.class) {
    return { errors: ['Le paquet doit contenir uniquement class ou dungeon, selon type.'], warnings };
  }
  const owners = manifest.type === 'class' ? [{ ...manifest.class, name: manifest.name }] : manifest.dungeon.monsters;
  const ids = [];
  for (const owner of owners) {
    if (new Set(owner.spells.map(spell => spell.key)).size !== owner.spells.length) errors.push(`${owner.name} : clés de sorts dupliquées.`);
    const kit = owner.spells.map(spell => { const raw = compilePackageSpell(spell, ids); ids.push(raw.id); return raw; });
    owner.spells.forEach((spell, index) => {
      errors.push(...authoredSpellErrors(kit[index]).map(error => `${owner.name} / ${spell.key} : ${error}`));
      errors.push(...packageBalanceErrors(spell).map(error => `${owner.name} / ${spell.key} : ${error}`));
      warnings.push(...authoredSpellWarnings(kit[index], kit).map(warning => `${owner.name} / ${spell.name} : ${warning}`));
    });
    if (!owner.spells.some(spell => spell.effects.some(effect => ['damage', 'lifeSteal'].includes(effect.kind)))) warnings.push(`${owner.name} n’a pas d’attaque directe : prévoyez un allié offensif ou une arme.`);
  }
  if (manifest.type === 'dungeon') {
    const room = manifest.dungeon;
    if (!Object.prototype.hasOwnProperty.call(MAPS, room.mapId)) errors.push(`Carte inconnue : ${room.mapId}.`);
    if (new Set(room.monsters.map(monster => monster.key)).size !== room.monsters.length) errors.push('Clés de monstres dupliquées.');
    if (new Set(room.members.map(member => member.monster)).size !== room.members.length) errors.push('Groupez les doublons avec count.');
    if (room.members.reduce((sum, member) => sum + member.count, 0) > 8) errors.push('Maximum 8 adversaires au total dans la salle.');
    for (const member of room.members) if (!room.monsters.some(monster => monster.key === member.monster)) errors.push(`Monstre non défini : ${member.monster}.`);
    for (const monster of room.monsters) {
      const reference = getMonster(monster.reference.monsterId, monster.reference.grade);
      if (!reference) { errors.push(`${monster.name} : référence de monstre ou grade inconnu.`); continue; }
      if (!room.members.some(member => member.monster === monster.key)) errors.push(`${monster.name} n’est pas utilisé dans members.`);
      if (reference.basePa + monster.tuning.paBonus < 1 || reference.basePa + monster.tuning.paBonus > 20
        || reference.basePm + monster.tuning.pmBonus < 0 || reference.basePm + monster.tuning.pmBonus > 8) errors.push(`${monster.name} : total requis de 1 à 20 PA et de 0 à 8 PM.`);
      if (monster.tuning.hpPercent > 100 && monster.tuning.statsPercent > 100) warnings.push(`${monster.name} augmente à la fois les PV et les caractéristiques de sa référence : difficulté accrue.`);
      if (Object.values(reference.resistances || {}).some(value => value >= 75)) warnings.push(`${monster.name} hérite de résistances élevées : assurez-vous qu’il reste vulnérable aux attaques de la classe testée.`);
      if (!monster.spells.some(spell => spell.pa <= reference.basePa + monster.tuning.paBonus)) errors.push(`${monster.name} n’a pas assez de PA pour lancer un seul de ses sorts.`);
    }
    warnings.push('La difficulté dépend du groupe complet, du terrain et du stuff adverse. Testez la salle entière ; le niveau de la référence ne certifie pas sa difficulté.');
  }
  warnings.push('Format contrôlé et plafonds respectés ≠ équilibre prouvé. Comparez les résultats en combat, avec plusieurs équipements et graines aléatoires.');
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function expectedPackageFiles(manifest) {
  const files = new Set(['content.json']);
  const owners = manifest.type === 'class' ? [manifest.class] : manifest.dungeon.monsters;
  for (const owner of owners) {
    for (const spell of owner.spells) if (spell.icon) files.add(spell.icon);
    if (owner.artwork) for (const file of ARTWORK_SPEC.files.filter(file => file.required)) files.add(`${owner.artwork}/${file.name}`);
  }
  return { required: files, optional: new Set(owners.flatMap(owner => owner.artwork
    ? ARTWORK_SPEC.files.filter(file => !file.required).map(file => `${owner.artwork}/${file.name}`) : [])) };
}

export function compileContentManifest(manifest, { newId, artworkIds = {}, iconArtworkId } = {}) {
  const report = validateContentManifest(manifest);
  if (report.errors.length) throw new Error(report.errors.join('\n'));
  const used = [];
  const compileBook = spells => spells.map(spell => {
    const raw = compilePackageSpell(spell, used); used.push(raw.id);
    return { ...raw, ...(spell.icon ? { iconArtworkId } : {}) };
  });
  const shared = { id: newId(), name: manifest.name, description: manifest.description,
    package: { id: manifest.id, version: manifest.version, author: manifest.author, design: clone(manifest.design) } };
  if (manifest.type === 'class') {
    const cls = manifest.class, spells = compileBook(cls.spells);
    return { tab: 'characters', entry: { ...shared, classId: cls.baseClass,
      loadout: { ...emptyLoadout(cls.baseClass), level: 200, profile: { sex: cls.sex },
        ...(cls.artwork ? { artworkId: artworkIds[cls.artwork] } : {}), spells: { custom: spells, order: spells.map(spell => spell.id) } } }, ...report };
  }
  const monsters = Object.fromEntries(manifest.dungeon.monsters.map(monster => [monster.key, {
    ...clone(monster), spells: compileBook(monster.spells), ...(monster.artwork ? { artworkId: artworkIds[monster.artwork] } : {}),
  }]));
  return { tab: 'dungeons', entry: { ...shared, mapId: manifest.dungeon.mapId,
    members: manifest.dungeon.members.map(member => ({ customMonster: monsters[member.monster], count: member.count })) }, ...report };
}

export function packageExample(type = 'class') {
  const attack = { key: 'ember', name: 'Braise vive', description: 'Une attaque de feu à moyenne portée.', counterplay: 'Couper la ligne de vue ou résister au feu.',
    pa: 3, rangeMin: 1, rangeMax: 5, targetMode: 'enemy', needsLos: true, lineOnly: false, adjustableRange: false,
    maxPerTurn: 2, maxPerTarget: 2, cooldown: 0, critRate: 0, failRate: 0, endsTurnOnFailure: false, visualSpellId: 161,
    effects: [{ kind: 'damage', min: 15, max: 19, duration: 0, zone: 'Pa', target: 'enemy', element: 'feu' }], critEffects: [] };
  const boost = { ...clone(attack), key: 'resolve', name: 'Résolution', description: 'Prépare le prochain assaut.', counterplay: 'Garder ses distances pendant les deux tours du bonus.',
    pa: 2, rangeMin: 0, rangeMax: 0, targetMode: 'self', maxPerTurn: 1, maxPerTarget: 1, cooldown: 4, visualSpellId: 153,
    effects: [{ kind: 'buffDamage', min: 8, max: 8, duration: 2, zone: 'Pa', target: 'self' }] };
  const result = { format: 'dofus-lite-content', schemaVersion: 1, type, id: type === 'class' ? 'ember-warden' : 'ember-keep', version: '1.0.0',
    name: type === 'class' ? 'Gardien des braises' : 'Citadelle des braises', description: 'Un exemple jouable à personnaliser.', author: 'Votre nom',
    design: { role: 'Dégâts à moyenne portée', strengths: ['Préparation offensive'], weaknesses: ['Ligne de vue nécessaire', 'Aucun soin'],
      turnLoop: 'Se rapprocher, préparer Résolution, puis lancer Braise vive.', counterplay: 'Profiter de la relance du bonus et des obstacles.' } };
  if (type === 'class') result.class = { baseClass: 'IOP', sex: 0, spells: [attack, boost] };
  else result.dungeon = { mapId: KANOJEDO_MAP_ID,
    monsters: [{ key: 'warden', name: 'Gardien des braises', description: 'Gardien de la citadelle.', role: 'Attaquant', counterplay: 'Couper sa ligne de vue.',
      reference: { monsterId: 147, grade: 1 }, tuning: { hpPercent: 75, statsPercent: 100, paBonus: 0, pmBonus: 0 }, spells: [attack, boost] },
    { key: 'sentinel', name: 'Sentinelle de cendre', description: 'Un soutien offensif fragile.', role: 'Attaquant secondaire', counterplay: 'Éliminer rapidement ses faibles PV.',
      reference: { monsterId: 147, grade: 1 }, tuning: { hpPercent: 25, statsPercent: 50, paBonus: 0, pmBonus: 0 }, spells: [{ ...clone(attack), key: 'spark', name: 'Étincelle' }] }],
    members: [{ monster: 'warden', count: 1 }, { monster: 'sentinel', count: 2 }] };
  return result;
}

export function packageMonsterSummary(monster) {
  if (!monster.spells.length) return '0 sort · Ajoutez un sort pour jouer';
  const resolved = resolveCustomMonster(monster);
  return `${resolved.baseHp} PV · ${resolved.basePa} PA · ${resolved.basePm} PM · ${monster.spells.length} sorts`;
}

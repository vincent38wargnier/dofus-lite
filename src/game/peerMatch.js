import { applyAction, createGame, currentFighter, placeFighter, readyFighter, spellsOf, getView } from '../engine/engine';
import { customDungeonRoster } from '../engine/customDungeons';
import { MAPS } from '../engine/maps';
import { BOSSES, monsterGrades, POUTCH_ID, monsterDecide } from '../engine/monsters';
import { createRng, hashSeed } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { utilityDecide } from '../bots/utilityBrain';
import { crc32 } from '../content/zip';
import { check } from '../net/p2p';

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
export const canonical = value => JSON.stringify(value, function (key, current) {
  return current && typeof current === 'object' && !Array.isArray(current)
    ? Object.fromEntries(Object.keys(current).sort().map(k => [k, current[k]])) : current;
});
// Detect accidental divergence, not an anti-cheat signature. DTLS authenticates
// the transport; both friends intentionally possess the seed and full state.
export const stateHash = state => crc32(new TextEncoder().encode(canonical(state))).toString(16).padStart(8, '0');

export function peerSettings(input) {
  check(input && ['duel', 'boss', 'custom', 'kanojedo'].includes(input.mode), 'Mode de combat P2P inconnu.');
  check(Number.isSafeInteger(input.seed) && input.seed >= 0 && input.seed <= 0xffffffff, 'Graine P2P invalide.');
  check(typeof input.mapId === 'string' && own(MAPS, input.mapId), 'Carte P2P inconnue.');
  const value = { mode: input.mode, mapId: input.mapId, seed: input.seed };
  if (input.mode === 'boss') {
    check(BOSSES.some(boss => boss.id === input.bossId) && monsterGrades(input.bossId).some(g => g.grade === input.bossGrade), 'Donjon ou niveau inconnu.');
    value.bossId = input.bossId; value.bossGrade = input.bossGrade;
  }
  if (input.mode === 'kanojedo') {
    check(monsterGrades(POUTCH_ID).some(g => g.grade === input.monsterGrade), 'Niveau de Poutch inconnu.');
    value.monsterGrade = input.monsterGrade;
  }
  return value;
}

const point = p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.y >= 0 && p.x < 100 && p.y < 100;
export function safeAction(action) {
  check(action && typeof action === 'object', 'Action invalide.');
  if (action.type === 'PASS') return { type: 'PASS' };
  if (action.type === 'MOVE') { check(point(action.to), 'Case invalide.'); return { type: 'MOVE', to: { x: action.to.x, y: action.to.y } }; }
  if (action.type === 'CAST') {
    check(typeof action.spell === 'string' && action.spell.length <= 120 && point(action.target), 'Sort ou cible invalide.');
    return { type: 'CAST', spell: action.spell, target: { x: action.target.x, y: action.target.y } };
  }
  throw new Error('Action P2P inconnue.');
}

export class PeerMatch {
  constructor(settings, units, localParticipant, snapshot) {
    this.seed = settings.seed; this.network = true; this.participant = localParticipant;
    this.owners = {}; this.controllers = {}; const counts = { A: 0, B: 0 };
    const fighters = units.map(unit => {
      const n = ++counts[unit.team], id = `${unit.team}${n === 1 ? '' : n}`;
      this.owners[id] = unit.owner; this.controllers[id] = unit.controller;
      return { ...customDungeonRoster({ name: 'Salon', mapId: settings.mapId, members: [unit.member] })[0], id, team: unit.team };
    });
    this.humanIds = new Set(Object.keys(this.owners).filter(id => this.owners[id] === localParticipant && this.controllers[id] === 'player'));
    this.localId = [...this.humanIds][0] || Object.keys(this.owners).find(id => this.owners[id] === localParticipant) || 'A';
    this.lastHumanId = this.localId; this.rngs = {}; this.uiRng = createRng(hashSeed(`${this.seed}:ui`));
    if (snapshot) { this.state = snapshot.state; this.initialEvents = snapshot.events; }
    else {
      check(localParticipant === 'host', 'Seul l’hôte crée le combat.');
      const init = createGame({ mapId: settings.mapId, seed: settings.seed, placement: true, fighters });
      this.state = init.state; this.initialEvents = [...init.events];
      for (const fighter of fighters.filter(f => this.controllers[f.id] === 'ai')) {
        const result = readyFighter(this.state, fighter.id); this.state = result.state; this.initialEvents.push(...result.events);
      }
    }
    this.botTurn = ''; this.botActions = 0;
  }
  get over() { return this.state.over; }
  get placing() { return this.state.phase === 'placement'; }
  get available() { return !!this.room?.available; }
  get viewerTeam() { return this.controlledFighter().team; }
  current() { return currentFighter(this.state); }
  isHumanTurn() { return this.available && !this.placing && !this.over && this.humanIds.has(this.current().id); }
  controlledFighter() {
    if (!this.placing && !this.over && this.humanIds.has(this.current().id)) { this.lastHumanId = this.current().id; return this.current(); }
    return [this.lastHumanId, ...this.humanIds, this.localId].map(id => this.state.fighters[id]).find(f => f?.hp > 0) || this.state.fighters[this.localId];
  }
  humanView() { return getView(this.state, this.controlledFighter().id); }
  humanApi(view) { return makeBotApi(view || this.humanView(), this.uiRng); }
  canPlace(id) { return this.humanIds.has(id) && this.available && this.placing && !this.state.placement.ready[id]; }
  isReady() { return [...this.humanIds].every(id => this.state.placement.ready[id]); }
  humanAct(action) { return this.room.submit({ kind: 'action', fighter: this.controlledFighter().id, action: safeAction(action) }); }
  placeHuman(to, fighter = this.localId) { return this.room.submit({ kind: 'place', fighter, to }); }
  ready() { return this.room.submit({ kind: 'ready' }); }
  reorder(order) { return this.room.submit({ kind: 'order', fighter: this.controlledFighter().id, order }); }
  canBotStep() { return this.participant === 'host' && this.available && !this.placing && !this.over && this.controllers[this.current().id] !== 'player'; }
  botStep() {
    if (!this.canBotStep()) return { events: null };
    const f = this.current(), turn = `${this.state.turn}:${f.id}`;
    if (turn !== this.botTurn) { this.botTurn = turn; this.botActions = 0; }
    this.botActions++;
    if (!this.rngs[f.id]) this.rngs[f.id] = createRng(hashSeed(`${this.seed}:${f.id}`));
    let action = { type: 'PASS' };
    if (this.botActions <= 64) {
      try {
        const view = getView(this.state, f.id), api = makeBotApi(view, this.rngs[f.id]);
        const candidate = safeAction(f.isMonster ? monsterDecide(view, api, utilityDecide) : utilityDecide(view, api));
        if (applyAction(this.state, candidate).ok) action = candidate;
      } catch (_) { /* An invalid AI decision ends its turn, never the room. */ }
    }
    return this.room.submit({ kind: 'action', fighter: f.id, action }, 'ai');
  }
  // Only the host rolls dice, applies effects and runs bots. Guests submit
  // intentions and display its snapshots; local APIs are targeting previews.
  reduce(command, actor, source = 'player') {
    check(this.participant === 'host', 'Seul l’hôte calcule le combat.');
    if (command?.kind === 'ready') {
      check(this.placing && source === 'player', 'Placement terminé.');
      const ids = Object.keys(this.owners).filter(id => this.owners[id] === actor && this.controllers[id] === 'player');
      check(ids.length > 0, 'Aucun combattant à placer.');
      let state = this.state; const events = [];
      for (const id of ids) if (!state.placement.ready[id]) {
        const result = readyFighter(state, id); check(result.ok, result.reason || 'Placement impossible.');
        state = result.state; events.push(...result.events);
      }
      return { ok: true, state, events };
    }
    check(command && typeof command.fighter === 'string' && own(this.state.fighters, command.fighter), 'Combattant inconnu.');
    const fighter = this.state.fighters[command.fighter];
    check(['player', 'ai', 'timeout'].includes(source), 'Origine d’action inconnue.');
    if (source === 'player') check(this.owners[fighter.id] === actor && this.controllers[fighter.id] === 'player', 'Vous ne contrôlez pas ce combattant.');
    else {
      check(actor === 'host' && command.kind === 'action', 'Action automatique non autorisée.');
      check(source === 'ai' ? this.controllers[fighter.id] !== 'player' : this.controllers[fighter.id] === 'player' && command.action?.type === 'PASS', 'Action automatique non autorisée.');
    }
    if (command.kind === 'action') {
      check(!this.placing && !this.over && this.current().id === fighter.id, 'Ce n’est pas le tour de ce combattant.');
      return applyAction(this.state, safeAction(command.action));
    }
    if (command.kind === 'place') { check(point(command.to), 'Case de placement invalide.'); return placeFighter(this.state, fighter.id, command.to); }
    if (command.kind === 'order') {
      const ids = new Set(Object.values(spellsOf(fighter)).map(s => s.id));
      check(fighter.loadout && Array.isArray(command.order) && command.order.length <= 50 && new Set(command.order).size === command.order.length
        && command.order.every(id => Number.isInteger(id) && ids.has(id)), 'Ordre des sorts invalide.');
      const loadout = { ...fighter.loadout, spells: { ...fighter.loadout.spells, order: command.order } };
      return { ok: true, events: [], state: { ...this.state, fighters: { ...this.state.fighters, [fighter.id]: { ...fighter, loadout } } } };
    }
    throw new Error('Commande P2P inconnue.');
  }
}

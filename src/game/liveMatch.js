// Match en direct: un humain contre un bot, sur le MÊME moteur et avec les
// MÊMES règles d'arbitrage que l'arène (budget d'actions, actions invalides,
// invocations autonomes des deux camps). La différence: le combat avance pas
// à pas — le joueur clique, le bot joue une action à la fois pour que l'UI
// puisse animer chaque coup.

import {
  createGame, applyAction, getView, currentFighter, placeFighter, readyFighter,
} from '../engine/engine';
import { createRng, hashSeed } from '../engine/rng';
import { makeBotApi } from '../bots/api';
import { utilityDecide } from '../bots/utilityBrain';
import { MAX_ACTIONS_PER_TURN, MAX_INVALID_PER_TURN } from '../arena/runner';
import { KANOJEDO_MAP_ID, POUTCH_ID, DEFAULT_BOSS_ID, defaultMonsterGrade, monsterDecide, BOSSES } from '../engine/monsters';
import { dungeonRoster, dungeonMapId } from '../engine/dungeons';
import { customDungeonRoster } from '../engine/customDungeons';

export const HUMAN_ID = 'A';
export const TURN_SECONDS = 30; // comme en 1.29

export class LiveMatch {
  constructor({ playerClass, botClass, mapId, seed, botName, botDecide, playerName = 'Vous', loadouts = {}, mode = 'duel', monsterGrade = 5, bossId = DEFAULT_BOSS_ID, bossGrade = defaultMonsterGrade(bossId), dungeon }) {
    if (mode === 'boss' && !BOSSES.some(boss => boss.id === bossId)) throw new Error('Boss inconnu.');
    const init = createGame({
      mapId: mode === 'custom' ? dungeon?.mapId : mode === 'kanojedo' ? KANOJEDO_MAP_ID : mode === 'boss' ? dungeonMapId(bossId) : mapId,
      seed,
      placement: true,
      fighters: [
        { id: 'A', name: playerName, botName: playerName, classId: playerClass, loadout: loadouts.A },
        ...(mode === 'custom' ? customDungeonRoster(dungeon)
          : mode === 'kanojedo' ? [{ id: 'B', monsterId: POUTCH_ID, monsterGrade }]
          : mode === 'boss' ? dungeonRoster(bossId, bossGrade, seed)
          : [{ id: 'B', name: botName, botName, classId: botClass, loadout: loadouts.B }]),
      ],
    });
    this.state = init.state;
    this.initialEvents = [...init.events];
    for (const opponent of Object.values(init.state.fighters).filter(f => f.id !== HUMAN_ID)) {
      const ready = readyFighter(this.state, opponent.id);
      this.state = ready.state;
      this.initialEvents.push(...ready.events);
    }
    this.seed = seed;
    this.botDecide = botDecide;
    this.rngs = {};
    this.uiRng = createRng(hashSeed(`${seed}:ui`));
    this.turnKey = '';
    this.actions = 0;
    this.invalid = 0;
  }

  get over() { return this.state.over; }
  get placing() { return this.state.phase === 'placement'; }

  current() { return currentFighter(this.state); }

  isHumanTurn() { return !this.placing && !this.state.over && this.current().id === HUMAN_ID; }

  placeHuman(to) {
    const result = placeFighter(this.state, HUMAN_ID, to);
    this.state = result.state;
    return result;
  }

  ready() {
    const result = readyFighter(this.state, HUMAN_ID);
    this.state = result.state;
    return result;
  }

  humanView() { return getView(this.state, HUMAN_ID); }

  // L'api officielle sur la vue du joueur: cases atteignables, cibles de
  // sorts, tacle… — exactement ce que verrait un bot à sa place.
  humanApi(view) { return makeBotApi(view || this.humanView(), this.uiRng); }

  humanAct(action) {
    if (!this.isHumanTurn()) return { ok: false, events: [] };
    const r = applyAction(this.state, action);
    this.state = r.state;
    return { ok: r.ok, events: r.events };
  }

  // Une action du combattant courant NON humain (bot adverse ou invocation,
  // y compris les invocations du joueur: elles sont autonomes, comme en 1.29).
  botStep() {
    if (this.placing || this.state.over || this.isHumanTurn()) return { events: [] };
    const f = this.current();
    const fid = f.id;

    const tk = `${fid}:${this.state.turn}`;
    if (tk !== this.turnKey) { this.turnKey = tk; this.actions = 0; this.invalid = 0; }
    if (!this.rngs[fid]) this.rngs[fid] = createRng(hashSeed(`${this.seed}:${fid}`));

    let action = null;
    try {
      const view = getView(this.state, fid);
      const api = makeBotApi(view, this.rngs[fid]);
      action = f.isMonster ? monsterDecide(view, api, utilityDecide)
        : (fid === 'B' && !f.isSummon) ? this.botDecide(view, api) : utilityDecide(view, api);
    } catch (err) {
      const events = [{ t: 'bot_error', fighter: fid, message: String(err && err.message ? err.message : err) }];
      const p = applyAction(this.state, { type: 'PASS' });
      this.state = p.state;
      return { events: [...events, ...p.events] };
    }

    if (!action || typeof action.type !== 'string') {
      this.invalid += 1;
      if (this.invalid < MAX_INVALID_PER_TURN) return { events: [] };
      action = { type: 'PASS' };
    }

    if (action.type === 'SAY') {
      this.actions += 1;
      return { events: [{ t: 'say', fighter: fid, text: String(action.text || '').slice(0, 80) }] };
    }

    const r = applyAction(this.state, action);
    this.state = r.state;
    this.actions += 1;
    let events = r.events;

    if (!r.ok) this.invalid += 1;

    // Budgets de l'arbitre: trop d'actions ou trop d'invalides → tour passé.
    const stillMyTurn = !this.state.over && this.current().id === fid;
    if (stillMyTurn && (this.invalid >= MAX_INVALID_PER_TURN || this.actions >= MAX_ACTIONS_PER_TURN)) {
      const p = applyAction(this.state, { type: 'PASS' });
      this.state = p.state;
      events = [...events, ...p.events];
    }
    return { events };
  }
}

// Match en direct: une équipe d'alliés manuels ou automatiques contre des
// adversaires, sur le même moteur et avec les mêmes règles que l'arène.
// Le joueur contrôle chaque allié manuel à son tour; bots et invocations
// avancent une action à la fois pour que l'UI puisse animer chaque coup.

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
import { opponentRoster } from '../engine/opponentTeam';
import { allyRoster, allyFighterId, teamRoster, teamFighterId } from '../engine/allyTeam';

export const HUMAN_ID = 'A';
export const TURN_SECONDS = 30; // comme en 1.29

// Plafond des SAY par tour (hors budget d'actions): à 150 ms de polling, 200
// ticks ≈ 30 s de réflexion — large pour le pire cas mesuré du Stratège
// (~8 s soit ~52 ticks), mais borne tout bot qui tenterait de bloquer le tour.
const MAX_SAYS_PER_TURN = 200;

export class LiveMatch {
  constructor({ playerClass, botClass, mapId, seed, botName, botDecide, playerName = 'Vous', playerController = 'player', loadouts = {}, mode = 'duel', monsterGrade = 5, bossId = DEFAULT_BOSS_ID, bossGrade = defaultMonsterGrade(bossId), dungeon, opponents, opponentBots = {}, allies = [], allyBots = {}, team }) {
    if (mode === 'boss' && !BOSSES.some(boss => boss.id === bossId)) throw new Error('Boss inconnu.');
    const init = createGame({
      mapId: mode === 'custom' ? dungeon?.mapId : mode === 'kanojedo' ? KANOJEDO_MAP_ID : mode === 'boss' ? dungeonMapId(bossId) : mapId,
      seed,
      placement: true,
      fighters: [
        ...(team ? teamRoster(team) : [{ id: 'A', name: playerName, botName: playerName, classId: playerClass, loadout: loadouts.A }, ...allyRoster(allies)]),
        ...(mode === 'duel' && opponents ? opponentRoster(opponents) : mode === 'custom' ? customDungeonRoster(dungeon)
          : mode === 'kanojedo' ? [{ id: 'B', monsterId: POUTCH_ID, monsterGrade }]
          : mode === 'boss' ? dungeonRoster(bossId, bossGrade, seed)
          : [{ id: 'B', name: botName, botName, classId: botClass, loadout: loadouts.B }]),
      ],
    });
    this.state = init.state;
    this.initialEvents = [...init.events];
    this.humanIds = new Set(team ? team.flatMap((entry, index) => entry.controller === 'player' ? [teamFighterId(index)] : [])
      : [...(playerController === 'player' ? [HUMAN_ID] : []), ...allies.flatMap((entry, index) => entry.controller === 'player' ? [allyFighterId(index)] : [])]);
    this.lastHumanId = this.humanIds.values().next().value || HUMAN_ID;
    this.allyBots = allyBots;
    this.opponentBots = opponentBots;
    this.dungeonCharacters = new Set(mode === 'custom' ? Object.values(init.state.fighters).filter(f => f.team === 'B' && !f.isMonster).map(f => f.id) : []);
    for (const opponent of Object.values(init.state.fighters).filter(f => f.team !== 'A')) {
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

  isHumanTurn() { return !this.placing && !this.state.over && this.humanIds.has(this.current().id); }

  controlledFighter() {
    if (this.isHumanTurn()) return this.current();
    return [this.lastHumanId, ...this.humanIds].map(id => this.state.fighters[id]).find(f => f?.hp > 0) || this.state.fighters.A;
  }

  placeHuman(to, fighterId = HUMAN_ID) {
    if (this.state.fighters[fighterId]?.team !== 'A') return { ok: false, reason: 'Choisissez un membre de votre équipe.', events: [] };
    const result = placeFighter(this.state, fighterId, to);
    this.state = result.state;
    return result;
  }

  ready() {
    const events = [];
    for (const fighter of Object.values(this.state.fighters).filter(f => f.team === 'A')) {
      if (this.state.placement.ready[fighter.id]) continue;
      const result = readyFighter(this.state, fighter.id);
      if (!result.ok) return result;
      this.state = result.state; events.push(...result.events);
    }
    return { ok: true, state: this.state, events };
  }

  humanView() { return getView(this.state, this.controlledFighter().id); }

  // L'api officielle sur la vue du joueur: cases atteignables, cibles de
  // sorts, tacle… — exactement ce que verrait un bot à sa place.
  humanApi(view) { return makeBotApi(view || this.humanView(), this.uiRng); }

  humanAct(action) {
    if (!this.isHumanTurn()) return { ok: false, events: [] };
    this.lastHumanId = this.current().id;
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
    if (tk !== this.turnKey) { this.turnKey = tk; this.actions = 0; this.invalid = 0; this.says = 0; }
    if (!this.rngs[fid]) this.rngs[fid] = createRng(hashSeed(`${this.seed}:${fid}`));

    let action = null;
    try {
      const view = getView(this.state, fid);
      const api = makeBotApi(view, this.rngs[fid]);
      const assignedBot = this.opponentBots[fid] || this.allyBots[fid];
      action = !f.isSummon && assignedBot ? assignedBot.decide(view, api)
        : f.isMonster ? monsterDecide(view, api, utilityDecide)
        : this.dungeonCharacters.has(fid) ? utilityDecide(view, api)
        : f.isSummon ? utilityDecide(view, api)
          : ((f.team === 'B' ? this.botDecide : null) || utilityDecide)(view, api);
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
      // Les SAY ne consomment PAS le budget d'actions: les bots asynchrones
      // (Stratège via Worker) émettent des ticks « calcule… » en attendant leur
      // décision — les compter tronquait leur tour à ~2 vraies actions. Plafond
      // séparé pour qu'un bot ne puisse pas bloquer le tour indéfiniment.
      this.says = (this.says || 0) + 1;
      const events = [{ t: 'say', fighter: fid, text: String(action.text || '').slice(0, 80) }];
      if (this.says >= MAX_SAYS_PER_TURN && !this.state.over && this.current().id === fid) {
        const p = applyAction(this.state, { type: 'PASS' });
        this.state = p.state;
        return { events: [...events, ...p.events] };
      }
      return { events };
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

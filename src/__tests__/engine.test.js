import {
  createGame, applyAction, validateAction,
} from '../engine/engine';
import { dist, cellsBetween, hasLineOfSight, spellZoneCells } from '../engine/geometry';
import {
  critDivisor, escapeChance, rollPointRemoval, initiative,
  pushbackDamage, damageAmount, applyResistances, healAmount,
} from '../engine/formulas';
import { createRng } from '../engine/rng';
import { CLASSES } from '../engine/classes';
import { compileBot } from '../bots/compile';
import { BUILTIN_BOTS, getBuiltinBot } from '../bots/builtins';
import { runMatch } from '../arena/runner';
import { runTournament } from '../arena/tournament';

// Force a known actor order so tests are position-deterministic.
function freshGame(classA = 'IOP', classB = 'IOP', mapId = 'arene', seed = 7) {
  const { state } = createGame({
    mapId,
    seed,
    fighters: [
      { id: 'A', name: 'Alpha', classId: classA },
      { id: 'B', name: 'Beta', classId: classB },
    ],
  });
  state.order = ['A', 'B'];
  state.currentIndex = 0;
  return state;
}

// Certain spells can critically fail (1/100): retry over seeds until the cast
// actually lands, keeping the test deterministic.
function castUntilHit(mkState, action, maxSeeds = 12) {
  for (let seed = 1; seed <= maxSeeds; seed++) {
    const state = mkState(seed);
    const r = applyAction(state, action);
    if (!r.events.some((e) => e.t === 'spell_fail')) return r;
  }
  throw new Error('no clean cast found');
}

describe('geometry', () => {
  test('manhattan distance', () => {
    expect(dist({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
  });

  test('cellsBetween excludes endpoints and walks the segment', () => {
    expect(cellsBetween({ x: 0, y: 0 }, { x: 3, y: 0 }))
      .toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  });

  test('line of sight blocked by a blocking cell', () => {
    const blocker = (x, y) => x === 1 && y === 0;
    expect(hasLineOfSight({ x: 0, y: 0 }, { x: 3, y: 0 }, blocker)).toBe(false);
    expect(hasLineOfSight({ x: 0, y: 1 }, { x: 3, y: 1 }, blocker)).toBe(true);
  });

  test('spell zones: point, circle, cross, line', () => {
    const caster = { x: 0, y: 5 };
    const target = { x: 3, y: 5 };
    expect(spellZoneCells('Pa', target, caster)).toEqual([target]);
    expect(spellZoneCells('Cb', target, caster)).toHaveLength(5); // disc r=1
    expect(spellZoneCells('Cc', target, caster)).toHaveLength(13); // disc r=2
    expect(spellZoneCells('Xb', target, caster)).toHaveLength(5); // cross 1
    const line = spellZoneCells('Lc', target, caster); // line, away from caster
    expect(line).toEqual([{ x: 3, y: 5 }, { x: 4, y: 5 }, { x: 5, y: 5 }]);
  });
});

describe('formules 1.29', () => {
  test('coup critique: agilité améliore le 1/x (2.9901 / ln(agi+12))', () => {
    expect(critDivisor(40, 0)).toBe(40);   // faible agilité: aucun malus
    expect(critDivisor(40, 120)).toBe(24); // 120 agi: 1/24
    expect(critDivisor(2, 1000)).toBe(2);  // plancher 1/2
    expect(critDivisor(0, 500)).toBe(0);   // sort sans critique
  });

  test('fuite: 300*(agi+25)/(agi+agiEnnemis+50) - 100, borné [0,100]', () => {
    expect(escapeChance(60, 60)).toBe(50);   // agilités égales: 50%
    expect(escapeChance(0, 1000)).toBe(0);   // fuite impossible
    expect(escapeChance(1000, 0)).toBe(100); // fuite garantie
    expect(escapeChance(120, 60)).toBe(89);  // floor(300*145/230)-100
  });

  test('esquive PA/PM: probabilité par point, sagesse/4', () => {
    const rng = createRng(3);
    const { removed, dodged } = rollPointRemoval(rng, 30, 15, 8, 8, 4);
    expect(removed + dodged).toBe(4);
    expect(removed).toBeGreaterThanOrEqual(0);
    expect(removed).toBeLessThanOrEqual(4);
  });

  test('initiative: (caracs + bonus initiative) * ratio de vie', () => {
    const stats = { force: 220, intelligence: 60, chance: 0, agilite: 60 };
    expect(initiative(stats, 850, 850)).toBe(340);
    expect(initiative(stats, 425, 850)).toBe(170); // blessé: initiative réduite
  });

  test('poussée: (8 + 1d8 * niveau/50) * cases bloquées', () => {
    const rng = createRng(1);
    for (let i = 0; i < 20; i++) {
      const dmg = pushbackDamage(rng, 100, 2);
      expect(dmg).toBeGreaterThanOrEqual(20); // (8+1*2)*2
      expect(dmg).toBeLessThanOrEqual(48);    // (8+8*2)*2
    }
    expect(pushbackDamage(rng, 100, 0)).toBe(0);
  });

  test('dégâts élémentaires: jet * (100+carac)/100, puis résistances', () => {
    const caster = { stats: { force: 220, intelligence: 0, chance: 0, agilite: 0 }, effects: [] };
    expect(damageAmount(10, 'terre', caster)).toBe(32);
    expect(damageAmount(10, 'feu', caster)).toBe(10); // pas d'intelligence
    const target = { resistances: { terre: 25 }, resistancesFixed: { terre: 5 } };
    expect(applyResistances(32, 'terre', target)).toBe(20); // floor((32-5)*0.75)
  });

  test('soins: jet * (100+intelligence)/100', () => {
    const eni = { stats: { intelligence: 200 }, effects: [] };
    expect(healAmount(15, eni)).toBe(45);
  });
});

describe('sorts réels (données AncestraRemake)', () => {
  test('les classes portent les vrais sorts', () => {
    expect(Object.keys(CLASSES.IOP.spells)).toContain('colere');
    expect(CLASSES.IOP.spells.pression.pa).toBe(3);
    expect(CLASSES.IOP.spells.colere.pa).toBe(7);
    expect(CLASSES.IOP.spells.colere.cooldown).toBe(4);
    expect(CLASSES.CRA.spells.fleche_magique.range).toEqual([1, 11]);
    expect(CLASSES.CRA.spells.fleche_magique.usesPerTurn).toBe(0);
    expect(CLASSES.CRA.spells.fleche_magique.usesPerTarget).toBe(2);
    expect(CLASSES.CRA.spells.fleche_ralentissante.effects[0].kind).toBe('removePa');
    expect(CLASSES.ENIRIPSA.spells.mot_vampirique.effects[0].kind).toBe('lifeSteal');
  });

  test('Pression: dégâts terre boostés par la force, érosion PvP', () => {
    const mk = (seed) => {
      const s = freshGame('IOP', 'IOP', 'arene', seed);
      s.fighters.A.pos = { x: 5, y: 6 };
      s.fighters.B.pos = { x: 5, y: 7 };
      return s;
    };
    const { state: after, events } = castUntilHit(mk, { type: 'CAST', spell: 'pression', target: { x: 5, y: 7 } });
    const dmg = events.find((e) => e.t === 'damage');
    expect(after.fighters.A.pa).toBe(7 - 3);
    // Force 260 + 101 scrolled: normal 8..12 or critical 10..14 × 4.61.
    expect(dmg.amount).toBeGreaterThanOrEqual(36);
    expect(dmg.amount).toBeLessThanOrEqual(64);
    expect(dmg.element).toBe('terre');
    expect(dmg.erosion).toBe(Math.floor(dmg.amount / 10));
    expect(after.fighters.B.maxHp).toBe(951 - dmg.erosion);
  });

  test('lancers par cible: Flèche Magique 2x max sur le même combattant', () => {
    let state = freshGame('CRA', 'IOP');
    state.fighters.A.pos = { x: 5, y: 6 };
    state.fighters.B.pos = { x: 5, y: 9 };
    state.fighters.A.pa = 20; // assez de PA pour isoler la limite de lancers
    const target = { x: 5, y: 9 };
    state = applyAction(state, { type: 'CAST', spell: 'fleche_magique', target }).state;
    state = applyAction(state, { type: 'CAST', spell: 'fleche_magique', target }).state;
    const r = validateAction(state, { type: 'CAST', spell: 'fleche_magique', target });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/déjà lancé/);
  });

  test('intervalle de relance: Colère de Iop 4 tours', () => {
    const mk = (seed) => {
      const s = freshGame('IOP', 'IOP', 'arene', seed);
      s.fighters.A.pos = { x: 5, y: 6 };
      s.fighters.B.pos = { x: 5, y: 7 };
      return s;
    };
    const { state: after } = castUntilHit(mk, { type: 'CAST', spell: 'colere', target: { x: 5, y: 7 } });
    expect(after.fighters.A.cooldowns.colere).toBe(4);
    after.fighters.A.pa = 10; // assez de PA pour isoler la relance
    const again = validateAction(after, { type: 'CAST', spell: 'colere', target: { x: 5, y: 7 } });
    expect(again.ok).toBe(false);
    expect(again.reason).toMatch(/relance/);
  });

  test('ligne de vue: un mur bloque Flèche Magique', () => {
    const state = freshGame('CRA', 'IOP', 'muraille');
    state.fighters.A.pos = { x: 5, y: 3 };
    state.fighters.B.pos = { x: 7, y: 3 }; // mur en (6,3)
    const r = validateAction(state, { type: 'CAST', spell: 'fleche_magique', target: { x: 7, y: 3 } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/ligne de vue/);
  });

  test('sort en ligne: Flèche Enflammée refuse la diagonale', () => {
    const state = freshGame('CRA', 'IOP');
    state.fighters.A.pos = { x: 2, y: 2 };
    state.fighters.B.pos = { x: 5, y: 4 };
    const r = validateAction(state, { type: 'CAST', spell: 'fleche_enflammee', target: { x: 5, y: 4 } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/en ligne/);
  });

  test('Intimidation: pousse 3 cases, collision au bord = dégâts bruts', () => {
    const mk = (seed) => {
      const s = freshGame('IOP', 'IOP', 'arene', seed);
      s.fighters.A.pos = { x: 10, y: 6 };
      s.fighters.B.pos = { x: 11, y: 6 };
      return s;
    };
    const { state: after, events } = castUntilHit(mk, { type: 'CAST', spell: 'intimidation', target: { x: 11, y: 6 } });
    const push = events.find((e) => e.t === 'push');
    expect(push.moved).toBe(1); // le bord (x=12) puis dehors
    // 2 cases bloquées: floor((8 + jet(1..8) * 2) * 2)
    expect(push.collisionDamage).toBeGreaterThanOrEqual(20);
    expect(push.collisionDamage).toBeLessThanOrEqual(48);
    expect(after.fighters.B.pos).toEqual({ x: 12, y: 6 });
  });

  test('Bond: téléportation sur case libre', () => {
    const mk = (seed) => {
      const s = freshGame('IOP', 'IOP', 'arene', seed);
      s.fighters.A.pos = { x: 2, y: 6 };
      return s;
    };
    const { state: after } = castUntilHit(mk, { type: 'CAST', spell: 'bond', target: { x: 2, y: 3 } });
    expect(after.fighters.A.pos).toEqual({ x: 2, y: 3 });
    const onFighter = validateAction(freshGame('IOP', 'IOP'), {
      type: 'CAST', spell: 'bond', target: freshGame('IOP', 'IOP').fighters.B.pos,
    });
    expect(onFighter.ok).toBe(false);
  });

  test('Mot Stimulant: +PA immédiat et sur la durée', () => {
    const mk = (seed) => freshGame('ENIRIPSA', 'IOP', 'arene', seed);
    const { state: after } = castUntilHit(mk, { type: 'CAST', spell: 'mot_stimulant', target: { x: 0, y: 0 } });
    // coût 2 PA, +1 ou +2 PA
    expect(after.fighters.A.pa).toBeGreaterThanOrEqual(6);
    expect(after.fighters.A.pa).toBeLessThanOrEqual(7);
    const buff = after.fighters.A.effects.find((e) => e.stat === 'pa');
    expect(buff).toBeTruthy();
    expect(buff.turnsLeft).toBe(6); // cinq tours suivants + fin du tour de lancement
  });

  test('Flèche Ralentissante: retrait PA esquivable', () => {
    const mk = (seed) => {
      const s = freshGame('CRA', 'IOP', 'arene', seed);
      s.fighters.A.pos = { x: 5, y: 6 };
      s.fighters.B.pos = { x: 5, y: 9 };
      return s;
    };
    const { state: after, events } = castUntilHit(mk, { type: 'CAST', spell: 'fleche_ralentissante', target: { x: 5, y: 9 } });
    const removal = events.find((e) => e.t === 'point_removal');
    expect(removal.stat).toBe('PA');
    expect(removal.removed + removal.dodged).toBe(2);
    if (removal.removed > 0) {
      const debuff = after.fighters.B.effects.find((e) => e.stat === 'pa' && e.value < 0);
      expect(debuff.turnsLeft).toBe(1);
    }
  });

  test('Mot Vampirique: vole la vie (moitié des dégâts, sans boost)', () => {
    const mk = (seed) => {
      const s = freshGame('ENIRIPSA', 'IOP', 'arene', seed);
      s.fighters.A.pos = { x: 5, y: 6 };
      s.fighters.A.hp = 400;
      s.fighters.B.pos = { x: 5, y: 8 };
      return s;
    };
    const { events } = castUntilHit(mk, { type: 'CAST', spell: 'mot_vampirique', target: { x: 5, y: 8 } });
    const dmg = events.find((e) => e.t === 'damage');
    const heal = events.find((e) => e.t === 'heal');
    // Chance 120 + 101 scrolled: normal 21..30 or critical 31 × 3.21.
    expect(dmg.amount).toBeGreaterThanOrEqual(67);
    expect(dmg.amount).toBeLessThanOrEqual(99);
    expect(heal.amount).toBe(Math.floor(dmg.amount / 2));
  });

  test('Mot Curatif: soin boosté par l\'intelligence', () => {
    const mk = (seed) => {
      const s = freshGame('ENIRIPSA', 'IOP', 'arene', seed);
      s.fighters.A.hp = 300;
      return s;
    };
    const { events } = castUntilHit(mk, { type: 'CAST', spell: 'mot_curatif', target: { x: 0, y: 0 } });
    const heal = events.find((e) => e.t === 'heal');
    // Intelligence 140 + 101 scrolled: normal 13..19 or critical 32 × 3.41.
    expect(heal.amount).toBeGreaterThanOrEqual(44);
    expect(heal.amount).toBeLessThanOrEqual(109);
  });

  test('échec critique: existe, coûte les PA, aucun effet', () => {
    let found = null;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const s = freshGame('IOP', 'IOP', 'arene', seed);
      s.fighters.A.pos = { x: 5, y: 6 };
      s.fighters.B.pos = { x: 5, y: 7 };
      const r = applyAction(s, { type: 'CAST', spell: 'pression', target: { x: 5, y: 7 } });
      if (r.events.some((e) => e.t === 'spell_fail')) found = r;
    }
    expect(found).toBeTruthy();
    expect(found.state.fighters.A.pa).toBe(4); // 7 PA de base, 3 PA dépensés quand même
    expect(found.events.find((e) => e.t === 'damage')).toBeUndefined();
  });
});

describe('tacle / fuite (1.29)', () => {
  test('quitter le contact déclenche un jet: fuite ou tacle', () => {
    let sawEscape = false;
    let sawTackle = false;
    for (let seed = 1; seed <= 30; seed++) {
      const s = freshGame('IOP', 'IOP', 'arene', seed);
      s.fighters.A.pa = 8; // Fixture explicite de l’exemple officiel de tacle à 8 PA.
      s.fighters.A.pos = { x: 5, y: 6 };
      s.fighters.B.pos = { x: 5, y: 7 };
      const { state: after, events } = applyAction(s, { type: 'MOVE', to: { x: 2, y: 6 } });
      if (events.some((e) => e.t === 'escape')) {
        sawEscape = true;
        expect(after.fighters.A.pos).toEqual({ x: 2, y: 6 });
      } else {
        sawTackle = true;
        const tackle = events.find((e) => e.t === 'tackle');
        expect(tackle.chance).toBe(50); // agilités égales
        expect(after.fighters.A.pos).toEqual({ x: 5, y: 6 }); // move annulé
        expect(after.fighters.A.pm).toBe(0);                  // tous les PM perdus
        expect(after.fighters.A.pa).toBe(8 - tackle.lostPa);
        expect(tackle.lostPa).toBe(2); // exemple officiel 1.27: floor(8 * 50/200)
      }
    }
    expect(sawEscape && sawTackle).toBe(true); // les deux issues existent
  });

  test('hors contact: aucun jet de fuite', () => {
    const state = freshGame();
    const { events } = applyAction(state, {
      type: 'MOVE',
      to: { x: state.fighters.A.pos.x + 2, y: state.fighters.A.pos.y },
    });
    expect(events.some((e) => e.t === 'escape' || e.t === 'tackle')).toBe(false);
    expect(events.find((e) => e.t === 'move').cost).toBe(2);
  });
});

describe('initiative', () => {
  test('le Cra (455) joue avant le Iop (415), sans jet', () => {
    const { state } = createGame({
      mapId: 'arene',
      seed: 3,
      fighters: [
        { id: 'A', name: 'Iop', classId: 'IOP' },
        { id: 'B', name: 'Cra', classId: 'CRA' },
      ],
    });
    expect(state.fighters.B.initiative).toBeGreaterThan(state.fighters.A.initiative);
    expect(state.order[0]).toBe('B');
  });
});

describe('bot layer', () => {
  test('all builtin bots compile', () => {
    for (const bot of BUILTIN_BOTS) {
      expect(typeof compileBot(bot.code)).toBe('function');
    }
  });

  test('a full match completes with real fighting', () => {
    const result = runMatch({
      bots: {
        A: { name: 'Brutus', decide: compileBot(getBuiltinBot('brutus').code) },
        B: { name: 'Plume', decide: compileBot(getBuiltinBot('plume').code) },
      },
      classes: { A: 'IOP', B: 'CRA' },
      mapId: 'arene',
      seed: 123,
    });
    expect(['A', 'B', null]).toContain(result.winner);
    expect(result.stats.A.damageDealt + result.stats.B.damageDealt).toBeGreaterThan(0);
    expect(result.events.find((e) => e.t === 'match_end')).toBeTruthy();
    for (const f of Object.values(result.finalState.fighters)) {
      expect(f.hp).toBeGreaterThanOrEqual(0);
      expect(f.pa).toBeGreaterThanOrEqual(0);
      expect(f.pm).toBeGreaterThanOrEqual(0);
      expect(f.maxHp).toBeLessThanOrEqual(f.baseMaxHp); // érosion seulement
    }
  });

  test('matches are deterministic: same seed, same fight', () => {
    const cfg = () => ({
      bots: {
        A: { name: 'Brutus', decide: compileBot(getBuiltinBot('brutus').code) },
        B: { name: 'Toubib', decide: compileBot(getBuiltinBot('toubib').code) },
      },
      classes: { A: 'IOP', B: 'ENIRIPSA' },
      mapId: 'canyon',
      seed: 999,
    });
    const r1 = runMatch(cfg());
    const r2 = runMatch(cfg());
    expect(r1.winner).toBe(r2.winner);
    expect(r1.turns).toBe(r2.turns);
    expect(JSON.stringify(r1.events)).toBe(JSON.stringify(r2.events));
  });

  test('a crashing bot forfeits its turns but the match still ends', () => {
    const crasher = () => { throw new Error('boom'); };
    const result = runMatch({
      bots: {
        A: { name: 'Crash', decide: crasher },
        B: { name: 'Brutus', decide: compileBot(getBuiltinBot('brutus').code) },
      },
      classes: { A: 'IOP', B: 'IOP' },
      mapId: 'arene',
      seed: 5,
    });
    expect(result.winner).toBe('B');
    expect(result.stats.A.errors).toBeGreaterThan(0);
  });

  test('bot view is a clone: mutating it does not corrupt the match', () => {
    const vandal = (view, api) => {
      view.enemy.hp = 1;
      view.you.pa = 99;
      return api.endTurn();
    };
    const result = runMatch({
      bots: {
        A: { name: 'Vandal', decide: vandal },
        B: { name: 'Pantin', decide: compileBot(getBuiltinBot('pantin').code) },
      },
      classes: { A: 'IOP', B: 'IOP' },
      mapId: 'arene',
      seed: 8,
    });
    expect(result.finalState.fighters.A.pa).toBeLessThanOrEqual(7);
  });
});

describe('real Dofus maps (OblivionRetro import)', () => {
  const { MAPS } = require('../engine/maps');
  const { shortestPath } = require('../engine/pathfinding');

  test('every map has free, mutually reachable spawns', () => {
    for (const map of Object.values(MAPS).filter(m => m.kind !== 'dungeon')) {
      const blocked = (x, y) => {
        const o = map.obstacles[`${x},${y}`];
        return !!(o && o.blocksMove);
      };
      const [a, b] = map.spawns;
      expect(blocked(a.x, a.y)).toBe(false);
      expect(blocked(b.x, b.y)).toBe(false);
      expect(shortestPath(a, b, map.width, map.height, blocked)).not.toBeNull();
    }
  });

  test('a full match completes on a real map', () => {
    const result = runMatch({
      bots: {
        A: { name: 'Brutus', decide: compileBot(getBuiltinBot('brutus').code) },
        B: { name: 'Plume', decide: compileBot(getBuiltinBot('plume').code) },
      },
      classes: { A: 'IOP', B: 'CRA' },
      mapId: 'territoire_des_dopeuls_5383',
      seed: 2024,
    });
    expect(result.events.find((e) => e.t === 'match_end')).toBeTruthy();
    expect(result.stats.A.damageDealt + result.stats.B.damageDealt).toBeGreaterThan(0);
  });
});

describe('12 classes, invocations et cerveau utilitaire', () => {
  const { CLASSES: ALL } = require('../engine/classes');

  test('les 12 classes ont leur roster 1.29 complet (sorts simulables)', () => {
    expect(Object.keys(ALL)).toHaveLength(12);
    for (const cls of Object.values(ALL)) {
      const keys = Object.keys(cls.spells);
      // roster complet: au moins 10 sorts par classe (le Sram, criblé de
      // pièges non simulés, est le plancher), tous avec >= 1 effet réel
      expect(keys.length).toBeGreaterThanOrEqual(10);
      for (const s of Object.values(cls.spells)) {
        expect(s.effects.length).toBeGreaterThan(0);
        expect(typeof s.pa).toBe('number');
      }
      // pas de collision de clés après dérivation
      expect(new Set(keys).size).toBe(keys.length);
    }
    // total: 202 sorts extraits des plages de classes 1.29
    const total = Object.values(ALL).reduce((s, c) => s + Object.keys(c.spells).length, 0);
    expect(total).toBeGreaterThanOrEqual(200);
  });

  test('les nouveaux effets du roster complet fonctionnent (vitalité, PO, poison, échange)', () => {
    // Vitalité (Iop): +PV max et courants, rendus à expiration
    const vit = ALL.IOP.spells.vitalite;
    expect(vit.effects[0].kind).toBe('buffVitality');
    // Tir Éloigné (Cra): +portée, et Flèche Magique est ajustable
    expect(ALL.CRA.spells.tir_eloigne.effects[0].kind).toBe('buffRange');
    expect(ALL.CRA.spells.fleche_magique.adjustableRange).toBe(true);
    // Transposition (Sacrieur): échange de positions
    expect(ALL.SACRIEUR.spells.transposition.effects[0].kind).toBe('swap');
    // Tremblement (Sadida): poison terre sur 4 tours
    const trem = ALL.SADIDA.spells.tremblement.effects[0];
    expect(trem.kind).toBe('poison');
    expect(trem.duration).toBe(4);
    // Vulnérabilité (Pandawa): malus de résistance élémentaire
    expect(ALL.PANDAWA.spells.vulnerabilite_incandescente.effects[0].kind).toBe('resistDebuff');
    // Mot de Jouvence (Eniripsa): désenvoûtement
    expect(ALL.ENIRIPSA.spells.mot_de_jouvence.effects[0].kind).toBe('dispel');
    // Enutrof: les pelles/sacs animés sont des invocations connues du moteur
    const { SUMMONS } = require('../engine/engine');
    const sac = ALL.ENUTROF.spells.sac_anime.effects.find((e) => e.kind === 'summon');
    expect(SUMMONS[sac.p1]).toBeTruthy();
  });

  test('Châtiment Agile: chaque coup reçu rend dégâts/2 en agilité (cap par tour)', () => {
    const mk = (seed) => {
      const s = freshGame('SACRIEUR', 'IOP', 'arene', seed);
      s.fighters.A.pos = { x: 5, y: 6 };
      s.fighters.B.pos = { x: 5, y: 7 };
      return s;
    };
    const { state: buffed } = castUntilHit(mk, { type: 'CAST', spell: 'chatiment_agile', target: { x: 5, y: 6 } });
    const punishment = buffed.fighters.A.effects.find((e) => e.kind === 'punishment');
    expect(punishment).toBeTruthy();
    expect([140, 150]).toContain(punishment.maxPerTurn); // 140, ou 150 en critique

    // le Iop frappe le Sacrieur → gain d'agilité = floor(dégâts / 2)
    buffed.currentIndex = 1; // au tour du Iop
    const agiBefore = buffed.fighters.A.stats.agilite;
    const hit = castUntilHit(
      () => JSON.parse(JSON.stringify(buffed)),
      { type: 'CAST', spell: 'pression', target: { x: 5, y: 6 } },
    );
    const dmg = hit.events.find((e) => e.t === 'damage');
    const gained = hit.state.fighters.A.effects
      .filter((e) => e.kind === 'buff' && e.stat === 'agilite')
      .reduce((s, e) => s + e.value, 0);
    expect(gained).toBe(Math.min(140, Math.floor(dmg.amount / 2)));
    expect(agiBefore).toBe(hit.state.fighters.A.stats.agilite); // base intacte, c'est un buff
  });

  test('Punition: nulle à pleine vie, ~30% des PV max à mi-vie (cloche GDCore)', () => {
    const mk = (hpRatio) => (seed) => {
      const s = freshGame('SACRIEUR', 'IOP', 'arene', seed);
      s.fighters.A.pos = { x: 5, y: 6 };
      s.fighters.B.pos = { x: 5, y: 7 };
      s.fighters.A.hp = Math.floor(s.fighters.A.maxHp * hpRatio);
      return s;
    };
    // à pleine vie: la cloche vaut 0
    const full = castUntilHit(mk(1), { type: 'CAST', spell: 'punition', target: { x: 5, y: 7 } });
    const dmgFull = full.events.find((e) => e.t === 'damage');
    expect(dmgFull.amount).toBe(0);
    // à mi-vie: pic de la cloche = 30% des PV max du Sacrieur (résists nulles)
    const half = castUntilHit(mk(0.5), { type: 'CAST', spell: 'punition', target: { x: 5, y: 7 } });
    const dmgHalf = half.events.find((e) => e.t === 'damage');
    const maxHp = half.state.fighters.A.maxHp;
    expect(dmgHalf.amount).toBeGreaterThanOrEqual(Math.floor(maxHp * 0.28));
    expect(dmgHalf.amount).toBeLessThanOrEqual(Math.ceil(maxHp * 0.36)); // 30% (35% en critique)
  });

  test('un Osamodas invoque un Bouftou autonome qui se bat', () => {
    const cortex = compileBot(getBuiltinBot('cortex').code);
    const result = runMatch({
      bots: {
        A: { name: 'Cortex', decide: cortex },
        B: { name: 'Brutus', decide: compileBot(getBuiltinBot('brutus').code) },
      },
      classes: { A: 'OSAMODAS', B: 'IOP' },
      mapId: 'arene',
      seed: 42,
    });
    const summonEvent = result.events.find((e) => e.t === 'summon_add');
    expect(summonEvent).toBeTruthy();
    // L'invocation a agi toute seule (déplacement ou attaque à son tour)
    const summonActed = result.events.some(
      (e) => (e.t === 'move' || e.t === 'cast') && e.fighter === summonEvent.id,
    );
    expect(summonActed).toBe(true);
    expect(result.events.find((e) => e.t === 'match_end')).toBeTruthy();
  });

  test('chaque classe survit à un match complet piloté par le cerveau', () => {
    const cortex = compileBot(getBuiltinBot('cortex').code);
    for (const classId of Object.keys(ALL)) {
      const result = runMatch({
        bots: {
          A: { name: 'Cortex', decide: cortex },
          B: { name: 'Pantin', decide: compileBot(getBuiltinBot('pantin').code) },
        },
        classes: { A: classId, B: 'IOP' },
        mapId: 'arene',
        seed: 7,
        collectFrames: false,
      });
      expect(result.events.find((e) => e.t === 'match_end')).toBeTruthy();
    }
  });
});

describe('tournament', () => {
  test('round robin plays every pair twice and ranks by points', () => {
    const entries = ['brutus', 'plume', 'toubib'].map((id) => {
      const b = getBuiltinBot(id);
      return {
        id, name: b.name, decide: compileBot(b.code),
        classId: b.recommendedClass || 'IOP',
      };
    });
    const { standings, matches } = runTournament(entries, { seedBase: 1 });
    expect(matches).toHaveLength(6);
    for (const row of standings) {
      expect(row.played).toBe(4);
      expect(row.wins + row.draws + row.losses).toBe(4);
    }
    const totalPoints = standings.reduce((s, r) => s + r.points, 0);
    expect(totalPoints).toBeGreaterThanOrEqual(12);
    expect(totalPoints).toBeLessThanOrEqual(18);
  });
});

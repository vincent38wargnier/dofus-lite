// Built-in bots. Their source is kept as plain code strings and compiled by
// the same pipeline as user bots: they are both opponents and living examples
// readable from the editor. Each one plays its FULL kit: pushes into walls,
// line-ups, drains, line-of-sight games…

export const BUILTIN_BOTS = [
  {
    id: 'brutus',
    name: 'Brutus',
    emoji: '🥊',
    recommendedClass: 'IOP',
    description: 'Rusher: colle, claque Colère, écrase contre les murs.',
    code: `// Brutus — rusher de mêlée qui joue TOUT son kit:
// Bond pour coller, Puissance avant le burst, Colère en finisher,
// Épée du Destin quand l'ennemi est aligné, Intimidation quand un mur
// est dans le dos de la cible (dégâts de poussée gratuits).

function decide(view, api) {
  var me = view.you;
  var enemy = view.enemy;
  var d = api.dist(me.pos, enemy.pos);

  // Estimation grossière du burst disponible ce tour
  var canColere = api.canCast('colere', enemy.pos).ok;

  // 0. Provocation de finisher
  if (enemy.hp <= 220 && canColere && api.random() < 0.5) {
    return api.say('COLÈRE DE IOP !!');
  }

  if (d === 1) {
    // 1. Finisher d'abord: Colère (47-66 x3.6, critique 1/50)
    if (canColere) return api.cast('colere', enemy.pos);

    // 2. Mur dans le dos ? Intimidation = pousse 3 cases, collision brute.
    var push = api.simulatePush(me.pos, enemy.pos, 3);
    if (push.blocked >= 2 && api.canCast('intimidation', enemy.pos).ok) {
      return api.cast('intimidation', enemy.pos);
    }

    // 3. Se buffer au contact avant de cogner (tour plein: 8 PA)
    if (me.pa >= 8 && api.canCast('puissance', me.pos).ok) {
      return api.cast('puissance', me.pos);
    }

    // 4. Épée du Destin traverse en ligne (8-15 feu + zone), sinon Pression
    if (api.canCast('epee_destin', enemy.pos).ok && me.pa >= 5) {
      return api.cast('epee_destin', enemy.pos);
    }
    if (api.canCast('pression', enemy.pos).ok) {
      return api.cast('pression', enemy.pos);
    }
    return api.endTurn();
  }

  // 5. Trop loin: marcher d'abord (garder les PA pour Bond + un coup)
  var afterMove = api.reachable().reduce(function (best, c) {
    var dd = api.dist(c.pos, enemy.pos);
    return dd < best ? dd : best;
  }, d);
  if (me.pm > 0 && afterMove < d) {
    var step = api.moveToward(enemy.pos);
    if (step) return step;
  }

  // 6. Toujours pas au contact: Bond sur la case la plus proche de l'ennemi
  var cells = api.castTargets('bond');
  var best = null;
  for (var i = 0; i < cells.length; i++) {
    var dd = api.dist(cells[i], enemy.pos);
    if (dd < api.dist(me.pos, enemy.pos) && (!best || dd < best.d)) {
      best = { cell: cells[i], d: dd };
    }
  }
  if (best) return api.cast('bond', best.cell);

  // 7. Coup d'opportunité à distance (Épée du Destin porte à 2 en ligne)
  var spells = me.spells.filter(function (s) {
    return s.effects.some(function (e) { return e.kind === 'damage'; });
  }).sort(function (a, b) {
    var da = a.effects.find(function (e) { return e.kind === 'damage'; });
    var db = b.effects.find(function (e) { return e.kind === 'damage'; });
    return db.max - da.max;
  });
  for (var j = 0; j < spells.length; j++) {
    if (api.canCast(spells[j].key, enemy.pos).ok) {
      return api.cast(spells[j].key, enemy.pos);
    }
  }

  if (api.random() < 0.12) return api.say('Viens te battre !');
  return api.endTurn();
}`,
  },

  {
    id: 'plume',
    name: 'Plume',
    emoji: '🪶',
    recommendedClass: 'CRA',
    description: 'Kiteuse: crible, ralentit, claque contre les rochers, casse la vue.',
    code: `// Plume — hit and run complet:
// Punitive dans sa bande 6-8, Recul quand un obstacle est derrière la
// cible, Enflammée alignée, Ralentissante/Immobilisation en pression,
// repli en cassant la ligne de vue quand c'est possible.

function hasDebuff(enemy, stat) {
  return enemy.effects.some(function (e) { return e.stat === stat && e.value < 0; });
}

function decide(view, api) {
  var me = view.you;
  var enemy = view.enemy;
  var d = api.dist(me.pos, enemy.pos);

  // 1. Au contact: Recul AVANT tout (pousse 3, collision si mur derrière)
  if (d === 1 && api.canCast('fleche_recul', enemy.pos).ok) {
    return api.cast('fleche_recul', enemy.pos);
  }

  // 2. Recul opportuniste: obstacle dans le dos de la cible = dégâts bruts
  if (api.canCast('fleche_recul', enemy.pos).ok) {
    var push = api.simulatePush(me.pos, enemy.pos, 3);
    if (push.blocked >= 2) return api.cast('fleche_recul', enemy.pos);
  }

  // 3. Punitive dans sa bande de portée (6-8): le plus gros tir
  if (api.canCast('fleche_punitive', enemy.pos).ok) {
    return api.cast('fleche_punitive', enemy.pos);
  }

  // 4. Pression de retraits: -PA (zone!) puis -PM
  if (!hasDebuff(enemy, 'pa') && api.canCast('fleche_ralentissante', enemy.pos).ok) {
    return api.cast('fleche_ralentissante', enemy.pos);
  }
  if (!hasDebuff(enemy, 'pm') && api.canCast('fleche_immobilisation', enemy.pos).ok) {
    return api.cast('fleche_immobilisation', enemy.pos);
  }

  // 5. Enflammée si alignés (ligne de feu), sinon Magique
  if (api.aligned(me.pos, enemy.pos) && api.canCast('fleche_enflammee', enemy.pos).ok) {
    return api.cast('fleche_enflammee', enemy.pos);
  }
  if (api.canCast('fleche_magique', enemy.pos).ok) {
    return api.cast('fleche_magique', enemy.pos);
  }

  // 6. Repli. Menace ennemie = PM + saut + allonge de contact.
  var tpRange = 0;
  var reach = 0;
  enemy.spells.forEach(function (s) {
    if (s.effects.some(function (e) { return e.kind === 'teleport'; })) {
      tpRange = Math.max(tpRange, s.range[1]);
    }
    if (s.effects.some(function (e) { return e.kind === 'damage' || e.kind === 'lifeSteal'; })) {
      reach = Math.max(reach, Math.min(4, s.range[1]));
    }
  });
  var path = api.pathTo(enemy.pos);
  var pathDist = path ? path.length - 1 : 99;
  if (pathDist <= enemy.basePm + Math.max(tpRange, reach) + 1 && me.pm > 0) {
    // Préférer une case qui CASSE la ligne de vue (il devra contourner)
    var safe = api.reachable().filter(function (c) {
      return !api.hasLos(c.pos, enemy.pos) && api.dist(c.pos, enemy.pos) >= 2;
    });
    if (safe.length > 0) {
      safe.sort(function (a, b) { return api.dist(b.pos, enemy.pos) - api.dist(a.pos, enemy.pos); });
      return api.move(safe[0].pos);
    }
    var flee = api.moveAway(enemy.pos);
    if (flee) return flee;
  }

  // 7. Trop loin pour tout ? Se rapprocher un peu.
  if (d > 10 && me.pm > 0) {
    var approach = api.moveToward(enemy.pos);
    if (approach) return approach;
  }

  if (api.random() < 0.1) return api.say('Trop lent…');
  return api.endTurn();
}`,
  },

  {
    id: 'toubib',
    name: 'Toubib',
    emoji: '🩹',
    recommendedClass: 'ENIRIPSA',
    description: "Usure: draine les PA, martèle Frayeur contre les murs, vampirise.",
    code: `// Toubib — guerre d'usure complète:
// draine les PA à distance, triple Mot de Frayeur contre un mur
// (3 collisions brutes !), vampirise pour l'échange, Stimulant en tempo.
// L'érosion ronge les PV max: il faut punir, pas seulement soigner.

function decide(view, api) {
  var me = view.you;
  var enemy = view.enemy;
  var d = api.dist(me.pos, enemy.pos);

  // 1. Urgence: sous 50%, soigner avant toute chose
  if (me.hp < me.maxHp * 0.5 && api.canCast('mot_curatif', me.pos).ok) {
    return api.cast('mot_curatif', me.pos);
  }

  // 2. Ennemi au contact + mur derrière lui: marteler Frayeur (3x/tour, 2 PA)
  if (api.canCast('mot_frayeur', enemy.pos).ok) {
    var push = api.simulatePush(me.pos, enemy.pos, 1);
    if (push.blocked >= 1) return api.cast('mot_frayeur', enemy.pos);
    if (d === 1) return api.cast('mot_frayeur', enemy.pos); // au moins l'éloigner
  }

  // 3. Drainer les PA à distance (1-3 PA, portée 10) — anti-burst
  if (api.canCast('mot_drainant', enemy.pos).ok) {
    return api.cast('mot_drainant', enemy.pos);
  }

  // 4. Vampiriser: dégâts + soin, le cœur de l'usure
  if (api.canCast('mot_vampirique', enemy.pos).ok) {
    return api.cast('mot_vampirique', enemy.pos);
  }

  // 5. Se soigner si entamé
  if (me.hp < me.maxHp * 0.8 && api.canCast('mot_curatif', me.pos).ok) {
    return api.cast('mot_curatif', me.pos);
  }

  // 5. Stimulant quand on est tranquille (+PA sur 3 tours)
  if (me.hp >= me.maxHp * 0.7 && api.canCast('mot_stimulant', me.pos).ok) {
    return api.cast('mot_stimulant', me.pos);
  }

  // 6. Blessant en remplissage
  if (api.canCast('mot_blessant', enemy.pos).ok) {
    return api.cast('mot_blessant', enemy.pos);
  }

  // 7. Danse de distance: rester à 3-4 (portée de Vampirique, hors mêlée)
  if (d < 3) {
    var flee = api.moveAway(enemy.pos);
    if (flee) return flee;
  } else if (d > 4) {
    var approach = api.moveToward(enemy.pos);
    if (approach) return approach;
  }

  if (me.hp < me.maxHp * 0.3 && api.random() < 0.2) return api.say('Tout va bien. Tout va très bien.');
  return api.endTurn();
}`,
  },

  {
    id: 'maison',
    name: 'IA Maison',
    emoji: '🏛️',
    recommendedClass: null,
    description: 'Le champion du Koliséum : cerveau utilitaire + poids réglés par matchup sur des milliers de combats. La référence à battre.',
    code: `// IA Maison — la référence du Koliséum.
// Même cerveau que api.suggest(), mais avec des poids réglés PAR MATCHUP
// (votre classe vs la classe adverse) sur des milliers de combats simulés.
//
// Inspectez ses poids pour ce matchup: api.maisonWeights()
// Et personnalisez à partir de là:
//   return api.suggest(Object.assign(api.maisonWeights(), { kill: 5 }));

function decide(view, api) {
  return api.maison();
}`,
  },

  {
    id: 'cortex',
    name: 'Cortex',
    emoji: '🧠',
    recommendedClass: 'OSAMODAS',
    description: 'IA utilitaire : pèse chaque action possible et joue la meilleure. Poids affinés par auto-combat.',
    code: `// Cortex — l'IA à poids du Koliséum.
// api.suggest() évalue TOUTES les actions possibles (sorts x cibles,
// déplacements, fin de tour) avec un score pondéré, façon serveurs 1.29
// (influence par effet / coût en PA) et joue la meilleure.
//
// Personnalisez-le en passant vos propres poids:
//   return api.suggest({ kill: 5, threat: 1.4, heal: 0.2 });

function decide(view, api) {
  return api.suggest();
}`,
  },
  {
    id: 'pantin',
    name: 'Pantin',
    emoji: '🎲',
    recommendedClass: null,
    description: 'Joue au hasard parmi les actions légales. Sparring de base.',
    code: `// Pantin — actions légales au hasard. Si votre bot perd contre lui,
// il y a du travail.

function decide(view, api) {
  var options = [];

  // Tous les lancers de sorts possibles
  for (var i = 0; i < view.you.spells.length; i++) {
    var s = view.you.spells[i];
    var targets = api.castTargets(s.key);
    for (var j = 0; j < targets.length; j++) {
      options.push(api.cast(s.key, targets[j]));
    }
  }

  // Quelques déplacements
  var cells = api.reachable();
  for (var k = 0; k < cells.length; k++) {
    if (api.random() < 0.3) options.push(api.move(cells[k].pos));
  }

  if (options.length === 0 || api.random() < 0.15) return api.endTurn();
  return api.pick(options);
}`,
  },
];

export function getBuiltinBot(id) {
  return BUILTIN_BOTS.find((b) => b.id === id) || null;
}

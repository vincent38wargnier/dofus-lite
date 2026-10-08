import React, { useState } from 'react';
import { createGame, getView, currentFighter } from '../engine/engine';
import { createRng } from '../engine/rng';
import { compileBot, checkBot } from '../bots/compile';
import { makeBotApi } from '../bots/api';
import { runMatch } from '../arena/runner';
import { BUILTIN_BOTS, getBuiltinBot } from '../bots/builtins';
import { findBot } from './botsStore';

const TEMPLATE = `// Mon bot — décrivez votre stratégie !
// decide(view, api) est appelée en boucle pendant votre tour :
// retournez UNE action à chaque appel, api.endTurn() pour terminer.
// Onglet "Règles & API" pour la référence complète.

function decide(view, api) {
  var me = view.you;
  var enemy = view.enemy;

  // 1. Attaquer avec le sort le plus cher castable
  var attacks = me.spells
    .filter(function (s) {
      return s.effects.some(function (e) { return e.kind === 'damage'; });
    })
    .sort(function (a, b) { return b.pa - a.pa; });

  for (var i = 0; i < attacks.length; i++) {
    if (api.canCast(attacks[i].key, enemy.pos).ok) {
      return api.cast(attacks[i].key, enemy.pos);
    }
  }

  // 2. Sinon, avancer vers l'ennemi
  var step = api.moveToward(enemy.pos);
  if (step) return step;

  // 3. Plus rien à faire
  return api.endTurn();
}`;

// Une view/api d'exemple pour attraper les crashs évidents avant un match.
function sampleContext(classId) {
  const { state } = createGame({
    mapId: 'arene',
    seed: 1,
    fighters: [
      { id: 'A', name: 'Vous', classId },
      { id: 'B', name: 'Adversaire', classId: 'IOP' },
    ],
  });
  const me = currentFighter(state).id;
  const view = getView(state, me);
  return { view, api: makeBotApi(view, createRng(1)) };
}

export default function EditorScreen({ customBots, addBot, updateBot, deleteBot, allBots }) {
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState('Mon bot');
  const [code, setCode] = useState(TEMPLATE);
  const [classId, setClassId] = useState('IOP');
  const [feedback, setFeedback] = useState(null);
  const [opponentId, setOpponentId] = useState('brutus');

  const selected = selectedId ? findBot(allBots, selectedId) : null;
  const readOnly = !!(selected && !selected.custom);

  const select = (bot) => {
    setSelectedId(bot.id);
    setName(bot.name);
    setCode(bot.code);
    setClassId(bot.recommendedClass || bot.classId || 'IOP');
    setFeedback(null);
  };

  const startNew = () => {
    setSelectedId(null);
    setName('Mon bot');
    setCode(TEMPLATE);
    setFeedback(null);
  };

  const duplicate = () => {
    const id = addBot({ name: `${name} (copie)`, code, classId, emoji: '🛠️' });
    setSelectedId(id);
    setName(`${name} (copie)`);
    setFeedback({ ok: true, text: 'Copié ! Vous éditez maintenant votre version.' });
  };

  const save = () => {
    const check = verify(false);
    if (!check) return;
    if (selected && selected.custom) {
      updateBot(selected.id, { name, code, classId });
      setFeedback({ ok: true, text: 'Sauvegardé.' });
    } else {
      const id = addBot({ name, code, classId, emoji: '🤖' });
      setSelectedId(id);
      setFeedback({ ok: true, text: 'Bot créé ! Il est disponible dans l\'Arène et le Tournoi.' });
    }
  };

  const verify = (announce = true) => {
    const { view, api } = sampleContext(classId);
    const r = checkBot(code, view, api);
    if (!r.ok) {
      setFeedback({ ok: false, text: r.error });
      return false;
    }
    if (announce) setFeedback({ ok: true, text: 'Le code compile et retourne une action. Prêt à combattre !' });
    return true;
  };

  const quickTest = () => {
    if (!verify(false)) return;
    const opponent = getBuiltinBot(opponentId) || BUILTIN_BOTS[0];
    let decideMine;
    let decideOpp;
    try {
      decideMine = compileBot(code);
      decideOpp = compileBot(opponent.code);
    } catch (e) {
      setFeedback({ ok: false, text: e.message });
      return;
    }
    let w = 0; let l = 0; let d = 0; let dmg = 0;
    const games = 6;
    for (let i = 0; i < games; i++) {
      const mine = i % 2 === 0 ? 'A' : 'B';
      const r = runMatch({
        bots: {
          A: { name: mine === 'A' ? name : opponent.name, decide: mine === 'A' ? decideMine : decideOpp },
          B: { name: mine === 'B' ? name : opponent.name, decide: mine === 'B' ? decideMine : decideOpp },
        },
        classes: {
          A: mine === 'A' ? classId : (opponent.recommendedClass || 'IOP'),
          B: mine === 'B' ? classId : (opponent.recommendedClass || 'IOP'),
        },
        mapId: ['arene', 'muraille', 'canyon'][i % 3],
        seed: 1000 + i,
        collectFrames: false,
      });
      if (r.winner === mine) w++;
      else if (r.winner === null) d++;
      else l++;
      dmg += r.stats[mine].damageDealt;
    }
    setFeedback({
      ok: w >= l,
      text: `Sur ${games} matchs vs ${opponent.name} : ${w} victoire${w > 1 ? 's' : ''}, ${l} défaite${l > 1 ? 's' : ''}, ${d} nul${d > 1 ? 's' : ''} · ${Math.round(dmg / games)} dégâts/match en moyenne.`,
    });
  };

  return (
    <div className="editor-layout">
      <div className="panel">
        <h3>Mes bots</h3>
        <div className="bot-list">
          <button className="btn" onClick={startNew}>＋ Nouveau bot</button>
          {customBots.map((b) => (
            <div
              key={b.id}
              className={`bot-item${selectedId === b.id ? ' selected' : ''}`}
              onClick={() => select(b)}
            >
              <span>{b.emoji}</span> {b.name}
              <span className="tag">perso</span>
            </div>
          ))}
        </div>
        <h3 style={{ marginTop: 16 }}>Exemples (lecture)</h3>
        <div className="bot-list">
          {BUILTIN_BOTS.map((b) => (
            <div
              key={b.id}
              className={`bot-item${selectedId === b.id ? ' selected' : ''}`}
              onClick={() => select(b)}
            >
              <span>{b.emoji}</span> {b.name}
              <span className="tag">intégré</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <label className="field">
            Nom du bot
            <input type="text" value={name} disabled={readOnly} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            Classe préférée
            <select value={classId} onChange={(e) => setClassId(e.target.value)}>
              <option value="IOP">⚔️ Iop</option>
              <option value="CRA">🏹 Cra</option>
              <option value="ENIRIPSA">🧚 Eniripsa</option>
            </select>
          </label>
          {readOnly
            ? <button className="btn primary" onClick={duplicate}>📋 Dupliquer pour éditer</button>
            : <button className="btn primary" onClick={save}>💾 Sauvegarder</button>}
          {selected && selected.custom
            ? <button className="btn danger" onClick={() => { deleteBot(selected.id); startNew(); }}>🗑 Supprimer</button>
            : null}
        </div>
        {readOnly ? <div className="hint">Bot intégré, en lecture seule — dupliquez-le pour en faire votre version.</div> : null}
        <textarea
          className="code-editor"
          value={code}
          readOnly={readOnly}
          spellCheck={false}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="panel">
          <h3>Vérifier & tester</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button className="btn" onClick={() => verify(true)}>✓ Vérifier le code</button>
            <label className="field">
              Sparring contre
              <select value={opponentId} onChange={(e) => setOpponentId(e.target.value)}>
                {BUILTIN_BOTS.map((b) => <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>)}
              </select>
            </label>
            <button className="btn primary" onClick={quickTest}>🥊 Test rapide (6 matchs)</button>
            {feedback ? (
              <div className={`test-result ${feedback.ok ? 'ok' : 'ko'}`}>{feedback.text}</div>
            ) : null}
          </div>
        </div>
        <div className="hint">
          Votre bot reçoit <code>view</code> (l'état du combat) et <code>api</code> (déplacements,
          sorts, ligne de vue, tacle…). Tout est documenté dans l'onglet <b>Règles & API</b>.
          Les matchs sont rejouables : même seed, même combat.
        </div>
      </div>
    </div>
  );
}

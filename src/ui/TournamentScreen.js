import React, { useState } from 'react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { MAPS } from '../engine/maps';
import { compileBot } from '../bots/compile';
import { runTournament } from '../arena/tournament';

export default function TournamentScreen({ allBots, onReplay }) {
  const [config, setConfig] = useState(() => {
    const init = {};
    for (const b of allBots) {
      init[b.id] = { included: !b.custom, classId: b.recommendedClass || b.classId || 'IOP' };
    }
    return init;
  });
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const entryFor = (b) => config[b.id] || { included: false, classId: b.recommendedClass || 'IOP' };
  const setEntry = (id, patch) => setConfig((c) => ({ ...c, [id]: { ...entryFor({ id }), ...c[id], ...patch } }));

  const launch = () => {
    setError(null);
    const entries = [];
    for (const b of allBots) {
      const e = entryFor(b);
      if (!e.included) continue;
      try {
        entries.push({ id: b.id, name: b.name, decide: compileBot(b.code), classId: e.classId });
      } catch (err) {
        setError(`${b.name} ne compile pas : ${err.message}`);
        return;
      }
    }
    if (entries.length < 2) { setError('Sélectionnez au moins 2 bots.'); return; }
    setRunning(true);
    // Laisse le temps au bouton de se re-rendre avant le calcul synchrone.
    setTimeout(() => {
      const seedBase = Math.floor(Math.random() * 1e9);
      setResults({ ...runTournament(entries, { seedBase }), entries });
      setRunning(false);
    }, 30);
  };

  const replayMatch = (m) => {
    onReplay({
      botA: m.homeId, botB: m.awayId,
      classA: m.homeClass, classB: m.awayClass,
      mapId: m.mapId, seed: m.seed,
    });
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
      <div className="panel">
        <h3>Participants</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {allBots.map((b) => {
            const e = entryFor(b);
            return (
              <div key={b.id} className="bot-item" style={{ cursor: 'default' }}>
                <input
                  type="checkbox"
                  checked={e.included}
                  onChange={(ev) => setEntry(b.id, { included: ev.target.checked })}
                />
                <span>{b.emoji}</span>
                <span>{b.name}</span>
                <select
                  style={{ marginLeft: 'auto', padding: '4px 6px', fontSize: 12 }}
                  value={e.classId}
                  onChange={(ev) => setEntry(b.id, { classId: ev.target.value })}
                >
                  {CLASS_IDS.map((id) => (
                    <option key={id} value={id}>{CLASSES[id].emoji} {CLASSES[id].name}</option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button className="btn primary" disabled={running} onClick={launch}>
            {running ? '⚔️ Combats en cours…' : '🏆 Lancer le tournoi'}
          </button>
          <span className="muted small">
            Round-robin : chaque paire s'affronte 2 fois (cartes et côtés alternés).
            Victoire 3 pts, nul 1 pt.
          </span>
          {error ? <div className="test-result ko">{error}</div> : null}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="panel">
          <h3>Classement</h3>
          {!results ? (
            <p className="muted small">Le podium du Koliséum attend ses champions…</p>
          ) : (
            <table className="standings">
              <thead>
                <tr>
                  <th>#</th><th>Bot</th><th>Classe</th>
                  <th className="num">J</th><th className="num">V</th>
                  <th className="num">N</th><th className="num">D</th>
                  <th className="num">Pts</th><th className="num">±PV</th>
                </tr>
              </thead>
              <tbody>
                {results.standings.map((row, i) => (
                  <tr key={row.id} className={i === 0 ? 'first' : ''}>
                    <td>{i === 0 ? '👑' : i + 1}</td>
                    <td>{row.name}</td>
                    <td>{CLASSES[row.classId].emoji} {CLASSES[row.classId].name}</td>
                    <td className="num">{row.played}</td>
                    <td className="num">{row.wins}</td>
                    <td className="num">{row.draws}</td>
                    <td className="num">{row.losses}</td>
                    <td className="num"><b>{row.points}</b></td>
                    <td className="num">{(row.hpDiff * 100).toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {results ? (
          <div className="panel">
            <h3>Matchs ({results.matches.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {results.matches.map((m, i) => (
                <div key={i} className="match-row">
                  <span className={m.winner === m.home ? 'win' : ''}>{m.home}</span>
                  <span className="vs">vs</span>
                  <span className={m.winner === m.away ? 'win' : ''}>{m.away}</span>
                  <span className="muted small" style={{ marginLeft: 'auto' }}>
                    {m.winner ? `🏆 ${m.winner}` : '🤝 nul'} · {m.reason === 'ko' ? 'K.O.' : 'limite'} ·
                    {' '}{m.turns} tours · {MAPS[m.mapId].name}
                  </span>
                  <button className="btn icon" title="Revoir ce match" onClick={() => replayMatch(m)}>▶</button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

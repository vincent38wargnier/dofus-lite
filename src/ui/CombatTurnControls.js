import React from 'react';
import { Check, Footprints, Heart, MapPin, SkipForward, Zap } from 'lucide-react';
import { TURN_SECONDS } from '../game/liveMatch';

export default function CombatTurnControls({ player, resources = player, turn, placing, over, humanTurn, timeLeft, onReady, onEndTurn, onRematch, onPlayerFocus, readyDisabled = false, readyLabel = 'Prêt', rematchLabel = 'Revanche' }) {
  const remaining = Math.max(0, Math.ceil(timeLeft));
  return <div className={`play-controls combat-turn-controls${humanTurn ? ' your-turn' : ''}`} data-controlled-fighter={player.id} aria-label="Vos commandes de combat" onFocus={onPlayerFocus}>
    <div className="player-resources" data-points-mode={resources.preview ? 'next-turn' : 'current'}
      aria-label={resources.preview ? 'Vos PA et PM prévus au prochain tour' : 'Vos points actuels'}>
      <span className="hp" title={`Vos PV : ${player.hp} / ${player.maxHp}`}><Heart size={13} aria-hidden="true" /><strong>{player.hp}</strong><small>PV</small></span>
      <span className="pa" title={resources.preview ? 'PA au prochain tour · bonus et retraits actifs inclus' : 'Vos points d’action restants'}><Zap size={12} aria-hidden="true" /><strong>{resources.pa}</strong><small>PA</small></span>
      <span className="pm" title={resources.preview ? 'PM au prochain tour · bonus et retraits actifs inclus' : 'Vos points de mouvement restants'}><Footprints size={12} aria-hidden="true" /><strong>{resources.pm}</strong><small>PM</small></span>
    </div>
    <div className={`turn-dial${humanTurn && remaining < 8 ? ' urgent' : ''}`}
      style={{ '--turn-progress': `${humanTurn ? Math.max(0, Math.min(100, timeLeft / TURN_SECONDS * 100)) : 0}%` }}
      role="timer" aria-live="off" aria-label={placing ? 'Placement' : over ? 'Combat terminé' : humanTurn ? `Tour ${turn}, ${remaining} secondes restantes` : `Tour ${turn}, tour adverse`}>
      <div>{placing ? <MapPin size={23} aria-hidden="true" /> : <><small>TOUR</small><strong>{turn}</strong></>}
        <span>{placing ? 'Placement' : over ? 'Terminé' : humanTurn ? `${remaining} s` : 'En cours'}</span>
      </div>
    </div>
    {placing ? <button type="button" className="btn primary placement-ready" disabled={readyDisabled} onClick={onReady}><Check size={14} aria-hidden="true" />{readyLabel}</button>
      : over ? <button type="button" className="btn primary" onClick={onRematch}>{rematchLabel}</button>
        : <button type="button" className="btn primary end-turn" disabled={!humanTurn} onClick={onEndTurn}><SkipForward size={14} aria-hidden="true" />Fin de tour</button>}
  </div>;
}

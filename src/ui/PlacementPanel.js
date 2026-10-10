import React from 'react';
import { Check, MapPin } from 'lucide-react';
import '../styles/placement.css';

export function placementDescription(map) {
  if (map.placement.status === 'historical') return 'Placement historique · à confirmer sur Retro actuel';
  if (map.placement.status === 'custom') return 'Départs fixes de cette arène';
  return 'Départs locaux fixes · placement original indisponible';
}

export default function PlacementPanel({ state, onReady }) {
  const cells = state.placement.cells.A;
  const historical = state.placement.source.status === 'historical';
  return <section className="placement-controls" aria-label="Placement avant le combat">
    <div className="placement-instruction">
      <MapPin size={21} aria-hidden="true" />
      <div><strong>{cells.length > 1 ? 'Choisissez votre case de départ' : 'Votre position de départ est fixée'}</strong>
        <p>{cells.length > 1 ? 'Cliquez sur une case bleue, puis validez.' : 'Validez pour commencer le combat.'}</p>
      </div>
      <button type="button" className="btn primary placement-ready" onClick={onReady}><Check size={18} aria-hidden="true" />Prêt</button>
    </div>
    <div className="placement-legend">
      <span><i className="your-start" aria-hidden="true" />Vous · {cells.length} case{cells.length > 1 ? 's' : ''}</span>
      <span><i className="enemy-start" aria-hidden="true" />Adversaire prêt</span>
      <span>Le chrono démarre avec le combat.</span>
    </div>
    <p className="placement-source">{historical
      ? 'Départs issus des archives 1.29 ; leur correspondance avec Retro actuel reste à confirmer.'
      : state.placement.source.status === 'custom' ? 'Cette arène utilise ses propres départs fixes.'
        : 'Placement original indisponible pour cette carte : les deux départs locaux restent fixes.'}</p>
  </section>;
}

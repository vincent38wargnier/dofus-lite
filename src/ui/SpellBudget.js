import React from 'react';

export default function SpellBudget({ report, label }) {
  const exceeded = report.score > report.limit;
  return <section className={`spell-budget${exceeded ? ' exceeded' : ''}`} aria-label={label}>
    <div><strong>{label}</strong><b>{report.score} / {report.limit}</b></div>
    <progress max={report.limit} value={Math.min(report.limit, report.score)} aria-label={label} />
    {report.sum !== undefined && <small>Sorts : {report.sum} · Synergies : {report.synergy} · Rotation des relances : {report.rotation}</small>}
    <small>{exceeded ? `${report.score - report.limit} points à retirer` : `${report.limit - report.score} points disponibles`}</small>
  </section>;
}

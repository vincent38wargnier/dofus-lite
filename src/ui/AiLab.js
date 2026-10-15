import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, Download, ChevronRight, Swords, Trophy, Sparkles, Workflow, ArrowRight } from 'lucide-react';
import { runFlowLab, actionLabel, TRACE_LIMIT } from '../bots/flowLab';
import { AiFighterPortrait } from './AiGuidedSetup';

const RESULT_LABELS={win:'Victoire',loss:'Défaite',draw:'Nul'};
const signature=t=>JSON.stringify({mine:t.mine,opp:t.opp,botId:t.botId,opponentCode:t.opponentCode,mapId:t.count===6?'mirrored':t.mapId,seed:t.seed,count:t.count});
export default function AiLab({code,name,allBots,disabled,onDecision,onOpponent,graph,revision,choices,mine,onReport,onImprove,onEdit,onWatch,onTournament,published}) {
  const [oppId,setOpp]=useState('same'),[botId,setBot]=useState('brutus'),[mapId,setMap]=useState('arene'),[seed,setSeed]=useState(12000);
  const [running,setRunning]=useState(false),[progress,setProgress]=useState(null),[games,setGames]=useState([]),[gameIndex,setGame]=useState(0),[decisionIndex,setDecision]=useState(-1),[error,setError]=useState(''),[tested,setTested]=useState(null),[previous,setPrevious]=useState(null);
  const controller=useRef(null);
  const opp=choices.find(c=>c.id===oppId)||mine;
  const other=allBots.find(b=>b.id===botId);
  useEffect(()=>{onOpponent?.(opp);},[opp,onOpponent]);
  useEffect(()=>()=>controller.current?.abort(),[]);
  const launch=async count=>{
    if(disabled||running)return;
    if(!other){setError('Choisissez une IA adverse.');return;}
    const ctrl=new AbortController();controller.current=ctrl;
    setPrevious(tested&&games.length===tested.count?{test:tested,games}:null);
    setRunning(true);setGames([]);setGame(0);setDecision(-1);setError('');setProgress({game:1,count,turn:1});onDecision(null,null);onReport?.(null);
    const snapshot=JSON.parse(JSON.stringify({code,name,graph,mine,opp,botId,opponentCode:other.code,opponentName:other.name,mapId,seed:Number(seed),count,revision,at:new Date().toISOString()}));setTested(snapshot);
    try{const results=await runFlowLab({code,opponentCode:other.code,mine,opponent:opp,seed:Number(seed),mapId,count},{signal:ctrl.signal,onProgress:setProgress,onGame:g=>setGames(previous=>[...previous,g])});
      if(!ctrl.signal.aborted)onReport?.({test:snapshot,games:results});
    }catch(e){if(e.name==='AbortError')setError('Simulation arrêtée. Les combats terminés restent consultables.');else setError(e.message);}
    finally{if(controller.current===ctrl){setRunning(false);controller.current=null;}}
  };
  const current={mine,opp,botId,opponentCode:other?.code,mapId,seed:Number(seed),count:tested?.count};
  const game=games[gameIndex],stale=!!tested&&(tested.code!==code||signature(tested)!==signature(current));
  const choose=(g,d)=>{setGame(g);setDecision(d);onDecision(games[g]?.entries[d]||null,tested?.graph||null);};
  const report=()=>{const blob=new Blob([JSON.stringify({format:'koliseum-ai-report',version:1,test:tested,games},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='rapport-ia.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  const wins=games.filter(g=>g.outcome==='win').length,losses=games.filter(g=>g.outcome==='loss').length;
  const compare=previous&&tested&&signature(previous.test)===signature(tested)&&games.length===tested.count&&!running;
  const watch=()=>onWatch?.({botB:botId,classA:mine.classId,classB:opp.classId,mapId,seed:Number(seed),loadouts:{A:mine.loadout,B:opp.loadout},names:{A:mine.name,B:opp.name}});
  return <section className="ai-lab ai-guided-lab" aria-label="Laboratoire de combat">
    <header className="ai-step-heading"><span className="ai-eyebrow">03 / LE DÉFI</span><h2>Les bonnes idées gagnent sur le terrain.</h2><p>Un duel pour découvrir. Six duels pour comparer. Puis ajustez votre stratégie et recommencez.</p></header>
    <fieldset disabled={running}><div className="ai-versus"><div><AiFighterPortrait fighter={mine}/><span><small>VOTRE STRATÉGIE</small><strong>{name}</strong><span>{mine.name}</span></span></div><b>VS</b><div><AiFighterPortrait fighter={opp}/><span><small>VOTRE ADVERSAIRE</small><strong>{other?.name||'À choisir'}</strong><span>{opp.name}</span></span></div></div>
      <div className="ai-challengers" role="group" aria-label="Défis disponibles">{[{id:'pantin',title:'Prendre ses marques',text:'Pantin · actions aléatoires'},{id:'brutus',title:'Résister à la pression',text:'Brutus · attaque au contact'},{id:'maison',title:'Battre la référence',text:'Maison · stratégie généraliste'}].filter(c=>allBots.some(b=>b.id===c.id)).map(c=><button type="button" key={c.id} aria-pressed={botId===c.id} onClick={()=>setBot(c.id)}><span>{allBots.find(b=>b.id===c.id).emoji}</span><strong>{c.title}</strong><small>{c.text}</small></button>)}</div>
      <div className="ai-match-settings"><label className="ai-field">IA adverse<select value={botId} onChange={e=>setBot(e.target.value)}>{allBots.filter(b=>!['stratege-v4','stratege'].includes(b.id)).map(b=><option key={b.id} value={b.id}>{b.name}{b.custom?' · votre création':''}</option>)}</select></label><label className="ai-field">Combattant adverse<select value={oppId} onChange={e=>setOpp(e.target.value)}><option value="same">Même combattant · mêmes sorts et équipement</option>{choices.map(c=><option value={c.id} key={c.id}>{c.name}{c.loadout?'':' · base niv. 100'}</option>)}</select></label></div>
      <details className="ai-test-options"><summary>Carte et tirage du test</summary><div className="ai-lab-settings"><label className="ai-field">Carte du test simple<select value={mapId} onChange={e=>setMap(e.target.value)}><option value="arene">Arène</option><option value="muraille">Muraille</option><option value="canyon">Canyon</option></select></label><label className="ai-field">Graine reproductible<input type="number" min="0" max="2147483647" value={seed} onChange={e=>setSeed(e.target.value)}/><small>Conservez ce nombre pour comparer vos versions sur les mêmes tirages.</small></label></div><p>Les deux Stratèges calculent en arrière-plan : choisissez-les dans Combat pour les affronter.</p></details>
    </fieldset>
    <div className="ai-lab-actions"><button type="button" className="ai-button accent" disabled={running||disabled} onClick={()=>launch(1)}><Swords size={17}/> Lancer un duel</button><button type="button" className="ai-button" disabled={running||disabled} onClick={()=>launch(6)}><Trophy size={17}/> Comparer sur 6 duels</button>{running&&<button type="button" className="ai-button" onClick={()=>controller.current?.abort()}><Square size={14}/> Arrêter</button>}</div>
    <p className="ai-test-explainer" role="status">{running?`Combat ${progress?.game}/${progress?.count} · tour ${progress?.turn} — le vrai moteur de combat joue votre stratégie.`:'Le test utilise la version affichée, même avant enregistrement. Les 6 duels inversent les côtés sur 3 cartes.'}</p>
    {disabled&&<p className="ai-error" role="alert">Complétez votre stratégie et choisissez un combattant valide avant de lancer le défi.</p>}
    {error&&<p role="alert" className="ai-error">{error}</p>}
    {!!games.length&&<div className="ai-lab-results">
      <div className="ai-benchmark-heading"><div><span className="ai-eyebrow">{running?'RÉSULTATS EN COURS':'VOTRE DERNIER DÉFI'}</span><h3>{games.length===1?RESULT_LABELS[games[0].outcome]:`${wins} victoire${wins>1?'s':''} sur ${games.length} duels`}</h3><p>{tested?.name} face à {tested?.opponentName}</p></div><button type="button" className="ai-button" onClick={report}><Download size={14}/> Rapport</button></div>
      <div className="ai-result-metrics"><span><b>{wins} / {games.length}</b>victoires</span><span><b>{losses}</b>défaites</span><span><b>{Math.round(games.reduce((n,g)=>n+g.turns,0)/games.length)}</b>tours en moyenne</span><span><b>{games.reduce((n,g)=>n+g.stats.invalid+g.stats.errors,0)}</b>actions en erreur</span></div>
      {compare&&<p className="ai-comparison">Test précédent : <b>{previous.games.filter(g=>g.outcome==='win').length}/{previous.games.length}</b> victoires → cette version : <b>{wins}/{games.length}</b>. Mêmes combattants, adversaire et tirages.</p>}
      {stale&&<p className="ai-warning">Les réglages ont changé. Ces résultats concernent la version et les combattants du test précédent.</p>}
      <div className="ai-result-next"><div><h4>{wins===games.length?'Gardera-t-elle l’avantage ailleurs ?':'Quelle décision pourrait changer le résultat ?'}</h4><p>{wins===games.length?'Changez d’adversaire ou de tirage pour éprouver votre stratégie.':'Observez une décision, ajustez une priorité, puis relancez le même défi.'}</p></div><button type="button" className="ai-button" onClick={onEdit}><Workflow size={15}/> Ajuster ma stratégie</button><button type="button" className="ai-button accent" disabled={running} onClick={onImprove}><Sparkles size={15}/> Améliorer avec ChatGPT</button></div>
      <details className="ai-test-details"><summary>Comprendre les combats et leurs décisions</summary><div className="ai-lab-result-columns"><div className="ai-games-table"><table><thead><tr><th>Combat</th><th>Résultat</th><th>Tours</th><th>Dégâts</th></tr></thead><tbody>{games.map((g,i)=><tr key={i} className={i===gameIndex?'selected':''}><td><button type="button" onClick={()=>{setGame(i);setDecision(-1);}}>{i+1} · {g.mapId} · {g.side}<ChevronRight size={13}/></button></td><td>{RESULT_LABELS[g.outcome]}</td><td>{g.turns}</td><td>{g.stats.damageDealt}</td></tr>)}</tbody></table></div><div className="ai-decisions"><h4>Choisissez une décision{game&&<small>{game.entries.length}/{game.totalDecisions} conservées</small>}</h4>{game?.entries.map((entry,i)=><button type="button" key={i} className={i===decisionIndex?'selected':''} onClick={()=>choose(gameIndex,i)}><span>T{entry.turn}</span><strong>{actionLabel(entry.action,entry.view)}</strong><small>{entry.view.you.pa} PA · {entry.view.you.pm} PM</small></button>)}{game?.totalDecisions>TRACE_LIMIT&&<p>Les {TRACE_LIMIT} premières décisions sont conservées. Le résultat couvre le combat complet.</p>}</div></div></details>
      <p className="ai-test-explainer">Ces essais mesurent un scénario, pas un classement global. Variez classes, cartes et tirages pour confirmer un progrès.</p>
    </div>}
    <footer className="ai-take-to-arena"><div><Trophy size={22}/><span><strong>Prête à affronter les autres ?</strong><small>{published?'Votre IA est disponible dans Combat et dans le Tournoi. Partagez-la pour que vos amis la défient.':'Enregistrez votre IA pour la retrouver dans Combat et dans le Tournoi.'}</small></span></div><div>{onWatch&&<button type="button" className="ai-button" disabled={running||disabled} onClick={watch}><Play size={15}/> Regarder le duel</button>}{onTournament&&<button type="button" className="ai-button" disabled={!published||running||disabled} onClick={onTournament}>Ouvrir le tournoi <ArrowRight size={15}/></button>}</div></footer>
  </section>;
}

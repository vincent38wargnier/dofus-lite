import { MAISON_STAGES, MAISON_CONTROLS, maisonSettingsErrors } from './maisonStages';

// Visual programs compile to the same decide(view, api) entry point as code bots.
// Edges are control flow for ONE decision. The engine calls the graph again
// after applying an action; a graph cycle is therefore never necessary.
export const FLOW_VERSION = 1;
export const FLOW_LIMIT = 32;
export const PLAN_KINDS = {
  auto: 'Meilleure action', damage: 'Attaquer', heal: 'Soigner', buff: 'Renforcer / protéger',
  control: 'Entraver', summon: 'Invoquer', weapon: 'Utiliser l’arme', spell: 'Sort précis',
  advance: 'Se rapprocher', retreat: 'Prendre de la distance',
};
export function matchesPlanKind(spell,kind,spellKey) {
  if(!kind||kind==='auto')return true;
  if(kind==='spell')return spell.key===spellKey;
  if(kind==='weapon')return !!spell.isWeapon;
  const effects=(spell.effects||[]).flatMap(e=>[e,...(e.trigger?.effects||[])]);
  if(kind==='damage')return effects.some(e=>['damage','lifeSteal','fixedLifeSteal','punitionDamage','poison','apPoison','kill'].includes(e.kind));
  if(kind==='heal')return effects.some(e=>['heal','fixedHeal'].includes(e.kind));
  if(kind==='buff')return effects.some(e=>e.kind.startsWith('buff')||['armor','weaponMastery','invisibility','dodgeMelee','damageReflection','spellReflection'].includes(e.kind));
  if(kind==='summon')return effects.some(e=>['summon','staticSummon','double'].includes(e.kind));
  return kind==='control'&&effects.some(e=>/^(remove|steal|debuff)/.test(e.kind)||['push','pull','skipTurn','dispel'].includes(e.kind));
}
export const FLOW_METRICS = {
  hp: { label: 'Mes PV (%)', max: 100, expression: '100 * view.you.hp / Math.max(1, view.you.maxHp)' },
  allyHp: { label: 'PV du plus blessé de mon camp (%)', max: 100, expression: 'Math.min.apply(null, [view.you].concat(view.allies || []).filter(function(f) { return f.hp > 0; }).map(function(f) { return 100 * f.hp / Math.max(1, f.maxHp); }))' },
  pa: { label: 'Mes PA restants', max: 50, expression: 'view.you.pa' },
  pm: { label: 'Mes PM restants', max: 50, expression: 'view.you.pm' },
  distance: { label: 'Distance du plus proche ennemi visible', max: 100, expression: 'Math.min.apply(null, [999].concat((view.enemies || []).filter(function(f) { return f.hp > 0 && !f.hidden; }).map(function(f) { return api.dist(view.you.pos, f.pos); })))' },
  enemies: { label: 'Ennemis encore vivants', max: 64, expression: '(view.enemies || []).filter(function(f) { return f.hp > 0; }).length' },
  turn: { label: 'Tour du combat', max: 200, expression: 'view.turn' },
};
export const FLOW_OPERATORS = { '<': 'inférieur à', '<=': 'au plus', '>': 'supérieur à', '>=': 'au moins', '===': 'égal à' };
export const FLOW_WEIGHTS = [
  { key: 'damage', label: 'Dégâts utiles', group: 'Attaque', max: 5, hint: 'Valeur des PV réellement retirés, après protections.' },
  { key: 'kill', label: 'Élimination', group: 'Attaque', max: 8, hint: 'Bonus pour finir une cible et ses invocations dépendantes.' },
  { key: 'leader', label: 'Priorité aux invocateurs', group: 'Attaque', max: 4, hint: 'Renforce la priorité aux combattants non invoqués. Le danger reste pris en compte.' },
  { key: 'focusWeak', label: 'Cibles blessées', group: 'Attaque', max: 4, hint: 'Concentre les coups sur un ennemi déjà affaibli.' },
  { key: 'paEfficiency', label: 'Économie de PA', group: 'Attaque', max: 3, hint: 'Favorise la valeur par PA ; les enchaînements sont aussi évalués.' },
  { key: 'heal', label: 'Soins', group: 'Soutien', max: 5, hint: 'Valeur des soins utiles, sans compter le soin excédentaire.' },
  { key: 'healThreshold', label: 'Soigner sous ce ratio de PV', group: 'Soutien', max: 1, hint: '0,85 signifie 85 % des PV maximum.' },
  { key: 'armor', label: 'Protection', group: 'Soutien', max: 5, hint: 'Armures, esquive, renvois et invisibilité selon la menace.' },
  { key: 'buff', label: 'Boosts', group: 'Soutien', max: 5, hint: 'Bonus utiles et ouverture de nouveaux enchaînements.' },
  { key: 'summon', label: 'Invocations', group: 'Soutien', max: 5, hint: 'L’intérêt diminue lorsque plusieurs invocations sont déjà en jeu.' },
  { key: 'removePa', label: 'Retrait de PA', group: 'Contrôle', max: 5, hint: 'Tient compte de la probabilité de retrait et des PA disponibles.' },
  { key: 'removePm', label: 'Retrait de PM', group: 'Contrôle', max: 5, hint: 'Ralentir un adversaire de mêlée a davantage de valeur.' },
  { key: 'push', label: 'Poussée', group: 'Contrôle', max: 4, hint: 'Dégâts de collision et possibilité de se désengager.' },
  { key: 'threat', label: 'Éviter le danger', group: 'Placement', max: 5, hint: 'Pénalise les cases exposées aux attaques adverses.' },
  { key: 'aggression', label: 'Avancer', group: 'Placement', max: 3, hint: 'Pression vers la distance de combat adaptée au grimoire.' },
  { key: 'rangeBand', label: 'Garder sa bonne distance', group: 'Placement', max: 4, hint: 'La distance idéale dépend des sorts du combattant.' },
  { key: 'losHide', label: 'Se mettre à couvert', group: 'Placement', max: 3, hint: 'Préfère couper la ligne de vue en fin de tour.' },
  { key: 'retreatHp', label: 'Prudence sous ce ratio de PV', group: 'Placement', max: 1, hint: 'Sous ce seuil, le danger pèse davantage.' },
  { key: 'lookahead', label: 'Anticiper après déplacement', group: 'Placement', max: 3, hint: 'Valeur des attaques débloquées par une nouvelle position.' },
];
export const flowPorts = node => node.type === 'maison-stage' ? [node.config?.stage === 'choose' ? 'fallback' : 'next'] : node.type === 'start' ? ['next'] : node.type === 'condition' ? ['yes', 'no'] : node.type === 'plan' ? ['fallback'] : [];
export const portLabel = port => ({ next: 'Suite', yes: 'Oui', no: 'Non', fallback: 'Impossible' }[port]);
export function flowTitle(node) {
  return node.label || (node.type === 'maison-stage' ? MAISON_STAGES.find(s=>s.id===node.config?.stage)?.title : node.type === 'start' ? 'À chaque décision' : node.type === 'end' ? 'Fin de tour' : node.type === 'condition' ? 'Si…' : PLAN_KINDS[node.config?.kind] || 'Planifier');
}
export function flowSummary(node) {
  if (node.type === 'maison-stage') return MAISON_STAGES.find(s=>s.id===node.config?.stage)?.short || 'Étape Maison';
  if (node.type === 'condition') return `${FLOW_METRICS[node.config?.metric]?.label || '?'} ${node.config?.operator} ${node.config?.value}`;
  if (node.type === 'plan') return node.config?.kind === 'spell' ? node.config.spellKey || 'Choisir un sort'
    : `${node.config?.base === 'cortex' ? 'Cortex' : 'IA Maison'} · ${Object.keys(node.config?.weights || {}).length || 'aucun'} réglage${Object.keys(node.config?.weights || {}).length > 1 ? 's' : ''}`;
  return node.type === 'start' ? 'Repart après chaque action jouée' : 'Rend la main au combattant suivant';
}
export function makeFlow(template = 'maison') {
  const nodes = [
    { id: 'start', type: 'start', x: 65, y: 180, links: { next: 'brain' } },
    { id: 'brain', type: 'plan', label: 'IA Maison', x: 390, y: 180, config: { kind: 'auto', base: 'maison', weights: {} }, links: { fallback: 'end' } },
    { id: 'end', type: 'end', x: 715, y: 180, links: {} },
  ];
  if (template === 'prudent') {
    nodes[0].links.next = 'health'; nodes[0].x = 60; nodes[0].y = 190;
    nodes[1].x = 660; nodes[1].y = 340; nodes[2].x = 960; nodes[2].y = 340;
    nodes.push({ id: 'health', type: 'condition', label: 'Un allié en danger ?', x: 360, y: 190, config: { metric: 'allyHp', operator: '<', value: 45 }, links: { yes: 'heal', no: 'brain' } },
      { id: 'heal', type: 'plan', label: 'Soigner en priorité', x: 660, y: 60, config: { kind: 'heal', base: 'maison', weights: { heal: 2 } }, links: { fallback: 'brain' } });
  }
  if (template === 'aggressive') { nodes[1].label = 'Pression offensive'; nodes[1].config.weights = { damage: 1.8, kill: 4, aggression: .8, threat: .55 }; }
  return { version: FLOW_VERSION, nodes };
}
// Expand/collapse the executable stages without losing the surrounding graph.
export function expandMaison(graph, id) {
  const node = graph.nodes.find(n=>n.id===id);
  if (!node || node.type !== 'plan' || ['advance','retreat'].includes(node.config.kind)) throw new Error('Ce bloc ne contient pas le planificateur Maison.');
  if (graph.nodes.length + MAISON_STAGES.length - 1 > FLOW_LIMIT) throw new Error('Pas assez de place : 32 blocs maximum.');
  const ids = MAISON_STAGES.map((stage,i)=>i ? `${id.slice(0,40)}-${stage.id}` : id);
  if (ids.slice(1).some(k=>graph.nodes.some(n=>n.id===k))) throw new Error('Ces identifiants d’étapes existent déjà.');
  const { pipeline = {}, ...config } = node.config;
  const nodes = MAISON_STAGES.map((stage,i)=>({
    id:ids[i],type:'maison-stage',label:stage.title,
    x:Math.min(11000,node.x + (i%3)*305),y:Math.min(11000,node.y + Math.floor(i/3)*230),
    config:{ ...(i===0 ? {...config,planLabel:node.label} : {}),stage:stage.id,group:id,
      settings:Object.fromEntries(MAISON_CONTROLS.filter(c=>c.stage===stage.id && Object.hasOwn(pipeline,c.key)).map(c=>[c.key,pipeline[c.key]])) },
    links:i===MAISON_STAGES.length-1 ? {fallback:node.links.fallback} : {next:ids[i+1]},
  }));
  // Preserve the surrounding program, placing displaced cards below this group.
  const placed=[...nodes];
  const others=new Map();
  const collides=n=>placed.some(p=>Math.abs(p.x-n.x)<264&&Math.abs(p.y-n.y)<176);
  for(const old of graph.nodes.filter(n=>n.id!==id)){
    let n={...old};
    while(collides(n)&&n.y<11800)n={...n,y:Math.min(12000,n.y+200)};
    placed.push(n);others.set(n.id,n);
  }
  return {...graph,nodes:graph.nodes.flatMap(n=>n.id===id?nodes:[others.get(n.id)])};
}
export function maisonGroupConfig(graph, group) {
  const nodes=graph.nodes.filter(n=>n.type==='maison-stage'&&n.config.group===group);
  const entry=nodes.find(n=>n.config.stage==='profile');
  return { kind:entry.config.kind,base:entry.config.base,weights:entry.config.weights,
    ...(entry.config.spellKey?{spellKey:entry.config.spellKey}:{}),pipeline:Object.assign({},...nodes.map(n=>n.config.settings||{})) };
}
export function collapseMaison(graph, group) {
  const nodes=graph.nodes.filter(n=>n.type==='maison-stage'&&n.config.group===group);
  const entry=nodes.find(n=>n.config.stage==='profile'),end=nodes.find(n=>n.config.stage==='choose');
  if (!entry||!end) throw new Error('Pipeline Maison incomplet.');
  const collapsed={id:group,type:'plan',label:entry.config.planLabel||'IA Maison',x:entry.x,y:entry.y,config:maisonGroupConfig(graph,group),links:{fallback:end.links.fallback}};
  return {...graph,nodes:graph.nodes.flatMap(n=>n===entry?[collapsed]:nodes.includes(n)?[]:[n])};
}
export function makeMaisonFlow() {
  const graph=expandMaison(makeFlow(),'brain');
  // A compact reading order; return links run through the gutters between rows.
  const order=['start',...MAISON_STAGES.map((s,i)=>i?`brain-${s.id}`:'brain'),'end'];
  return {...graph,nodes:graph.nodes.map(n=>{const i=order.indexOf(n.id);return {...n,x:60+i%3*310,y:60+Math.floor(i/3)*230};})};
}
export function flowErrors(graph) {
  const errors = [];
  if (!graph || graph.version !== FLOW_VERSION || !Array.isArray(graph.nodes) || !graph.nodes.length || graph.nodes.length > FLOW_LIMIT) return ['Format de graphe invalide (1 à 32 blocs, version 1).'];
  const ids = new Set();
  for (const n of graph.nodes) {
    if (!n || typeof n.id !== 'string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(n.id) || ids.has(n.id)) return ['Chaque bloc doit avoir un identifiant unique.'];
    ids.add(n.id);
    if (!['start','condition','plan','end','maison-stage'].includes(n.type)) errors.push(`Bloc ${n.id} : type inconnu.`);
    if (![n.x,n.y].every(v=>Number.isFinite(v)&&v>=0&&v<=12000)) errors.push(`Bloc ${n.id} : position invalide.`);
    if (n.label !== undefined && (typeof n.label !== 'string' || n.label.length > 80)) errors.push(`Bloc ${n.id} : nom trop long.`);
    if (!n.links || typeof n.links !== 'object' || Array.isArray(n.links)) { errors.push(`Bloc ${n.id} : connexions manquantes.`); continue; }
    for (const p of Object.keys(n.links)) if (!flowPorts(n).includes(p)) errors.push(`Bloc ${n.id} : sortie inconnue.`);
    const c = n.config || {};
    if (n.type === 'condition' && (!Object.keys(FLOW_METRICS).includes(c.metric) || !Object.keys(FLOW_OPERATORS).includes(c.operator) || !Number.isFinite(c.value) || c.value<0 || c.value>FLOW_METRICS[c.metric].max)) errors.push(`${flowTitle(n)} : condition invalide.`);
    if (n.type === 'maison-stage') {
      if (!MAISON_STAGES.some(s=>s.id===c.stage) || typeof c.group!=='string') errors.push('Étape Maison inconnue.');
      errors.push(...maisonSettingsErrors(c.settings,c.stage));
      if (c.stage==='profile' && ['advance','retreat'].includes(c.kind)) errors.push('Type de pipeline Maison invalide.');
    }
    if (n.type === 'plan' || (n.type === 'maison-stage' && c.stage==='profile')) {
      errors.push(...maisonSettingsErrors(c.pipeline));
      if (!Object.keys(PLAN_KINDS).includes(c.kind) || !['maison','cortex'].includes(c.base)) errors.push(`${flowTitle(n)} : action inconnue.`);
      if (c.kind === 'spell' && (typeof c.spellKey !== 'string' || !c.spellKey.trim() || c.spellKey.length > 160)) errors.push(`${flowTitle(n)} : choisissez un sort.`);
      if (!c.weights || typeof c.weights !== 'object' || Array.isArray(c.weights)) errors.push(`${flowTitle(n)} : réglages invalides.`);
      else for (const [k,v] of Object.entries(c.weights)) { const w=FLOW_WEIGHTS.find(w=>w.key===k); if (!w || !Number.isFinite(v) || v<0 || v>w.max) errors.push(`${flowTitle(n)} : valeur invalide pour ${k}.`); }
    }
  }
  const stages=graph.nodes.filter(n=>n.type==='maison-stage');
  for (const group of new Set(stages.map(n=>n.config?.group))) {
    const members=stages.filter(n=>n.config?.group===group);
    const ordered=MAISON_STAGES.map(s=>members.find(n=>n.config.stage===s.id));
    if (members.length!==MAISON_STAGES.length || ordered.some(n=>!n) || ordered[0]?.id!==group) {
      errors.push('Pipeline Maison incomplet : les sept étapes sont nécessaires.'); continue;
    }
    ordered.forEach((n,i)=>{
      if (i<ordered.length-1 && n.links?.next!==ordered[i+1].id) errors.push('Les étapes Maison doivent conserver leur ordre de calcul.');
      if (i>0 && graph.nodes.some(from=>Object.values(from.links||{}).includes(n.id)&&from.id!==ordered[i-1].id)) errors.push('Une connexion externe doit entrer par la première étape Maison.');
    });
  }
  if (graph.nodes.filter(n=>n.type==='start').length!==1) errors.push('Un seul bloc de départ est nécessaire.');
  if (!graph.nodes.some(n=>n.type==='end')) errors.push('Ajoutez une fin de tour.');
  for (const n of graph.nodes) for (const p of flowPorts(n)) {
    const target=graph.nodes.find(t=>t.id===n.links?.[p]);
    if (!target) errors.push(`${flowTitle(n)} : reliez la sortie « ${portLabel(p)} ».`);
    else if(target.type==='start') errors.push('Une connexion ne peut pas revenir au départ.');
  }
  const done=new Set(), visiting=new Set();
  function visit(id) { if(visiting.has(id)){errors.push('Boucle détectée. Le graphe redémarre déjà après chaque action.');return;}if(done.has(id))return;
    const n=graph.nodes.find(n=>n.id===id);if(!n)return;visiting.add(id);for(const p of flowPorts(n))visit(n.links?.[p]);visiting.delete(id);done.add(id); }
  graph.nodes.forEach(n=>visit(n.id));
  return [...new Set(errors)];
}
export function disconnectedNodes(graph) {
  const seen=new Set(); function visit(n){if(!n||seen.has(n.id))return;seen.add(n.id);for(const p of flowPorts(n))visit(graph.nodes.find(t=>t.id===n.links?.[p]));}
  visit(graph.nodes.find(n=>n.type==='start'));return graph.nodes.filter(n=>!seen.has(n.id)).map(n=>n.id);
}
export function flowToCode(graph) {
  const errors=flowErrors(graph); if(errors.length) throw new Error(errors.join('\n'));
  const q=JSON.stringify, start=graph.nodes.find(n=>n.type==='start').id;
  const lines=['// Généré par le Studio IA. Chaque bloc correspond à un case.', '// Une action jouée = nouvel appel au départ, avec les PA et PV à jour.',
    'function decide(view, api) {', `  var node = ${q(start)};`, '  var action, value, branch;', '  var maison = Object.create(null);', `  for (var step = 0; step < ${FLOW_LIMIT}; step++) {`, '    switch (node) {'];
  for(const n of graph.nodes){lines.push(`      case ${q(n.id)}: // ${flowTitle(n).replace(/[\r\n\u2028\u2029]/g,' ')}`);
    if(n.type==='condition'){
      lines.push(`        value = ${FLOW_METRICS[n.config.metric].expression};`, `        branch = value ${n.config.operator} ${n.config.value} ? "yes" : "no";`,
        `        if (api.flowTrace) api.flowTrace({ node: ${q(n.id)}, port: branch, value: value });`, `        node = branch === "yes" ? ${q(n.links.yes)} : ${q(n.links.no)};`, '        break;');
    }else if(n.type==='maison-stage'){
      const c=n.config,group=q(c.group);
      if(c.stage==='profile')lines.push(`        maison[${group}] = api.maisonPipeline(${q(maisonGroupConfig(graph,c.group))}, api.flowInspect);`);
      lines.push(`        value = maison[${group}].step(${q(c.stage)});`);
      if(c.stage==='choose')lines.push('        action = value.action;',
        `        if (api.flowTrace) api.flowTrace({ node: ${q(n.id)}, port: action.type === "PASS" ? "fallback" : "action", action: action, stage: value });`,
        '        if (action.type !== "PASS") return action;', `        node = ${q(n.links.fallback)};`, '        break;');
      else lines.push(`        if (api.flowTrace) api.flowTrace({ node: ${q(n.id)}, port: "next", stage: value });`, `        node = ${q(n.links.next)};`, '        break;');
    }else if(n.type==='plan'){
      lines.push(`        action = api.plan(${q(n.config)}, api.flowInspect);`,
        `        if (api.flowTrace) api.flowTrace({ node: ${q(n.id)}, port: action.type === "PASS" ? "fallback" : "action", action: action });`,
        '        if (action.type !== "PASS") return action;', `        node = ${q(n.links.fallback)};`, '        break;');
    }else if(n.type==='start'){lines.push(`        if (api.flowTrace) api.flowTrace({ node: ${q(n.id)}, port: "next" });`, `        node = ${q(n.links.next)};`, '        break;');
    }else lines.push(`        if (api.flowTrace) api.flowTrace({ node: ${q(n.id)}, port: "action", action: api.endTurn() });`, '        return api.endTurn();');
  }
  lines.push('      default: return api.endTurn();','    }','  }','  return api.endTurn();','}');return lines.join('\n');
}
export function visualBotPackage(name, graph) {
  flowToCode(graph); return { format:'koliseum-visual-ai', version:1, name:String(name).trim().slice(0,80)||'Mon IA', graph:JSON.parse(JSON.stringify(graph)) };
}
export function parseVisualBot(text) {
  if(typeof text!=='string'||text.length>250000)throw new Error('Fichier IA trop volumineux (250 Ko maximum).');
  const data=JSON.parse(text);if(data.format!=='koliseum-visual-ai'||data.version!==1)throw new Error('Choisissez un fichier JSON exporté par le Studio IA.');
  return visualBotPackage(data.name,data.graph);
}

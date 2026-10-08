import React from 'react';
import { CLASSES } from '../engine/classes';
import { ELEMENT_EMOJI } from '../engine/formulas';

function effectLabel(e) {
  const elem = e.element ? ` ${ELEMENT_EMOJI[e.element]}` : '';
  switch (e.kind) {
    case 'damage': return `${e.min}–${e.max} dégâts${elem}`;
    case 'lifeSteal': return `vole ${e.min}–${e.max} PV${elem}`;
    case 'heal': return `soigne ${e.min}–${e.max} PV`;
    case 'push': return `pousse ${e.p1} case${e.p1 > 1 ? 's' : ''}`;
    case 'pull': return `attire ${e.p1} case${e.p1 > 1 ? 's' : ''}`;
    case 'teleport': return 'téléporte le lanceur';
    case 'poison': return `poison ${e.value}/tour`;
    case 'buffPa': return `+${e.min}${e.max !== e.min ? `–${e.max}` : ''} PA`;
    case 'buffPm': return `+${e.min} PM`;
    case 'buffPower': return `+${e.min}% dommages`;
    case 'buffDamage': return `+${e.min} dommages`;
    case 'removePa': return `-${e.p1} PA (esquivable)`;
    case 'removePm': return `-${e.p1} PM (esquivable)`;
    default: return e.kind;
  }
}

function zoneLabel(effects) {
  const zones = [...new Set(effects.map((e) => e.zone && e.zone[0]))];
  if (zones.includes('C')) return ' · zone cercle';
  if (zones.includes('X')) return ' · zone croix';
  if (zones.includes('L')) return ' · zone ligne';
  return '';
}

function SpellTable({ cls }) {
  const st = cls.stats;
  return (
    <>
      <h3>
        {cls.emoji} {cls.name} — {cls.baseHp} PV · {cls.basePa} PA · {cls.basePm} PM
      </h3>
      <p className="muted small">
        {cls.description}<br />
        🟤 {st.force} force · 🔥 {st.intelligence} intelligence · 💧 {st.chance} chance ·
        {' '}💨 {st.agilite} agilité · 🦉 {st.sagesse} sagesse
      </p>
      <table>
        <thead>
          <tr><th>Sort</th><th>PA</th><th>Portée</th><th>Effets (valeurs réelles 1.29)</th><th>Contraintes</th></tr>
        </thead>
        <tbody>
          {Object.values(cls.spells).map((s) => (
            <tr key={s.key}>
              <td>{s.emoji} <b>{s.name}</b><br /><code>{s.key}</code></td>
              <td>{s.pa}</td>
              <td>{s.range[0]}–{s.range[1]}{s.lineOnly ? ' (en ligne)' : ''}</td>
              <td>
                {s.effects.map(effectLabel).join(' + ')}{zoneLabel(s.effects)}
                {s.critRate ? ` · CC 1/${s.critRate}` : ''}
              </td>
              <td>
                {s.usesPerTurn === 0 ? '∞' : `${s.usesPerTurn}×`}/tour
                {s.cooldown ? ` · relance ${s.cooldown} tours` : ''}
                {!s.needsLos ? ' · sans ligne de vue' : ''}
                {s.endsTurnOnFailure ? ' · échec = fin de tour !' : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function DocsScreen() {
  return (
    <div className="docs">
      <h2>🏟️ Le principe</h2>
      <p>
        Le <b>Dofus Koliséum</b> est une arène de bots : au lieu de jouer vous-même, vous
        <b> programmez la logique de combat</b> de votre champion, puis vous l'envoyez affronter
        les bots des autres. Le meilleur code gagne. Les combats reprennent les mécaniques
        tactiques de Dofus : PA, PM, portées, lignes de vue, tacle, poussées…
      </p>
      <p>
        L'onglet <b>🎮 Jouer</b> vous met vous-même aux commandes contre un bot : cliquez une
        case verte pour vous déplacer, un sort puis une case rouge pour lancer, ⏭ pour finir
        le tour (chrono de 30 s, comme en 1.29). Vos invocations restent autonomes.
        La référence à battre est l'<b>🏛️ IA Maison</b> : le cerveau utilitaire du Koliséum
        avec des poids réglés <i>par matchup</i> (classe contre classe) sur des centaines de
        milliers de combats simulés. Si votre bot la bat, il est prêt pour le tournoi.
      </p>

      <h2>⚔️ Règles de combat (formules 1.29 authentiques)</h2>
      <p className="muted small">
        Les mécaniques ci-dessous sont celles du vrai jeu, recoupées dans le code de
        plusieurs émulateurs open source (AncestraRemake, CodeBreak, GDCore, Shivas) —
        les sorts viennent directement de la base de données du jeu.
      </p>
      <table>
        <tbody>
          <tr><td><b>PA / PM</b></td><td>8 PA et 4 PM par tour (combattants niveau 100 équipés) ; 1 PM = 1 case</td></tr>
          <tr><td><b>Éléments</b></td><td>🟤 terre/neutre → force · 🔥 feu → intelligence · 💧 eau → chance · 💨 air → agilité</td></tr>
          <tr><td><b>Portée</b></td><td>distance de Manhattan, min et max par sort ; sorts « en ligne » ; zones cercle/croix/ligne</td></tr>
          <tr><td><b>Ligne de vue</b></td><td>murs, rochers <i>et combattants</i> bloquent ; l'eau et le vide non</td></tr>
          <tr><td><b>Lancers / relance</b></td><td>nombre de lancers par tour et intervalle de relance par sort (valeurs réelles)</td></tr>
          <tr><td><b>Fin du combat</b></td><td>K.O., ou après 40 tours : % de PV restants <i>sur les PV max d'origine</i> (l'érosion compte)</td></tr>
        </tbody>
      </table>

      <h3>🎲 Coups critiques et échecs critiques</h3>
      <pre><code>{`taux CC = max(2, floor(taux_base × 2.9901 / ln(agilité + 12)))   // proba 1/taux
taux EC = 1/100 sur la plupart des sorts — PA dépensés, aucun effet`}</code></pre>
      <p className="muted small">
        L'agilité améliore vos critiques (120 agi ≈ 1/24 au lieu de 1/40). Un coup critique
        utilise la ligne d'effets critiques du sort (les vraies valeurs, pas un simple ×1.3).
        Certains sorts <b>terminent le tour</b> sur un échec critique.
      </p>

      <h3>🪤 Tacle et fuite (jet d'agilité)</h3>
      <pre><code>{`chance de fuite = floor(300 × (agi + 25) / (agi + agi_ennemis + 50)) − 100   // borné [10, 90]
échec  →  déplacement ANNULÉ, tous les PM perdus, − (chance%) des PA`}</code></pre>
      <p className="muted small">
        Agilités égales : 50 %. Astuce éternelle du kiteur : tirer <i>d'abord</i>, fuir
        <i> ensuite</i> — un tacle raté ne mange alors que des PA déjà dépensés.
        <code>api.tackleInfo()</code> vous donne la probabilité exacte.
      </p>

      <h3>🐌 Retraits de PA/PM et esquive (sagesse)</h3>
      <pre><code>{`esquive = sagesse / 4 (chaque camp)
P(perdre 1 point) = ceil( (esq_lanceur / esq_cible) × (points_restants / points_max) × 50 ) %`}</code></pre>

      <h3>💨 Dégâts de poussée</h3>
      <pre><code>{`dégâts bruts = floor( (1d8+8) × niveau/50 × cases bloquées )   // niveau 100 → ×2
// bruts: ignorent caractéristiques et résistances`}</code></pre>

      <h3>🩸 Érosion (PvP)</h3>
      <p className="muted small">
        Chaque coup encaissé ronge <code>dégâts/10</code> PV max. Soigner ne restaure pas
        les PV max : une tortue qui ne conclut pas finit par perdre à la limite de tours.
      </p>

      <h3>⚡ Initiative</h3>
      <pre><code>{`initiative = (vitalité/4 + force + intelligence + chance + agilité) × (PV actuels / PV max)`}</code></pre>

      <h2>🧙 Les classes</h2>
      {Object.values(CLASSES).map((cls) => <SpellTable key={cls.id} cls={cls} />)}

      <h2>🤖 Écrire un bot</h2>
      <p>
        Un bot est une fonction <code>decide(view, api)</code>. Pendant votre tour, l'arène
        l'appelle en boucle : chaque appel doit retourner <b>une seule action</b>. Le tour se
        termine quand vous retournez <code>api.endTurn()</code> (ou après 25 actions,
        3 actions invalides, ou une exception — soyez propres !).
      </p>

      <h3>Ce que voit votre bot : <code>view</code></h3>
      <pre><code>{`view = {
  turn, maxTurns,
  you: {
    pos: {x, y}, hp, maxHp, pa, pm, tacle, fuite, classId,
    effects: [{kind, stat, value, turnsLeft, name}],
    spells: [{key, name, pa, range: [min, max], lineOnly, needsLos,
              usesLeft, cooldownLeft, effects: [...], target}],
  },
  enemy: { ...pareil que you },
  board: { width, height, obstacles: [{x, y, type, blocksMove, blocksLos}] },
}`}</code></pre>

      <h3>Ce que sait faire votre bot : <code>api</code></h3>
      <table>
        <thead><tr><th>Méthode</th><th>Rôle</th></tr></thead>
        <tbody>
          <tr><td><code>api.move(pos)</code></td><td>action : se déplacer vers une case (chemin le plus court, tacle appliqué)</td></tr>
          <tr><td><code>api.cast(key, pos)</code></td><td>action : lancer un sort sur une case</td></tr>
          <tr><td><code>api.endTurn()</code></td><td>action : terminer son tour</td></tr>
          <tr><td><code>api.say(texte)</code></td><td>action : provoquer l'adversaire (2 max/tour, 80 caractères)</td></tr>
          <tr><td><code>api.canCast(key, pos)</code></td><td><code>{'{ok, reason}'}</code> — mêmes règles que l'arbitre (PA, portée, ligne de vue, relance…)</td></tr>
          <tr><td><code>api.castTargets(key)</code></td><td>toutes les cases où le sort passe maintenant</td></tr>
          <tr><td><code>api.canMove(pos)</code></td><td>la case est-elle atteignable ce tour ?</td></tr>
          <tr><td><code>api.reachable()</code></td><td>cases atteignables : <code>{'[{pos, cost, path}]'}</code></td></tr>
          <tr><td><code>api.pathTo(pos)</code></td><td>chemin complet (au-delà des PM), <code>null</code> si bloqué</td></tr>
          <tr><td><code>api.moveToward(pos)</code> / <code>api.moveAway(pos)</code></td><td>action de déplacement toute prête (au sens du chemin réel, pas à vol d'oiseau)</td></tr>
          <tr><td><code>api.dist(a, b)</code></td><td>distance de Manhattan</td></tr>
          <tr><td><code>api.hasLos(a, b)</code></td><td>ligne de vue entre deux cases</td></tr>
          <tr><td><code>api.tackleInfo()</code></td><td><code>{'{inContact, coeff, paAfter, pmAfter}'}</code> si vous fuyez maintenant</td></tr>
          <tr><td><code>api.isFree(pos)</code></td><td>case libre (ni obstacle, ni combattant)</td></tr>
          <tr><td><code>api.random()</code> / <code>api.pick(arr)</code></td><td>aléa <b>déterministe</b> — même seed, même match, replays fidèles</td></tr>
          <tr><td><code>api.suggest(poids?)</code></td><td>le cerveau utilitaire intégré : évalue toutes les actions (sorts × cibles avec zones réelles, déplacements avec lookahead « quelle case débloque quel sort ») et joue la meilleure. Passez vos poids pour changer sa personnalité : <code>{'api.suggest({ kill: 5, threat: 1.4 })'}</code></td></tr>
          <tr><td><code>api.maison()</code></td><td>l'IA Maison : le même cerveau avec les poids du <b>matchup</b> (votre classe vs la classe adverse), réglés par CEM sur des centaines de milliers de combats. C'est la référence à battre — et une base : <code>{'api.suggest(Object.assign(api.maisonWeights(), { kill: 5 }))'}</code></td></tr>
          <tr><td><code>api.maisonWeights()</code></td><td>les poids que l'IA Maison utiliserait pour ce matchup (objet modifiable)</td></tr>
          <tr><td><code>view.allies / view.enemies</code></td><td>tous les combattants (invocations comprises — elles jouent toutes seules, comme dans le vrai jeu)</td></tr>
        </tbody>
      </table>

      <h3>Les règles du fair-play (imposées par l'arbitre)</h3>
      <ul>
        <li>Votre bot reçoit une <b>copie</b> de l'état : modifier <code>view</code> ne triche pas.</li>
        <li>Toute action passe par la <b>même validation</b> que si un humain jouait.</li>
        <li>Une exception dans <code>decide()</code> = tour perdu. Trois actions invalides = tour perdu.</li>
        <li><b>Boucle infinie ?</b> Votre code est instrumenté à la compilation : au-delà de
          2 000 000 d'itérations de boucle par <code>decide()</code>, il est interrompu, le tour est
          perdu et le match continue. Un combat se termine <i>toujours</i> (K.O. ou 40 tours).</li>
        <li><code>Math.random()</code> marche mais rend vos replays non reproductibles — préférez <code>api.random()</code>.</li>
      </ul>

      <h2>📚 Sources des mécaniques</h2>
      <ul className="small">
        <li><a href="https://www.frenchleaf.fr/apprendre-dofus/combats-strategies" target="_blank" rel="noreferrer">DofHub — Combats & stratégies (PA, PM, portée, ligne de vue)</a></li>
        <li><a href="https://dofusgadgets.com/tacle_calcs/" target="_blank" rel="noreferrer">DofusGadgets — Calculateur tacle/fuite</a></li>
        <li><a href="http://raceko.wifeo.com/formules-en-combat-de-dofus.php" target="_blank" rel="noreferrer">Formules en combat de Dofus (tacle, poussée)</a></li>
        <li><a href="https://stuffgaming.fr/dofus-comment-fonctionnent-les-do-pou/" target="_blank" rel="noreferrer">StuffGaming — Les dégâts de poussée</a></li>
      </ul>
    </div>
  );
}

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
          <tr><th>Sort</th><th>PA</th><th>Portée</th><th>Effets simulés</th><th>Contraintes</th></tr>
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
                {s.usesPerTarget ? ` · ${s.usesPerTarget}×/cible` : ''}
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

      <h2>⚔️ Règles de combat</h2>
      <p className="muted small">
        Modèle de combat version 4 : formules recoupées avec les archives françaises
        d’Ankama (versions 1.25 à 1.28) et les calculateurs historiques DofuX.
        Certains effets restent incomplets : le Grimoire indique lesquels.
        Ce recoupement ne remplace pas une comparaison avec des combats du serveur Retro actuel.
      </p>
      <table>
        <tbody>
          <tr><td><b>PA / PM</b></td><td>6 PA de base avant le niveau 100, puis 7 PA dès le niveau 100, auxquels s’ajoutent les bonus d’équipement et de panoplie. Cette règle s’applique aussi aux personnages du Tournoi et de l’Éditeur. 3 PM de base ; les anciens kits conservent 4 PM. 1 PM = 1 case.</td></tr>
          <tr><td><b>Éléments</b></td><td>🟤 terre/neutre → force · 🔥 feu → intelligence · 💧 eau → chance · 💨 air → agilité</td></tr>
          <tr><td><b>Portée</b></td><td>distance de Manhattan, min et max par sort ; sorts « en ligne » ; zones cercle/croix/ligne</td></tr>
          <tr><td><b>Ligne de vue</b></td><td>murs, rochers <i>et combattants</i> bloquent ; l'eau et le vide non</td></tr>
          <tr><td><b>Lancers / relance</b></td><td>limites distinctes par tour et par cible ; intervalle de relance par sort</td></tr>
          <tr><td><b>Pièges / glyphes</b></td><td>pièges déclenchés en entrant dans leur zone, glyphes en début de tour ; les pièges adverses restent cachés</td></tr>
          <tr><td><b>Fin du combat</b></td><td>K.O., ou après 40 tours : % de PV restants <i>sur les PV max d'origine</i> (l'érosion compte)</td></tr>
        </tbody>
      </table>

      <h3>💥 Caractéristiques, dégâts et soins</h3>
      <pre><code>{`dégâts = floor(jet × (100 + caractéristique + % dommages) / 100) + dommages fixes
soin = floor(jet × (100 + intelligence) / 100) + bonus soins`}</code></pre>
      <p className="muted small">
        Force pour terre et neutre, intelligence pour feu, chance pour eau, agilité pour air.
        Le calcul s’applique à chaque ligne de dégâts. Les % dommages s’ajoutent à la
        caractéristique ; ils ne multiplient pas les dommages fixes et n’améliorent pas les soins.
        Exemple : jet 20, force 300, +20 % dommages et +7 dommages → 91 avant protections.
      </p>

      <h3>🛡️ Résistances et renvoi d’équipement</h3>
      <pre><code>{`modèle local : floor(max(0, dégâts − résistance fixe) × (100 − résistance %) / 100)
résistance % des joueurs : plafond 50 % ; armure de sort ensuite`}</code></pre>
      <p className="muted small">
        L’ordre précis des résistances et des armures reste à valider sur Retro.
        Le renvoi des équipements inflige des dégâts en retour sans réduire ceux reçus
        et sans multiplicateur de sagesse. Les renvois de sorts (Contre, Mot d’Épine…)
        sont distincts et ne sont pas encore simulés complètement.
      </p>

      <h3>🎲 Coups critiques et échecs critiques</h3>
      <pre><code>{`base corrigée = max(2, taux de base − bonus CC)
taux CC = max(2, min(base corrigée, floor(base corrigée × 2.9901 / ln(max(0, agilité) + 12))))
probabilité = 1 / taux CC
taux EC = 1/100 sur la plupart des sorts — PA dépensés, aucun effet`}</code></pre>
      <p className="muted small">
        Les bonus CC s’appliquent avant l’agilité. À 0 agilité, 1/40 reste 1/40 ; à 120, il passe à 1/24.
        Pour passer de 1/3, 1/4, 1/5 ou 1/6 à 1/2 : respectivement 8, 42, 134 ou 384 agilité.
        Un coup critique
        utilise la ligne d'effets critiques du sort (les vraies valeurs, pas un simple ×1.3).
        Certains sorts <b>terminent le tour</b> sur un échec critique.
      </p>

      <h3>🪤 Tacle et fuite (jet d'agilité)</h3>
      <pre><code>{`chance de fuite = floor(300 × (agi + 25) / (agi + agi_ennemis + 50)) − 100   // borné [0, 100]
échec → arrêt sur la case de contact, tous les PM perdus, floor(PA × chance / 200) PA perdus`}</code></pre>
      <p className="muted small">
        Agilités égales : 50 %. Échec avec 8 PA : perte de 2 PA.
        Astuce éternelle du kiteur : tirer <i>d'abord</i>, fuir
        <i> ensuite</i> — un tacle raté ne mange alors que des PA déjà dépensés.
        <code>api.tackleInfo()</code> vous donne la probabilité exacte.
      </p>

      <h3>🐌 Retraits de PA/PM et esquive (sagesse)</h3>
      <pre><code>{`attaque = floor(sagesse du lanceur / 4)
défense = floor(sagesse de la cible / 4) + bonus esquive PA ou PM
P(retrait de 1 point) = (attaque / défense) × (points restants / points max) × 50 %, borné [10, 90]`}</code></pre>
      <p className="muted small">
        Chaque point fait l’objet d’un jet séparé ; les retraits réussis rendent les suivants
        plus difficiles. Les bonus d’esquive servent uniquement à défendre.
        Le moteur arrondit la probabilité au pourcentage supérieur et utilise au minimum
        1 pour chaque score : ces détails restent à vérifier sur le serveur officiel.
      </p>

      <h3>💨 Dégâts de poussée</h3>
      <pre><code>{`dégâts bruts = floor( (8 + 1d8 × niveau/50) × cases bloquées )
// bruts: ignorent caractéristiques et résistances`}</code></pre>

      <h3>🩸 Érosion (PvP)</h3>
      <p className="muted small">
        Chaque coup encaissé ronge naturellement 10 % des dégâts en PV max. Les châtiments augmentent ce taux, plafonné à 50 % dans le modèle local. Soigner ne restaure pas
        les PV max : une tortue qui ne conclut pas finit par perdre à la limite de tours.
      </p>

      <h3>⚡ Initiative</h3>
      <pre><code>{`initiative = floor((force + intelligence + chance + agilité + bonus initiative) × (PV actuels / PV max))`}</code></pre>
      <p className="muted small">La vitalité et la sagesse n’ajoutent pas de points d’initiative.</p>

      <h2>Préparer les sorts et les équipements</h2>
      <p>Choisissez le niveau du personnage (1–200), les équipements, les sorts communs
        et les grades avant le combat. Les flèches ou le glisser-déposer changent l’ordre
        de la barre, arme comprise. Ces choix sont sauvegardés par classe et par camp.</p>
      <p>282 sorts de joueur, dont 18 communs, et 1 692 grades proviennent du client.
        Les masques de cible, les invocations et l’IA sont reconstitués ; les limites
        figurent dans le Grimoire et dans <a href="/dofus-local/spell-audit.json">l’audit des sorts</a>.
        La préparation suppose que les sorts et points supplémentaires sont déjà acquis.</p>
      <p>140 des 145 panoplies ont toutes leurs pièces présentes dans le client installé.
        Les cinq restantes sont signalées dans <a href="/dofus-local/equipment-audit.json">l’audit des équipements</a>.
        Montez le niveau pour accéder aux pièces de haut niveau.</p>
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
          <tr><td><code>api.tackleInfo()</code></td><td><code>{'{inContact, escapeChance, paIfTackled}'}</code> si vous fuyez maintenant</td></tr>
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
        <li><a href="https://web.archive.org/web/20080927211957/http://forum.dofus.fr/topic.php?id=176947&amp;lang=fr" target="_blank" rel="noreferrer">Ankama — 1.25 : retrait et esquive PA/PM (archive officielle)</a></li>
        <li><a href="https://web.archive.org/web/20090629221326/http://forum.dofus.com/fr/le-carnet-de-bord-f2/version-1-27-0-t242641-p-20.html" target="_blank" rel="noreferrer">Lichen — 1.27 : tacle et pertes de PA (archive officielle)</a></li>
        <li><a href="https://web.archive.org/web/20091002010716/http://forum.dofus.com/fr/le-carnet-de-bord-f2/version-1-28-t286170.html" target="_blank" rel="noreferrer">Lichen — 1.28 : initiative (archive officielle)</a></li>
        <li><a href="https://dofus.jeuxonline.info/actualite/13512/nouvelle-version-117" target="_blank" rel="noreferrer">Ankama — 1.17, notes reproduites sur JoL : renvoi Prespic</a></li>
        <li><a href="https://www.dofux.org/calcul-cc.dx" target="_blank" rel="noreferrer">DofuX — Calculateur historique des critiques (communautaire)</a></li>
        <li><a href="https://www.dofux.org/calcul-sort.dx" target="_blank" rel="noreferrer">DofuX — Calculateur historique des dégâts (communautaire)</a></li>
        <li><a href="https://www.dofux.org/calcul-soin.dx" target="_blank" rel="noreferrer">DofuX — Calculateur historique des soins (communautaire)</a></li>
      </ul>
    </div>
  );
}

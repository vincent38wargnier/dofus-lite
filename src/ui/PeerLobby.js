import { encounterCapacity } from '../engine/encounters';
import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Copy, Crown, Globe2, Link2, MessageCircle, Plus, Send, Shield, Swords, Users, X } from 'lucide-react';
import { RetroPortrait } from './RetroAssets';
import DuelComposer from './DuelComposer';
import { CLASSES } from '../engine/classes';
import { MAPS } from '../engine/maps';
import { getMonster } from '../engine/monsters';
import { resolveLoadout } from '../engine/equipment';
import { invitationLink, readCode } from '../net/p2p';
import { OPPONENT_DRAG_TYPE } from './opponentTeamStore';
import '../styles/peer.css';

const labels = { preparing: 'Préparation du salon…', waiting: 'En attente de l’hôte', sharing: 'Partage des personnages et des images…', lobby: 'Salon ouvert', playing: 'En ligne', failed: 'Connexion interrompue' };
function UnitPortrait({ member }) {
  const character = member.character, monster = member.customMonster;
  return <RetroPortrait classId={character?.classId} monsterId={monster?.reference.monsterId || member.monsterId}
    artworkId={character?.loadout.artworkId || monster?.artworkId} appearance={character?.loadout.profile?.sex === 1 ? 'female' : 'male'} fallback="✦" />;
}
const unitName = member => member.character?.name || member.customMonster?.name || getMonster(member.monsterId, member.grade).name;
function CharacterCard({ character }) {
  return <div className="peer-character"><UnitPortrait member={{ character }} /><span><strong>{character.name}</strong><small>{CLASSES[character.classId]?.name} · Niv. {character.loadout.level || 200}</small></span></div>;
}
export function PeerChat({ room }) {
  const [text, setText] = useState(''); const messages = useRef(null);
  useEffect(() => { messages.current?.scrollTo(0, messages.current.scrollHeight); }, [room.chat.length]);
  return <div className="peer-chat-content"><div className="peer-messages" ref={messages} role="log" aria-label="Messages du salon">
    {!room.chat.length && <p>Un message avant le combat ?</p>}
    {room.chat.map((message, i) => <p key={i} className={message.own ? 'own' : ''}><strong>{message.own ? 'Vous' : message.name}</strong><span>{message.text}</span></p>)}
  </div><form onSubmit={event => { event.preventDefault(); room.say(text); setText(''); }}>
    <input aria-label="Message au salon" placeholder="Votre message…" maxLength={500} value={text} disabled={!!room.fault} onChange={event => setText(event.target.value)} />
    <button className="btn" type="submit" disabled={!text.trim() || !!room.fault} aria-label="Envoyer le message"><Send size={17} /></button>
  </form></div>;
}
export function PeerFightBar({ room }) {
  return <div className={`peer-fight-bar${room.fault ? ' failed' : ''}`} data-peer-status={room.status} data-peer-sequence={room.sequence} data-peer-hash={room.hash}>
    <span role="status"><span className="peer-status-dot" />{room.fault || room.error || `${room.participants.length} participants · ${room.pending || room.inFlight ? 'Confirmation…' : room.role === 'host' ? 'Vous êtes l’hôte' : 'Combat géré par l’hôte'}`}</span>
    <details className="peer-fight-chat"><summary><MessageCircle size={16} />Discussion{room.chat.length ? ` (${room.chat.length})` : ''}</summary><PeerChat room={room} /></details>
  </div>;
}

export default function PeerLobby({ adventure, profiles, customCharacters = [], customDungeons = [], character, settings, encounterName, initialCode, room, createRoom, onReset, onClose }) {
  const ref = useRef(null), output = useRef(null), dragCandidate = useRef(null);
  const [direction, setDirection] = useState(initialCode ? 'guest' : 'host');
  const [selectedId, setSelectedId] = useState(character.id), [input, setInput] = useState(initialCode || '');
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [typedIp, setTypedIp] = useState(''), [stun, setStun] = useState(true);
  const [catalogue, setCatalogue] = useState(false), [team, setTeam] = useState('A');
  const [gameUrl, setGameUrl] = useState(() => process.env.REACT_APP_PUBLIC_GAME_URL || `${window.location.origin}${window.location.pathname}`);
  const choices = profiles?.length ? profiles : [character], selected = choices.find(p => p.id === selectedId) || character;
  const summary = resolveLoadout(selected.classId, selected.loadout);
  const restricted = !!room?.settings?.adventure;
  const readyAdventure = direction === 'host' && !!adventure;
  const connected = room?.confirmed, host = room?.role === 'host';
  const customMonsters = [...new Map(customDungeons.flatMap(d => (d.rooms || [d]).flatMap(r => r.members.filter(m => m.customMonster).map(m => [m.customMonster.key, m])))).values()];
  useEffect(() => {
    const dialog = ref.current, previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => { if (initialCode) { setInput(initialCode); if (!room) setDirection('guest'); } }, [initialCode]); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async work => {
    setError(''); setNotice(''); setBusy(true);
    try { await work(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const execute = () => run(async () => {
    if (host && room.code) { await room.complete(input); setInput(''); return; }
    if (direction === 'guest') readCode(input, 'offer');
    const next = createRoom({ role: direction, character: selected });
    if (direction === 'host') await next.invite({ stun, typedIp }); else await next.join(input, { stun, typedIp });
    setInput('');
  });
  let link = '', localUrl = false;
  try { localUrl = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(gameUrl).hostname); if (room?.code) link = invitationLink(room.code, gameUrl); } catch (_) { /* Copy reports invalid URLs. */ }
  const copy = async codeOnly => {
    try { await navigator.clipboard.writeText(codeOnly ? room.code : invitationLink(room.code, gameUrl)); setNotice('Copié. Envoyez-le à votre ami.'); }
    catch (_) { output.current?.select(); setNotice('Sélectionnez le lien, puis copiez-le avec Ctrl+C ou ⌘C.'); }
  };
  const reset = () => { onReset(); setError(''); setNotice(''); setInput(''); setBusy(false); setCatalogue(false); };
  const add = (entry, target = team) => run(() => room.addUnit(entry, target));
  const configure = (unit, patch) => run(() => room.edit({ kind: 'configure', id: unit.id, team: unit.team, controller: unit.controller, owner: unit.owner, ...patch }));
  const locked = busy || !!room?.pending || !!room?.fault || room?.updating;
  return <dialog ref={ref} className={`peer-lobby${connected ? ' shared-room' : ''}`} aria-labelledby="peer-title" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><p className="eyebrow"><Users size={15} /> JOUER ENSEMBLE</p><h2 id="peer-title">{connected ? 'Votre salon de combat' : 'Jouer avec des amis'}</h2>
      <p>{connected ? 'Composez les équipes. L’hôte lance le combat.' : 'Un hôte, vos amis et tous vos personnages.'}</p></div>
      <button type="button" className="btn peer-close" aria-label="Fermer le salon" onClick={onClose}><X size={23} /></button></header>
    <div className="peer-lobby-body">
      {!room && <>
        <div className="peer-tabs" role="group" aria-label="Connexion avec des amis"><button type="button" aria-pressed={direction === 'host'} onClick={() => setDirection('host')}><Crown size={18} />Créer un salon</button><button type="button" aria-pressed={direction === 'guest'} onClick={() => setDirection('guest')}><ArrowRight size={18} />Rejoindre un salon</button></div>
        {!readyAdventure && <section><h3>Votre premier personnage</h3><div className="peer-characters">{choices.map(choice => <button type="button" key={choice.id || choice.name} aria-pressed={selected === choice} onClick={() => setSelectedId(choice.id)}><CharacterCard character={choice} />{selected === choice && <Check size={17} />}</button>)}</div></section>}
        {direction === 'host' ? <div className="peer-encounter"><Shield size={26} /><div><strong>{settings.mode === 'duel' ? 'Duel entre amis' : 'Aventure en équipe'}</strong><p>{encounterName}</p><small>{readyAdventure ? 'Les héros sont fournis. Invitez vos amis puis attribuez-leur un héros. Le groupe et les équipements restent ceux de l’auteur.' : 'Vous pourrez tous ajouter des personnages et des monstres, choisir leur camp et leur contrôle. 8 combattants maximum par équipe.'}</small></div></div>
          : <label className="field">Invitation de l’hôte<textarea autoFocus rows={3} aria-label="Invitation de votre ami" placeholder="Collez le lien ou le code RT1.…" value={input} onChange={event => setInput(event.target.value)} /></label>}
      </>}
      {room && <div className={`peer-status${room.fault ? ' failed' : ''}`} role="status" data-peer-status={room.status}><span className="peer-status-dot" /><strong>{labels[room.status]}</strong>{host && <small>Vous êtes l’hôte</small>}</div>}
      {host && room.invitation && !room.code && <div className="peer-section-heading"><p className="peer-help" role="status">Création du lien d’invitation…</p><button type="button" className="btn" onClick={() => room.cancelInvite()}>Annuler l’invitation</button></div>}
      {connected && <>
        <div className="peer-participants">{room.participants.map(p => <div key={p.id} className={`peer-participant${p.ready ? ' ready' : ''}`} data-participant={p.id}>
          {p.id === 'host' ? <Crown size={16} /> : <Users size={16} />}<span><strong>{p.name}{p.id === room.selfId ? ' · Vous' : ''}</strong><small>{!p.connected ? 'Déconnecté' : p.id === 'host' ? 'Hôte' : p.ready ? 'Prêt' : 'Se prépare'}</small></span>
          {host && p.id !== 'host' && <button type="button" disabled={locked} aria-label={`Retirer le participant ${p.name}`} onClick={() => run(() => room.removeParticipant(p.id))}><X size={14} /></button>}
        </div>)}{host && !room.invitation && room.participants.length < 8 && <button type="button" className="btn" disabled={locked} onClick={() => run(() => room.invite({ stun, typedIp }))}><Link2 size={16} />Inviter un ami</button>}</div>
        {restricted && <p className="peer-help"><strong>Aventure prête à jouer</strong> · L’hôte répartit les héros avec « Configurer → Joueur ». Les équipements, les camps et les ennemis sont imposés.</p>}
        <p className="peer-map"><Globe2 size={15} />{(room.settings.battlefield?.name || MAPS[room.settings.mapId]?.name)?.replace(/^🗺\s*/, '')}<span>Le combat tourne chez l’hôte</span></p>
      </>}
      {room?.code && (host ? room.invitation : !connected) && <section className="peer-share">
        <div className="peer-section-heading"><h3>{host ? 'Invitez un ami · un lien par invité' : 'Renvoyez cette réponse à l’hôte'}</h3>{host && <button type="button" className="btn" onClick={() => room.cancelInvite()}>Annuler l’invitation</button>}</div>
        <textarea ref={output} rows={2} readOnly aria-label={host ? 'Lien d’invitation' : 'Lien de réponse'} value={link || room.code} onFocus={event => event.target.select()} />
        <div className="peer-share-actions"><button className="btn primary" type="button" onClick={() => copy(false)}><Copy size={16} />Copier le lien</button><button className="btn" type="button" onClick={() => copy(true)}>Copier le code</button></div>
        {host ? <div className="peer-answer"><label className="field">Collez la réponse de votre ami<textarea rows={2} aria-label="Réponse de votre ami" value={input} onChange={event => setInput(event.target.value)} /></label><button type="button" className="btn primary" disabled={busy || !input.trim() || room.pc?.signalingState !== 'have-local-offer'} onClick={execute}>Connecter l’invité</button></div>
          : <p>L’hôte colle la réponse dans son onglet d’origine. Gardez cette page ouverte.</p>}
        <details className="peer-address"><summary>Adresse du jeu pour le lien</summary><label className="field">URL accessible à vos amis<input aria-label="Adresse du jeu" type="url" value={gameUrl} onChange={event => setGameUrl(event.target.value)} /></label></details>
        {localUrl && <p className="peer-help">Ce lien ouvre le jeu local de votre ami. S’il ne l’a pas, utilisez une adresse HTTPS partagée. Le lien P2P ne publie pas le site.</p>}
      </section>}
      {connected && <>
        <div className="peer-teams">{['A', 'B'].map(target => <section key={target} className={`peer-team team-${target}`} aria-label={`Équipe ${target}`} data-peer-team={target}
          onDragOver={e => { if (!locked && !restricted && dragCandidate.current && Array.from(e.dataTransfer.types).includes(OPPONENT_DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
          onDrop={e => { e.preventDefault(); if (!locked && !restricted && dragCandidate.current) add(dragCandidate.current, target); }}>
          <div className="peer-section-heading"><h3>{target === 'A' ? <Shield size={19} /> : <Swords size={19} />}Équipe {target}<span>{room.units.filter(u => u.team === target).length}/{encounterCapacity(room.settings.encounter, target)}</span></h3>{!restricted && <button type="button" className="btn" disabled={locked || room.units.filter(u => u.team === target).length >= encounterCapacity(room.settings.encounter, target)} onClick={() => { setTeam(target); setCatalogue(true); }} aria-label={`Ajouter à l’équipe ${target}`}><Plus size={17} /></button>}</div>
          {room.units.filter(u => u.team === target).map(unit => {
            const editable = (host || unit.owner === room.selfId) && (!restricted || unit.team === 'A'), name = unitName(unit.member), owner = room.participants.find(p => p.id === unit.owner);
            return <article className="peer-unit" key={unit.id} data-peer-unit={unit.id}><UnitPortrait member={unit.member} /><div><strong>{name}</strong><small>{owner?.name} · {unit.controller === 'ai' ? 'IA' : 'Manuel'}</small>
              {editable && <details><summary>Configurer</summary><div className="peer-unit-settings">{!restricted && <label>Camp<select aria-label={`Camp de ${name}`} disabled={locked} value={unit.team} onChange={e => configure(unit, { team: e.target.value })}><option>A</option><option>B</option></select></label>}
                <label>Contrôle<select aria-label={`Contrôle de ${name}`} disabled={locked} value={unit.controller} onChange={e => configure(unit, { controller: e.target.value })}><option value="player">Manuel</option>{(!restricted || room.settings.adventure.allowAI) && <option value="ai">IA</option>}</select></label>
                {host && <label>Joueur<select aria-label={`Joueur de ${name}`} disabled={locked} value={unit.owner} onChange={e => configure(unit, { owner: e.target.value })}>{room.participants.map(p => <option key={p.id} value={p.id} disabled={!p.connected}>{p.name}</option>)}</select></label>}
              </div></details>}</div>{editable && !restricted && <button type="button" className="peer-remove-unit" disabled={locked} aria-label={`Retirer ${name}`} onClick={() => run(() => room.edit({ kind: 'remove', id: unit.id }))}><X size={15} /></button>}</article>;
          })}
          {!room.units.some(u => u.team === target) && <p className="peer-empty">Ajoutez un personnage ou un monstre.</p>}
        </section>)}</div>
        {catalogue && !restricted && <section className="peer-catalogue"><div className="peer-section-heading"><h3>Ajouter des combattants</h3><button type="button" className="btn" onClick={() => setCatalogue(false)} aria-label="Fermer le catalogue"><X size={17} /></button></div>
          <div className="peer-tabs" role="group" aria-label="Camp des nouveaux combattants">{['A', 'B'].map(t => <button type="button" key={t} aria-pressed={team === t} onClick={() => setTeam(t)}>Ajouter à l’équipe {t}</button>)}</div>
          <DuelComposer profiles={choices} customCharacters={customCharacters} opponents={[]} mapId={room.settings.mapId} hideTerrain allied allBots={[]}
            onAddCandidate={entry => add(entry)} onCandidateDrag={entry => { dragCandidate.current = entry; }} catalogueFull={locked || room.units.filter(u => u.team === team).length >= encounterCapacity(room.settings.encounter, team)} />
          {!!customMonsters.length && <div className="peer-custom-monsters"><h3>Mes créatures personnalisées</h3>{customMonsters.map(m => <button className="btn" type="button" key={m.customMonster.key} disabled={locked} onClick={() => add(m)}><Plus size={15} />{m.customMonster.name}</button>)}</div>}
        </section>}
        <details className="peer-lobby-chat"><summary><MessageCircle size={16} />Discussion du salon{room.chat.length ? ` (${room.chat.length})` : ''}</summary><PeerChat room={room} /></details>
        <p className="peer-help">Les créations reçues restent dans ce salon. Chaque changement d’équipe demande aux invités de confirmer à nouveau qu’ils sont prêts.</p>
      </>}
      {(!room || host) && <details className="peer-advanced"><summary><Globe2 size={16} />Options réseau</summary><label className="peer-check"><input type="checkbox" checked={stun} onChange={e => setStun(e.target.checked)} />Trouver mon adresse automatiquement (STUN)</label>
        <label className="field">Mon IP directe · facultatif<input aria-label="Mon IP directe" placeholder="IPv6 ou IP du réseau local" value={typedIp} onChange={e => setTypedIp(e.target.value.trim())} /><small>Une IP saisie désactive STUN.</small></label></details>}
      {!connected && <p className="peer-help">Sans serveur de connexion : envoyez l’invitation, votre ami renvoie sa réponse, puis vous la collez ici. Certains réseaux bloquent les connexions directes.</p>}
      {(error || room?.fault || room?.error || (!room && !summary.valid)) && <p className="loadout-errors" role="alert">{error || room?.fault || room?.error || summary.errors.join(' ')}</p>}
      {notice && <p className="peer-notice" role="status">{notice}</p>}
    </div>
    <footer><button type="button" className="btn" onClick={room ? reset : onClose}><ArrowLeft size={16} />{room ? 'Quitter le salon' : 'Retour au combat'}</button>
      {connected ? <div className="peer-launch"><small>{host ? room.canStart ? 'Tout le monde est prêt' : 'Deux camps · invités prêts · invitation terminée' : 'Seul l’hôte lance le combat'}</small><button type="button" className="btn primary" disabled={locked || (host && !room.canStart)} onClick={() => host ? run(() => room.start()) : room.readyLobby()}>
        {host ? <Swords size={18} /> : <Check size={18} />}{host ? 'Lancer le combat' : room.localReady ? 'Prêt · Modifier' : 'Je suis prêt'}</button></div>
        : <button type="button" className="btn primary" disabled={busy || !!room || !summary.valid || (direction === 'guest' && !input.trim())} onClick={execute}>{busy ? 'Préparation…' : room ? 'Connexion en cours…' : direction === 'host' ? 'Créer le salon' : 'Créer ma réponse'}<ArrowRight size={17} /></button>}
    </footer>
  </dialog>;
}

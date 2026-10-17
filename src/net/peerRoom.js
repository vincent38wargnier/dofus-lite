import { dungeonEncounter, encounterCapacity } from '../engine/encounters';
import { adventureEnabled, adventureTeam } from '../engine/adventures';
import { allyTeamErrors } from '../engine/allyTeam';
import { opponentTeamErrors } from '../engine/opponentTeam';
import { customDungeonErrors } from '../engine/customDungeons';
import { dungeonRoom, roomVictory } from '../engine/dungeonCampaign';
import { COMBAT_RULES_VERSION } from '../engine/engine';
import { dungeonMapId, dungeonRoster } from '../engine/dungeons';
import { KANOJEDO_MAP_ID, POUTCH_ID } from '../engine/monsters';
import { TURN_SECONDS } from '../game/liveMatch';
import { PeerMatch, peerSettings, stateHash, canonical } from '../game/peerMatch';
import { acceptInvite, createInvite, completeInvite, check, selectedPath } from './p2p';
import { JsonChannel, MAX_MESSAGE_CHARS } from './jsonChannel';
import { MAX_ROOM_ARCHIVE_CHARS, packPeerUnit, unpackPeerUnit, stagePeerContent } from './content';

export const MAX_PARTICIPANTS = 8;
export function peerBuildId() {
  const source = [...document.scripts].map(script => script.src).find(src => /\/static\/js\/main\.[^/]+\.js/.test(src));
  return source ? new URL(source).pathname.split('/').pop() : `development-rules-${COMBAT_RULES_VERSION}`;
}
const resultPending = () => ({ ok: true, pending: true, events: null });
const side = value => check(['A', 'B'].includes(value), 'Camp inconnu.');
const control = value => check(['player', 'ai'].includes(value), 'Contrôle inconnu.');

// Star topology: guests have ONE link to the host. Only that host mutates the
// combat. Each connection is bound to a participant, never a claimed actor ID.
export class PeerRoom {
  constructor({ role, character, settings, dungeon, roomIndex = 0, adventureChoice, team, opponents, build = peerBuildId(), onChange = () => {}, onStart = () => {}, onEvents = () => {}, contentDependencies = {} }) {
    this.role = role; this.selfId = role === 'host' ? 'host' : null; this.character = character;
    if (role === 'host' && team != null) { const errors = allyTeamErrors(team, false); check(!errors.length, errors.join(' ')); }
    this.initialTeam = team == null ? null : JSON.parse(JSON.stringify(team));
    if (role === 'host' && settings?.mode === 'duel' && opponents?.length) { const errors = opponentTeamErrors(opponents, settings.encounter); check(!errors.length, errors.join(' ')); }
    this.initialOpponents = opponents == null ? null : JSON.parse(JSON.stringify(opponents));
    if (role === 'host' && settings?.mode === 'custom' && dungeon?.rooms) { const errors = customDungeonErrors(dungeon); check(!errors.length, errors.join(' ')); }
    this.campaign = role === 'host' && settings?.mode === 'custom' && dungeon?.rooms ? { dungeon: JSON.parse(JSON.stringify(dungeon)), roomIndex } : null;
    if (this.campaign) dungeon = dungeonRoom(dungeon, roomIndex);
    this.settings = role === 'host' ? peerSettings(dungeon && settings?.mode === 'custom'
      ? { ...settings, mapId: dungeon.mapId, battlefield: dungeon.battlefield, encounter: dungeonEncounter(dungeon) } : settings) : null; this.dungeon = dungeon; this.adventureChoice = adventureChoice; this.build = build;
    this.onChange = onChange; this.onStart = onStart; this.onEvents = onEvents; this.contentDependencies = contentDependencies;
    this.status = 'preparing'; this.error = ''; this.fault = ''; this.closed = false;
    this.links = new Map(); this.units = []; this.participants = []; this.assets = new Map(); this.chat = [];
    this.inbox = Promise.resolve(); this.sequence = 0; this.revision = 0; this.unitCounter = 0; this.guestCounter = 0;
    this.requestId = 0; this.pending = null; this.inFlight = false; this.awaiting = new Set(); this.updating = false;
    if (this.campaign) this.settings.campaign = this.campaignInfo();
  }
  campaignInfo() {
    const { dungeon, roomIndex } = this.campaign, room = dungeonRoom(dungeon, roomIndex);
    return { title: dungeon.name, name: room.name, intro: room.intro || '', outro: room.outro || '', roomIndex, count: dungeon.rooms.length };
  }
  changed() { if (!this.closed) this.onChange(this); }
  get confirmed() { return this.status === 'lobby' || this.status === 'playing'; }
  get localReady() { return !!this.participants.find(p => p.id === this.selfId)?.ready; }
  get code() { return this.invitation?.code || ''; }
  get pc() { return this.invitation?.pc; }
  get available() { return this.status === 'playing' && !this.closed && !this.fault && !this.pending && !this.inFlight; }
  get canStart() {
    return this.role === 'host' && this.status === 'lobby' && !this.updating && !this.invitation && this.participants.length >= 2
      && this.participants.every(p => p.connected && (p.id === 'host' || (p.ready && this.links.get(p.id)?.loaded === this.revision)))
      && ['A', 'B'].every(team => this.units.some(u => u.team === team));
  }
  queue(task) {
    const result = this.inbox.then(() => { check(!this.closed && !this.fault, 'Salon fermé.'); return task(); });
    this.inbox = result.catch(() => {}); return result;
  }
  async prepare() {
    if (this.prepared) return;
    this.prepared = true;
    if (this.role === 'guest') { this.archive = await packPeerUnit(this.character); return; }
    this.participants = [{ id: 'host', name: this.character.name, connected: true, ready: false }];
    const mode = this.settings.mode;
    if (mode === 'boss') this.settings.mapId = dungeonMapId(this.settings.bossId);
    if (mode === 'kanojedo') this.settings.mapId = KANOJEDO_MAP_ID;
    if (mode === 'custom') this.settings.mapId = this.dungeon?.mapId;
    const battlefield = mode === 'custom' ? this.dungeon?.battlefield : mode === 'duel' ? this.settings.battlefield : null;
    if (battlefield) {
      const archive = await packPeerUnit(this.character, battlefield);
      const content = await unpackPeerUnit(archive, 'u0', this.contentDependencies);
      check(!this.closed, 'Salon fermé.');
      this.mapAsset = { ...content, archive, cleanup: stagePeerContent(content) };
      this.settings.battlefield = content.battlefield;
    }
    this.settings = peerSettings(this.settings);
    if (this.initialTeam) {
      for (const member of this.initialTeam) await this.addArchive(await packPeerUnit(member), 'host', 'A', member.controller);
    } else if (mode === 'custom' && adventureEnabled(this.dungeon)) {
      const errors = customDungeonErrors(this.dungeon); check(!errors.length, errors.join(' '));
      const team = adventureTeam(this.dungeon, this.adventureChoice);
      this.settings.adventure = { name: this.dungeon.name, allowAI: this.dungeon.adventure.allowAI };
      for (const hero of team) await this.addArchive(await packPeerUnit(hero), 'host', 'A', hero.controller);
    } else await this.addArchive(await packPeerUnit(this.character), 'host', 'A', 'player');
    const enemies = mode === 'custom' ? this.dungeon.members.flatMap(m => Array.from({ length: m.count }, () => ({ ...m, count: 1 })))
      : mode === 'boss' ? dungeonRoster(this.settings.bossId, this.settings.bossGrade, this.settings.seed)
        : mode === 'kanojedo' ? [{ monsterId: POUTCH_ID, grade: this.settings.monsterGrade }] : this.initialOpponents || [];
    for (const entry of enemies) await this.addArchive(await packPeerUnit(entry), 'host', 'B', 'ai');
    if (this.settings.encounter?.commanderId) {
      const index = this.settings.encounter.commanderId === 'B' ? 0 : Number(this.settings.encounter.commanderId.slice(1)) - 1;
      this.commanderUnit = this.units.filter(u => u.team === 'B')[index]?.id;
    }
    if (this.settings.adventure) this.adventureRoster = canonical(this.units.map(({ id, team, member }) => ({ id, team, member })));
    this.status = 'lobby'; this.revision = 1; this.startTick(); this.changed();
  }
  newLink(id) {
    const link = { id, abort: new AbortController(), known: new Set(), loaded: 0, lastRequest: 0, lastReceived: Date.now(), hello: false, disposed: false };
    this.links.set(id, link); return link;
  }
  options(link, options) {
    return { ...options, signal: link.abort.signal, onPeer: pc => { link.pc = pc; }, onChannel: channel => this.attach(link, channel),
      onState: state => { link.state = state; if (['disconnected', 'failed', 'closed'].includes(state)) this.lost(link); else this.changed(); } };
  }
  async invite(options = {}) {
    check(this.role === 'host' && !this.match, 'Seul l’hôte peut inviter avant le combat.');
    await this.prepare();
    check(!this.invitation && this.links.size < MAX_PARTICIPANTS - 1, 'Annulez l’invitation en cours ou retirez un invité. Maximum 8 participants.');
    const link = this.newLink(`guest-${++this.guestCounter}`); this.invitation = link; this.changed();
    try {
      const result = await createInvite(this.options(link, options));
      check(!this.closed && !link.disposed, 'Invitation annulée.'); link.code = result.code;
      link.expiry = setTimeout(() => { if (this.invitation === link) { this.cancelInvite(); this.error = 'Invitation expirée. Créez un nouveau lien.'; this.changed(); } }, 600000);
      this.changed(); return link.code;
    } catch (error) { this.cancelInvite(); throw error; }
  }
  cancelInvite() {
    if (!this.invitation) return;
    const link = this.invitation; this.invitation = null; this.dispose(link); this.links.delete(link.id); this.changed();
  }
  async join(code, options = {}) {
    check(this.role === 'guest' && !this.links.size, 'Connexion déjà ouverte.'); await this.prepare();
    const link = this.newLink('host'); this.invitation = link;
    const result = await acceptInvite(code, this.options(link, options));
    check(!this.closed, 'Connexion annulée.'); link.code = result.code;
    if (!this.confirmed) this.status = 'waiting'; this.changed();
    link.expiry = setTimeout(() => this.fail(new Error('Réponse expirée. Demandez une nouvelle invitation.')), 600000);
    return link.code;
  }
  async complete(code) {
    check(this.role === 'host' && this.invitation, 'Aucune invitation en attente.');
    await completeInvite(this.invitation.pc, code); this.invitation.state = 'connecting'; this.changed();
  }
  attach(link, channel) {
    if (this.closed || link.disposed) { channel.close(); return; }
    link.channel = channel;
    link.activity = () => { link.lastReceived = Date.now(); };
    channel.addEventListener('message', link.activity);
    link.wire = new JsonChannel(channel, (message, size) => {
      link.lastReceived = Date.now();
      link.queued = (link.queued || 0) + 1; this.queuedChars = (this.queuedChars || 0) + size;
      if (link.queued > 16 || this.queuedChars > MAX_MESSAGE_CHARS * 2) {
        link.queued--; this.queuedChars -= size;
        this.protocolError(link, new Error('Trop de données en attente. Attendez la fin du partage.')); return;
      }
      this.queue(() => this.receive(link, message)).catch(error => this.protocolError(link, error))
        .finally(() => { link.queued--; this.queuedChars -= size; });
    }, error => this.protocolError(link, error));
    const open = () => {
      if (link.opened || this.closed || link.disposed) return;
      link.opened = true; link.lastReceived = Date.now(); this.startTick();
      if (this.role === 'guest') { this.status = 'sharing'; this.send(link, { t: 'hello', protocol: 2, build: this.build, rules: COMBAT_RULES_VERSION, archive: this.archive }); }
      else this.send(link, { t: 'welcome', protocol: 2, build: this.build, rules: COMBAT_RULES_VERSION, selfId: link.id });
      link.handshake = setTimeout(() => this.protocolError(link, new Error('Le partage ne répond plus. Recréez une invitation.')), 120000);
      selectedPath(link.pc).then(path => { link.path = path; this.changed(); }).catch(() => {}); this.changed();
    };
    channel.addEventListener('open', open, { once: true });
    channel.addEventListener('close', () => this.lost(link), { once: true });
    channel.addEventListener('error', () => this.lost(link), { once: true });
    if (channel.readyState === 'open') open();
  }
  send(link, message) {
    if (this.closed || this.fault || link.disposed) return Promise.resolve();
    return link.wire.send(message).catch(error => this.protocolError(link, error));
  }
  broadcast(message) { return Promise.all([...this.links.values()].filter(l => l.hello && !l.disposed).map(l => this.send(l, message))); }
  async addArchive(archive, owner, team, controller) {
    side(team); control(controller);
    check(this.units.filter(u => u.team === team).length < encounterCapacity(this.settings.encounter, team), `Ce camp contient déjà ${encounterCapacity(this.settings.encounter, team)} combattants.`);
    check(typeof archive === 'string' && this.units.reduce((n, u) => n + this.assets.get(u.id).archive.length, archive.length + (this.mapAsset?.archive.length || 0)) <= MAX_ROOM_ARCHIVE_CHARS,
      'Le salon dépasse 32 Mio de créations. Réduisez les images ou le nombre de combattants.');
    const id = `u${++this.unitCounter}`;
    const content = await unpackPeerUnit(archive, id, this.contentDependencies); check(!this.closed, 'Salon fermé.');
    this.assets.set(id, { ...content, archive, cleanup: stagePeerContent(content) });
    const unit = { id, owner, team, controller, member: content.member }; this.units.push(unit); return unit;
  }
  async publishRoster() {
    if (this.settings.encounter) {
      const index = this.units.filter(u => u.team === 'B').findIndex(u => u.id === this.commanderUnit);
      this.settings.encounter = { version: 1, mode: 'army', ...(index < 0 ? {} : { commanderId: index ? `B${index + 1}` : 'B' }) };
    }
    this.revision++; this.participants.forEach(p => { p.ready = false; });
    await Promise.all([...this.links.values()].filter(l => l.hello && !l.disposed).map(async link => {
      const units = this.units.map(({ member, ...meta }) => ({ ...meta, ...(!link.known.has(meta.id) ? { archive: this.assets.get(meta.id).archive } : {}) }));
      await this.send(link, { t: 'lobby', revision: this.revision, settings: this.settings, participants: this.participants, units,
        ...(this.mapAsset && !link.mapKnown ? { battlefieldArchive: this.mapAsset.archive } : {}) });
      link.mapKnown = !!this.mapAsset;
      this.units.forEach(u => link.known.add(u.id));
    }));
    this.changed();
  }
  async receive(link, message) {
    if (link.disposed) return;
    check(message && typeof message === 'object' && typeof message.t === 'string', 'Message P2P invalide.');
    if (message.t === 'hello' || message.t === 'welcome') {
      check(!link.hello && message.protocol === 2 && message.build === this.build && message.rules === COMBAT_RULES_VERSION,
        'Tous les participants doivent utiliser la même version du jeu. Rechargez les pages.');
      check(message.t === (this.role === 'host' ? 'hello' : 'welcome'), 'Rôle P2P invalide.');
      if (this.role === 'guest') { check(/^guest-\d+$/.test(message.selfId), 'Identité invalide.'); this.selfId = message.selfId; link.hello = true; return; }
      const team = this.settings.mode === 'duel' ? 'B' : 'A';
      // A full default camp must not prevent joining: the guest can choose the
      // other side or replace a unit after entering the shared room.
      const content = await unpackPeerUnit(message.archive, `u${this.unitCounter + 1}`, this.contentDependencies);
      check(!link.disposed && !this.closed, 'Connexion annulée.');
      const name = content.member.character?.name; check(name, 'Choisissez un personnage pour rejoindre.');
      if (!this.settings.adventure && this.units.filter(u => u.team === team).length < 8) await this.addArchive(message.archive, link.id, team, 'player');
      this.participants.push({ id: link.id, name, connected: true, ready: false }); link.hello = true;
      clearTimeout(link.expiry); if (this.invitation === link) this.invitation = null;
      await this.publishRoster(); return;
    }
    if (message.t === 'fault') { throw new Error(typeof message.reason === 'string' ? message.reason.slice(0, 240) : 'La connexion a été interrompue.'); }
    if (message.t === 'leave') { this.lost(link); return; }
    check(link.hello, 'Connexion non vérifiée.');
    if (message.t === 'ping') { await this.send(link, { t: 'pong' }); return; }
    if (message.t === 'pong') return;
    if (message.t === 'lobby') {
      const nextChapter = this.match?.over && this.settings.campaign && message.settings?.campaign
        && (message.settings.campaign.roomIndex === this.settings.campaign.roomIndex
          || roomVictory(this.match.state) && message.settings.campaign.roomIndex === this.settings.campaign.roomIndex + 1);
      check(this.role === 'guest' && (!this.match || nextChapter) && Number.isInteger(message.revision) && message.revision > this.revision, 'Révision du salon invalide.');
      const settings = peerSettings(message.settings), participants = message.participants;
      if (nextChapter) { this.match = null; this.pending = null; clearTimeout(this.actionTimeout); this.mapAsset?.cleanup(); this.mapAsset = null; }
      if (settings.battlefield && !this.mapAsset) {
        const content = await unpackPeerUnit(message.battlefieldArchive, 'u0', this.contentDependencies);
        check(!this.closed && canonical(content.battlefield) === canonical(settings.battlefield), 'Décor partagé incompatible avec le terrain.');
        this.mapAsset = { ...content, archive: message.battlefieldArchive, cleanup: stagePeerContent(content) };
      }
      check(!settings.battlefield || canonical(this.mapAsset?.battlefield) === canonical(settings.battlefield), 'Terrain partagé incohérent.');
      check(Array.isArray(participants) && participants.length <= MAX_PARTICIPANTS && participants.some(p => p.id === this.selfId)
        && participants.every(p => typeof p.id === 'string' && typeof p.name === 'string' && p.name.length <= 80)
        && new Set(participants.map(p => p.id)).size === participants.length, 'Participants invalides.');
      check(Array.isArray(message.units) && message.units.length <= 8 + encounterCapacity(settings.encounter) && new Set(message.units.map(u => u.id)).size === message.units.length, 'Groupe invalide.');
      const next = []; let bytes = this.mapAsset?.archive.length || 0;
      for (const meta of message.units) {
        side(meta.team); control(meta.controller); check(participants.some(p => p.id === meta.owner), 'Propriétaire inconnu.');
        let asset = this.assets.get(meta.id);
        bytes += (asset?.archive || meta.archive || '').length; check(bytes <= MAX_ROOM_ARCHIVE_CHARS, 'Salon trop volumineux.');
        if (!asset) { const content = await unpackPeerUnit(meta.archive, meta.id, this.contentDependencies);
          check(!this.closed, 'Salon fermé.'); asset = { ...content, archive: meta.archive, cleanup: stagePeerContent(content) }; this.assets.set(meta.id, asset); }
        next.push({ id: meta.id, team: meta.team, owner: meta.owner, controller: meta.controller, member: asset.member });
      }
      check(['A', 'B'].every(team => next.filter(u => u.team === team).length <= encounterCapacity(settings.encounter, team)), 'Camp trop grand.');
      this.units = next; this.pruneAssets(); this.settings = settings; this.participants = participants; this.revision = message.revision;
      this.status = 'lobby'; this.invitation = null; clearTimeout(link.expiry); clearTimeout(link.handshake);
      await this.send(link, { t: 'loaded', revision: this.revision }); this.changed(); return;
    }
    if (message.t === 'loaded') {
      check(this.role === 'host' && Number.isInteger(message.revision) && message.revision <= this.revision, 'Chargement invalide.');
      link.loaded = message.revision; clearTimeout(link.handshake); this.changed(); return;
    }
    if (message.t === 'participants') {
      check(this.role === 'guest' && Array.isArray(message.participants) && message.participants.length <= MAX_PARTICIPANTS, 'Participants invalides.');
      this.participants = message.participants; this.changed(); return;
    }
    if (message.t === 'ready') {
      check(this.role === 'host' && this.status === 'lobby' && message.revision === this.revision && link.loaded === this.revision, 'Attendez le partage des dernières modifications.');
      this.participants.find(p => p.id === link.id).ready = !!message.ready; await this.broadcast({ t: 'participants', participants: this.participants }); this.changed(); return;
    }
    if (message.t === 'edit') {
      check(this.role === 'host' && this.status === 'lobby', 'Préparation terminée.');
      this.checkRequest(link, message.id);
      this.updating = true; this.changed();
      try { await this.mutate(message.change, link.id); await this.send(link, { t: 'edited', id: message.id }); }
      catch (e) { await this.send(link, { t: 'reject', id: message.id, reason: e.message }); }
      finally { this.updating = false; this.changed(); }
      return;
    }
    if (message.t === 'edited' || message.t === 'reject') {
      check(this.role === 'guest' && this.pending?.id === message.id, 'Réponse inattendue.');
      this.pending = null; clearTimeout(this.actionTimeout);
      this.error = message.t === 'reject' ? String(message.reason).slice(0, 240) : ''; this.changed(); return;
    }
    if (message.t === 'start') {
      check(this.role === 'guest' && this.status === 'lobby' && this.localReady && message.revision === this.revision, 'Lancement non autorisé.');
      check(stateHash(message.state) === message.hash, 'État du combat corrompu.');
      this.match = new PeerMatch(this.settings, this.units, this.selfId, { state: message.state, events: message.events }); this.match.room = this;
      this.hash = message.hash; this.sequence = 0; this.begin(); await this.send(link, { t: 'ack', seq: 0, hash: this.hash }); return;
    }
    if (message.t === 'chat') {
      check(typeof message.text === 'string' && message.text.length <= 500, 'Message trop long.');
      if (this.role === 'host') {
        const now = Date.now(); link.chatTimes = (link.chatTimes || []).filter(t => t > now - 5000);
        check(link.chatTimes.length < 15, 'Trop de messages.'); link.chatTimes.push(now);
        this.deliverChat(link.id, message.text);
      } else { check(this.participants.some(p => p.id === message.author), 'Auteur inconnu.'); this.appendChat(message.author, message.text); }
      return;
    }
    check(this.status === 'playing', 'Le combat n’a pas commencé.');
    if (message.t === 'request') {
      check(this.role === 'host', 'Seul l’hôte reçoit les actions.'); this.checkRequest(link, message.id);
      if (this.inFlight) { check(!link.deferred, 'Trop d’actions en attente.'); link.deferred = message; }
      else await this.acceptRequest(link, message);
      return;
    }
    if (message.t === 'snapshot') {
      check(this.role === 'guest' && message.seq === this.sequence + 1 && message.before === this.hash, 'Séquence de combat incohérente.');
      check(message.state?.rulesVersion === COMBAT_RULES_VERSION && stateHash(message.state) === message.hash && Array.isArray(message.events), 'État du combat corrompu.');
      if (message.actor === this.selfId && message.requestId != null) {
        check(this.pending?.id === message.requestId, 'Action reçue sans votre demande.'); this.pending = null; clearTimeout(this.actionTimeout);
      }
      this.match.state = message.state; this.hash = message.hash; this.sequence = message.seq; this.syncClock(message.remaining);
      await this.send(link, { t: 'ack', seq: this.sequence, hash: this.hash }); this.onEvents(message.events); this.changed(); return;
    }
    if (message.t === 'ack') {
      check(this.role === 'host' && this.awaiting.has(link.id) && message.seq === this.sequence && message.hash === this.hash, 'Confirmation de combat incohérente.');
      this.awaiting.delete(link.id); this.inFlight = this.awaiting.size > 0;
      if (!this.inFlight) {
        clearTimeout(this.actionTimeout);
        for (const next of this.links.values()) if (next.deferred && !this.inFlight) {
          const request = next.deferred; next.deferred = null; await this.acceptRequest(next, request);
        }
      }
      this.changed(); return;
    }
    throw new Error('Message P2P inconnu.');
  }
  checkRequest(link, id) { check(Number.isSafeInteger(id) && id > link.lastRequest, 'Requête dupliquée.'); link.lastRequest = id; }
  async acceptRequest(link, message) {
    try {
      check((this.match.placing && ['ready', 'place'].includes(message.command?.kind) && Number.isInteger(message.seq) && message.seq <= this.sequence)
        || (message.seq === this.sequence && message.hash === this.hash), 'Le combat a avancé. Réessayez.');
      const result = this.match.reduce(message.command, link.id); check(result.ok, result.reason || result.events?.find(e => e.t === 'invalid')?.reason || 'Action impossible.');
      this.commit(result, link.id, message.id);
    } catch (e) { await this.send(link, { t: 'reject', id: message.id, reason: e.message }); }
  }
  async mutate(change, actor) {
    check(this.status === 'lobby' && change && typeof change === 'object', 'Préparation terminée.');
    if (this.settings.adventure) {
      const unit = this.units.find(u => u.id === change.id);
      check(change.kind === 'configure' && unit?.team === 'A' && change.team === 'A', 'Cette aventure impose ses héros, ses ennemis et leur équipement.');
      check(change.controller !== 'ai' || this.settings.adventure.allowAI, 'Cette aventure se joue manuellement.');
    }
    if (change.kind === 'add') await this.addArchive(change.archive, actor, change.team, change.controller);
    else {
      const unit = this.units.find(u => u.id === change.id); check(unit && (actor === 'host' || unit.owner === actor), 'Vous ne pouvez modifier que vos combattants.');
      if (change.kind === 'remove') this.units = this.units.filter(u => u !== unit);
      else if (change.kind === 'configure') {
        side(change.team); control(change.controller);
        check(this.units.filter(u => u !== unit && u.team === change.team).length < encounterCapacity(this.settings.encounter, change.team), `Ce camp contient déjà ${encounterCapacity(this.settings.encounter, change.team)} combattants.`);
        const owner = change.owner || unit.owner;
        check(owner === unit.owner || actor === 'host', 'Seul l’hôte peut changer le propriétaire.');
        check(this.participants.some(p => p.id === owner && p.connected), 'Participant déconnecté.');
        Object.assign(unit, { team: change.team, controller: change.controller, owner });
      } else throw new Error('Modification inconnue.');
    }
    this.pruneAssets(); await this.publishRoster();
  }
  async edit(change) {
    check(this.status === 'lobby' && !this.pending, 'Attendez la préparation.');
    this.error = '';
    if (this.role === 'host') {
      this.updating = true; this.changed();
      try { await this.queue(() => this.mutate(change, 'host')); } finally { this.updating = false; this.changed(); }
    } else { this.pending = { id: ++this.requestId }; this.send(this.links.get('host'), { t: 'edit', id: this.pending.id, change }); this.armTimeout(); this.changed(); }
  }
  async addUnit(entry, team, controller = entry.kind === 'monster' || entry.customMonster ? 'ai' : 'player') {
    const archive = await packPeerUnit(entry); await this.edit({ kind: 'add', archive, team, controller });
  }
  readyLobby() {
    if (this.role !== 'guest' || this.status !== 'lobby' || this.pending) return;
    this.send(this.links.get('host'), { t: 'ready', revision: this.revision, ready: !this.localReady });
  }
  async nextCampaignRoom(retry = false) {
    check(this.role === 'host' && this.campaign && this.match?.over && !this.inFlight && !this.updating && !this.fault, 'Attendez la fin du combat et ses confirmations.');
    check(retry || roomVictory(this.match.state), 'Battez la salle pour continuer.');
    const next = this.campaign.roomIndex + (retry ? 0 : 1);
    check(next < this.campaign.dungeon.rooms.length, 'Le donjon est terminé.');
    this.updating = true; this.changed();
    try {
      this.campaign.roomIndex = next; this.dungeon = dungeonRoom(this.campaign.dungeon, next);
      this.units = this.units.filter(u => u.team === 'A'); this.pruneAssets(); this.mapAsset?.cleanup(); this.mapAsset = null;
      this.settings = peerSettings({ mode: 'custom', mapId: this.dungeon.mapId, battlefield: this.dungeon.battlefield,
        encounter: dungeonEncounter(this.dungeon), seed: (this.settings.seed + 1) >>> 0, campaign: this.campaignInfo(),
        ...(this.initialTeam == null && this.dungeon.adventure ? { adventure: { name: this.campaign.dungeon.name, allowAI: this.dungeon.adventure.allowAI } } : {}) });
      if (this.dungeon.battlefield) {
        const archive = await packPeerUnit(this.character, this.dungeon.battlefield);
        const content = await unpackPeerUnit(archive, 'u0', this.contentDependencies);
        check(!this.closed, 'Salon fermé.'); this.mapAsset = { ...content, archive, cleanup: stagePeerContent(content) }; this.settings.battlefield = content.battlefield;
      }
      for (const member of this.dungeon.members) for (let i = 0; i < member.count; i++) await this.addArchive(await packPeerUnit({ ...member, count: 1 }), 'host', 'B', 'ai');
      const commanderId = this.settings.encounter?.commanderId;
      const commander = commanderId === 'B' ? 0 : commanderId ? Number(commanderId.slice(1)) - 1 : -1;
      this.commanderUnit = this.units.filter(u => u.team === 'B')[commander]?.id || null;
      if (this.settings.adventure) this.adventureRoster = canonical(this.units.map(({ id, team, member }) => ({ id, team, member })));
      this.match = null; this.pending = null; this.sequence = 0; this.awaiting.clear(); clearTimeout(this.actionTimeout); this.status = 'lobby';
      for (const link of this.links.values()) { link.mapKnown = false; link.loaded = 0; link.deferred = null; }
      await this.publishRoster();
    } catch (e) { this.error = e.message; throw e; }
    finally { this.updating = false; this.changed(); }
  }
  start() {
    check(this.canStart, 'Deux camps et tous les invités prêts sont nécessaires.');
    if (this.settings.adventure) {
      check(this.settings.mapId === this.dungeon.mapId && this.adventureRoster === canonical(this.units.map(({ id, team, member }) => ({ id, team, member }))), 'Le groupe ne correspond plus à l’aventure.');
      check(this.settings.adventure.allowAI || this.units.filter(u => u.team === 'A').every(u => u.controller === 'player'), 'Cette aventure se joue manuellement.');
    }
    this.match = new PeerMatch(this.settings, this.units, 'host'); this.match.room = this; this.hash = stateHash(this.match.state);
    this.awaiting = new Set(this.participants.filter(p => p.id !== 'host').map(p => p.id)); this.inFlight = this.awaiting.size > 0;
    this.broadcast({ t: 'start', revision: this.revision, state: this.match.state, events: this.match.initialEvents, hash: this.hash });
    this.begin(); this.armTimeout();
  }
  begin() { this.status = 'playing'; this.syncClock(); this.onStart(this.match); this.changed(); }
  submit(command, source = 'player') {
    if (!this.available) return { ok: false, pending: true, reason: 'Attendez la confirmation de l’hôte.', events: null };
    try {
      this.error = '';
      if (this.role === 'host') {
        const result = this.match.reduce(command, 'host', source);
        check(result.ok, result.reason || result.events?.find(e => e.t === 'invalid')?.reason || 'Action impossible.'); this.commit(result, 'host');
      } else {
        check(source === 'player', 'Seul l’hôte joue les IA.'); this.pending = { id: ++this.requestId, command };
        this.send(this.links.get('host'), { t: 'request', ...this.pending, seq: this.sequence, hash: this.hash }); this.armTimeout(); this.changed();
      }
      return resultPending();
    } catch (e) { this.error = e.message; this.changed(); return { ok: false, reason: e.message, events: null }; }
  }
  commit(result, actor, requestId) {
    const before = this.hash; this.match.state = result.state; this.hash = stateHash(result.state); this.sequence++;
    this.awaiting = new Set(this.participants.filter(p => p.id !== 'host').map(p => p.id)); this.inFlight = this.awaiting.size > 0; this.syncClock();
    this.broadcast({ t: 'snapshot', seq: this.sequence, before, hash: this.hash, state: result.state, events: result.events, actor, requestId, remaining: this.timeLeft() * 1000 });
    this.armTimeout(); this.onEvents(result.events); this.changed();
  }
  armTimeout() { clearTimeout(this.actionTimeout); this.actionTimeout = setTimeout(() => this.fail(new Error('Un participant ne confirme plus les échanges. Combat arrêté.')), this.status === 'lobby' ? 120000 : 20000); }
  syncClock(remaining) {
    const m = this.match, key = m && !m.placing && !m.over ? `${m.state.turn}:${m.current().id}` : '';
    if (key !== this.clockKey) { this.clockKey = key; this.deadline = Date.now() + TURN_SECONDS * 1000; }
    if (this.role === 'guest' && Number.isFinite(remaining)) this.deadline = Math.min(this.deadline || Infinity, Date.now() + Math.max(0, Math.min(TURN_SECONDS * 1000, remaining)));
  }
  timeLeft() { return this.frozenTime ?? Math.max(0, ((this.deadline || Date.now()) - Date.now()) / 1000); }
  startTick() { if (!this.tickTimer) this.tickTimer = setInterval(() => this.tick(), 500); }
  tick() {
    if (this.closed || this.fault) return; const now = Date.now();
    for (const link of this.links.values()) if (link.hello && !link.disposed) {
      if (now - link.lastReceived > 30000) { this.lost(link); continue; }
      if (now - (link.lastPing || 0) > 5000) { link.lastPing = now; this.send(link, { t: 'ping' }); }
    }
    if (this.role === 'host' && this.available && this.clockKey && !this.match.over && this.timeLeft() <= 0 && this.match.controllers[this.match.current().id] === 'player')
      this.submit({ kind: 'action', fighter: this.match.current().id, action: { type: 'PASS' } }, 'timeout');
  }
  appendChat(author, text) { this.chat = [...this.chat.slice(-99), { own: author === this.selfId, name: this.participants.find(p => p.id === author)?.name || 'Invité', text }]; this.changed(); }
  deliverChat(author, text) { this.appendChat(author, text); this.broadcast({ t: 'chat', author, text }); }
  say(text) {
    const value = text.trim().slice(0, 500); if (!value || !this.confirmed || this.fault || this.closed) return;
    if (this.role === 'host') this.deliverChat('host', value); else this.send(this.links.get('host'), { t: 'chat', text: value });
  }
  pruneAssets() { for (const [id, asset] of this.assets) if (!this.units.some(u => u.id === id)) { asset.cleanup(); this.assets.delete(id); } }
  async removeParticipant(id) {
    check(this.role === 'host' && this.status === 'lobby' && id !== 'host', 'Retrait impossible.');
    await this.queue(async () => {
      const link = this.links.get(id); if (link) { this.send(link, { t: 'fault', reason: 'L’hôte vous a retiré du salon.' }); this.dispose(link); this.links.delete(id); }
      this.participants = this.participants.filter(p => p.id !== id); this.units = this.settings.adventure ? this.units.map(u => u.owner === id ? { ...u, owner: 'host' } : u) : this.units.filter(u => u.owner !== id); this.pruneAssets(); await this.publishRoster();
    });
  }
  lost(link) {
    if (this.closed || this.fault || link.disposed) return;
    if (this.role === 'guest' || this.match) { this.fail(new Error('Un participant a quitté la connexion. Le combat est arrêté ; recréez un salon pour rejouer.')); return; }
    this.dispose(link); const participant = this.participants.find(p => p.id === link.id);
    if (participant) { participant.connected = false; participant.ready = false; this.broadcast({ t: 'participants', participants: this.participants }); }
    else { this.links.delete(link.id); if (this.invitation === link) this.invitation = null; }
    this.error = 'Invité déconnecté. Retirez-le du salon pour continuer ou invitez-le de nouveau.'; this.changed();
  }
  protocolError(link, error) {
    if (this.closed || this.fault || link.disposed) return;
    if (this.role === 'host' && !this.match) { link.wire?.send({ t: 'fault', reason: error.message }).catch(() => {}); this.lost(link); this.error = error.message; this.changed(); }
    else this.fail(error);
  }
  dispose(link) { link.disposed = true; clearTimeout(link.expiry); clearTimeout(link.handshake); link.abort.abort(); link.channel?.removeEventListener('message', link.activity); link.wire?.close(); link.channel?.close(); link.pc?.close(); }
  fail(error) {
    if (this.closed || this.fault) return;
    for (const link of this.links.values()) if (link.channel?.readyState === 'open') link.wire.send({ t: 'fault', reason: error.message }).catch(() => {});
    this.frozenTime = this.timeLeft(); this.fault = error.message || 'Connexion interrompue.'; this.status = 'failed'; clearInterval(this.tickTimer); clearTimeout(this.actionTimeout); this.changed();
    for (const link of this.links.values()) this.dispose(link);
  }
  close() {
    if (this.closed) return; this.closed = true; clearInterval(this.tickTimer); clearTimeout(this.actionTimeout);
    for (const link of this.links.values()) {
      const sent = link.channel?.readyState === 'open' ? link.wire.send({ t: 'leave' }).catch(() => {}) : Promise.resolve();
      const timer = setTimeout(() => this.dispose(link), 100); sent.finally(() => { clearTimeout(timer); this.dispose(link); });
    }
    for (const asset of this.assets.values()) asset.cleanup(); this.assets.clear();
    this.mapAsset?.cleanup(); this.mapAsset = null;
  }
}

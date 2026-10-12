import { TextEncoder, TextDecoder } from 'util';
import { encode, readCode, invitationLink, takeInvitation, base64, unbase64 } from '../net/p2p';
import { JsonChannel } from '../net/jsonChannel';
import { PeerMatch, safeAction } from '../game/peerMatch';
import { PeerRoom } from '../net/peerRoom';
import { emptyLoadout, ITEMS, rolledEffects, resolveLoadout } from '../engine/equipment';
import { newCustomEquipment, equipCustomItem } from '../engine/customEquipment';
import { createForgedItem } from '../engine/forgedItems';
import { forgeAttempt, RUNES } from '../engine/forgemagie';
import { newAuthoredSpell } from '../engine/authoredSpells';
import { utilityDecide } from '../bots/utilityBrain';
import { spellsOf } from '../engine/engine';
import { makeBotApi } from '../bots/api';
import { packPeerUnit, unpackPeerUnit } from '../net/content';
import { LiveMatch } from '../game/liveMatch';
import { compileContentManifest, packageExample } from '../content/contentPackage';

global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
const sdp = (setup = 'actpass', addresses = ['1 1 udp 123 192.0.2.5 5000 typ srflx', '2 1 udp 123 2001:db8::5 6000 typ srflx']) => [
  'v=0', 'a=ice-ufrag:abcd', 'a=ice-pwd:abcdefghijklmnopqrstuvwx', `a=fingerprint:sha-256 ${Array(32).fill('AA').join(':')}`,
  `a=setup:${setup}`, ...addresses.map(a => `a=candidate:${a}`), ''].join('\r\n');
const character = (name = 'Iop ami', classId = 'IOP') => ({ id: name, name, classId, loadout: { ...emptyLoadout(classId), level: 200 } });
const config = { mode: 'duel', seed: 42, mapId: 'arene' };

test('versioned offer/reply codes round-trip public v4/v6 and exact credentials', () => {
  for (const setup of ['actpass', 'active', 'passive']) {
    const code = encode(sdp(setup)), decoded = readCode(`  ${code}\n`);
    expect(decoded.role).toBe(setup === 'actpass' ? 'offer' : 'answer');
    expect(decoded.sdp).toContain('a=ice-pwd:abcdefghijklmnopqrstuvwx\r\n');
    expect(decoded.candidates).toEqual([{ type: 'srflx', addr: '192.0.2.5', port: 5000 }, { type: 'srflx', addr: '2001:db8:0:0:0:0:0:5', port: 6000 }]);
    const link = invitationLink(code, 'https://game.example/play?lang=fr');
    expect(new URL(link).search).toBe('?lang=fr'); expect(readCode(link).code).toBe(code);
  }
});
test('LAN mDNS, manual IPv6 including v4-mapped, and host ports are preserved', () => {
  const source = sdp('actpass', ['1 1 udp 123 abc-123.local 54321 typ host', '2 1 tcp 123 192.0.2.7 9 typ host']);
  expect(readCode(encode(source)).candidates).toEqual([{ type: 'host', addr: 'abc-123.local', port: 54321 }]);
  for (const typedIp of ['2001:db8::1', '::ffff:192.0.2.128', '127.0.0.1']) {
    const code = encode(source, { typedIp }); expect(readCode(code).candidates[0].port).toBe(54321);
    expect(readCode(code).candidates[0].type).toBe('srflx');
  }
  expect(() => encode(source, { typedIp: '2001:::1' })).toThrow();
  expect(() => encode(source, { typedIp: '1.2.3.999' })).toThrow();
});
test('bad roles, versions, truncated fields, injected SDP, ports and oversized codes are rejected', () => {
  expect(() => readCode(encode(sdp('active')), 'offer')).toThrow('invitation');
  expect(() => readCode(encode(sdp()), 'answer')).toThrow('réponse');
  const code = encode(sdp()), bytes = unbase64(code.slice(4));
  for (let n = 0; n < 70; n++) expect(() => readCode(`RT1.${base64(bytes.slice(0, n))}`)).toThrow();
  bytes[0] = 2; expect(() => readCode(`RT1.${base64(bytes)}`)).toThrow();
  for (const input of ['RT1.!', 'RT1.A', 'X'.repeat(9000), 'https://game.example/#p2p=garbage']) expect(() => readCode(input)).toThrow();
  expect(() => encode(sdp('actpass', []))).toThrow('Aucune adresse');
  expect(() => encode(sdp('actpass', ['1 1 udp 123 192.0.2.1 0 typ srflx']))).toThrow();
  expect(() => invitationLink(code, 'javascript:alert(1)')).toThrow();
});
test('opening an invite removes its credentials from browser history', () => {
  const code = encode(sdp()), history = { state: null, replaceState: jest.fn() };
  expect(takeInvitation({ hash: `#foo=bar&p2p=${code}`, pathname: '/game', search: '?a=1' }, history)).toBe(code);
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/game?a=1#foo=bar');
});

class MemoryChannel extends EventTarget {
  constructor() { super(); this.readyState = 'open'; this.bufferedAmount = 0; }
  send(data) { Promise.resolve().then(() => { if (this.other.readyState === 'open') this.other.dispatchEvent(new MessageEvent('message', { data })); }); }
  close() { this.readyState = 'closed'; this.dispatchEvent(new Event('close')); }
}
const channels = () => { const a = new MemoryChannel(), b = new MemoryChannel(); a.other = b; b.other = a; return [a, b]; };
const until = async predicate => { for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 2)); } throw new Error('Timed out waiting for peers'); };

test('large Unicode messages are chunked in order, and malformed transfers are bounded', async () => {
  const [a, b] = channels(), received = [], errors = [];
  const sender = new JsonChannel(a, () => {}, e => errors.push(e)), receiver = new JsonChannel(b, m => received.push(m), e => errors.push(e));
  const large = { text: 'é😀'.repeat(40000) };
  await Promise.all([sender.send(large), sender.send({ done: true })]); await until(() => received.length === 2);
  expect(received).toEqual([large, { done: true }]); expect(errors).toEqual([]);
  b.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({ t: 'begin', id: 4, length: 1000000000 }) }));
  expect(errors).toHaveLength(1); expect(receiver.incoming).toBeNull(); sender.close(); receiver.close();
});

test('a congested channel waits for backpressure and cancels a pending transfer on close', async () => {
  const [a, b] = channels(), received = [];
  const sender = new JsonChannel(a, () => {}, () => {}), receiver = new JsonChannel(b, m => received.push(m), () => {});
  a.bufferedAmount = 300000;
  const first = sender.send({ text: 'x'.repeat(30000) }); await new Promise(resolve => setTimeout(resolve, 5));
  expect(received).toEqual([]);
  a.bufferedAmount = 0; a.dispatchEvent(new Event('bufferedamountlow')); await first; await until(() => received.length === 1);
  a.bufferedAmount = 300000; const pending = sender.send({ text: 'later' });
  await new Promise(resolve => setTimeout(resolve, 5)); a.close(); await expect(pending).rejects.toThrow('interrompue');
  sender.close(); receiver.close();
});


const rooms = [];
afterEach(() => { rooms.splice(0).forEach(room => room.close()); });
async function salon(settings = config, count = 2, dungeon = null) {
  const events = [], host = new PeerRoom({ role: 'host', character: character('Hôte'), settings, dungeon, build: 'test', onEvents: e => events.push(...e) });
  rooms.push(host); await host.prepare();
  const guests = [];
  for (let i = 0; i < count; i++) {
    const guest = new PeerRoom({ role: 'guest', character: character('Invité ' + (i + 1), 'CRA'), build: 'test' });
    guest.events = []; guest.onEvents = e => guest.events.push(...e); rooms.push(guest); guests.push(guest); await guest.prepare();
    const [a, b] = channels(), hostLink = host.newLink('guest-' + (i + 1)), guestLink = guest.newLink('host');
    host.attach(hostLink, a); guest.attach(guestLink, b);
    await until(() => guest.confirmed && hostLink.loaded === host.revision);
  }
  return { host, guests, events };
}
async function start(host, guests) {
  for (const guest of guests) guest.readyLobby();
  await until(() => host.canStart);
  expect(host.status).toBe('lobby'); // ready never auto-starts
  host.start(); await until(() => host.available && guests.every(g => g.available));
}
async function settled(host, guests) {
  await until(() => host.available && guests.every(g => g.available));
  for (const guest of guests) expect(guest.match.state).toEqual(host.match.state);
}
async function act(host, guests, room, command) {
  const result = room.submit(command);
  if (!result.ok) throw new Error(result.reason);
  await settled(host, guests);
}
test('native single player still readies opponents; guest mirrors do not execute rules', async () => {
  const solo = new LiveMatch({ playerClass: 'IOP', botClass: 'CRA', mapId: 'arene', seed: 42 });
  expect(solo.state.placement.ready.B).toBe(true);
  const { host, guests } = await salon(); await start(host, guests);
  expect(guests[0].match.localId).toBe('B'); expect(guests[1].match.localId).toBe('B2');
  expect(guests[0].match.viewerTeam).toBe('B');
  expect(() => guests[0].match.reduce({ kind: 'ready' }, guests[0].selfId)).toThrow('hôte');
  expect(Object.values(host.match.state.placement.ready)).toEqual([false, false, false]);
});

test('all participants contribute full characters and monsters, own them and choose teams/control', async () => {
  const { host, guests } = await salon();
  const [a, b] = guests;
  await a.addUnit({ kind: 'monster', monsterId: 494, grade: 1 }, 'A');
  await until(() => !a.pending && b.units.length === 4);
  const monster = host.units.find(u => u.member.monsterId === 494);
  expect(monster.owner).toBe(a.selfId); expect(monster.controller).toBe('ai');
  await b.addUnit(character('Deuxième personnage'), 'A');
  await until(() => !b.pending && a.units.length === 5);
  expect(host.units.filter(u => u.owner === b.selfId)).toHaveLength(2);
  const owned = host.units.find(u => u.owner === b.selfId);
  await b.edit({ kind: 'configure', id: owned.id, team: 'A', controller: 'ai' });
  await until(() => !b.pending && a.units.find(u => u.id === owned.id).controller === 'ai');
  expect(host.units.find(u => u.id === owned.id).team).toBe('A');
  // Owners are assigned by the host connection, never by a submitted identity.
  const foreign = host.units.find(u => u.owner === 'host');
  await a.edit({ kind: 'remove', id: foreign.id }); await until(() => !a.pending);
  expect(a.error).toContain('vos combattants'); expect(host.units.some(u => u.id === foreign.id)).toBe(true);
  await host.edit({ kind: 'configure', id: owned.id, owner: a.selfId, team: 'B', controller: 'player' });
  await until(() => b.units.find(u => u.id === owned.id).owner === a.selfId);
  expect(a.units.find(u => u.id === owned.id).owner).toBe(a.selfId);
  // Guest-ready status is invalidated on composition changes.
  a.readyLobby(); await until(() => a.localReady);
  await host.edit({ kind: 'remove', id: monster.id });
  await until(() => !a.localReady && a.units.length === 4);
  expect(host.canStart).toBe(false);
  expect(() => a.start()).toThrow();
});

test('exact FM, custom equipment and authored spells are shared without writing libraries', async () => {
  const hero = character(), item = ITEMS[9126]; hero.loadout.slots.ring1 = item.id;
  const initial = createForgedItem(item, rolledEffects(item, hero.loadout, 'ring1'), 123);
  hero.loadout.forgedItems = { ring1: forgeAttempt(item, initial, RUNES.find(r => r.id === 1557), { guaranteedSuccess: true }) };
  const custom = { ...newCustomEquipment(7143), id: 1000000010, level: 200, name: 'Coiffe amicale', stats: { vitalite: 120, force: 25 } };
  hero.loadout = equipCustomItem(hero.loadout, 'hat', custom); hero.loadout.slots.hat = custom.id;
  hero.loadout.spells = { custom: [newAuthoredSpell()] };
  const packed = await packPeerUnit(hero), first = await unpackPeerUnit(packed, 'u1'), second = await unpackPeerUnit(packed, 'u1');
  const saved = first.member.character;
  expect(saved.loadout.forgedItems).toEqual(hero.loadout.forgedItems);
  expect(saved.loadout.spells).toEqual(hero.loadout.spells);
  expect(resolveLoadout(saved.classId, saved.loadout).bonuses).toEqual(resolveLoadout(hero.classId, hero.loadout).bonuses);
  expect(first).toEqual(second); expect(first.records).toEqual([]);
  expect(localStorage.getItem('dofus-lite-creations-v1')).toBeNull();
  await expect(unpackPeerUnit(packed, '__proto__')).rejects.toThrow();
});

test('a guest contributes a custom creature with its full spellbook to an otherwise empty library', async () => {
  const { host, guests } = await salon();
  const dungeon = compileContentManifest(packageExample('dungeon'), { newId: () => 'remote-room' }).entry;
  const member = dungeon.members.find(m => m.customMonster);
  await guests[1].addUnit(member, 'B'); await until(() => !guests[1].pending && guests[0].units.length === 4);
  const imported = host.units.find(u => u.member.customMonster);
  expect(imported.member.customMonster).toEqual(member.customMonster);
  expect(guests[0].units.find(u => u.id === imported.id)).toEqual(imported);
  await start(host, guests);
  const fighter = Object.values(host.match.state.fighters).find(f => f.name === member.customMonster.name);
  expect(Object.values(spellsOf(fighter)).map(s => s.id)).toEqual(member.customMonster.spells.map(s => s.id));
});

test('host alone starts; three participants get the same placements, casts, movements and turn deadlines', async () => {
  const { host, guests, events } = await salon(); await start(host, guests);
  const mirrors = guests.map(g => jest.spyOn(g.match, 'reduce'));
  for (const room of [host, ...guests]) await act(host, guests, room, { kind: 'ready' });
  for (let i = 0; i < 6; i++) {
    const fighter = host.match.current(), owner = host.match.owners[fighter.id], actor = [host, ...guests].find(r => r.selfId === owner);
    const api = actor.match.humanApi(), spells = Object.values(spellsOf(fighter));
    const buff = spells.find(s => s.targetMode === 'self' && api.canCast(s.key, fighter.pos).ok);
    if (buff) await act(host, guests, actor, { kind: 'action', fighter: fighter.id, action: { type: 'CAST', spell: buff.key, target: fighter.pos } });
    await act(host, guests, actor, { kind: 'action', fighter: fighter.id, action: { type: 'PASS' } });
  }
  const turn = host.match.state.turn; host.deadline = Date.now() - 1; host.tick(); await settled(host, guests);
  expect(host.match.state.turn).toBeGreaterThanOrEqual(turn);
  expect(events.some(e => e.t === 'cast')).toBe(true);
  guests.forEach(g => expect(g.events).toEqual(events)); mirrors.forEach(spy => expect(spy).not.toHaveBeenCalled());
  guests[1].say('Salut à tous'); await until(() => host.chat.length === 1 && guests.every(g => g.chat.length === 1));
  expect(host.chat[0].name).toBe('Invité 2'); expect(guests[1].chat[0].own).toBe(true);
});

test('simultaneous ready requests are sequenced without losing a participant', async () => {
  const { host, guests } = await salon(); await start(host, guests);
  host.match.ready(); guests.forEach(g => g.match.ready());
  await settled(host, guests);
  expect(host.match.placing).toBe(false); expect(guests.every(g => !g.error && !g.fault)).toBe(true);
});

test('the eighth browser can join and a ninth invitation is refused', async () => {
  const { host, guests } = await salon(config, 7);
  expect(host.participants).toHaveLength(8);
  await expect(host.invite()).rejects.toThrow('8 participants');
  await start(host, guests);
  host.match.ready(); guests.forEach(g => g.match.ready()); await settled(host, guests);
  expect(host.match.placing).toBe(false);
});

test('ownership, invalid actions, old sequences and damaged snapshots are rejected', async () => {
  const { host, guests } = await salon(); await start(host, guests);
  const guest = guests[0], hash = host.hash;
  guest.submit({ kind: 'place', fighter: 'A', to: { x: 0, y: 0 } });
  await until(() => !guest.pending);
  expect(guest.error).toContain('contrôlez'); expect(host.hash).toBe(hash);
  await expect(guest.receive(guest.links.get('host'), { t: 'snapshot', seq: 99, before: hash })).rejects.toThrow('Séquence');
  await expect(guest.receive(guest.links.get('host'), { t: 'snapshot', seq: 1, before: hash, hash: 'fake', state: host.match.state, events: [] })).rejects.toThrow('corrompu');
  for (const bad of [{ type: 'CAST', spell: 'test', target: { x: NaN, y: 3 } }, { type: 'MOVE', to: { x: -1, y: 1 } }, { type: 'SAY' }, null]) expect(() => safeAction(bad)).toThrow();
  expect(() => new PeerMatch(config, host.units, 'guest-1')).toThrow('hôte');
});

test('custom dungeon, two guest heroes, multiple locally owned turns and host-only AI reach victory', async () => {
  const dungeon = { id: 'room', name: 'Notre salle', mapId: 'arene', members: [{ monsterId: 494, grade: 1, count: 2 }] };
  const { host, guests, events } = await salon({ ...config, mode: 'custom' }, 2, dungeon);
  await guests[0].addUnit(character('Compagnon'), 'A'); await until(() => !guests[0].pending && guests[1].units.length === 6);
  await start(host, guests); expect(guests[0].match.humanIds.size).toBe(2);
  for (const room of [host, ...guests]) await act(host, guests, room, { kind: 'ready' });
  let bots = 0;
  for (let n = 0; n < 320 && !host.match.over; n++) {
    const fighter = host.match.current();
    if (host.match.canBotStep()) { host.match.botStep(); bots++; }
    else {
      const actor = [host, ...guests].find(r => r.selfId === host.match.owners[fighter.id]);
      const view = actor.match.humanView(), api = makeBotApi(view, () => .5);
      let action = utilityDecide(view, api); if (!['CAST', 'MOVE', 'PASS'].includes(action?.type)) action = { type: 'PASS' };
      const result = actor.submit({ kind: 'action', fighter: fighter.id, action });
      if (!result.ok) actor.submit({ kind: 'action', fighter: fighter.id, action: { type: 'PASS' } });
    }
    await settled(host, guests);
  }
  expect(host.match.over).toBe(true); expect(host.match.state.winner).toBe('A'); expect(bots).toBeGreaterThan(0);
  expect(events.some(e => e.t === 'damage')).toBe(true); guests.forEach(g => expect(g.events).toEqual(events));
  expect(guests.every(g => !g.match.canBotStep())).toBe(true);
});

test('eight slots per team, no automatic join into a full camp, and remove a disconnected guest', async () => {
  const { host, guests } = await salon(); const guest = guests[0];
  for (let i = 0; i < 6; i++) await host.addUnit({ kind: 'monster', monsterId: 494, grade: 1 }, 'B');
  await guest.addUnit(character('Trop'), 'B'); await until(() => !guest.pending);
  expect(guest.error).toContain('8 combattants'); expect(host.units.filter(u => u.team === 'B')).toHaveLength(8);
  host.lost(host.links.get(guests[1].selfId)); expect(host.canStart).toBe(false);
  expect(host.participants.find(p => p.id === guests[1].selfId).connected).toBe(false);
  await host.removeParticipant(guests[1].selfId);
  expect(host.units.some(u => u.owner === guests[1].selfId)).toBe(false);
  expect(host.participants).toHaveLength(2);
});

test('version mismatch and connection loss never silently substitute AI or declare a winner', async () => {
  const { host, guests } = await salon(); await start(host, guests);
  const fake = host.newLink('guest-9');
  await expect(host.receive(fake, { t: 'hello', protocol: 2, build: 'old', rules: 10 })).rejects.toThrow('version');
  host.lost(host.links.get(guests[0].selfId));
  expect(host.status).toBe('failed'); expect(host.available).toBe(false); expect(host.match.over).toBe(false); expect(host.match.canBotStep()).toBe(false);
  expect(host.submit({ kind: 'ready' }).ok).toBe(false);
});

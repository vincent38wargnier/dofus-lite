// Serverless, non-trickle ICE signalling. See docs/p2p.md for the wire format.
const TYPES = ['host', 'srflx', 'prflx', 'relay'];
const SETUPS = ['actpass', 'active', 'passive'];
export const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
export const CODE_PREFIX = 'RT1.';
const fail = message => { throw new Error(message || 'Lien P2P invalide ou incomplet.'); };
export const check = (condition, message) => { if (!condition) fail(message); };

export function base64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unbase64(text) {
  check(typeof text === 'string' && text.length > 0 && /^[A-Za-z0-9_-]+$/.test(text) && text.length % 4 !== 1);
  try { return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0)); }
  catch (_) { return fail(); }
}
function ipBytes(address) {
  if (!address.includes(':')) {
    const parts = address.split('.');
    check(parts.length === 4 && parts.every(p => /^(0|[1-9]\d{0,2})$/.test(p) && +p <= 255), 'Adresse IPv4 invalide.');
    return parts.map(Number);
  }
  check(/^[\da-f:.]+$/i.test(address), 'Adresse IPv6 invalide.');
  // IPv4-mapped IPv6 is accepted, too; interface zone IDs are not portable.
  if (address.includes('.')) {
    const index = address.lastIndexOf(':');
    const v4 = ipBytes(address.slice(index + 1));
    address = `${address.slice(0, index)}:${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = address.split('::');
  check(halves.length <= 2, 'Adresse IPv6 invalide.');
  const head = halves[0] ? halves[0].split(':') : [], tail = halves[1] ? halves[1].split(':') : [];
  check([...head, ...tail].every(p => /^[\da-f]{1,4}$/i.test(p)), 'Adresse IPv6 invalide.');
  check(halves.length === 1 ? head.length === 8 : head.length + tail.length < 8, 'Adresse IPv6 invalide.');
  return [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail].flatMap(p => [parseInt(p, 16) >> 8, parseInt(p, 16) & 255]);
}

export function encode(sdp, { v4 = true, v6 = true, typedIp = '' } = {}) {
  const field = name => sdp.match(new RegExp(`^a=${name}:(.+)$`, 'm'))?.[1].trim();
  const setup = SETUPS.indexOf(field('setup')), fingerprint = field('fingerprint');
  check(setup >= 0 && /^sha-256 (?:[\da-f]{2}:){31}[\da-f]{2}$/i.test(fingerprint));
  const out = [1, setup];
  for (const value of [field('ice-ufrag'), field('ice-pwd')]) {
    check(value && /^[A-Za-z0-9+/]{4,255}$/.test(value));
    out.push(value.length, ...[...value].map(c => c.charCodeAt(0)));
  }
  out.push(...fingerprint.slice(8).split(':').map(p => parseInt(p, 16)));
  const seen = new Set();
  if (typedIp) ipBytes(typedIp.trim());
  for (const line of sdp.split(/\r?\n/).filter(l => l.startsWith('a=candidate:'))) {
    const p = line.slice(12).split(/\s+/);
    if (p[1] !== '1' || p[2].toLowerCase() !== 'udp' || !TYPES.includes(p[7])) continue;
    if (typedIp && p[7] !== 'host') continue;
    const address = typedIp ? typedIp.trim() : p[4], type = typedIp ? 'srflx' : p[7], port = +p[5];
    if ((!v6 && address.includes(':')) || (!v4 && address.includes('.'))) continue;
    check(Number.isInteger(port) && port > 0 && port <= 65535);
    const mdns = !typedIp && type === 'host' && /^[a-zA-Z0-9-]{1,63}\.local$/.test(address);
    let bytes;
    try { bytes = mdns ? [address.length, ...[...address].map(c => c.charCodeAt(0))] : ipBytes(address); }
    catch (_) { continue; }
    const key = `${type}:${address}:${port}`;
    if (seen.has(key) || seen.size === 32) continue;
    seen.add(key);
    out.push((TYPES.indexOf(type) << 2) | (mdns ? 2 : bytes.length === 16 ? 1 : 0), ...bytes, port >> 8, port & 255);
  }
  check(seen.size, 'Aucune adresse disponible. Vérifiez le réseau ou renseignez votre IP dans les options avancées.');
  return CODE_PREFIX + base64(Uint8Array.from(out));
}

export function readCode(input, expectedRole) {
  check(typeof input === 'string' && input.length <= 8192);
  let code = input.trim();
  if (/^https?:\/\//i.test(code)) {
    let url;
    try { url = new URL(code); } catch (_) { fail(); }
    code = new URLSearchParams(url.hash.slice(1)).get('p2p') || '';
  }
  check(code.startsWith(CODE_PREFIX), 'Ce n’est pas un lien P2P compatible. Copiez le lien complet ou le code RT1.');
  const bytes = unbase64(code.slice(CODE_PREFIX.length)); let offset = 0;
  const take = n => { check(offset + n <= bytes.length); const value = bytes.slice(offset, offset + n); offset += n; return value; };
  check(take(1)[0] === 1);
  const setup = SETUPS[take(1)[0]];
  check(setup);
  const role = setup === 'actpass' ? 'offer' : 'answer';
  check(!expectedRole || role === expectedRole, expectedRole === 'offer' ? 'Collez une invitation, pas une réponse.' : 'Collez la réponse de votre ami, pas l’invitation.');
  const str = () => String.fromCharCode(...take(take(1)[0]));
  const ufrag = str(), pwd = str();
  check(/^[A-Za-z0-9+/]{4,255}$/.test(ufrag) && /^[A-Za-z0-9+/]{22,255}$/.test(pwd));
  const fp = [...take(32)].map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  const candidates = [];
  while (offset < bytes.length) {
    check(candidates.length < 32);
    const tag = take(1)[0], type = TYPES[tag >> 2], family = tag & 3;
    check(type && family !== 3);
    let addr;
    if (family === 2) { addr = str(); check(type === 'host' && /^[a-zA-Z0-9-]{1,63}\.local$/.test(addr)); }
    else if (family === 1) { const ip = take(16); addr = Array.from({ length: 8 }, (_, i) => ((ip[2 * i] << 8) | ip[2 * i + 1]).toString(16)).join(':'); }
    else addr = [...take(4)].join('.');
    const p = take(2), port = (p[0] << 8) | p[1]; check(port > 0);
    candidates.push({ type, addr, port });
  }
  check(candidates.length > 0);
  const pref = { host: 126, prflx: 110, srflx: 100, relay: 0 };
  const sdp = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    ...candidates.map((c, i) => `a=candidate:${i + 1} 1 udp ${pref[c.type] * 2 ** 24 + (65535 - i) * 2 ** 8 + 255} ${c.addr} ${c.port} typ ${c.type}${c.type === 'host' ? '' : ' raddr 0.0.0.0 rport 0'}`),
    `a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`, `a=fingerprint:sha-256 ${fp}`, `a=setup:${setup}`, 'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', 'a=end-of-candidates', ''].join('\r\n');
  return { code, role, sdp, candidates };
}
export const decode = code => readCode(code).sdp;

export function invitationLink(code, gameUrl = window.location.href) {
  readCode(code);
  const url = new URL(gameUrl);
  check(['https:', 'http:'].includes(url.protocol) && !url.username && !url.password, 'Utilisez l’adresse HTTP(S) du jeu.');
  url.hash = new URLSearchParams({ p2p: code }).toString();
  return url.href;
}
export function takeInvitation(location = window.location, history = window.history) {
  const params = new URLSearchParams(location.hash.slice(1));
  const code = params.get('p2p');
  if (!code) return '';
  // Credentials stay out of history and HTTP requests/referrers.
  params.delete('p2p');
  history.replaceState(history.state, '', `${location.pathname}${location.search}${params.toString() ? `#${params}` : ''}`);
  return code;
}

function gathered(pc, signal) {
  return new Promise((resolve, reject) => {
    let timer;
    const finish = error => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', changed); signal?.removeEventListener('abort', abort); error ? reject(error) : resolve(); };
    const changed = () => { if (pc.iceGatheringState === 'complete') finish(); };
    const abort = () => { pc.close(); finish(new Error('Connexion annulée.')); };
    timer = setTimeout(() => finish(), 10000);
    pc.addEventListener('icegatheringstatechange', changed);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort(); else changed();
  });
}
async function connection(code, { stun = true, typedIp = '', signal, onChannel, onState, onPeer } = {}) {
  const remote = code ? readCode(code, 'offer') : null;
  check(typeof RTCPeerConnection !== 'undefined', 'WebRTC indisponible. Ouvrez le jeu dans Chrome, Firefox ou Safari récent, en HTTPS ou sur localhost.');
  if (typedIp) ipBytes(typedIp.trim());
  const pc = new RTCPeerConnection({ iceServers: stun && !typedIp ? STUN : [] });
  onPeer?.(pc);
  pc.onconnectionstatechange = () => onState?.(pc.connectionState);
  let channel;
  try {
    if (remote) {
      pc.ondatachannel = event => {
        if (event.channel.label !== 'game' || channel) { event.channel.close(); return; }
        channel = event.channel; onChannel?.(channel);
      };
      await pc.setRemoteDescription({ type: 'offer', sdp: remote.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
    } else {
      channel = pc.createDataChannel('game', { ordered: true }); onChannel?.(channel);
      await pc.setLocalDescription(await pc.createOffer());
    }
    await gathered(pc, signal);
    check(!signal?.aborted, 'Connexion annulée.');
    return { pc, channel, code: encode(pc.localDescription.sdp, { typedIp }) };
  } catch (error) { pc.close(); throw error; }
}
export const createInvite = options => connection(null, options);
export const acceptInvite = (code, options) => connection(code, options);
export function completeInvite(pc, code) {
  check(pc?.signalingState === 'have-local-offer', 'Cette invitation n’attend plus de réponse. Créez-en une nouvelle.');
  return pc.setRemoteDescription({ type: 'answer', sdp: readCode(code, 'answer').sdp });
}

export async function selectedPath(pc) {
  const stats = await pc.getStats();
  const transport = [...stats.values()].find(s => s.type === 'transport' && s.selectedCandidatePairId);
  const pair = stats.get(transport?.selectedCandidatePairId);
  if (!pair) return null;
  const local = stats.get(pair.localCandidateId), remote = stats.get(pair.remoteCandidateId);
  return { protocol: local?.protocol, localType: local?.candidateType, remoteType: remote?.candidateType,
    ipv6: !!(local?.address?.includes(':') || remote?.address?.includes(':')), rtt: pair.currentRoundTripTime };
}

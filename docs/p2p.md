# Peer-to-peer connection (P2P)

How two players connect their games directly, with no server, by exchanging a short text code.

**Status:** prototype tested outside the game on 2026-10-10. Nothing is in `src/` yet. Every number below comes from those tests; anything not tested says so.

## What it is for

| Job | Carried by |
|---|---|
| Rules, results, items | The blockchain ([blockchain.md](blockchain.md)) |
| Chat, instant move previews, later signed moves ([state channels](blockchain.md#later-state-channels)) | The direct P2P link |
| Delivering the connection codes | Any channel: Discord, WhatsApp, a QR code |

The link is a comfort layer. If it can't form, the match still works on-chain.

## Scope of the first step (suggested)

The blockchain side isn't built yet, so "the chain decides" can't be implemented today. A first version can still be built and tested on its own:

1. `src/net/p2p.js`: the code format and functions below.
2. The « Jouer avec un ami » panel: create a code, paste, reply, connection status, and a clear error for an invalid code.
3. Chat over the link.

Sending game moves over the link needs a decision first. One option is the contract ([blockchain.md](blockchain.md)). The other is a friendly mode:

- Both clients run the same seeded engine.
- Each checks the other's actions with `applyAction`.

In friendly mode, a modified client could still see hidden information or predict rolls, because both sides hold the full state and the seed.

## How players connect

1. **Player A** clicks *Create code* and sends the code to B.
2. **Player B** pastes it, clicks *Create reply* and sends the reply back.
3. **Player A** pastes the reply. In the tests, the browsers connected about 0.5 s later.

**Rules for players:**

- Make a new code for each match. The ports change every time; the public port changed between two consecutive codes in the tests.
- A code contains your public IP address, so send it only to your opponent.

## What a code contains

| Part | Bytes | Purpose |
|---|---|---|
| Role (`actpass` or `active`) | 1 | Which side starts the encryption handshake |
| ICE username and password | 1 + 4 and 1 + 24 in Chrome | Authenticate the connectivity checks |
| Certificate fingerprint (SHA-256) | 32 | Identifies the other side's DTLS key, so a third party can't pose as your opponent (as long as the code itself arrives unaltered) |
| Each public UDP address | 7 (IPv4) or 19 (IPv6) | Where to send packets |

Measured lengths, encoded as base64url:

| Code | Characters |
|---|---|
| IPv4 address only | 94 |
| IPv6 address only | 110 |
| IPv4 and IPv6 | 119 |
| No STUN, typed IPv6 (two ports) | 135 |
| For comparison: Chrome's whole offer, deflated | 626–760 |

**Proposed, not built:** add a version byte and the player's wallet address (20 bytes, about 28 more characters). A failed link could then fall back to an on-chain challenge without asking for anything else.

## Setting it up in the game

Browsers have WebRTC built in, so nothing needs to be installed.

The code below comes from the prototype that passed the tests. It was also run exactly as printed here (2026-10-11), in two Chrome processes on one machine, with and without STUN.

### 1. Where it goes (proposed)

| File | Content |
|---|---|
| `src/net/p2p.js` | Connection and code format (below) |
| `src/ui/PlayScreen.js` | A « Jouer avec un ami » panel: *Créer un code*, a paste field, *Créer la réponse* |
| `src/game/liveMatch.js` | A remote-player variant: player B's actions come from the link or the chain instead of `botStep()` |

### 2. The code format

```js
// Tested 2026-10-10 (Chrome 154 and Chrome 130).
const TYPES = ['host', 'srflx', 'prflx', 'relay'];
const SETUPS = ['actpass', 'active', 'passive'];
const b64u = {
  enc: b => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0)),
};
const isV6 = a => a.includes(':');

function parse(sdp) {
  const get = k => (sdp.match(new RegExp(`^a=${k}:(.+)$`, 'm')) || [])[1].trim();
  const cands = sdp.split('\r\n').filter(l => l.startsWith('a=candidate:')).map(l => {
    const p = l.slice(12).split(' ');
    return { proto: p[2].toLowerCase(), addr: p[4], port: +p[5], type: p[7] };
  });
  return { ufrag: get('ice-ufrag'), pwd: get('ice-pwd'), fp: get('fingerprint').split(' ')[1], setup: get('setup'), cands };
}
function v6bytes(a) {
  const [h, t] = a.split('::');
  const hs = h ? h.split(':') : [], ts = t === undefined ? [] : t ? t.split(':') : [];
  const g = t === undefined ? hs : [...hs, ...Array(8 - hs.length - ts.length).fill('0'), ...ts];
  if (g.length !== 8) throw new Error('unexpected IPv6 form');
  return g.flatMap(x => { const v = parseInt(x, 16); return [v >> 8, v & 255]; });
}
// o.v4 / o.v6: which public addresses to include.
// o.typedIp: no STUN; use the address the player typed, with the browser's local ports.
export function encode(sdp, o) {
  const d = parse(sdp);
  const out = [SETUPS.indexOf(d.setup)];
  for (const s of [d.ufrag, d.pwd]) out.push(s.length, ...[...s].map(c => c.charCodeAt(0)));
  out.push(...d.fp.split(':').map(h => parseInt(h, 16)));
  for (const c of d.cands) {
    if (c.proto !== 'udp') continue;
    let k = c;
    if (o.typedIp) { if (c.type !== 'host') continue; k = { type: 'srflx', addr: o.typedIp, port: c.port }; }
    else if (c.type === 'host' || (isV6(c.addr) ? !o.v6 : !o.v4)) continue; // `.local` names only work on the same network
    const v6 = isV6(k.addr);
    out.push((TYPES.indexOf(k.type) << 2) | (v6 ? 1 : 0), ...(v6 ? v6bytes(k.addr) : k.addr.split('.').map(Number)), k.port >> 8, k.port & 255);
  }
  return b64u.enc(Uint8Array.from(out));
}
// Rebuilds a data-channel SDP that Chrome accepts.
export function decode(code) {
  const b = b64u.dec(code); let o = 0;
  const setup = SETUPS[b[o++]];
  const str = () => { const n = b[o++]; const s = String.fromCharCode(...b.slice(o, o + n)); o += n; return s; };
  const ufrag = str(), pwd = str();
  const fp = [...b.slice(o, o + 32)].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(':'); o += 32;
  const cands = [];
  while (o < b.length) {
    const t = b[o++], type = TYPES[t >> 2]; let addr;
    if ((t & 3) === 0) { addr = [...b.slice(o, o + 4)].join('.'); o += 4; }
    else { addr = Array.from({ length: 8 }, (_, i) => ((b[o + 2 * i] << 8) | b[o + 2 * i + 1]).toString(16)).join(':'); o += 16; }
    cands.push({ type, addr, port: (b[o] << 8) | b[o + 1] }); o += 2;
  }
  const pref = { host: 126, prflx: 110, srflx: 100, relay: 0 };
  return [
    'v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'a=msid-semantic: WMS',
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel', 'c=IN IP4 0.0.0.0',
    ...cands.map((c, i) => `a=candidate:${i + 1} 1 udp ${pref[c.type] * 2 ** 24 + (65535 - i) * 2 ** 8 + 255} ${c.addr} ${c.port} typ ${c.type}${c.type === 'host' ? '' : ' raddr 0.0.0.0 rport 0'}`),
    `a=ice-ufrag:${ufrag}`, `a=ice-pwd:${pwd}`, `a=fingerprint:sha-256 ${fp}`, `a=setup:${setup}`,
    'a=mid:0', 'a=sctp-port:5000', 'a=max-message-size:262144', '',
  ].join('\r\n');
}
```

### 3. Creating, accepting and completing a code

The code is sent once, so it must hold every address. Wait until ICE gathering finishes before encoding ("non-trickle" ICE). The 10 s cap is a safety net; with STUN, the public addresses arrived within 26 ms in the tests.

```js
const STUN = [{ urls: 'stun:stun.l.google.com:19302' }];
const gathered = pc => new Promise(r => {
  if (pc.iceGatheringState === 'complete') return r();
  pc.addEventListener('icegatheringstatechange', () => pc.iceGatheringState === 'complete' && r());
  setTimeout(r, 10000);
});
const iceServers = (stun, typedIp) => (stun && !typedIp ? STUN : []);

// Player A
export async function createInvite({ stun = true, typedIp } = {}) {
  const pc = new RTCPeerConnection({ iceServers: iceServers(stun, typedIp) });
  const channel = pc.createDataChannel('game');
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  return { pc, channel, code: encode(pc.localDescription.sdp, { v4: true, v6: true, typedIp }) };
}

// Player B
export async function acceptInvite(code, { stun = true, typedIp } = {}) {
  const pc = new RTCPeerConnection({ iceServers: iceServers(stun, typedIp) });
  const channel = new Promise(resolve => { pc.ondatachannel = e => resolve(e.channel); });
  await pc.setRemoteDescription({ type: 'offer', sdp: decode(code) });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { pc, channel, code: encode(pc.localDescription.sdp, { v4: true, v6: true, typedIp }) };
}

// Player A, after pasting B's reply
export const completeInvite = (pc, reply) => pc.setRemoteDescription({ type: 'answer', sdp: decode(reply) });

// On B's side the channel can already be open when it arrives.
export const whenOpen = ch => ch.readyState === 'open' ? Promise.resolve()
  : new Promise(r => ch.addEventListener('open', r, { once: true }));
```

In the one test where both codes carried IPv4 and IPv6, Chrome picked IPv6 on its own.

**Handling pasted codes** (tested on 2026-10-11 unless marked):

- **Trim whitespace** before decoding (advice, not tested).
- **Garbage input:** a garbage code makes `acceptInvite` throw an `OperationError`. Catch it and show an "invalid code" message.
- **Wrong kind of code:** a reply pasted where an invite is expected is accepted without any error. The game must check this itself. After base64 decoding, byte 0 is `0` for an invite (`actpass`) and `1` for a reply (`active`).

### 4. Messages

```js
ch.send(JSON.stringify({ t: 'move', action: { type: 'MOVE', to: { x: 7, y: 9 } } }));
ch.onmessage = e => { const msg = JSON.parse(e.data); /* show msg.action as a preview */ };
```

- **Action shapes:** the engine's own, `{ type: 'PASS' }`, `{ type: 'MOVE', to }` and `{ type: 'CAST', spell, target }` (`src/engine/engine.js:688-812`).
- **Previews only:** an incoming move is a preview, and the chain decides what really happened.
- **Nothing is secret on this link:** the opponent receives everything you send. Never send what the game hides from them, such as trap positions (`engine.js:1624`) or an invisible fighter's position (`engine.js:1562`).

### 5. When the link fails

- **When failure shows:** in every failed test, Chrome reported `connectionState === 'failed'` about 15 s after the paste.
- **Then:** retry once with the roles swapped, so the other player creates the code, then fall back to playing on-chain only.
- **Why swapping can help:** whoever answers sends packets first, and over IPv4 that order mattered (see the test results below). Two tries are not enough to prove the swap helps; treat it as an idea.
- **If the link drops mid-match:** reconnecting needs a new code exchange (not tested).

### 6. STUN or not

| Option | Who sees your IP | Result in the tests |
|---|---|---|
| Free public STUN (Google) | Google, plus your opponent | IPv6: 3/3. IPv4: 1/4 |
| No STUN, player types their IPv6 | Your opponent only | 1/1 |
| No STUN, player types their IPv4 | Your opponent only | 0/1. Two possible causes, not isolated: the Mac's router usually changed the port (so the local port in the code was wrong), and this IPv4 order also failed with STUN |
| Relay server (TURN) | The relay operator | Not tested; someone has to run the server |

- **No STUN means no address:** a browser without STUN puts no IP in the code at all, only `.local` names, which work only on the same network (RFC 6762). For the no-STUN mode, the player must type their own IPv6 address.
- **Typing the address is impractical:** the test Mac listed 8 global IPv6 addresses (5 temporary, 2 stable, 1 other), and Chrome used a temporary one. Only the address the browser uses is known to work, and a player can't easily tell which one that is. Use STUN by default, and keep typed addresses as an advanced option.
- **Pages can't open raw sockets:** a normal web page has no raw socket API. `TCPSocket`, `UDPSocket` and `TCPServerSocket` are `undefined` in Chrome 154. A bare "paste an IP" field therefore can't work; it has to be a code.

## Test results (2026-10-10)

### Same machine, two separate Chrome processes

- **Connections:** codes alone connected **8/8** trials, with and without STUN.
- **Messages:** went both ways in 7/8. In one trial, one message didn't arrive within 15 s, and that didn't happen again.

### Two homes behind different routers

- **Setup:** a Mac (Chrome 154) and a Linux box (headless Chrome 130, Ubuntu 24.04) behind another router, with different public IPv4 addresses and IPv6 prefixes.
- **Role of SSH:** it only carried the codes. `lsof` showed no test SSH session open while data flowed.
- **Data check:** each success moved 1 MiB, verified with SHA-256, with a ping of about 100 ms.

| Path | Result | Port used on the Linux side |
|---|---|---|
| IPv6, with STUN | **3/3** | Random UDP: 36670, 51771, 50273 |
| IPv6, no STUN, typed addresses | **1/1** | UDP 44396 |
| IPv4, with STUN, Linux side sends first | 0/2 | — |
| IPv4, with STUN, Mac side sends first | 1/2 | UDP 43011, through both routers |
| IPv4, no STUN, typed address | 0/1 | — |

### Proof that this was hole punching, not an open port

**IPv6:**

- Both routers dropped unsolicited UDP: **0 of 10** probes got through in each direction.
- Once the receiving machine had sent one packet out first, **9/10** and **10/10** got through.

**IPv4:**

- Both routers reuse one public port per socket for every peer (same port seen by 3 STUN servers).
- Both drop unsolicited packets silently, with no ICMP error back.
- With raw UDP, traffic got through in **4/4** runs when the Mac side sent first, and **0/5** when the Linux side did. The cause is not identified.

## Limits (not verified)

- **Coverage:** only one pair of networks was tested. Mobile networks, carrier-grade NAT, Firefox and Safari were not. `decode()` rebuilds a minimal description that Chrome accepts; other browsers may need changes.
- **IPv6 adoption:** the share of players with working IPv6 is unknown.
- **Privacy:** your opponent and the STUN server see your IP address.

## Optional: deliver the codes through the chain

Players then paste a wallet address instead of a code:

1. Each side posts its code as a contract event, encrypted to the opponent's key.
2. The other side reads the event.

Encryption matters because the chain is public forever.

| | Gas | OP Mainnet | opBNB | Base |
|---|---|---|---|---|
| Post one encrypted code (70–101 B code + 72 B encryption) | 28,130–29,380 | $0.0000079 | $0.000016 | $0.00045 |

- **Gas:** measured in an EVM. The EIP-7623 calldata floor sets the price.
- **Prices:** live fees on 2026-10-11 at 00:57 UTC.

## How to test it

1. **Same machine first:** two browser windows, one creates a code and the other replies. The state should reach `connected` within about a second.
2. **Then two different networks:** for example, a laptop on a phone's hotspot. That also covers a mobile network, which was never tested.
3. **Check the path the data takes** with the function below (the same `getStats` calls as in the tests). Over the internet, the remote side should show a public address and a UDP port.

```js
async function selectedPath(pc) {
  const s = await pc.getStats(); let out = null;
  s.forEach(r => {
    if (r.type !== 'transport' || !r.selectedCandidatePairId) return;
    const p = s.get(r.selectedCandidatePairId), l = s.get(p.localCandidateId), rc = s.get(p.remoteCandidateId);
    out = { local: `${l.candidateType}/${l.protocol}`, remote: `${rc.candidateType}/${rc.protocol} ${rc.address}:${rc.port}`,
      bytesSent: p.bytesSent, bytesReceived: p.bytesReceived };
  });
  return out;
}
```

The scripts behind the numbers in this file are not in the repo; ask Vincent if you need them.

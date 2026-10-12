# Peer-to-peer combat: host and guests

**Implemented:** a shared room with **one host and up to seven guests**. The host
runs the combat locally and launches it. Everyone can contribute their own
characters or monsters; each team supports up to eight fighters.

The original prototype notes remain below as historical reference. Their
blockchain/on-chain proposals are not implemented by this friendly mode.

## Playing together

1. In **Jouer → Combat**, choose a duel, dungeon or training map, then
   **Jouer avec des amis**.
2. Choose your first character and **Créer le salon**. You become the host.
3. Send the invitation link. Your friend opens it, chooses a character, clicks
   **Créer ma réponse**, and sends the response back. Paste it into your original
   tab and click **Connecter l’invité**.
4. Use **Inviter un ami** again for each additional guest. Each link connects
   exactly one guest; do not reuse it for several friends.
5. Everyone adds saved characters, custom classes or selected monsters using
   the **+** for either team. The catalogue supports search, monster levels and
   drag-and-drop. Custom creatures from local dungeons are available too.
6. **Configurer** changes a fighter's camp and manual/AI control. Guests can
   edit/remove their own contributions. The host can edit/remove all units and
   assign their control to another participant.
7. Guests click **Je suis prêt**. Only the host clicks **Lancer le combat**.
   Readiness never launches automatically. Any roster change clears readiness.
8. Each person places their manual fighters and clicks **Prêt** once for all
   of them. Their controls follow whichever of their characters is playing.

| Initial mode | Starting roster |
|---|---|
| Duel | Host in team A; joining guests in B |
| Donjon | Host and guests in A; complete selected room in B |
| Entraînement | Host and guests in A; selected Poutch in B |

These are starting suggestions: either team can be freely composed in the room.
The local solo preparation's extra allies/opponents are not automatically copied.
The selected dungeon's complete group **is** copied, including custom characters
and creatures. If the default side is full, a guest joins without an initial unit
and can add one to the other side, replace a contribution, or spectate.

## Links and connectivity

This uses WebRTC's **offer + answer** workflow without a signalling server.
A response link is necessary. A one-click join experience would additionally
require a signalling service; see the browser's
[WebRTC signalling model](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity#signaling).

The URL fragment `#p2p=RT1.…` contains ICE credentials, network candidates
(IP addresses/ports or local mDNS names), and the DTLS fingerprint. It is
removed from browser history on receipt and is not included in HTTP requests.
Share invitation links only with the people you want in the room.

All participants need **the same built version of the game**. P2P transfers
combat data; it does not publish the website or open router ports.

- A `localhost` / `127.0.0.1` link opens the **recipient's computer**.
  It works when they also serve this build at that address.
- Friends can paste the full link/code into **Rejoindre un salon** on their copy.
- For a common hosted game, use its HTTPS URL. **Adresse du jeu pour le lien**
  overrides the share URL; a deployment can set `REACT_APP_PUBLIC_GAME_URL`.
- STUN is enabled by default (Google's public service), for address discovery.
  Gameplay goes directly through encrypted WebRTC links, not through STUN.
- **Options réseau** accepts an explicit IPv4/IPv6 address and disables STUN
  when one is entered. Public IPv4 with NAT port translation can still fail.
- There is **no TURN relay**. Some NAT/firewall combinations cannot connect.
  Try fresh links with a different host/network. This implementation cannot
  guarantee connectivity between arbitrary routers.
- Keep the host tab open. A reload does not restore live connections.

## Shared characters and images

Each contributed unit is a complete, immutable snapshot packaged by the
Atelier exporter: equipment definitions, natural rolls, forgemagie, stats,
native/authored spells, appearance and PNG artwork. Custom monsters carry
their own reference stats and spellbooks. Official maps/assets resolve from
the common game build.

The host assigns a unique unit namespace, validates the package, and distributes
it to the room. Metadata edits do not retransmit already received images.
New guests receive all current units. The existing archive and combat validators
reject invalid spells, equipment, monsters, images and paths.

| Limit | Value |
|---|---|
| Browsers in a room | 8 including host |
| Initial fighters per team | 8 |
| Shared archives, total | 32 MiB |
| Single expanded archive | 36 MiB |
| PNG file | 2 MiB |
| JSON per archive | 2 MiB |
| Files per unit archive | 240 |
| Chat message / history | 500 characters / 100 messages |

Received images are held **in memory for the session**. Other players' saved
profiles, equipment, dungeons and IndexedDB artwork are never overwritten or
silently imported. Nothing executes remote JavaScript: authored spells are
validated declarative data, and the host uses the game's general AI.

## Authority and lifecycle

| Responsibility | Owner |
|---|---|
| Map, mode, initial dungeon and seed | Host |
| Adding own characters/monsters | Every participant |
| Editing a contribution | Its owner; host can manage all |
| Starting combat | Host only, after guests are ready |
| Rules, dice, damage, effects and NPC decisions | Host only |
| Manual commands | Fighter's assigned participant |
| Target previews | Local read-only combat APIs |
| Turn deadline | Host, 30 seconds; actions do not reset it |
| State distribution | Host sends complete snapshots/events |
| Delivery checks | Monotonic sequence, state hash, all guests acknowledge |

Each guest has one reliable ordered data channel to the host (a star topology).
Guest requests are bound to that connection's participant identity. The host
checks ownership, turn, placement, AP/MP, range, cooldowns and normal combat rules
before applying an action. Guests **do not replay the engine to determine results**:
they render the host's state and events. Invocations and AI-controlled units are
played by the host. A participant may own multiple manual characters, on either
team, or watch while AI controls all their units.

| Failure | Behavior |
|---|---|
| Invalid/stale command | Rejected; no state change |
| Wrong build/protocol | Join refused |
| Guest leaves before combat | Mark disconnected; host can remove them and their units |
| Any link lost during combat | Stop actions/AI/clock; keep final board, no invented winner |
| Corrupt/out-of-sequence state | Stop session |
| Unacknowledged combat state | Stop after 20 seconds |
| No network activity | Stop after 30 seconds |
| Incomplete initial share | Timeout after 120 seconds |
| Unused invitation/reply | Expires after 10 minutes |

This is friendly play, **not an anti-cheat system**. Clients receive the full
combat state, including the seed and information hidden by the normal UI.
A modified client can inspect it; a modified host can change outcomes.
DTLS protects transport, and the checksum detects accidental corruption.
There is no wallet, reward, blockchain settlement, migration to a new host,
or reconnect/resume protocol. Restart with a fresh salon if a combat disconnects.

## Implementation and verification

| File | Responsibility |
|---|---|
| `src/net/p2p.js` | Versioned codec, links, ICE, role checks and cancellation |
| `src/net/jsonChannel.js` | Bounded chunks, ordering, transfer timeouts and backpressure |
| `src/net/content.js` | Validated unit archives and temporary artwork |
| `src/net/peerRoom.js` | Multiple links, ownership, lobby, host authority and snapshots |
| `src/game/peerMatch.js` | Arbitrary teams, owned controls and host combat adapter |
| `src/ui/PeerLobby.js` | Invitations, participants, team composition and chat |
| `src/ui/PlayScreen.js` | Existing combat UI with local/remote turns |
| `src/__tests__/p2p.test.js` | Codec, transfers, multi-guest protocol and full combat |
| `scripts/proof_p2p.cjs` | Three/four independent Chrome players; optional guest on a remote Linux network |

```sh
CI=true npm test -- --watchAll=false --runInBand --runTestsByPath src/__tests__/p2p.test.js src/__tests__/peerUi.test.js
npm run build
node scripts/proof_p2p.cjs
# Also exercise automatic candidate gathering:
P2P_AUTO=1 node scripts/proof_p2p.cjs
# Three guests plus the host, simultaneously:
P2P_PLAYERS=4 PROOF_OUT=/tmp/dofus-p2p-four-player-proof node scripts/proof_p2p.cjs
```

The proof targets the built game at port 3013; override with `PROOF_URL`.
Default explicit loopback candidates exercise real DTLS/data channels without
depending on STUN. Automatic mode gathers native candidates. These local
browser checks alone are **not a cross-router Internet connectivity test**.
Reports/screenshots are written to `/tmp/dofus-p2p-proof`.

### Testing an actual remote player

`REMOTE_CDP_URL` runs the first guest in a separate Linux Chrome instead of
launching it on the Mac. Use a dedicated temporary Chrome profile and expose its
debugging endpoint on **loopback only**. Forward that endpoint over SSH, and, if
the Linux machine does not already serve the same build, forward the game's HTTP
server in the other direction:

```sh
# Add your normal SSH identity/port options and replace user@linux-host.
ssh -N -o ExitOnForwardFailure=yes \
  -L 127.0.0.1:39222:127.0.0.1:39222 \
  -R 127.0.0.1:33013:127.0.0.1:3013 user@linux-host

# Linux Chrome must already be listening on remote-debugging-port=39222.
REMOTE_CDP_URL=http://127.0.0.1:39222 \
REMOTE_GAME_URL=http://127.0.0.1:33013 \
node scripts/proof_p2p.cjs
```

The HTTP/CDP tunnels deliver the website and drive the test browser. **They do
not forward WebRTC UDP.** Automatic STUN gathering is mandatory in this mode;
the proof rejects a loopback, relayed or unsuccessful selected ICE path on the
Linux guest. It records the selected candidates, packet/byte counters and RTT,
then compares every participant's complete game state during placement and combat.
The same `main.*.js` build must be loaded on both machines. Reports and screenshots
go to `/tmp/dofus-p2p-remote-proof`; `PROOF_OUT` overrides either output directory.
Add `P2P_PLAYERS=4` to test three guests plus the host. All guests confirm
readiness concurrently; every participant must move, cast and finish at least
two turns. The report includes action counts per player, so a connected spectator
cannot satisfy the test. The harness closes all test browsers, including the remote one.
Close the SSH forwarding process and remove its temporary profile afterwards.

### Cross-network verification — 12 October 2026

Passed with an automated Chrome player actually running on the remote Ubuntu
machine, a Mac host, and a second guest on the Mac. All browsers used isolated
profiles. This run used automatic candidates and the existing production build;
no gameplay fix was needed.

| Check | Observed result |
|---|---|
| Game build | `main.a0a3ad4c.js` on all three browsers |
| Host / remote guest | macOS Chrome 154 / Ubuntu Chrome 130 |
| Selected Internet path | Direct UDP over public IPv6; no TURN |
| Measured RTT at combat checkpoint | Host 103 ms; Linux guest 112 ms |
| Linux data channel | `game`, open; 210 received / 135 sent messages |
| Linux data-channel payload | 434,334 bytes received / 9,401 bytes sent |
| Shared roster | Seven fighters; guest adds a second manual character |
| Shared assets | Nine custom PNGs; no persistent guest-library changes |
| Combat exercised | Six boosts, four attacks, eight moves, eight manual turns and AI turns |
| Synchronization | Complete state equality on all browsers after actions |
| Final checked snapshot | Sequence 33; checksum `e572e10c` |
| Departure | Leaving guest stops host and remaining remote guest; no invented winner |
| Browser errors | None |

Artifacts: `/tmp/dofus-p2p-remote-proof/report.json`, `guest-combat.png` (Linux),
`host-combat.png` (Mac), and the room screenshots. The JSON records selected
candidate pairs and increasing byte counters before and after combat, proving
that gameplay used the Internet WebRTC path rather than the SSH HTTP/CDP tunnels.

This verifies these two networks on IPv6. IPv4-only NAT traversal, other routers,
Linux hosting, reconnection and TURN fallback were not established by this run.

### Four simultaneous players — 12 October 2026

A second run used **one host and three guests in the same room**, with four
independent Chrome processes and profiles across the Mac and remote Linux.
Each guest joined with a separate invitation. All three guest readiness clicks
were sent concurrently; only the host launched. Every player actually moved,
cast spells and ended at least two turns.

| Player | Machine | Manual turns | Spell casts | Moves |
|---|---|---:|---:|---:|
| Iop voyageur — host | Mac | 2 | 3 | 2 |
| Archer azur — two characters | Remote Linux | 4 | 6 | 4 |
| Gardienne | Mac, separate browser | 2 | 3 | 2 |
| Éclaireuse cuivre | Mac, separate browser | 2 | 3 | 1 |

Eight fighters were present: five manual characters and three AI monsters.
The test completed **10 manual turns, seven boosts, eight attacks and nine
moves**, comparing the complete state across **all four browsers** after actions
and AI turns. Snapshot 44 had checksum `6afd65ac` on the common
`main.da33f79b.js` build. The host held three simultaneous WebRTC connections;
the Linux path stayed direct IPv6/UDP with a measured 100–103 ms RTT at the
combat checkpoint. No browser errors occurred.

All guests received the custom artwork and additions from the other players;
their persistent libraries remained unchanged. The third guest's departure
stopped actions on the host and both remaining guests without declaring a winner.

Artifacts are in `/tmp/dofus-p2p-four-player-proof/`: `report.json` includes
per-player action counts and network stats; `shared-room.png`, `host-combat.png`,
`guest-combat.png` (Linux) and `third-guest-combat.png` show the shared session.
This proves four simultaneous players across **two networks**, not four separate
physical machines or four networks. No gameplay code change was required.

The codec retains the prototype's SDP reconstruction, adding a version byte,
`RT1.` prefix, strict validation and a bounded mDNS-host form for LAN.
Unversioned prototype codes are intentionally rejected.

## Original prototype notes (2026-10-10)

The remaining sections describe the earlier prototype and the proposed future
blockchain architecture. References to an on-chain fallback or to code "not
built" apply to that historical proposal, not the friendly mode above.

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

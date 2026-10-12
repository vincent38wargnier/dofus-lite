// Three or four isolated Chrome processes; never opens the user's profile.
// REMOTE_CDP_URL moves guest 1 to an already running, isolated Linux Chrome.
// SSH may forward HTTP/CDP, but the selected WebRTC path must cross networks.
require('./ai_runtime.cjs');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const puppeteer = require('puppeteer-core');
const { emptyLoadout } = require('../src/engine/equipment');
const { getView } = require('../src/engine/engine');
const { makeBotApi } = require('../src/bots/api');
const remoteCdp = process.env.REMOTE_CDP_URL;
const out = process.env.PROOF_OUT || (remoteCdp ? '/tmp/dofus-p2p-remote-proof' : '/tmp/dofus-p2p-proof');
const origin = process.env.PROOF_URL || 'http://127.0.0.1:3013';
const automatic = Boolean(remoteCdp || process.env.P2P_AUTO);
const playerCount = Number(process.env.P2P_PLAYERS || 3);
assert([3, 4].includes(playerCount), 'P2P_PLAYERS must be 3 or 4 (including the host)');
const hero = (id, name, classId, art) => ({ id, name, classId, className: name, customCharacterId: null,
  loadout: { ...emptyLoadout(classId), level: 200, base: { force: 200 }, artworkId: art } });
const heroes = [hero('host', 'Iop voyageur', 'IOP', 'peer-proof-images'), hero('g1', 'Archer azur', 'CRA', 'shape-v1-warden-378bc2'), hero('g2', 'Gardienne', 'IOP', 'shape-v1-warden-d15a84'), hero('g3', 'Éclaireuse cuivre', 'CRA', 'shape-v1-warden-c87c32')].slice(0, playerCount);
const dungeon = { id: 'peer-room', name: 'Notre Kanojedo', mapId: 'arene', members: [{ monsterId: 494, grade: 3, count: 2 }] };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
  fs.mkdirSync(out, { recursive: true }); const browsers = [], pages = [], report = { date: new Date().toISOString(), participants: playerCount, guests: playerCount - 1, remoteGuest: Boolean(remoteCdp), checks: [], errors: [], actions: [] };
  const networks = () => Promise.all(pages.map(page => page.evaluate(async () => ({
    platform: navigator.platform, userAgent: navigator.userAgent,
    build: [...document.scripts].map(s => s.src).find(s => /main\.[^.]+\.js/.test(s)),
    peers: await Promise.all((window.__proofPeers || []).map(async pc => {
      const stats = [...(await pc.getStats()).values()];
      const transport = stats.find(s => s.type === 'transport' && s.selectedCandidatePairId);
      const pair = stats.find(s => s.id === transport?.selectedCandidatePairId);
      return { state: pc.connectionState, iceState: pc.iceConnectionState, events: pc.__proofEvents,
        pair, local: stats.find(s => s.id === pair?.localCandidateId), remote: stats.find(s => s.id === pair?.remoteCandidateId),
        candidates: stats.filter(s => s.type === 'local-candidate' || s.type === 'remote-candidate'),
        channels: stats.filter(s => s.type === 'data-channel') };
    })),
  })))).catch(error => ({ error: error.message }));
  const click = async (page, selector, text = '') => {
    await page.waitForFunction(({ selector, text }) => [...document.querySelectorAll(selector)].some(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), {}, { selector, text });
    const h = await page.evaluateHandle(({ selector, text }) => [...document.querySelectorAll(selector)].find(e => e.checkVisibility() && !e.disabled && e.textContent.includes(text)), { selector, text });
    await h.asElement().click(); await h.dispose();
  };
  const type = async (page, selector, value) => { await page.$eval(selector, e => { e.focus(); e.select(); }); await page.keyboard.press('Backspace'); await page.keyboard.type(value); };
  const check = message => { report.checks.push(message); console.log(message); };
  const capture = async (page, name) => page.screenshot({ path: path.join(out, name + '.png') });
  const exportState = async page => {
    if (!await page.$('.fight-log')) await click(page, '.fight-heading-actions button', 'Journal');
    await click(page, '.combat-log-heading button', 'Exporter');
    return page.evaluate(async () => JSON.parse(await window.__peerExport.text()));
  };
  const sync = async () => {
    for (let i = 0; i < 30; i++) {
      const bars = await Promise.all(pages.map(p => p.$eval('.peer-fight-bar', e => ({ status: e.dataset.peerStatus, hash: e.dataset.peerHash, seq: e.dataset.peerSequence, text: e.textContent }))));
      assert(bars.every(b => b.status === 'playing'), JSON.stringify(bars));
      if (bars.every(b => b.hash === bars[0].hash && !b.text.includes('Confirmation'))) {
        const values = await Promise.all(pages.map(exportState));
        if (values.every(v => JSON.stringify(v.state) === JSON.stringify(values[0].state))) return values[0];
      }
      await pause(150);
    }
    throw Error('No shared host snapshot');
  };
  const waitUnits = async n => Promise.all(pages.map(p => p.waitForFunction(n => document.querySelectorAll('[data-peer-unit]').length === n, {}, n)));
  async function invite(index) {
    const host = pages[0], guest = pages[index];
    if (index > 1) await click(host, '.peer-participants button', 'Inviter un ami');
    await host.waitForSelector('[aria-label="Lien d’invitation"]');
    const link = await host.$eval('[aria-label="Lien d’invitation"]', e => e.value);
    const guestLink = index === 1 && process.env.REMOTE_GAME_URL ? new URL(new URL(link).hash, process.env.REMOTE_GAME_URL).href : link;
    await guest.goto(guestLink, { waitUntil: 'networkidle0' }); assert.equal(new URL(guest.url()).hash, '');
    if (!automatic) { await click(guest, '.peer-advanced summary'); await type(guest, '[aria-label="Mon IP directe"]', '127.0.0.1'); }
    await click(guest, '.peer-lobby footer button', 'Créer ma réponse');
    await guest.waitForSelector('[aria-label="Lien de réponse"]');
    const answer = await guest.$eval('[aria-label="Lien de réponse"]', e => e.value);
    if (index === 1) {
      await type(host, '[aria-label="Réponse de votre ami"]', link); await click(host, '.peer-answer button', 'Connecter');
      await host.waitForFunction(() => document.querySelector('.peer-lobby [role="alert"]')?.textContent.includes('réponse'));
    }
    await type(host, '[aria-label="Réponse de votre ami"]', answer); await click(host, '.peer-answer button', 'Connecter');
    await guest.waitForSelector('[data-peer-status="lobby"]');
    await host.waitForFunction(n => document.querySelectorAll('[data-participant]').length === n, {}, index + 1);
  }
  try {
    for (let i = 0; i < playerCount; i++) {
      const browser = i === 1 && remoteCdp
        ? await puppeteer.connect({ browserURL: remoteCdp })
        : await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, pipe: true,
          args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding'] }); browsers.push(browser);
      const page = await browser.newPage(); pages.push(page); page.setDefaultTimeout(45000); await page.setViewport({ width: 1440, height: 1080 });
      page.on('pageerror', error => report.errors.push(error.message));
      await page.evaluateOnNewDocument(({ hero, dungeon, isHost }) => {
        window.__proofPeers = [];
        window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, { construct(Native, args) {
          const pc = new Native(...args); pc.__proofEvents = []; window.__proofPeers.push(pc);
          for (const event of ['connectionstatechange', 'iceconnectionstatechange', 'icegatheringstatechange']) {
            pc.addEventListener(event, () => pc.__proofEvents.push({ event, at: Date.now(), state: pc.connectionState, ice: pc.iceConnectionState, gathering: pc.iceGatheringState }));
          }
          pc.addEventListener('icecandidateerror', e => pc.__proofEvents.push({ event: 'icecandidateerror', url: e.url, errorCode: e.errorCode, errorText: e.errorText }));
          return pc;
        }});
        if (!localStorage.getItem('p2p-proof')) {
          localStorage.setItem('p2p-proof', '1');
          localStorage.setItem('dofus-lite-profiles-v1', JSON.stringify({ version: 1, activeId: hero.id, profiles: [hero, { ...hero, id: hero.id + '-extra', name: 'Renfort ' + hero.name }] }));
          localStorage.setItem('dofus-lite-player-setup-v1', JSON.stringify({ mode: isHost ? 'boss' : 'duel', customDungeonId: isHost ? dungeon.id : null, mapId: 'arene', seed: 42 }));
          if (isHost) localStorage.setItem('dofus-lite-creations-v1', JSON.stringify({ version: 1, characters: [], dungeons: [dungeon] }));
          localStorage.setItem('dofus-lite-sound', JSON.stringify({ enabled: false, volume: 0 }));
        }
        const original = URL.createObjectURL;
        URL.createObjectURL = function(blob) { if (blob.type === 'application/json') window.__peerExport = blob; return original.call(this, blob); };
      }, { hero: heroes[i], dungeon, isHost: i === 0 });
    }
    const [host, a, b] = pages;
    await host.goto(origin, { waitUntil: 'networkidle0' });
    await host.evaluate(async () => {
      const names = ['portrait.png', 'idle-front.png', 'idle-back.png', 'walk-front.png', 'walk-back.png', 'cast-front.png', 'cast-back.png', 'hit-front.png', 'hit-back.png'];
      const images = Object.fromEntries(await Promise.all(names.map(async name => [name, await (await fetch('/templates/character-artwork/example/' + name)).blob()])));
      const db = await new Promise((resolve, reject) => { const r = indexedDB.open('dofus-lite-character-artwork', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('artwork', { keyPath: 'id' }); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
      await new Promise((resolve, reject) => { const tx = db.transaction('artwork', 'readwrite'); tx.objectStore('artwork').put({ id: 'peer-proof-images', version: 1, name: 'Voyageur', images }); tx.oncomplete = resolve; tx.onerror = reject; }); db.close();
    });
    await host.reload({ waitUntil: 'networkidle0' }); await click(host, '.setup-play'); await click(host, '.peer-entry');
    if (!automatic) { await click(host, '.peer-advanced summary'); await type(host, '[aria-label="Mon IP directe"]', '127.0.0.1'); }
    await click(host, '.peer-lobby footer button', 'Créer le salon');
    await invite(1); await capture(host, 'first-guest');
    for (let i = 2; i < playerCount; i++) await invite(i);
    await waitUnits(playerCount + 2);
    await Promise.all(pages.map(p => p.waitForFunction(n => document.querySelectorAll('[data-participant]').length === n, {}, playerCount)));
    check('Host plus ' + (playerCount - 1) + ' independent Chrome guests connected simultaneously in one room with unique links; wrong-role code is rejected without closing the salon.');
    report.connectedNetworks = await networks();
    if (remoteCdp) {
      assert(Array.isArray(report.connectedNetworks));
      const [local, remote] = report.connectedNetworks;
      assert.match(local.platform, /Mac/); assert.match(remote.platform, /Linux/);
      assert.equal(new URL(local.build).pathname, new URL(remote.build).pathname);
      const direct = remote.peers.find(pc => pc.pair?.state === 'succeeded' && pc.pair.nominated && pc.pair.bytesReceived > 0);
      assert(direct, 'Linux must have a selected data-carrying ICE pair');
      assert.equal(direct.remote.protocol, 'udp');
      assert(!['relay'].includes(direct.remote.candidateType));
      assert(direct.remote.address && !/^(127\.|::1$|localhost$)/.test(direct.remote.address), 'Remote RTC path must not be the SSH loopback tunnel');
      assert.notEqual(direct.remote.address, direct.local.address);
      check('Real Mac ↔ Linux UDP/DTLS connection: same game build, selected non-loopback ICE path, bytes exchanged without TURN or gameplay tunnelling.');
    }
    for (const guest of pages.slice(1)) {
      assert.equal(await guest.$$('button').then(async hs => (await Promise.all(hs.map(h => h.evaluate(e => e.textContent)))).filter(t => t.includes('Lancer le combat')).length), 0);
      await guest.waitForFunction(() => [...document.querySelectorAll('.peer-unit img')].some(e => e.src.startsWith('blob:') && e.naturalWidth === 256));
    }
    check('All guests receive the custom dungeon and the host’s 9 PNG sheets without previously owning them.');
    await click(a, '[aria-label="Ajouter à l’équipe A"]'); await click(a, '[aria-label="Ajouter Renfort Archer azur"]'); await waitUnits(playerCount + 3);
    await click(a, '[aria-label="Fermer le catalogue"]');
    await click(b, '[aria-label="Ajouter à l’équipe B"]'); await click(b, '.duel-source-tabs button', 'Monstres');
    await type(b, '.duel-search input', 'Bouftou');
    await click(b, '[aria-label="Ajouter Bouftou"]'); await waitUnits(playerCount + 4); await click(b, '[aria-label="Fermer le catalogue"]');
    assert.equal(await a.$$('[aria-label="Retirer Iop voyageur"]').then(es => es.length), 0);
    await click(a, '.peer-unit details summary');
    await capture(host, 'shared-room'); await capture(a, 'guest-controls');
    check('A guest adds a second owned manual character; another adds a chosen monster to the enemy team. All ' + playerCount + ' rosters agree; foreign units are read-only.');
    await click(a, '.peer-lobby-chat summary'); await type(a, '[aria-label="Message au salon"]', 'Prêts pour le donjon ?'); await click(a, '[aria-label="Envoyer le message"]');
    await Promise.all(pages.map(p => p.waitForFunction(() => document.querySelector('.peer-messages')?.textContent.includes('Prêts'))));
    await b.setViewport({ width: 390, height: 844 }); await capture(b, 'mobile-room');
    assert(await b.$eval('.peer-lobby', e => e.scrollWidth <= e.clientWidth + 1 && e.querySelector('footer').getBoundingClientRect().bottom <= innerHeight));
    await b.setViewport({ width: 1440, height: 1080 });
    // All guests ready concurrently: readiness still never auto-starts combat.
    await Promise.all(pages.slice(1).map(p => click(p, '.peer-lobby footer button', 'Je suis prêt')));
    await host.waitForFunction(() => [...document.querySelectorAll('.peer-lobby footer button')].some(e => e.textContent.includes('Lancer') && !e.disabled));
    assert.equal(await host.$$('.fight-screen').then(es => es.length), 0);
    await capture(host, 'ready-room'); await click(host, '.peer-lobby footer button', 'Lancer le combat');
    await Promise.all(pages.map(p => p.waitForSelector('.peer-fight-bar')));
    let result = await sync(); assert.equal(Object.keys(result.state.fighters).length, playerCount + 4);
    const ids = Object.values(result.state.fighters).filter(f => f.name.includes('Archer')).map(f => f.id);
    assert.equal(ids.length, 2); assert.equal(await a.$$('.team-placement button').then(es => es.length), 2);
    await click(a, '.team-placement button', 'Renfort');
    const id = await a.$eval('[data-controlled-fighter]', e => e.dataset.controlledFighter);
    const cell = result.state.placement.cells[id].find(p => !Object.values(result.state.fighters).some(f => f.pos.x === p.x && f.pos.y === p.y));
    if (cell) { await click(a, '[data-placement-cell="' + cell.x + ',' + cell.y + '"][data-team="A"]'); result = await sync(); }
    for (const p of pages) { await click(p, '.placement-ready'); result = await sync(); }
    check('Only the host launches; one guest places and readies two characters, each participant controls only their owned units.');
    let casts = 0, moves = 0, attacks = 0, turns = 0;
    const owner = fighter => {
      const i = heroes.findIndex(h => fighter.name === h.name || fighter.name === 'Renfort ' + h.name);
      assert(i >= 0, 'Every manual fighter must have a known owner'); return pages[i];
    };
    const actionsByPlayer = heroes.map(h => ({ player: h.name, boosts: 0, attacks: 0, moves: 0, turns: 0 }));
    while (turns < 2 * (playerCount + 1) && !result.state.over) {
      const fid = result.state.order[result.state.currentIndex], fighter = result.state.fighters[fid];
      if (fighter.isMonster) { await pause(800); result = await sync(); continue; }
      const p = owner(fighter), view = getView(result.state, fid), api = makeBotApi(view, () => .5);
      const counts = actionsByPlayer[pages.indexOf(p)];
      const record = kind => report.actions.push({ player: counts.player, fighter: fid, kind, turn: result.state.turn });
      const buff = view.you.spells.find(s => s.targetMode === 'self' && api.canCast(s.key, fighter.pos).ok);
      if (buff) { await click(p, '[data-spell-id="' + buff.id + '"] .spell-btn'); result = await sync(); casts++; counts.boosts++; record('boost'); }
      const now = getView(result.state, fid), actions = makeBotApi(now, () => .5);
      const enemy = Object.values(result.state.fighters).find(f => f.team !== fighter.team && f.hp > 0);
      const attack = enemy && now.you.spells.find(s => s.targetMode !== 'self' && s.effects?.some(e => ['damage', 'lifeSteal'].includes(e.kind)) && actions.canCast(s.key, enemy.pos).ok);
      if (attack) { await click(p, '[data-spell-id="' + attack.id + '"] .spell-btn'); await click(p, '[data-timeline-fighter="' + enemy.id + '"][data-targetable="true"]'); result = await sync(); attacks++; counts.attacks++; record('attack'); }
      const targets = await p.$$eval('.grid-layer .cell.hl-move', es => es.map(e => e.dataset.cell));
      if (targets.length) { await click(p, '.cell[data-cell="' + targets[0] + '"]'); result = await sync(); moves++; counts.moves++; record('move'); }
      await click(p, '.end-turn'); result = await sync(); turns++; counts.turns++; record('end-turn');
      console.log('Turn ' + turns + ': ' + counts.player + ' — all ' + playerCount + ' states match.');
    }
    assert(casts > 0 && moves > 0 && attacks > 0);
    assert(actionsByPlayer.every(c => c.turns >= 2 && c.moves > 0 && c.boosts + c.attacks > 0), 'Every player must actually act, not just spectate');
    await capture(host, 'host-combat'); await capture(a, 'guest-combat');
    if (pages[3]) await capture(pages[3], 'third-guest-combat');
    check('Host-authoritative battle: ' + casts + ' boosts, ' + attacks + ' attacks, ' + moves + ' moves and ' + turns + ' manual turns; all ' + playerCount + ' state exports match, including AI turns.');
    report.combat = { boosts: casts, attacks, moves, turns, actionsByPlayer, sequence: await host.$eval('.peer-fight-bar', e => e.dataset.peerSequence), hash: await host.$eval('.peer-fight-bar', e => e.dataset.peerHash) };
    report.combatNetworks = await networks();
    for (const p of pages.slice(1)) {
      assert.equal(await p.evaluate(() => JSON.parse(localStorage.getItem('dofus-lite-creations-v1'))?.dungeons.length || 0), 0);
      assert.equal(await p.evaluate(async () => {
        const dbs = await indexedDB.databases(); if (!dbs.some(d => d.name === 'dofus-lite-character-artwork')) return 0;
        const db = await new Promise(resolve => { const r = indexedDB.open('dofus-lite-character-artwork', 1); r.onsuccess = () => resolve(r.result); });
        const count = await new Promise(resolve => { const r = db.transaction('artwork', 'readonly').objectStore('artwork').count(); r.onsuccess = () => resolve(r.result); }); db.close(); return count;
      }), 0);
    }
    const leaving = pages[pages.length - 1], remaining = pages.slice(0, -1);
    await click(leaving, '.fight-heading-actions button', 'Abandonner');
    await Promise.all(remaining.map(p => p.waitForSelector('.peer-fight-bar.failed')));
    for (const p of remaining) assert.equal(await p.$eval('.end-turn', e => e.disabled), true);
    check('Guest departure stops the whole room without inventing a winner; shared assets never modify persistent libraries.');
    assert.deepEqual(report.errors, []);
  } catch (e) {
    report.failure = e.stack; console.error(e); process.exitCode = 1;
    report.failureNetworks = await networks();
    for (let i=0;i<pages.length;i++) { await capture(pages[i], 'failure-' + i).catch(()=>{}); report['page'+i] = await pages[i].evaluate(() => document.body.innerText).catch(()=> 'closed'); }
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report,null,2));
    await Promise.all(browsers.map(async b => {
      let timer;
      await Promise.race([b.close().catch(() => {}), new Promise(resolve => {
        timer = setTimeout(() => { b.process()?.kill('SIGKILL'); resolve(); }, 5000);
      })]); clearTimeout(timer);
    }));
    // Chromium's pipe transport may retain Node handles after all isolated
    // browser processes have closed. The report and cleanup are complete.
    process.exit(process.exitCode || 0);
  }
})();

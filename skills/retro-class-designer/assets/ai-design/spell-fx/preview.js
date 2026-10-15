/* global SpellFx, SpellFxExamples */
(() => {
  const byId = id => document.getElementById(id), canvas = byId('stage'), ctx = canvas.getContext('2d');
  const roleNames = { cast: 'Lancement', projectile: 'Projectile', trail: 'Traînée', impact: 'Impact', aura: 'Aura', beam: 'Rayon' };
  let manifest, images = {}, time = 0, last = performance.now(), request = 0, urls = [];
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const playLabel = () => { byId('play').textContent = playing ? 'Pause' : 'Lire'; };
  playLabel();
  for (const [key, value] of Object.entries(SpellFxExamples)) {
    const option = document.createElement('option'); option.value = key; option.textContent = value.manifest.name; byId('sample').append(option);
  }
  for (const template of SpellFx.templates) {
    const card = document.createElement('div'); card.className = 'guide';
    const title = document.createElement('strong'); title.textContent = roleNames[template.role]; card.append(title);
    const links = document.createElement('div'); links.className = 'links';
    for (const [name, file] of [['Guide SVG', `guides/${template.role}.svg`], ['Guide PNG', `guides/${template.role}.png`], ['PNG vide', `blank/${template.file}`]]) {
      const a = document.createElement('a'); a.textContent = name; a.href = file; a.download = ''; links.append(a);
    }
    card.append(links); byId('guides').append(card);
  }
  const loadImage = src => new Promise((resolve, reject) => {
    const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('PNG illisible.')); img.src = src;
  });
  function reviewPixels(img, layer) {
    const check = document.createElement('canvas'); check.width = img.width; check.height = img.height;
    const c = check.getContext('2d'); c.drawImage(img, 0, 0);
    const data = c.getImageData(0, 0, check.width, check.height).data;
    for (let frame = 0; frame < layer.frames; frame++) {
      let visible = false, clear = false;
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const alpha = data[(y * check.width + frame * 256 + x) * 4 + 3];
        visible ||= alpha > 0; clear ||= alpha === 0;
      }
      if (!visible || !clear) throw new Error(`${layer.file}, image ${frame + 1} : contenu visible et vrai fond transparent requis.`);
    }
  }
  async function load(next, sources, inspect = false) {
    const ticket = ++request, report = SpellFx.validate(next);
    if (!report.valid) throw new Error(report.errors.join('\n'));
    const loaded = {};
    for (const layer of next.layers) {
      if (!sources[layer.file]) throw new Error(`Image absente : ${layer.file}`);
      const img = await loadImage(sources[layer.file]);
      if (img.width !== layer.frames * 256 || img.height !== 256) throw new Error(`${layer.file} : dimensions incorrectes.`);
      if (inspect) reviewPixels(img, layer);
      loaded[layer.file] = img;
    }
    if (ticket !== request) return false;
    manifest = next; images = loaded; time = 0;
    byId('name').textContent = next.name; byId('manifest').textContent = JSON.stringify(next, null, 2);
    byId('timeline').max = next.durationMs; byId('layers').replaceChildren();
    for (const row of next.layers) {
      const el = document.createElement('div'); el.className = 'layer'; el.textContent = roleNames[row.role];
      const info = document.createElement('span'); info.textContent = `${row.file} · ${row.startMs}–${row.endMs} ms · ${row.frames} images · ${row.depth === 'front' ? 'devant' : 'derrière'}`;
      el.append(info); byId('layers').append(el);
    }
    byId('status').textContent = inspect ? 'Fichiers chargés localement. Lancez aussi le validateur du kit pour le contrôle PNG complet.' : 'Exemple technique chargé — aucune illustration de thème générée.';
    return true;
  }
  const failure = error => { byId('status').textContent = error.message; };
  function sample() {
    const selected = SpellFxExamples[byId('sample').value];
    load(selected.manifest, selected.images).then(applied => {
      if (applied) { urls.forEach(url => URL.revokeObjectURL(url)); urls = []; }
    }).catch(failure);
  }
  byId('sample').addEventListener('change', sample);
  byId('files').addEventListener('change', async event => {
    const nextUrls = [];
    try {
      const list = Array.from(event.target.files), names = list.map(f => f.name);
      if (list.length > 7 || new Set(names).size !== names.length || !names.includes('effect.json')) throw new Error('Sélectionnez effect.json et ses PNG, avec des noms uniques (7 fichiers maximum).');
      if (list.some(f => f.size > (f.name === 'effect.json' ? SpellFx.limits.jsonBytes : SpellFx.limits.pngBytes))
        || list.reduce((sum, f) => sum + f.size, 0) > SpellFx.limits.totalBytes) throw new Error('Fichiers trop volumineux.');
      const next = JSON.parse(await list.find(f => f.name === 'effect.json').text());
      const validation = SpellFx.validate(next);
      if (!validation.valid) throw new Error(validation.errors.join('\n'));
      const allowed = new Set(['effect.json', ...next.layers.map(l => l.file)]);
      if (names.some(n => !allowed.has(n))) throw new Error('Un fichier n’est pas déclaré dans effect.json.');
      const sources = Object.fromEntries(list.filter(f => f.name.endsWith('.png')).map(file => {
        const url = URL.createObjectURL(file); nextUrls.push(url); return [file.name, url];
      }));
      if (await load(next, sources, true)) { urls.forEach(url => URL.revokeObjectURL(url)); urls = nextUrls; }
      else nextUrls.forEach(url => URL.revokeObjectURL(url));
    } catch (error) { nextUrls.forEach(url => URL.revokeObjectURL(url)); failure(error); }
    event.target.value = '';
  });
  byId('play').addEventListener('click', () => { playing = !playing; playLabel(); });
  byId('restart').addEventListener('click', () => { time = 0; playing = true; playLabel(); });
  byId('timeline').addEventListener('input', event => { time = Number(event.target.value); playing = false; playLabel(); });
  function points() {
    const far = byId('distance').value === 'far', horizontal = far ? 225 : 105, vertical = far ? 115 : 60;
    const direction = byId('direction').value;
    if (direction === 'up' || direction === 'down') {
      const sign = direction === 'down' ? 1 : -1;
      return [{ x: 400, y: 220 - sign * vertical }, { x: 400, y: 220 + sign * vertical }];
    }
    const sign = direction === 'left' ? -1 : 1;
    return [{ x: 400 - sign * horizontal, y: 250 }, { x: 400 + sign * horizontal, y: 205 }];
  }
  function drawSprite(row, at, sampleTime, angle = 0, beamWidth = null) {
    const elapsed = sampleTime - row.startMs;
    if (elapsed < 0 || sampleTime >= row.endMs) return;
    const rawFrame = Math.floor(elapsed * row.fps / 1000);
    if (!row.loop && rawFrame >= row.frames) return;
    const frame = row.loop ? rawFrame % row.frames : rawFrame;
    const scale = row.scalePercent / 100;
    ctx.save(); ctx.translate(at.x, at.y); ctx.rotate(angle);
    ctx.globalCompositeOperation = row.blend === 'add' ? 'lighter' : 'source-over';
    ctx.drawImage(images[row.file], frame * 256, 0, 256, 256, -row.anchor.x * scale,
      -row.anchor.y * scale, beamWidth ?? 256 * scale, 256 * scale); ctx.restore();
  }
  function actor(point, color, label) {
    ctx.save(); ctx.translate(point.x, point.y);
    ctx.fillStyle = color; ctx.globalAlpha = .22; ctx.beginPath(); ctx.ellipse(0, 12, 32, 15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = color;
    ctx.beginPath(); ctx.arc(0, -30, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-23, 6); ctx.quadraticCurveTo(-20, -18, 0, -17); ctx.quadraticCurveTo(20, -18, 23, 6); ctx.stroke();
    ctx.font = '13px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = byId('background').value === 'dark' ? '#d6e3d1' : '#334536'; ctx.fillText(label, 0, 43); ctx.restore();
  }
  function render(now) {
    const delta = Math.min(100, now - last); last = now;
    if (manifest) {
      if (playing) time = (time + delta * Number(byId('speed').value)) % (manifest.durationMs + 450);
      const [from, to] = points(), light = byId('background').value === 'light';
      ctx.fillStyle = light ? '#f1f1e6' : '#172520'; ctx.fillRect(0, 0, 800, 440);
      ctx.strokeStyle = light ? '#d7dece' : '#243b30'; ctx.lineWidth = 1;
      for (let x = -600; x < 1400; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 880, 440); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - 880, 440); ctx.stroke(); }
      const drawLayer = row => {
        const moving = SpellFx.position(manifest.travel, from, to, time);
        if (row.role === 'trail') {
          if (time < row.startMs || time >= row.endMs) return;
          for (let birth = manifest.travel.startMs; birth < Math.min(time, manifest.travel.endMs); birth += 50) {
            const age = time - birth, tailMs = row.frames / row.fps * 1000;
            if (age >= tailMs) continue;
            const at = SpellFx.position(manifest.travel, from, to, birth);
            drawSprite({ ...row, startMs: 0, endMs: tailMs, loop: false }, at, age);
          }
        } else if (row.role === 'beam') drawSprite(row, from, time, Math.atan2(to.y - from.y, to.x - from.x), Math.hypot(to.x - from.x, to.y - from.y));
        else drawSprite(row, row.attachment === 'caster' ? from : row.attachment === 'projectile' ? moving : to, time, row.rotation === 'path' ? moving.angle : 0);
      };
      manifest.layers.filter(l => l.depth === 'behind').forEach(drawLayer);
      actor(from, light ? '#38777e' : '#86d9de', 'Lanceur'); actor(to, light ? '#94702f' : '#e1bd72', 'Cible');
      manifest.layers.filter(l => l.depth === 'front').forEach(drawLayer);
      byId('timeline').value = Math.min(time, manifest.durationMs);
      byId('time').textContent = `${Math.min(Math.round(time), manifest.durationMs)} / ${manifest.durationMs} ms`;
    }
    requestAnimationFrame(render);
  }
  sample(); requestAnimationFrame(render);
})();

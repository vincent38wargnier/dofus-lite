// Explicit maintenance of labelled example prose. Does not seed accounts,
// refresh dates, change authors or create votes, downloads or notifications.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');

async function refreshDemoText({ store, data, apply = false, backupDirectory }) {
  await store.ready;
  const plan = [];
  const result = { apply, topics: 0, replies: 0, unchanged: 0, skipped: 0, applied: 0, conflicts: 0 };
  for (const table of ['topics', 'replies']) {
    const seen = new Set();
    const fields = table === 'topics' ? ['title', 'body', 'category'] : ['body'];
    const existing = new Map((await store.all(table, { id: { $in: data[table].map(row => row.id) } }, { limit: Math.max(1, data[table].length) })).map(row => [row.id, row]));
    for (const source of data[table]) {
      assert.equal(source.isDemo, 1, 'Only labelled example copy can be refreshed');
      assert(source.id.startsWith('demo-topic-'), 'Unexpected example ID');
      assert(!seen.has(source.id), 'Duplicate example ID');
      seen.add(source.id);
      const after = Object.fromEntries(fields.map(field => {
        assert(typeof source[field] === 'string' && source[field].trim(), 'Empty example copy');
        return [field, source[field]];
      }));
      const current = existing.get(source.id);
      if (!current || current.isDemo !== 1 || current.owner !== source.owner || current.hidden) {
        result.skipped++;
        continue;
      }
      const before = Object.fromEntries(fields.map(field => [field, current[field] ?? null]));
      if (fields.every(field => before[field] === after[field])) {
        result.unchanged++;
        continue;
      }
      plan.push({ table, id: current.id, owner: current.owner, before, after });
      result[table]++;
    }
  }
  if (!apply || !plan.length) return result;
  assert(backupDirectory, 'A backup directory is required before updating example copy');
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const backup = path.join(backupDirectory, `copy-${Date.now()}-${randomUUID()}.json`);
  fs.writeFileSync(backup, JSON.stringify({ created: new Date().toISOString(), plan }, null, 2), { mode: 0o600, flag: 'wx' });
  result.backup = backup;
  for (const entry of plan) {
    // Compare the old copy as well, so an edit made during this run is not lost.
    const changed = await store.update(entry.table, {
      id: entry.id, owner: entry.owner, isDemo: 1, hidden: 0, ...entry.before,
    }, entry.after);
    if (changed === 1) result.applied++;
    else result.conflicts++;
  }
  return result;
}

module.exports = { refreshDemoText };
if (require.main === module) {
  if (fs.existsSync('.env')) process.loadEnvFile('.env');
  const { createStore } = require('../../server/store.cjs');
  const { dataset } = require('./seed_demo_community.cjs');
  const directory = process.env.DATA_DIR || path.resolve('var/community');
  const store = createStore({ directory });
  refreshDemoText({ store, data: dataset(), apply: process.argv.includes('--apply'), backupDirectory: path.join(directory, 'demo-text-backups') })
    .then(result => { console.log(JSON.stringify(result, null, 2)); if (result.conflicts) process.exitCode = 1; })
    .catch(error => { console.error('Example copy update failed:', error.name); process.exitCode = 1; })
    .finally(() => store.close());
}

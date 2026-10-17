// Rebuild discovery metadata from stored, validated ZIPs without changing a
// publication, its immutable download, ownership, dates or activity counters.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { WorkerPool } = require('../../server/workerPool.cjs');
const { createStore } = require('../../server/store.cjs');
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function reindex({ store, onProgress = () => {} }) {
  await store.ready;
  const pool = new WorkerPool({ concurrency: 1 }), report = [];
  for (const row of await store.all('libraries', { hidden: 0 })) {
    const file = await store.file(row.file_id || row.id);
    assert.equal(await digest(file), row.sha256, row.id + ': published ZIP checksum mismatch');
    const valid = await pool.run({ type: 'validate', file }, 180000);
    await store.update('libraries', { id: row.id, sha256: row.sha256 }, { counts: valid.counts });
    const entry = { id: row.id, counts: valid.counts };
    report.push(entry); onProgress(entry);
  }
  return report;
}
module.exports = { reindex };
if (require.main === module) {
  if (fs.existsSync('.env')) process.loadEnvFile('.env');
  const store = createStore({ directory: process.env.DATA_DIR || path.resolve('var/community') });
  reindex({ store, onProgress: row => console.log(JSON.stringify(row)) })
    .catch(error => { console.error(error.message.replace(/mongodb[^\s]+/g, '[redacted]')); process.exitCode = 1; })
    .finally(() => store.close());
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createStore } = require('../../server/store.cjs');
const { refreshDemoText } = require('./refresh_demo_text.cjs');

async function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'af-example-copy-'));
  const store = createStore({ directory, uri: '' });
  t.after(async () => { await store.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  await store.insert('users', { id: 'example-author', handle: 'copy_example', password: 'disabled', recovery: 'disabled', isDemo: 1, created: '2026-06-01' });
  await store.insert('users', { id: 'member', handle: 'copy_member', password: 'disabled', recovery: 'disabled', isDemo: 0, created: '2026-10-01' });
  const topic = { id: 'demo-topic-copy-0', owner: 'example-author', library_id: null, title: 'Titre initial', body: 'Texte initial', category: 'help', created: '2026-06-10', updated: '2026-10-15', isDemo: 1, hidden: 0, locked: 0, demoLikes: 14 };
  const reply = { id: topic.id + '-reply-0', topic_id: topic.id, owner: 'example-author', body: 'Réponse initiale', created: '2026-06-11', hidden: 0, isDemo: 1, reply_to: null, demoLikes: 8 };
  await store.insert('topics', topic);
  await store.insert('replies', reply);
  await store.insert('replies', { ...reply, id: topic.id + '-reply-member', owner: 'member', isDemo: 0, body: 'Vrai message à préserver', reply_to: reply.id });
  await store.insert('post_votes', { user_id: 'member', kind: 'topic', target: topic.id, created: '2026-10-15' });
  await store.insert('subscriptions', { user_id: 'member', topic_id: topic.id, created: '2026-10-15' });
  const data = { topics: [{ ...topic, title: 'Ça reste après fermeture ?', body: 'salut, je peux fermer sans tout perdre ?' }], replies: [{ ...reply, body: 'Oui, garde quand même le zip.' }] };
  return { store, directory, data, backupDirectory: path.join(directory, 'backups') };
}

test('preview reports only copy changes and writes nothing', async t => {
  const f = await fixture(t);
  const before = await f.store.all('topics');
  const result = await refreshDemoText(f);
  assert.equal(result.topics, 1); assert.equal(result.replies, 1); assert.equal(result.applied, 0);
  assert.deepEqual(await f.store.all('topics'), before);
  assert.equal(fs.existsSync(f.backupDirectory), false);
});

test('copy refresh backs up prose and preserves real replies, votes, dates, labels and authors', async t => {
  const f = await fixture(t);
  const snapshots = Object.fromEntries(await Promise.all(['users', 'topics', 'replies', 'post_votes', 'subscriptions'].map(async table => [table, await f.store.all(table)])));
  // Even a source entry claiming an existing real reply is a demo cannot edit it.
  f.data.replies.push({ ...snapshots.replies[1], isDemo: 1, body: 'Do not overwrite a member' });
  const result = await refreshDemoText({ ...f, apply: true });
  assert.equal(result.applied, 2); assert.equal(result.skipped, 1);
  const backup = JSON.parse(fs.readFileSync(result.backup));
  assert.equal(backup.plan.length, 2); assert.equal(backup.plan[0].before.body, 'Texte initial');
  assert.equal(fs.statSync(result.backup).mode & 0o777, 0o600);
  for (const table of ['users', 'post_votes', 'subscriptions']) assert.deepEqual(await f.store.all(table), snapshots[table]);
  assert.deepEqual(await f.store.one('topics', { id: f.data.topics[0].id }), { ...snapshots.topics[0], title: f.data.topics[0].title, body: f.data.topics[0].body });
  assert.deepEqual(await f.store.one('replies', { id: snapshots.replies[1].id }), snapshots.replies[1]);
  assert.deepEqual(await f.store.one('replies', { id: f.data.replies[0].id }), { ...snapshots.replies[0], body: f.data.replies[0].body });
  const second = await refreshDemoText({ ...f, apply: true });
  assert.equal(second.applied, 0); assert.equal(second.unchanged, 2); assert.equal(second.backup, undefined);
});

test('missing, hidden and reassigned posts are skipped without inserting or resurrecting them', async t => {
  const f = await fixture(t);
  await f.store.update('topics', { id: f.data.topics[0].id }, { hidden: 1 });
  await f.store.update('replies', { id: f.data.replies[0].id }, { owner: 'member' });
  f.data.topics.push({ ...f.data.topics[0], id: 'demo-topic-missing-0' });
  const result = await refreshDemoText({ ...f, apply: true });
  assert.equal(result.skipped, 3); assert.equal(result.applied, 0);
  assert.equal(await f.store.count('topics'), 1);
  assert.equal(fs.existsSync(f.backupDirectory), false);
});

test('a concurrent edit wins over a prepared copy refresh', async t => {
  const f = await fixture(t), update = f.store.update.bind(f.store);
  f.store.update = async (table, filter, changes) => {
    if (table === 'topics') await update(table, { id: filter.id }, { body: 'Changed during refresh' });
    return update(table, filter, changes);
  };
  const result = await refreshDemoText({ ...f, apply: true });
  assert.equal(result.conflicts, 1); assert.equal(result.applied, 1);
  assert.equal((await f.store.one('topics', { id: f.data.topics[0].id })).body, 'Changed during refresh');
});

test('backup failure or non-demo source refuses all writes', async t => {
  const f = await fixture(t);
  const before = await f.store.all('topics');
  fs.writeFileSync(f.backupDirectory, 'Not a directory');
  await assert.rejects(refreshDemoText({ ...f, apply: true }));
  assert.deepEqual(await f.store.all('topics'), before);
  f.data.replies[0].isDemo = 0;
  await assert.rejects(refreshDemoText({ ...f, apply: true }), /Only labelled/);
  assert.deepEqual(await f.store.all('topics'), before);
});

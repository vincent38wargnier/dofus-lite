const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs'), path = require('node:path');
function openDatabase(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(directory, 'community.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, handle TEXT NOT NULL UNIQUE COLLATE NOCASE, password TEXT NOT NULL, recovery TEXT NOT NULL, created TEXT NOT NULL, admin INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS libraries(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, description TEXT NOT NULL, release TEXT NOT NULL, kind TEXT NOT NULL, sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, counts TEXT NOT NULL, arena TEXT NOT NULL, created TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS votes(user_id TEXT NOT NULL REFERENCES users(id), library_id TEXT NOT NULL REFERENCES libraries(id), created TEXT NOT NULL, PRIMARY KEY(user_id,library_id));
    CREATE TABLE IF NOT EXISTS ratings(user_id TEXT NOT NULL REFERENCES users(id), library_id TEXT NOT NULL REFERENCES libraries(id), value INTEGER NOT NULL CHECK(value BETWEEN 1 AND 5), updated TEXT NOT NULL, PRIMARY KEY(user_id,library_id));
    CREATE INDEX IF NOT EXISTS ratings_library ON ratings(library_id);
    CREATE TABLE IF NOT EXISTS downloads(library_id TEXT NOT NULL REFERENCES libraries(id), visitor TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY(library_id,visitor,day));
    CREATE TABLE IF NOT EXISTS topics(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), library_id TEXT REFERENCES libraries(id), title TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS replies(id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id), owner TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created TEXT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, target TEXT NOT NULL, reason TEXT NOT NULL, created TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS bots(id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), library_id TEXT NOT NULL REFERENCES libraries(id), fighter INTEGER NOT NULL, name TEXT NOT NULL, code TEXT NOT NULL, sha256 TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY, library_id TEXT NOT NULL REFERENCES libraries(id), fighter INTEGER NOT NULL, a TEXT NOT NULL REFERENCES bots(id), b TEXT NOT NULL REFERENCES bots(id), seed INTEGER NOT NULL, status TEXT NOT NULL, result TEXT, created TEXT NOT NULL, completed TEXT);
    CREATE INDEX IF NOT EXISTS matches_rank ON matches(library_id,fighter,status,completed);
    CREATE INDEX IF NOT EXISTS topics_library ON topics(library_id,created);`);
  const additions={users:{isDemo:'INTEGER NOT NULL DEFAULT 0',bio:"TEXT NOT NULL DEFAULT ''"},libraries:{file_id:'TEXT',isDemo:'INTEGER NOT NULL DEFAULT 0',demoOrder:'INTEGER',theme:'TEXT',coverHash:'TEXT',coverWidth:'INTEGER',coverHeight:'INTEGER',demoActivity:'TEXT'},topics:{isDemo:'INTEGER NOT NULL DEFAULT 0',category:"TEXT NOT NULL DEFAULT 'general'",updated:'TEXT',locked:'INTEGER NOT NULL DEFAULT 0',edited:'TEXT',demoLikes:'INTEGER NOT NULL DEFAULT 0'},replies:{isDemo:'INTEGER NOT NULL DEFAULT 0',edited:'TEXT',reply_to:'TEXT',demoLikes:'INTEGER NOT NULL DEFAULT 0'},bots:{isDemo:'INTEGER NOT NULL DEFAULT 0'},matches:{isDemo:'INTEGER NOT NULL DEFAULT 0',duelKey:'TEXT'}};
  for(const [table,fields] of Object.entries(additions)){const present=new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c=>c.name));for(const [name,type] of Object.entries(fields))if(!present.has(name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);}
  db.exec(`CREATE TABLE IF NOT EXISTS post_votes(user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,target TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(user_id,kind,target));
    CREATE TABLE IF NOT EXISTS subscriptions(user_id TEXT NOT NULL REFERENCES users(id),topic_id TEXT NOT NULL REFERENCES topics(id),created TEXT NOT NULL,PRIMARY KEY(user_id,topic_id));
    CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),topic_id TEXT NOT NULL REFERENCES topics(id),actor TEXT NOT NULL REFERENCES users(id),created TEXT NOT NULL,seen INTEGER NOT NULL DEFAULT 0);
    CREATE UNIQUE INDEX IF NOT EXISTS libraries_version ON libraries(owner,sha256) WHERE hidden=0;
    CREATE UNIQUE INDEX IF NOT EXISTS bot_version ON bots(owner,library_id,fighter,sha256);
    CREATE UNIQUE INDEX IF NOT EXISTS match_duel ON matches(duelKey) WHERE status IN ('running','complete') AND duelKey IS NOT NULL;
    CREATE INDEX IF NOT EXISTS notifications_user ON notifications(user_id,seen,created);
    CREATE INDEX IF NOT EXISTS forum_votes_target ON post_votes(kind,target);
    CREATE INDEX IF NOT EXISTS forum_replies_topic ON replies(topic_id,hidden,created);`);
  return db;
}
module.exports = { openDatabase };

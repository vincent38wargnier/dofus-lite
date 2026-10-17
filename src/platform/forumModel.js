export const FORUM_FILTER_KEY = 'arena-forge:forum-filters';
export const FORUM_CATEGORIES = {
  general: 'Discussion libre', help: 'Entraide', feedback: 'Créations & retours',
  strategy: 'Stratégies', ai: 'Intelligence artificielle', looking: 'Trouver des joueurs',
};
export const DEFAULT_FORUM_FILTERS = { category: 'all', library: '', query: '', sort: 'active', feed: 'all', source: 'all' };

export function readForumFilters(storage) {
  try {
    const value = JSON.parse(storage.getItem(FORUM_FILTER_KEY));
    return {
      category: FORUM_CATEGORIES[value?.category] ? value.category : 'all',
      library: typeof value?.library === 'string' ? value.library : '',
      query: typeof value?.query === 'string' ? value.query.slice(0, 150) : '',
      sort: ['active', 'new', 'top'].includes(value?.sort) ? value.sort : 'active',
      feed: value?.feed === 'following' ? 'following' : 'all',
      source: value?.source === 'members' ? 'members' : 'all',
    };
  } catch (_) { return { ...DEFAULT_FORUM_FILTERS }; }
}

export function forumQuery(filters, page = 1) {
  return '/topics?' + new URLSearchParams({
    scope: 'all', category: filters.category, library: filters.library,
    q: filters.query.trim(), sort: filters.sort, following: filters.feed === 'following' ? '1' : '0',
    source: filters.source, page: String(page),
  });
}

export function mergePosts(previous, next) {
  return [...new Map([...previous, ...next].map(post => [post.id, post])).values()];
}

// Replies stay attached to their actual parent. A removed or unloaded parent does
// not hide its replies, and imported old data cannot create a recursive cycle.
export function replyTree(replies) {
  const nodes = new Map(replies.map(reply => [reply.id, { ...reply, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    let parent = nodes.get(node.reply_to), cursor = parent;
    const seen = new Set([node.id]);
    while (cursor) {
      if (seen.has(cursor.id)) { parent = null; break; }
      seen.add(cursor.id);
      cursor = nodes.get(cursor.reply_to);
    }
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export function excerpt(body, length = 220) {
  const text = String(body || '').split('\n').filter(line => !line.startsWith('>')).join(' ').replace(/\s+/g, ' ').trim();
  return text.length > length ? text.slice(0, length).trimEnd() + '…' : text;
}

export function relativeDate(value, now = Date.now()) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return '';
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 1440) return `il y a ${Math.floor(minutes / 60)} h`;
  if (minutes < 10080) return `il y a ${Math.floor(minutes / 1440)} j`;
  return new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(new Date(now).getFullYear() !== new Date(value).getFullYear() ? { year: 'numeric' } : {}) });
}

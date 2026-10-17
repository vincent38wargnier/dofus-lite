import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, Bookmark, Bot, Check, ChevronDown, CircleHelp, Clock3, Compass, Flame, Gamepad2, Heart, MessageCircle, Plus, Search, ShieldCheck, Sparkles, Swords, Users, X } from 'lucide-react';
import { DEFAULT_FORUM_FILTERS, FORUM_CATEGORIES as CATEGORIES, FORUM_FILTER_KEY, excerpt, forumQuery, mergePosts, readForumFilters } from './forumModel';
import { Author, DemoBadge, ForumLink, LikeButton, PostTime, ShareDialog } from './ForumShared';

const categoryIcons = { general: MessageCircle, help: CircleHelp, feedback: Sparkles, strategy: Swords, ai: Bot, looking: Users };
const sortOptions = [['active', Flame, 'Actifs'], ['new', Clock3, 'Nouveaux'], ['top', Heart, 'Les plus aimés']];
const shortWorldName = name => String(name || '').split(' · ')[0];

export function WorldBadge({ library, onClick }) {
  return <button className="af-forum-world" onClick={onClick}>
    {library?.coverUrl ? <img src={library.coverUrl} alt="" loading="lazy" /> : <Gamepad2 size={17} />}
    <span>{library ? shortWorldName(library.name) : 'Arena Forge'}</span>
  </button>;
}

export function ForumAbout({ library, go, newTopic, stats }) {
  return <aside className="af-forum-about">
    {library && <section className="af-forum-world-card">
      {library.coverUrl && <img src={library.coverUrl} alt="" />}
      <div><span className="af-forum-kicker">DANS CET UNIVERS</span><h2>{shortWorldName(library.name)}</h2><p>{excerpt(library.description, 140)}</p>
        <ForumLink to={'library/' + library.id} go={go} className="af-button">Découvrir & jouer<ArrowRight size={15} /></ForumLink>
      </div>
    </section>}
    <section className="af-forum-welcome"><span className="af-forum-mark"><MessageCircle size={24} /></span><h2>On en parle ?</h2><p>Un combat à raconter, une idée à tester ou une équipe à trouver.</p>
      <button className="af-button primary" onClick={newTopic}><Plus size={16} />Créer une discussion</button>
      <div className="af-forum-guidelines"><span><ShieldCheck size={16} />Un bon échange, c’est simple.</span><p>Parlez du jeu. Respectez les autres. Signalez les messages qui dépassent les limites.</p></div>
    </section>
    {!!stats?.demoMembers && <p className="af-forum-example-note">Les fils marqués <DemoBadge /> contiennent des profils, échanges et dates fictifs. Vos messages et vos j’aime sont réels.</p>}
    <ForumLink to="arena" go={go} className="af-forum-arena-link"><Swords size={20} /><span><strong>Une IA à challenger ?</strong><small>Voir l’arène et les résultats</small></span><ArrowRight size={16} /></ForumLink>
  </aside>;
}

export function ThreadList({ topics, go, libraries = [], session, onLike, onFollow, empty = 'Pas encore de discussion ici.', loading = false }) {
  const [share, setShare] = useState(null);
  return <>
    <div className="af-feed-list af-thread-list" aria-busy={loading}>
      {topics.map(topic => {
        const library = libraries.find(item => item.id === topic.library_id);
        return <article className="af-feed-post af-thread-row" key={topic.id} aria-label={topic.title}>
          <header className="af-feed-meta">
            <WorldBadge library={library} onClick={() => go(library ? 'library/' + library.id + '/discussions' : 'community')} />
            <span className="af-feed-dot">·</span><PostTime value={topic.created} />{!!topic.isDemo && <DemoBadge />}
            {topic.following && <Bookmark size={14} className="af-followed-mark" aria-label="Discussion suivie" />}
          </header>
          <div className="af-feed-content"><div>
            <span className={'af-forum-flair af-flair-' + topic.category}>{CATEGORIES[topic.category] || CATEGORIES.general}</span>
            <h2><ForumLink className="af-thread-title" to={'topic/' + topic.id} go={go}>{topic.title}</ForumLink></h2>
            {topic.body && <p className="af-feed-excerpt">{excerpt(topic.body)}</p>}
          </div>{library?.coverUrl && <ForumLink className="af-feed-cover" to={'topic/' + topic.id} go={go} aria-label={'Lire ' + topic.title}><img src={library.coverUrl} alt="" loading="lazy" /></ForumLink>}</div>
          <div className="af-feed-byline"><Author id={topic.owner} name={topic.author} go={go} /><span>·</span><span>{topic.replies ? 'dernière réponse ' : 'publié '}<PostTime value={topic.updated || topic.created} /></span></div>
          <footer className="af-feed-actions">
            {onLike ? <LikeButton post={topic} own={topic.owner === session?.user?.id} onLike={() => onLike(topic)} pending={topic.pendingLike} />
              : <span className="af-forum-action af-vote"><Heart size={16} />{topic.likes || 0}</span>}
            <ForumLink className="af-forum-action" to={'topic/' + topic.id} go={go}><MessageCircle size={16} /><span>{topic.replies || 0} réponse{topic.replies === 1 ? '' : 's'}</span></ForumLink>
            {onFollow && <button className="af-forum-action af-follow-action" aria-label={(topic.following ? 'Ne plus suivre : ' : 'Suivre : ') + topic.title} aria-pressed={!!topic.following} disabled={topic.pendingFollow} onClick={() => onFollow(topic)}><Bookmark size={16} /><span>{topic.following ? 'Suivi' : 'Suivre'}</span></button>}
            <button className="af-forum-action af-share-action" onClick={() => setShare(topic.id)}><ArrowRight size={16} /><span>Partager</span></button>
          </footer>
        </article>;
      })}
      {!topics.length && !loading && <div className="af-empty af-feed-empty"><MessageCircle size={30} /><h3>{empty}</h3><p>Essayez une autre recherche, ou lancez la conversation.</p></div>}
      {!topics.length && loading && <div className="af-forum-loading" role="status">Chargement des discussions…</div>}
    </div>
    {share && <ShareDialog topicId={share} onClose={() => setShare(null)} />}
  </>;
}

export function ForumHome({ api, act, go, newTopic, libraries, stats, session, needAccount }) {
  const [filters, setFilters] = useState(() => readForumFilters(window.sessionStorage));
  const [page, setPage] = useState(1), [data, setData] = useState({ topics: [], total: 0 });
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const [worldsExpanded, setWorldsExpanded] = useState(false), [worldSearch, setWorldSearch] = useState('');
  const pending = useRef(new Set());
  const update = changes => { setFilters(old => ({ ...old, ...changes })); setPage(1); setData({ topics: [], total: 0 }); };
  const selectedWorld = libraries.find(library => library.id === filters.library);
  const createTopic = () => newTopic({ category: filters.category === 'all' ? 'general' : filters.category, libraryId: filters.library });
  useEffect(() => { try { window.sessionStorage.setItem(FORUM_FILTER_KEY, JSON.stringify(filters)); } catch (_) {} }, [filters]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    setError(''); setLoading(true);
    if (filters.feed === 'following' && !session?.user) { setData({ topics: [], total: 0 }); setLoading(false); return () => { current = false; }; }
    const timer = setTimeout(async () => {
      try {
        const result = await api(forumQuery(filters, page), { signal: controller.signal });
        if (current) setData(old => ({ ...result, topics: page === 1 ? result.topics : mergePosts(old.topics, result.topics) }));
      } catch (failure) { if (current && failure.name !== 'AbortError') setError(failure.message); }
      finally { if (current) setLoading(false); }
    }, 180);
    return () => { current = false; clearTimeout(timer); controller.abort(); };
  }, [filters, page, session?.user?.id, retry]); // eslint-disable-line react-hooks/exhaustive-deps

  const changePost = (topic, action) => needAccount(() => act(async () => {
    const key = topic.id + action, pendingKey = action === 'like' ? 'pendingLike' : 'pendingFollow';
    if (pending.current.has(key)) return;
    pending.current.add(key);
    const patch = changes => setData(old => ({ ...old, topics: old.topics.map(item => item.id === topic.id ? { ...item, ...changes } : item) }));
    patch({ [pendingKey]: true });
    try {
      const result = await api(`/topics/${topic.id}/${action}`, { method: 'POST' });
      patch(result);
      if (action === 'follow' && !result.following && filters.feed === 'following') setRetry(value => value + 1);
    } finally { pending.current.delete(key); patch({ [pendingKey]: false }); }
  }));
  const filteredWorlds = libraries.filter(library => library.name.toLocaleLowerCase('fr').includes(worldSearch.toLocaleLowerCase('fr')));
  const total = (stats?.topics || 0) + (stats?.demoTopics || 0);
  const currentTitle = selectedWorld ? shortWorldName(selectedWorld.name) : filters.feed === 'following' ? 'Mes discussions suivies' : CATEGORIES[filters.category] || 'Le fil de la communauté';
  return <div className="af-forum-shell">
    <header className="af-forum-top"><div><span className="af-forum-kicker">LE COIN DES JOUEURS</span><h1>Communauté<span className="af-forum-title-dot">.</span></h1><p>Des idées, des parties, et des gens avec qui jouer.</p></div><button className="af-button primary" onClick={createTopic}><Plus size={18} /><span className="af-compose-long">Nouvelle discussion</span><span className="af-compose-short" aria-hidden="true">Publier</span></button></header>
    <div className="af-forum-columns">
      <aside className="af-forum-nav">
        <nav aria-label="Fils de discussion" className="af-forum-feed-nav">
          <button aria-current={filters.feed === 'all' && filters.category === 'all' && !filters.library ? 'page' : undefined} onClick={() => update({ category: 'all', library: '', feed: 'all' })}><Compass size={18} /><span>Tout le forum</span></button>
          <button aria-current={filters.feed === 'following' ? 'page' : undefined} onClick={() => needAccount(() => update({ feed: 'following', category: 'all', library: '' }))}><Bookmark size={18} /><span>Mes discussions suivies</span></button>
          <button className="af-forum-inbox" onClick={()=>needAccount(()=>go('inbox'))}><Bell size={18} /><span>Notifications</span></button>
        </nav>
        <div className="af-forum-nav-divider" /><h2>Par sujet</h2>
        <nav aria-label="Catégories" className="af-forum-category-nav">{Object.entries(CATEGORIES).map(([id, label]) => {
          const Icon = categoryIcons[id];
          return <button key={id} aria-current={filters.category === id ? 'page' : undefined} onClick={() => update({ category: id, feed: 'all' })}><Icon size={17} /><span>{label}</span><small>{stats?.categoryCounts?.[id] || 0}</small></button>;
        })}</nav>
        <div className="af-forum-nav-divider" /><h2>Par univers</h2>
        <div className="af-forum-world-nav"><label className="af-forum-world-search"><Search size={14} /><input aria-label="Trouver un univers" placeholder="Trouver un univers" value={worldSearch} onChange={event => setWorldSearch(event.target.value)} /></label>
          <button aria-current={!filters.library ? 'page' : undefined} onClick={() => update({ library: '' })}><Gamepad2 size={17} /><span>Tous les univers</span></button>
          {(worldsExpanded || worldSearch ? filteredWorlds : filteredWorlds.slice(0, 5)).map(library => <button key={library.id} aria-current={filters.library === library.id ? 'page' : undefined} onClick={() => update({ library: library.id, feed: 'all' })}>
            {library.coverUrl ? <img src={library.coverUrl} alt="" loading="lazy" /> : <Gamepad2 size={18} />}<span>{shortWorldName(library.name)}</span>{filters.library === library.id && <Check size={14} />}
          </button>)}
          {!filteredWorlds.length && <p>Aucun univers trouvé.</p>}
          {!worldSearch && libraries.length > 5 && <button className="af-worlds-more" onClick={() => setWorldsExpanded(!worldsExpanded)}><ChevronDown size={15} /><span>{worldsExpanded ? 'Réduire la liste' : `Voir les ${libraries.length} univers`}</span></button>}
        </div>
      </aside>

      <section className="af-forum-feed" aria-label="Discussions">
        <label className="af-forum-search"><Search size={19} /><input type="search" aria-label="Chercher dans les discussions" placeholder="Rechercher une discussion…" value={filters.query} onChange={event => update({ query: event.target.value })} /></label>
        <div className="af-forum-mobile-filters"><label>Univers<select aria-label="Univers des discussions" value={filters.library} onChange={event => update({ library: event.target.value })}><option value="">Tous les univers</option>{libraries.map(library => <option key={library.id} value={library.id}>{shortWorldName(library.name)}</option>)}</select></label></div>
        <div className="af-forum-feed-heading"><h2>{currentTitle}</h2><span aria-live="polite">{loading ? 'Chargement…' : `${data.total} discussion${data.total === 1 ? '' : 's'}`}</span></div>
        <div className="af-forum-toolbar"><div className="af-forum-sort" aria-label="Trier les discussions">{sortOptions.map(([id, Icon, label]) => <button key={id} aria-pressed={filters.sort === id} onClick={() => update({ sort: id })}><Icon size={15} />{label}</button>)}</div>
          {!!stats?.demoMembers && <label className="af-forum-members-filter"><input type="checkbox" checked={filters.source === 'members'} onChange={event => update({ source: event.target.checked ? 'members' : 'all' })} />Masquer les exemples</label>}
        </div>
        {(filters.library || filters.category !== 'all' || filters.query || filters.source !== 'all') && <div className="af-forum-active-filters">
          {filters.library && <button onClick={() => update({ library: '' })}>{selectedWorld ? shortWorldName(selectedWorld.name) : 'Univers sélectionné'}<X size={13} /></button>}
          {filters.category !== 'all' && <button onClick={() => update({ category: 'all' })}>{CATEGORIES[filters.category]}<X size={13} /></button>}
          <button onClick={() => update({ ...DEFAULT_FORUM_FILTERS })}>Tout effacer<X size={13} /></button>
        </div>}
        <button className="af-forum-start-post" onClick={createTopic}><span className="af-mini-avatar">{session?.user?.handle?.slice(0, 2).toUpperCase() || <PencilIcon />}</span><span>Une question ? Une création à partager ?</span><Plus size={18} /></button>
        {error ? <div className="af-form-error" role="alert">{error}<button className="af-button" onClick={() => setRetry(value => value + 1)}>Réessayer</button></div>
          : filters.feed === 'following' && !session?.user ? <div className="af-empty"><Bookmark size={28} /><h3>Retrouvez les sujets qui vous intéressent</h3><p>Connectez-vous pour suivre une discussion et recevoir ses nouvelles réponses.</p><button className="af-button primary" onClick={() => needAccount(() => {})}>Se connecter</button></div>
            : <ThreadList topics={data.topics} go={go} libraries={libraries} session={session} loading={loading} onLike={topic => changePost(topic, 'like')} onFollow={topic => changePost(topic, 'follow')} empty={filters.feed === 'following' ? 'Aucune discussion suivie pour le moment' : filters.source === 'members' && !data.total ? 'Les premières discussions de membres vous attendent' : 'Aucune discussion ne correspond'} />}
        {data.topics.length < data.total && <button className="af-button af-load-more" disabled={loading} onClick={() => setPage(value => value + 1)}>{loading ? 'Chargement…' : 'Voir les discussions suivantes'}<ChevronDown size={16} /></button>}
        {!loading && data.topics.length > 0 && data.topics.length >= data.total && <p className="af-forum-end">Vous avez tout lu pour ce fil.</p>}
      </section>
      <ForumAbout library={selectedWorld} go={go} newTopic={createTopic} stats={stats} />
    </div>
    <span className="af-forum-total" aria-label={`${total} discussions disponibles`} />
  </div>;
}
function PencilIcon() { return <MessageCircle size={17} />; }

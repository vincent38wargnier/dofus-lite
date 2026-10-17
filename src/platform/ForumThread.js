import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, ChevronDown, ChevronRight, LockKeyhole, MessageCircle, Minus, Plus, Send, X } from 'lucide-react';
import { FORUM_CATEGORIES as CATEGORIES, mergePosts, replyTree } from './forumModel';
import { Author, DemoBadge, ForumDialog, ForumLink, LikeButton, PostMenu, PostText, PostTime, ShareDialog } from './ForumShared';
import { ForumAbout, WorldBadge } from './ForumFeed';

function ReplyComposer({ body, setBody, target, pending, submit, cancel, autoFocus = false }) {
  return <form className="af-form af-reply-form af-forum-composer" onSubmit={event => { event.preventDefault(); submit(); }} onKeyDown={event => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); event.currentTarget.requestSubmit(); }
    if (event.key === 'Escape' && target) { event.preventDefault(); cancel(); }
  }}>
    {target && <div className="af-reply-target"><MessageCircle size={14} /><span>Répondre à <strong>{target.author}</strong></span><button type="button" className="af-icon" aria-label="Annuler la réponse" onClick={cancel}><X size={15} /></button></div>}
    <label className="af-sr-only" htmlFor="forum-reply-body">Votre réponse</label>
    <textarea id="forum-reply-body" autoFocus={autoFocus} required maxLength={10000} rows={3} placeholder="Ajouter votre réponse…" value={body} onChange={event => setBody(event.target.value)} />
    <div className="af-composer-footer"><span>{body.length > 9000 ? `${body.length} / 10 000` : 'Ctrl / ⌘ + Entrée pour publier'}</span><div>{target && <button type="button" className="af-forum-action" onClick={cancel}>Annuler</button>}<button className="af-button primary" disabled={pending || !body.trim()}><Send size={15} />{pending ? 'Publication…' : 'Répondre'}</button></div></div>
  </form>;
}

function ReplyBranch({ post, depth = 0, topic, session, go, collapsed, toggle, actions, composer, replyTarget }) {
  const isCollapsed = collapsed.has(post.id);
  const own = post.owner === session.user?.id;
  return <div className={'af-comment-branch' + (depth > 0 ? ' af-comment-child' : '')} data-depth={Math.min(depth, 3)}>
    <article className="af-post af-forum-comment" id={'reply-' + post.id}>
      <header>
        <button className="af-collapse-comment" aria-label={(isCollapsed ? 'Déplier' : 'Replier') + ' le message de ' + post.author} aria-expanded={!isCollapsed} onClick={() => toggle(post.id)}>{isCollapsed ? <Plus size={13} /> : <Minus size={13} />}</button>
        <Author id={post.owner} name={post.author} go={go} />
        {post.owner === topic.owner && <span className="af-op-badge">Auteur</span>}
        <PostTime value={post.created} edited={post.edited} />{!!post.isDemo && <DemoBadge />}
        {isCollapsed && <span className="af-collapsed-label">Message replié</span>}
      </header>
      {!isCollapsed && <>
        {post.reply_to && depth === 0 && <span className="af-comment-context">En réponse à un message précédent</span>}
        <PostText body={post.body} />
        <div className="af-post-controls">
          <LikeButton post={post} own={own} pending={actions.busy.has(post.id + 'like')} onLike={() => actions.like(post, 'reply')} />
          {!topic.locked && <button className="af-forum-action" onClick={() => actions.reply(post)}><MessageCircle size={15} />Répondre</button>}
          <PostMenu post={post} own={own} onQuote={!topic.locked ? () => actions.reply(post, true) : null} onEdit={() => actions.edit({ ...post, kind: 'reply' })} onRemove={() => actions.edit({ ...post, kind: 'reply', remove: true })} onReport={() => actions.report('reply', post.id)} onShare={actions.share} />
        </div>
      </>}
    </article>
    {!isCollapsed && <>{replyTarget?.id === post.id && composer}{post.children.length > 0 && <div className={'af-comment-children' + (depth >= 2 ? ' af-comment-flat' : '')}>{post.children.map(child => <ReplyBranch key={child.id} {...{ depth: depth + 1, post: child, topic, session, go, collapsed, toggle, actions, composer, replyTarget }} />)}</div>}</>}
  </div>;
}

export function ThreadPage({ id, api, act, go, session, needAccount, report, libraries = [], newTopic }) {
  const [topic, setTopic] = useState(null), [body, setBody] = useState(''), [replyTarget, setReplyTarget] = useState(null);
  const [editing, setEditing] = useState(null), [share, setShare] = useState(false), [collapsed, setCollapsed] = useState(new Set());
  const [pending, setPending] = useState(false), [busy, setBusy] = useState(new Set()), [error, setError] = useState(''), [reload, setReload] = useState(0);
  const [page, setPage] = useState(1), [loadingMore, setLoadingMore] = useState(false);
  const inFlight = useRef(new Set());
  useEffect(() => {
    let current = true;
    setError('');
    api('/topics/' + id).then(result => { if (current) { setTopic(result); setPage(1); } }).catch(failure => { if (current) setError(failure.message); });
    return () => { current = false; };
  }, [id, reload, session.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const guarded = (key, task) => needAccount(() => act(async () => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key); setBusy(new Set(inFlight.current));
    try { await task(); } finally { inFlight.current.delete(key); setBusy(new Set(inFlight.current)); }
  }));
  const patchPost = (postId, kind, changes) => setTopic(old => kind === 'topic' ? { ...old, ...changes } : { ...old, replies: old.replies.map(post => post.id === postId ? { ...post, ...changes } : post) });
  const like = (post, kind) => guarded(post.id + 'like', async () => patchPost(post.id, kind, await api(`/${kind === 'topic' ? 'topics' : 'replies'}/${post.id}/like`, { method: 'POST' })));
  const reply = (post, quote = false) => needAccount(() => {
    setReplyTarget(post.kind === 'topic' ? null : post);
    if (quote) setBody(`> ${post.author} : ${post.body.split('\n')[0].slice(0, 240)}\n\n`);
    requestAnimationFrame(() => { const input = document.getElementById('forum-reply-body'); input?.focus(); input?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  });
  const submit = () => {
    if (!body.trim() || inFlight.current.has('reply')) return;
    guarded('reply', async () => {
      setPending(true);
      try {
        const result = await api(`/topics/${id}/replies`, { method: 'POST', body: JSON.stringify({ body, replyTo: replyTarget?.id || null }) });
        setTopic(old => ({ ...old, replyCount: old.replyCount + 1, replies: mergePosts(old.replies, [result.reply]) }));
        setBody(''); setReplyTarget(null);
        requestAnimationFrame(() => document.getElementById('reply-' + result.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      } finally { setPending(false); }
    });
  };
  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    await act(async () => {
      const result = await api(`/topics/${id}?page=${page + 1}`);
      setTopic(old => ({ ...old, replyCount: result.replyCount, replies: mergePosts(old.replies, result.replies) })); setPage(value => value + 1);
    });
    setLoadingMore(false);
  };
  if (error) return <div className="af-forum-shell"><button className="af-back" onClick={() => go('community')}><ArrowLeft size={16} />Le forum</button><div className="af-empty" role="alert"><h2>Cette discussion ne s’ouvre pas</h2><p>{error}</p><button className="af-button" onClick={() => setReload(value => value + 1)}>Réessayer</button></div></div>;
  if (!topic) return <p className="af-loading" role="status">Ouverture de la discussion…</p>;
  const library = libraries.find(item => item.id === topic.library_id);
  const actions = { busy, like, reply, edit: setEditing, report, share: () => setShare(true) };
  const toggle = postId => setCollapsed(old => { const next = new Set(old); if (next.has(postId)) next.delete(postId); else next.add(postId); return next; });
  const composer = <ReplyComposer {...{ body, setBody, target: replyTarget, pending, submit }} cancel={() => setReplyTarget(null)} autoFocus={!!replyTarget} />;
  const own = topic.owner === session.user?.id;
  return <div className="af-forum-shell af-thread-shell">
    <div className="af-thread-breadcrumb"><ForumLink to="community" go={go}><ArrowLeft size={16} />Le forum</ForumLink><ChevronRight size={14} /><span>{CATEGORIES[topic.category]}</span></div>
    <div className="af-thread-columns"><section className="af-discussion" aria-label="Discussion">
      <article className="af-post af-discussion-topic">
        <header><WorldBadge library={library} onClick={() => go(library ? 'library/' + library.id : 'community')} /><span className={'af-forum-flair af-flair-' + topic.category}>{CATEGORIES[topic.category]}</span>{!!topic.isDemo && <DemoBadge />}</header>
        <h1>{topic.title}</h1>
        <div className="af-discussion-byline"><Author id={topic.owner} name={topic.author} go={go} /><PostTime value={topic.created} edited={topic.edited} /></div>
        <PostText body={topic.body} />
        <div className="af-post-controls">
          <LikeButton post={topic} own={own} pending={busy.has(topic.id + 'like')} onLike={() => like(topic, 'topic')} />
          <button className="af-forum-action" onClick={() => document.getElementById('forum-comments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}><MessageCircle size={16} />{topic.replyCount} réponse{topic.replyCount === 1 ? '' : 's'}</button>
          <button className="af-forum-action" aria-pressed={!!topic.following} disabled={busy.has('follow')} onClick={() => guarded('follow', async () => patchPost(topic.id, 'topic', await api(`/topics/${id}/follow`, { method: 'POST' })))}><Bookmark size={15} />{topic.following ? 'Discussion suivie' : 'Suivre la discussion'}</button>
          <PostMenu post={topic} own={own} onQuote={!topic.locked ? () => reply({ ...topic, kind: 'topic' }, true) : null} onEdit={() => setEditing({ ...topic, kind: 'topic' })} onRemove={() => setEditing({ ...topic, kind: 'topic', remove: true })} onReport={() => report('topic', topic.id)} onShare={() => setShare(true)} />
        </div>
      </article>
      {!!topic.isDemo && <p className="af-thread-example-note"><DemoBadge />Ce fil commence par un échange fictif. Vous pouvez y répondre avec votre compte.</p>}
      {topic.locked ? <div className="af-forum-locked"><LockKeyhole size={17} />Cette discussion est fermée. Les messages restent consultables.</div>
        : !session.user ? <div className="af-forum-signin"><div><strong>Envie de participer ?</strong><p>Connectez-vous pour répondre ou suivre la discussion.</p></div><button className="af-button primary" onClick={() => needAccount(() => {})}>Se connecter</button></div>
          : !replyTarget && composer}
      <div id="forum-comments" className="af-comments-heading"><h2>La conversation <span>{topic.replyCount}</span></h2><button className="af-forum-action" onClick={() => setCollapsed(collapsed.size ? new Set() : new Set(topic.replies.map(post => post.id)))} disabled={!topic.replies.length}>{collapsed.size ? <Plus size={14} /> : <Minus size={14} />}{collapsed.size ? 'Tout déplier' : 'Tout replier'}</button></div>
      <div className="af-comment-list">{replyTree(topic.replies).map(post => <ReplyBranch key={post.id} {...{ post, topic, session, go, collapsed, toggle, actions, composer, replyTarget }} />)}</div>
      {!topic.replies.length && <div className="af-empty af-no-comments"><MessageCircle size={26} /><h3>La conversation commence ici.</h3><p>Partagez votre expérience ou posez la première question.</p></div>}
      {page * 100 < topic.replyCount && <button className="af-button af-load-more" disabled={loadingMore} onClick={loadMore}>{loadingMore ? 'Chargement…' : 'Voir plus de réponses'}<ChevronDown size={16} /></button>}
    </section><ForumAbout library={library} go={go} newTopic={() => newTopic?.({ category: topic.category, libraryId: topic.library_id || '' })} /></div>
    {share && <ShareDialog topicId={id} onClose={() => setShare(false)} />}
    {editing && <ForumDialog title={editing.remove ? 'Retirer ce message ?' : 'Modifier votre message'} onClose={() => setEditing(null)}><form className="af-form" onSubmit={event => {
      event.preventDefault();
      guarded('edit', async () => {
        await api(`/${editing.kind === 'topic' ? 'topics' : 'replies'}/${editing.id}`, { method: editing.remove ? 'DELETE' : 'PATCH', ...(editing.remove ? {} : { body: JSON.stringify({ title: editing.title, body: editing.body }) }) });
        if (editing.remove && editing.kind === 'topic') go('community');
        else if (editing.remove) {
          setTopic(old => ({ ...old, replyCount: old.replyCount - 1, replies: old.replies.filter(post => post.id !== editing.id) }));
          if (replyTarget?.id === editing.id) setReplyTarget(null);
        } else patchPost(editing.id, editing.kind, { title: editing.title, body: editing.body, edited: new Date().toISOString() });
        setEditing(null);
      });
    }}>
      {editing.remove ? <p>Le message ne sera plus visible. Les réponses des autres participants seront conservées.</p> : <>{editing.kind === 'topic' && <label>Titre<input value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })} required minLength={3} maxLength={150} /></label>}<label>Message<textarea value={editing.body} onChange={event => setEditing({ ...editing, body: event.target.value })} required maxLength={10000} rows={7} /></label></>}
      <div className="af-actions"><button className="af-button primary" disabled={busy.has('edit')}>{editing.remove ? 'Retirer' : 'Enregistrer'}</button><button type="button" className="af-button" onClick={() => setEditing(null)}>Annuler</button></div>
    </form></ForumDialog>}
  </div>;
}

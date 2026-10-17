import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, Copy, Flag, Link, MoreHorizontal, Pencil, Quote, Trash2, X } from 'lucide-react';
import { relativeDate } from './forumModel';

export const fullDate = value => new Date(value).toLocaleString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
export function DemoBadge({ profile = false }) {
  return <span className="af-demo-badge" title={profile ? 'Profil fictif, aucune personne réelle associée' : 'Exemple : profils, échanges et dates fictifs'}>{profile ? 'Profil fictif' : 'Exemple'}</span>;
}
export function DemoNotice() {
  return <aside className="af-demo-notice af-compact-notice"><span className="af-demo-badge">Exemples</span><p>Les profils, échanges et dates associés aux exemples sont fictifs. Les contenus sont jouables.</p></aside>;
}
export function ForumLink({ to, go, children, onClick, ...props }) {
  return <a href={'#/' + to} {...props} onClick={event => {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); onClick?.(); go(to);
  }}>{children}</a>;
}
export function Author({ id, name, demo, go }) {
  const hue = [...String(id || name || '')].reduce((hash, letter) => (hash * 31 + letter.charCodeAt(0)) % 360, 0);
  return <ForumLink className="af-author" to={'player/' + id} go={go}>
    <span className="af-mini-avatar" aria-hidden="true" style={{ background: `hsl(${hue} 22% 23%)`, color: `hsl(${hue} 50% 82%)` }}>{name?.slice(0, 2).toUpperCase()}</span>
    <span>{name}</span>{demo && <DemoBadge profile />}
  </ForumLink>;
}
export function PostTime({ value, edited }) {
  return <time dateTime={value} title={fullDate(value)}>{relativeDate(value)}{edited ? ' · modifié' : ''}</time>;
}
export function PostText({ body }) {
  return <div className="af-post-body">{String(body || '').split('\n').map((line, index) => line.startsWith('>')
    ? <blockquote key={index}>{line.replace(/^>\s?/, '')}</blockquote>
    : <p key={index}>{line || '\u00a0'}</p>)}</div>;
}
export function LikeButton({ post, onLike, own = false, pending = false }) {
  return <button className="af-forum-action af-vote" aria-label={(post.liked ? 'Retirer mon j’aime : ' : 'Aimer : ') + (post.title || 'message de ' + post.author)} aria-pressed={!!post.liked}
    title={own ? 'Vous ne pouvez pas aimer votre propre message' : 'J’aime'} disabled={own || pending} onClick={onLike}>
    <ArrowUp size={17} /><span>{post.likes || 0}</span>
  </button>;
}
export function PostMenu({ post, own, onQuote, onEdit, onRemove, onReport, onShare }) {
  const ref = useRef(null);
  useEffect(() => {
    const close = event => { if (!ref.current?.contains(event.target)) ref.current?.removeAttribute('open'); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);
  const action = callback => () => { ref.current.removeAttribute('open'); callback(); };
  return <details className="af-post-menu" ref={ref} onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); ref.current.removeAttribute('open'); ref.current.querySelector('summary').focus(); }
  }}>
    <summary aria-label={'Options du message de ' + post.author}><MoreHorizontal size={19} /></summary>
    <div className="af-post-menu-items">
      {onQuote && <button onClick={action(onQuote)}><Quote size={15} />Citer</button>}
      <button onClick={action(onShare)}><Link size={15} />Partager</button>
      {own && <button onClick={action(onEdit)}><Pencil size={15} />Modifier</button>}
      {own && <button onClick={action(onRemove)}><Trash2 size={15} />Retirer</button>}
      <button onClick={action(onReport)}><Flag size={15} />Signaler</button>
    </div>
  </details>;
}
export function ForumDialog({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.isConnected && previous.focus?.();
  }, []);
  return <dialog className="af-dialog af-edit-dialog" ref={ref} aria-label={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2>{title}</h2><button className="af-icon" aria-label="Fermer" onClick={onClose}><X size={20} /></button></header>{children}
  </dialog>;
}
export function ShareDialog({ topicId, onClose }) {
  const [copied, setCopied] = useState(false), input = useRef(null);
  const url = window.location.origin + window.location.pathname + '#/topic/' + topicId;
  return <ForumDialog title="Partager la discussion" onClose={onClose}>
    <div className="af-form"><p>Envoyez ce lien pour ouvrir directement la discussion.</p><label>Lien de la discussion<input ref={input} readOnly value={url} onFocus={event => event.target.select()} /></label>
      <button className="af-button primary" onClick={async () => {
        try { await navigator.clipboard.writeText(url); setCopied(true); }
        catch (_) { input.current.focus(); input.current.select(); }
      }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? 'Lien copié' : 'Copier le lien'}</button>
      <span role="status">{copied ? 'Le lien est dans votre presse-papiers.' : 'Vous pouvez aussi sélectionner et copier le lien.'}</span>
    </div>
  </ForumDialog>;
}

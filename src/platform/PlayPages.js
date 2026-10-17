import React from 'react';
import { ArrowDown, ArrowRight, BrainCircuit, Check, Download, Hammer, LockKeyhole, Play, Plus, Swords, Upload, Users } from 'lucide-react';
import { WorldCover } from './LibraryPresentation';
import { DemoBadge } from './ForumShared';
import { canPlayLibrary, recentLibraries } from './playNavigation';

export function PlayHero({ libraries, local, busy, onPlay, onImport, go, fallback }) {
  const featured = libraries.find(library => library.counts?.dungeons > 0 && library.kind !== 'catalogue');
  const browse = () => {
    const heading = document.getElementById('choose-world-heading');
    heading?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    heading?.focus({ preventScroll: true });
  };
  return <>
    <section className="af-play-hero" aria-labelledby="play-heading">
      <div className="af-play-intro">
        <div className="af-eyebrow"><Swords size={15} />DES AVENTURES TACTIQUES, DANS VOTRE NAVIGATEUR</div>
        <h1 id="play-heading">Choisissez un monde.<br /><em>À vous de jouer.</em></h1>
        <p>Des combats au tour par tour, en solo ou avec des amis. Découvrez une aventure et lancez votre partie.</p>
        <div className="af-actions"><button className="af-button primary" onClick={browse}>Choisir une aventure<ArrowDown size={17} /></button>
          {local.length ? <button className="af-button subtle" onClick={() => go('local')}>Retrouver mes jeux <ArrowRight size={17} /></button>
            : <button className="af-button subtle" disabled={busy} onClick={onImport}><Upload size={17} />J’ai déjà un ZIP</button>}</div>
        <p className="af-play-reassurance"><Check size={15} />Gratuit pour jouer <span>·</span> Aucun compte nécessaire</p>
      </div>
      {featured ? <article className="af-featured-game">
        <WorldCover url={featured.coverUrl} fallback={fallback} />
        <div className="af-featured-shade" />
        <div className="af-featured-top"><span>À DÉCOUVRIR</span>{!!featured.isDemo && <DemoBadge />}</div>
        <div className="af-featured-copy"><h2>{featured.name}</h2><p>{featured.counts.rooms || featured.counts.dungeons} salle{(featured.counts.rooms || featured.counts.dungeons) === 1 ? '' : 's'} à explorer</p>
          <div className="af-actions"><button className="af-button primary" disabled={busy} onClick={() => onPlay(featured)}><Play size={16} />Jouer</button>
            <button className="af-button subtle" onClick={() => go('library/' + featured.id)}>Découvrir le monde<ArrowRight size={16} /></button></div></div>
      </article> : <div className="af-play-placeholder">{fallback}<span>Votre prochaine aventure commence ici.</span></div>}
    </section>
    <ol className="af-play-steps" aria-label="Comment commencer"><li><b>1</b><span>Choisissez un monde</span></li><li><b>2</b><span>Installez-le une seule fois</span></li><li><b>3</b><span>Jouez, puis retrouvez-le dans <strong>Mes jeux</strong></span></li></ol>
  </>;
}

export function CreationPage({ go, onImport, onExport, onPublish, busy }) {
  return <section className="af-create-page">
    <div className="af-page-heading"><div className="af-eyebrow"><Hammer size={15} />À VOUS D’INVENTER LA SUITE</div><h1>Vous avez une idée de jeu ?</h1><p>Créez un monde pour vos amis, ou inventez une IA à défier. Les outils vous accompagnent, sans obligation de coder.</p></div>
    <div className="af-creator-choices"><article><Hammer size={27} /><h2>Créer un monde</h2><p>Dessinez vos cartes, inventez vos personnages et assemblez les salles de votre aventure.</p><button className="af-button primary" onClick={() => go('workspace')}>Ouvrir l’Atelier<ArrowRight size={17} /></button></article>
      <article><BrainCircuit size={27} /><h2>Construire une IA</h2><p>Donnez-lui une stratégie, regardez-la jouer et améliorez-la en comparant ses résultats.</p><button className="af-button" onClick={() => go('workspace/ai')}>Ouvrir le Studio IA<ArrowRight size={17} /></button></article></div>
    <section className="af-share-tools"><div><h2>Partager quand vous êtes prêt</h2><p>Un ZIP pour vos amis, ou une publication pour la communauté.</p></div><div className="af-actions">
      <button className="af-button" disabled={busy} onClick={onExport}><Download size={16} />Exporter mes créations</button>
      <button className="af-button" disabled={busy} onClick={onPublish}><Plus size={16} />Publier un monde</button>
      <button className="af-link" disabled={busy} onClick={onImport}><Upload size={16} />Importer un ZIP</button></div></section>
    <p className="af-caption"><LockKeyhole size={14} />L’Atelier est gratuit et vos créations restent privées tant que vous ne les partagez pas.</p>
    <button className="af-link af-return-play" onClick={() => go('explore')}>Vous préférez commencer par jouer ? <ArrowRight size={16} /></button>
  </section>;
}

export function MyGames({ libraries, busy, go, onPlay, onImport, onExport, onDownload, fallback }) {
  return <section className="af-my-games">
    <div className="af-page-heading"><div className="af-eyebrow"><LockKeyhole size={14} />SUR CET APPAREIL</div><h1>Mes jeux</h1><p>Vos mondes installés sont prêts à retrouver. Pas besoin de les télécharger à chaque partie.</p></div>
    <div className="af-section-heading"><h2>{libraries.length ? `${libraries.length} monde${libraries.length === 1 ? '' : 's'} installé${libraries.length === 1 ? '' : 's'}` : 'Votre première aventure vous attend'}</h2><div className="af-actions"><button className="af-button" disabled={busy} onClick={onImport}><Upload size={16} />Importer un ZIP</button><button className="af-link" onClick={() => go('explore')}>Trouver un monde<ArrowRight size={16} /></button></div></div>
    {!libraries.length ? <div className="af-games-empty"><Swords size={34} /><h3>Choisissez un monde et lancez-vous.</h3><p>Installez une aventure de la communauté ou le ZIP d’un ami. Elle apparaîtra ici pour vos prochaines parties.</p><button className="af-button primary" onClick={() => go('explore')}>Choisir une aventure<ArrowRight size={17} /></button></div>
      : <div className="af-library-grid">{recentLibraries(libraries).map((library, index) => <article className="af-library-card af-installed-game" key={library.id}>
        <WorldCover bytes={library.coverBytes} small fallback={fallback(index)} /><div className="af-installed-copy"><span className="af-installed-label"><Check size={14} />Installé sur cet appareil · v{library.release}</span><h3>{library.name}</h3><p>{library.description.split('\n\n')[0]}</p>
          <div className="af-actions"><button className="af-button primary" disabled={busy} onClick={() => onPlay(library)}><Play size={16} />{canPlayLibrary(library) ? 'Jouer' : library.kind === 'characters' ? 'Choisir un personnage' : 'Utiliser ce contenu'}</button><button className="af-link" onClick={() => go('workspace')}>Modifier</button><button className="af-icon" aria-label={'Télécharger ' + library.name} disabled={busy} onClick={() => onDownload(library)}><Download size={18} /></button></div></div>
      </article>)}</div>}
    <div className="af-my-games-footer"><button className="af-link" onClick={() => go('workspace/play')}><Users size={16} />Préparer un combat libre ou entre amis</button><button className="af-link" disabled={busy} onClick={onExport}><Download size={16} />Sauvegarder mes créations</button><button className="af-link" onClick={() => go('create')}><Hammer size={16} />Créer un monde</button></div>
    <p className="af-fineprint">Vos jeux et votre progression sont conservés dans ce navigateur, à cette adresse. Gardez un export avant de changer d’appareil ou d’effacer les données du site.</p>
  </section>;
}

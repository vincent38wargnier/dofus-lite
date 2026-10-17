import React, { useEffect, useState } from 'react';
import App from '../App';
import { RetroAssetsProvider } from '../ui/RetroAssets';
import { buildAtelierArchive, importWorkshopFile } from '../ui/atelierArchive';
import { CREATIONS_STORAGE, readCreations, persistCreationsTogether } from '../ui/creationsStore';
import { CUSTOM_EQUIPMENT_STORAGE } from '../ui/CustomEquipmentContext';
import { readLibrary, LOCAL_LIBRARY_LIMITS } from './libraryFormat';
import { exportLibrary } from './libraryExport';
import { listLocalLibraries, saveLocalLibrary } from './localLibraries';
import { initializeSandbox } from './browserSandbox';
import { libraryCreations, selectionForDungeon, selectionForCatalogue, PLAY_ENTRY_STORAGE, libraryPlayStamp } from './playNavigation';
import { SETUP_STORAGE } from '../ui/playerSetupState';
import { ArrowLeft, ArrowRight, Castle, UserRound } from 'lucide-react';

export async function exportWorkspace(metadata, cover) {
  const creations = readCreations(localStorage);
  if (creations.error) throw new Error(creations.error);
  let equipment = [];
  try { const stored = JSON.parse(localStorage.getItem(CUSTOM_EQUIPMENT_STORAGE)); equipment = stored?.items || []; } catch (_) { /* Empty library. */ }
  const result = await buildAtelierArchive({ ...creations.value, equipment });
  // Carry every installed catalogue needed by snapshots, never the engine.
  return exportLibrary(result.bytes,metadata,cover);
}
async function finishImports() {
  for (const entry of await listLocalLibraries()) if (entry.pending || !entry.imported) {
    const library = await readLibrary(entry.bytes, undefined, LOCAL_LIBRARY_LIMITS);
    if (!library.atelier) {
      await saveLocalLibrary({...entry,pending:false,imported:{characters:[],dungeons:[],equipment:[]}});
      continue;
    }
    // Older installations did not retain import IDs. Restore a private playable
    // snapshot from the saved ZIP once; never guess by name or overwrite edits.
    const previous = localStorage.getItem(CREATIONS_STORAGE), previousItems = localStorage.getItem(CUSTOM_EQUIPMENT_STORAGE);
    try {
      const result = await importWorkshopFile(new File([library.atelier], 'atelier.zip', {type:'application/zip'}), {
        commitCreations: (fn, other) => persistCreationsTogether(localStorage, fn(readCreations(localStorage).value), other),
        importEquipment: incoming => {
          const old = previousItems ? JSON.parse(previousItems) : {version:1,items:[]};
          localStorage.setItem(CUSTOM_EQUIPMENT_STORAGE, JSON.stringify({...old,items:[...old.items,...incoming]}));
        },
      });
      await saveLocalLibrary({...entry,pending:false,imported:{characters:result.characters.map(x=>x.id),dungeons:result.dungeons.map(x=>x.id),equipment:result.equipment.map(x=>x.id)}});
    } catch(error) {
      previous===null?localStorage.removeItem(CREATIONS_STORAGE):localStorage.setItem(CREATIONS_STORAGE,previous);
      previousItems===null?localStorage.removeItem(CUSTOM_EQUIPMENT_STORAGE):localStorage.setItem(CUSTOM_EQUIPMENT_STORAGE,previousItems);
      throw error;
    }
  }
}
export default function Workspace({ onBack, initialTab = 'workshop', libraryId }) {
  const [ready,setReady]=useState(false),[error,setError]=useState('');
  const [world,setWorld]=useState(null),[choices,setChoices]=useState(null),[selection,setSelection]=useState(null);
  const [libraries,setLibraries]=useState([]);
  const [resume,setResume]=useState(false);
  const rememberPlay = library => { if (library) try { localStorage.setItem(PLAY_ENTRY_STORAGE, libraryPlayStamp(library)); } catch (_) { /* Playing remains available without saved navigation. */ } };
  const chooseCharacter = (character, library = world) => { rememberPlay(library); setSelection({ id: `library-character:${character.id}`, tab: 'characters', entry: character, returnTo: 'play', reuseProfile: true }); };
  const chooseDungeon = (dungeon, library = world) => { rememberPlay(library); setSelection(selectionForDungeon(dungeon)); };
  useEffect(()=>{let active=true;Promise.all([finishImports(), initializeSandbox()]).then(async()=>{
    const entries = await listLocalLibraries();
    if (!active) return;
    setLibraries(entries);
    if (libraryId) {
      const entry = entries.find(item => item.id === libraryId);
      if (!entry) throw Error('Ce monde n’est pas installé dans ce navigateur. Retrouvez-le dans Mes jeux ou importez son ZIP.');
      const creations = readCreations(localStorage);
      if (creations.error) throw Error(creations.error);
      const available = libraryCreations(entry, creations.value);
      setWorld(entry); setChoices(available);
      let continuing = false;
      try { continuing = localStorage.getItem(PLAY_ENTRY_STORAGE) === libraryPlayStamp(entry) && !!localStorage.getItem(SETUP_STORAGE); } catch (_) { /* Use the explicitly opened world. */ }
      if (continuing) { setResume(true); setSelection({ id: `resume:${entry.id}`, tab: 'combat', returnTo: 'play', openDialog: true }); }
      else if (available.dungeons.length === 1) chooseDungeon(available.dungeons[0], entry);
      else if (!available.dungeons.length && available.characters.length === 1) chooseCharacter(available.characters[0], entry);
      else if (!available.dungeons.length && !available.characters.length && entry.kind === 'catalogue') {
        rememberPlay(entry);
        setSelection(selectionForCatalogue(entry));
      }
    } else if (initialTab === 'play') setSelection({ id: 'platform-combat', tab: 'combat', returnTo: 'play' });
    setReady(true);
  }).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[libraryId,initialTab]);
  if(error)return <div className="af-empty"><h2>Import à vérifier</h2><p>{error}</p><button onClick={onBack}>Revenir à mes bibliothèques</button></div>;
  if(!ready)return <p className="af-loading" role="status">{initialTab === 'workshop' ? 'Ouverture de votre atelier…' : initialTab === 'editor' ? 'Ouverture du Studio IA…' : 'Préparation de votre jeu…'}</p>;
  if (world && !selection) return <main className="af-app af-world-picker"><button className="af-back" onClick={onBack}><ArrowLeft size={16} />Mes jeux</button>
    <div className="af-page-heading"><div className="af-eyebrow">VOTRE MONDE EST INSTALLÉ</div><h1>{world.name}</h1><p>{choices.dungeons.length ? 'Choisissez votre aventure. Sa progression est conservée sur cet appareil.' : choices.characters.length ? 'Choisissez votre personnage pour préparer un combat.' : 'Ce contenu enrichit vos créations. Ouvrez votre personnage pour utiliser les objets, ou l’Atelier pour les modifier.'}</p></div>
    <div className="af-world-choices">{choices.dungeons.map(dungeon => <button key={dungeon.id} className="af-world-choice" onClick={() => chooseDungeon(dungeon)}><Castle size={24} /><span><strong>{dungeon.name}</strong><small>{dungeon.rooms?.length || 1} salle{dungeon.rooms?.length > 1 ? 's' : ''} · {dungeon.adventure ? 'Héros fournis' : 'Avec vos personnages'}</small></span><ArrowRight size={18} /></button>)}
      {!choices.dungeons.length && choices.characters.map(character => <button key={character.id} className="af-world-choice" onClick={() => chooseCharacter(character)}><UserRound size={24} /><strong>{character.name}</strong><ArrowRight size={18} /></button>)}</div>
    {!choices.dungeons.length && !choices.characters.length && <button className="af-button primary" onClick={() => setSelection({ id: 'platform-items', tab: 'equipment', returnTo: 'play' })}>Ouvrir mon personnage<ArrowRight size={17} /></button>}
  </main>;
  return <RetroAssetsProvider><App initialTab={initialTab} initialSelection={selection} libraries={libraries} initialWorldId={resume ? undefined : libraryId} onPlatformBack={onBack}/></RetroAssetsProvider>;
}

import React, { useMemo, useState } from 'react';
import { Hammer, Plus, Save, Swords, UserRound, Map, Copy, Trash2, GripVertical } from 'lucide-react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { MAPS } from '../engine/maps';
import { DUNGEONS } from '../engine/dungeons';
import { emptyLoadout, resolveLoadout } from '../engine/equipment';
import { defaultMonsterGrade, monsterGrades, POUTCH_ID, KANOJEDO_MAP_ID } from '../engine/monsters';
import { addCustomDungeonMonster, customDungeonErrors, MAX_DUNGEON_MONSTERS } from '../engine/customDungeons';
import { MAX_CUSTOM_SPELLS } from '../engine/customSpells';
import { useCreations } from './CreationsContext';
import { cloneCreation, newCreationId } from './creationsStore';
import { MONSTER_CATALOGUE, CREATION_SPELLS, fold } from './creationCatalogue';
import LoadoutPicker, { useLoadouts } from './LoadoutPicker';
import { useLoadoutLibrary } from './LoadoutsContext';
import { applySavedEquipment } from './loadoutStore';
import { readPlayerSetup } from './playerSetupState';
import MapPicker from './MapPicker';
import { RetroPortrait } from './RetroAssets';
import CharacterArtworkEditor from './CharacterArtworkEditor';
import CreationPackageTools from './CreationPackageTools';
import CustomSpellPicker from './CustomSpellPicker';
import { packageMonsterSummary } from '../content/contentPackage';
import '../styles/workshop.css';

const MAP_IDS = Object.keys(MAPS);
const MONSTER_DRAG_TYPE = 'application/x-dofus-dungeon-monster';
const TRAINING_ROOM = { name: 'Essai au Kanojedo', mapId: KANOJEDO_MAP_ID,
  members: [{ monsterId: POUTCH_ID, grade: 1, count: 1 }] };
const fromRoom = room => ({ name: `${room.name} — ma version`, mapId: room.combatMapId,
  members: room.members.map(member => ({ ...member, grade: defaultMonsterGrade(member.monsterId) })) });
export function newCustomCharacter(classId = 'IOP') {
  return { id: newCreationId(), name: 'Ma classe', classId,
    loadout: { ...emptyLoadout(classId), level: 200, spells: { custom: [], order: [] } } };
}

function DungeonEditor({ dungeon, change }) {
  const [query, setQuery] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bossOnly, setBossOnly] = useState(false);
  const [grades, setGrades] = useState({});
  const [dragged, setDragged] = useState(null);
  const [dropOver, setDropOver] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [editingMonster, setEditingMonster] = useState(null);
  const count = dungeon.members.reduce((sum, member) => sum + member.count, 0);
  const full = count >= MAX_DUNGEON_MONSTERS;
  const monsters = useMemo(() => MONSTER_CATALOGUE.filter(monster => (!bossOnly || monster.boss)
    && (!roomId || monster.rooms.some(room => room.id === roomId))
    && fold(`${monster.name} ${monster.rooms.map(room => room.name).join(' ')}`).includes(fold(query))), [query, roomId, bossOnly]);
  const updateMember = (index, patch) => change({ ...dungeon, members: dungeon.members.map((member, i) => i === index ? { ...member, ...patch } : member) });
  const add = member => {
    const next = addCustomDungeonMonster(dungeon, member);
    if (next === dungeon) return;
    change(next);
    setAnnouncement(`${MONSTER_CATALOGUE.find(monster => monster.id === member.monsterId).name} ajouté au groupe. ${count + 1} sur ${MAX_DUNGEON_MONSTERS} monstres.`);
  };
  const clearDrag = () => { setDragged(null); setDropOver(false); };
  const acceptsDrag = event => Array.from(event.dataTransfer.types).includes(MONSTER_DRAG_TYPE);
  const drop = event => {
    if (!acceptsDrag(event)) return;
    event.preventDefault();
    try {
      const member = JSON.parse(event.dataTransfer.getData(MONSTER_DRAG_TYPE));
      if (member && typeof member === 'object') add(member);
    } catch (_) { /* Ignore unrelated or malformed drag payloads. */ }
    clearDrag();
  };
  return <div className="creator-dungeon-layout">
    <aside className="creator-dungeon-summary">
      <section className={`creator-card creator-roster-dropzone${dragged ? ' accepting' : ''}${dropOver ? ' drop-over' : ''}${full ? ' full' : ''}`}
        aria-label="Groupe du donjon" onDragOver={event => {
          if (!acceptsDrag(event)) return;
          event.preventDefault(); event.dataTransfer.dropEffect = full ? 'none' : 'copy'; setDropOver(!full);
        }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropOver(false); }} onDrop={drop}>
        <div className="creator-section-heading"><h3>Votre groupe</h3><span className="creator-count">{count} / {MAX_DUNGEON_MONSTERS}</span></div>
        <p className="creator-drop-hint">{full ? 'Groupe complet. Retirez un monstre pour en ajouter un autre.' : 'Glissez les monstres du catalogue ici.'}</p>
        <div className="creator-roster">{dungeon.members.map((member, index) => {
          if (member.customMonster) {
            const monster = member.customMonster;
            return <div key={index} className="creator-custom-monster">
              <div className="creator-roster-row"><RetroPortrait monsterId={monster.reference.monsterId} artworkId={monster.artworkId} fallback="🐾" />
                <div><strong>{monster.name}</strong><small>{packageMonsterSummary(monster)}</small></div>
                <div className="creator-quantity"><button type="button" className="btn" disabled={member.count <= 1} aria-label={`Moins de ${monster.name}`} onClick={() => updateMember(index, { count: member.count - 1 })}>−</button>
                  <span>{member.count}</span><button type="button" className="btn" disabled={full} aria-label={`Plus de ${monster.name}`} onClick={() => updateMember(index, { count: member.count + 1 })}>+</button></div>
                <button type="button" className="btn creator-remove-monster" aria-label={`Retirer ${monster.name}`} onClick={() => change({ ...dungeon, members: dungeon.members.filter((_, i) => i !== index) })}>×</button>
              </div>
              <p>{monster.role} · {monster.counterplay}</p>
              <div className="creator-custom-monster-spells">{monster.spells.map(spell => <span key={spell.id}>{spell.name} · {spell.pa} PA</span>)}</div>
              <button type="button" className="btn" onClick={() => setEditingMonster(editingMonster === index ? null : index)}>{editingMonster === index ? 'Fermer les sorts' : `Modifier les sorts de ${monster.name}`}</button>
            </div>;
          }
          const monster = MONSTER_CATALOGUE.find(value => value.id === member.monsterId);
          return <div key={index} className="creator-roster-row" data-monster-id={monster.id} data-grade={member.grade}><RetroPortrait monsterId={monster.id} fallback={monster.emoji} />
            <strong>{monster.name}</strong><label className="field">Niveau<select aria-label={`Niveau de ${monster.name} ${index + 1}`} value={member.grade} onChange={event => updateMember(index, { grade: Number(event.target.value) })}>
              {monsterGrades(monster.id).map(grade => <option key={grade.grade} value={grade.grade}>{grade.level} · {grade.baseHp} PV</option>)}</select></label>
            <div className="creator-quantity"><button type="button" className="btn" disabled={member.count <= 1} aria-label={`Moins de ${monster.name}`} onClick={() => updateMember(index, { count: member.count - 1 })}>−</button>
              <span>{member.count}</span><button type="button" className="btn" disabled={full} aria-label={`Plus de ${monster.name}`} onClick={() => updateMember(index, { count: member.count + 1 })}>+</button></div>
            <button type="button" className="btn creator-remove-monster" aria-label={`Retirer ${monster.name}`} onClick={() => change({ ...dungeon, members: dungeon.members.filter((_, i) => i !== index) })}>×</button></div>;
        })}</div>
        {!count && <div className="creator-empty creator-drop-placeholder"><Plus size={24} /><span>Déposez votre premier monstre</span></div>}
        <p className="creator-drag-feedback" role="status">{announcement}</p>
        <details className="creator-copy-room"><summary>Partir d’une salle existante</summary>
          <label className="field">Salle à copier<select aria-label="Copier une salle de donjon" value="" onChange={event => {
          const room = DUNGEONS.find(value => value.id === event.target.value);
          if (room) change({ ...dungeon, ...fromRoom(room) });
        }}><option value="">Choisir une salle à copier…</option>{DUNGEONS.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          <p className="muted small">Copier une salle remplace le groupe et la carte.</p>
        </details>
      </section>
      <section className="creator-card creator-terrain"><h3><Map size={19} /> Votre terrain</h3>
        <MapPicker value={dungeon.mapId} onChange={mapId => change({ ...dungeon, mapId })} mapIds={MAP_IDS} preview />
      </section>
    </aside>
    {dungeon.members[editingMonster]?.customMonster ? <section className="creator-card creator-monster-spell-editor">
      <h3>{dungeon.members[editingMonster].customMonster.name}</h3>
      <CustomSpellPicker ownerType="monster" loadout={{ level: 200, spells: { custom: dungeon.members[editingMonster].customMonster.spells } }} change={fn => {
        const monster = dungeon.members[editingMonster].customMonster;
        const next = fn({ level: 200, spells: { custom: monster.spells } });
        updateMember(editingMonster, { customMonster: { ...monster, spells: next.spells.custom } });
      }} />
    </section> : <section className="creator-card creator-monster-catalogue"><div className="creator-section-heading"><div><h3>Catalogue des monstres</h3><p>Choisissez un niveau, puis glissez le monstre dans votre groupe. Tous les monstres du catalogue peuvent être mélangés.</p></div><span>{monsters.length} monstres</span></div>
      <div className="creator-monster-filters"><label className="field creator-search">Rechercher un monstre<input type="search" placeholder="Bouftou, Blop, Nowel…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label className="field">Donjon d’origine<select value={roomId} onChange={event => setRoomId(event.target.value)}><option value="">Tous les donjons et monstres</option>{DUNGEONS.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
        <label className="creator-check"><input type="checkbox" checked={bossOnly} onChange={event => setBossOnly(event.target.checked)} /> Boss uniquement</label></div>
      <div className="creator-monster-results">{monsters.map(monster => {
        const available = monsterGrades(monster.id);
        const grade = available.find(value => value.grade === grades[monster.id]) || available.at(-1);
        return <article className={`creator-monster-card${dragged === monster.id ? ' dragging' : ''}`} key={monster.id} data-monster-id={monster.id}
          draggable={!full} onDragStart={event => {
            if (full || event.target.closest('select, button, input')) { event.preventDefault(); return; }
            event.dataTransfer.effectAllowed = 'copy';
            event.dataTransfer.setData(MONSTER_DRAG_TYPE, JSON.stringify({ monsterId: monster.id, grade: grade.grade }));
            event.dataTransfer.setData('text/plain', monster.name);
            event.dataTransfer.setDragImage?.(event.currentTarget.querySelector('.creator-monster-heading'), 26, 30);
            setDragged(monster.id);
          }} onDragEnd={clearDrag}>
          <div className="creator-monster-heading"><RetroPortrait monsterId={monster.id} fallback={monster.emoji} /><div><strong>{monster.name}</strong><small>{monster.boss ? 'Boss' : 'Monstre'} · {monster.rooms[0]?.name || 'Bestiaire'}</small></div><GripVertical size={17} className="creator-monster-grip" aria-hidden="true" /></div>
          <label className="field">Niveau<select aria-label={`Niveau proposé pour ${monster.name}`} value={grade.grade} onChange={event => setGrades(previous => ({ ...previous, [monster.id]: Number(event.target.value) }))}>
            {available.map(value => <option key={value.grade} value={value.grade}>{value.level} · {value.baseHp} PV · {value.basePa} PA · {value.basePm} PM</option>)}</select></label>
          <button type="button" className="btn" disabled={full} onClick={() => add({ monsterId: monster.id, grade: grade.grade })} aria-label={`Ajouter ${monster.name}`}>+ Ajouter au groupe</button>
        </article>;
      })}</div>
      {!monsters.length && <p className="creator-empty">Aucun monstre trouvé. Essayez un autre nom ou un autre donjon.</p>}
    </section>}
  </div>;
}

function CharacterEditor({ character, change }) {
  const [view, setView] = useState('spells');
  const summary = useMemo(() => resolveLoadout(character.classId, character.loadout), [character]);
  const { library } = useLoadoutLibrary();
  const update = (_, next) => change({ ...character, loadout: typeof next === 'function' ? next(character.loadout) : next });
  return <>
    <div className="creator-character-identity creator-card"><RetroPortrait classId={character.classId} artworkId={character.loadout.artworkId} appearance={character.loadout.profile?.sex ? 'female' : 'male'} fallback={CLASSES[character.classId].emoji} />
      <label className="field">Modèle du personnage<select value={character.classId} onChange={event => {
        const classId = event.target.value;
        change({ ...character, classId, loadout: { ...character.loadout, base: emptyLoadout(classId).base } });
      }}>{CLASS_IDS.map(id => <option key={id} value={id}>{CLASSES[id].name}</option>)}</select></label>
      <label className="field">Apparence<select value={character.loadout.profile?.sex || 0} onChange={event => update('A', loadout => ({ ...loadout, profile: { ...loadout.profile, sex: Number(event.target.value) } }))}>
        <option value="0">Masculine</option><option value="1">Féminine</option></select></label>
      <label className="field">Reprendre un stuff<select aria-label="Stuff du personnage personnalisé" value="" onChange={event => {
        const build = library.builds.find(value => value.id === event.target.value);
        if (build) update('A', loadout => applySavedEquipment(loadout, build.loadout));
      }}><option value="">Choisir parmi mes stuffs…</option>{library.builds.map(build => <option key={build.id} value={build.id}>{build.name}</option>)}</select></label>
      <div className="creator-character-totals"><strong>{summary.hp} PV</strong><span>{summary.pa} PA · {summary.pm} PM</span></div>
    </div>
    <p className="muted small">Le modèle détermine l’apparence et le coût des caractéristiques. Votre classe possède son propre nom et jusqu’à {MAX_CUSTOM_SPELLS} sorts, conservés si vous changez de modèle.</p>
    <CharacterArtworkEditor artworkId={character.loadout.artworkId} name={character.name}
      onChange={artworkId => update('A', loadout => ({ ...loadout, artworkId }))} />
    <LoadoutPicker embedded fixedSide="A" classes={{ A: character.classId }} names={{ A: character.name }}
      loadouts={{ A: character.loadout }} summaries={{ A: summary }} update={update} activeView={view} onViewChange={setView} />
  </>;
}

export default function WorkshopScreen({ allBots, onLaunch, active = true, error: launchError }) {
  const creations = useCreations();
  const [tab, setTab] = useState('dungeons');
  const [selectedIds, setSelectedIds] = useState({});
  const [removed, setRemoved] = useState(null);
  const [launchCharacter, setLaunchCharacter] = useState('current');
  const [trialRoom, setTrialRoom] = useState('training');
  const [botId, setBotId] = useState('maison');
  const [error, setError] = useState('');
  const playerSetup = readPlayerSetup(localStorage);
  const currentCustomCharacter = creations.characters.find(entry => entry.id === playerSetup.customCharacterId);
  const playerClass = currentCustomCharacter?.classId || playerSetup.playerClass;
  const equipment = useLoadouts(playerClass, 'IOP');
  const entries = creations[tab];
  const selected = entries.find(entry => entry.id === selectedIds[tab]) || entries[0];
  const update = next => creations.update(previous => ({ ...previous, [tab]: previous[tab].map(entry => entry.id === next.id ? next : entry) }));
  const add = () => {
    const entry = tab === 'characters' ? newCustomCharacter() : { id: newCreationId(), name: 'Mon donjon', mapId: KANOJEDO_MAP_ID, members: [] };
    creations.update(previous => ({ ...previous, [tab]: [...previous[tab], entry] }));
    setSelectedIds(previous => ({ ...previous, [tab]: entry.id })); setError('');
  };
  const character = tab === 'characters' ? selected : launchCharacter === 'current'
    ? currentCustomCharacter || { name: 'Vous', classId: playerClass, loadout: equipment.loadouts.A }
    : creations.characters.find(entry => entry.id === launchCharacter);
  const dungeon = tab === 'dungeons' ? selected : trialRoom === 'training' ? TRAINING_ROOM
    : creations.dungeons.find(entry => entry.id === trialRoom);
  const launchErrors = [...customDungeonErrors(dungeon),
    ...(!character ? ['Choisissez un personnage.'] : !character.name.trim() ? ['Donnez un nom à votre classe.'] : resolveLoadout(character.classId, character.loadout).errors)];
  const launch = automatic => {
    setError('');
    if (launchErrors.length) { setError(launchErrors.join(' ')); return; }
    onLaunch({ id: newCreationId(), character: cloneCreation(character), dungeon: cloneCreation(dungeon), automatic, botId });
  };
  if (!active) return null;
  return <main className="workshop-screen">
    <header className="creator-header"><div><span className="eyebrow"><Hammer size={16} /> L’ATELIER</span><h1>Vos combats, vos créations</h1><p>Composez un donjon, créez votre classe, puis mettez-les à l’épreuve.</p></div>
      <span className="creator-save-status" role="status"><Save size={16} />{creations.error ? 'Modifications non sauvegardées' : 'Sauvegarde automatique · ce navigateur'}</span></header>
    {creations.error && <p className="creator-warning" role="alert">{creations.error}</p>}
    {launchError && <p className="creator-warning" role="alert">{launchError}</p>}
    <div className="creator-tabs" role="tablist" aria-label="Atelier de création">{[['dungeons', 'Mes donjons', Map], ['characters', 'Mes classes', UserRound]].map(([id, label, Icon]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={`btn${tab === id ? ' selected' : ''}`}
      onClick={() => { setTab(id); setError(''); }}><Icon size={18} />{label}<span>{creations[id].length}</span></button>)}</div>
    <CreationPackageTools tab={tab} onImported={(nextTab, id) => { setTab(nextTab); setSelectedIds(previous => ({ ...previous, [nextTab]: id })); setError(''); }} />
    {removed && <div className="creator-undo" role="status">« {removed.entry.name} » supprimé.<button type="button" className="btn" onClick={() => {
      creations.update(previous => ({ ...previous, [removed.tab]: [...previous[removed.tab], removed.entry] })); setRemoved(null);
    }}>Annuler</button></div>}
    <div className="creator-library-strip"><label className="field">{tab === 'dungeons' ? 'Donjon à modifier' : 'Classe à modifier'}<select value={selected?.id || ''} onChange={event => setSelectedIds(previous => ({ ...previous, [tab]: event.target.value }))}>
      {!entries.length && <option value="">Aucune création</option>}{entries.map(entry => <option key={entry.id} value={entry.id}>{entry.name || 'Sans nom'}</option>)}</select></label>
      <button type="button" className="btn primary" onClick={add}><Plus size={17} />{tab === 'dungeons' ? 'Nouveau donjon' : 'Nouvelle classe'}</button>
      {selected && <><button type="button" className="btn" onClick={() => {
        const copy = { ...cloneCreation(selected), id: newCreationId(), name: `${selected.name} — copie` };
        creations.update(previous => ({ ...previous, [tab]: [...previous[tab], copy] })); setSelectedIds(previous => ({ ...previous, [tab]: copy.id }));
      }}><Copy size={16} />Dupliquer</button><button type="button" className="btn subtle" onClick={() => {
        setRemoved({ entry: selected, tab }); creations.update(previous => ({ ...previous, [tab]: previous[tab].filter(entry => entry.id !== selected.id) }));
      }}><Trash2 size={16} />Supprimer</button></>}
    </div>
    {!selected ? <section className="creator-empty creator-welcome"><h2>{tab === 'dungeons' ? 'Imaginez votre prochaine salle' : 'Inventez votre classe'}</h2>
      <p>{tab === 'dungeons' ? `${MONSTER_CATALOGUE.length} monstres, ${MAP_IDS.length} cartes et jusqu’à ${MAX_DUNGEON_MONSTERS} adversaires par salle.` : `Un nom, des images et jusqu’à ${MAX_CUSTOM_SPELLS} sorts. Inventez les vôtres ou choisissez parmi ${CREATION_SPELLS.length} sorts de classes, de monstres et d’invocations.`}</p>
      <button type="button" className="btn primary" onClick={add}>{tab === 'dungeons' ? 'Créer mon premier donjon' : 'Créer ma première classe'}</button></section>
      : <><div className="creator-name-row"><label className="field">{tab === 'dungeons' ? 'Nom du donjon' : 'Nom de la classe'}<input type="text" maxLength={80} required placeholder={tab === 'dungeons' ? 'Ex. La tanière des rois' : 'Ex. Gardien des flammes'} value={selected.name} onChange={event => update({ ...selected, name: event.target.value })} /></label>
        <span className="muted">{tab === 'dungeons' ? 'Une salle · carte et groupe libres' : `${selected.loadout.spells?.custom?.length || 0} / ${MAX_CUSTOM_SPELLS} sorts · arme en plus`}</span></div>
      <section className="creator-launch creator-card" aria-label="Tester la création"><div><h3><Swords size={19} /> À vous de jouer</h3><p>Contrôlez votre personnage ou confiez le combat à une IA.</p></div>
        {tab === 'dungeons' ? <label className="field">Votre personnage<select value={launchCharacter} onChange={event => setLaunchCharacter(event.target.value)}><option value="current">Personnage de Jouer · {currentCustomCharacter?.name || CLASSES[playerClass].name}</option>
          {creations.characters.map(entry => <option key={entry.id} value={entry.id}>{entry.name} · {CLASSES[entry.classId].name}</option>)}</select></label>
          : <label className="field">Salle d’essai<select value={trialRoom} onChange={event => setTrialRoom(event.target.value)}><option value="training">Kanojedo · Poutch niveau 1</option>{creations.dungeons.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>}
        <label className="field">IA du personnage<select value={botId} onChange={event => setBotId(event.target.value)}>{allBots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
        <div className="creator-launch-buttons"><button type="button" className="btn primary" disabled={!!launchErrors.length} onClick={() => launch(false)}>Jouer cette création</button>
          <button type="button" className="btn" disabled={!!launchErrors.length} onClick={() => launch(true)}>Tester avec l’IA</button></div>
        {launchErrors.length > 0 && <p className="creator-warning">{launchErrors.join(' ')}</p>}{error && <p role="alert">{error}</p>}
      </section>
      {tab === 'dungeons' ? <DungeonEditor key={selected.id} dungeon={selected} change={update} /> : <CharacterEditor key={selected.id} character={selected} change={update} />}
    </>}
  </main>;
}

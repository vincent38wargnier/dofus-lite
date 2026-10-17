import { DEFAULT_CLASS_ID } from '../engine/classes';
import { dungeonCapacity, isArmy, removeDungeonMember } from '../engine/encounters';
import { AdventureEditor } from './AdventurePanel';
import { DungeonRoomEditor } from './DungeonCampaign';
import EquipmentWorkshop from './EquipmentWorkshop';
import { useCustomEquipment } from './CustomEquipmentContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Hammer, Plus, Check, Swords, UserRound, Map, Copy, Trash2, GripVertical, Search, Sparkles, BookOpen, Palette, Backpack, ChartNoAxesColumnIncreasing, Castle, ChevronRight, Play, Download, Upload } from 'lucide-react';
import { CLASSES, CLASS_IDS } from '../engine/classes';
import { dungeonMap } from '../engine/customMaps';
import { DUNGEONS } from '../engine/dungeons';
import { emptyLoadout, resolveLoadout } from '../engine/equipment';
import { defaultMonsterGrade, monsterGrades, POUTCH_ID, KANOJEDO_MAP_ID } from '../engine/monsters';
import { addCustomDungeonMonster, addCustomDungeonCharacter, customDungeonErrors } from '../engine/customDungeons';
import { MAX_CUSTOM_SPELLS } from '../engine/customSpells';
import { useCreations } from './CreationsContext';
import { useProfiles } from './ProfilesContext';
import { useWorlds, WorldFilter } from './WorldsContext';
import { characterMatchesWorld } from './worldCatalogue';
import { cloneCreation, newCreationId } from './creationsStore';
import { MONSTER_CATALOGUE, fold } from './creationCatalogue';
import LoadoutPicker from './LoadoutPicker';
import { MapPreview } from './MapPicker';
import CombatMapGallery, { combatMapName } from './CombatMapGallery';
import { RetroPortrait, useRetroAssets } from './RetroAssets';
import { CharacterDialog, NewCharacterDialog } from './CharacterDialog';
import CharacterArtworkEditor from './CharacterArtworkEditor';
import CreationPackageTools from './CreationPackageTools';
import { AtelierExportButton, AtelierExportDialog, AtelierImportDialog } from './AtelierTransfer';
import { DUNGEON_CHARACTER_DRAG, DungeonCharacterCatalogue, DungeonCharacterRow } from './DungeonCharacters';
import CustomSpellPicker from './CustomSpellPicker';
import { packageMonsterSummary } from '../content/contentPackage';
import '../styles/workshop.css';
import '../styles/workshopStudio.css';
import { characterShapeId } from '../visuals/customShapes';
import CreatureEditor from './CreatureEditor';
import MapWorkshop from './MapWorkshopPanel';
import { CREATURE_ROLES, newWorkshopCreature, starterSpell } from './workshopStarters';
import { WorkshopStepIntro } from './WorkshopHelp';
import { dungeonRooms } from '../engine/dungeonCampaign';

const MONSTER_DRAG_TYPE = 'application/x-dofus-dungeon-monster';
const TRAINING_ROOM = process.env.REACT_APP_PLATFORM === '1' ? { name: 'Salle vide', mapId: 'arene', members: [] } : { name: 'Essai au Kanojedo', mapId: KANOJEDO_MAP_ID,
  members: [{ monsterId: POUTCH_ID, grade: 1, count: 1 }] };
const fromRoom = room => ({ name: `${room.name} — ma version`, mapId: room.combatMapId,
  members: room.members.map(member => ({ ...member, grade: defaultMonsterGrade(member.monsterId) })) });
export function newCustomCharacter(classId = DEFAULT_CLASS_ID) {
  return { id: newCreationId(), name: 'Ma classe', classId,
    loadout: { ...emptyLoadout(classId), level: 200, artworkId: characterShapeId(), spells: { custom: [], order: [] } } };
}

function DungeonEditor({ dungeon, change, archiveDungeon = dungeon }) {
  const worlds = useWorlds();
  const [view, setView] = useState(dungeon.members.length ? 'group' : 'map');
  const [catalogue, setCatalogue] = useState('create');
  const [drawingMap, setDrawingMap] = useState(false);
  const [nativeMapsOpen, setNativeMapsOpen] = useState(false);
  const profiles = useProfiles();
  const creations = useCreations();
  const assets = useRetroAssets();
  const [query, setQuery] = useState('');
  const [roomId, setRoomId] = useState('');
  const [bossOnly, setBossOnly] = useState(false);
  const [grades, setGrades] = useState({});
  const [dragged, setDragged] = useState(null);
  const [dropOver, setDropOver] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [editingMonster, setEditingMonster] = useState(null);
  const count = dungeon.members.reduce((sum, member) => sum + member.count, 0);
  const capacity = dungeonCapacity(dungeon);
  const full = count >= capacity;
  const savedCreatures = useMemo(() => {
    if (worlds) return worlds.monsters.filter(monster => worlds.matches('customMonsters', monster.id, worlds.selected)).map(monster => monster.customMonster);
    const seen = new Set();
    return creations.dungeons.flatMap(d => dungeonRooms(d).flatMap(r => r.members.flatMap(m => m.customMonster ? [m.customMonster] : [])))
      .filter(m => !seen.has(m.key) && seen.add(m.key));
  }, [creations.dungeons, worlds]);
  const classCatalogue = worlds?.characters || creations.characters;
  const sourceCharacters = (catalogue === 'profiles' ? profiles?.profiles || [] : classCatalogue)
    .filter(character => characterMatchesWorld(worlds, character));
  const worldRooms = DUNGEONS.filter(room => !worlds || worlds.matches('monsterRooms', room.id, worlds.selected));
  const activeRoomId = worldRooms.some(room => room.id === roomId) ? roomId : '';
  const addCreature = creature => {
    if (full) return;
    const next = { ...cloneCreation(creature), key: `creature-${newCreationId()}` };
    change({ ...dungeon, members: [...dungeon.members, { customMonster: next, count: 1 }] });
    setEditingMonster(dungeon.members.length); setView('group');
  };
  const monsters = useMemo(() => MONSTER_CATALOGUE.filter(monster => (!worlds || worlds.matches('monsters', monster.id, worlds.selected)) && (!bossOnly || monster.boss)
    && (!activeRoomId || monster.rooms.some(room => room.id === activeRoomId))
    && fold(`${monster.name} ${monster.rooms.map(room => room.name).join(' ')}`).includes(fold(query))), [query, activeRoomId, bossOnly, worlds]);
  const updateMember = (index, patch) => change({ ...dungeon, members: dungeon.members.map((member, i) => i === index ? { ...member, ...patch, ...(index === dungeon.encounter?.commander ? { count: 1 } : {}) } : member) });
  const add = member => {
    const next = addCustomDungeonMonster(dungeon, member);
    if (next === dungeon) return;
    change(next);
    setAnnouncement(`${MONSTER_CATALOGUE.find(monster => monster.id === member.monsterId).name} ajouté au groupe. ${count + 1} sur ${capacity} combattants.`);
  };
  const addCharacter = character => {
    const next = addCustomDungeonCharacter(dungeon, character);
    if (next === dungeon) return;
    change(next); setAnnouncement(`${character.name} ajouté avec ses sorts et son équipement. ${count + 1} sur ${capacity} combattants.`);
  };
  const removeMember = index => {
    change(removeDungeonMember(dungeon, index));
    if (editingMonster === index) setEditingMonster(null);
    else if (editingMonster > index) setEditingMonster(editingMonster - 1);
  };
  const clearDrag = () => { setDragged(null); setDropOver(false); };
  const acceptsDrag = event => Array.from(event.dataTransfer.types).some(type => [MONSTER_DRAG_TYPE, DUNGEON_CHARACTER_DRAG].includes(type));
  const drop = event => {
    if (!acceptsDrag(event)) return;
    event.preventDefault();
    try {
      if (Array.from(event.dataTransfer.types).includes(DUNGEON_CHARACTER_DRAG)) {
        const payload = JSON.parse(event.dataTransfer.getData(DUNGEON_CHARACTER_DRAG));
        const source = payload?.source === 'profiles' ? profiles?.profiles : payload?.source === 'classes' ? classCatalogue : [];
        const character = source?.find(entry => entry.id === payload.id);
        if (character) addCharacter(character);
      } else {
        const member = JSON.parse(event.dataTransfer.getData(MONSTER_DRAG_TYPE));
        if (member && typeof member === 'object') add(member);
      }
    } catch (_) { /* Ignore unrelated or malformed drag payloads. */ }
    clearDrag();
  };
  return <>
    <nav className="studio-editor-tabs" aria-label="Rubriques du donjon">
      <button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}><Map size={18} />1. Terrain</button>
      <button type="button" aria-pressed={view === 'group'} onClick={() => setView('group')}><UserRound size={18} />2. Créatures<span>{count}/{capacity}</span></button>
      <button type="button" aria-pressed={view === 'adventure'} onClick={() => setView('adventure')}><Sparkles size={18} />3. Prêt à jouer{dungeon.adventure && <Check size={14} />}</button>
    </nav>
    {view === 'adventure' && <><WorkshopStepIntro number="3" title="Prêt pour les héros">Laissez les joueurs utiliser leurs personnages, ou fournissez une équipe équipée. Le bouton Tester ouvre ensuite le menu de combat ; Exporter emporte toutes les salles et leurs images.</WorkshopStepIntro><AdventureEditor dungeon={dungeon} archiveDungeon={archiveDungeon} onChange={change} /></>}
    <div hidden={view !== 'map'} className="studio-map-panel">{view === 'map' && (drawingMap ? <MapWorkshop initial={dungeon.battlefield} onCancel={() => setDrawingMap(false)} onSave={battlefield => { change({ ...dungeon, battlefield, mapId: battlefield.id }); setDrawingMap(false); setView('group'); }} /> : <>
      <WorkshopStepIntro number="1" title="Où se déroule le combat ?">Créez votre propre terrain en peignant ses cases, ou choisissez une carte existante. Aucun fichier n’est nécessaire.</WorkshopStepIntro>
      <div className="workshop-map-choice"><button type="button" className="workshop-start-card" onClick={() => setDrawingMap(true)}><Map size={30}/><strong>{dungeon.battlefield ? 'Modifier mon terrain' : 'Dessiner mon terrain'}</strong><span>Sol, obstacles, départs · aperçu immédiat</span></button>
        <button type="button" className="studio-terrain-card" onClick={() => setView('group')}><MapPreview map={dungeonMap(dungeon)} artwork={assets?.imagesReady && assets.maps[dungeon.mapId]} /><span><small>TERRAIN ACTUEL</small><strong>{combatMapName(dungeonMap(dungeon))}</strong><span>Garder et passer aux créatures →</span></span></button></div>
      <details className="workshop-native-maps" open={nativeMapsOpen}><summary onClick={e => { e.preventDefault(); setNativeMapsOpen(!nativeMapsOpen); }}>Choisir dans les cartes du jeu</summary>{nativeMapsOpen && <CombatMapGallery mapId={dungeon.mapId} onChoose={(mapId, selectedMap) => { const { battlefield, ...next } = dungeon; change({ ...next, mapId, ...(selectedMap ? { battlefield: cloneCreation(selectedMap) } : {}) }); setView('group'); }} />}</details>
    </>)}</div>
    <div hidden={view !== 'group'} className="creator-dungeon-layout">
    <aside className="creator-dungeon-summary">
      <section className={`creator-card creator-roster-dropzone${dragged ? ' accepting' : ''}${dropOver ? ' drop-over' : ''}${full ? ' full' : ''}`}
        aria-label="Groupe du donjon" onDragOver={event => {
          if (!acceptsDrag(event)) return;
          event.preventDefault(); event.dataTransfer.dropEffect = full ? 'none' : 'copy'; setDropOver(!full);
        }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropOver(false); }} onDrop={drop}>
        <div className="creator-section-heading"><h3>Votre salle</h3><span className="creator-count">{count} / {capacity}</span></div>
        <label className="field creator-army-switch"><span><input type="checkbox" checked={isArmy(dungeon.encounter)} disabled={count > 8}
          onChange={event => { const { encounter, ...rest } = dungeon; change(event.target.checked ? { ...rest, encounter: { version: 1, mode: 'army', commander: null } } : rest); }} /> Mode armée · jusqu’à 32 ennemis</span></label>
        {isArmy(dungeon.encounter) && <label className="field">Victoire<select aria-label="Commandant de l’armée" value={dungeon.encounter.commander ?? ''} onChange={event => change({ ...dungeon, encounter: { ...dungeon.encounter, commander: event.target.value === '' ? null : Number(event.target.value) } })}>
          <option value="">Éliminer toute l’armée</option>{dungeon.members.map((m, i) => m.count === 1 && <option key={i} value={i}>Vaincre {m.character?.name || m.customMonster?.name || MONSTER_CATALOGUE.find(v => v.id === m.monsterId)?.name}</option>)}</select>
          <small>{dungeon.encounter.commander == null ? 'Les alliés restent limités à 8.' : 'Les autres ennemis meurent avec ce commandant.'}{count > 8 ? ' Retirez des ennemis pour revenir à une salle classique.' : ''}</small></label>}
        <p className="creator-drop-hint">{full ? 'Groupe complet. Retirez un combattant pour en ajouter un autre.' : 'Glissez vos personnages et monstres ici.'}</p>
        <div className="creator-roster">{dungeon.members.map((member, index) => {
          if (member.character) return <DungeonCharacterRow key={index} member={member} full={full || index === dungeon.encounter?.commander} onQuantity={count => updateMember(index, { count })} onRemove={() => removeMember(index)} />;
          if (member.customMonster) {
            const monster = member.customMonster;
            return <div key={index} className="creator-custom-monster">
              <div className="creator-roster-row"><RetroPortrait monsterId={monster.reference.monsterId} artworkId={monster.artworkId} fallback="🐾" />
                <div><strong>{monster.name}</strong><small>{packageMonsterSummary(monster)}</small></div>
                <div className="creator-quantity"><button type="button" className="btn" disabled={member.count <= 1} aria-label={`Moins de ${monster.name}`} onClick={() => updateMember(index, { count: member.count - 1 })}>−</button>
                  <span>{member.count}</span><button type="button" className="btn" disabled={full || index === dungeon.encounter?.commander} aria-label={`Plus de ${monster.name}`} onClick={() => updateMember(index, { count: member.count + 1 })}>+</button></div>
                <button type="button" className="btn creator-remove-monster" aria-label={`Retirer ${monster.name}`} onClick={() => removeMember(index)}>×</button>
              </div>
              <p>{monster.role} · {monster.counterplay}</p>
              <div className="creator-custom-monster-spells">{monster.spells.map(spell => <span key={spell.id}>{spell.name} · {spell.pa} PA</span>)}</div>
              <button type="button" className="btn" onClick={() => setEditingMonster(editingMonster === index ? null : index)}>{editingMonster === index ? 'Fermer la créature' : `Modifier ${monster.name}`}</button>
            </div>;
          }
          const monster = MONSTER_CATALOGUE.find(value => value.id === member.monsterId);
          return <div key={index} className="creator-roster-row" data-monster-id={monster.id} data-grade={member.grade}><RetroPortrait monsterId={monster.id} fallback={monster.emoji} />
            <strong>{monster.name}</strong><label className="field">Niveau<select aria-label={`Niveau de ${monster.name} ${index + 1}`} value={member.grade} onChange={event => updateMember(index, { grade: Number(event.target.value) })}>
              {monsterGrades(monster.id).map(grade => <option key={grade.grade} value={grade.grade}>{grade.level} · {grade.baseHp} PV</option>)}</select></label>
            <div className="creator-quantity"><button type="button" className="btn" disabled={member.count <= 1} aria-label={`Moins de ${monster.name}`} onClick={() => updateMember(index, { count: member.count - 1 })}>−</button>
              <span>{member.count}</span><button type="button" className="btn" disabled={full || index === dungeon.encounter?.commander} aria-label={`Plus de ${monster.name}`} onClick={() => updateMember(index, { count: member.count + 1 })}>+</button></div>
            <button type="button" className="btn creator-remove-monster" aria-label={`Retirer ${monster.name}`} onClick={() => removeMember(index)}>×</button></div>;
        })}</div>
        {!count && <div className="creator-empty creator-drop-placeholder"><Plus size={24} /><span>Déposez votre premier combattant</span></div>}
        <p className="creator-drag-feedback" role="status">{announcement}</p>
        <details className="creator-copy-room"><summary>Partir d’une salle existante</summary>
          <WorldFilter />
          <label className="field">Salle à copier<select aria-label="Copier une salle de donjon" value="" onChange={event => {
          const room = DUNGEONS.find(value => value.id === event.target.value);
          if (room) { const { battlefield, encounter, ...rest } = dungeon; change({ ...rest, ...fromRoom(room) }); }
        }}><option value="">Choisir une salle à copier…</option>{worldRooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
          <p className="muted small">Copier une salle remplace le groupe et la carte.</p>
        </details>
      </section>
      <button type="button" className="studio-terrain-card" aria-label="Changer de carte" onClick={() => setView('map')}>
        <MapPreview map={dungeonMap(dungeon)} artwork={assets?.imagesReady && assets.maps[dungeon.mapId]} />
        <span><small>LE TERRAIN</small><strong>{combatMapName(dungeonMap(dungeon))}</strong><span>Changer de carte <ChevronRight size={14} /></span></span>
      </button>
    </aside>
    {dungeon.members[editingMonster]?.customMonster ? <CreatureEditor key={dungeon.members[editingMonster].customMonster.key} monster={dungeon.members[editingMonster].customMonster}
      onChange={customMonster => updateMember(editingMonster, { customMonster })} onClose={() => setEditingMonster(null)} />
    : <section className="creator-card creator-monster-catalogue"><WorkshopStepIntro number="2" title="Qui les héros vont-ils affronter ?">Créez une créature en partant d’un rôle, puis ajoutez plusieurs exemplaires avec +. Deux ou trois ennemis suffisent pour une première salle.</WorkshopStepIntro>
      <nav className="dungeon-catalogue-tabs" aria-label="Catalogue du donjon">
        {[['create', 'Mes créatures', savedCreatures.length], ['monsters', 'Bestiaire du jeu', MONSTER_CATALOGUE.filter(m => !worlds || worlds.matches('monsters', m.id, worlds.selected)).length], ['profiles', 'Mes personnages', (profiles?.profiles || []).filter(c => characterMatchesWorld(worlds, c)).length], ['classes', 'Mes classes', classCatalogue.filter(c => characterMatchesWorld(worlds, c)).length]].map(([id, label, size]) =>
          <button key={id} type="button" aria-pressed={catalogue === id} onClick={() => { setCatalogue(id); setQuery(''); }}><span>{label}</span><span>{size}</span></button>)}
      </nav>
      <WorldFilter onChange={id => { setRoomId(''); worlds.select(id); }} />
      {catalogue === 'create' ? <>
        <div className="workshop-role-cards">{Object.entries(CREATURE_ROLES).map(([id, role]) => <button type="button" className="workshop-start-card" key={id} disabled={full} onClick={() => addCreature(newWorkshopCreature(id))}><RetroPortrait artworkId={characterShapeId(id === 'guard' ? 'warden' : id === 'support' ? 'mystic' : 'wanderer',role.color)} /><strong>Créer un {role.label.toLowerCase()}</strong><span>{role.description}</span><small>2 sorts prêts · tout est modifiable</small></button>)}</div>
        {!!savedCreatures.length && <><h4>Réutiliser une créature</h4><div className="workshop-creature-library">{savedCreatures.map(m => <article key={m.key}><RetroPortrait artworkId={m.artworkId} monsterId={m.reference.monsterId}/><div><strong>{m.name}</strong><small>{m.spells.length} sorts · copie indépendante</small></div><button type="button" className="btn" disabled={full} onClick={() => addCreature(m)} aria-label={`Ajouter une copie de ${m.name}`}><Plus size={16}/></button></article>)}</div></>}
      </> : catalogue !== 'monsters' ? <>
        <label className="field dungeon-character-search">Rechercher un personnage<input type="search" placeholder="Nom du personnage ou de sa classe…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <DungeonCharacterCatalogue entries={sourceCharacters} source={catalogue} query={query} full={full} dragged={dragged} onAdd={addCharacter} onDrag={setDragged} onDragEnd={clearDrag} />
      </> : <><div className="creator-monster-filters"><label className="field creator-search">Rechercher un monstre<input type="search" placeholder="Rechercher par nom…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label className="field">Donjon d’origine<select value={activeRoomId} onChange={event => setRoomId(event.target.value)}><option value="">Tous les donjons et monstres</option>{worldRooms.map(room => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label>
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
      </>}
    </section>}
  </div>
    {view === 'group' && editingMonster === null && <div className="workshop-step-footer"><button type="button" className="btn" onClick={() => setView('map')}>← Terrain</button><button type="button" className="btn primary" onClick={() => setView('adventure')}>Choisir les héros →</button></div>}
  </>;
}

function CharacterEditor({ character, change }) {
  const worlds = useWorlds();
  const [view, setView] = useState('spells');
  const [visited, setVisited] = useState({ spells: true });
  const summary = useMemo(() => resolveLoadout(character.classId, character.loadout), [character]);
  const update = (_, next) => change({ ...character, loadout: typeof next === 'function' ? next(character.loadout) : next });
  const navigate = id => { setView(id); setVisited(previous => ({ ...previous, [id]: true })); };
  return <>
    <nav className="studio-editor-tabs" aria-label="Rubriques de la classe">
      {[['spells', 'Sorts', BookOpen], ['appearance', 'Apparence', Palette], ['equipment', 'Équipement', Backpack], ['stats', 'Caractéristiques', ChartNoAxesColumnIncreasing]].map(([id, label, Icon]) =>
        <button type="button" key={id} aria-pressed={id === 'equipment' ? ['equipment', 'forge'].includes(view) : view === id} onClick={() => navigate(id)}><Icon size={18} />{label}</button>)}
    </nav>
    <div hidden={view !== 'spells'}>
      <WorkshopStepIntro number="1" title="Que sait faire votre classe ?">Partez de quelques actions complémentaires, puis modifiez-les. Les budgets vous aident à garder un ensemble raisonnable.</WorkshopStepIntro>
      {!character.loadout.spells?.custom?.length && <div className="workshop-role-cards">{[['Combattant', ['attack','boost','teleport']], ['Soigneur', ['attack','heal','boost']], ['Contrôleur', ['attack','debuff','teleport']]].map(([label,presets]) => <button key={label} type="button" className="workshop-start-card" onClick={() => {
        const spells=[];presets.forEach(preset=>{const spell=starterSpell(preset,spells);spell.name={attack:'Frappe précise',boost:'Concentration',heal:'Soin',debuff:'Entrave',teleport:'Bond arcanique'}[preset];spells.push(spell);});
        update('A',loadout=>({...loadout,spells:{...loadout.spells,custom:spells,order:spells.map(s=>s.id)}}));
      }}><BookOpen size={23}/><strong>{label}</strong><span>3 sorts modifiables · visuels originaux</span></button>)}</div>}
      {character.templateSource && <p className="class-template-help">Votre nouvelle classe garde ce modèle comme référence. Choisissez jusqu’à dix sorts ; les budgets restent vérifiés.</p>}
      <CustomSpellPicker initialSource={character.templateSource || ''} loadout={character.loadout} change={next => update('A', next)} /></div>
    <div hidden={view !== 'appearance'}>{visited.appearance && <>
      <CharacterArtworkEditor artworkId={character.loadout.artworkId} name={character.name}
        onChange={artworkId => update('A', loadout => ({ ...loadout, artworkId }))} />
      {!character.loadout.artworkId && <label className="field studio-native-appearance">Apparence<select value={character.loadout.profile?.sex || 0} onChange={event => update('A', loadout => ({ ...loadout, profile: { ...loadout.profile, sex: Number(event.target.value) } }))}>
        <option value="0">Masculine</option><option value="1">Féminine</option></select></label>}
    </>}</div>
    <div hidden={!['equipment', 'forge', 'stats'].includes(view)}>
      {view === 'stats' && <div className="studio-reference-class"><WorldFilter /><label className="field">Classe de référence<select value={character.classId} onChange={event => {
        const classId = event.target.value;
        change({ ...character, classId, loadout: { ...character.loadout, base: emptyLoadout(classId).base } });
      }}>{worlds && !worlds.matches('classes', character.classId, worlds.selected) && <option value={character.classId}>{CLASSES[character.classId].name} · modèle actuel</option>}{CLASS_IDS.filter(id => !worlds || worlds.matches('classes', id, worlds.selected)).map(id => <option key={id} value={id}>{CLASSES[id].name}</option>)}</select></label><p>Détermine le coût des caractéristiques et l’apparence de référence. Vos sorts restent libres.</p></div>}
      {(visited.equipment || visited.stats) && <LoadoutPicker embedded hideNavigation fixedSide="A" inventoryKey={`creation:${character.id}`}
        classes={{ A: character.classId }} names={{ A: character.name }} loadouts={{ A: character.loadout }} summaries={{ A: summary }} update={update}
        activeView={['equipment', 'forge', 'stats'].includes(view) ? view : 'equipment'} onViewChange={navigate} />}
    </div>
  </>;
}

function CreationThumbnail({ entry, type }) {
  const assets = useRetroAssets();
  if (type === 'characters') return <RetroPortrait classId={entry.classId} artworkId={entry.loadout.artworkId}
    appearance={entry.loadout.profile?.sex ? 'female' : 'male'} fallback={CLASSES[entry.classId].emoji} />;
  return <MapPreview map={dungeonMap(entry)} artwork={assets?.imagesReady && assets.maps[entry.mapId]} />;
}
const creationCount = (entry, type) => type === 'characters'
  ? `${entry.loadout.spells?.custom?.length || 0} / ${MAX_CUSTOM_SPELLS} sorts`
  : `${entry.rooms?.length > 1 ? `${entry.rooms.length} salles` : `${entry.members.reduce((sum, member) => sum + member.count, 0)} / ${dungeonCapacity(entry)} combattants`}${entry.adventure ? ' · Prêt à jouer' : ''}`;
const CATEGORIES = [
  { id: 'characters', label: 'Mes personnages', detail: 'Équipement, sorts et classes', icon: UserRound },
  { id: 'dungeons', label: 'Mes donjons', detail: 'Vos salles, votre bestiaire', icon: Castle },
  { id: 'equipment', label: 'Mes équipements', detail: 'Une allure, les bons bonus', icon: Hammer },
];

export default function WorkshopScreen({ allBots, onLaunch, onTestDungeon, active = true, error: launchError, editorRequest, onDone }) {
  const creations = useCreations();
  const worlds = useWorlds();
  const profiles = useProfiles();
  const equipmentLibrary = useCustomEquipment();
  const [tab, setTab] = useState('dungeons');
  const [selectedIds, setSelectedIds] = useState({});
  const [removed, setRemoved] = useState(null);
  const [trialRoom, setTrialRoom] = useState('training');
  const [botId, setBotId] = useState('maison');
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [browsingCharacters, setBrowsingCharacters] = useState(false);
  const copyClass = source => {
    worlds?.select('all');
    const entry = { ...cloneCreation(source), id: newCreationId(), name: `${source.name} · ma version`.slice(0, 80) };
    creations.update(previous => ({ ...previous, characters: [...previous.characters, entry] }));
    setTab('characters'); setBrowsingCharacters(false); setSelectedIds(previous => ({ ...previous, characters: entry.id })); setLibraryQuery(''); setDialog(null);
  };
  const [libraryQuery, setLibraryQuery] = useState('');
  const [equipmentVisited, setEquipmentVisited] = useState(false);
  const [packageThemes, setPackageThemes] = useState({});
  const [importedEquipment, setImportedEquipment] = useState(null);
  const entries = creations[tab] || [];
  const visibleEntries = entries.filter(entry => (!worlds || worlds.matches(tab, entry.id, worlds.selected)) && fold(entry.name).includes(fold(libraryQuery)));
  const visibleProfiles = (profiles?.profiles || []).filter(profile => characterMatchesWorld(worlds, profile));
  const selected = tab === 'characters' && browsingCharacters ? null : entries.find(entry => entry.id === selectedIds[tab]) || entries[0];
  const update = next => creations.update(previous => ({ ...previous, [tab]: previous[tab].map(entry => entry.id === next.id ? next : entry) }));
  const add = (target = tab) => {
    worlds?.select('all');
    setBrowsingCharacters(false);
    const entry = target === 'characters' ? newCustomCharacter() : { id: newCreationId(), name: 'Mon donjon', mapId: process.env.REACT_APP_PLATFORM === '1' ? 'arene' : KANOJEDO_MAP_ID, members: [] };
    creations.update(previous => ({ ...previous, [target]: [...previous[target], entry] }));
    setSelectedIds(previous => ({ ...previous, [target]: entry.id })); setError('');
  };
  const handledRequest = useRef(null);
  useEffect(() => {
    if (!editorRequest || handledRequest.current === editorRequest.id) return;
    handledRequest.current = editorRequest.id;
    setTab(editorRequest.tab); setError(''); setBrowsingCharacters(!!editorRequest.browse);
    if (editorRequest.entryId) setSelectedIds(previous => ({ ...previous, [editorRequest.tab]: editorRequest.entryId }));
    else if (!editorRequest.browse) add(editorRequest.tab);
    // A navigation request creates at most one draft, including under StrictMode.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRequest]);
  const character = tab === 'characters' ? selected : null;
  const dungeon = trialRoom === 'training' ? TRAINING_ROOM
    : creations.dungeons.find(entry => entry.id === trialRoom);
  const launchErrors = [...customDungeonErrors(dungeon), ...(dungeon?.adventure ? ['Cette aventure utilise ses propres héros. Testez-la depuis Mes donjons.'] : []),
    ...(!character ? ['Choisissez un personnage.'] : !character.name.trim() ? ['Donnez un nom à votre classe.'] : resolveLoadout(character.classId, character.loadout).errors)];
  const launch = automatic => {
    setError('');
    if (launchErrors.length) { setError(launchErrors.join(' ')); return; }
    setDialog(null);
    onLaunch({ id: newCreationId(), character: cloneCreation(character), dungeon: cloneCreation(dungeon), automatic, botId });
  };
  if (!active) return null;
  return <main className="workshop-screen workshop-studio">
    {editorRequest && <div className="creator-return-bar"><button type="button" className="btn" onClick={() => onDone(editorRequest.browse ? 'combat' : editorRequest.tab)}>← Retour {editorRequest.browse || editorRequest.returnTo === 'arena' ? 'au combat' : tab === 'characters' ? 'aux personnages' : 'aux donjons'}</button>
      {selected && tab !== 'equipment' && <button type="button" className="btn primary" disabled={!!creations.error || (tab === 'dungeons' ? customDungeonErrors(selected).length > 0 : !selected.name.trim() || !resolveLoadout(selected.classId, selected.loadout).valid)}
        onClick={() => onDone(tab, cloneCreation(selected))}>{tab === 'characters' ? 'Créer un personnage avec cette classe' : 'Choisir ce donjon'}</button>}</div>}
    <header className="studio-heading"><div><span className="studio-eyebrow"><Sparkles size={15} /> VOTRE JEU, VOS RÈGLES</span><h1>L’Atelier<span>.</span></h1><p>Créez à la main. L’aide IA reste à portée de chaque étape.</p></div>
      <div className="studio-transfer-tools"><div><button type="button" className="btn" onClick={() => setDialog('import-archive')}><Upload size={17} />Importer un ZIP</button>
        <button type="button" className="btn" onClick={() => setDialog('export')}><Download size={17} />Exporter</button></div>
        <span className="creator-save-status" role="status"><Check size={16} />{tab === 'equipment' ? 'Enregistrez quand votre objet est prêt' : creations.error ? 'Modifications non sauvegardées' : 'Vos créations se sauvegardent ici'}</span></div></header>
    {creations.error && <p className="creator-warning" role="alert">{creations.error}</p>}
    {launchError && <p className="creator-warning" role="alert">{launchError}</p>}
    <div className="studio-categories" role="tablist" aria-label="Atelier de création">{CATEGORIES.map(({ id, label, detail, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1}
      className={`studio-category ${id}${tab === id ? ' selected' : ''}`} onClick={() => { setTab(id); setLibraryQuery(''); setError(''); if (id === 'characters' && profiles) setBrowsingCharacters(true); if (id === 'equipment') setEquipmentVisited(true); }}
      onKeyDown={event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const index = CATEGORIES.findIndex(category => category.id === id); const next = event.key === 'Home' ? 0 : event.key === 'End' ? CATEGORIES.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + CATEGORIES.length) % CATEGORIES.length; const buttons = event.currentTarget.parentElement.querySelectorAll('[role="tab"]'); buttons[next].click(); buttons[next].focus(); } }}>
      <span className="studio-category-icon"><Icon size={25} strokeWidth={1.7} /></span><span className="studio-category-label"><strong>{label}</strong><small>{detail}</small></span>
      <span className="studio-category-count">{id === 'equipment' ? equipmentLibrary?.items.length || 0 : id === 'characters' && profiles ? profiles.profiles.length : creations[id].length}</span></button>)}</div>
    {(equipmentVisited || tab === 'equipment') && <div hidden={tab !== 'equipment'}><EquipmentWorkshop embedded importedEquipment={importedEquipment} /></div>}
    {tab !== 'equipment' && <>
      {removed?.tab === tab && <div className="creator-undo" role="status">« {removed.entry.name} » supprimé.<button type="button" className="btn" onClick={() => {
        const restored = removed; creations.update(previous => ({ ...previous, [restored.tab]: [...previous[restored.tab], restored.entry] }));
        setTab(restored.tab); setSelectedIds(previous => ({ ...previous, [restored.tab]: restored.entry.id })); setRemoved(null);
      }}>Annuler</button></div>}
      <div className="studio-workspace">
        <aside className="studio-library" aria-label={tab === 'characters' ? 'Mes classes enregistrées' : 'Mes donjons enregistrés'}>
          <WorldFilter />
          {tab === 'characters' && profiles && <section className="studio-saved-characters" aria-label="Mes personnages sauvegardés">
            <h3>Mes personnages <span>{visibleProfiles.length}</span></h3>
            <p>Choisissez un personnage pour modifier son équipement, ses caractéristiques ou ses sorts.</p>
            <button type="button" className="btn primary studio-new" onClick={() => setDialog('new-profile')}><Plus size={16} />Nouveau personnage</button>
            <div className="studio-saved-list">{visibleProfiles.map(profile => <button type="button" className="studio-library-card" key={profile.id} data-saved-profile-id={profile.id}
              aria-label={`Personnaliser ${profile.name}`} onClick={() => { profiles.select(profile.id); onDone?.('profiles', profile); }}>
              <RetroPortrait classId={profile.classId} artworkId={profile.loadout.artworkId} appearance={profile.loadout.profile?.sex === 1 ? 'female' : 'male'} />
              <span><strong>{profile.name}</strong><small>{profile.className} · Niv. {profile.loadout.level || 200}</small><small>Personnaliser <ChevronRight size={12} /></small></span>
            </button>)}</div>
          </section>}
          {tab === 'characters' && <div className="studio-class-heading"><h3>Créer une classe originale</h3><p>Définissez son apparence et jusqu’à 10 sorts, puis créez un personnage avec cette classe.</p></div>}
          <button type="button" className="btn primary studio-new" onClick={() => { add(); setLibraryQuery(''); }}><Plus size={18} />{tab === 'dungeons' ? 'Nouveau donjon' : 'Nouvelle classe'}</button>
          {tab === 'characters' && <button type="button" className="btn" onClick={() => setDialog('class-template')}><Copy size={16} />Partir d’une classe existante</button>}
          <label className="studio-library-search"><Search size={16} /><input type="search" aria-label="Rechercher mes créations" placeholder="Rechercher…" value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} /></label>
          <div className="studio-library-items">{visibleEntries.map(entry => <button type="button" key={entry.id}
            className={`studio-library-card${selected?.id === entry.id ? ' selected' : ''}`} aria-pressed={selected?.id === entry.id} aria-label={`Modifier ${entry.name || 'Sans nom'}`}
            onClick={() => { setBrowsingCharacters(false); setSelectedIds(previous => ({ ...previous, [tab]: entry.id })); }}>
            <span className={`studio-library-art ${tab}`}><CreationThumbnail entry={entry} type={tab} /></span><span><strong>{entry.name || 'Sans nom'}</strong><small>{creationCount(entry, tab)}</small></span>
          </button>)}</div>
          {!entries.length && <p className="studio-library-hint">Votre première création commence ici.</p>}
          {entries.length > 0 && !visibleEntries.length && <p className="studio-library-hint">Aucune création pour ces filtres. Essayez « Tous mes mondes ».</p>}
          <button type="button" className="studio-import-button" onClick={() => setDialog('import')}><Sparkles size={18} /><span><strong>Créer avec une IA</strong><small>Prompt & import ZIP</small></span><ChevronRight size={16} /></button>
        </aside>
        <section className="studio-editor" aria-label={tab === 'characters' ? 'Éditeur de classe' : 'Éditeur de donjon'}>
          {!selected ? <div className="studio-empty"><span className={`studio-category-icon ${tab}`}>{tab === 'dungeons' ? <Castle size={38} /> : <UserRound size={38} />}</span>
            <h2>{browsingCharacters && tab === 'characters' ? 'Quel personnage voulez-vous préparer ?' : tab === 'dungeons' ? 'Votre prochaine aventure commence ici' : 'Un héros qui ne ressemble qu’à vous'}</h2>
            <p>{browsingCharacters && tab === 'characters' ? 'Sélectionnez un personnage enregistré pour ouvrir sa fiche : équipement, caractéristiques et sorts. Vous retrouverez ensuite votre combat avec le bouton Retour au combat.' : tab === 'dungeons' ? (MONSTER_CATALOGUE.length ? `Mélangez vos personnages et ${MONSTER_CATALOGUE.length} monstres, puis choisissez leur terrain.` : 'Créez vos créatures, composez votre équipe et dessinez le terrain. Vous pouvez aussi importer une bibliothèque.') : `Inventez jusqu’à ${MAX_CUSTOM_SPELLS} sorts, choisissez son apparence et donnez vie à votre classe.`}</p>
            {browsingCharacters && tab === 'characters' && profiles ? <button type="button" className="btn primary" onClick={() => onDone?.('profiles', profiles.active)}>Continuer avec {profiles.active.name}<ChevronRight size={16} /></button>
              : <><button type="button" className="btn primary" onClick={() => add()}><Plus size={18} />{tab === 'dungeons' ? 'Créer mon premier donjon' : 'Créer ma première classe'}</button>
                <button type="button" className="btn subtle" onClick={() => setDialog('import-archive')}>Ou importer une création ZIP</button></>}</div>
            : <><header className="studio-editor-heading creator-name-row">
              <span className={`studio-editor-portrait ${tab}`}><CreationThumbnail entry={selected} type={tab} /></span>
              <label className="field">{tab === 'dungeons' ? 'Nom du donjon' : 'Nom de la classe'}<input type="text" aria-label={tab === 'dungeons' ? 'Nom du donjon' : 'Nom de la classe'} maxLength={80} required placeholder={tab === 'dungeons' ? 'Ex. La tanière des rois' : 'Ex. Gardien des flammes'} value={selected.name} onChange={event => update({ ...selected, name: event.target.value })} />
                <small>{creationCount(selected, tab)}{tab === 'characters' ? ' · arme en plus' : ' · des salles sur mesure'}</small></label>
              <div className="studio-editor-actions"><AtelierExportButton selection={{ [tab]: [selected] }} name={selected.name} label="Exporter la création" iconOnly /><button type="button" className="btn studio-icon-button" title="Dupliquer" aria-label="Dupliquer la création" onClick={() => {
                const copy = { ...cloneCreation(selected), id: newCreationId(), name: `${selected.name} — copie` };
                creations.update(previous => ({ ...previous, [tab]: [...previous[tab], copy] })); worlds?.select('all'); setSelectedIds(previous => ({ ...previous, [tab]: copy.id })); setLibraryQuery('');
              }}><Copy size={17} /></button><button type="button" className="btn studio-icon-button" title="Supprimer" aria-label="Supprimer la création" onClick={() => {
                setRemoved({ entry: selected, tab }); creations.update(previous => ({ ...previous, [tab]: previous[tab].filter(entry => entry.id !== selected.id) }));
              }}><Trash2 size={17} /></button><button type="button" className="btn primary" onClick={() => {
                if (tab === 'dungeons') onTestDungeon?.(cloneCreation(selected));
                else setDialog('test');
              }}><Play size={16} />Tester</button></div>
            </header>
            {tab === 'dungeons' ? <DungeonRoomEditor key={selected.id} dungeon={selected} onChange={update}>
              {(room, change, index) => <DungeonEditor key={`${selected.id}:${index}`} dungeon={room} archiveDungeon={selected} change={change} />}
            </DungeonRoomEditor> : <CharacterEditor key={selected.id} character={selected} change={update} />}
          </>}
        </section>
      </div>
    </>}
    {dialog === 'new-profile' && <NewCharacterDialog customCharacters={creations.characters} onClose={() => setDialog(null)}
      onChooseClass={(classId, name) => { const profile = profiles.create(classId, name ? { name, className: CLASSES[classId].name } : undefined); setDialog(null); onDone?.('profiles', profile); }}
      onChooseCustom={entry => { const profile = profiles.create(entry.classId, entry); setDialog(null); onDone?.('profiles', profile); }}
      onCreateClass={() => { setDialog(null); add('characters'); }} />}
    {dialog === 'class-template' && <NewCharacterDialog forClass customCharacters={creations.characters} onClose={() => setDialog(null)} onChooseCustom={copyClass} onChooseClass={classId => {
      const entry = newCustomCharacter(classId); delete entry.loadout.artworkId;
      copyClass({ ...entry, name: CLASSES[classId].name, templateSource: `class:${classId}` });
    }} />}
    {dialog === 'export' && <AtelierExportDialog onClose={() => setDialog(null)} />}
    {dialog === 'import-archive' && <AtelierImportDialog onPlay={dungeon => { setDialog(null); onTestDungeon?.(cloneCreation(dungeon)); }} onClose={() => setDialog(null)} onImported={(nextTab, entry) => {
      setTab(nextTab); setBrowsingCharacters(false); setLibraryQuery(''); setSelectedIds(previous => ({ ...previous, [nextTab]: entry.id })); setError(''); setDialog(null);
      if (nextTab === 'equipment') { setEquipmentVisited(true); setImportedEquipment(entry); }
    }} />}
    {dialog === 'import' && <CharacterDialog title="Créer avec une IA" description="Décrivez votre idée, copiez le prompt, puis importez le ZIP obtenu." onClose={() => setDialog(null)} className="studio-dialog">
      <div className="character-dialog-body"><CreationPackageTools compact themes={packageThemes} onThemesChange={setPackageThemes} tab={tab} onImported={(nextTab, id) => { setTab(nextTab); setBrowsingCharacters(false); setLibraryQuery(''); setSelectedIds(previous => ({ ...previous, [nextTab]: id })); setError(''); }} /></div>
      <footer><button type="button" className="btn primary" onClick={() => setDialog(null)}>Retour à l’éditeur</button></footer>
    </CharacterDialog>}
    {dialog === 'test' && tab === 'characters' && selected && <CharacterDialog title={`Tester ${selected.name || 'votre création'}`} description="Essayez vous-même, ou regardez l’IA jouer." onClose={() => setDialog(null)} className="studio-dialog studio-test-dialog">
      <section className="creator-launch creator-card" aria-label="Tester la création"><div><h3><Swords size={19} /> À vous de jouer</h3><p>Contrôlez votre personnage ou confiez le combat à une IA.</p></div>
        <label className="field">Salle d’essai<select value={trialRoom} onChange={event => setTrialRoom(event.target.value)}><option value="training">{process.env.REACT_APP_PLATFORM === '1' ? 'Terrain d’essai vide' : 'Kanojedo · Poutch niveau 1'}</option>{creations.dungeons.filter(entry => !entry.adventure).map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label className="field">IA du personnage<select value={botId} onChange={event => setBotId(event.target.value)}>{allBots.map(bot => <option key={bot.id} value={bot.id}>{bot.name}</option>)}</select></label>
        <div className="creator-launch-buttons"><button type="button" className="btn primary" disabled={!!launchErrors.length} onClick={() => launch(false)}>Jouer cette création</button>
          <button type="button" className="btn" disabled={!!launchErrors.length} onClick={() => launch(true)}>Tester avec l’IA</button></div>
        {launchErrors.length > 0 && <p className="creator-warning">{launchErrors.join(' ')}</p>}{error && <p role="alert">{error}</p>}
      </section>
    </CharacterDialog>}
  </main>;
}

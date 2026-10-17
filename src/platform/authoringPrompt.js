import { newAuthoredSpell, EFFECT_TYPES, EFFECT_ZONES, EFFECT_RECIPIENTS } from '../engine/authoredSpells';
import { emptyLoadout } from '../engine/equipment';
import { DEFAULT_CLASS_ID } from '../engine/classes';
import { creatureBase } from '../engine/authoringTemplates';
import { characterShapeId } from '../visuals/customShapes';
export function neutralPackageExample(type) {
  const attack=newAuthoredSpell(); attack.name='Éclat du prisme';
  const hero={id:'hero-prisme',name:'Mon héros',classId:DEFAULT_CLASS_ID,
    loadout:{...emptyLoadout(DEFAULT_CLASS_ID),level:200,artworkId:characterShapeId(),spells:{custom:[attack],order:[]}}};
  const creature={key:'gardien-prisme',name:'Gardien du prisme',base:creatureBase(),reference:{},
    tuning:{hpPercent:100,statsPercent:100,paBonus:0,pmBonus:0},artworkId:characterShapeId(),spells:[{...attack,name:'Trait du gardien'}]};
  const dungeon={id:'donjon-prisme',name:'Mon aventure',mapId:'arene',members:[{customMonster:creature,count:1}],
    adventure:{version:1,mode:'fixed',partySize:1,allowAI:true,description:'Décrivez ici votre récit et l’objectif du combat.',heroes:[{id:'hero',character:hero}]}};
  return {format:'dofus-lite-atelier',version:1,characters:type==='class'?[hero]:[],dungeons:type==='dungeon'?[dungeon]:[],equipment:[],artwork:[]};
}
export function neutralAuthoringPrompt({type,theme=''}) {
  return `WHAT I WANT TO CREATE — describe exactly what I want here:\n${theme||'[My original theme, characters, each spell, strengths, weaknesses, enemy tactics, story and desired difficulty.]'}

Create a self-contained Arena Forge library. This website provides a blank tactical engine. No external catalogue is installed. Use only supplied construction templates or content contained in your package. Do not include engine code, dependencies, scripts, HTML or external asset URLs.

ZIP layout:
library.json — {"format":"arena-forge-library","version":1,"name":"My universe","description":"My story","release":"1.0.0","kind":"${type==='class'?'characters':'adventure'}"}
atelier.zip — a second ZIP containing atelier.json and optional assets/a0/*.png, assets/a1/*.png etc.
The atelier.json format and a complete editable example follow. The historical format identifier is a compatibility identifier, not a dependency on a themed game.

Rules:
- Maximum 10 spells per character or creature; 100 points per spell, 650 points per spellbook including combinations.
- Authored spells: level 200, grade 6, cost 1–8 action points; range 0–12. Keep meaningful cooldowns and counterplay. Boosts apply immediately. Critical effects must keep every normal effect with no weaker values.
- Ordinary rooms: 8 enemies maximum; explicit army encounter: 32. Up to 20 sequential rooms. Supplied heroes: 8 maximum.
- Equipment: 100 points per item and 1650 for outfits containing created items, excluding artifact slots. Negative stats do not buy additional budget.
- Use the shapes in this example to produce an immediately playable first version without generating images. Never pretend numerical limits or simulations have been verified without running the importer/test UI.
- Add a ready-to-play adventure with complete hero snapshots when creating a dungeon. No personal character should be required.
- Every new creature carries its own base block (HP, AP, MP, level, stats and resistances), tuning, artwork and spells. No native monster reference is required.
- Built-in construction terrain IDs arene, muraille and canyon are neutral test grids. Paint a custom battlefield in the Atelier for a distinctive map; export its validated geometry as a template before replacing its PNG.

Supported effect types:\n${JSON.stringify(EFFECT_TYPES)}
Zones:\n${JSON.stringify(EFFECT_ZONES)}
Target masks:\n${JSON.stringify(EFFECT_RECIPIENTS)}

Complete atelier.json example:\n${JSON.stringify(neutralPackageExample(type),null,2)}

Optional character images: portrait.png, idle-front.png and idle-back.png, each 256×256 RGBA. Walking and casting sheets: walk-front/back.png and cast-front/back.png, each 1536×256 (6 frames). Hit sheets: hit-front/back.png, 768×256 (3 frames). Feet anchor (128,224) in each frame. Transparent backgrounds; front faces southeast, back northwest. The engine mirrors the other directions.
For imported images, use a unique artworkId on the loadout/creature and an artwork record {"id":"same-id","name":"Name","images":{"portrait.png":"assets/a0/portrait.png","idle-front.png":"assets/a0/idle-front.png","idle-back.png":"assets/a0/idle-back.png"}}. List all required files; optional sheets must be declared too. Spell icons are 64×64 PNGs, referenced by iconArtworkId and iconFile "icons/my-spell.png".
Do not omit dependencies. Final delivery: one library ZIP, a brief explanation of the tactics and counters, and honest test status. The importer validates the real engine budgets before play. Use the Studio to test the finished class and fix rejected values. Keep the package editable manually.\n`;
}

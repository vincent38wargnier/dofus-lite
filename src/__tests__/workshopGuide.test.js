import React from 'react';
import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { newWorkshopMap, paintMapCell, mapBackgroundPrompt, mapPoint, workshopMapGuide } from '../ui/workshopMapModel';
import { mapPropLayout, MAP_PROP_FRAMES } from '../ui/mapPropLayout';
import { makeLayout } from '../ui/BoardView';
import { newWorkshopCreature, starterSpell } from '../ui/workshopStarters';
import { customMapErrors, resolveCustomMap } from '../engine/customMaps';
import { validCustomMonster, resolveCustomMonster } from '../engine/customMonsters';
import { authoredSpellErrors } from '../engine/authoredSpells';
import { spellbookBalance } from '../engine/spellBalance';
import { validCreations, emptyCreations } from '../ui/creationsStore';
import { customDungeonErrors } from '../engine/customDungeons';
import { LiveMatch } from '../game/liveMatch';
import MapWorkshop from '../ui/MapWorkshopPanel';
import CreatureEditor from '../ui/CreatureEditor';
import { artworkStepPrompt } from '../ui/WorkshopHelp';

test.each([8,12,18,24,32,40])('a manually created %s-cell-wide terrain is playable with connected spawns', size => {
  const map = newWorkshopMap(size);
  expect(customMapErrors(map)).toEqual([]);
  expect(map.startingCells[0]).toHaveLength(size >= 20 ? 32 : 8);
  const dungeon = { id:'manual',name:'Manuel',mapId:map.id,battlefield:map,members:[{customMonster:newWorkshopCreature(),count:1}] };
  expect(validCreations({...emptyCreations(),dungeons:[dungeon]})).toBe(true);
  expect(customDungeonErrors(dungeon)).toEqual([]);
  const live = new LiveMatch({ mode:'custom',dungeon,playerClass:'IOP',seed:1 });
  expect(live.state.board.width).toBe(size);
});

test.each(['guard','archer','support'])('the %s starter has its own legal spellbook and original artwork', role => {
  const monster = newWorkshopCreature(role), other = newWorkshopCreature(role);
  expect(validCustomMonster(monster)).toBe(true);
  expect(monster.spells).toHaveLength(2);
  expect(monster.spells[0].id).not.toBe(other.spells[0].id);
  expect(spellbookBalance(monster.spells).valid).toBe(true);
  expect(monster.artworkId).toMatch(/^shape-v1-/);
  monster.spells.forEach(spell=>{expect(authoredSpellErrors(spell)).toEqual([]);expect(spell.visualEffect).toBeTruthy();expect(spell.visualSpellId).toBeUndefined();});
  expect(resolveCustomMonster(monster).monsterId).toBeNull();
});

test('painting updates both blockers and scenery, replaces a cell and rejects disconnected camps',()=>{
  const blank = newWorkshopMap(12);
  let map=paintMapCell(blank,{x:5,y:5},'barricade');
  expect(map.obstacles).toEqual([{x:5,y:5,type:'BUSH',prop:'barricade'}]);
  map=paintMapCell(map,{x:5,y:5},'pillar');
  expect(map.obstacles).toHaveLength(1); expect(resolveCustomMap(map).obstacles['5,5'].blocksLos).toBeTruthy();
  expect(resolveCustomMap(map).obstacles['5,5'].blocksMove).toBe(true);
  map=paintMapCell(map,{x:5,y:5},'free'); expect(map.obstacles).toHaveLength(0);
  for(let y=0;y<12;y++) map=paintMapCell(map,{x:5,y},'pillar');
  expect(customMapErrors(map).join(' ')).toMatch(/rejoindre|reli|access|sépar/i);
  expect(blank.obstacles).toEqual([]);
});

test('painting a start removes the old obstacle and never duplicates a spawn or exceeds 32',()=>{
  let map=paintMapCell(newWorkshopMap(24),{x:8,y:8},'pillar');
  expect(paintMapCell(map,{x:8,y:8},'A')).toBe(map);
  map=paintMapCell(map,map.startingCells[0][0],'free');
  map=paintMapCell(map,{x:8,y:8},'A');
  expect(map.obstacles).toHaveLength(0); expect(map.startingCells[0]).toHaveLength(32);
  map=paintMapCell(map,{x:8,y:8},'A'); expect(map.startingCells[0]).toHaveLength(32);
  expect(customMapErrors(map)).toEqual([]);
});

test.each(['pillar','brazier','barricade'])('%s footprint stays on its blocked cell through crop, fit and zoom', prop=>{
  const map=newWorkshopMap(18), obstacle={x:6,y:9,prop};
  const source={...map.background,elevations:{}};
  for(const frame of [null,{left:80,top:40,width:1200,height:840}]) for(const w of [390,1500]){
    const L=makeLayout(map.width,map.height,w,source,700,frame), p=mapPropLayout(obstacle,L), anchor=MAP_PROP_FRAMES[prop];
    expect(p.size).toBeLessThanOrEqual(L.hw*2);
    for(const zoom of [.5,1,4]){
      expect((p.left+p.size*anchor.anchorX/256)*zoom).toBeCloseTo(L.cx(6,9)*zoom);
      expect((p.top+p.size*anchor.anchorY/256)*zoom).toBeCloseTo(L.cy(6,9)*zoom);
    }
  }
  const point=mapPoint(map,6,9);expect(point.x).toBe((6-9+source.originX)*source.hw);
});

test('map wizard supports keyboard drawing, collision preview and undo without saving a blocked layout',()=>{
  const save=jest.fn();render(<MapWorkshop onSave={save} onCancel={()=>{}}/>);
  const cell=screen.getByRole('button',{name:'Case 6, 6'});
  fireEvent.keyDown(cell,{key:' '});
  expect(screen.getByText(/144 cases · 1 obstacles/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Voir les collisions'}));
  fireEvent.click(screen.getByRole('button',{name:'Annuler'}));
  expect(screen.getByText(/144 cases · 0 obstacles/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Gomme'}));fireEvent.keyDown(screen.getByRole('button',{name:'Case 2, 3'}),{key:' '});
  expect(screen.getByRole('button',{name:'Utiliser ce terrain'})).toBeDisabled();
  expect(save).not.toHaveBeenCalled();
});

test('creature controls change the intended snapshot; art and spells keep separate steps',()=>{
  const creature=newWorkshopCreature('guard'), change=jest.fn();
  render(<CreatureEditor monster={creature} onChange={change} onClose={()=>{}}/>);
  fireEvent.change(screen.getByLabelText('Nom de la créature'),{target:{value:'Sentinelle'}});
  expect(change).toHaveBeenLastCalledWith({...creature,name:'Sentinelle'});
  fireEvent.change(screen.getByLabelText('Vie de la créature'),{target:{value:'125'}});
  expect(change.mock.calls.at(-1)[0].tuning.hpPercent).toBe(125);
  fireEvent.click(within(screen.getByRole('navigation',{name:'Étapes de la créature'})).getByText(/Apparence/));
  expect(screen.getByRole('button',{name:'Mes images'})).toBeInTheDocument();
});

test('granular image prompts use the actual creature, spell and battlefield contracts',()=>{
  const map=newWorkshopMap(12);map.name='Cour des loups';
  const prompt=mapBackgroundPrompt(map,'Neige');
  expect(prompt).toContain('Cour des loups');expect(prompt).toContain('1536 × 1024');expect(prompt).toContain('Neige');expect(prompt).toContain('Aucun personnage');
  expect(workshopMapGuide(map).match(/<polygon/g)).toHaveLength(144);
  expect(artworkStepPrompt({name:'Sentinelle',file:'walk-front.png'})).toContain('1536x256');
  const spell=starterSpell();spell.name='Feu follet';
  expect(artworkStepPrompt({name:spell.name,spell})).toContain('64x64');
  expect(artworkStepPrompt({name:spell.name,spell})).toContain('Feu follet');
});

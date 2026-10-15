import { runMatchAsync } from '../arena/runner';
import { runFlowLab } from '../bots/flowLab';
jest.mock('../arena/runner',()=>({runMatchAsync:jest.fn()}));
test('six comparisons mirror seats and seeds, compile independent memories, and retain exact errors',async()=>{
  const memory='var count=0; function decide(v,a){return {type:"SAY",text:String(++count)};}';
  const starts=[];
  runMatchAsync.mockImplementation(async config=>{
    const f=id=>({id,name:id,pos:{x:1,y:1},hp:10,maxHp:10,spells:[],team:id});
    const v={you:f('A'),allies:[],enemies:[f('B')],board:{width:3,height:3,obstacles:[]},turn:1};
    starts.push([config.bots.A.decide(v,{}).text,config.bots.B.decide(v,{}).text]);
    return {winner:'A',turns:7,stats:{A:{damageDealt:9,invalid:0,errors:0},B:{damageDealt:4,invalid:0,errors:0}},finalState:{fighters:{A:{hp:6},B:{hp:0}}},events:[],endReason:'elimination'};
  });
  const games=await runFlowLab({code:memory,opponentCode:memory,mine:{name:'Moi',classId:'IOP',loadout:{id:'gear-a'}},opponent:{name:'Autre',classId:'CRA',loadout:{id:'gear-b'}},count:6,seed:120});
  expect(games.map(g=>g.side)).toEqual(['A','B','A','B','A','B']);expect(games.map(g=>g.seed)).toEqual([120,120,121,121,122,122]);
  expect(games.map(g=>g.mapId)).toEqual(['arene','arene','muraille','muraille','canyon','canyon']);expect(starts).toEqual(Array.from({length:6},()=>['1','1']));
  const configs=runMatchAsync.mock.calls.map(c=>c[0]);expect(configs[0].classes).toEqual({A:'IOP',B:'CRA'});expect(configs[1].classes).toEqual({B:'IOP',A:'CRA'});
  expect(configs[1].loadouts.B.id).toBe('gear-a');expect(games[1].stats.damageDealt).toBe(4);expect(games[1].outcome).toBe('loss');
});

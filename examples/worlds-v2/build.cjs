// Independent playable campaigns. No installed catalogue or native visual IDs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const e=require('../../server/generated/runtime.cjs'),lib=require('../../server/generated/library.cjs');
const worlds=require('./worlds.cjs');
const root=__dirname,clone=v=>JSON.parse(JSON.stringify(v));
const statFor={terre:'force',air:'agilite',eau:'chance',feu:'intelligence'},lineFor={terre:97,air:98,eau:96,feu:99};
const once={maxPerTurn:1,maxPerTarget:1};
function build(world,index=worlds.indexOf(world),{artwork=true}={}){
 let sid=1820000000000000+index*1000,iid=1820000000+index*100;
 const report={world:world.key,heroes:[],monsters:[],equipment:[],comparisons:{strike:[141,158],area:[160,179],burst:[76,156],heal:[121,124],guard:[7,153],control:[84,161],movement:[142,128]},combos:[]};
 const effect=(kind,min,max=min,extra={})=>({...e.newAuthoredEffect(kind),min,max,...extra});
 const hit=(element,min,max,extra={})=>effect('damage',min,max,{element,...extra});
 const spell=(name,pa,range,effects,kind,options={})=>{
   const id=++sid;const raw=e.normalizeAuthoredSpell({...e.newAuthoredSpell(),id,key:'custom_'+id,name,pa,rangeMin:range[0],rangeMax:range[1],targetMode:range[1]?'enemy':'self',
    visualEffect:{version:1,kind,color:world.color,accent:world.accent,durationMs:kind==='rally'?650:850},effects,description:options.description||'Utilisez la portée et la ligne de vue pour choisir votre moment.',...options,
    ...(artwork?{iconArtworkId:`world-${world.key}-icons-v2`,iconFile:`icons/${kind}.png`}:{})});
   const errors=e.authoredSpellErrors(raw);assert.deepEqual(errors,[],`${world.key} / ${name}`);return raw;
 };
 const blink=name=>spell(name,4,[1,3],[effect('teleport',0)],'raven-step',{...once,cooldown:3,targetMode:'freeCell',description:'Rejoint une case libre à trois cases. Coûte 4 PA et revient après trois tours : choisissez entre atteindre une cible et vous mettre à l’abri.'});
 const buff=(name,kind,value,duration=2)=>spell(name,3,[0,0],[effect(kind,value,value,{duration})],'rally',{...once,cooldown:4,description:`Prépare immédiatement les prochains coups pendant ${duration} tours. Ce tour de préparation coûte une attaque ; exploitez ensuite la fenêtre avant la relance.`});
 const rawKits=world.names.map((n,role)=>{
   const element=role===0?world.element:role===1?'air':'feu';
   if(role===0)return [
    spell(n[0],3,[1,2],[hit(element,20,24)],'slash',{critRate:30,critEffects:[hit(element,23,27)],description:'Frappe fiable à courte portée. Deux lancers par cible ; le critique conserve le même élément.'}),
    spell(n[1],3,[1,1],[hit(element,12,16),effect('push',world.signature==='push'?2:1)],'thrust',{lineOnly:true,description:'Frappe puis repousse en ligne. Libère un passage ; une collision peut ajouter des dégâts.'}),
    spell(n[2],4,[1,2],[hit(element,14,18,{zone:'Xb',targetMask:0})],'shatter',{...once,targetMode:'cell',description:'Croix de rayon 1, alliés compris. Une case vide peut être le meilleur centre ; vérifiez l’aperçu avant de frapper.'}),
    spell(n[3],5,[1,2],[hit(element,35,39)],'slash',{...once,cooldown:3,description:'Forte frappe rapprochée, disponible une fois tous les trois tours. Préparez le bonus puis choisissez une cible importante.'}),
    buff(n[4],'buffPower',70),
    spell(n[5],3,[0,0],[effect('armor',8,8,{duration:2})],'shield',{...once,cooldown:3,description:'Armure pendant deux tours. Sacrifiez un coup pour absorber les représailles ; aucun soin.'}),
    world.signature==='charge'?blink(n[6]):spell(n[6],2,[0,0],[effect('buffPm',1,1,{duration:1})],'raven-step',{...once,cooldown:3,description:'Un PM supplémentaire immédiat pour rejoindre le front ou reculer. Ne rend pas les PA dépensés.'}),
    world.signature==='disarm'?spell(n[7],3,[1,4],[effect('removePa',1),effect('removePm',1)],'shatter',{...once,cooldown:3,description:'Tente de retirer un PA et un PM. Les retraits sont esquivables ; gardez une solution si la cible résiste.'})
      :spell(n[7],2,[1,3],[effect('resistDebuff',12,12,{element,duration:1})],'shatter',{...once,cooldown:3,description:'Retire 12 points de résistance dans votre élément pendant un tour. Lancez-le avant les attaques ; ne fait aucun dégât seul.'})
   ];
   if(role===1)return [
    spell(n[0],3,[2,6],[hit('air',17,21)],'arrow',{critRate:30,critEffects:[hit('air',20,24)],description:'Tir fiable à moyenne portée, inutilisable au contact. Deux tirs par cible et par tour.'}),
    spell(n[1],3,[1,2],[hit('air',13,17),effect('push',1)],'thrust',{...once,lineOnly:true,description:'Une attaque plus faible qui repousse au contact. Permet de rouvrir la portée minimale du tir principal.'}),
    spell(n[2],4,[2,5],[hit('air',12,16,{zone:'Cb',targetMask:0})],'fire-wave',{...once,targetMode:'cell',description:'Zone de rayon 1 touchant aussi les alliés. Cherchez un groupe, pas une cible isolée.'}),
    spell(n[3],5,[3,7],[hit('air',27,33)],'ice-lance',{...once,cooldown:3,lineOnly:world.signature==='weakness',description:'Tir puissant à longue portée, avec trois tours de relance. Il faut garder une distance de trois cases.'}),
    buff(n[4],'buffPower',60),
    spell(n[5],3,[0,0],[effect('resistBuff',18,18,{element:world.element,duration:2})],'shield',{...once,cooldown:4,description:`Protège uniquement contre l’élément ${world.element} pendant deux tours. Aucun effet sur les autres éléments : inspectez l’adversaire.`}),
    blink(n[6]),
    spell(n[7],3,[2,6],[hit('air',9,12),effect('removePm',1)],'shatter',{...once,cooldown:2,description:'Petit tir suivi d’un retrait esquivable de 1 PM. Aide à ralentir un poursuivant, sans le bloquer en permanence.'})
   ];
   return [
    spell(n[0],3,[1,5],[hit('feu',15,19)],'embers',{critRate:30,critEffects:[hit('feu',18,22)],description:'Un trait précis. Les PA consacrés à cette attaque ne sont plus disponibles pour soigner.'}),
    spell(n[1],3,[1,3],[hit('feu',10,14),effect('push',1)],'fireball',{...once,lineOnly:true,description:'Une petite flamme repousse d’une case. Dégage le soigneur, mais coûte autant qu’un soin.'}),
    spell(n[2],4,[1,4],[hit('feu',12,16,{zone:'Cb',targetMask:0})],'fire-wave',{...once,targetMode:'cell',cooldown:1,description:'Feu en cercle de rayon 1. Les alliés sont touchés aussi : attendez une ouverture ou visez derrière le front.'}),
    spell(n[3],3,[0,5],[effect('heal',20,24)],'embers',{...once,targetMode:'fighter',description:'Soigne un allié ou vous-même. Un soin par tour : choisissez la blessure prioritaire ; les PV ne dépassent pas le maximum.'}),
    spell(n[4],3,[0,4],[effect('buffDamage',6,6,{targetMask:4,duration:1})],'rally',{...once,cooldown:3,targetMode:'fighter',description:'+6 dommages immédiats pour un allié pendant un tour. Privilégiez celui qui peut encore attaquer plusieurs fois.'}),
    spell(n[5],3,[0,4],[effect('armor',6,6,{targetMask:4,duration:2})],'shield',{...once,cooldown:3,targetMode:'fighter',description:'Protège un allié pendant deux tours. N’annule pas tous les dégâts et ne soigne pas ses blessures.'}),
    blink(n[6]),
    spell(n[7],3,[1,5],[effect('resistDebuff',10,10,{element:world.element,duration:1}),effect('removePm',1)],'bell',{...once,cooldown:3,description:`Ouvre une faiblesse ${world.element} pendant un tour et tente de retirer 1 PM. Coordonnez avec le combattant de première ligne.`})
   ];
 });
 // World identities change executable choices, not only names and colours.
 const change=(role,slot,patch)=>{rawKits[role][slot]=e.normalizeAuthoredSpell({...rawKits[role][slot],...patch});};
 if(world.key==='potter'){
   change(0,0,{rangeMax:5,effects:[hit('feu',16,20)],critEffects:[hit('feu',19,23)],description:'Duel de baguettes à cinq cases : moins puissant que les frappes rapprochées, mais utilisable derrière une armure alliée.'});
   change(0,3,{effects:[hit('feu',22,26),effect('removePa',1)],description:'Brise un sceau par le feu et tente de retirer un PA. Trois tours de relance ; le retrait peut être esquivé.'});
   change(1,7,{effects:[hit('air',7,10),effect('removePm',2)],pa:4,cooldown:3,description:'Les racines tentent de retirer deux PM après un petit impact. Coût élevé et trois tours de relance.'});
 }
 if(world.key==='brice'){
   change(0,3,{effects:[hit('eau',24,28),effect('push',2)],lineOnly:true,rangeMax:1,description:'La grande casse repousse de deux cases après un coup rapproché. Gardez un angle de collision, ou libérez le passage.'});
   change(1,1,{effects:[hit('air',8,12),effect('push',2)],description:'Un remous repousse de deux cases en ligne ; moins de dégâts directs, davantage de placement.'});
 }
 if(world.key==='asterix'){
   change(0,0,{pa:4,rangeMax:1,effects:[hit('terre',27,31)],critEffects:[hit('terre',30,34)],description:'Une vraie baffe au contact, pour quatre PA. Le Gaulois doit choisir entre deux coups et préparer sa potion.'});
   change(0,4,{pa:2,effects:[effect('buffPower',85,85,{duration:1})],cooldown:4,description:'La potion agit immédiatement, mais son gain de puissance ne dure que ce tour. Impossible de la garder pour plus tard.'});
 }
 if(world.key==='kaamelott'){
   change(0,5,{effects:[effect('armor',10,10,{duration:2})],pa:4,description:'Protection solide de Carmélide pendant deux tours. Quatre PA : défendre coûte une attaque.'});
   change(1,0,{critRate:15,effects:[hit('air',12,24)],critEffects:[hit('air',15,27)],description:'Un tir approximatif, entre 12 et 24 de base. Davantage de critiques, mais aucune garantie sur le jet.'});
   change(2,3,{pa:4,effects:[effect('heal',28,32)],cooldown:2,description:'Un repas plus généreux, tous les deux tours. Anticipez la pause avant les prochaines blessures.'});
 }
 if(world.key==='starwars'){
   change(1,0,{pa:4,effects:[hit('air',10,12),hit('air',10,12)],critEffects:[hit('air',12,14),hit('air',12,14)],description:'Deux impacts de blaster pour quatre PA. Les dommages fixes profitent aux deux lignes, les résistances fixes les réduisent aussi.'});
   change(2,7,{effects:[effect('removePa',1),effect('debuffRange',2,2,{duration:1})],description:'Brouille la visée et tente de retirer un PA. Le retrait de portée concerne les sorts à portée modifiable.'});
 }
 if(world.key==='rings'){
   change(0,5,{rangeMax:3,targetMode:'fighter',effects:[effect('armor',6,6,{targetMask:4,duration:2})],description:'Une garde moins forte, mais transmissible à un compagnon proche pendant deux tours.'});
   change(1,3,{lineOnly:true,rangeMax:8,effects:[hit('air',28,34)],description:'Un tir lointain uniquement en ligne droite. Les arbres coupent la visée ; déplacez-vous avant de préparer la flèche.'});
 }
 if(world.key==='onepiece'){
   change(0,1,{rangeMax:3,effects:[hit('eau',8,12),effect('pull',1)],description:'Le capitaine attire d’une case en ligne après un petit coup. Rapprochez un tireur ou séparez les gardes.'});
   change(1,2,{effects:[hit('air',12,16,{zone:'Lb',targetMask:0})],lineOnly:true,description:'Une bourrasque frappe deux cases dans la direction du tir, alliés compris. Alignez les ennemis avec le capitaine.'});
 }
 if(world.key==='dragonball'){
   change(0,3,{pa:7,effects:[hit('terre',49,55)],cooldown:4,description:'Sept PA pour une frappe lourde, puis quatre tours de relance. Impossible de préparer un bonus de trois PA dans le même tour à neuf PA.'});
   change(1,4,{pa:2,effects:[effect('buffCrit',8,8,{duration:2})],description:'Améliore les critiques pendant deux tours. Ne renforce pas les attaques sans critique : choisissez votre combinaison.'});
 }
 if(world.key==='pokemon'){
   change(0,5,{effects:[effect('resistBuff',25,25,{element:'terre',duration:2}),effect('resistBuff',25,25,{element:'eau',duration:2})],pa:4,description:'La carapace protège contre la terre et l’eau pendant deux tours, mais pas contre le feu ni l’air.'});
   change(2,2,{effects:[hit('feu',10,14,{zone:'Cb',targetMask:0}),effect('resistDebuff',8,8,{element:'air',duration:1,zone:'Cb',targetMask:1})],pa:5,cooldown:2,description:'Floraison de feu en zone, alliés compris. Les ennemis perdent ensuite 8 points de résistance air : préparez l’éclair de Voltige.'});
 }
 if(world.key==='visiteurs'){
   change(1,7,{pa:2,effects:[effect('removePm',1)],cooldown:2,description:'La boue tente de retirer un PM sans dégâts. Deux PA permettent de gêner un poursuivant avant de fuir.'});
   change(2,6,{rangeMax:4,needsLos:false,cooldown:4,description:'Un saut temporel jusqu’à quatre cases, sans ligne de vue. La destination doit être libre ; quatre tours de relance.'});
 }
 if(world.key==='naheulbeuk'){
   change(0,7,{effects:[effect('resistDebuff',10,10,{element:'terre',duration:2})],cooldown:4,description:'La réclamation ouvre une faiblesse terre pendant deux tours. La relance de quatre tours empêche de l’entretenir sans pause.'});
   change(2,4,{effects:[effect('buffPa',1,1,{targetMask:6,duration:1})],pa:3,cooldown:4,description:'Accorde immédiatement un PA à un autre allié. Coûte trois PA au mage, sans possibilité de se le rendre à soi-même.'});
 }
 if(world.key==='wakfu'){
   change(0,2,{effects:[hit('eau',14,18,{zone:'Lb',targetMask:0})],lineOnly:true,rangeMax:3,description:'Un passage d’énergie frappe deux cases en ligne, alliés compris. Le placement décide du résultat.'});
   change(2,7,{effects:[effect('resistDebuff',10,10,{element:'eau',duration:1}),effect('pull',1)],lineOnly:true,rangeMax:4,description:'Retire 10 points de résistance eau puis attire d’une case en ligne. Aide le veilleur à atteindre la cible.'});
 }
 rawKits.forEach((kit,role)=>kit.forEach(s=>assert.deepEqual(e.authoredSpellErrors(s),[],`${world.key}/${role}/${s.name}`)));
 const equipment=[];
 const roles=['Front et placement','Distance et mobilité','Soin et soutien'];
 const characters=world.heroes.map(([name],role)=>{
   const element=role===0?world.element:role===1?'air':'feu',stat=statFor[element];
   const base={vitalite:0,force:0,intelligence:0,chance:0,agilite:0,sagesse:0};base[stat]=220;base.vitalite=995-e.allocatedPoints('CREATOR',base);
   const loadout={...e.emptyLoadout('CREATOR'),level:200,base,slots:{},customEquipment:{},spells:{custom:rawKits[role],order:[0,...rawKits[role].map(s=>s.id)]},...(artwork?{artworkId:`world-${world.key}-${role}-v2`}:{artworkId:e.characterShapeId(['warden','wanderer','mystic'][role],world.color)})};
   const slots={hat:16,cape:17,amulet:1,ring1:9,ring2:9,belt:10,boots:11,weapon:role===0?6:role===1?2:3};
   const label={hat:'Coiffe',cape:'Manteau',amulet:'Emblème',ring1:'Anneau du départ',ring2:'Anneau du retour',belt:'Ceinture',boots:'Bottes',weapon:role===0?'Arme de garde':role===1?'Arme de précision':'Catalyseur'};
   for(const [slot,type]of Object.entries(slots)){
    const item={...e.newCustomEquipment(-100000-type),id:++iid,name:label[slot]+' : '+name.split(',')[0],level:200,appearance:{shape:slot==='amulet'?'crystal':'equipment',color:world.color},stats:{vitalite:slot==='weapon'?70:95,[stat]:25,sagesse:10}};
    if(slot==='amulet'||slot==='ring1')item.stats.pa=1;if(slot==='boots')item.stats.pm=1;if(slot==='ring2')item.stats.damage=3;
    if(slot==='cape')item.stats['res_'+world.element]=5;
    if(slot==='weapon')item.weapon={pa:4,range:role===0?[1,1]:role===1?[2,6]:[1,4],critRate:30,critBonus:3,lines:[{id:lineFor[element],min:20,max:25}],visualEffect:{version:1,kind:role===0?'slash':role===1?'arrow':'embers',color:world.color,accent:world.accent,durationMs:700}};
    const checked=e.validateCustomEquipment(item);assert(checked.valid,`${world.key} / ${item.name}: ${checked.errors}`);equipment.push(item);loadout.slots[slot]=item.id;loadout.customEquipment[item.id]=clone(item);report.equipment.push({name:item.name,score:checked.balance.score});
   }
   const resolved=e.resolveLoadout('CREATOR',loadout);assert(resolved.valid,`${world.key} ${name}: ${resolved.errors}`);
   report.heroes.push({name,role:roles[role],hp:resolved.hp,pa:resolved.pa,pm:resolved.pm,stats:resolved.stats,outfit:resolved.equipmentBudget.score,spells:rawKits[role].map(s=>({name:s.name,pa:s.pa,effects:s.effects,cooldown:s.cooldown}))});
   report.combos.push({hero:name,ap:resolved.pa,unprepared:[rawKits[role][0].name,rawKits[role][0].name],prepared:role<2?[rawKits[role][4].name,rawKits[role][3].name]:[rawKits[role][4].name,rawKits[role][0].name],recovery:role<2?[rawKits[role][5].name,rawKits[role][6].name]:[rawKits[role][3].name,rawKits[role][5].name],counterplay:role===0?'Distance et obstacles ; aucun soin.':role===1?'Contact et angles fermés ; protection limitée à un élément.':'Pression répartie sur plusieurs alliés ; un seul soin par tour.'});
   return {id:`world-${world.key}-hero-${role}`,name,classId:'CREATOR',className:roles[role],description:roles[role]+'. '+report.combos.at(-1).counterplay,loadout};
 });
 const enemyBooks=world.enemies.map((name,role)=>{
   const el=role===1?'air':role===2?'feu':world.element;
   const attack=spell(role===3?'Frappe du dernier rempart':role===2?'Étincelle du soutien':role===1?'Tir de couverture':'Frappe de garde',3,[role===1?2:1,role===1?6:role===2?5:2],[hit(el,role===3?24:17,role===3?29:21)],role===1?'arrow':role===2?'embers':'slash');
   const support=role===2?spell('Relever les rangs',3,[0,4],[effect('heal',18,22)],'embers',{...once,targetMode:'fighter',description:'Un soin par tour sur un allié. Le soutien ne peut pas réparer tout le groupe.'}):role===1?buff('Préparer le tir','buffPower',50):spell('Tenir la position',3,[0,0],[effect('armor',role===3?10:6,undefined,{duration:2})],'shield',{...once,cooldown:3});
   const control=spell(role===2?'Défaire la garde':'Entrave du passage',3,[1,4],[effect(role===2?'resistDebuff':'removePm',role===2?10:1,role===2?10:1,role===2?{element:world.element,duration:1}:{})],'shatter',{...once,cooldown:2});
   const position=role===2?spell('Encourager les rangs',3,[0,4],[effect('buffDamage',5,5,{targetMask:4,duration:1})],'rally',{...once,cooldown:3,targetMode:'fighter'}):spell('Dégager la ligne',3,[1,1],[hit(el,10,13),effect('push',1)],'thrust',{...once,lineOnly:true});
   const list=[attack,support,control,position];
   if(role===3)list.push(spell('Pression du dernier cercle',5,[1,4],[hit(el,16,20,{zone:'Cb',targetMask:0})],'shatter',{...once,cooldown:2,targetMode:'cell',description:'Zone de rayon 1, alliés compris. Écartez vos personnages avant son retour.'}),buff('Dernier effort','buffPower',70));
   const names=require('./enemy-spells.cjs')[world.key][role];assert.equal(names.length,list.length);
   return list.map((s,i)=>({...s,name:names[i]}));
 });
 const monster=(role,chapter)=>{
   const base=e.creatureBase();Object.assign(base,{name:world.enemies[role],baseHp:[340,470,610][chapter]*(role===3?2.3:role===2?.72:role===1?.78:1)|0,basePa:role===3?9:6,basePm:role===1?2:3,stats:{force:100+chapter*60,intelligence:100+chapter*60,chance:100+chapter*60,agilite:100+chapter*60,sagesse:40+chapter*20,vitalite:0}});
   base.resistances[world.element]=role===0?15:role===3?10:0;base.resistances.feu=role===0&&world.element!=='feu'?-10:base.resistances.feu;
   const m={key:`${world.key}-enemy-${role}-r${chapter}`,name:world.enemies[role],description:['Garde rapprochée : contournez-le ou attendez la fin de son armure.','Tireur : ses tirs principaux ne fonctionnent pas au contact.','Soutien : il soigne et renforce les autres. L’isoler simplifie le combat.','Boss : alternance de garde et de pression. Dispersez-vous contre sa zone.'][role],role:['Garde','Tireur','Soutien','Boss'][role],counterplay:['Portée courte, vulnérable aux contournements.','Approchez à une case pour gêner son tir.','Faible vie et un seul soin par tour.','Éliminez ses soutiens ; attaquez pendant les relances.'][role],reference:{},base,tuning:{hpPercent:100,statsPercent:100,paBonus:0,pmBonus:0},spells:clone(enemyBooks[role]),artworkId:artwork?`world-${world.key}-${role+3}-v2`:e.characterShapeId('warden',world.color)};
   report.monsters.push({name:m.name,chapter:chapter+1,hp:base.baseHp,pa:base.basePa,spells:m.spells.map(s=>({name:s.name,effects:s.effects,cooldown:s.cooldown}))});return m;
 };
 const rooms=world.chapters.map(([name,intro,outro],chapter)=>{
   const size=14+chapter*2,hw=[40,36,32][chapter],originX=[19,21,24][chapter],id=`custom-${world.key}-chapter-${chapter+1}`;
   const obstacles=[];const add=(x,y,type,prop)=>{if(!obstacles.some(p=>p.x===x&&p.y===y))obstacles.push({x,y,type,prop});};
   const mid=Math.floor(size/2);
   // Both flanks remain open. Blocking props are exactly on collision cells.
   if(chapter===0){add(mid,3,'WALL','pillar');add(mid,size-4,'WALL','pillar');}
   if(chapter===1){for(const y of [2,3,6,7,size-4,size-3])add(mid,y,'WALL','pillar');add(mid-2,mid+1,'BUSH','barricade');}
   if(chapter===2){for(const x of [mid-1,mid+1])for(const y of [3,4,size-5,size-4])add(x,y,'WALL','pillar');for(const y of [mid-2,mid+2])add(mid+3,y,'BUSH','barricade');}
   const startX=mid-3,endX=mid+3;
   const ys=[mid,mid-1,mid+1,mid-2,mid+2,mid-3,mid+3,mid-4];
   const battlefield={version:1,id,name,description:world.premise.slice(0,800),width:size,height:size,background:{artworkId:`world-${world.key}-map-v2`,file:'floor.png',propsFile:'props.png',width:1536,height:1024,hw,top:220,originX},obstacles,startingCells:[ys.map(y=>({x:startX,y})),ys.map(y=>({x:endX,y}))]};
   // Use a different open rank if a scenery obstacle occupies a departure.
   battlefield.startingCells=battlefield.startingCells.map((cells,team)=>cells.map(c=>obstacles.some(p=>p.x===c.x&&p.y===c.y)?{x:c.x+(team?1:-1),y:c.y}:c));
   const counts=chapter===0?[[0,2],[1,2]]:chapter===1?[[0,2],[1,2],[2,2]]:[[3,1],[0,3],[1,2],[2,2]];
   return {id:`${world.key}-room-${chapter+1}`,name,mapId:id,battlefield,members:counts.map(([role,count])=>({customMonster:monster(role,chapter),count})),intro:intro+'\n\n'+['Découverte : gardez le soutien derrière le front. Éliminez les quatre adversaires.','Coordination : les soigneurs entretiennent la patrouille. Approchez-les par les flancs.','Finale : séparez les soutiens et le boss. Toutes les créatures doivent être vaincues.'][chapter],outro};
 });
 const dungeon={...clone(rooms[0]),id:`world-${world.key}-campaign-v2`,name:world.title,description:world.premise,rooms,adventure:{version:1,mode:'fixed',partySize:3,allowAI:true,description:world.premise+'\n\nTrois héros équipés, huit sorts chacun, trois salles. Les victoires ouvrent la suite et l’équipe récupère entre les combats. Défi facultatif : garder vos trois héros debout.',heroes:characters.map(character=>({id:character.id,character:clone(character)}))}};
 assert.deepEqual(e.customDungeonErrors(dungeon),[],world.key);
 return {characters,equipment,dungeon,report};
}
module.exports={build,worlds};
if(require.main===module){for(const w of worlds){const b=build(w);console.log(w.key,b.characters.map(c=>c.loadout.spells.custom.length).join('/'),b.report.heroes.map(h=>h.hp+'/'+h.pa+'PA').join(' '));}}

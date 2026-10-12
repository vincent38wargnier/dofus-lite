// Reproducible census: no browser saves, no Dofus, no synthetic reference items.
require('./ai_runtime.cjs');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { EQUIPMENT_BUDGET_VERSION, MAX_ITEM_SCORE, MAX_EQUIPMENT_SCORE,
  EQUIPMENT_CENSUS, EQUIPMENT_FAMILIES, EQUIPMENT_REFERENCES, EQUIPMENT_STAT_RULES,
  equipmentPower, equipmentBalance, equipmentKitBalance, nativeEquipmentExclusion, equipmentFamily, quantile } = require('../src/engine/equipmentBalance');
const data = require('../src/engine/equipmentData.json');
const digest = crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '../src/engine/equipmentData.json'))).digest('hex');
const rows = Object.values(data.items).filter(item => item.type !== 23).map(item => {
  const balance = equipmentBalance(item);
  return { id: item.id, name: item.name, family: equipmentFamily(item)?.name || data.types[item.type], type: item.type,
    level: item.level, exclusion: nativeEquipmentExclusion(item), passive: Math.round(balance.passive * 10) / 10,
    attack: Math.round(balance.attack * 10) / 10, rawPower: Math.round(balance.total * 10) / 10,
    combinedScore: balance.totalScore ?? null, score: balance.limits ? balance.score : null };
});
const distribution = values => ({ n: values.length, min: Math.min(...values), p10: quantile(values,.1), median: quantile(values,.5), p90: quantile(values,.9), max: Math.max(...values) });
const families = EQUIPMENT_FAMILIES.map(family => {
  const items = rows.filter(item => family.types.includes(item.type)), refs = items.filter(item => !item.exclusion);
  return { id: family.id, name: family.name, count: items.length, references: EQUIPMENT_REFERENCES.filter(item => family.types.includes(item.type)).length,
    rawPower: distribution(refs.map(item => item.rawPower)),
    byLevel: [[1,50],[51,100],[101,150],[151,200]].map(([min,max]) => ({ min,max, ...distribution(refs.filter(item => item.level >= min && item.level <= max).map(item => item.rawPower)) })) };
});
// Outfit score controls. These are stat-budget samples, not AI win rates.
let seed = 73121;
const random = () => { seed = (Math.imul(seed,1664525)+1013904223) >>> 0; return seed/4294967296; };
const samples = [];
for (const level of [60,100,150,200]) {
  const baseFamilies = ['hat','cape','amulet','ring','ring','belt','boots'];
  const topPool = family => {
    const pool = EQUIPMENT_REFERENCES.filter(item => item.level <= level && equipmentFamily(item).id === family)
      .sort((a,b) => equipmentPower(b).total-equipmentPower(a).total);
    return pool.slice(0, Math.max(1, Math.ceil(pool.length*.2)));
  };
  for (let n=0;n<200;n++) {
    const families = [...baseFamilies, `weapon-${[2,3,4,5,6,7,8,19][n%8]}`, level >=60 && n%2 ? 'mount':'pet'];
    const gear = families.flatMap(family => { const pool = topPool(family); return pool.length ? [pool[Math.floor(random()*pool.length)]]:[]; });
    if (!gear.some(item=>item.weapon?.twoHanded)) { const shields=topPool('shield'); if(shields.length)gear.push(shields[Math.floor(random()*shields.length)]); }
    if (gear[3]?.id===gear[4]?.id && gear[3].set) gear.splice(4,1);
    const sets = {};
    for(const item of gear)if(item.set)(sets[item.set] ||= new Set()).add(item.id);
    const setRows = Object.entries(sets).flatMap(([id,ids])=>data.sets[id]?.bonuses[ids.size] || []);
    samples.push({level,...equipmentKitBalance(gear,level,setRows)});
  }
}
const outfitSamples = [60,100,150,200].map(level => ({level, ...distribution(samples.filter(row=>row.level===level).map(row=>row.score)),
  budget:MAX_EQUIPMENT_SCORE, withinBudget:samples.filter(row=>row.level===level && row.score<=MAX_EQUIPMENT_SCORE).length}));
const result = { version:EQUIPMENT_BUDGET_VERSION, sourceSha256:digest, sources:data.sources, census:EQUIPMENT_CENSUS,
  rules:{itemBudget:MAX_ITEM_SCORE, equipmentBudget:MAX_EQUIPMENT_SCORE, limits:'P90 combat power; P95 positive stat lines; monotonic by level',
    negativeCredit:0, weapons:'normal and 1/2 critical; flat damage on each line, life steal, AP, range, zone',
    outfitSynergy:'175 points per gear PA above 3 and PM above 2; 15 per range above 5; Dofus excluded',
    weights:EQUIPMENT_STAT_RULES}, families, outfitSamples, items:rows,
  limitations:['Local design policy, not an official formula or proof of competitive balance.',
    'Ethereal, reserved, class-specific and unsupported items are audited but not calibration references.',
    'Whole-outfit samples select strong native pieces; they are not optimized builds or simulated fights.',
    'Pets and mounts use trained maxima; shields use their own family independently of the player level.',
    'Native items are not altered or blocked. Limits govern newly authored items and outfits containing them.'] };
const root=path.join(__dirname,'..');
fs.writeFileSync(path.join(root,'public/dofus-local/equipment-balance-audit.json'),JSON.stringify(result,null,2)+'\n');
const escape = value => '"'+String(value ?? '').replaceAll('"','""')+'"';
const keys=Object.keys(rows[0]);
fs.writeFileSync(path.join(root,'docs/equipment-balance-census.csv'),[keys.join(','),...rows.map(row=>keys.map(key=>escape(row[key])).join(','))].join('\n')+'\n');
console.log(JSON.stringify({census:EQUIPMENT_CENSUS,families:families.map(({name,count,references,rawPower})=>({name,count,references,median:rawPower.median,p90:rawPower.p90})),outfitSamples},null,2));

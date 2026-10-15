// Original large battlefield. Background and collision are separate assets.
const n = 32;
const background = { artworkId: 'winterfell-last-stand-map-v1', file: 'battlefield.png', propsFile: 'props.png',
  width: 2048, height: 1536, hw: 26, top: 330, originX: 39 };
const obstacles = [];
const put = (x,y,type,prop) => obstacles.push({x,y,type,prop});
// A broken defensive line, with three approaches and open flanks.
for (const [x,y] of [[8,15],[9,15],[11,15],[12,15],[15,15],[16,15],[18,15],[19,15],[21,15]]) put(x,y,'BUSH','barricade');
for (const [x,y] of [[7,18],[12,18],[17,18],[22,18]]) put(x,y,'BUSH','brazier');
for (const [x,y] of [[5,11],[5,21],[24,11],[24,21],[10,7],[20,7]]) put(x,y,'ROCK','pillar');
const battlefield = { version:1, id:'custom-winterfell-last-stand', name:'Winterfell · Le dernier rempart',
  description:'Une brèche entre le bois sacré et les remparts. Six vivants, un brasier et une armée silencieuse. Tuez le Roi de la Nuit pour briser le lien des morts.',
  width:n,height:n,background,obstacles,
  startingCells:[[{x:12,y:23},{x:14,y:23},{x:16,y:23},{x:18,y:23},{x:13,y:25},{x:17,y:25},{x:12,y:25},{x:18,y:25}],
    Array.from({length:32},(_,i)=>({x:7+i%8*2,y:3+Math.floor(i/8)*2}))] };
module.exports = battlefield;
if(require.main===module){
 const fs=require('node:fs');const lines=[]; const p=(x,y)=>[1020+(x-y)*30,240+(x+y)*15];
 for(let i=0;i<=n;i++) for(const [a,b] of [[p(i,0),p(i,n)],[p(0,i),p(n,i)]]) lines.push(`<path d="M${a}L${b}" stroke="#718795" opacity=".35"/>`);
 fs.writeFileSync(__dirname+'/sources/geometry.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="1536"><rect width="2048" height="1536" fill="#152331"/><polygon points="1020,240 1980,720 1020,1200 60,720" fill="#8e9eaa"/>${lines.join('')}<text x="1024" y="100" text-anchor="middle" fill="white" font-size="35">WINTERFELL — 32 × 32 — FLAT BATTLEFIELD GUIDE</text><text x="1024" y="1380" text-anchor="middle" fill="white" font-size="26">Keep the diamond open. Castle and weirwood OUTSIDE it. No grid or UI in final painting.</text></svg>`);
}

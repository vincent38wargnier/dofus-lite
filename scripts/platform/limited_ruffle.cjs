// Imported timelines need their animation callbacks, but must never evaluate
// JavaScript supplied by a SWF. Patch the pinned vendor's two bridge points,
// and fail the build if a vendor update changes their shape.
const CALL = 'new Function(`return (${e})(...arguments);`)(..._)';
const SAFE_CALL = '(e === "dofusLiteSound" && Array.isArray(_) && _.length === 2 && _.every(x => typeof x === "string" && x.length <= 256) && typeof globalThis.dofusLiteSound === "function" ? globalThis.dofusLiteSound(_[0], _[1]) : null)';
const CALLBACK = 'e=>{try{Object.defineProperty(this,e,{value:';
const SAFE_CALLBACK = 'e=>{if(!["animate","currentFrame","accessoryState","effectState"].includes(e))return;try{Object.defineProperty(this,e,{value:';
function replaceExactlyOnce(source, before, after, file) {
  if (source.split(before).length !== 2) throw Error(`Vendor bridge changed in ${file}; inspect it before enabling imported animations.`);
  return source.replace(before, after);
}
function limitedRuffle(file, source) {
  if (/^core\.ruffle\..*\.js$/.test(file)) return replaceExactlyOnce(source, CALL, SAFE_CALL, file);
  if (file === 'ruffle.js') return replaceExactlyOnce(source, CALLBACK, SAFE_CALLBACK, file);
  return source;
}
module.exports = { limitedRuffle, CALL, SAFE_CALL, CALLBACK, SAFE_CALLBACK };

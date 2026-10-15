// Vérifie que les NBYTES premiers octets de deux fichiers sont identiques, par
// blocs de 64 Mo (pas de lecture complète en mémoire — datasets de plusieurs Go).
//   node scripts/rl/prefix_same.cjs FILE_A FILE_B NBYTES  → code 0 si identiques
const fs = require('node:fs');
const [, , fa, fb, nArg] = process.argv;
const N = Number(nArg);
const CH = 64 * 1024 * 1024;
const A = fs.openSync(fa, 'r'); const B = fs.openSync(fb, 'r');
const ba = Buffer.alloc(CH); const bb = Buffer.alloc(CH);
let off = 0; let same = true;
while (off < N) {
  const len = Math.min(CH, N - off);
  const ra = fs.readSync(A, ba, 0, len, off); const rb = fs.readSync(B, bb, 0, len, off);
  if (ra !== len || rb !== len || !ba.subarray(0, len).equals(bb.subarray(0, len))) { same = false; break; }
  off += len;
}
console.log(JSON.stringify({ fa, fb, bytes: N, identical: same }));
process.exit(same ? 0 : 1);

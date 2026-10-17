/* global globalThis */
/* eslint-env worker */
import { readLibrary, LOCAL_LIBRARY_LIMITS } from './libraryFormat';
import { mergeCatalogues } from './localLibraries';
import { readContentZip } from '../content/zip';
globalThis.onmessage = async ({ data }) => {
  try {
    const library = await readLibrary(data.bytes, undefined, LOCAL_LIBRARY_LIMITS);
    if (library.metadata.cover) { const cover = await createImageBitmap(new Blob([library.files.get(library.metadata.cover)],{type:'image/png'})); cover.close(); }
    globalThis.__ARENA_CATALOGUE__ = mergeCatalogues([...(data.existing || []), library]);
    const engine = await import('./libraryRuntime');
    if (library.atelier) {
      const files = await readContentZip(library.atelier, undefined, { limits: engine.ATELIER_LIMITS, allowName: engine.atelierArchivePath });
      if (!files.has('atelier.json')) throw new Error('La bibliothèque doit contenir un export Atelier.');
      await engine.prepareAtelierFiles(files, { newId: () => crypto.randomUUID(), verifyPixels: async (file,definition) => {
        const image = await createImageBitmap(file);
        try {
          const canvas = new OffscreenCanvas(image.width,image.height), context=canvas.getContext('2d');
          context.drawImage(image,0,0); const pixels=context.getImageData(0,0,image.width,image.height).data;
          const width=definition.width?definition.width/definition.frames:definition.frameSize||256, height=definition.height||definition.frameSize||256;
          for(let frame=0;frame<definition.frames;frame++){
            let visible=false,transparent=false;
            for(let y=0;y<height;y++)for(let x=0;x<width;x++){const alpha=pixels[(y*image.width+frame*width+x)*4+3];if(alpha)visible=true;if(!alpha)transparent=true;}
            if(!visible || definition.pose!=='portrait'&&!transparent)throw new Error(`${file.name} : image vide ou transparence manquante.`);
          }
        } finally { image.close(); }
      } });
    }
    globalThis.postMessage({ ok: true });
  } catch (error) { globalThis.postMessage({ error: error.message }); }
};

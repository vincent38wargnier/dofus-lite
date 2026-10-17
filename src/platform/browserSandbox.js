/* global globalThis, FinalizationRegistry */
import { newQuickJSWASMModuleFromVariant, newVariant } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';
import { createSandbox } from './sandboxCore.js';
let initialized;
export function initializeSandbox() {
  if (!initialized) initialized = newQuickJSWASMModuleFromVariant(newVariant(variant, { wasmLocation: '/vendor/quickjs.wasm' })).then(qjs => {
    const cleanup = new FinalizationRegistry(close => close());
    globalThis.__ARENA_COMPILE_BOT__ = source => {
      const bot = createSandbox(qjs, source);
      const decide = (view, api) => bot.decide(view, api);
      decide.dispose = bot.close;
      cleanup.register(decide, bot.close);
      return decide;
    };
  });
  return initialized;
}

// Only JSON crosses the VM boundary. No browser or Node objects are exposed.
function createSandbox(qjs, source) {
  const runtime = qjs.newRuntime();
  runtime.setMemoryLimit(16 * 1048576);
  runtime.setMaxStackSize(512 * 1024);
  let deadline = Date.now() + 200, api, calls = 0;
  const pipelines = new Map();
  runtime.setInterruptHandler(() => Date.now() > deadline || calls > 4000);
  const vm = runtime.newContext();
  const evaluate = code => {
    const result = vm.evalCode(code);
    if (result.error) {
      const error = vm.dump(result.error); result.error.dispose();
      throw new Error(error?.message || 'Erreur IA.');
    }
    try { return vm.dump(result.value); } finally { result.value.dispose(); }
  };
  const bridge = vm.newFunction('__host', (method, input) => {
    if (++calls > 4000 || Date.now() > deadline) throw new Error('Budget IA dépassé.');
    const name = vm.getString(method), raw = vm.getString(input);
    if (raw.length > 200000) throw new Error('Appel trop volumineux.');
    const args = JSON.parse(raw);
    let output;
    if (name === '__pipelineStep') {
      const session = pipelines.get(args[0]);
      if (!session) throw new Error('Pipeline inconnu.');
      output = session.step(args[1]);
    } else {
      if (!api || !Object.prototype.hasOwnProperty.call(api, name) || typeof api[name] !== 'function'
        || ['strategeNet', 'neural'].includes(name)) throw new Error('Fonction non disponible.');
      if (name === 'plan' || name === 'maisonPipeline') args[1] = api.flowInspect;
      output = api[name](...args);
      if (name === 'maisonPipeline') {
        if (pipelines.size >= 32) throw new Error('Trop de pipelines.');
        const id = pipelines.size; pipelines.set(id, output); output = id;
      }
    }
    const json = JSON.stringify(output ?? null);
    if (json.length > 1000000) throw new Error('Réponse API trop volumineuse.');
    return vm.newString(json);
  });
  vm.setProp(vm.global, '__host', bridge); bridge.dispose();
  try {
    evaluate(`'use strict';
      { const NativeDate = Date; globalThis.Date = class extends NativeDate {
        constructor(...args) { super(...(args.length ? args : [0])); }
        static now() { return 0; }
      }; }
      Math.random = () => { throw Error('Utilisez api.random()'); };
      ${source}\nif(typeof decide!=='function')throw Error('Définissez decide(view, api)');`);
  } catch (error) { vm.dispose(); runtime.dispose(); throw error; }
  let closed = false;
  return {
    decide(view, currentApi) {
      if (closed) throw new Error('IA fermée.');
      api = currentApi; calls = 0; pipelines.clear(); deadline = Date.now() + 400;
      const names = Object.keys(api).filter(k => typeof api[k] === 'function' && !['strategeNet', 'neural'].includes(k));
      try {
        return evaluate(`(() => {
          const view = ${JSON.stringify(view)};
          const api = Object.fromEntries(${JSON.stringify(names)}.map(name => [name, (...args) => {
            const result = JSON.parse(__host(name, JSON.stringify(args)));
            return name === 'maisonPipeline' ? { step: stage => JSON.parse(__host('__pipelineStep', JSON.stringify([result, stage]))) } : result;
          }]));
          return JSON.parse(JSON.stringify(decide(view, api)));
        })()`);
      } finally { api = null; pipelines.clear(); }
    },
    close() { if (!closed) { closed = true; vm.dispose(); runtime.dispose(); } },
  };
}
module.exports = { createSandbox };

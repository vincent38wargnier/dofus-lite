const { Worker } = require('node:worker_threads');
const path = require('node:path');
class WorkerPool {
  constructor({ concurrency = 2, maxQueue = 12 } = {}) { this.concurrency = concurrency; this.maxQueue = maxQueue; this.active = 0; this.queue = []; }
  run(task, timeoutMs = 120000) {
    if (this.queue.length >= this.maxQueue) return Promise.reject(new Error('Serveur occupé. Réessayez dans un instant.'));
    return new Promise((resolve, reject) => { this.queue.push({ task, timeoutMs, resolve, reject }); this.pump(); });
  }
  pump() {
    while (this.active < this.concurrency && this.queue.length) {
      const job = this.queue.shift(); this.active++;
      const worker = new Worker(path.join(__dirname, 'worker.cjs'), { workerData: job.task,
        resourceLimits: { maxOldGenerationSizeMb: 384, maxYoungGenerationSizeMb: 32, stackSizeMb: 4 } });
      let settled = false;
      const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate(); this.active--; this.pump(); error ? job.reject(error) : job.resolve(value); };
      const timer = setTimeout(() => finish(new Error('Calcul interrompu : durée maximale atteinte.')), job.timeoutMs);
      worker.on('message', message => finish(message.error ? new Error(message.error) : null, message.value));
      worker.on('error', error => finish(error)); worker.on('exit', code => { if (!settled) finish(new Error(`Calcul interrompu (${code}).`)); });
    }
  }
}
module.exports = { WorkerPool };

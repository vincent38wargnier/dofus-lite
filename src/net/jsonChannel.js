import { check } from './p2p';

export const MAX_MESSAGE_CHARS = 48 * 1048576;
const CHUNK = 8192, MAX_FRAME = 40000, HIGH_WATER = 256 * 1024;

// Reliable/ordered RTCDataChannel, small frames and bounded transfer buffers.
// Backpressure matters for artwork: never enqueue a whole ZIP into SCTP.
export class JsonChannel {
  constructor(channel, onMessage, onError) {
    this.channel = channel; this.onMessage = onMessage; this.onError = onError;
    this.queue = Promise.resolve(); this.incoming = null; this.closed = false; this.serial = 0;
    channel.bufferedAmountLowThreshold = HIGH_WATER / 2;
    this.receive = event => {
      if (this.closed) return;
      try {
        check(typeof event.data === 'string' && event.data.length <= MAX_FRAME, 'Paquet P2P trop volumineux.');
        const frame = JSON.parse(event.data);
        if (frame.t === 'json') {
          check(!this.incoming, 'Transfert P2P interrompu.');
          this.onMessage(frame.data, event.data.length);
        } else if (frame.t === 'begin') {
          check(!this.incoming && Number.isInteger(frame.id) && Number.isInteger(frame.length) && frame.length > 0 && frame.length <= MAX_MESSAGE_CHARS, 'Taille de transfert P2P invalide.');
          this.incoming = { id: frame.id, length: frame.length, chunks: [], size: 0 }; this.armTimeout();
        } else if (frame.t === 'chunk') {
          const transfer = this.incoming;
          check(transfer && frame.id === transfer.id && frame.index === transfer.chunks.length && typeof frame.text === 'string'
            && frame.text.length > 0 && frame.text.length <= CHUNK && transfer.size + frame.text.length <= transfer.length, 'Fragment P2P invalide.');
          transfer.chunks.push(frame.text); transfer.size += frame.text.length; this.armTimeout();
        } else if (frame.t === 'end') {
          const transfer = this.incoming;
          check(transfer && frame.id === transfer.id && transfer.size === transfer.length, 'Transfert P2P incomplet.');
          this.incoming = null; clearTimeout(this.timer);
          this.onMessage(JSON.parse(transfer.chunks.join('')), transfer.length);
        } else throw new Error('Paquet P2P inconnu.');
      } catch (error) { this.close(); this.onError(error); }
    };
    channel.addEventListener('message', this.receive);
  }
  armTimeout() { clearTimeout(this.timer); this.timer = setTimeout(() => { this.close(); this.onError(new Error('Transfert interrompu. Recréez une invitation.')); }, 60000); }
  async frame(value) {
    const channel = this.channel;
    check(!this.closed && channel.readyState === 'open', 'Connexion interrompue.');
    if (channel.bufferedAmount > HIGH_WATER) await new Promise((resolve, reject) => {
      let timer;
      const done = error => { clearTimeout(timer); channel.removeEventListener('bufferedamountlow', low); channel.removeEventListener('close', lost); error ? reject(error) : resolve(); };
      const low = () => done(), lost = () => done(new Error('Connexion interrompue.'));
      channel.addEventListener('bufferedamountlow', low); channel.addEventListener('close', lost);
      timer = setTimeout(() => done(new Error('Le transfert P2P ne répond plus.')), 30000);
      if (channel.readyState !== 'open' || this.closed) lost(); else if (channel.bufferedAmount <= HIGH_WATER / 2) low();
    });
    check(!this.closed && channel.readyState === 'open', 'Connexion interrompue.');
    channel.send(JSON.stringify(value));
  }
  send(message) {
    const data = JSON.stringify(message);
    check(data.length <= MAX_MESSAGE_CHARS, 'Les données du combat dépassent la limite de transfert.');
    const run = async () => {
      if (data.length <= CHUNK) return this.frame({ t: 'json', data: JSON.parse(data) });
      const id = ++this.serial;
      await this.frame({ t: 'begin', id, length: data.length });
      for (let i = 0; i < data.length; i += CHUNK) await this.frame({ t: 'chunk', id, index: i / CHUNK, text: data.slice(i, i + CHUNK) });
      await this.frame({ t: 'end', id });
    };
    const result = this.queue.then(run);
    this.queue = result.catch(() => {});
    return result;
  }
  close() { this.closed = true; clearTimeout(this.timer); this.incoming = null; this.channel.removeEventListener('message', this.receive); }
}

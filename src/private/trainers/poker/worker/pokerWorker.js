// src/private/trainers/poker/worker/pokerWorker.js
// Web Worker entry. Loaded with new Worker(new URL('./pokerWorker.js', import.meta.url), { type: 'module' }).
import { mulberry32 } from '../../core/rng.js';
import { createBrain } from '../bots/index.js';
import { createMessageHandler } from './protocol.js';

const seed = crypto.getRandomValues(new Uint32Array(1))[0];
const handle = createMessageHandler({ createBrain, rng: mulberry32(seed) });

self.addEventListener('message', (event) => {
  self.postMessage(handle(event.data));
});

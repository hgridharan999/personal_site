// src/private/trainers/poker/analysis/worker/analysisWorker.js
// Module worker entry: new Worker(new URL('./analysisWorker.js', import.meta.url), { type: 'module' }).
import { gradeHand } from '../gradeHand.js';
import { createAnalysisHandler } from './protocol.js';

const handle = createAnalysisHandler({ gradeHand });

self.addEventListener('message', (event) => {
  self.postMessage(handle(event.data));
});

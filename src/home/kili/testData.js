import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Shared by the tests in this folder (never imported by the app): the real data files as
// served from public/data, and a small made-up mountain for the maths that wants known answers.

const DATA_DIR = fileURLToPath(new URL('../../../public/data/', import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(`${DATA_DIR}${name}`, 'utf8'));

export const terrainJson = () => readJson('kilimanjaro.json');
export const routeJson = () => readJson('kili-route.json');

/**
 * A 40 x 30 grid: plains at 800 m with one smooth peak of 5000 m at column 20, row 12. Heights
 * are whole metres, like the real file.
 */
export function syntheticTerrainJson() {
  const cols = 40;
  const rows = 30;
  const heights = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const d2 = ((c - 20) / 7) ** 2 + ((r - 12) / 5) ** 2;
      heights.push(Math.round(800 + 4200 * Math.exp(-d2)));
    }
  }
  return {
    grid: [cols, rows],
    cellMetres: 300,
    points: [{ name: 'Uhuru Peak (Kibo)', col: 20, row: 12 }, { name: 'Mawenzi (Hans Meyer Peak)', col: 30, row: 14 }],
    heights,
  };
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Builds the two files the homepage ending fetches at runtime (public/data/*), from the concept's
// source files. Run it by hand when the source terrain or route changes:
//   node scripts/kili-data.js
// The terrain goes from nested rows of decimal metres to one flat row-major array of whole metres
// (300 x 200 values), which is about a third smaller and loads straight into a typed array.

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SOURCE_DIR = path.join(ROOT, 'concepts', '_shared');
const OUT_DIR = path.join(ROOT, 'public', 'data');

/** The kept fields of the source terrain, with `heights` flattened to integer metres. */
export function flattenTerrain(source) {
  const [cols, rows] = source.grid;
  if (source.heights.length !== rows || source.heights.some((row) => row.length !== cols)) {
    throw new Error(`heights are not ${cols} x ${rows}`);
  }
  return {
    grid: source.grid,
    cellMetres: source.cellMetres,
    bounds: source.bounds,
    points: source.points,
    source: source.source,
    notes: 'heights is row-major, grid[0] columns by grid[1] rows, row 0 is north, whole metres.',
    heights: source.heights.flat().map((metres) => Math.round(metres)),
  };
}

function main() {
  const terrain = JSON.parse(fs.readFileSync(path.join(SOURCE_DIR, 'kilimanjaro-full-terrain.json'), 'utf8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'kilimanjaro.json'), JSON.stringify(flattenTerrain(terrain)));
  fs.copyFileSync(path.join(SOURCE_DIR, 'kili-route-machame.json'), path.join(OUT_DIR, 'kili-route.json'));
  console.log('wrote public/data/kilimanjaro.json and public/data/kili-route.json');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

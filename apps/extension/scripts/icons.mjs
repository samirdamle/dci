// Draws the toolbar and store icons (static/icons/*.png): a selection box with
// a pointer dot on the DCI blue. Run after changing the design; the PNGs are
// committed. Shapes are drawn at 4x and averaged down for smooth edges.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const out = join(dirname(fileURLToPath(import.meta.url)), '../static/icons');
const BLUE = [37, 99, 235];
const WHITE = [255, 255, 255];
const SS = 4;

/** Colour at a point in a 1×1 design space, or null for transparent. */
function paint(x, y) {
  const inRoundRect = (l, t, r, b, rad) => {
    const cx = Math.min(Math.max(x, l + rad), r - rad);
    const cy = Math.min(Math.max(y, t + rad), b - rad);
    return (x - cx) ** 2 + (y - cy) ** 2 <= rad ** 2;
  };
  if (!inRoundRect(0, 0, 1, 1, 0.22)) return null;
  // Pointer dot, bottom right.
  if ((x - 0.7) ** 2 + (y - 0.7) ** 2 <= 0.13 ** 2) return WHITE;
  // Selection box outline, top left.
  const outer = inRoundRect(0.18, 0.18, 0.66, 0.66, 0.08);
  const inner = inRoundRect(0.26, 0.26, 0.58, 0.58, 0.03);
  if (outer && !inner) return WHITE;
  return BLUE;
}

mkdirSync(out, { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const png = new PNG({ width: size, height: size });
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = paint((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (!c) continue;
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
          acc[3] += 1;
        }
      }
      const i = (py * size + px) * 4;
      const n = acc[3] || 1;
      png.data[i] = acc[0] / n;
      png.data[i + 1] = acc[1] / n;
      png.data[i + 2] = acc[2] / n;
      png.data[i + 3] = (acc[3] / (SS * SS)) * 255;
    }
  }
  writeFileSync(join(out, `${size}.png`), PNG.sync.write(png));
}
console.log(`Wrote icons to ${out}`);

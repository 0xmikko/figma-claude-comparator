#!/usr/bin/env bun
/**
 * Standalone pixel comparison CLI.
 * Usage: bun compare-cli.ts <before.png> <after.png> [threshold]
 */
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";

const [beforePath, afterPath, thresholdArg] = process.argv.slice(2);

if (!beforePath || !afterPath) {
  console.error("Usage: bun compare-cli.ts <before.png> <after.png> [threshold]");
  process.exit(1);
}

const threshold = thresholdArg ? parseFloat(thresholdArg) : 0.1;

const beforePng = PNG.sync.read(readFileSync(beforePath));
const afterPng = PNG.sync.read(readFileSync(afterPath));

console.log(`Before: ${beforePng.width}x${beforePng.height}`);
console.log(`After:  ${afterPng.width}x${afterPng.height}`);

if (beforePng.width !== afterPng.width || beforePng.height !== afterPng.height) {
  console.error("FAIL: Dimensions don't match!");
  process.exit(1);
}

const { width, height } = beforePng;
const totalPixels = width * height;
const diffPng = new PNG({ width, height });

const differentPixels = pixelmatch(
  beforePng.data,
  afterPng.data,
  diffPng.data,
  width,
  height,
  { threshold }
);

const matchPct = Math.round(((totalPixels - differentPixels) / totalPixels) * 10000) / 100;

console.log(`\nResults:`);
console.log(`  Total pixels:     ${totalPixels.toLocaleString()}`);
console.log(`  Different pixels: ${differentPixels.toLocaleString()}`);
console.log(`  Match:            ${matchPct}%`);

if (differentPixels > 0) {
  const diffPath = join(dirname(afterPath), "diff.png");
  writeFileSync(diffPath, PNG.sync.write(diffPng));
  console.log(`  Diff image:       ${diffPath}`);
}

if (matchPct >= 99.5) {
  console.log(`\n  ✓ PASS (>= 99.5%)`);
} else {
  console.log(`\n  ✗ FAIL (< 99.5%)`);
  process.exit(1);
}

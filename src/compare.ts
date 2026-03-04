import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { saveDiffImage } from "./storage.js";

export interface CompareResult {
  totalPixels: number;
  differentPixels: number;
  matchPercentage: number;
  diffImagePath: string | null;
  dimensionsMatch: boolean;
  beforeDimensions: { width: number; height: number };
  afterDimensions: { width: number; height: number };
}

function base64ToPng(base64: string): PNG {
  const buffer = Buffer.from(base64, "base64");
  return PNG.sync.read(buffer);
}

export function compareImages(
  beforeBase64: string,
  afterBase64: string,
  label: string,
  threshold: number = 0.1
): CompareResult {
  const beforePng = base64ToPng(beforeBase64);
  const afterPng = base64ToPng(afterBase64);

  const beforeDimensions = {
    width: beforePng.width,
    height: beforePng.height,
  };
  const afterDimensions = { width: afterPng.width, height: afterPng.height };

  const dimensionsMatch =
    beforePng.width === afterPng.width &&
    beforePng.height === afterPng.height;

  if (!dimensionsMatch) {
    // If dimensions differ, we can't pixel-compare directly.
    // Report as 0% match with dimension info.
    return {
      totalPixels: beforePng.width * beforePng.height,
      differentPixels: beforePng.width * beforePng.height,
      matchPercentage: 0,
      diffImagePath: null,
      dimensionsMatch,
      beforeDimensions,
      afterDimensions,
    };
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

  const matchPercentage =
    totalPixels > 0
      ? Math.round(((totalPixels - differentPixels) / totalPixels) * 10000) /
        100
      : 100;

  let diffImagePath: string | null = null;
  if (differentPixels > 0) {
    const diffBuffer = PNG.sync.write(diffPng);
    diffImagePath = saveDiffImage(label, diffBuffer);
  }

  return {
    totalPixels,
    differentPixels,
    matchPercentage,
    diffImagePath,
    dimensionsMatch,
    beforeDimensions,
    afterDimensions,
  };
}

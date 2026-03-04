import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

export interface Snapshot {
  nodeId: string;
  label: string;
  type: "before" | "after";
  imageData: string; // base64 PNG
  scale: number;
  timestamp: number;
}

export interface SnapshotPair {
  before: Snapshot | null;
  after: Snapshot | null;
}

const snapshots = new Map<string, SnapshotPair>();
const tempDir = join(tmpdir(), "figma-pixel-compare");

function ensureTempDir() {
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
}

export function storeSnapshot(snapshot: Snapshot): void {
  const existing = snapshots.get(snapshot.label) || {
    before: null,
    after: null,
  };
  existing[snapshot.type] = snapshot;
  snapshots.set(snapshot.label, existing);
}

export function getSnapshotPair(label: string): SnapshotPair | undefined {
  return snapshots.get(label);
}

export function listSnapshots(): Array<{
  label: string;
  hasBefore: boolean;
  hasAfter: boolean;
}> {
  const result: Array<{
    label: string;
    hasBefore: boolean;
    hasAfter: boolean;
  }> = [];

  for (const [label, pair] of snapshots.entries()) {
    result.push({
      label,
      hasBefore: pair.before !== null,
      hasAfter: pair.after !== null,
    });
  }

  return result;
}

export function clearSnapshots(label?: string): number {
  if (label) {
    const existed = snapshots.has(label);
    snapshots.delete(label);
    return existed ? 1 : 0;
  }

  const count = snapshots.size;
  snapshots.clear();
  return count;
}

export function saveDiffImage(label: string, pngBuffer: Buffer): string {
  ensureTempDir();
  const filename = `diff-${label}-${Date.now()}.png`;
  const filePath = join(tempDir, filename);
  writeFileSync(filePath, pngBuffer);
  return filePath;
}

export function getTempDir(): string {
  ensureTempDir();
  return tempDir;
}

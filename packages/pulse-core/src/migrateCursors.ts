import { CursorStore } from "./CursorStore.js";

/** Result returned after migrating a cursor store to a target store. */
export interface MigrateCursorsResult {
  migrated: number;
}

/** Copy all stored cursors from one durable store to another. */
export async function migrateCursors(
  source: CursorStore,
  target: CursorStore,
): Promise<MigrateCursorsResult> {
  const entries = await source.getAll();
  for (const entry of entries) {
    await target.set(entry.streamKey, entry.cursor);
  }
  return { migrated: entries.length };
}

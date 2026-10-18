import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

export const PHOTOS_DIR = `${FileSystem.documentDirectory ?? ''}vault_photos/`;
export const DB_NAME = 'paranoid_vault_prod.db';

export type ItemType = 'receipt' | 'document';
export type ItemStatus = 'needs_review' | 'complete';

export interface SplitEntry {
  category: string;
  amount: number;
}

export interface VaultItem {
  id: string;
  item_type: ItemType;
  name: string | null;
  total_amount: number;
  category: string;
  splits_json: string | null;
  status: ItemStatus;
  is_pinned: number;
  created_at: string;
  expires_at: string | null;
  photos: string[];
}

export interface CategorySummary {
  category: string;
  total: number;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbInstance) {
    dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  }
  return dbInstance;
}

export async function initDatabase(): Promise<void> {
  if (PHOTOS_DIR) {
    const dir = await FileSystem.getInfoAsync(PHOTOS_DIR);
    if (!dir.exists) {
      await FileSystem.makeDirectoryAsync(PHOTOS_DIR, { intermediates: true });
    }
  }

  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS Items (
      id TEXT PRIMARY KEY NOT NULL,
      item_type TEXT NOT NULL,
      name TEXT,
      total_amount REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL,
      splits_json TEXT,
      status TEXT NOT NULL DEFAULT 'complete',
      is_pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT
    );

    CREATE TABLE IF NOT EXISTS Photos (
      id TEXT PRIMARY KEY NOT NULL,
      item_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      FOREIGN KEY (item_id) REFERENCES Items(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_items_created ON Items(created_at);
    CREATE INDEX IF NOT EXISTS idx_items_status ON Items(status);
  `);
}

/**
 * Startup Janitor: Deletes unpinned expired items & their photo files on launch
 */
export async function runStartupJanitor(): Promise<number> {
  const db = await getDb();
  const now = new Date().toISOString();

  const expiredPhotos = await db.getAllAsync<{ file_name: string }>(`
    SELECT p.file_name FROM Photos p
    INNER JOIN Items i ON p.item_id = i.id
    WHERE i.is_pinned = 0 AND i.expires_at IS NOT NULL AND i.expires_at <= ?
  `, [now]);

  for (const row of expiredPhotos) {
    await FileSystem.deleteAsync(`${PHOTOS_DIR}${row.file_name}`, { idempotent: true });
  }

  const res = await db.runAsync(`
    DELETE FROM Items WHERE is_pinned = 0 AND expires_at IS NOT NULL AND expires_at <= ?
  `, [now]);
  return res.changes;
}

/**
 * Save a Receipt, Multi-Page Document, or No-Photo UPI Entry
 */
export async function insertVaultItem(params: {
  itemType: ItemType;
  name?: string;
  totalAmount: number;
  mainCategory: string;
  splits?: SplitEntry[];
  isPinned: boolean;
  photoFileNames: string[];
}): Promise<void> {
  const db = await getDb();
  const itemId = generateId();
  const now = new Date();

  const cleanName = params.name?.trim() || null;
  const status: ItemStatus = cleanName ? 'complete' : 'needs_review';

  // Retention: 90 days for receipts, 365 days for documents
  const retentionDays = params.itemType === 'receipt' ? 90 : 365;
  const expiresAt = params.isPinned
    ? null
    : new Date(now.getTime() + retentionDays * 86400000).toISOString();

  // Build final category breakdown (Auto-Remainder Split logic)
  let finalSplits: SplitEntry[] = [];
  if (params.itemType === 'receipt' && params.totalAmount > 0) {
    const subSplits = (params.splits || []).filter((s) => s.amount > 0);
    const subTotal = subSplits.reduce((acc, s) => acc + s.amount, 0);
    const remainder = Math.max(0, params.totalAmount - subTotal);
    finalSplits = [{ category: params.mainCategory, amount: remainder }, ...subSplits];
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(`
      INSERT INTO Items (id, item_type, name, total_amount, category, splits_json, status, is_pinned, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      itemId,
      params.itemType,
      cleanName,
      params.totalAmount || 0,
      params.mainCategory,
      finalSplits.length > 0 ? JSON.stringify(finalSplits) : null,
      status,
      params.isPinned ? 1 : 0,
      now.toISOString(),
      expiresAt,
    ]);

    for (let i = 0; i < params.photoFileNames.length; i++) {
      await db.runAsync(`
        INSERT INTO Photos (id, item_id, file_name, page_number) VALUES (?, ?, ?, ?)
      `, [generateId(), itemId, params.photoFileNames[i], i + 1]);
    }
  });
}

export async function fetchAllVaultItems(): Promise<VaultItem[]> {
  const db = await getDb();
  const items = await db.getAllAsync<Omit<VaultItem, 'photos'>>(`
    SELECT * FROM Items ORDER BY created_at DESC
  `);
  const photos = await db.getAllAsync<{ item_id: string; file_name: string }>(`
    SELECT item_id, file_name FROM Photos ORDER BY page_number ASC
  `);

  const photoMap: Record<string, string[]> = {};
  for (const p of photos) {
    if (!photoMap[p.item_id]) photoMap[p.item_id] = [];
    photoMap[p.item_id].push(p.file_name);
  }

  return items.map((item) => ({
    ...item,
    photos: photoMap[item.id] || [],
  }));
}

export async function updateItemNameAndPin(
  id: string,
  newName: string,
  isPinned: boolean
): Promise<void> {
  const db = await getDb();
  const clean = newName.trim();
  await db.runAsync(`
    UPDATE Items SET name = ?, status = ?, is_pinned = ? WHERE id = ?
  `, [clean || null, clean ? 'complete' : 'needs_review', isPinned ? 1 : 0, id]);
}

export async function deleteVaultItem(id: string, photoFiles: string[]): Promise<void> {
  const db = await getDb();
  for (const file of photoFiles) {
    await FileSystem.deleteAsync(`${PHOTOS_DIR}${file}`, { idempotent: true });
  }
  await db.runAsync(`DELETE FROM Items WHERE id = ?`, [id]);
}

/**
 * Calculates exact category totals for the current month including split bills
 */
export function calculateCategoryTotals(items: VaultItem[]): CategorySummary[] {
  const totals: Record<string, number> = {};

  for (const item of items) {
    if (item.item_type !== 'receipt' || item.total_amount <= 0) continue;

    if (item.splits_json) {
      try {
        const splits: SplitEntry[] = JSON.parse(item.splits_json);
        for (const s of splits) {
          if (s.amount > 0) {
            totals[s.category] = (totals[s.category] || 0) + s.amount;
          }
        }
        continue;
      } catch {
        // Fallback to main category
      }
    }
    totals[item.category] = (totals[item.category] || 0) + item.total_amount;
  }

  return Object.entries(totals)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 1-Tap Portable Backup (Bundles SQLite rows + Base64 Photos into a single .paranoid.json file)
 */
export async function exportPortableBackup(): Promise<void> {
  const items = await fetchAllVaultItems();
  const photoBlobs: Record<string, string> = {};

  for (const item of items) {
    for (const fileName of item.photos) {
      const path = `${PHOTOS_DIR}${fileName}`;
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        photoBlobs[fileName] = await FileSystem.readAsStringAsync(path, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
    }
  }
  const backupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    items,
    photoBlobs,
  };

  const dateStr = new Date().toISOString().split('T')[0];
  const backupUri = `${FileSystem.cacheDirectory}Paranoid_Backup_${dateStr}.json`;

  await FileSystem.writeAsStringAsync(backupUri, JSON.stringify(backupPayload), {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(backupUri, {
      mimeType: 'application/json',
      dialogTitle: 'Save Paranoid Vault Backup',
    });
  }
}

/**
 * 1-Tap Restore from a Paranoid_Backup.json file
 */
export async function importPortableBackup(): Promise<number> {
  const res = await DocumentPicker.getDocumentAsync({
    type: 'application/json',
    copyToCacheDirectory: true,
  });

  if (res.canceled || !res.assets?.[0]?.uri) return 0;

  const rawJson = await FileSystem.readAsStringAsync(res.assets[0].uri, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const parsed = JSON.parse(rawJson);
  if (!parsed?.items || !Array.isArray(parsed.items)) {
    throw new Error('Invalid backup file format.');
  }

  // Restore physical photos
  if (parsed.photoBlobs) {
    for (const [fileName, base64Data] of Object.entries(parsed.photoBlobs)) {
      await FileSystem.writeAsStringAsync(`${PHOTOS_DIR}${fileName}`, base64Data as string, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }
  }

  const db = await getDb();
  let restoredCount = 0;

  await db.withTransactionAsync(async () => {
    for (const item of parsed.items as VaultItem[]) {
      await db.runAsync(`
        INSERT OR REPLACE INTO Items (id, item_type, name, total_amount, category, splits_json, status, is_pinned, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        item.id,
        item.item_type,
        item.name,
        item.total_amount,
        item.category,
        item.splits_json,
        item.status,
        item.is_pinned,
        item.created_at,
        item.expires_at,
      ]);

      await db.runAsync(`DELETE FROM Photos WHERE item_id = ?`, [item.id]);
      for (let i = 0; i < (item.photos || []).length; i++) {
        await db.runAsync(`
          INSERT INTO Photos (id, item_id, file_name, page_number) VALUES (?, ?, ?, ?)
        `, [generateId(), item.id, item.photos[i], i + 1]);
      }
      restoredCount++;
    }
  });

  return restoredCount;
}

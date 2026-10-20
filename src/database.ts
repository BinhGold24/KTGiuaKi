import * as SQLite from 'expo-sqlite';
import { Dish, DishCategory, DishDraft } from './types';

const PREFIX = 'BCS240007_';
const dbPromise = SQLite.openDatabaseAsync('BCS240007_FoodManager.db');
const categoriesTable = `${PREFIX}DishCategory`;
const dishesTable = `${PREFIX}Dish`;
const imagesTable = `${PREFIX}DishImage`;
const deletedTable = `${PREFIX}SyncDelete`;

const seedCategories: DishCategory[] = [
  { id: 'cat-seafood', name: 'Seafood', description: 'Fresh ocean favorites' },
  { id: 'cat-main', name: 'Main course', description: 'Hearty signature plates' },
  { id: 'cat-dessert', name: 'Dessert', description: 'A sweet finish' },
];

type DishRow = {
  BCS240007_Id: string;
  BCS240007_Name: string;
  BCS240007_Price: number;
  BCS240007_PreparationTime: number;
  BCS240007_IsAvailable: number;
  BCS240007_Description: string;
  BCS240007_DishCategoryId: string;
  BCS240007_RemoteId: string | null;
  BCS240007_SyncStatus: 'synced' | 'pending';
};

async function initialize() {
  const db = await dbPromise;
  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS "${categoriesTable}" (
      "${PREFIX}Id" TEXT PRIMARY KEY NOT NULL,
      "${PREFIX}Name" TEXT NOT NULL,
      "${PREFIX}Description" TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS "${dishesTable}" (
      "${PREFIX}Id" TEXT PRIMARY KEY NOT NULL,
      "${PREFIX}Name" TEXT NOT NULL,
      "${PREFIX}Price" REAL NOT NULL CHECK ("${PREFIX}Price" > 0),
      "${PREFIX}PreparationTime" INTEGER NOT NULL CHECK ("${PREFIX}PreparationTime" > 0),
      "${PREFIX}IsAvailable" INTEGER NOT NULL DEFAULT 1,
      "${PREFIX}Description" TEXT NOT NULL DEFAULT '',
      "${PREFIX}DishCategoryId" TEXT NOT NULL REFERENCES "${categoriesTable}"("${PREFIX}Id"),
      "${PREFIX}RemoteId" TEXT,
      "${PREFIX}SyncStatus" TEXT NOT NULL DEFAULT 'pending'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "${PREFIX}Dish_Category_Name"
      ON "${dishesTable}" ("${PREFIX}DishCategoryId", "${PREFIX}Name" COLLATE NOCASE);
    CREATE TABLE IF NOT EXISTS "${imagesTable}" (
      "${PREFIX}Id" TEXT PRIMARY KEY NOT NULL,
      "${PREFIX}DishId" TEXT NOT NULL REFERENCES "${dishesTable}"("${PREFIX}Id") ON DELETE CASCADE,
      "${PREFIX}ImageUrl" TEXT NOT NULL,
      "${PREFIX}IsThumbnail" INTEGER NOT NULL DEFAULT 0
    );
    CREATE UNIQUE INDEX IF NOT EXISTS "${PREFIX}DishImage_OneThumbnail"
      ON "${imagesTable}" ("${PREFIX}DishId")
      WHERE "${PREFIX}IsThumbnail" = 1;
    CREATE TABLE IF NOT EXISTS "${deletedTable}" (
      "${PREFIX}RemoteId" TEXT PRIMARY KEY NOT NULL
    );
  `);
  const categoryCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM "${categoriesTable}"`,
  );
  if ((categoryCount?.count ?? 0) === 0) {
    for (const category of seedCategories) {
      await db.runAsync(
        `INSERT INTO "${categoriesTable}" ("${PREFIX}Id", "${PREFIX}Name", "${PREFIX}Description") VALUES (?, ?, ?)`,
        category.id,
        category.name,
        category.description,
      );
    }
  }
  const dishCount = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM "${dishesTable}"`,
  );
  const legacySamplePrices: [string, number, number][] = [
    ['dish-salmon', 18.5, 185000],
    ['dish-shrimp', 14, 140000],
    ['dish-noodles', 12.5, 125000],
    ['dish-rice', 9.5, 95000],
    ['dish-cake', 7, 70000],
  ];
  for (const [id, oldPrice, vndPrice] of legacySamplePrices) {
    await db.runAsync(
      `UPDATE "${dishesTable}" SET "${PREFIX}Price" = ? WHERE "${PREFIX}Id" = ? AND "${PREFIX}Price" = ?`,
      vndPrice,
      id,
      oldPrice,
    );
  }
  if ((dishCount?.count ?? 0) === 0) {
    const samples: [string, string, number, number, number, string, string][] = [
      ['dish-salmon', 'Grilled Salmon', 185000, 20, 1, 'Charcoal-grilled salmon with lemon herbs.', 'cat-seafood'],
      ['dish-shrimp', 'Garlic Butter Shrimp', 140000, 12, 1, 'Juicy shrimp tossed in garlic butter.', 'cat-seafood'],
      ['dish-noodles', 'Beef Noodle Bowl', 125000, 18, 1, 'Slow-braised beef with fresh noodles.', 'cat-main'],
      ['dish-rice', 'Garden Fried Rice', 95000, 10, 0, 'Wok-fried rice with seasonal vegetables.', 'cat-main'],
      ['dish-cake', 'Chocolate Lava Cake', 70000, 25, 1, 'Warm chocolate cake with a molten center.', 'cat-dessert'],
    ];
    for (const sample of samples) {
      await db.runAsync(
        `INSERT INTO "${dishesTable}" ("${PREFIX}Id", "${PREFIX}Name", "${PREFIX}Price", "${PREFIX}PreparationTime", "${PREFIX}IsAvailable", "${PREFIX}Description", "${PREFIX}DishCategoryId", "${PREFIX}SyncStatus") VALUES (?, ?, ?, ?, ?, ?, ?, 'synced')`,
        ...sample,
      );
    }
  }
}

let initialized: Promise<void> | null = null;
export async function ensureDatabase() {
  initialized ??= initialize();
  return initialized;
}

export async function listCategories(): Promise<DishCategory[]> {
  await ensureDatabase();
  const db = await dbPromise;
  const rows = await db.getAllAsync<{
    BCS240007_Id: string;
    BCS240007_Name: string;
    BCS240007_Description: string;
  }>(`SELECT * FROM "${categoriesTable}" ORDER BY "${PREFIX}Name"`);
  return rows.map((row) => ({
    id: row.BCS240007_Id,
    name: row.BCS240007_Name,
    description: row.BCS240007_Description,
  }));
}

export async function listDishes(): Promise<Dish[]> {
  await ensureDatabase();
  const db = await dbPromise;
  const rows = await db.getAllAsync<DishRow>(
    `SELECT * FROM "${dishesTable}" ORDER BY "${PREFIX}Name" COLLATE NOCASE`,
  );
  const images = await db.getAllAsync<{
    BCS240007_Id: string;
    BCS240007_DishId: string;
    BCS240007_ImageUrl: string;
    BCS240007_IsThumbnail: number;
  }>(`SELECT * FROM "${imagesTable}"`);
  return rows.map((row) => ({
    id: row.BCS240007_Id,
    name: row.BCS240007_Name,
    price: row.BCS240007_Price,
    preparationTime: row.BCS240007_PreparationTime,
    isAvailable: row.BCS240007_IsAvailable === 1,
    description: row.BCS240007_Description,
    dishCategoryId: row.BCS240007_DishCategoryId,
    remoteId: row.BCS240007_RemoteId,
    syncStatus: row.BCS240007_SyncStatus,
    images: images
      .filter((image) => image.BCS240007_DishId === row.BCS240007_Id)
      .map((image) => ({
        id: image.BCS240007_Id,
        imageUrl: image.BCS240007_ImageUrl,
        isThumbnail: image.BCS240007_IsThumbnail === 1,
      })),
  }));
}

export async function saveDish(draft: DishDraft, existing?: Dish): Promise<void> {
  await ensureDatabase();
  const db = await dbPromise;
  const id = existing?.id ?? `dish-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.withTransactionAsync(async () => {
    const duplicate = await db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM "${dishesTable}" WHERE "${PREFIX}DishCategoryId" = ? AND LOWER("${PREFIX}Name") = LOWER(?) AND "${PREFIX}Id" != ?`,
      draft.dishCategoryId,
      draft.name.trim(),
      id,
    );
    if ((duplicate?.count ?? 0) > 0) throw new Error('DUPLICATE_NAME');

    await db.runAsync(
      `INSERT INTO "${dishesTable}" ("${PREFIX}Id", "${PREFIX}Name", "${PREFIX}Price", "${PREFIX}PreparationTime", "${PREFIX}IsAvailable", "${PREFIX}Description", "${PREFIX}DishCategoryId", "${PREFIX}RemoteId", "${PREFIX}SyncStatus")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
       ON CONFLICT("${PREFIX}Id") DO UPDATE SET
         "${PREFIX}Name" = excluded."${PREFIX}Name",
         "${PREFIX}Price" = excluded."${PREFIX}Price",
         "${PREFIX}PreparationTime" = excluded."${PREFIX}PreparationTime",
         "${PREFIX}IsAvailable" = excluded."${PREFIX}IsAvailable",
         "${PREFIX}Description" = excluded."${PREFIX}Description",
         "${PREFIX}DishCategoryId" = excluded."${PREFIX}DishCategoryId",
         "${PREFIX}SyncStatus" = 'pending'`,
      id,
      draft.name.trim(),
      draft.price,
      draft.preparationTime,
      draft.isAvailable ? 1 : 0,
      draft.description.trim(),
      draft.dishCategoryId,
      existing?.remoteId ?? null,
    );
    await db.runAsync(
      `DELETE FROM "${imagesTable}" WHERE "${PREFIX}DishId" = ?`,
      id,
    );
    for (const [index, image] of draft.images.entries()) {
      await db.runAsync(
        `INSERT INTO "${imagesTable}" ("${PREFIX}Id", "${PREFIX}DishId", "${PREFIX}ImageUrl", "${PREFIX}IsThumbnail") VALUES (?, ?, ?, ?)`,
        `${id}-image-${index}`,
        id,
        image.imageUrl.trim(),
        image.isThumbnail ? 1 : 0,
      );
    }
  });
}

export async function deleteDish(id: string): Promise<void> {
  await ensureDatabase();
  const db = await dbPromise;
  await db.withTransactionAsync(async () => {
    const dish = await db.getFirstAsync<{ BCS240007_RemoteId: string | null }>(
      `SELECT "${PREFIX}RemoteId" FROM "${dishesTable}" WHERE "${PREFIX}Id" = ?`,
      id,
    );
    if (dish?.BCS240007_RemoteId) {
      await db.runAsync(
        `INSERT OR IGNORE INTO "${deletedTable}" ("${PREFIX}RemoteId") VALUES (?)`,
        dish.BCS240007_RemoteId,
      );
    }
    await db.runAsync(`DELETE FROM "${dishesTable}" WHERE "${PREFIX}Id" = ?`, id);
  });
}

export async function getPendingDishes(): Promise<Dish[]> {
  return (await listDishes()).filter((dish) => dish.syncStatus === 'pending');
}

export async function getPendingDeletes(): Promise<string[]> {
  await ensureDatabase();
  const db = await dbPromise;
  const rows = await db.getAllAsync<{ BCS240007_RemoteId: string }>(
    `SELECT "${PREFIX}RemoteId" FROM "${deletedTable}"`,
  );
  return rows.map((row) => row.BCS240007_RemoteId);
}

export async function markDeleteSynced(remoteId: string): Promise<void> {
  await ensureDatabase();
  const db = await dbPromise;
  await db.runAsync(
    `DELETE FROM "${deletedTable}" WHERE "${PREFIX}RemoteId" = ?`,
    remoteId,
  );
}

export async function markDishSynced(id: string, remoteId: string): Promise<void> {
  await ensureDatabase();
  const db = await dbPromise;
  await db.runAsync(
    `UPDATE "${dishesTable}" SET "${PREFIX}RemoteId" = ?, "${PREFIX}SyncStatus" = 'synced' WHERE "${PREFIX}Id" = ?`,
    remoteId,
    id,
  );
}

export type RemoteDish = {
  id: string;
  BCS240007_Id?: string;
  BCS240007_Name: string;
  BCS240007_Price: number | string;
  BCS240007_PreparationTime: number | string;
  BCS240007_IsAvailable: boolean | number;
  BCS240007_Description?: string;
  BCS240007_DishCategoryId: string;
  BCS240007_DishImage?: {
    BCS240007_ImageUrl: string;
    BCS240007_IsThumbnail: boolean | number;
  }[];
};

export async function mergeRemoteDishes(remoteDishes: RemoteDish[]): Promise<void> {
  await ensureDatabase();
  const db = await dbPromise;
  for (const remote of remoteDishes) {
    const id = remote.BCS240007_Id ?? `mock-${remote.id}`;
    await db.withTransactionAsync(async () => {
      const category = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) AS count FROM "${categoriesTable}" WHERE "${PREFIX}Id" = ?`,
        remote.BCS240007_DishCategoryId,
      );
      if (!category?.count) {
        throw new Error(`UNKNOWN_REMOTE_CATEGORY:${remote.BCS240007_DishCategoryId}`);
      }
      const existing = await db.getFirstAsync<{ BCS240007_SyncStatus: string }>(
        `SELECT "${PREFIX}SyncStatus" FROM "${dishesTable}" WHERE "${PREFIX}Id" = ?`,
        id,
      );
      if (existing?.BCS240007_SyncStatus === 'pending') return;
      await db.runAsync(
        `INSERT INTO "${dishesTable}" ("${PREFIX}Id", "${PREFIX}Name", "${PREFIX}Price", "${PREFIX}PreparationTime", "${PREFIX}IsAvailable", "${PREFIX}Description", "${PREFIX}DishCategoryId", "${PREFIX}RemoteId", "${PREFIX}SyncStatus")
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced')
         ON CONFLICT("${PREFIX}Id") DO UPDATE SET
           "${PREFIX}Name" = excluded."${PREFIX}Name",
           "${PREFIX}Price" = excluded."${PREFIX}Price",
           "${PREFIX}PreparationTime" = excluded."${PREFIX}PreparationTime",
           "${PREFIX}IsAvailable" = excluded."${PREFIX}IsAvailable",
           "${PREFIX}Description" = excluded."${PREFIX}Description",
           "${PREFIX}DishCategoryId" = excluded."${PREFIX}DishCategoryId",
           "${PREFIX}RemoteId" = excluded."${PREFIX}RemoteId",
           "${PREFIX}SyncStatus" = 'synced'`,
        id,
        remote.BCS240007_Name,
        Number(remote.BCS240007_Price),
        Number(remote.BCS240007_PreparationTime),
        remote.BCS240007_IsAvailable === true || remote.BCS240007_IsAvailable === 1 ? 1 : 0,
        remote.BCS240007_Description ?? '',
        remote.BCS240007_DishCategoryId,
        remote.id,
      );
      await db.runAsync(
        `DELETE FROM "${imagesTable}" WHERE "${PREFIX}DishId" = ?`,
        id,
      );
      for (const [index, image] of (remote.BCS240007_DishImage ?? []).entries()) {
        await db.runAsync(
          `INSERT INTO "${imagesTable}" ("${PREFIX}Id", "${PREFIX}DishId", "${PREFIX}ImageUrl", "${PREFIX}IsThumbnail") VALUES (?, ?, ?, ?)`,
          `${id}-remote-image-${index}`,
          id,
          image.BCS240007_ImageUrl,
          image.BCS240007_IsThumbnail === true || image.BCS240007_IsThumbnail === 1 ? 1 : 0,
        );
      }
    });
  }
}

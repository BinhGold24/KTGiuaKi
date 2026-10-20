import {
  getPendingDeletes,
  getPendingDishes,
  markDeleteSynced,
  markDishSynced,
  mergeRemoteDishes,
  RemoteDish,
} from './database';

const baseUrl = process.env.EXPO_PUBLIC_MOCKAPI_BASE_URL?.replace(/\/+$/, '');
const dishesEndpoint = process.env.EXPO_PUBLIC_MOCKAPI_DISHES_ENDPOINT ?? 'BCS240007_Dish';

export const isMockApiConfigured = Boolean(baseUrl);

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!baseUrl) throw new Error('MOCKAPI_NOT_CONFIGURED');
  const response = await fetch(`${baseUrl}/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) throw new Error(`MOCKAPI_HTTP_${response.status}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

async function performSync(): Promise<number> {
  const pending = await getPendingDishes();
  let synced = 0;
  for (const dish of pending) {
    const payload = {
      BCS240007_Id: dish.remoteId ?? dish.id,
      BCS240007_Name: dish.name,
      BCS240007_Price: dish.price,
      BCS240007_PreparationTime: dish.preparationTime,
      BCS240007_IsAvailable: dish.isAvailable,
      BCS240007_Description: dish.description,
      BCS240007_DishCategoryId: dish.dishCategoryId,
      BCS240007_DishImage: dish.images.map((image) => ({
        BCS240007_ImageUrl: image.imageUrl,
        BCS240007_IsThumbnail: image.isThumbnail,
      })),
    };
    const existing = dish.remoteId
      ? { id: dish.remoteId }
      : (await request<RemoteDish[]>(dishesEndpoint)).find((item) => item.BCS240007_Id === dish.id);
    const remote = existing
      ? await request<{ id: string }>(`${dishesEndpoint}/${encodeURIComponent(existing.id)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        })
      : await request<{ id: string }>(dishesEndpoint, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
    await markDishSynced(dish.id, remote.id);
    synced += 1;
  }
  for (const remoteId of await getPendingDeletes()) {
    await request<void>(`${dishesEndpoint}/${encodeURIComponent(remoteId)}`, { method: 'DELETE' });
    await markDeleteSynced(remoteId);
  }
  const remoteDishes = await request<RemoteDish[]>(dishesEndpoint);
  await mergeRemoteDishes(remoteDishes);
  return synced;
}

let activeSync: Promise<number> | undefined;
export function syncPendingDishes(): Promise<number> {
  if (activeSync) return activeSync;
  activeSync = performSync().finally(() => {
    activeSync = undefined;
  });
  return activeSync;
}

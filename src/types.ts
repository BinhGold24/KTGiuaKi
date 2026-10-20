export type Language = 'en' | 'vi';

export type DishCategory = {
  id: string;
  name: string;
  description: string;
};

export type DishImage = {
  id: string;
  imageUrl: string;
  isThumbnail: boolean;
};

export type Dish = {
  id: string;
  name: string;
  price: number;
  preparationTime: number;
  isAvailable: boolean;
  description: string;
  dishCategoryId: string;
  images: DishImage[];
  remoteId: string | null;
  syncStatus: 'synced' | 'pending';
};

export type DishDraft = Omit<Dish, 'id' | 'remoteId' | 'syncStatus'>;

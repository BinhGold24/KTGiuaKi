# BCS240007_FoodManager

React Native / Expo app for managing dishes with SQLite local storage and automatic MockAPI synchronization.

## Run

```sh
npm install
npx expo start
```

Use Expo Go on Android or run `npm run android` from a machine with the Android toolchain.

## MockAPI setup

1. Create a MockAPI project and a collection named `BCS240007_Dish`.
2. Copy `.env.example` to `.env` and replace the base URL with the project URL, for example `https://<project-id>.mockapi.io/api/v1`.
3. If your collection uses another name, set `EXPO_PUBLIC_MOCKAPI_DISHES_ENDPOINT` to that collection name.
4. Restart Expo after changing environment variables.

The app sends and reads these prefixed fields: `BCS240007_Id`, `BCS240007_Name`,
`BCS240007_Price`, `BCS240007_PreparationTime`, `BCS240007_IsAvailable`,
`BCS240007_Description`, `BCS240007_DishCategoryId`, and `BCS240007_DishImage`.
`BCS240007_DishImage` is an array of objects containing `BCS240007_ImageUrl`
and `BCS240007_IsThumbnail`. Category IDs refer to the locally seeded categories
(`cat-seafood`, `cat-main`, `cat-dessert`); add matching category records to your
MockAPI collection before syncing server-side dishes that use other category IDs.

Pending dish creates, edits, and deletes are saved in SQLite first. When internet
connectivity returns, the app retries automatically, uses the stable local ID to
avoid duplicate creates, then refreshes local records from the API. If the API
is not configured or unavailable, the app remains usable in local-only mode.

## Data and validation

SQLite tables and all persisted columns use the required `BCS240007_` prefix.
The local database is seeded with three categories and five dishes. Dish images
are stored separately, with a partial unique index enforcing at most one cover
image per dish. Dish names are unique within a category (case-insensitive).
Prices are entered and displayed in Vietnamese dong (VND). The five bundled
sample dish names have English and Vietnamese display labels; user-entered
names are kept as entered.

import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  deleteDish,
  ensureDatabase,
  listCategories,
  listDishes,
  saveDish,
} from './src/database';
import { translate, translateDishName, MessageKey } from './src/i18n';
import { isMockApiConfigured, syncPendingDishes } from './src/mockApi';
import { Dish, DishCategory, DishDraft, Language } from './src/types';

type SortMode = 'default' | 'price-asc' | 'price-desc' | 'time-asc';
type FormState = {
  name: string;
  price: string;
  preparationTime: string;
  description: string;
  dishCategoryId: string;
  isAvailable: boolean;
  images: DishDraft['images'];
  imageUrl: string;
};

function formatVnd(value: number, language: Language) {
  return new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(value);
}

const blankForm = (categoryId = ''): FormState => ({
  name: '',
  price: '',
  preparationTime: '',
  description: '',
  dishCategoryId: categoryId,
  isAvailable: true,
  images: [],
  imageUrl: '',
});

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.multilineInput]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#969c9d"
        keyboardType={keyboardType}
        multiline={multiline}
      />
    </View>
  );
}

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [categories, setCategories] = useState<DishCategory[]>([]);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [syncMessage, setSyncMessage] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [availabilityFilter, setAvailabilityFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [minimumPrice, setMinimumPrice] = useState('');
  const [maximumPrice, setMaximumPrice] = useState('');
  const [sort, setSort] = useState<SortMode>('default');
  const [formVisible, setFormVisible] = useState(false);
  const [editingDish, setEditingDish] = useState<Dish | undefined>();
  const [selectedDish, setSelectedDish] = useState<Dish | undefined>();
  const [form, setForm] = useState<FormState>(blankForm());
  const [validation, setValidation] = useState('');
  const t = (key: MessageKey) => translate(language, key);

  const reload = useCallback(async () => {
    const [loadedCategories, loadedDishes] = await Promise.all([listCategories(), listDishes()]);
    setCategories(loadedCategories);
    setDishes(loadedDishes);
  }, []);

  const sync = useCallback(async (online: boolean) => {
    if (!online || !isMockApiConfigured) return;
    try {
      const count = await syncPendingDishes();
      await reload();
      setSyncMessage(count > 0 ? translate(language, 'syncReady') : '');
    } catch {
      setSyncMessage(translate(language, 'syncError'));
    }
  }, [language, reload]);

  useEffect(() => {
    let active = true;
    ensureDatabase()
      .then(reload)
      .catch(() => {
        if (active) Alert.alert(translate(language, 'loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const updateConnection = (state: Awaited<ReturnType<typeof NetInfo.fetch>>) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      setConnected(online);
      if (online) void sync(true);
    };
    const unsubscribe = NetInfo.addEventListener(updateConnection);
    void NetInfo.fetch().then(updateConnection);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [language, reload, sync]);

  const filteredDishes = useMemo(() => {
    const min = minimumPrice.trim() ? Number(minimumPrice) : undefined;
    const max = maximumPrice.trim() ? Number(maximumPrice) : undefined;
    if (
      (min !== undefined && (!Number.isFinite(min) || min < 0)) ||
      (max !== undefined && (!Number.isFinite(max) || max < 0)) ||
      (min !== undefined && max !== undefined && min > max)
    ) {
      return [];
    }
    const result = dishes.filter((dish) => {
      const searchTerm = search.trim().toLocaleLowerCase();
      const matchesSearch =
        dish.name.toLocaleLowerCase().includes(searchTerm) ||
        translateDishName(language, dish.id, dish.name).toLocaleLowerCase().includes(searchTerm);
      const matchesCategory = categoryFilter === 'all' || dish.dishCategoryId === categoryFilter;
      const matchesAvailability =
        availabilityFilter === 'all' ||
        dish.isAvailable === (availabilityFilter === 'available');
      return matchesSearch && matchesCategory && matchesAvailability &&
        (min === undefined || dish.price >= min) && (max === undefined || dish.price <= max);
    });
    if (sort === 'price-asc') result.sort((a, b) => a.price - b.price);
    if (sort === 'price-desc') result.sort((a, b) => b.price - a.price);
    if (sort === 'time-asc') result.sort((a, b) => a.preparationTime - b.preparationTime);
    return result;
  }, [availabilityFilter, categoryFilter, dishes, language, maximumPrice, minimumPrice, search, sort]);

  const minPrice = minimumPrice.trim() === '' ? undefined : Number(minimumPrice);
  const maxPrice = maximumPrice.trim() === '' ? undefined : Number(maximumPrice);
  const invalidPriceInput =
    (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) ||
    (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0));
  const invalidPriceRange = invalidPriceInput ||
    (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice);

  function openCreate() {
    setEditingDish(undefined);
    setValidation('');
    setForm(blankForm(categories[0]?.id ?? ''));
    setFormVisible(true);
  }

  function openEdit(dish: Dish) {
    setSelectedDish(undefined);
    setEditingDish(dish);
    setValidation('');
    setForm({
      name: dish.name,
      price: String(dish.price),
      preparationTime: String(dish.preparationTime),
      description: dish.description,
      dishCategoryId: dish.dishCategoryId,
      isAvailable: dish.isAvailable,
      images: dish.images,
      imageUrl: '',
    });
    setFormVisible(true);
  }

  async function submitDish() {
    const price = Number(form.price);
    const preparationTime = Number(form.preparationTime);
    const trimmedName = form.name.trim();
    if (!trimmedName) return setValidation(t('requiredName'));
    if (!Number.isFinite(price) || price <= 0) return setValidation(t('invalidPrice'));
    if (!Number.isInteger(preparationTime) || preparationTime <= 0) return setValidation(t('invalidTime'));
    if (!categories.some((category) => category.id === form.dishCategoryId)) {
      return setValidation(t('requiredCategory'));
    }
    if (dishes.some((dish) =>
      dish.id !== editingDish?.id &&
      dish.dishCategoryId === form.dishCategoryId &&
      dish.name.toLocaleLowerCase() === trimmedName.toLocaleLowerCase(),
    )) return setValidation(t('duplicateName'));

    const draft: DishDraft = {
      name: trimmedName,
      price,
      preparationTime,
      description: form.description.trim(),
      dishCategoryId: form.dishCategoryId,
      isAvailable: form.isAvailable,
      images: form.images,
    };
    try {
      await saveDish(draft, editingDish);
      await reload();
      setFormVisible(false);
      void sync(connected);
    } catch (error) {
      setValidation(error instanceof Error && error.message === 'DUPLICATE_NAME'
        ? t('duplicateName')
        : t('saveError'));
    }
  }

  function confirmDelete(dish: Dish) {
    Alert.alert(t('deleteTitle'), t('confirmDelete'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('yesDelete'),
        style: 'destructive',
        onPress: () => {
          void deleteDish(dish.id)
            .then(async () => {
              if (selectedDish?.id === dish.id) setSelectedDish(undefined);
              await reload();
              void sync(connected);
            })
            .catch(() => Alert.alert(t('deleteError')));
        },
      },
    ]);
  }

  function addImage() {
    const imageUrl = form.imageUrl.trim();
    if (!imageUrl) return;
    const first = form.images.length === 0;
    setForm((current) => ({
      ...current,
      imageUrl: '',
      images: [...current.images, {
        id: `image-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        imageUrl,
        isThumbnail: first,
      }],
    }));
  }

  function selectCover(imageId: string) {
    setForm((current) => ({
      ...current,
      images: current.images.map((image) => ({
        ...image,
        isThumbnail: image.id === imageId,
      })),
    }));
  }

  function removeImage(imageId: string) {
    setForm((current) => {
      const images = current.images.filter((image) => image.id !== imageId);
      if (images.length > 0 && !images.some((image) => image.isThumbnail)) {
        images[0] = { ...images[0], isThumbnail: true };
      }
      return { ...current, images };
    });
  }

  function dishCategoryName(dish: Dish) {
    const category = categories.find((item) => item.id === dish.dishCategoryId);
    if (!category) return '';
    const categoryKey: Record<string, MessageKey> = {
      'cat-seafood': 'categorySeafood',
      'cat-main': 'categoryMain',
      'cat-dessert': 'categoryDessert',
    };
    return categoryKey[category.id] ? t(categoryKey[category.id]) : category.name;
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.brandMark}><Text style={styles.brandEmoji}>🍲</Text></View>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('title')}</Text>
            <Text style={styles.subtitle}>{t('subtitle')}</Text>
          </View>
          <View style={styles.languageSwitch}>
            <Pill label="EN" active={language === 'en'} onPress={() => setLanguage('en')} />
            <Pill label="VI" active={language === 'vi'} onPress={() => setLanguage('vi')} />
          </View>
        </View>

        <View style={[styles.connectionBanner, connected && isMockApiConfigured ? styles.onlineBanner : styles.offlineBanner]}>
          <View style={[styles.connectionDot, connected && isMockApiConfigured && styles.onlineDot]} />
          <Text style={styles.connectionText}>
            {!isMockApiConfigured ? (language === 'en' ? 'Local mode · configure MockAPI URL' : 'Chế độ cục bộ · cấu hình URL MockAPI')
              : connected ? t('online') : t('offline')}
          </Text>
          {dishes.some((dish) => dish.syncStatus === 'pending') &&
            <Text style={styles.pendingText}>{t('pending')}</Text>}
        </View>

        <View style={styles.toolbar}>
          <View>
            <Text style={styles.sectionEyebrow}>{language === 'en' ? 'MENU' : 'THỰC ĐƠN'}</Text>
            <Text style={styles.sectionTitle}>{t('title')}</Text>
            <Text style={styles.countText}>{filteredDishes.length} {t('results')}</Text>
          </View>
          <Pressable style={styles.primaryButton} onPress={openCreate}>
            <Text style={styles.primaryButtonText}>＋ {t('addDish')}</Text>
          </Pressable>
        </View>

        <View style={styles.filtersCard}>
          <Field label="" value={search} onChangeText={setSearch} placeholder={`⌕  ${t('search')}`} />
          <Text style={styles.filterLabel}>{t('category')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Pill label={t('allCategories')} active={categoryFilter === 'all'} onPress={() => setCategoryFilter('all')} />
            {categories.map((category) => (
              <Pill
                key={category.id}
                label={category.id.startsWith('cat-') ? (
                  category.id === 'cat-seafood' ? t('categorySeafood') :
                    category.id === 'cat-main' ? t('categoryMain') : t('categoryDessert')
                ) : category.name}
                active={categoryFilter === category.id}
                onPress={() => setCategoryFilter(category.id)}
              />
            ))}
          </ScrollView>
          <Text style={styles.filterLabel}>{t('allStatuses')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Pill label={t('allStatuses')} active={availabilityFilter === 'all'} onPress={() => setAvailabilityFilter('all')} />
            <Pill label={t('available')} active={availabilityFilter === 'available'} onPress={() => setAvailabilityFilter('available')} />
            <Pill label={t('unavailable')} active={availabilityFilter === 'unavailable'} onPress={() => setAvailabilityFilter('unavailable')} />
          </ScrollView>
          <View style={styles.priceRow}>
            <View style={styles.priceInput}><Field label="" value={minimumPrice} onChangeText={setMinimumPrice} placeholder={t('priceMin')} keyboardType="decimal-pad" /></View>
            <View style={styles.priceDash}><Text style={styles.mutedText}>—</Text></View>
            <View style={styles.priceInput}><Field label="" value={maximumPrice} onChangeText={setMaximumPrice} placeholder={t('priceMax')} keyboardType="decimal-pad" /></View>
          </View>
          {invalidPriceRange && <Text style={styles.errorText}>
            {invalidPriceInput ? t('invalidPriceFilter') : t('invalidRange')}
          </Text>}
          <Text style={styles.filterLabel}>{t('sort')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {([
              ['default', t('defaultSort')],
              ['price-asc', t('priceLow')],
              ['price-desc', t('priceHigh')],
              ['time-asc', t('quickest')],
            ] as const).map(([value, label]) => (
              <Pill key={value} label={label} active={sort === value} onPress={() => setSort(value)} />
            ))}
          </ScrollView>
        </View>

        {loading ? <Text style={styles.emptyText}>...</Text> : invalidPriceRange || filteredDishes.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyText}>{t('empty')}</Text>
          </View>
        ) : (
          <View style={styles.dishList}>
            {filteredDishes.map((dish) => {
              const cover = dish.images.find((image) => image.isThumbnail) ?? dish.images[0];
              return (
                <Pressable key={dish.id} style={styles.dishCard} onPress={() => setSelectedDish(dish)}>
                  {cover ? (
                    <Image source={{ uri: cover.imageUrl }} style={styles.dishImage} />
                  ) : (
                    <View style={styles.imagePlaceholder}><Text style={styles.placeholderEmoji}>🍜</Text></View>
                  )}
                  <View style={styles.dishInfo}>
                    <View style={styles.dishTopLine}>
                      <Text style={styles.dishName} numberOfLines={1}>{translateDishName(language, dish.id, dish.name)}</Text>
                      <Text style={styles.priceText}>{formatVnd(dish.price, language)}</Text>
                    </View>
                    <Text style={styles.categoryText}>{dishCategoryName(dish)}</Text>
                    <View style={styles.metadataRow}>
                      <Text style={styles.metadataText}>◷ {dish.preparationTime} min</Text>
                      <Text style={[styles.badge, dish.preparationTime <= 15 ? styles.quickBadge : styles.regularBadge]}>
                        {dish.preparationTime <= 15 ? t('quick') : t('regular')}
                      </Text>
                    </View>
                    <View style={styles.cardFooter}>
                      <Text style={[styles.statusText, dish.isAvailable ? styles.availableText : styles.unavailableText]}>
                        ● {dish.isAvailable ? t('available') : t('unavailable')}
                      </Text>
                      {dish.syncStatus === 'pending' && <Text style={styles.pendingSmall}>• {t('pending')}</Text>}
                    </View>
                    <View style={styles.actionsRow}>
                      <Pressable style={styles.secondaryButton} onPress={() => openEdit(dish)}>
                        <Text style={styles.secondaryButtonText}>{t('edit')}</Text>
                      </Pressable>
                      <Pressable style={styles.deleteButton} onPress={() => confirmDelete(dish)}>
                        <Text style={styles.deleteButtonText}>{t('delete')}</Text>
                      </Pressable>
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {syncMessage !== '' && <Text style={styles.syncMessage}>{syncMessage}</Text>}
        <Text style={styles.footerText}>BCS240007 · Food Manager</Text>
      </ScrollView>

      <Modal visible={formVisible} animationType="slide" onRequestClose={() => setFormVisible(false)}>
        <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.modalContent} keyboardShouldPersistTaps="handled">
            <View style={styles.modalHeader}>
              <View><Text style={styles.sectionEyebrow}>{editingDish ? t('edit') : t('addDish')}</Text>
                <Text style={styles.modalTitle}>{editingDish ? t('editDish') : t('newDish')}</Text></View>
              <Pressable onPress={() => setFormVisible(false)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
            </View>
            <Field label={t('name')} value={form.name} onChangeText={(name) => setForm({ ...form, name })} />
            <View style={styles.priceRow}>
              <View style={styles.priceInput}><Field label={t('price')} value={form.price} onChangeText={(price) => setForm({ ...form, price })} keyboardType="decimal-pad" placeholder="0.00" /></View>
              <View style={styles.priceInput}><Field label={t('preparationTime')} value={form.preparationTime} onChangeText={(preparationTime) => setForm({ ...form, preparationTime })} keyboardType="numeric" placeholder="15" /></View>
            </View>
            <Text style={styles.filterLabel}>{t('category')}</Text>
            <View style={styles.wrapRow}>
              {categories.map((category) => (
                <Pill key={category.id} label={
                  category.id === 'cat-seafood' ? t('categorySeafood') :
                    category.id === 'cat-main' ? t('categoryMain') :
                      category.id === 'cat-dessert' ? t('categoryDessert') : category.name
                } active={form.dishCategoryId === category.id} onPress={() => setForm({ ...form, dishCategoryId: category.id })} />
              ))}
            </View>
            <Field label={t('description')} value={form.description} onChangeText={(description) => setForm({ ...form, description })} multiline />
            <View style={styles.switchRow}>
              <Text style={styles.fieldLabel}>{t('available')}</Text>
              <Switch value={form.isAvailable} onValueChange={(isAvailable) => setForm({ ...form, isAvailable })} trackColor={{ true: '#d85d3f' }} />
            </View>
            <Text style={styles.filterLabel}>{t('images')}</Text>
            <Text style={styles.helperText}>{t('imageHint')}</Text>
            <View style={styles.addImageRow}>
              <View style={styles.addImageInput}><TextInput style={styles.input} value={form.imageUrl} onChangeText={(imageUrl) => setForm({ ...form, imageUrl })} placeholder="https://..." placeholderTextColor="#969c9d" autoCapitalize="none" /></View>
              <Pressable style={styles.smallPrimaryButton} onPress={addImage}><Text style={styles.primaryButtonText}>＋</Text></Pressable>
            </View>
            {form.images.length === 0 ? <Text style={styles.helperText}>{t('noImages')}</Text> : (
              <View style={styles.imageList}>
                {form.images.map((image) => (
                  <View key={image.id} style={styles.imageItem}>
                    <Image source={{ uri: image.imageUrl }} style={styles.imageThumb} />
                    <View style={styles.imageItemText}>
                      <Text numberOfLines={1} style={styles.imageUrl}>{image.imageUrl}</Text>
                      <Pressable onPress={() => selectCover(image.id)}>
                        <Text style={image.isThumbnail ? styles.coverLabel : styles.linkText}>
                          {image.isThumbnail ? `✓ ${t('thumbnail')}` : t('setCover')}
                        </Text>
                      </Pressable>
                    </View>
                    <Pressable onPress={() => removeImage(image.id)}>
                      <Text style={styles.removeImage}>×</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            )}
            {validation !== '' && <Text style={styles.errorText}>{validation}</Text>}
            <View style={styles.formButtons}>
              <Pressable style={styles.cancelButton} onPress={() => setFormVisible(false)}><Text style={styles.cancelText}>{t('cancel')}</Text></Pressable>
              <Pressable style={styles.primaryButton} onPress={() => void submitDish()}><Text style={styles.primaryButtonText}>{t('save')}</Text></Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={Boolean(selectedDish)} animationType="slide" onRequestClose={() => setSelectedDish(undefined)}>
        <ScrollView style={styles.modalScreen} contentContainerStyle={styles.modalContent}>
          <View style={styles.modalHeader}>
            <View><Text style={styles.sectionEyebrow}>{t('details')}</Text><Text style={styles.modalTitle}>{selectedDish ? translateDishName(language, selectedDish.id, selectedDish.name) : ''}</Text></View>
            <Pressable onPress={() => setSelectedDish(undefined)} style={styles.closeButton}><Text style={styles.closeText}>×</Text></Pressable>
          </View>
          {selectedDish && (
            <>
              {selectedDish.images.length ? (
                <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
                  {selectedDish.images.map((image) => <Image key={image.id} source={{ uri: image.imageUrl }} style={styles.detailImage} />)}
                </ScrollView>
              ) : <View style={styles.detailPlaceholder}><Text style={styles.placeholderEmoji}>🍲</Text><Text style={styles.helperText}>{t('emptyImages')}</Text></View>}
              <Text style={styles.detailPrice}>{formatVnd(selectedDish.price, language)}</Text>
              <Text style={styles.categoryText}>{dishCategoryName(selectedDish)}</Text>
              <Text style={styles.detailMeta}>{selectedDish.preparationTime <= 15 ? t('quick') : t('regular')} · {selectedDish.preparationTime} min · {selectedDish.isAvailable ? t('available') : t('unavailable')}</Text>
              <Text style={styles.detailDescription}>{selectedDish.description || '—'}</Text>
              <View style={styles.formButtons}>
                <Pressable style={styles.cancelButton} onPress={() => confirmDelete(selectedDish)}><Text style={styles.deleteButtonText}>{t('delete')}</Text></Pressable>
                <Pressable style={styles.primaryButton} onPress={() => openEdit(selectedDish)}><Text style={styles.primaryButtonText}>{t('edit')}</Text></Pressable>
              </View>
            </>
          )}
        </ScrollView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f7f7f4' },
  page: { paddingHorizontal: 20, paddingTop: 58, paddingBottom: 32, maxWidth: 760, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 20 },
  brandMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#ffebe3', alignItems: 'center', justifyContent: 'center' },
  brandEmoji: { fontSize: 25 },
  headerText: { marginLeft: 12, flex: 1 },
  title: { fontSize: 20, fontWeight: '800', color: '#202a29' },
  subtitle: { marginTop: 3, color: '#7f8986', fontSize: 12 },
  languageSwitch: { flexDirection: 'row', gap: 4 },
  connectionBanner: { minHeight: 38, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  onlineBanner: { backgroundColor: '#eaf5ed' },
  offlineBanner: { backgroundColor: '#fff3e5' },
  connectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#d78a35', marginRight: 8 },
  onlineDot: { backgroundColor: '#39a56b' },
  connectionText: { flex: 1, fontSize: 11, color: '#596662', fontWeight: '600' },
  pendingText: { color: '#a86522', fontSize: 10, fontWeight: '700' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sectionEyebrow: { color: '#d15a3b', fontWeight: '800', fontSize: 10, letterSpacing: 1.2 },
  sectionTitle: { color: '#26302f', fontWeight: '800', fontSize: 23, marginTop: 3 },
  countText: { color: '#89918e', fontSize: 12, marginTop: 3 },
  primaryButton: { backgroundColor: '#d85d3f', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: 'white', fontSize: 13, fontWeight: '800' },
  filtersCard: { backgroundColor: 'white', borderRadius: 18, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#eeeeea' },
  field: { marginBottom: 13 },
  fieldLabel: { color: '#4d5955', fontWeight: '700', fontSize: 12, marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderColor: '#e8e9e4', borderRadius: 11, paddingHorizontal: 12, paddingVertical: 10, color: '#27312f', backgroundColor: '#fff', fontSize: 13 },
  multilineInput: { minHeight: 82, textAlignVertical: 'top' },
  filterLabel: { color: '#55615d', fontSize: 12, fontWeight: '700', marginTop: 5, marginBottom: 8 },
  chipRow: { gap: 7, paddingBottom: 8 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 10 },
  pill: { paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#f2f3f0', borderRadius: 20, borderWidth: 1, borderColor: '#f2f3f0' },
  pillActive: { backgroundColor: '#ffede7', borderColor: '#f5c4b5' },
  pillText: { color: '#69736f', fontSize: 11, fontWeight: '600' },
  pillTextActive: { color: '#c34f32', fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceInput: { flex: 1 },
  priceDash: { paddingBottom: 13 },
  mutedText: { color: '#a0a8a4' },
  dishList: { gap: 12 },
  dishCard: { backgroundColor: 'white', borderRadius: 18, padding: 11, borderWidth: 1, borderColor: '#ededeb', flexDirection: 'row', gap: 12 },
  dishImage: { width: 100, height: 126, borderRadius: 13, backgroundColor: '#f0eee9' },
  imagePlaceholder: { width: 100, height: 126, borderRadius: 13, backgroundColor: '#f8eee6', alignItems: 'center', justifyContent: 'center' },
  placeholderEmoji: { fontSize: 32 },
  dishInfo: { flex: 1, paddingVertical: 2 },
  dishTopLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 5 },
  dishName: { fontSize: 15, color: '#252e2c', fontWeight: '800', flex: 1 },
  priceText: { color: '#d45639', fontWeight: '800', fontSize: 14 },
  categoryText: { color: '#929a96', fontSize: 11, marginTop: 3 },
  metadataRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 9 },
  metadataText: { color: '#596561', fontSize: 11 },
  badge: { fontSize: 9, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7, fontWeight: '700' },
  quickBadge: { color: '#238458', backgroundColor: '#e7f5ec' },
  regularBadge: { color: '#97722a', backgroundColor: '#faf2df' },
  cardFooter: { flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 7 },
  statusText: { fontSize: 10, fontWeight: '700' },
  availableText: { color: '#31895b' },
  unavailableText: { color: '#979d99' },
  pendingSmall: { color: '#b77a33', fontSize: 9 },
  actionsRow: { flexDirection: 'row', gap: 7, marginTop: 'auto', paddingTop: 9 },
  secondaryButton: { borderRadius: 8, backgroundColor: '#f4f4f1', paddingHorizontal: 12, paddingVertical: 7 },
  secondaryButtonText: { color: '#4e5b57', fontSize: 10, fontWeight: '700' },
  deleteButton: { borderRadius: 8, backgroundColor: '#fff1ec', paddingHorizontal: 12, paddingVertical: 7 },
  deleteButtonText: { color: '#ca5739', fontSize: 10, fontWeight: '700' },
  emptyCard: { backgroundColor: 'white', borderRadius: 18, padding: 32, alignItems: 'center' },
  emptyIcon: { fontSize: 32, marginBottom: 10 },
  emptyText: { color: '#7f8985', textAlign: 'center', padding: 20, fontSize: 13 },
  syncMessage: { textAlign: 'center', color: '#74827c', fontSize: 11, paddingTop: 14 },
  footerText: { textAlign: 'center', color: '#a4aaa7', fontSize: 10, marginTop: 24, letterSpacing: 1 },
  modalScreen: { flex: 1, backgroundColor: '#fafaf7' },
  modalContent: { paddingHorizontal: 20, paddingTop: 50, paddingBottom: 40, maxWidth: 700, width: '100%', alignSelf: 'center' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  modalTitle: { fontSize: 23, color: '#25302d', fontWeight: '800', marginTop: 4 },
  closeButton: { backgroundColor: '#efefeb', width: 38, height: 38, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  closeText: { fontSize: 25, color: '#59635f', lineHeight: 28 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 6 },
  helperText: { color: '#979f9b', fontSize: 11, marginBottom: 9 },
  addImageRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  addImageInput: { flex: 1 },
  smallPrimaryButton: { height: 44, width: 46, backgroundColor: '#d85d3f', borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  imageList: { gap: 8, marginTop: 4 },
  imageItem: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'white', borderRadius: 12, padding: 8 },
  imageThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#eee' },
  imageItemText: { flex: 1 },
  imageUrl: { color: '#56615d', fontSize: 10, marginBottom: 4 },
  coverLabel: { color: '#31895b', fontSize: 10, fontWeight: '800' },
  linkText: { color: '#c65336', fontSize: 10, fontWeight: '700' },
  removeImage: { color: '#bc4e37', fontSize: 23, paddingHorizontal: 6 },
  errorText: { color: '#c34231', fontSize: 12, marginTop: 5, marginBottom: 8 },
  formButtons: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 22 },
  cancelButton: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, backgroundColor: '#eeefeb' },
  cancelText: { color: '#69736f', fontSize: 13, fontWeight: '700' },
  detailImage: { width: 320, height: 245, borderRadius: 18, marginRight: 10, backgroundColor: '#f0eee9' },
  detailPlaceholder: { height: 180, backgroundColor: '#f5eee8', borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  detailPrice: { marginTop: 20, color: '#d45639', fontSize: 25, fontWeight: '800' },
  detailMeta: { color: '#65716c', fontSize: 12, marginTop: 12 },
  detailDescription: { color: '#4e5a56', lineHeight: 22, marginTop: 16, fontSize: 14 },
});

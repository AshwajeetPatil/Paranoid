import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Image,
  TextInput,
  Modal,
  ScrollView,
  Alert,
} from 'react-native';
import {
  VaultItem,
  CategorySummary,
  fetchAllVaultItems,
  calculateCategoryTotals,
  updateItemNameAndPin,
  deleteVaultItem,
  exportPortableBackup,
  importPortableBackup,
  PHOTOS_DIR,
} from '../db/database';

interface Props {
  onBackToCamera: () => void;
}

export default function VaultDashboardScreen({ onBackToCamera }: Props) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'needs_review' | 'receipt' | 'document'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [activeItem, setActiveItem] = useState<VaultItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editPinned, setEditPinned] = useState(false);

  const loadVault = async () => {
    const data = await fetchAllVaultItems();
    setItems(data);
    setCategories(calculateCategoryTotals(data));
  };

  useEffect(() => {
    loadVault();
  }, []);

  const totalSpend = items
    .filter((i) => i.item_type === 'receipt')
    .reduce((sum, i) => sum + i.total_amount, 0);

  const needsReviewCount = items.filter((i) => i.status === 'needs_review').length;

  const filteredItems = items.filter((item) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = (item.name || '').toLowerCase().includes(q);
      const matchCat = item.category.toLowerCase().includes(q);
      if (!matchName && !matchCat) return false;
    }
    if (selectedCategory) {
      if (item.splits_json) {
        return item.splits_json.includes(`"${selectedCategory}"`);
      }
      return item.category === selectedCategory;
    }
    if (filter === 'needs_review') return item.status === 'needs_review';
    if (filter === 'receipt') return item.item_type === 'receipt';
    if (filter === 'document') return item.item_type === 'document';
    return true;
  });

  const openItemDetail = (item: VaultItem) => {
    setActiveItem(item);
    setEditName(item.name || '');
    setEditPinned(item.is_pinned === 1);
  };

  const handleSaveChanges = async () => {
    if (!activeItem) return;
    await updateItemNameAndPin(activeItem.id, editName, editPinned);
    setActiveItem(null);
    loadVault();
  };

  const handleBackup = async () => {
    try {
      await exportPortableBackup();
    } catch {
      Alert.alert('Backup Error', 'Could not create backup file.');
    }
  };

  const handleRestore = async () => {
    try {
      const count = await importPortableBackup();
      if (count > 0) {
        await loadVault();
        Alert.alert('Restore Complete ✓', `Restored ${count} items to your Paranoid Vault.`);
      }
    } catch {
      Alert.alert('Restore Failed', 'Make sure you selected a valid Paranoid_Backup.json file.');
    }
  };

  return (
    <View style={styles.fill}>
      {/* Top Header with Backup & Restore */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBackToCamera} style={styles.backBtn}>
          <Text style={styles.backText}>← Camera</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🔓 Paranoid Vault</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={styles.utilBtn} onPress={handleBackup}>
            <Text style={styles.utilBtnText}>⬆ Backup</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.utilBtn} onPress={handleRestore}>
            <Text style={styles.utilBtnText}>⬇ Restore</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Monthly Spend & Category Breakdown */}
      <View style={styles.spendCard}>
        <Text style={styles.spendLabel}>Total Monthly Spend</Text>
        <Text style={styles.spendAmount}>₹{totalSpend.toLocaleString('en-IN')}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
          {categories.map((cat) => (
            <TouchableOpacity
              key={cat.category}
              style={[
                styles.catChip,
                selectedCategory === cat.category && styles.catChipSelected,
              ]}
              onPress={() =>
                setSelectedCategory(selectedCategory === cat.category ? null : cat.category)
              }
            >
              <Text style={styles.catChipName}>{cat.category}: </Text>
              <Text style={styles.catChipVal}>₹{cat.total}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Search Bar */}
      <View style={{ paddingHorizontal: 14, marginTop: 10 }}>
        <TextInput
          style={styles.searchBar}
          placeholder="🔍 Search receipts, documents, or categories..."
          placeholderTextColor="#71717a"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        {(['all', 'needs_review', 'receipt', 'document'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabBtn, filter === tab && styles.tabBtnActive]}
            onPress={() => {
              setSelectedCategory(null);
              setFilter(tab);
            }}
          >
            <Text style={[styles.tabText, filter === tab && styles.tabTextActive]}>
              {tab === 'needs_review' ? `⚠️ Review (${needsReviewCount})` : tab.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Vault Items List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 14 }}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No items found in this view.</Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => openItemDetail(item)}>
            {item.photos.length > 0 ? (
              <View>
                <Image
                  source={{ uri: `${PHOTOS_DIR}${item.photos[0]}` }}
                  style={styles.thumb}
                />
                {item.photos.length > 1 && (
                  <Text style={styles.pageCountBadge}>{item.photos.length}p</Text>
                )}
              </View>
            ) : (
              <View style={[styles.thumb, styles.upiThumb]}>
                <Text style={styles.upiBadgeText}>UPI</Text>
              </View>
            )}

            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text
                style={[
                  styles.itemName,
                  !item.name && { color: '#f59e0b', fontStyle: 'italic' },
                ]}
              >
                {item.name || 'Unnamed (Tap to Name)'} {item.is_pinned === 1 ? '📌' : ''}
              </Text>
              <Text style={styles.itemMeta}>
                {item.category} • {new Date(item.created_at).toLocaleDateString()}
                {item.splits_json ? ' • ⚡Split Bill' : ''}
              </Text>
            </View>

            {item.item_type === 'receipt' && (
              <Text style={styles.price}>₹{item.total_amount}</Text>
            )}
          </TouchableOpacity>
        )}
      />

      {/* Item Detail / Rename / Multi-Page Viewer Modal */}
      <Modal visible={!!activeItem} transparent animationType="slide">
        <View style={styles.modalBg}>
          <View style={styles.modalBox}>
            <Text style={styles.modalHeader}>Inspect & Edit Item</Text>

            {activeItem && activeItem.photos.length > 0 && (
              <ScrollView horizontal pagingEnabled style={{ height: 260, marginVertical: 10 }}>
                {activeItem.photos.map((file, idx) => (
                  <View key={file} style={{ width: 280, marginRight: 10 }}>
                    <Image
                      source={{ uri: `${PHOTOS_DIR}${file}` }}
                      style={{ width: '100%', height: 235, borderRadius: 10 }}
                      resizeMode="contain"
                    />
                    <Text style={{ color: '#a1a1aa', textAlign: 'center', fontSize: 12, marginTop: 4 }}>
                      Page {idx + 1} of {activeItem.photos.length} (Swipe for more)
                    </Text>
                  </View>
                ))}
              </ScrollView>
            )}

            <TextInput
              style={styles.input}
              placeholder="Enter Receipt or Document Name"
              placeholderTextColor="#71717a"
              value={editName}
              onChangeText={setEditName}
            />

            <TouchableOpacity
              style={[styles.pinToggle, editPinned && styles.pinToggleActive]}
              onPress={() => setEditPinned(!editPinned)}
            >
              <Text style={styles.pinToggleText}>
                {editPinned
                  ? '📌 Pinned Forever (Immune to Startup Janitor)'
                  : 'Tap to Pin Forever (Warranty / Important)'}
              </Text>
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity
                style={styles.deleteBtn}
                onPress={async () => {
                  if (!activeItem) return;
                  await deleteVaultItem(activeItem.id, activeItem.photos);
                  setActiveItem(null);
                  loadVault();
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '800' }}>Trash</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.saveModalBtn} onPress={handleSaveChanges}>
                <Text style={{ color: '#000', fontWeight: '900' }}>Save Changes</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={() => setActiveItem(null)}
              style={{ alignItems: 'center', paddingTop: 10 }}
            >
              <Text style={{ color: '#a1a1aa' }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#09090b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  backBtn: { paddingVertical: 6 },
  backText: { color: '#10b981', fontWeight: '800', fontSize: 15 },
  title: { color: '#fff', fontSize: 17, fontWeight: '800' },
  utilBtn: { backgroundColor: '#18181b', paddingVertical: 6, paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: '#27272a' },
  utilBtnText: { color: '#d4d4d8', fontSize: 11, fontWeight: '700' },
  spendCard: { backgroundColor: '#18181b', marginHorizontal: 14, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#27272a' },
  spendLabel: { color: '#a1a1aa', fontSize: 12 },
  spendAmount: { color: '#10b981', fontSize: 30, fontWeight: '900', marginTop: 2 },
  catChip: { flexDirection: 'row', backgroundColor: '#27272a', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, marginRight: 8 },
  catChipSelected: { borderColor: '#10b981', borderWidth: 1, backgroundColor: '#064e3b' },
  catChipName: { color: '#d4d4d8', fontSize: 12 },
  catChipVal: { color: '#fff', fontSize: 12, fontWeight: '800' },
  searchBar: { backgroundColor: '#18181b', color: '#fff', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: '#27272a', fontSize: 13 },
  tabsRow: { flexDirection: 'row', paddingHorizontal: 14, marginTop: 10, gap: 6 },
  tabBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a' },
  tabBtnActive: { borderColor: '#10b981', backgroundColor: '#064e3b' },
  tabText: { color: '#a1a1aa', fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  emptyText: { color: '#71717a', textAlign: 'center', marginTop: 32, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#18181b', padding: 12, borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: '#27272a' },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#27272a' },
  upiThumb: { justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#10b981' },
  upiBadgeText: { color: '#10b981', fontWeight: '900', fontSize: 11 },
  pageCountBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: '#000', color: '#fff', fontSize: 10, paddingHorizontal: 4, borderRadius: 4 },
  itemName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  itemMeta: { color: '#71717a', fontSize: 12, marginTop: 2 },
  price: { color: '#fff', fontSize: 16, fontWeight: '900', marginLeft: 8 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 18 },
  modalBox: { backgroundColor: '#18181b', borderRadius: 16, padding: 16, gap: 10 },
  modalHeader: { color: '#fff', fontSize: 17, fontWeight: '800' },
  input: { backgroundColor: '#09090b', color: '#fff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#27272a' },
  pinToggle: { padding: 12, borderRadius: 10, backgroundColor: '#27272a', alignItems: 'center' },
  pinToggleActive: { backgroundColor: '#451a03', borderWidth: 1, borderColor: '#f59e0b' },
  pinToggleText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  deleteBtn: { backgroundColor: '#ef4444', padding: 12, borderRadius: 10, flex: 0.4, alignItems: 'center' },
  saveModalBtn: { backgroundColor: '#10b981', padding: 12, borderRadius: 10, flex: 1, alignItems: 'center' },
});

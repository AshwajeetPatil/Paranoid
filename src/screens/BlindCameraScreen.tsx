import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  Image,
  ScrollView,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { insertVaultItem, PHOTOS_DIR, ItemType, SplitEntry } from '../db/database';

const CATEGORIES = ['Groceries', 'Vegetables', 'Food/Tea', 'Fuel', 'Toiletries', 'Clothes', 'Medical', 'Bills'];
const QUICK_NAMES = ['DMart', 'Vegetables', 'Petrol', 'Tea/Snacks', 'Medical', 'Kirana', 'Electricity Bill'];

/**
 * Evaluates inline addition like "85+120+95" -> 300
 */
function evaluateMathInput(expr: string): number {
  if (!expr) return 0;
  const parts = expr.split('+').map((p) => parseFloat(p.trim()));
  return parts.reduce((sum, val) => sum + (isNaN(val) ? 0 : val), 0);
}

interface Props {
  onOpenVault: () => void;
}

export default function BlindCameraScreen({ onOpenVault }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [mode, setMode] = useState<ItemType>('receipt');
  const [pages, setPages] = useState<string[]>([]);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [mainCategory, setMainCategory] = useState('Groceries');
  const [isPinned, setIsPinned] = useState(false);

  // DMart Multi-Category Split State
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splits, setSplits] = useState<{ category: string; expr: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const totalAmount = evaluateMathInput(amountInput);
  const splitAllocated = splits.reduce((acc, s) => acc + evaluateMathInput(s.expr), 0);
  const mainCategoryRemainder = Math.max(0, totalAmount - splitAllocated);

  const handleSnapPhoto = async () => {
    if (!cameraRef.current || loading) return;
    try {
      setLoading(true);
      const raw = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (raw?.uri) {
        const compressed = await ImageManipulator.manipulateAsync(
          raw.uri,
          [{ resize: { width: 1500 } }],
          { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
        );
        setPages((prev) => [...prev, compressed.uri]);
        // Show instant quality check preview
        setPreviewUri(compressed.uri);
      }
    } catch {
      Alert.alert('Camera Error', 'Could not capture photo.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePage = (uriToDelete: string) => {
    setPages((prev) => prev.filter((u) => u !== uriToDelete));
    if (previewUri === uriToDelete) {
      setPreviewUri(null);
    }
  };

  const handleSaveEntry = async () => {
    if (mode === 'document' && pages.length === 0) {
      Alert.alert('Photo Required', 'Snap at least 1 page for a document.');
      return;
    }
    if (mode === 'receipt' && pages.length === 0 && totalAmount <= 0) {
      Alert.alert('Empty Entry', 'Snap a receipt photo OR enter a UPI amount.');
      return;
    }
    if (mode === 'receipt' && splitAllocated > totalAmount) {
      Alert.alert(
        'Split Exceeds Total',
        `Your split categories (₹${splitAllocated}) exceed the bill total (₹${totalAmount}).`
      );
      return;
    }

    setLoading(true);
    try {
      const savedFileNames: string[] = [];
      for (let i = 0; i < pages.length; i++) {
        const fileName = `${Date.now()}_p${i + 1}_${Math.random().toString(36).slice(2, 6)}.jpg`;
        await FileSystem.moveAsync({
          from: pages[i],
          to: `${PHOTOS_DIR}${fileName}`,
        });
        savedFileNames.push(fileName);
      }

      const parsedSplits: SplitEntry[] = splits
        .map((s) => ({ category: s.category, amount: evaluateMathInput(s.expr) }))
        .filter((s) => s.amount > 0);

      await insertVaultItem({
        itemType: mode,
        name: name.trim() || undefined,
        totalAmount: mode === 'receipt' ? totalAmount : 0,
        mainCategory,
        splits: parsedSplits,
        isPinned,
        photoFileNames: savedFileNames,
      });

      // Reset inputs for next fast capture
      setPages([]);
      setPreviewUri(null);
      setName('');
      setAmountInput('');
      setSplits([]);
      setIsPinned(false);

      Alert.alert(
        'Saved to Paranoid ✓',
        name.trim()
          ? 'Entry saved to your private vault.'
          : 'Saved in Hurry Mode! Added to your "Needs Review" queue to name later.'
      );
    } catch {
      Alert.alert('Save Error', 'Failed to save entry.');
    } finally {
      setLoading(false);
    }
  };

  if (!permission) return <View style={styles.dark} />;
  if (!permission.granted) {
    return (
      <View style={[styles.dark, styles.center]}>
        <Text style={styles.permTitle}>Paranoid Blind Camera</Text>
        <Text style={styles.permSub}>
          Grant camera access to snap receipts and multi-page documents immediately on launch.
        </Text>
        <TouchableOpacity style={styles.greenBtn} onPress={requestPermission}>
          <Text style={styles.greenBtnText}>Allow Camera Access</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.dark}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top Bar */}
      <View style={styles.topBar}>
        <View style={styles.modeSwitch}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'receipt' && styles.modeBtnActive]}
            onPress={() => setMode('receipt')}
          >
            <Text style={[styles.modeText, mode === 'receipt' && styles.modeTextActive]}>
              Receipt / UPI
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'document' && styles.modeBtnActive]}
            onPress={() => setMode('document')}
          >
            <Text style={[styles.modeText, mode === 'document' && styles.modeTextActive]}>
              Document
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.vaultBtn} onPress={onOpenVault}>
          <Text style={styles.vaultBtnText}>🔒 Vault</Text>
        </TouchableOpacity>
      </View>

      {/* Camera Viewfinder or Instant Blur-Check Preview */}
      <View style={styles.cameraContainer}>
        {previewUri ? (
          <View style={styles.fill}>
            <Image source={{ uri: previewUri }} style={styles.fill} resizeMode="contain" />
            <View style={styles.previewBanner}>
              <Text style={styles.previewBannerText}>Inspect clarity — Is it readable?</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={styles.retakeBtn}
                  onPress={() => handleDeletePage(previewUri)}
                >
                  <Text style={styles.retakeText}>✕ Delete & Retake</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.keepBtn}
                  onPress={() => setPreviewUri(null)}
                >
                  <Text style={styles.keepText}>✓ Keep (+Next Page)</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.fill}>
            <CameraView style={styles.fill} ref={cameraRef} />
            <TouchableOpacity
              style={styles.shutterOuter}
              onPress={handleSnapPhoto}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#000" /> : <View style={styles.shutterInner} />}
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Multi-Page Thumbnail Strip */}
      {pages.length > 0 && (
        <View style={styles.pageStrip}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {pages.map((uri, idx) => (
              <TouchableOpacity
                key={uri}
                style={[styles.pageThumbWrap, previewUri === uri && styles.pageThumbActive]}
                onPress={() => setPreviewUri(uri)}
              >
                <Image source={{ uri }} style={styles.pageThumb} />
                <Text style={styles.pageBadge}>P{idx + 1}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Fast Entry Controls */}
      <View style={styles.bottomSheet}>
        {/* Quick Name / Tag Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {QUICK_NAMES.map((q) => (
            <TouchableOpacity
              key={q}
              style={[styles.chip, name === q && styles.chipSelected]}
              onPress={() => {
                setName(q);
                if (q === 'DMart' || q === 'Kirana') setMainCategory('Groceries');
                if (q === 'Vegetables') setMainCategory('Vegetables');
                if (q === 'Petrol') setMainCategory('Fuel');
                if (q === 'Tea/Snacks') setMainCategory('Food/Tea');
                if (q === 'Medical') setMainCategory('Medical');
                if (q === 'Electricity Bill') setMainCategory('Bills');
              }}
            >
              <Text style={styles.chipText}>{q}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Amount + Name + Pin Row */}
        <View style={styles.inputRow}>
          {mode === 'receipt' && (
            <View style={{ flex: 1.05, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="₹ (e.g. 150+40)"
                placeholderTextColor="#71717a"
                keyboardType="decimal-pad"
                returnKeyType='done'
                value={amountInput}
                onChangeText={setAmountInput}
              />
              <TouchableOpacity
                style={styles.plusBtn}
                onPress={() => setAmountInput((prev) => (prev ? `${prev}+` : ''))}
              >
                <Text style={styles.plusBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          )}

          <TextInput
            style={[styles.input, { flex: 1.3 }]}
            placeholder="Name (or skip in hurry)"
            placeholderTextColor="#71717a"
            value={name}
            onChangeText={setName}
          />

          <TouchableOpacity
            style={[styles.pinBtn, isPinned && styles.pinBtnActive]}
            onPress={() => setIsPinned(!isPinned)}
          >
            <Text style={styles.pinBtnText}>{isPinned ? '📌' : 'Pin'}</Text>
          </TouchableOpacity>
        </View>

        {/* Category & DMart Split Row */}
        {mode === 'receipt' && (
          <View style={styles.splitSummaryRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.catPill, mainCategory === cat && styles.catPillActive]}
                  onPress={() => setMainCategory(cat)}
                >
                  <Text
                    style={[
                      styles.catPillText,
                      mainCategory === cat && styles.catPillTextActive,
                    ]}
                  >
                    {cat} {mainCategory === cat && totalAmount > 0 ? `(₹${mainCategoryRemainder})` : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {totalAmount > 0 && (
              <TouchableOpacity style={styles.splitBtn} onPress={() => setShowSplitModal(true)}>
                <Text style={styles.splitBtnText}>
                  {splits.length > 0 ? `Splits (${splits.length})` : '⚡ Split Bill'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Save Button */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEntry} disabled={loading}>
          <Text style={styles.saveBtnText}>
            {pages.length > 0
              ? `✓ Save ${pages.length} ${pages.length === 1 ? 'Page' : 'Pages'}${
                  totalAmount > 0 ? ` (₹${totalAmount})` : ''
                }`
              : `✓ Log UPI / Cash (₹${totalAmount || 0} • No Photo)`}
          </Text>
        </TouchableOpacity>
      </View>

      {/* DMart Auto-Remainder Split Modal */}
      <Modal visible={showSplitModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Split Single Bill (Total: ₹{totalAmount})</Text>
            <Text style={styles.modalSub}>
              Main Category ({mainCategory}) gets the automatic remainder: ₹{mainCategoryRemainder}
            </Text>

            <ScrollView style={{ maxHeight: 260 }}>
              {splits.map((s, index) => (
                <View key={index} style={styles.splitItemRow}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ maxHeight: 36 }}
                  >
                    {CATEGORIES.filter((c) => c !== mainCategory).map((c) => (
                      <TouchableOpacity
                        key={c}
                        style={[styles.catPill, s.category === c && styles.catPillActive]}
                        onPress={() => {
                          const copy = [...splits];
                          copy[index].category = c;
                          setSplits(copy);
                        }}
                      >
                        <Text
                          style={[
                            styles.catPillText,
                            s.category === c && styles.catPillTextActive,
                          ]}
                        >
                          {c}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                    <TextInput
                      style={[styles.input, { flex: 1 }]}
                      placeholder="Sub-amount (e.g. 85+120)"
                      placeholderTextColor="#71717a"
                      keyboardType="decimal-pad"
                      returnKeyType="done"
                      value={s.expr}
                      onChangeText={(txt) => {
                        const copy = [...splits];
                        copy[index].expr = txt;
                        setSplits(copy);
                      }}
                    />
                    <TouchableOpacity
                      style={styles.plusBtn}
                      onPress={() => {
                        const copy = [...splits];
                        copy[index].expr = copy[index].expr ? `${copy[index].expr}+` : '';
                        setSplits(copy);
                      }}
                    >
                      <Text style={styles.plusBtnText}>+</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.delSplitBtn}
                      onPress={() => setSplits(splits.filter((_, i) => i !== index))}
                    >
                      <Text style={{ color: '#ef4444', fontWeight: 'bold' }}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.addSplitBtn}
              onPress={() => setSplits([...splits, { category: 'Toiletries', expr: '' }])}
            >
              <Text style={styles.addSplitText}>+ Add Another Category from This Bill</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.saveBtn} onPress={() => setShowSplitModal(false)}>
              <Text style={styles.saveBtnText}>Done Splitting</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  dark: { flex: 1, backgroundColor: '#09090b' },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  permTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 8 },
  permSub: { color: '#a1a1aa', textAlign: 'center', marginBottom: 20 },
  greenBtn: { backgroundColor: '#10b981', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10 },
  greenBtnText: { color: '#000', fontWeight: '800' },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  modeSwitch: { flexDirection: 'row', backgroundColor: '#18181b', borderRadius: 10, padding: 3, borderWidth: 1, borderColor: '#27272a' },
  modeBtn: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 8 },
  modeBtnActive: { backgroundColor: '#10b981' },
  modeText: { color: '#a1a1aa', fontWeight: '700', fontSize: 13 },
  modeTextActive: { color: '#000' },
  vaultBtn: { backgroundColor: '#18181b', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#f59e0b' },
  vaultBtnText: { color: '#f59e0b', fontWeight: '800', fontSize: 13 },
  cameraContainer: { flex: 1, marginHorizontal: 14, borderRadius: 16, overflow: 'hidden', backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a' },
  shutterOuter: { position: 'absolute', bottom: 16, alignSelf: 'center', width: 68, height: 68, borderRadius: 34, borderWidth: 4, borderColor: '#fff', justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  shutterInner: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#fff' },
  previewBanner: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(9,9,11,0.92)', padding: 12, alignItems: 'center', gap: 8 },
  previewBannerText: { color: '#e4e4e7', fontSize: 13, fontWeight: '600' },
  retakeBtn: { backgroundColor: '#ef4444', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  retakeText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  keepBtn: { backgroundColor: '#10b981', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 },
  keepText: { color: '#000', fontWeight: '800', fontSize: 13 },
  pageStrip: { paddingHorizontal: 14, paddingTop: 8 },
  pageThumbWrap: { marginRight: 8, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: '#27272a' },
  pageThumbActive: { borderColor: '#10b981' },
  pageThumb: { width: 46, height: 46 },
  pageBadge: { position: 'absolute', bottom: 2, right: 2, backgroundColor: 'rgba(0,0,0,0.75)', color: '#fff', fontSize: 10, paddingHorizontal: 4, borderRadius: 4, fontWeight: '700' },
  bottomSheet: { padding: 14, gap: 9 },
  chipScroll: { maxHeight: 32 },
  chip: { backgroundColor: '#18181b', paddingVertical: 5, paddingHorizontal: 11, borderRadius: 14, marginRight: 6, borderWidth: 1, borderColor: '#27272a' },
  chipSelected: { borderColor: '#10b981', backgroundColor: '#064e3b' },
  chipText: { color: '#d4d4d8', fontSize: 12, fontWeight: '600' },
  inputRow: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  input: { backgroundColor: '#18181b', color: '#fff', paddingHorizontal: 10, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#27272a', fontSize: 14 },
  plusBtn: { backgroundColor: '#27272a', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  plusBtnText: { color: '#10b981', fontSize: 16, fontWeight: '900' },
  pinBtn: { backgroundColor: '#18181b', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#27272a' },
  pinBtnActive: { borderColor: '#f59e0b', backgroundColor: '#451a03' },
  pinBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  splitSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catPill: { backgroundColor: '#18181b', paddingVertical: 5, paddingHorizontal: 10, borderRadius: 8, marginRight: 6, borderWidth: 1, borderColor: '#27272a' },
  catPillActive: { backgroundColor: '#10b981', borderColor: '#10b981' },
  catPillText: { color: '#a1a1aa', fontSize: 12, fontWeight: '600' },
  catPillTextActive: { color: '#000', fontWeight: '800' },
  splitBtn: { backgroundColor: '#3b82f6', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8 },
  splitBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  saveBtn: { backgroundColor: '#10b981', paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: '#000', fontSize: 15, fontWeight: '900' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#18181b', padding: 18, borderTopLeftRadius: 20, borderTopRightRadius: 20, gap: 12 },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalSub: { color: '#10b981', fontSize: 13, fontWeight: '600' },
  splitItemRow: { backgroundColor: '#09090b', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#27272a', marginBottom: 8 },
  delSplitBtn: { justifyContent: 'center', paddingHorizontal: 10 },
  addSplitBtn: { paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: '#3f3f46', borderRadius: 10, borderStyle: 'dashed' },
  addSplitText: { color: '#a1a1aa', fontWeight: '700' },
});

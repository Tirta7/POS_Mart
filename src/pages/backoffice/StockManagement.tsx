import React, { useState, useMemo } from 'react';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useDraftStore } from '../../store/useDraftStore';

import { 
  Plus, Save, CheckCircle, PackageCheck, Edit2, Trash2, X, ArrowDownToLine, 
  Camera, Search, FileText, AlertTriangle, Printer, LayoutGrid, Package, 
  Eye, EyeOff, RefreshCw, Download, DollarSign, TrendingUp, Copy, Check, Tag 
} from 'lucide-react';
import BarcodeScannerCamera from '../../components/BarcodeScannerCamera';
import BarcodeLabelModal from '../../components/BarcodeLabelModal';
import DraftReviewDrawer from '../../components/DraftReviewDrawer';
import { generateInternalBarcode, isInternalBarcode, generateAutoSKU } from '../../utils/barcode';
import { recordStockMutation, makeDocNo } from '../../utils/stockMutation';
import type { MutationLine } from '../../utils/stockMutation';
import VariantEditor, { makeVariantId, sumVariantQty, findDuplicateVariant } from '../../components/VariantEditor';
import type { VariantDraft } from '../../types';
import { exportMasterExcel } from '../../utils/excelExportImport';
import { getProductImage } from '../../utils/defaultProductImage';

const makeGrNumber = () => {
  const d = new Date();
  return `GR-${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}-${String(Math.floor(Math.random()*900)+100)}`;
};



const StockManagement: React.FC = () => {
  const { appName } = useSettingsStore();
  const { 
    products, addProduct, deleteProduct, setProductActive, updateProduct, 
    categories, addCategory, deleteCategory, editCategory, fetchProducts 
  } = useInventoryStore();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedBarcode, setCopiedBarcode] = useState<string | null>(null);
  const [stockFilter, setStockFilter] = useState<'ALL' | 'LOW' | 'OUT'>('ALL');

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (fetchProducts) await fetchProducts();
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const copyBarcode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedBarcode(code);
    setTimeout(() => setCopiedBarcode(null), 2000);
  };

  const handleDeleteProduct = async (p: any) => {
    const stockInfo = Number(p.stock) > 0 ? `\n\n⚠ Stok saat ini masih ${p.stock} ${p.unit || 'Pcs'} dan ikut hilang.` : '';
    const histInfo = `\n\nJika produk ini sudah pernah terjual, riwayat penjualan, invoice, dan mutasi stoknya TETAP tersimpan di laporan.`;
    if (!window.confirm(`Hapus produk "${p.name}"?${stockInfo}${histInfo}`)) return;
    const result = await deleteProduct(p.id);
    if (!result.ok) {
      alert(result.error || 'Gagal menghapus produk');
      return;
    }
    if (result.archived) {
      alert(`Produk "${p.name}" dihapus dari daftar & Kasir.\nRiwayat tetap tersimpan: ${result.saleCount || 0} item terjual, ${result.mutationCount || 0} mutasi stok.`);
    }
  };

  const handleToggleActive = async (p: any) => {
    const toActive = p.isActive === false;
    if (!toActive && !window.confirm(`Nonaktifkan "${p.name}"?\nProduk tidak akan tampil di Kasir POS sampai diaktifkan kembali.`)) return;
    const ok = await setProductActive(p.id, toActive);
    if (!ok) alert('Gagal mengubah status produk');
  };
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [productId, setProductId] = useState('');
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('Sembako');
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [activeCategory, setActiveCategory] = useState('all');
  const [qty, setQty] = useState<number | string>('');
  const [unit, setUnit] = useState('Pcs');
  const [purchasePrice, setPurchasePrice] = useState<number | string>('');
  const [boxPurchasePrice, setBoxPurchasePrice] = useState<number | string>('');
  const [sellingPrice, setSellingPrice] = useState<number | string>('');
  const [wholesalePrice, setWholesalePrice] = useState<number | string>('');
  const [_minWholesaleQty, setMinWholesaleQty] = useState<number | string>('');
  const [minStock, setMinStock] = useState<number | string>('');
  const [image, setImage] = useState('');
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [newCategory, setNewCategory] = useState('');

  // Multi-tier Packaging & Pricing (Dus / Renceng / Eceran)
  const [boxBarcode, setBoxBarcode] = useState('');
  const [boxCapacity, setBoxCapacity] = useState<number | string>(40);
  const [boxPrice, setBoxPrice] = useState<number | string>('');
  const [boxQty, setBoxQty] = useState<number | string>('');
  
  const [hasMidTier, setHasMidTier] = useState(false);
  const [midUnitName, setMidUnitName] = useState('');
  const [midBarcode, setMidBarcode] = useState('');
  const [midCapacity, setMidCapacity] = useState<number | string>(10);
  const [midPrice, setMidPrice] = useState<number | string>('');

  const [retailBarcode, setRetailBarcode] = useState('');
  const [scannerTarget, setScannerTarget] = useState<'box' | 'retail' | 'mid' | 'search'>('box');
  
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const [isMobileScreen, setIsMobileScreen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false));

  React.useEffect(() => {
    const checkScreen = () => setIsMobileScreen(window.innerWidth <= 768);
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  // Tutup drawer dengan animasi slide keluar ke kanan
  const closeDrawer = () => {
    setDrawerClosing(true);
    setTimeout(() => { resetForm(); setDrawerClosing(false); }, 250);
  };

  // Cetak label barcode (stiker thermal 40x30mm)
  const [labelProduct, setLabelProduct] = useState<any>(null);
  const [labelCopies, setLabelCopies] = useState(1);
  
  // Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategoryTarget, setEditingCategoryTarget] = useState('');
  const [editingCategoryName, setEditingCategoryName] = useState('');

  // Restock Modal State
  const [restockProduct, setRestockProduct] = useState<any>(null);
  const [restockBoxQty, setRestockBoxQty] = useState<number | string>('');
  const [restockQty, setRestockQty] = useState<number | string>('');
  const [restockPrice, setRestockPrice] = useState<number | string>('');
  const [restockBoxPrice, setRestockBoxPrice] = useState<number | string>('');
  // Restock produk bervarian legacy: qty tambahan per varian lama + varian baru (opsional)
  const [restockVarQty, setRestockVarQty] = useState<Record<string, number | string>>({});
  const [restockNewVariants, setRestockNewVariants] = useState<VariantDraft[]>([]);
  // Tidak lagi menggunakan sessionItems terpisah, semua draf global
  const [draftToast, setDraftToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal Konfirmasi & Posting
  const [showPostModal, setShowPostModal] = useState(false);
  const [isPosted, setIsPosted] = useState(false);
  const [grNumber, setGrNumber] = useState(makeGrNumber);

  // Draf Tersimpan (disimpan di Database via API)
  const { drafts, saveDrafts } = useDraftStore();
  const [showDraftModal, setShowDraftModal] = useState(false);
  // Pilihan item di daftar draf + drawer review (Lihat 1 item / Lanjutkan beberapa item)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reviewItems, setReviewItems] = useState<any[] | null>(null);
  const [reviewMode, setReviewMode] = useState<'single' | 'multi'>('single');

  const resetForm = () => {
    setEditingId(null);
    setProductId('');
    setSku('');
    setName('');
    setCategory(categories[0] || 'Sembako');
    setQty('');
    setUnit('Pcs');
    setPurchasePrice('');
    setBoxPurchasePrice('');
    setSellingPrice('');
    setWholesalePrice('');
    setMinWholesaleQty('');
    setMinStock('');
    setImage('');
    setVariants([]);
    setBoxBarcode('');
    setBoxCapacity(40);
    setBoxPrice('');
    setBoxQty('');
    setHasMidTier(false);
    setMidUnitName('');
    setMidBarcode('');
    setMidCapacity(10);
    setMidPrice('');
    setRetailBarcode('');
    setScannerTarget('box');
    setIsFormOpen(false);
  };

  const handleIdKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault(); // Prevent form submission
      
      const scannedCode = productId.trim();
      if (!scannedCode) return;

      if (editingId) {
        // Mode EDIT: User hanya sedang mengubah ID / Barcode produk ini.
        // JANGAN PERNAH reset form atau membatalkan status edit!
        const isDuplicate = products.some(p => p.id !== editingId && (p.id === scannedCode || p.barcode === scannedCode));
        if (isDuplicate) {
          alert(`Peringatan: Barcode "${scannedCode}" sudah digunakan oleh produk lain!`);
        }
        return;
      }

      // Mode TAMBAH BARU:
      const foundProduct = products.find(p => p.id === scannedCode || p.barcode === scannedCode);
      if (foundProduct) {
        if (confirm(`Barcode "${scannedCode}" sudah terdaftar sebagai "${foundProduct.name}". Buka data produk ini untuk diedit?`)) {
          handleEditClick(foundProduct);
        }
      }
      // Jika barcode belum ada, biarkan nilai productId tetap terisi barcode tersebut (jangan reset form!)
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Varian: baris tanpa nama diabaikan. Jika ada varian, stok produk = total qty semua varian.
    const namedVariants = variants.filter(v => v.name.trim());
    const hasVariants = namedVariants.length > 0;
    const totalQty = hasVariants ? sumVariantQty(namedVariants) : Number(qty);

    if (!name || Number(sellingPrice) <= 0) return;
    if (!editingId && totalQty <= 0) {
      if (hasVariants) alert('Isi jumlah (qty) minimal pada satu varian.');
      return;
    }
    const dupVariant = findDuplicateVariant(namedVariants);
    if (dupVariant) {
      alert(`Nama varian "${dupVariant}" ganda. Setiap varian harus punya nama berbeda.`);
      return;
    }
    
    // Tanpa barcode -> buat barcode internal unik (SKxxxxxx), sama untuk ID & barcode
    const finalId = productId || generateInternalBarcode(products);
    const finalBarcode = finalId;
    const finalSku = (sku || '').trim() || generateAutoSKU(name, finalBarcode);

    if (editingId) {
      // Find original to keep unmodified fields (like id, barcode, etc)
      const original = products.find(p => p.id === editingId);
      if (original) {
        // Cek duplikat: pastikan ID baru tidak bertabrakan dengan produk LAIN (kecuali diri sendiri)
        const isDuplicate = products.some(p => p.id !== editingId && (p.id === finalId || p.barcode === finalBarcode));
        if (isDuplicate) {
          alert(`Peringatan: Barcode/ID ${finalId} sudah digunakan oleh produk lain!`);
          return;
        }

        const origVariants = original.variants || [];
        const baseCost = Number(purchasePrice);
        const docNo = makeDocNo('ADJ');
        const keptIds = new Set(namedVariants.map(v => v.id));

        // a. Produk polos -> bervarian: kosongkan stok induk dulu, lalu isi lewat qty tiap varian
        if (hasVariants && origVariants.length === 0 && original.stock !== 0) {
          await recordStockMutation('ADJUSTMENT', docNo,
            [{ productId: original.id, qty: -original.stock, purchasePrice: baseCost, name, unit }],
            'Konversi stok produk ke varian');
        }
        // b. Varian yang dihapus: nol-kan stoknya lebih dulu agar tercatat di Mutasi Stok
        const removed = origVariants.filter(v => !keptIds.has(v.id) && v.stock !== 0);
        if (removed.length > 0) {
          await recordStockMutation('ADJUSTMENT', docNo,
            removed.map(v => ({ productId: original.id, variantId: v.id, variantName: v.name, qty: -v.stock, purchasePrice: baseCost, name, unit })),
            'Varian dihapus via Edit Master Data');
        }

        // c. Simpan master data multi-tier
        const finalBoxCap = Math.max(1, Number(boxCapacity) || 40);
        const finalBoxPrice = Number(boxPrice) > 0 ? Number(boxPrice) : (Number(wholesalePrice) > 0 ? Number(wholesalePrice) : (Number(sellingPrice) * finalBoxCap));
        const finalMidCap = hasMidTier ? Math.max(1, Number(midCapacity) || 1) : 0;
        const finalMidPrice = hasMidTier ? (Number(midPrice) || 0) : 0;
        const finalMidUnitName = hasMidTier && midUnitName.trim() ? midUnitName.trim() : null;
        const finalMidBarcode = hasMidTier && midBarcode.trim() ? midBarcode.trim() : null;
        const finalBoxBarcode = boxBarcode.trim() || finalBarcode;
        const finalRetailBarcode = retailBarcode.trim();

        await updateProduct(original.id, {
          ...original,
          id: finalId,
          barcode: finalBoxBarcode,
          sku: finalSku,
          name,
          category,
          unit,
          purchasePrice: baseCost,
          sellingPrice: Number(sellingPrice),
          wholesalePrice: finalBoxPrice,
          minWholesaleQty: finalBoxCap,
          minStock: Number(minStock),
          image: image || original.image,
          boxBarcode: finalBoxBarcode,
          boxCapacity: finalBoxCap,
          boxPrice: finalBoxPrice,
          midUnitName: finalMidUnitName,
          midBarcode: finalMidBarcode,
          midCapacity: finalMidCap,
          midPrice: finalMidPrice,
          retailBarcode: finalRetailBarcode || undefined,
          variants: []
        } as any);

        // Mutasi stok jika ada selisih
        const diffQty = totalQty - original.stock;
        if (diffQty !== 0) {
          const lines: MutationLine[] = [{ productId: original.id, qty: diffQty, purchasePrice: baseCost, name, unit }];
          await recordStockMutation('ADJUSTMENT', docNo, lines, `Koreksi stok via Edit Master Data (${original.stock} → ${totalQty} ${unit})`);
        }
        setEditingId(null);
      }
    } else {
      // Cek duplikat: di stok, di sesi ini, dan di draf lain yang belum diposting
      const pendingItems = [...draftItems];
      const isDuplicate =
        products.some(p => p.id === finalId || p.barcode === finalBarcode || (boxBarcode && p.boxBarcode === boxBarcode)) ||
        pendingItems.some(i => i.id === finalId || i.barcode === finalBarcode);
      if (isDuplicate) {
        alert(`Peringatan: Barcode/ID ${finalId} sudah terdaftar (di stok atau di draf)! Tidak boleh ada duplikat.`);
        return;
      }

      const finalBoxCap = Math.max(1, Number(boxCapacity) || 40);
      const finalBoxPrice = Number(boxPrice) > 0 ? Number(boxPrice) : (Number(wholesalePrice) > 0 ? Number(wholesalePrice) : (Number(sellingPrice) * finalBoxCap));
      const finalMidCap = hasMidTier ? Math.max(1, Number(midCapacity) || 1) : 0;
      const finalMidPrice = hasMidTier ? (Number(midPrice) || 0) : 0;
      const finalMidUnitName = hasMidTier && midUnitName.trim() ? midUnitName.trim() : undefined;
      const finalMidBarcode = hasMidTier && midBarcode.trim() ? midBarcode.trim() : undefined;
      const finalBoxBarcode = boxBarcode.trim() || finalBarcode;
      const finalRetailBarcode = retailBarcode.trim();

      // Masuk ke Draf (BELUM masuk stok / Kasir POS sampai di-Posting)
      const newItem = {
        pending: true,
        id: finalId,
        barcode: finalBoxBarcode,
        sku: finalSku, 
        name, 
        category, 
        unit,
        location: 'Gudang Utama',
        qty: totalQty,
        purchasePrice: Number(purchasePrice),
        sellingPrice: Number(sellingPrice),
        wholesalePrice: finalBoxPrice,
        minWholesaleQty: finalBoxCap,
        minStock: Number(minStock),
        image: image ? getProductImage(image) : '',
        boxBarcode: finalBoxBarcode,
        boxCapacity: finalBoxCap,
        boxPrice: finalBoxPrice,
        midUnitName: finalMidUnitName,
        midBarcode: finalMidBarcode,
        midCapacity: finalMidCap,
        midPrice: finalMidPrice,
        retailBarcode: finalRetailBarcode || undefined,
        variants: []
      };
      const nextItems = [...draftItems, newItem];
      
      // Update global draft
      saveDrafts([{ grNumber: 'GLOBAL-DRAFT', savedAt: new Date().toISOString(), draftId: 'DRAFT-GLOBAL', items: nextItems }]);
      
      setDraftToast(`"${name}" (${totalQty} ${unit}${boxQty ? ` / ${boxQty} Dus` : ''}) ditambahkan ke Draf. Belum tampil di Kasir POS sebelum diposting.`);
      setTimeout(() => setDraftToast(null), 4500);

      // Barang tanpa barcode pabrikan -> langsung tawarkan cetak label stiker
      if (isInternalBarcode(finalId)) {
        setLabelCopies(Math.max(1, Math.ceil(totalQty)));
        setLabelProduct({
          id: finalId,
          barcode: finalBoxBarcode,
          sku: finalSku,
          name,
          sellingPrice: Number(sellingPrice),
          variants: []
        });
      }
    }
    
    resetForm();
  };

  
  // Semua item draf (datar)
  const draftItems: any[] = drafts
    .slice()
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    .flatMap(d => (d.items || []).map((it: any) => ({ ...it, grNumber: d.grNumber, draftId: d.draftId, savedAt: d.savedAt })));

  const toggleSelect = (id: string) =>
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const openReviewSingle = (item: any) => { 
    setShowDraftModal(false);
    setReviewMode('single'); 
    setReviewItems([item]); 
  };
  const openReviewSelected = () => {
    setShowDraftModal(false);
    setReviewMode('multi');
    setReviewItems(draftItems.filter(i => selectedIds.includes(i.id)));
  };

  // Simpan hasil edit item draf (mis. salah input harga). ID/barcode tidak berubah.
  const handleSaveDraftItem = (updated: any) => {
    const fields = {
      name: updated.name,
      sku: updated.sku,
      category: updated.category,
      unit: updated.unit,
      qty: Number(updated.qty),
      minStock: Number(updated.minStock || 0),
      purchasePrice: Number(updated.purchasePrice || 0),
      sellingPrice: Number(updated.sellingPrice),
      wholesalePrice: Number(updated.wholesalePrice || updated.boxPrice || 0),
      minWholesaleQty: Number(updated.boxCapacity || updated.minWholesaleQty || 0),
      boxBarcode: updated.boxBarcode || undefined,
      boxCapacity: Number(updated.boxCapacity) || 1,
      boxPrice: Number(updated.boxPrice) || Number(updated.wholesalePrice) || 0,
      midUnitName: updated.midUnitName || undefined,
      midBarcode: updated.midBarcode || undefined,
      midCapacity: Number(updated.midCapacity) || 0,
      midPrice: Number(updated.midPrice) || 0,
      retailBarcode: updated.retailBarcode || undefined,
      image: updated.image || undefined,
      variants: updated.variants && updated.variants.length > 0 ? updated.variants : undefined,
    };
    const next = drafts.map(d => ({
      ...d,
      items: (d.items || []).map((i: any) => i.id === updated.id ? { ...i, ...fields } : i),
    }));
    saveDrafts(next);
    setReviewItems(prev => prev ? prev.map(i => i.id === updated.id ? { ...i, ...fields } : i) : prev);
  };

  // Hapus satu item dari draf (draf yang kosong ikut dihapus)
  const handleRemoveDraftItem = (itemId: string) => {
    if (!window.confirm('Hapus item ini dari draf? Item belum masuk stok dan akan hilang.')) return;
    const next = drafts
      .map(d => ({ ...d, items: (d.items || []).filter((i: any) => i.id !== itemId) }))
      .filter(d => d.items.length > 0);
    saveDrafts(next);
    setSelectedIds(prev => prev.filter(x => x !== itemId));
  };

  // Terapkan item ke stok (stok bertambah / produk baru muncul di Kasir POS)
  const applyItemsToStock = async (items: any[], docNo: string) => {
    const mutationLines: MutationLine[] = [];
    for (const item of items) {
      // Item draf lama (sebelum fitur ini) sudah pernah masuk stok -> jangan ditambah dua kali
      if (!item.pending) continue;
      const live = useInventoryStore.getState().products;
      const existing = live.find(p => p.id === item.id || p.barcode === item.id);
      const qtyIn = Number(item.qty);
      const buyPrice = Number(item.purchasePrice);
      // Varian pada draf (pastikan setiap varian punya ID agar bisa dipakai mutasi)
      const draftVariants = ((item.variants || []) as any[])
        .filter(v => String(v.name || '').trim())
        .map(v => ({ ...v, id: v.id || makeVariantId(), name: String(v.name).trim() }));

      if (existing) {
        const exVariants = existing.variants || [];
        // Produk polos yang akan dijadikan bervarian: kosongkan stok induk dulu (diisi ulang via varian)
        if (draftVariants.length > 0 && exVariants.length === 0 && existing.stock !== 0) {
          await recordStockMutation('ADJUSTMENT', makeDocNo('ADJ'),
            [{ productId: existing.id, qty: -existing.stock, purchasePrice: existing.purchasePrice, name: existing.name, unit: existing.unit }],
            'Konversi stok produk ke varian');
        }
        const stockBefore = draftVariants.length > 0 && exVariants.length === 0 ? 0 : existing.stock;
        // Produk sudah ada -> tambah stok, HPP Moving Average
        const newTotal = stockBefore + qtyIn;
        const avg = newTotal > 0
          ? Math.round(((stockBefore * existing.purchasePrice) + (qtyIn * buyPrice)) / newTotal)
          : buyPrice;

        // Cocokkan varian draf dengan varian yang sudah ada (berdasarkan nama); sisanya dibuat baru
        const variantsPayload: any[] = exVariants.map(v => ({
          id: v.id, name: v.name, stock: v.stock,
          barcode: v.barcode, sku: v.sku,
          image: v.image,
          purchasePrice: v.purchasePrice, sellingPrice: v.sellingPrice, wholesalePrice: v.wholesalePrice,
        }));
        const resolved: { id: string; name: string; qty: number }[] = [];
        if (draftVariants.length > 0) {
          for (const dv of draftVariants) {
            const match = variantsPayload.find(x => String(x.name).trim().toLowerCase() === dv.name.toLowerCase());
            if (match) {
              if (dv.barcode && !match.barcode) match.barcode = dv.barcode;
              if (dv.sku && !match.sku) match.sku = dv.sku;
              if (dv.image && !match.image) match.image = dv.image;
              resolved.push({ id: match.id, name: match.name, qty: Number(dv.qty) || 0 });
            } else {
              variantsPayload.push({
                id: dv.id, name: dv.name, stock: 0,
                barcode: dv.barcode, sku: dv.sku,
                image: dv.image ? dv.image.trim() : undefined,
                sellingPrice: Number(dv.sellingPrice) > 0 ? Number(dv.sellingPrice) : undefined,
                wholesalePrice: Number(dv.wholesalePrice) > 0 ? Number(dv.wholesalePrice) : undefined,
              });
              resolved.push({ id: dv.id, name: dv.name, qty: Number(dv.qty) || 0 });
            }
          }
        } else if (exVariants.length > 0) {
          // Produk bervarian tapi draf tanpa varian -> masuk ke varian pertama
          resolved.push({ id: exVariants[0].id, name: exVariants[0].name, qty: qtyIn });
        }

        // Mencegah Race Condition: Jangan update stok di sini! Biarkan Mutasi (recordStockMutation) 
        // yang melakukan INCREMENT secara atomic di sisi database.
        const { stock, variants: _v, ...payload } = { ...existing, purchasePrice: avg };
        await updateProduct(existing.id, { ...payload, variants: variantsPayload } as any);

        if (resolved.length > 0) {
          resolved.forEach(r => mutationLines.push({ productId: existing.id, variantId: r.id, variantName: r.name, qty: r.qty, purchasePrice: buyPrice, name: item.name, unit: item.unit }));
        } else {
          mutationLines.push({ productId: existing.id, qty: qtyIn, purchasePrice: buyPrice, name: item.name, unit: item.unit });
        }
      } else {
        const createdProd = await addProduct({
          id: item.id,
          sku: item.sku,
          barcode: item.barcode || item.id,
          name: item.name,
          category: item.category,
          location: item.location || 'Gudang Utama',
          unit: item.unit,
          stock: 0, // Dikosongkan agar penambahan qty di mutasi tidak berlipat (doubled)
          baseUnitMultiplier: 1,
          purchasePrice: buyPrice,
          sellingPrice: Number(item.sellingPrice),
          wholesalePrice: Number(item.wholesalePrice || 0),
          minWholesaleQty: Number(item.minWholesaleQty || 0),
          minStock: Number(item.minStock || 0),
          image: item.image ? getProductImage(item.image) : '',
          boxBarcode: item.boxBarcode || undefined,
          boxCapacity: item.boxCapacity || 1,
          boxPrice: item.boxPrice || 0,
          midUnitName: item.midUnitName || undefined,
          midBarcode: item.midBarcode || undefined,
          midCapacity: item.midCapacity || 0,
          midPrice: item.midPrice || 0,
          retailBarcode: item.retailBarcode || undefined,
          // Varian dibuat dengan stok 0; stok masuk lewat mutasi IN per varian
          variants: draftVariants.map(dv => ({
            id: dv.id, name: dv.name, stock: 0,
            barcode: dv.barcode, sku: dv.sku,
            image: dv.image ? dv.image.trim() : undefined,
            sellingPrice: Number(dv.sellingPrice) > 0 ? Number(dv.sellingPrice) : undefined,
            wholesalePrice: Number(dv.wholesalePrice) > 0 ? Number(dv.wholesalePrice) : undefined,
          })),
        });
        if (draftVariants.length > 0) {
          draftVariants.forEach(dv => mutationLines.push({ productId: createdProd.id, variantId: dv.id, variantName: dv.name, qty: Number(dv.qty) || 0, purchasePrice: buyPrice, name: item.name, unit: item.unit }));
        } else {
          mutationLines.push({ productId: createdProd.id, qty: qtyIn, purchasePrice: buyPrice, name: item.name, unit: item.unit });
        }
      }
    }
    // Mutasi stok: Barang Masuk (IN) per dokumen GR
    await recordStockMutation('IN', docNo, mutationLines, 'Penerimaan Barang (GR)');
  };

  const writePostedLog = (ref: string, items: any[]) => {
    const log = {
      grNumber: ref,
      postedAt: new Date().toISOString(),
      items,
      totalItems: items.length,
      totalValue: items.reduce((sum, i) => sum + (Number(i.purchasePrice) * Number(i.qty)), 0),
    };
    const existingLogs: any[] = JSON.parse(localStorage.getItem('grPosted') || '[]');
    existingLogs.push(log);
    localStorage.setItem('grPosted', JSON.stringify(existingLogs));
  };

  // Posting dari drawer (item terpilih saja, bisa dari beberapa draf)
  const handlePostFromDrawer = (items: any[]): string => {
    const ref = makeGrNumber();
    applyItemsToStock(items, ref);
    writePostedLog(ref, items);

    const ids = new Set(items.map(i => i.id));
    const next = drafts
      .map(d => ({ ...d, items: (d.items || []).filter((i: any) => !ids.has(i.id)) }))
      .filter(d => d.items.length > 0);
    saveDrafts(next);
    setSelectedIds(prev => prev.filter(id => !ids.has(id)));
    return ref;
  };

  // Posting seluruh draft
  const handlePosting = async () => {
    if (draftItems.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      await applyItemsToStock(draftItems, grNumber);

      setIsPosted(true);
      writePostedLog(grNumber, draftItems);
      // Kosongkan draft global
      const emptyDraft: any[] = [];
      saveDrafts(emptyDraft);
          } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditClick = (p: any) => {
    setEditingId(p.id);
    setProductId(p.boxBarcode || p.barcode || p.id || '');
    setBoxBarcode(p.boxBarcode || p.barcode || p.id || '');
    setRetailBarcode(p.retailBarcode || '');
    setBoxCapacity(p.boxCapacity || 40);
    setBoxPrice(p.boxPrice || p.wholesalePrice || '');
    const isMidActive = Boolean(
      (Number(p.midPrice) > 0 && Number(p.midCapacity) > 1) ||
      (p.midUnitName && Number(p.midCapacity) > 1 && (Number(p.midPrice) > 0 || (p.midBarcode && p.midBarcode.trim() !== '')))
    );
    setHasMidTier(isMidActive);
    const fallbackMidUnit = p.unit?.toLowerCase() === 'kg' || p.category?.toUpperCase()?.includes('BERAS') 
      ? 'Sak' 
      : (p.category?.toUpperCase()?.includes('ROKOK') ? 'Slop' : 'Pack');
    setMidUnitName(p.midUnitName || fallbackMidUnit);
    setMidBarcode(p.midBarcode || '');
    setMidCapacity(p.midCapacity && Number(p.midCapacity) > 0 ? Number(p.midCapacity) : (p.unit?.toLowerCase() === 'kg' ? 5 : 10));
    setMidPrice(p.midPrice || '');
    setSku(p.sku);
    setName(p.name);
    setCategory(p.category);
    setQty(p.stock);
    setUnit(p.unit || 'Pcs');
    setPurchasePrice(p.purchasePrice);
    const bCap = Number(p.boxCapacity) || 1;
    setBoxPurchasePrice(bCap > 1 && p.purchasePrice ? Math.round(Number(p.purchasePrice) * bCap) : '');
    setSellingPrice(p.sellingPrice);
    setWholesalePrice(p.boxPrice || p.wholesalePrice || 0);
    setMinWholesaleQty(p.boxCapacity || p.minWholesaleQty || '');
    setMinStock(p.minStock || 0);
    setImage(p.image || '');
    setVariants([]);
    setIsFormOpen(true); // Buka popup
  };

  const formatIDR = (num: number) => {
    return 'Rp ' + num.toLocaleString('id-ID');
  };

  const openRestockModal = (p: any) => {
    setRestockProduct(p);
    const boxCap = Number(p.boxCapacity) || 1;
    const unitPrice = Number(p.purchasePrice) || 0;
    setRestockBoxQty('');
    setRestockQty('');
    setRestockPrice(unitPrice);
    setRestockBoxPrice(unitPrice * boxCap);
    setRestockVarQty({});
    setRestockNewVariants([]);
  };

  // Multi-tier restock calculation: Dus + Eceran
  const restockHasVariants = !!restockProduct && (restockProduct.variants || []).length > 0;
  const restockNewNamed = restockNewVariants.filter(v => v.name.trim());
  const restockBoxCap = Number(restockProduct?.boxCapacity) || 1;
  const restockUnitsFromBoxes = (Number(restockBoxQty) || 0) * restockBoxCap;
  const restockUnitsFromLoose = Number(restockQty) || 0;
  const restockAddedQty = !restockProduct
    ? 0
    : restockHasVariants
      ? Object.values(restockVarQty).reduce<number>((s, q) => s + (Number(q) || 0), 0) + sumVariantQty(restockNewNamed)
      : (restockUnitsFromBoxes + restockUnitsFromLoose);

  const handleRestockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct || restockAddedQty <= 0 || Number(restockPrice) <= 0) return;

    const exVariants: any[] = restockProduct.variants || [];
    const allNames = [...exVariants.map(v => ({ id: v.id, name: v.name, qty: 0 })), ...restockNewNamed.map(v => ({ id: v.id, name: v.name, qty: 0 }))];
    const dup = findDuplicateVariant(allNames);
    if (dup) {
      alert(`Nama varian "${dup}" sudah ada.`);
      return;
    }

    const oldQty = Number(restockProduct.stock) || 0;
    const oldPrice = Number(restockProduct.purchasePrice) || 0;
    const addedQty = restockAddedQty;
    const newPrice = Number(restockPrice);

    const newTotalQty = oldQty + addedQty;
    // Hitung Harga Pokok Pembelian (HPP) baru dengan Moving Average
    const newAveragePrice = Math.round(((oldQty * oldPrice) + (addedQty * newPrice)) / newTotalQty);

    // Mencegah Race Condition: Jangan update stok di sini! Mutasi IN yang akan
    // menambah stok (increment) di database.
    const payload = {
      ...restockProduct,
      purchasePrice: newAveragePrice,
      // Harga jual tidak diubah otomatis
    };
    delete payload.stock;

    if (restockHasVariants) {
      payload.variants = [
        ...exVariants.map(v => ({ id: v.id, name: v.name, stock: v.stock, purchasePrice: v.purchasePrice, sellingPrice: v.sellingPrice, wholesalePrice: v.wholesalePrice })),
        ...restockNewNamed.map(v => ({
          id: v.id, name: v.name.trim(), stock: 0,
          sellingPrice: Number(v.sellingPrice) > 0 ? Number(v.sellingPrice) : undefined,
          wholesalePrice: Number(v.wholesalePrice) > 0 ? Number(v.wholesalePrice) : undefined,
        })),
      ];
    }
    
    // Tunggu varian baru tersimpan sebelum mutasi mereferensikannya
    await updateProduct(restockProduct.id, payload);

    const lines: MutationLine[] = restockHasVariants
      ? [
          ...exVariants.map(v => ({ productId: restockProduct.id, variantId: v.id, variantName: v.name, qty: Number(restockVarQty[v.id]) || 0, purchasePrice: newPrice, name: restockProduct.name, unit: restockProduct.unit })),
          ...restockNewNamed.map(v => ({ productId: restockProduct.id, variantId: v.id, variantName: v.name.trim(), qty: Number(v.qty) || 0, purchasePrice: newPrice, name: restockProduct.name, unit: restockProduct.unit })),
        ]
      : [{ productId: restockProduct.id, qty: addedQty, purchasePrice: newPrice, name: restockProduct.name, unit: restockProduct.unit }];

    const desc = restockUnitsFromBoxes > 0
      ? `Restock: ${restockBoxQty} Dus${restockUnitsFromLoose > 0 ? ` + ${restockQty} ${restockProduct.unit}` : ''} (${addedQty} ${restockProduct.unit})`
      : `Restock: ${addedQty} ${restockProduct.unit}`;

    // Mutasi stok: Barang Masuk (IN) dari restock
    await recordStockMutation('IN', makeDocNo('RST'), lines, desc);

    setRestockProduct(null);
  };

  // Combine database products with pending draft items
  const pendingDisplayProducts = draftItems.map(si => ({
    id: si.id,
    sku: si.sku,
    barcode: si.barcode,
    name: si.name,
    category: si.category,
    location: si.location,
    unit: si.unit,
    stock: si.qty,
    purchasePrice: si.purchasePrice,
    sellingPrice: si.sellingPrice,
    wholesalePrice: si.wholesalePrice,
    minStock: si.minStock,
    image: si.image,
    boxBarcode: si.boxBarcode || si.barcode,
    boxCapacity: si.boxCapacity || 40,
    boxPrice: si.boxPrice || si.wholesalePrice,
    midUnitName: si.midUnitName || '',
    midBarcode: si.midBarcode || '',
    midCapacity: Number(si.midCapacity || 0),
    midPrice: Number(si.midPrice || 0),
    retailBarcode: si.retailBarcode || '',
    variants: (si.variants || []).map((v: any) => ({
      id: v.id,
      name: v.name,
      barcode: v.barcode || '',
      sku: v.sku || '',
      stock: Number(v.qty) || 0,
      sellingPrice: Number(v.sellingPrice) || 0,
      wholesalePrice: Number(v.wholesalePrice) || 0,
      minWholesaleQty: Number(v.minWholesaleQty) || 0
    })),
    isActive: true,
    isPending: true
  }));

  const allDisplayProducts = [...pendingDisplayProducts, ...products];

  // Dynamic list of categories from both store categories and active products with case-insensitive deduplication
  const categoryMap = new Map<string, string>();
  [...categories, ...allDisplayProducts.map(p => p.category).filter(Boolean)].forEach(cat => {
    if (cat && typeof cat === 'string') {
      const trimmed = cat.trim();
      const lower = trimmed.toLowerCase();
      if (lower && !categoryMap.has(lower)) {
        categoryMap.set(lower, trimmed);
      }
    }
  });
  const displayCategories = Array.from(categoryMap.values());

  // Jika kategori aktif sudah dihapus/diganti nama, kembali ke 'Semua'
  const currentCategory = activeCategory === 'all' || displayCategories.some(c => c.toLowerCase() === activeCategory.toLowerCase()) 
    ? activeCategory 
    : 'all';

  const inactiveCount = products.filter(p => p.isActive === false).length;

  // Summary Metrics for KPI cards
  const activeProductsCount = useMemo(() => {
    return products.filter(p => p.isActive !== false).length;
  }, [products]);

  const totalStockUnits = useMemo(() => {
    return products.reduce((acc, p) => acc + (Number(p.stock) || 0), 0);
  }, [products]);

  const totalInventoryCost = useMemo(() => {
    return products.reduce((acc, p) => acc + ((Number(p.stock) || 0) * (Number(p.purchasePrice) || 0)), 0);
  }, [products]);

  const totalInventoryRetail = useMemo(() => {
    return products.reduce((acc, p) => acc + ((Number(p.stock) || 0) * (Number(p.sellingPrice) || 0)), 0);
  }, [products]);

  const outOfStockCount = useMemo(() => {
    return products.filter(p => (Number(p.stock) || 0) <= 0).length;
  }, [products]);

  const lowStockCount = useMemo(() => {
    return products.filter(p => {
      const stock = Number(p.stock) || 0;
      const min = p.minStock !== undefined && p.minStock !== null ? Number(p.minStock) : 5;
      return stock <= min;
    }).length;
  }, [products]);

  const handleExportExcel = () => {
    exportMasterExcel({
      storeName: appName || 'HERO PRO SHOP',
      exportedAt: new Date().toISOString(),
      products: products
    }, `Master_Stok_Produk_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const filteredProducts = allDisplayProducts.filter(p => {
    // Switch Nonaktif: OFF = hanya produk aktif, ON = hanya produk nonaktif
    if (showInactive ? p.isActive !== false : p.isActive === false) return false;

    // Filter Kategori
    if (currentCategory !== 'all' && (!p.category || p.category.toLowerCase() !== currentCategory.toLowerCase())) {
      return false;
    }

    // Quick Stock Filter (ALL / LOW / OUT)
    const stockVal = Number(p.stock) || 0;
    const minVal = p.minStock !== undefined && p.minStock !== null ? Number(p.minStock) : 5;
    if (stockFilter === 'OUT' && stockVal > 0) return false;
    if (stockFilter === 'LOW' && stockVal > minVal) return false;

    // Search query
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchSku = (p.sku || '').toLowerCase().includes(q);
      const matchId = (p.id || '').toLowerCase().includes(q);
      const matchBarcode = (p.barcode || '').toLowerCase().includes(q);
      const matchBoxBarcode = (p.boxBarcode || '').toLowerCase().includes(q);
      const matchRetailBarcode = (p.retailBarcode || '').toLowerCase().includes(q);
      const matchMidBarcode = (p.midBarcode || '').toLowerCase().includes(q);
      const matchVariants = (p.variants || []).some((v: any) => String(v.name || '').toLowerCase().includes(q));
      if (!matchName && !matchSku && !matchId && !matchBarcode && !matchBoxBarcode && !matchRetailBarcode && !matchMidBarcode && !matchVariants) return false;
    }

    return true;
  });

  const filteredStats = useMemo(() => {
    const totalUnits = filteredProducts.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
    const totalCost = filteredProducts.reduce((sum, p) => sum + ((Number(p.stock) || 0) * (Number(p.purchasePrice) || 0)), 0);
    const totalRetail = filteredProducts.reduce((sum, p) => sum + ((Number(p.stock) || 0) * (Number(p.sellingPrice) || 0)), 0);
    return { totalUnits, totalCost, totalRetail };
  }, [filteredProducts]);

  return (
    <div 
      className="bo-container"
      style={isMobileScreen ? {
        overflowY: 'auto', padding: '16px 14px 110px 14px', maxWidth: '780px', margin: '0 auto'
      } : {
        display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden'
      }}
    >
      
      {/* 1. Header Section */}
      <div className="bo-page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '4px', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 className="bo-page-title" style={{ fontSize: isMobileScreen ? '20px' : '23px', fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>
              Manajemen Stok &amp; Katalog
            </h1>
            <span style={{
              background: '#ecfdf5', border: '1px solid #bbf7d0', color: '#16a34a',
              padding: '2px 9px', borderRadius: '999px', fontSize: '11px', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: '5px'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
              Live Synced
            </span>
          </div>
          <p className="bo-page-subtitle" style={{ fontSize: '12.5px', color: '#64748b', margin: '3px 0 0 0' }}>
            Kelola master data produk, harga jual, margin keuntungan, dan ketersediaan stok toko.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            style={{
              background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155',
              padding: '7px 12px', borderRadius: '9px', fontSize: '12px', fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: isRefreshing ? 'wait' : 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
            }}
          >
            <RefreshCw size={13} style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
            <span className="hide-mobile">Segarkan</span>
          </button>

          {!isMobileScreen && (
            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155',
                padding: '7px 12px', borderRadius: '9px', fontSize: '12px', fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}
            >
              <Download size={13} />
              <span>Ekspor Excel</span>
            </button>
          )}

          <button
            type="button"
            className="bo-btn bo-btn-secondary"
            onClick={() => { setSelectedIds([]); setShowDraftModal(true); }}
            style={{ height: '34px', padding: '0 11px', fontSize: '12px', borderRadius: '9px' }}
          >
            <FileText size={14} /> <span className="hide-mobile">Draf</span>
            {draftItems.length > 0 && (
              <span style={{ marginLeft: '4px', background: '#e11d48', color: 'white', borderRadius: '999px', padding: '1px 6px', fontSize: '10.5px', fontWeight: 800 }}>
                {draftItems.length}
              </span>
            )}
          </button>

          {draftItems.length > 0 && (
            <button
              type="button"
              className="bo-btn bo-btn-primary"
              onClick={() => { setShowPostModal(true); setIsPosted(false); }}
              style={{ height: '34px', padding: '0 12px', fontSize: '12px', borderRadius: '9px' }}
            >
              <CheckCircle size={14} /> <span className="hide-mobile">Posting Draf</span>
            </button>
          )}

          <button
            type="button"
            className="bo-btn bo-btn-primary"
            onClick={() => { resetForm(); setIsFormOpen(true); }}
            style={{
              height: '34px', padding: '0 13px', fontSize: '12px', borderRadius: '9px',
              backgroundColor: '#0f172a', borderColor: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px',
              boxShadow: '0 2px 6px rgba(15,23,42,0.18)'
            }}
          >
            <Plus size={15} /> <span>Tambah Produk</span>
          </button>
        </div>
      </div>

      {/* Toast Simpan Draf */}
      {draftToast && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          backgroundColor: '#1a1a2e', color: 'white',
          padding: '10px 20px', borderRadius: '999px',
          display: 'flex', alignItems: 'center', gap: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
          zIndex: 99999, animation: 'fadeInUp 0.25s ease',
          fontSize: '13px', fontWeight: 600
        }}>
          <Save size={15} color="#4ade80" />
          {draftToast}
        </div>
      )}

      {/* 2. ANALYTICS KPI CARDS (4-COLS FULL WIDTH ON DESKTOP) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobileScreen ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
        gap: isMobileScreen ? '8px' : '12px',
        marginBottom: '4px',
        flexShrink: 0
      }}>
        {/* Card 1: TOTAL PRODUK & SKU */}
        <div style={{
          background: '#ffffff', borderRadius: '12px', padding: isMobileScreen ? '12px' : '13px 15px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              TOTAL PRODUK
            </span>
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px',
              background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#3b82f6'
            }}>
              <Package size={15} />
            </div>
          </div>
          <div style={{ fontSize: isMobileScreen ? '17px' : '20px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
            {products.length} <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Item</span>
          </div>
          <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            <strong>{activeProductsCount}</strong> aktif • <strong>{displayCategories.length}</strong> kategori
          </span>
        </div>

        {/* Card 2: NILAI ASET (MODAL BELI) */}
        <div style={{
          background: '#ffffff', borderRadius: '12px', padding: isMobileScreen ? '12px' : '13px 15px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              NILAI ASET (MODAL)
            </span>
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px',
              background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#d97706'
            }}>
              <DollarSign size={15} />
            </div>
          </div>
          <div style={{ fontSize: isMobileScreen ? '17px' : '20px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
            {formatIDR(totalInventoryCost)}
          </div>
          <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            Total fisik: <strong>{totalStockUnits.toLocaleString('id-ID')}</strong> unit tersimpan
          </span>
        </div>

        {/* Card 3: POTENSI NILAI JUAL */}
        <div style={{
          background: '#ffffff', borderRadius: '12px', padding: isMobileScreen ? '12px' : '13px 15px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              POTENSI OMZET
            </span>
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px',
              background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#10b981'
            }}>
              <TrendingUp size={15} />
            </div>
          </div>
          <div style={{ fontSize: isMobileScreen ? '17px' : '20px', fontWeight: 900, color: '#16a34a', lineHeight: 1.1 }}>
            {formatIDR(totalInventoryRetail)}
          </div>
          <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            Est. margin: <strong style={{ color: '#16a34a' }}>+{formatIDR(Math.max(0, totalInventoryRetail - totalInventoryCost))}</strong>
          </span>
        </div>

        {/* Card 4: PERINGATAN STOK */}
        <div 
          onClick={() => setStockFilter(f => f === 'LOW' ? 'ALL' : 'LOW')}
          style={{
            background: stockFilter === 'LOW' ? '#fff7ed' : '#ffffff',
            borderRadius: '12px', padding: isMobileScreen ? '12px' : '13px 15px',
            border: stockFilter === 'LOW' ? '1.5px solid #f97316' : '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            display: 'flex', flexDirection: 'column', cursor: 'pointer', transition: 'all 0.15s'
          }}
          title="Klik untuk filter produk stok menipis"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: 800, color: lowStockCount > 0 ? '#dc2626' : '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              STOK MENIPIS / HABIS
            </span>
            <div style={{
              width: '30px', height: '30px', borderRadius: '8px',
              background: lowStockCount > 0 ? '#fee2e2' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: lowStockCount > 0 ? '#dc2626' : '#64748b'
            }}>
              <AlertTriangle size={15} />
            </div>
          </div>
          <div style={{ fontSize: isMobileScreen ? '17px' : '20px', fontWeight: 900, color: lowStockCount > 0 ? '#dc2626' : '#0f172a', lineHeight: 1.1 }}>
            {lowStockCount} <span style={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Item</span>
          </div>
          <span style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
            <strong style={{ color: outOfStockCount > 0 ? '#dc2626' : '#64748b' }}>{outOfStockCount}</strong> habis (0) • <strong>{Math.max(0, lowStockCount - outOfStockCount)}</strong> di batas min
          </span>
        </div>
      </div>

      {/* 3. Main Data Card */}
      <div className="bo-card" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, marginBottom: 0, overflow: 'hidden' }}>
        {/* Card Header & Controls */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', flexShrink: 0, background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <PackageCheck size={17} style={{ color: 'var(--primary)' }} /> 
              Katalog &amp; Master Stok
            </h3>
            <span style={{ background: '#f1f5f9', color: '#475569', fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '999px', border: '1px solid #e2e8f0' }}>
              {filteredProducts.length} Produk
            </span>
          </div>
          
          <div className="r-wrap-mobile" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Quick stock status pill filter */}
            <div style={{ display: 'inline-flex', background: '#f1f5f9', padding: '2px', borderRadius: '8px', border: '1px solid #e2e8f0', gap: '2px' }}>
              <button
                type="button"
                onClick={() => setStockFilter('ALL')}
                style={{
                  padding: '3px 9px', fontSize: '11px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: stockFilter === 'ALL' ? '#ffffff' : 'transparent',
                  color: stockFilter === 'ALL' ? '#0f172a' : '#64748b',
                  boxShadow: stockFilter === 'ALL' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('LOW')}
                style={{
                  padding: '3px 9px', fontSize: '11px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: stockFilter === 'LOW' ? '#ffffff' : 'transparent',
                  color: stockFilter === 'LOW' ? '#b45309' : '#64748b',
                  boxShadow: stockFilter === 'LOW' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                Menipis {lowStockCount > 0 && `(${lowStockCount})`}
              </button>
              <button
                type="button"
                onClick={() => setStockFilter('OUT')}
                style={{
                  padding: '3px 9px', fontSize: '11px', fontWeight: 700, borderRadius: '6px', border: 'none', cursor: 'pointer',
                  background: stockFilter === 'OUT' ? '#ffffff' : 'transparent',
                  color: stockFilter === 'OUT' ? '#dc2626' : '#64748b',
                  boxShadow: stockFilter === 'OUT' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                  transition: 'all 0.15s'
                }}
              >
                Habis {outOfStockCount > 0 && `(${outOfStockCount})`}
              </button>
            </div>

            {/* Switch: tampilkan produk nonaktif */}
            <button
              type="button"
              role="switch"
              aria-checked={showInactive}
              onClick={() => setShowInactive(v => !v)}
              title="Tampilkan hanya produk yang dinonaktifkan (tidak tampil di Kasir)"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px', height: '32px', padding: '0 9px',
                borderRadius: '8px', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: '11.5px', fontWeight: 700,
                border: showInactive ? '1px solid #fecaca' : '1px solid #e2e8f0',
                background: showInactive ? '#fef2f2' : '#ffffff',
                color: showInactive ? '#b91c1c' : '#475569', transition: 'all 0.15s'
              }}
            >
              <span style={{
                position: 'relative', width: '26px', height: '15px', borderRadius: '999px', flexShrink: 0,
                background: showInactive ? '#ef4444' : '#cbd5e1', transition: 'background 0.15s'
              }}>
                <span style={{
                  position: 'absolute', top: '1.5px', left: showInactive ? '12px' : '2px', width: '12px', height: '12px',
                  borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left 0.15s'
                }} />
              </span>
              Nonaktif
              {inactiveCount > 0 && (
                <span style={{ background: showInactive ? '#ef4444' : '#94a3b8', color: '#fff', borderRadius: '999px', padding: '0 5px', fontSize: '10px' }}>{inactiveCount}</span>
              )}
            </button>

            {/* Search Input */}
            <div className="r-full-mobile" style={{ position: 'relative', width: '220px' }}>
              <Search size={14} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
              <input
                type="text"
                placeholder="Cari barcode, SKU, nama..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bo-input"
                style={{ paddingLeft: '28px', paddingRight: searchQuery ? '28px' : '8px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', height: '32px', fontSize: '12px', borderRadius: '7px' }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 0
                  }}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Camera Scan Button */}
            <button
              type="button"
              onClick={() => setCameraScannerOpen(true)}
              title="Scan Barcode Kamera"
              style={{
                width: '32px', height: '32px', borderRadius: '7px', border: '1px solid #e2e8f0',
                background: '#ffffff', color: '#475569', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer'
              }}
            >
              <Camera size={15} />
            </button>
          </div>
        </div>

        {/* Filter Kategori Bar (Clean horizontal scroll, fixed flex) */}
        <div className="categories-bar" style={{ flex: '0 0 auto', width: '100%', borderBottom: '1px solid #f1f5f9', background: '#fafbfc', padding: '6px 12px', gap: '5px' }}>
          <button
            className={`cat-btn ${currentCategory === 'all' ? 'active' : ''}`}
            onClick={() => setActiveCategory('all')}
            style={{ fontSize: '11.5px', padding: '4px 10px', borderRadius: '7px' }}
          >
            <LayoutGrid size={13} /> SEMUA
            <span style={{ opacity: 0.75, fontSize: '10.5px', background: currentCategory === 'all' ? 'rgba(255,255,255,0.25)' : '#e2e8f0', padding: '1px 5px', borderRadius: '999px', marginLeft: '3px' }}>
              {allDisplayProducts.length}
            </span>
          </button>
          {displayCategories.map(cat => {
            const count = allDisplayProducts.filter(p => p.category && p.category.toLowerCase() === cat.toLowerCase()).length;
            const isActive = currentCategory.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                className={`cat-btn ${isActive ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat)}
                style={{ fontSize: '11.5px', padding: '4px 10px', borderRadius: '7px' }}
              >
                <Package size={13} /> {cat.toUpperCase()}
                <span style={{ opacity: 0.85, fontSize: '10.5px', background: isActive ? 'rgba(255,255,255,0.25)' : '#e2e8f0', padding: '1px 5px', borderRadius: '999px', marginLeft: '3px' }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* =====================================================================
            MAIN CONTENT: DESKTOP TABLE VIEW vs MOBILE NATIVE CARDS
            ===================================================================== */}
        {!isMobileScreen ? (
          /* ===================================================================
             DESKTOP VIEW: CLEAN ERP DATA TABLE
             =================================================================== */
          <div
            className="desktop-table-view"
            style={{
              width: '100%',
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div style={{ flex: 1, overflow: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  minWidth: '1240px',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  display: 'table',
                  tableLayout: 'auto'
                }}
              >
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', verticalAlign: 'middle', minWidth: '260px' }}>NAMA PRODUK & SPESIFIKASI</th>
                    <th style={{ padding: '10px 12px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '110px', verticalAlign: 'middle' }}>KATEGORI</th>
                    <th style={{ padding: '10px 12px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '140px', verticalAlign: 'middle' }}>STOK FISIK & DUS</th>
                    <th style={{ padding: '10px 12px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '135px', verticalAlign: 'middle' }}>HARGA BELI</th>
                    <th style={{ padding: '10px 12px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '120px', verticalAlign: 'middle' }}>HARGA ECER</th>
                    <th style={{ padding: '10px 12px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '130px', verticalAlign: 'middle' }}>HARGA DUS</th>
                    <th style={{ padding: '10px 12px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'right', width: '130px', verticalAlign: 'middle' }}>HARGA MENENGAH</th>
                    <th style={{ padding: '10px 12px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '125px', verticalAlign: 'middle' }}>PROFIT MARGIN</th>
                    <th style={{ padding: '10px 12px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '145px', verticalAlign: 'middle' }}>AKSI</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '64px 20px', color: '#64748b', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                          <PackageCheck size={42} style={{ opacity: 0.25, color: 'var(--primary)' }} />
                          <div style={{ fontSize: '14.5px', fontWeight: 700, color: '#1e293b' }}>Tidak ada produk ditemukan</div>
                          <div style={{ fontSize: '12.5px', color: '#9ca3af' }}>Coba ubah kata kunci pencarian atau bersihkan filter yang aktif</div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredProducts.map((p, idx) => {
                      const cost = Number(p.purchasePrice) || 0;
                      const sell = Number(p.sellingPrice) || 0;
                      const profit = sell - cost;
                      const marginPercent = sell > 0 ? (profit / sell) * 100 : 0;
                      let marginColor = '#10b981';
                      let marginBg = '#dcfce7';
                      if (marginPercent < 0) {
                        marginColor = '#ef4444';
                        marginBg = '#fee2e2';
                      } else if (marginPercent < 15) {
                        marginColor = '#d97706';
                        marginBg = '#fef3c7';
                      }
                      const barFill = Math.min(Math.max((marginPercent / 50) * 100, 0), 100) + '%';
                      const stockVal = Number(p.stock) || 0;
                      const minVal = p.minStock !== undefined && p.minStock !== null ? Number(p.minStock) : 5;
                      const unit = p.unit || 'Pcs';
                      const boxCap = Number(p.boxCapacity) || 1;
                      const midCap = Number(p.midCapacity) || 0;
                      const midUnit = (p.midUnitName || '').trim();

                      // Multi-tier Barcodes
                      const dusBarcode = p.boxBarcode || p.barcode || (p.id !== p.barcode ? p.barcode : '');
                      const retailBarcode = p.retailBarcode || '';
                      const midBarcode = p.midBarcode || '';

                      // Mid-tier active condition (hanya aktif bila disetel kapasitas, satuan, dan harga/barcode)
                      const hasMid = Boolean(
                        midCap > 1 && midUnit && (Number(p.midPrice) > 0 || (midBarcode && midBarcode !== dusBarcode && midBarcode !== retailBarcode))
                      );

                      // Box Conversion for Stock
                      const fullBoxes = boxCap > 1 ? Math.floor(stockVal / boxCap) : 0;
                      const remainderPcs = boxCap > 1 ? (stockVal % boxCap) : 0;

                      // Box & Mid Pricing
                      const isBoxActive = boxCap > 1;
                      const boxCost = cost * boxCap;
                      const boxPriceVal = isBoxActive 
                        ? (Number(p.boxPrice) > 0 ? Number(p.boxPrice) : (Number(p.wholesalePrice) > 0 ? Number(p.wholesalePrice) : sell * boxCap))
                        : 0;
                      const midPriceVal = hasMid ? Number(p.midPrice) || 0 : 0;

                      return (
                        <tr
                          key={p.id}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: idx % 2 === 1 ? '#fafbfc' : '#ffffff',
                            transition: 'background-color 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
                          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = idx % 2 === 1 ? '#fafbfc' : '#ffffff')}
                        >
                          {/* 1. NAMA PRODUK & SPESIFIKASI (termasuk SKU & Barcode Kemasan) */}
                          <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {/* Nama Produk + Status Badge */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.2px' }}>
                                  {p.name}
                                </span>
                                {p.isPending && (
                                  <span
                                    style={{
                                      fontSize: '9.5px',
                                      fontWeight: 800,
                                      backgroundColor: '#fef3c7',
                                      color: '#b45309',
                                      border: '1px solid #fde68a',
                                      padding: '1px 5px',
                                      borderRadius: '999px',
                                      letterSpacing: '0.3px'
                                    }}
                                  >
                                    DRAF
                                  </span>
                                )}
                                {p.isActive === false && (
                                  <span
                                    title="Tidak tampil di Kasir POS"
                                    style={{ fontSize: '9.5px', fontWeight: 800, backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', padding: '1px 5px', borderRadius: '999px', letterSpacing: '0.3px' }}
                                  >
                                    NONAKTIF
                                  </span>
                                )}
                              </div>

                              {/* SKU & Barcode Kemasan Chips (Click to copy) */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                {p.sku && (
                                  <span
                                    title={`SKU: ${p.sku}`}
                                    style={{
                                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                      fontSize: '10px',
                                      fontWeight: 700,
                                      color: '#475569',
                                      background: '#f1f5f9',
                                      padding: '1px 5px',
                                      borderRadius: '4px',
                                      border: '1px solid #e2e8f0',
                                      letterSpacing: '0.2px'
                                    }}
                                  >
                                    {p.sku}
                                  </span>
                                )}

                                {dusBarcode && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#fffbeb', border: '1px solid #fde68a', padding: '1px 5px', borderRadius: '4px' }}>
                                    <span style={{ fontSize: '8.5px', fontWeight: 800, color: '#92400e', background: '#fef3c7', padding: '0 2px', borderRadius: '2px' }}>
                                      {boxCap > 1 ? 'DUS' : 'BC'}
                                    </span>
                                    <span
                                      title={`Barcode: ${dusBarcode}`}
                                      style={{
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        fontSize: '10px',
                                        fontWeight: 700,
                                        color: '#78350f',
                                        maxWidth: '90px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {dusBarcode}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => copyBarcode(dusBarcode)}
                                      title="Salin Barcode"
                                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', color: copiedBarcode === dusBarcode ? '#10b981' : '#b45309' }}
                                    >
                                      {copiedBarcode === dusBarcode ? <Check size={9} /> : <Copy size={9} />}
                                    </button>
                                  </div>
                                )}

                                {hasMid && midBarcode && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f0f9ff', border: '1px solid #bae6fd', padding: '1px 5px', borderRadius: '4px' }}>
                                    <span style={{ fontSize: '8.5px', fontWeight: 800, color: '#0369a1', background: '#e0f2fe', padding: '0 2px', borderRadius: '2px' }}>
                                      {midUnit.toUpperCase()}
                                    </span>
                                    <span
                                      title={`Barcode ${midUnit}: ${midBarcode}`}
                                      style={{
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        color: '#0369a1',
                                        maxWidth: '85px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {midBarcode}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => copyBarcode(midBarcode)}
                                      title={`Salin Barcode ${midUnit}`}
                                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', color: copiedBarcode === midBarcode ? '#10b981' : '#0284c7' }}
                                    >
                                      {copiedBarcode === midBarcode ? <Check size={9} /> : <Copy size={9} />}
                                    </button>
                                  </div>
                                )}

                                {retailBarcode && retailBarcode !== dusBarcode && (
                                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: '#f8fafc', border: '1px solid #e2e8f0', padding: '1px 5px', borderRadius: '4px' }}>
                                    <span style={{ fontSize: '8.5px', fontWeight: 800, color: '#475569', background: '#e2e8f0', padding: '0 2px', borderRadius: '2px' }}>
                                      ECER
                                    </span>
                                    <span
                                      title={`Barcode Eceran: ${retailBarcode}`}
                                      style={{
                                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                                        fontSize: '10px',
                                        fontWeight: 600,
                                        color: '#334155',
                                        maxWidth: '85px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      {retailBarcode}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => copyBarcode(retailBarcode)}
                                      title="Salin Barcode Eceran"
                                      style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', display: 'inline-flex', color: copiedBarcode === retailBarcode ? '#10b981' : '#94a3b8' }}
                                    >
                                      {copiedBarcode === retailBarcode ? <Check size={9} /> : <Copy size={9} />}
                                    </button>
                                  </div>
                                )}
                              </div>

                              {/* Packaging Specification Badges */}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', marginTop: '1px' }}>
                                {boxCap > 1 && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9.5px', fontWeight: 700, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '1px 5px', borderRadius: '4px' }}>
                                    📦 1 Dus = {boxCap} {unit}
                                  </span>
                                )}
                                {hasMid && (
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9.5px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '1px 5px', borderRadius: '4px' }}>
                                    🗂️ 1 {midUnit} = {midCap} {unit}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* 2. KATEGORI */}
                          <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '5px',
                                fontSize: '11px',
                                fontWeight: 600,
                                background: '#f1f5f9',
                                color: '#475569',
                                maxWidth: '110px',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}
                            >
                              {p.category || 'Umum'}
                            </span>
                          </td>

                          {/* 3. STOK FISIK & DUS */}
                          <td style={{ padding: '8px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                              <div style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                fontSize: '11.5px',
                                fontWeight: 800,
                                background: stockVal <= 0 ? '#fee2e2' : stockVal <= minVal ? '#fef3c7' : '#ecfdf5',
                                color: stockVal <= 0 ? '#b91c1c' : stockVal <= minVal ? '#b45309' : '#047857'
                              }}>
                                <span>{stockVal.toLocaleString('id-ID')}</span>
                                <span style={{ fontSize: '10px', fontWeight: 600, opacity: 0.85 }}>{unit}</span>
                              </div>
                              {boxCap > 1 && (
                                <span style={{ fontSize: '10px', fontWeight: 700, color: stockVal <= 0 ? '#dc2626' : '#64748b' }}>
                                  {fullBoxes > 0 ? (
                                    <>📦 {fullBoxes} Dus {remainderPcs > 0 ? `+ ${remainderPcs} ${unit}` : '(Pas)'}</>
                                  ) : stockVal > 0 ? (
                                    <>&lt; 1 Dus ({stockVal} {unit})</>
                                  ) : (
                                    <>0 Dus</>
                                  )}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 4. HARGA BELI (Distributor Karton / Eceran) */}
                          <td style={{ padding: '8px 12px', verticalAlign: 'middle', textAlign: 'right' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                              {boxCap > 1 ? (
                                <>
                                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#0f172a' }}>
                                    {formatIDR(boxCost)}
                                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#92400e' }}> /Dus</span>
                                  </span>
                                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#64748b' }}>
                                    ({formatIDR(cost)} /{unit})
                                  </span>
                                  {hasMid && (
                                    <span style={{ fontSize: '9px', fontWeight: 500, color: '#0284c7' }}>
                                      Modal {midUnit}: {formatIDR(cost * midCap)}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155' }}>
                                    {formatIDR(cost)}
                                  </span>
                                  <span style={{ fontSize: '10px', fontWeight: 500, color: '#94a3b8' }}>
                                    /{unit}
                                  </span>
                                </>
                              )}
                            </div>
                          </td>

                          {/* 5. HARGA ECER */}
                          <td style={{ padding: '8px 12px', verticalAlign: 'middle', textAlign: 'right' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                              <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#16a34a' }}>
                                {formatIDR(sell)}
                              </span>
                              <span style={{ fontSize: '10px', fontWeight: 600, color: '#15803d' }}>
                                per {unit}
                              </span>
                            </div>
                          </td>

                          {/* 6. HARGA DUS (Hanya tampil jika boxCap > 1) */}
                          <td style={{ padding: '8px 12px', verticalAlign: 'middle', textAlign: 'right' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                              {boxCap > 1 && boxPriceVal > 0 ? (
                                <>
                                  <span style={{ fontSize: '12.5px', fontWeight: 800, color: '#b45309' }}>
                                    {formatIDR(boxPriceVal)}
                                  </span>
                                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#d97706' }}>
                                    isi {boxCap} {unit}
                                  </span>
                                </>
                              ) : (
                                <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>-</span>
                              )}
                            </div>
                          </td>

                          {/* 7. HARGA MENENGAH */}
                          <td style={{ padding: '8px 12px', verticalAlign: 'middle', textAlign: 'right' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '1px' }}>
                              {hasMid && midPriceVal > 0 ? (
                                <>
                                  <span style={{ fontSize: '12px', fontWeight: 800, color: '#0284c7' }}>
                                    {formatIDR(midPriceVal)}
                                  </span>
                                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#0369a1' }}>
                                    /{midUnit} ({midCap} {unit})
                                  </span>
                                </>
                              ) : (
                                <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 700 }}>-</span>
                              )}
                            </div>
                          </td>

                          {/* 8. PROFIT MARGIN */}
                          <td style={{ padding: '8px 12px', verticalAlign: 'middle' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                              <span
                                style={{
                                  fontSize: '10.5px',
                                  fontWeight: 800,
                                  color: marginColor,
                                  background: marginBg,
                                  padding: '1px 7px',
                                  borderRadius: '999px',
                                  lineHeight: '1.4'
                                }}
                              >
                                {marginPercent > 0 ? '+' : ''}{marginPercent.toFixed(1)}%
                              </span>
                              <span style={{ fontSize: '9.5px', fontWeight: 600, color: profit >= 0 ? '#15803d' : '#b91c1c' }}>
                                {profit >= 0 ? '+' : ''}{formatIDR(profit)}/{unit}
                              </span>
                              {boxCap > 1 && boxPriceVal > 0 && (
                                <span style={{ fontSize: '9px', fontWeight: 600, color: (boxPriceVal - boxCost) >= 0 ? '#b45309' : '#b91c1c' }}>
                                  {(boxPriceVal - boxCost) >= 0 ? '+' : ''}{formatIDR(boxPriceVal - boxCost)}/Dus
                                </span>
                              )}
                              <div style={{ width: '56px', height: '3.5px', backgroundColor: '#e2e8f0', borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
                                <div style={{ width: barFill, height: '100%', backgroundColor: marginColor, borderRadius: '2px' }} />
                              </div>
                            </div>
                          </td>

                          {/* Aksi */}
                          <td style={{ padding: '8px 12px', verticalAlign: 'middle', textAlign: 'center' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
                              {p.isPending ? (
                                <>
                                  <button
                                    type="button"
                                    title="Cetak Label Barcode"
                                    onClick={() => { setLabelCopies(Math.max(1, Math.ceil(Number(p.stock)))); setLabelProduct(p); }}
                                    style={{
                                      width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #bfdbfe',
                                      background: '#eff6ff', color: '#2563eb', display: 'inline-flex', alignItems: 'center',
                                      justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                  >
                                    <Printer size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Batal Tambah (Hapus Draf)"
                                    onClick={() => {
                                      const nextItems = draftItems.filter(si => si.id !== p.id);
                                      const newDraft = [{ grNumber: 'GLOBAL-DRAFT', savedAt: new Date().toISOString(), draftId: 'DRAFT-GLOBAL', items: nextItems }];
                                      saveDrafts(newDraft);
                                    }}
                                    style={{
                                      width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #fecaca',
                                      background: '#fef2f2', color: '#ef4444', display: 'inline-flex', alignItems: 'center',
                                      justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    title="Restock / Barang Masuk"
                                    onClick={() => openRestockModal(p)}
                                    style={{
                                      width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #bbf7d0',
                                      background: '#f0fdf4', color: '#10b981', display: 'inline-flex', alignItems: 'center',
                                      justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                  >
                                    <ArrowDownToLine size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Cetak Label Barcode"
                                    onClick={() => { setLabelCopies(1); setLabelProduct(p); }}
                                    style={{
                                      width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #bfdbfe',
                                      background: '#eff6ff', color: '#2563eb', display: 'inline-flex', alignItems: 'center',
                                      justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                  >
                                    <Printer size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    title="Edit Master Data"
                                    onClick={() => handleEditClick(p)}
                                    style={{
                                      width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #e2e8f0',
                                      background: '#f8fafc', color: '#475569', display: 'inline-flex', alignItems: 'center',
                                      justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                  >
                                    <Edit2 size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    title={p.isActive === false ? 'Aktifkan kembali di Kasir POS' : 'Nonaktifkan (sembunyikan dari Kasir POS)'}
                                    onClick={() => handleToggleActive(p)}
                                    style={{
                                      width: '28px', height: '28px', borderRadius: '6px',
                                      border: p.isActive === false ? '1px solid #bbf7d0' : '1px solid #fde68a',
                                      background: p.isActive === false ? '#f0fdf4' : '#fffbeb',
                                      color: p.isActive === false ? '#16a34a' : '#d97706',
                                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                  >
                                    {p.isActive === false ? <Eye size={13} /> : <EyeOff size={13} />}
                                  </button>
                                  <button
                                    type="button"
                                    title="Hapus Produk"
                                    onClick={() => handleDeleteProduct(p)}
                                    style={{
                                      width: '28px', height: '28px', borderRadius: '6px', border: '1px solid #fecaca',
                                      background: '#fef2f2', color: '#ef4444', display: 'inline-flex', alignItems: 'center',
                                      justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s'
                                    }}
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer Summary Bar */}
            <div style={{
              padding: '10px 14px', background: '#f8fafc', borderTop: '1px solid #e2e8f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
              fontSize: '12px', color: '#64748b', flexShrink: 0
            }}>
              <div>
                Menampilkan <strong>{filteredProducts.length}</strong> dari <strong>{products.length}</strong> produk
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                <span>Total Fisik: <strong style={{ color: '#0f172a' }}>{filteredStats.totalUnits.toLocaleString('id-ID')} unit</strong></span>
                <span>Nilai Modal: <strong style={{ color: '#0f172a' }}>{formatIDR(filteredStats.totalCost)}</strong></span>
                <span>Potensi Omzet: <strong style={{ color: '#16a34a' }}>{formatIDR(filteredStats.totalRetail)}</strong></span>
              </div>
            </div>
          </div>
        ) : (
          /* ===================================================================
             MOBILE CARD LIST (KHUSUS IOS & ANDROID)
             =================================================================== */
          <div className="mobile-cards-view stock-mobile-list" style={{ overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 16px', background: 'white', borderRadius: '16px', border: '0.5px solid rgba(60,60,67,0.12)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <PackageCheck size={42} style={{ opacity: 0.35, color: 'var(--primary)' }} />
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#1f2937' }}>Belum ada rincian barang diterima</div>
                <div style={{ fontSize: '13px', color: '#9ca3af' }}>Tekan tombol Tambah di atas untuk memasukkan barang atau simpan draf</div>
              </div>
            </div>
          ) : (
            filteredProducts.map(p => {
              const cost = Number(p.purchasePrice) || 0;
              const sell = Number(p.sellingPrice) || 0;
              const profit = sell - cost;
              const marginPercent = sell > 0 ? ((profit / sell) * 100).toFixed(1) : '0';
              const stockVal = Number(p.stock) || 0;
              const unit = p.unit || 'Pcs';
              const boxCap = Number(p.boxCapacity) || 1;
              const midCap = Number(p.midCapacity) || 0;
              const midUnit = (p.midUnitName || '').trim();

              const dusBarcode = p.boxBarcode || p.barcode || (p.id !== p.barcode ? p.barcode : '');
              const retailBarcode = p.retailBarcode || '';
              const midBarcode = p.midBarcode || '';

              // Mid-tier active condition
              const hasMid = Boolean(
                midCap > 1 && midUnit && (Number(p.midPrice) > 0 || (midBarcode && midBarcode !== dusBarcode && midBarcode !== retailBarcode))
              );

              const fullBoxes = boxCap > 1 ? Math.floor(stockVal / boxCap) : 0;
              const remainderPcs = boxCap > 1 ? (stockVal % boxCap) : 0;

              const isBoxActive = boxCap > 1;
              const boxCost = cost * boxCap;
              const boxPriceVal = isBoxActive 
                ? (Number(p.boxPrice) > 0 ? Number(p.boxPrice) : (Number(p.wholesalePrice) > 0 ? Number(p.wholesalePrice) : sell * boxCap))
                : 0;
              const midPriceVal = hasMid ? Number(p.midPrice) || 0 : 0;

              return (
                <div key={p.id} className="mobile-stock-card">
                  {/* Card Header: Avatar + Product Name + Badges */}
                  <div className="mobile-card-head">
                    <div className="mobile-card-avatar stock-avatar">
                      <Package size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="mobile-card-title">{p.name}</div>
                      <div className="mobile-card-id" style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginTop: '2px' }}>
                        <span>SKU: {p.sku || '-'}</span>
                        {dusBarcode && (
                          <span style={{ fontFamily: 'monospace', background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a', padding: '0 4px', borderRadius: '4px', fontSize: '10px' }}>
                            [{boxCap > 1 ? 'DUS' : 'BC'}] {dusBarcode}
                          </span>
                        )}
                        {retailBarcode && retailBarcode !== dusBarcode && (
                          <span style={{ fontFamily: 'monospace', background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0', padding: '0 4px', borderRadius: '4px', fontSize: '10px' }}>
                            [ECER] {retailBarcode}
                          </span>
                        )}
                        {hasMid && midBarcode && (
                          <span style={{ fontFamily: 'monospace', background: '#f0f9ff', color: '#0369a1', border: '1px solid #bae6fd', padding: '0 4px', borderRadius: '4px', fontSize: '10px' }}>
                            [{midUnit.toUpperCase()}] {midBarcode}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {boxCap > 1 && (
                          <span style={{ fontSize: '10px', fontWeight: 600, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '1px 5px', borderRadius: '4px' }}>
                            📦 1 Dus = {boxCap} {unit}
                          </span>
                        )}
                        {hasMid && (
                          <span style={{ fontSize: '10px', fontWeight: 600, color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '1px 5px', borderRadius: '4px' }}>
                            🗂️ 1 {midUnit} = {midCap} {unit}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                      <span className="mobile-badge mobile-badge-cat">{p.category}</span>
                      {p.isPending && (
                        <span className="mobile-badge mobile-badge-draft">DRAF</span>
                      )}
                      {p.isActive === false && (
                        <span className="mobile-badge" style={{ background: '#fee2e2', color: '#b91c1c' }}>NONAKTIF</span>
                      )}
                    </div>
                  </div>

                  {/* Stock & Pricing 3-Column Grid */}
                  <div className="mobile-stock-grid">
                    <div className="mobile-stock-stat">
                      <span className="mobile-stock-stat-label">STOK FISIK</span>
                      <span className="mobile-stock-stat-val">{stockVal.toLocaleString('id-ID')} <span style={{ fontSize: '11px', color: '#64748b' }}>{unit}</span></span>
                      {boxCap > 1 && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#64748b', marginTop: '2px' }}>
                          {fullBoxes > 0 ? `${fullBoxes} Dus ${remainderPcs > 0 ? `+ ${remainderPcs}` : ''}` : `< 1 Dus`}
                        </span>
                      )}
                    </div>
                    <div className="mobile-stock-stat">
                      <span className="mobile-stock-stat-label">HARGA BELI</span>
                      {boxCap > 1 ? (
                        <>
                          <span className="mobile-stock-stat-val" style={{ color: '#0f172a', fontWeight: 800 }}>{formatIDR(boxCost)}/Dus</span>
                          <span style={{ fontSize: '10px', color: '#64748b', marginTop: '1px' }}>({formatIDR(cost)}/{unit})</span>
                        </>
                      ) : (
                        <span className="mobile-stock-stat-val" style={{ color: '#64748b' }}>{formatIDR(cost)}/{unit}</span>
                      )}
                    </div>
                    <div className="mobile-stock-stat">
                      <span className="mobile-stock-stat-label">HARGA ECER</span>
                      <span className="mobile-stock-stat-val text-green">{formatIDR(sell)}</span>
                      <span style={{ fontSize: '10px', color: '#16a34a', marginTop: '1px' }}>per {unit}</span>
                    </div>
                    <div className="mobile-stock-extra" style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', fontSize: '11.5px', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={{ color: '#92400e' }}>
                          Dus: <strong>{boxCap > 1 && boxPriceVal > 0 ? formatIDR(boxPriceVal) : '-'}</strong>
                        </span>
                        {hasMid && midPriceVal > 0 && (
                          <span style={{ color: '#0369a1' }}>
                            {midUnit}: <strong>{formatIDR(midPriceVal)}</strong>
                          </span>
                        )}
                        <span style={{ 
                          fontWeight: 700, 
                          color: profit > 0 ? '#15803d' : '#b91c1c',
                          background: profit > 0 ? '#dcfce7' : '#fee2e2',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          fontSize: '11px'
                        }}>
                          Margin: {profit > 0 ? '+' : ''}{marginPercent}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="mobile-card-actions">
                    {p.isPending ? (
                      <>
                        <button className="mobile-action-primary" onClick={() => { setLabelCopies(Math.max(1, Math.ceil(Number(p.stock)))); setLabelProduct(p); }}>
                          <Printer size={15} />
                          <span>Cetak Label Barcode</span>
                        </button>
                        <button 
                          className="mobile-action-icon text-red"
                          onClick={() => {
                            const nextItems = draftItems.filter(si => si.id !== p.id);
                            const newDraft = [{ grNumber: 'GLOBAL-DRAFT', savedAt: new Date().toISOString(), draftId: 'DRAFT-GLOBAL', items: nextItems }];
                            saveDrafts(newDraft);
                          }}
                          title="Hapus Draf"
                        >
                          <Trash2 size={16} />
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="mobile-action-primary" style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#059669' }} onClick={() => openRestockModal(p)}>
                          <ArrowDownToLine size={15} />
                          <span>Restock</span>
                        </button>
                        <button className="mobile-action-icon" onClick={() => { setLabelCopies(1); setLabelProduct(p); }} title="Cetak Barcode">
                          <Printer size={16} color="#2563eb" />
                        </button>
                        <button className="mobile-action-icon" onClick={() => handleEditClick(p)} title="Edit">
                          <Edit2 size={16} />
                        </button>
                        <button className="mobile-action-icon" onClick={() => handleToggleActive(p)} title={p.isActive === false ? 'Aktifkan di Kasir' : 'Nonaktifkan dari Kasir'}>
                          {p.isActive === false ? <Eye size={16} color="#16a34a" /> : <EyeOff size={16} color="#d97706" />}
                        </button>
                        <button className="mobile-action-icon text-red" onClick={() => handleDeleteProduct(p)} title="Hapus">
                          <Trash2 size={16} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
      </div>


      {/* Restock Modal */}
      {restockProduct && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}><ArrowDownToLine size={20} color="#10b981" /> Barang Masuk / Restock</h3>
              <button onClick={() => setRestockProduct(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#6b7280" /></button>
            </div>
            
            <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#0f172a' }}>{restockProduct.name}</div>
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '3px' }}>
                Stok Saat Ini: <strong>{Number(restockProduct.stock || 0).toLocaleString('id-ID')} {restockProduct.unit}</strong>
                {restockBoxCap > 1 && (
                  <span style={{ color: '#64748b' }}>
                    {' '}({Math.floor(Number(restockProduct.stock || 0) / restockBoxCap)} Dus {Number(restockProduct.stock || 0) % restockBoxCap > 0 ? `+ ${Number(restockProduct.stock || 0) % restockBoxCap} ${restockProduct.unit}` : '(Pas)'})
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                Modal Lama: <strong>Rp {Number(restockProduct.purchasePrice || 0).toLocaleString('id-ID')} / {restockProduct.unit}</strong>
                {restockBoxCap > 1 && (
                  <span style={{ color: '#94a3b8' }}> (Rp {(Number(restockProduct.purchasePrice || 0) * restockBoxCap).toLocaleString('id-ID')} / Dus)</span>
                )}
              </div>
            </div>

            <form onSubmit={handleRestockSubmit}>
              {restockHasVariants ? (
                <div style={{ marginBottom: '12px' }}>
                  <label className="bo-label">JUMLAH TAMBAHAN PER VARIAN (IN)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                    {(restockProduct.variants as any[]).map((v, i) => (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 10px', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 700, fontSize: '13px' }}>{v.name}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>Stok saat ini: {v.stock}</div>
                        </div>
                        <input
                          type="number"
                          step="any"
                          className="bo-input"
                          style={{ width: '90px', textAlign: 'center' }}
                          placeholder="+ Qty"
                          value={restockVarQty[v.id] ?? ''}
                          onChange={(e) => setRestockVarQty(prev => ({ ...prev, [v.id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                          autoFocus={i === 0}
                        />
                      </div>
                    ))}
                  </div>
                  <VariantEditor
                    variants={restockNewVariants}
                    onChange={setRestockNewVariants}
                    title="Varian Baru (opsional)"
                    qtyLabel="Masuk"
                  />
                  <div style={{ marginTop: '8px', fontSize: '12px', fontWeight: 700, color: '#065f46' }}>Total masuk: {restockAddedQty} {restockProduct.unit}</div>
                </div>
              ) : restockBoxCap > 1 ? (
                <div style={{ marginBottom: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '8px' }}>
                    <div>
                      <label className="bo-label" style={{ fontSize: '11px' }}>DUS MASUK (BOX)</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className="bo-input"
                        placeholder="0 Dus"
                        value={restockBoxQty}
                        onChange={(e) => setRestockBoxQty(e.target.value)}
                        autoFocus
                      />
                      <div style={{ fontSize: '10.5px', color: '#92400e', marginTop: '3px', fontWeight: 600 }}>
                        1 Dus = {restockBoxCap} {restockProduct.unit}
                      </div>
                    </div>
                    <div>
                      <label className="bo-label" style={{ fontSize: '11px' }}>SATUAN / ECERAN MASUK</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        className="bo-input"
                        placeholder={`0 ${restockProduct.unit}`}
                        value={restockQty}
                        onChange={(e) => setRestockQty(e.target.value)}
                      />
                      <div style={{ fontSize: '10.5px', color: '#64748b', marginTop: '3px' }}>
                        Eceran satuan
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: '6px 10px', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', fontSize: '12px', fontWeight: 700, color: '#047857', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Total Barang Masuk:</span>
                    <span>{restockAddedQty} {restockProduct.unit} {restockUnitsFromBoxes > 0 ? `(${restockBoxQty} Dus${restockUnitsFromLoose > 0 ? ` + ${restockQty} ${restockProduct.unit}` : ''})` : ''}</span>
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '12px' }}>
                  <label className="bo-label">JUMLAH TAMBAHAN (IN)</label>
                  <input 
                    type="number" 
                    step="any"
                    className="bo-input" 
                    value={restockQty} 
                    onChange={(e) => setRestockQty(e.target.value)} 
                    required 
                    autoFocus
                  />
                </div>
              )}

              {restockBoxCap > 1 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                  <div>
                    <label className="bo-label" style={{ fontSize: '11px' }}>MODAL / DUS (RP)</label>
                    <input
                      type="number"
                      className="bo-input"
                      value={restockBoxPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRestockBoxPrice(val);
                        const num = Number(val);
                        if (!isNaN(num) && restockBoxCap > 0) {
                          setRestockPrice(Math.round(num / restockBoxCap));
                        }
                      }}
                      placeholder="Rp /Dus"
                    />
                  </div>
                  <div>
                    <label className="bo-label" style={{ fontSize: '11px' }}>MODAL / {restockProduct.unit.toUpperCase()} (RP)</label>
                    <input
                      type="number"
                      className="bo-input"
                      value={restockPrice}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRestockPrice(val);
                        const num = Number(val);
                        if (!isNaN(num)) {
                          setRestockBoxPrice(Math.round(num * restockBoxCap));
                        }
                      }}
                      required
                    />
                  </div>
                </div>
              ) : (
                <div style={{ marginBottom: '16px' }}>
                  <label className="bo-label">HARGA BELI BARU (MODAL / {restockProduct.unit ? restockProduct.unit.toUpperCase() : 'PCS'})</label>
                  <input 
                    type="number" 
                    className="bo-input" 
                    value={restockPrice} 
                    onChange={(e) => setRestockPrice(e.target.value)} 
                    required 
                  />
                  <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px', lineHeight: 1.4 }}>
                    Sistem menggunakan <strong>Rata-rata Bergerak (Moving Average)</strong>.
                  </div>
                </div>
              )}

                {restockAddedQty > 0 && Number(restockPrice) > 0 && (() => {
                  const oldStock = Number(restockProduct.stock) || 0;
                  const oldPrice = Number(restockProduct.purchasePrice) || 0;
                  const addedQty = restockAddedQty;
                  const addedPrice = Number(restockPrice);
                  const newTotalQty = oldStock + addedQty;
                  const newAvgPrice = Math.round(((oldStock * oldPrice) + (addedQty * addedPrice)) / newTotalQty);
                  
                  const sellingPrice = Number(restockProduct.sellingPrice) || 0;
                  const profit = sellingPrice - newAvgPrice;
                  const marginPercent = sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0;
                  
                  let marginColor = '#10b981'; // Green (Aman)
                  let marginStatus = 'Aman';
                  if (marginPercent < 0) {
                    marginColor = '#ef4444'; // Red (Rugi)
                    marginStatus = 'Rugi / Tidak Untung';
                  } else if (marginPercent < 15) {
                    marginColor = '#f59e0b'; // Yellow (Tipis)
                    marginStatus = 'Margin Tipis';
                  }
                  
                  // Visual bar max at 50% for display purposes (50% margin fills the bar)
                  const barFill = Math.min(Math.max((marginPercent / 50) * 100, 0), 100) + '%';

                  return (
                    <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontWeight: 'bold', fontSize: '12px', color: '#1e3a8a', marginBottom: '8px' }}>Preview Kalkulasi Modal Baru:</div>
                      <div style={{ fontSize: '12px', color: '#1e40af', display: 'flex', flexDirection: 'column', gap: '4px', fontFamily: 'monospace' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Lama: {oldStock} x Rp {oldPrice.toLocaleString('id-ID')}</span>
                          <span>Rp {(oldStock * oldPrice).toLocaleString('id-ID')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Baru: {addedQty} x Rp {addedPrice.toLocaleString('id-ID')}</span>
                          <span>Rp {(addedQty * addedPrice).toLocaleString('id-ID')}</span>
                        </div>
                        <div style={{ height: '1px', background: '#93c5fd', margin: '4px 0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                          <span>Total: {newTotalQty} {restockProduct.unit}</span>
                          <span>Rp {((oldStock * oldPrice) + (addedQty * addedPrice)).toLocaleString('id-ID')}</span>
                        </div>
                      </div>
                      
                      <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #93c5fd', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#1e40af', marginBottom: '2px' }}>HPP / Modal Rata-rata Baru:</div>
                        <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1d4ed8' }}>
                          Rp {newAvgPrice.toLocaleString('id-ID')} / {restockProduct.unit}
                        </div>
                        {restockBoxCap > 1 && (
                          <div style={{ fontSize: '12px', color: '#1e40af', marginTop: '2px' }}>
                            (Rp {(newAvgPrice * restockBoxCap).toLocaleString('id-ID')} / Dus)
                          </div>
                        )}
                      </div>

                      {/* Margin Progress Bar */}
                      <div style={{ marginTop: '16px', backgroundColor: '#fff', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', fontWeight: 'bold' }}>
                          <span style={{ color: '#374151' }}>Estimasi Profit: <span style={{ color: marginColor }}>{marginStatus}</span></span>
                          <span style={{ color: marginColor }}>{marginPercent > 0 ? '+' : ''}{marginPercent.toFixed(1)}%</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: barFill, height: '100%', backgroundColor: marginColor, transition: 'width 0.3s ease, background-color 0.3s ease' }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px', fontSize: '11px', color: '#6b7280' }}>
                          <span>Harga Jual: Rp {sellingPrice.toLocaleString('id-ID')}</span>
                          <span>Untung: Rp {profit.toLocaleString('id-ID')}</span>
                        </div>
                      </div>

                    </div>
                  );
                })()}

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="bo-btn" onClick={() => setRestockProduct(null)}>Batal</button>
                <button type="submit" className="bo-btn bo-btn-primary" style={{ backgroundColor: '#10b981', borderColor: '#10b981' }}>
                  Simpan Stok
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {isCategoryModalOpen && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div className="modal-content" style={{ backgroundColor: 'white', borderRadius: '12px', padding: '24px', width: '400px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0 }}>Kelola Kategori</h3>
              <button onClick={() => setIsCategoryModalOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} color="#666" /></button>
            </div>
            
            <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '16px' }}>
              <table className="bo-table" style={{ width: '100%' }}>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat}>
                      <td>
                        {editingCategoryTarget === cat ? (
                          <input 
                            type="text" 
                            className="bo-input" 
                            value={editingCategoryName} 
                            onChange={(e) => setEditingCategoryName(e.target.value)}
                            autoFocus
                            style={{ padding: '4px 8px', fontSize: '14px' }}
                          />
                        ) : (
                          <span style={{ fontWeight: 'bold' }}>{cat}</span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right', width: '80px' }}>
                        {editingCategoryTarget === cat ? (
                          <button 
                            className="bo-action-btn"
                            onClick={() => {
                              if (editingCategoryName.trim()) {
                                editCategory(cat, editingCategoryName.trim());
                                // Update current category selection if edited category was selected
                                if (category === cat) setCategory(editingCategoryName.trim());
                              }
                              setEditingCategoryTarget('');
                            }}
                          >
                            <Save size={16} color="var(--primary)" />
                          </button>
                        ) : (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button 
                              className="bo-action-btn" 
                              onClick={() => { 
                                setEditingCategoryTarget(cat); 
                                setEditingCategoryName(cat); 
                              }}
                            >
                              <Edit2 size={16} />
                            </button>
                            <button 
                              className="bo-action-btn" 
                              style={{ color: '#ef4444' }}
                              onClick={() => {
                                if(window.confirm(`Hapus kategori ${cat}?`)) {
                                  deleteCategory(cat);
                                  if (category === cat) setCategory(categories[0] || ''); // Fallback
                                }
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <input 
                type="text" 
                value={newCategory} 
                onChange={(e) => setNewCategory(e.target.value)} 
                placeholder="Kategori Baru" 
                className="bo-input" 
                style={{ flex: 1 }}
              />
              <button 
                type="button" 
                onClick={() => { 
                  if(newCategory.trim()) { 
                    addCategory(newCategory.trim()); 
                    setNewCategory(''); 
                  } 
                }} 
                className="bo-btn bo-btn-primary" 
              >
                <Plus size={16} /> Tambah
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== DAFTAR DRAF TERSIMPAN (per item, dengan ceklist) ===== */}
      {showDraftModal && (() => {
        const selectable = draftItems.filter(i => i.pending);
        const allSelected = selectable.length > 0 && selectable.every(i => selectedIds.includes(i.id));
        return (
        <div className="r-modal-overlay" style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10001 }}>
          <div className="r-modal" style={{ backgroundColor: 'white', borderRadius: '14px', padding: '22px', width: '680px', maxWidth: '94%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FileText size={18} color="var(--primary)" /> Draf Tersimpan
                <span style={{ fontSize: '12px', color: '#6b7280', fontWeight: 500 }}>({draftItems.length} item)</span>
              </h3>
              <button onClick={() => setShowDraftModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                <X size={20} color="#6b7280" />
              </button>
            </div>

            {/* Bar pilih / aksi */}
            {selectable.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '8px 12px', background: selectedIds.length > 0 ? '#fff1f0' : '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => setSelectedIds(allSelected ? [] : selectable.map(i => i.id))}
                  />
                  {selectedIds.length > 0 ? `${selectedIds.length} item dipilih` : 'Pilih semua'}
                </label>
                {selectedIds.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="bo-btn bo-btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={() => setSelectedIds([])}>Batal pilih</button>
                    <button className="bo-btn bo-btn-primary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={openReviewSelected}>
                      Lanjutkan ({selectedIds.length})
                    </button>
                  </div>
                )}
              </div>
            )}

            <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {draftItems.length === 0 && (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '30px 0', fontSize: '14px' }}>
                  Belum ada draf. Tambahkan produk lewat "Tambah Produk Baru".
                </div>
              )}
              {draftItems.map(item => {
                const checked = selectedIds.includes(item.id);
                return (
                  <div key={item.draftId + ':' + item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid ' + (checked ? 'var(--primary)' : '#e5e7eb'), borderRadius: '10px', padding: '10px 12px', background: checked ? '#fff7f6' : 'white' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!item.pending}
                      title={item.pending ? 'Pilih item' : 'Item lama: sudah masuk stok'}
                      onChange={() => toggleSelect(item.id)}
                    />
                    <div style={{ width: '44px', height: '44px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.image
                        ? <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                        : <Package size={20} color="#9ca3af" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 800, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#0f172a' }}>{item.name}</div>
                      <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginTop: '2px' }}>
                        <span>SKU: {item.sku || '-'}</span>
                        <span>&bull;</span>
                        <strong style={{ color: '#0f172a' }}>{item.qty} {item.unit}</strong>
                        <span>&bull;</span>
                        <span style={{ color: '#b91c1c', fontWeight: 700 }}>Rp {(Number(item.purchasePrice || 0) * Number(item.qty || 0)).toLocaleString('id-ID')}</span>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center', marginTop: '4px' }}>
                        {item.boxCapacity && Number(item.boxCapacity) > 1 && (
                          <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#92400e', background: '#fef3c7', border: '1px solid #fde68a', padding: '0 5px', borderRadius: '4px' }}>
                            📦 1 Dus = {item.boxCapacity} {item.unit}
                          </span>
                        )}
                        {item.midCapacity && Number(item.midCapacity) > 1 && item.midUnitName && (
                          <span style={{ fontSize: '9.5px', fontWeight: 700, color: '#0369a1', background: '#e0f2fe', border: '1px solid #bae6fd', padding: '0 5px', borderRadius: '4px' }}>
                            🗂️ 1 {item.midUnitName} = {item.midCapacity} {item.unit}
                          </span>
                        )}
                        {item.grNumber && (
                          <span style={{ fontSize: '9.5px', color: '#64748b' }}>
                            Dok: {item.grNumber} &bull; {new Date(item.savedAt).toLocaleDateString('id-ID')}
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <button className="bo-btn bo-btn-secondary" style={{ padding: '4px 12px', fontSize: '12px' }} onClick={() => openReviewSingle(item)}>
                        Lihat
                      </button>
                      <button className="bo-action-btn" title="Hapus item dari draf" style={{ color: '#ef4444' }} onClick={() => handleRemoveDraftItem(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        );
      })()}

      {/* ===== DRAWER KANAN: DETAIL / REVIEW ITEM DRAF ===== */}
      {reviewItems && (
        <DraftReviewDrawer
          items={reviewItems}
          mode={reviewMode}
          categories={categories}
          onSaveItem={handleSaveDraftItem}
          onClose={() => setReviewItems(null)}
          onOpenDraftList={() => {
            setReviewItems(null);
            setShowDraftModal(true);
          }}
          onRemoveItem={(id) => {
            const next = reviewItems.filter(i => i.id !== id);
            setSelectedIds(prev => prev.filter(x => x !== id));
            setReviewItems(next.length > 0 ? next : null);
          }}
          onPost={handlePostFromDrawer}
        />
      )}

      {/* CETAK LABEL BARCODE */}
      {labelProduct && (
        <BarcodeLabelModal
          product={labelProduct}
          initialCopies={labelCopies}
          onClose={() => setLabelProduct(null)}
        />
      )}

      {/* CAMERA SCANNER MODAL */}
      {cameraScannerOpen && (
        <BarcodeScannerCamera 
          onScan={(decodedText) => {
            const scannedCode = decodedText.trim();
            if (isFormOpen) {
              setCameraScannerOpen(false);
              if (scannerTarget === 'retail') {
                setRetailBarcode(scannedCode);
              } else if (scannerTarget === 'mid') {
                setMidBarcode(scannedCode);
              } else {
                setBoxBarcode(scannedCode);
                setProductId(scannedCode);
                if (editingId) {
                  const isDuplicate = products.some(p => p.id !== editingId && (p.id === scannedCode || p.barcode === scannedCode || p.boxBarcode === scannedCode));
                  if (isDuplicate) {
                    alert(`Peringatan: Barcode "${scannedCode}" sudah digunakan oleh produk lain!`);
                  }
                } else {
                  const foundProduct = products.find(p => p.id === scannedCode || p.barcode === scannedCode || p.boxBarcode === scannedCode || p.retailBarcode === scannedCode);
                  if (foundProduct) {
                    if (confirm(`Barcode "${scannedCode}" sudah terdaftar sebagai "${foundProduct.name}". Buka data produk ini untuk diedit?`)) {
                      handleEditClick(foundProduct);
                    }
                  }
                }
              }
              return scannedCode;
            }

            // Jika drawer form TIDAK terbuka (scan langsung dari tombol scan navbar/header):
            const foundProduct = products.find(p => p.id === scannedCode || p.barcode === scannedCode || p.boxBarcode === scannedCode || p.retailBarcode === scannedCode || p.midBarcode === scannedCode);
            if (foundProduct) {
              openRestockModal(foundProduct);
              setProductId('');
              setCameraScannerOpen(false);
              return foundProduct.name;
            } else {
              setCameraScannerOpen(false);
              resetForm();
              setProductId(scannedCode);
              setBoxBarcode(scannedCode);
              setSku(scannedCode);
              setIsFormOpen(true);
              return null;
            }
          }} 
          onClose={() => setCameraScannerOpen(false)} 
        />
      )}
      {/* ===== IOS STYLE DRAWER: FORM TAMBAH / EDIT PRODUK ===== */}
      {isFormOpen && (
        <div className="ios-modal-overlay" style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
          zIndex: 9998,
          animation: `${drawerClosing ? 'fadeOut' : 'fadeIn'} 0.25s ease forwards`
        }}>
          <div className={`ios-sheet${drawerClosing ? ' is-closing' : ''}`}>
            {/* Grabber (khusus mobile) */}
            <div className="ios-sheet-grabber">
              <div style={{ width: '40px', height: '5px', backgroundColor: '#d1d5db', borderRadius: '999px' }} />
            </div>
            
            {/* Header */}
            <div className="ios-sheet-header">
              <div>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  <span style={{ color: 'var(--primary)' }}>{appName}</span> &bull; Inventaris
                </div>
                <div style={{ fontSize: '20px', fontWeight: 800, color: '#111827', marginTop: '2px', letterSpacing: '-0.5px' }}>
                  {editingId ? 'Edit Stok Barang' : 'Formulir Tambah Stok'}
                </div>
              </div>
              <button className="ios-close-btn" onClick={closeDrawer}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="ios-sheet-body">
              {/* SECTION: INFORMASI DUS & IDENTITAS PRODUK */}
              <div className="ios-section-header">
                <span>INFORMASI DUS &amp; IDENTITAS PRODUK</span>
                <span className="ios-req">* Wajib diisi</span>
              </div>
              <div className="ios-group">
                {/* 1. Barcode Dus / Karton */}
                <div className="ios-row-vert">
                  <div className="ios-label-row">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Package size={14} color="#7c3aed" /> Barcode Dus / Karton Luar
                    </label>
                    <span className="ios-hint">Scan kemasan kardus</span>
                  </div>
                  <div className="ios-input-wrap">
                    <input
                      type="text" 
                      value={boxBarcode || productId}
                      onChange={(e) => { setBoxBarcode(e.target.value); setProductId(e.target.value); }}
                      onKeyDown={handleIdKeyDown}
                      className="ios-input-gray"
                      placeholder="899... (Barcode Kardus Luar)"
                      autoFocus={!(typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches)}
                    />
                    {(boxBarcode || productId) && (
                      <button type="button" className="ios-inside-btn" onClick={() => { setBoxBarcode(''); setProductId(''); }}>
                        <X size={14} color="#9ca3af" />
                      </button>
                    )}
                    <button 
                      type="button" 
                      className="ios-btn-pindai" 
                      onClick={() => { setScannerTarget('box'); setCameraScannerOpen(true); }}
                    >
                      <Camera size={14} /> Pindai
                    </button>
                    {!editingId && (
                      <button 
                        type="button" 
                        className="ios-btn-zap" 
                        title="Buat barcode internal otomatis"
                        onClick={() => {
                          const autoCode = generateInternalBarcode(products);
                          setBoxBarcode(autoCode);
                          setProductId(autoCode);
                        }}
                      >
                        ⚡
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Barcode Satuan Eceran / Bungkus */}
                <div className="ios-row-vert" style={{ background: '#faf5ff' }}>
                  <div className="ios-label-row">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6d28d9' }}>
                      <Tag size={14} color="#7c3aed" /> Barcode Eceran / Bungkus Satuan
                    </label>
                    <span className="ios-hint" style={{ color: '#7c3aed', fontWeight: 600 }}>Scan bungkus satuan di dalam dus</span>
                  </div>
                  <div className="ios-input-wrap">
                    <input
                      type="text" 
                      value={retailBarcode}
                      onChange={(e) => setRetailBarcode(e.target.value)}
                      className="ios-input-gray"
                      placeholder="899... (Barcode Bungkus di Dalam Dus)"
                      style={{ background: '#ffffff', borderColor: retailBarcode ? '#c4b5fd' : '#e2e8f0' }}
                    />
                    {retailBarcode && (
                      <button type="button" className="ios-inside-btn" onClick={() => setRetailBarcode('')}>
                        <X size={14} color="#9ca3af" />
                      </button>
                    )}
                    <button 
                      type="button" 
                      className="ios-btn-pindai" 
                      onClick={() => { setScannerTarget('retail'); setCameraScannerOpen(true); }}
                      style={{ background: '#ede9fe', color: '#6d28d9', borderColor: '#ddd6fe' }}
                    >
                      <Camera size={14} /> Pindai
                    </button>
                    {!editingId && !retailBarcode && (
                      <button 
                        type="button" 
                        className="ios-btn-zap" 
                        title="Buat barcode eceran otomatis turunan dari dus"
                        style={{ background: '#f3e8ff', color: '#7c3aed' }}
                        onClick={() => {
                          const base = boxBarcode.trim() || productId.trim() || '899';
                          setRetailBarcode(`${base}-1`);
                        }}
                      >
                        ⚡
                      </button>
                    )}
                  </div>
                </div>

                {/* 3. Nama Produk & Merek */}
                <div className="ios-row-vert">
                  <div className="ios-label-row"><label>Nama Dus / Produk</label></div>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    className="ios-input-gray" 
                    placeholder="Contoh: Indomie Kuah Soto Banjar Limau Kuit 75g"
                    required 
                  />
                </div>

                {/* 4. SKU & Kategori */}
                <div className="ios-row-split">
                  <div className="ios-col">
                    <div className="ios-label-row">
                      <label>SKU Toko</label>
                      <span className="ios-sublabel" style={{ color: '#16a34a', fontSize: '11px', fontWeight: 600 }}>
                        {sku.trim() ? 'Kustom' : 'Otomatis'}
                      </span>
                    </div>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input
                        type="text"
                        value={sku}
                        onChange={(e) => setSku(e.target.value)}
                        className="ios-input-gray"
                        placeholder={name.trim() ? generateAutoSKU(name, boxBarcode || productId) : 'Otomatis'}
                        style={{ paddingRight: sku ? '28px' : '8px' }}
                      />
                      {sku && (
                        <button
                          type="button"
                          onClick={() => setSku('')}
                          title="Hapus untuk gunakan SKU otomatis"
                          style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, fontSize: '11px' }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="ios-col">
                    <div className="ios-label-row">
                      <label>Kategori</label>
                      <button type="button" className="ios-link-red" onClick={() => setIsCategoryModalOpen(true)}>+ Baru</button>
                    </div>
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="ios-input-gray" required>
                      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* SECTION: PENGATURAN ISI DUS & STOK FISIK */}
              <div className="ios-section-header" style={{ marginTop: '20px' }}>
                <span>PENGATURAN ISI DUS &amp; STOK FISIK</span>
                <span className="ios-hint-gray">Konversi Dus ke Eceran</span>
              </div>
              <div className="ios-group">
                {/* Isi 1 Dus & Satuan Eceran */}
                <div className="ios-row-horiz">
                  <div>
                    <label>Isi Produk per 1 Dus / Karton</label>
                    <div className="ios-sublabel">Jumlah satuan terkecil dalam 1 kardus</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="number"
                      min={1}
                      value={boxCapacity}
                      onChange={(e) => {
                        const cap = Math.max(1, Number(e.target.value) || 1);
                        setBoxCapacity(cap);
                        if (boxQty) {
                          setQty(Number(boxQty) * cap);
                        }
                        if (boxPurchasePrice !== '') {
                          setPurchasePrice(Math.round(Number(boxPurchasePrice) / cap));
                        } else if (purchasePrice !== '' && cap > 1) {
                          setBoxPurchasePrice(Math.round(Number(purchasePrice) * cap));
                        }
                      }}
                      className="ios-input-gray ios-input-small"
                      style={{ width: '65px', textAlign: 'center', fontWeight: 800, color: '#7c3aed', background: '#f5f3ff', borderColor: '#ddd6fe' }}
                      placeholder="40"
                      required
                    />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#64748b' }}>{unit}</span>
                  </div>
                </div>

                {/* Pilihan Satuan Eceran */}
                <div className="ios-row-vert" style={{ padding: '12px 16px' }}>
                  <label style={{ marginBottom: '8px', display: 'block', fontSize: '13px', fontWeight: 600 }}>Satuan Eceran (Terkecil)</label>
                  <div className="ios-segmented">
                    {['Pcs', 'Bungkus', 'Sachet', 'Batang'].map(u => (
                      <button type="button" key={u} className={unit === u ? 'active' : ''} onClick={() => setUnit(u)}>{u}</button>
                    ))}
                  </div>
                  <select
                    value={['Pcs', 'Bungkus', 'Sachet', 'Batang'].indexOf(unit) === -1 ? unit : ''}
                    onChange={(e) => { if (e.target.value) setUnit(e.target.value); }}
                    className="ios-input-gray"
                    style={{ marginTop: '8px' }}
                  >
                    <option value="">Pilih satuan lain...</option>
                    <option value="Botol">Botol</option>
                    <option value="Kaleng">Kaleng</option>
                    <option value="Box">Box</option>
                    <option value="Pack">Pack</option>
                    <option value="Lusin">Lusin</option>
                    <option value="Kg">Kg</option>
                  </select>
                </div>

                {/* Input Jumlah Dus Masuk & Kalkulasi Total Stok */}
                <div className="ios-row-horiz" style={{ background: '#f8fafc' }}>
                  <div>
                    <label>Jumlah Dus yang Diterima (Masuk)</label>
                    <div className="ios-sublabel">Berapa dus kardus fisik masuk</div>
                  </div>
                  <div className="ios-stepper">
                    <button 
                      type="button" 
                      onClick={() => {
                        const next = Math.max(0, (Number(boxQty) || 0) - 1);
                        setBoxQty(next);
                        setQty(next * (Number(boxCapacity) || 40));
                      }}
                    >
                      -
                    </button>
                    <input 
                      type="number" 
                      step="any" 
                      inputMode="decimal" 
                      value={boxQty} 
                      placeholder="0"
                      onChange={(e) => {
                        const val = e.target.value === '' ? '' : Number(e.target.value);
                        setBoxQty(val);
                        if (val !== '') {
                          setQty(Number(val) * (Number(boxCapacity) || 40));
                        }
                      }} 
                    />
                    <button 
                      type="button" 
                      onClick={() => {
                        const next = (Number(boxQty) || 0) + 1;
                        setBoxQty(next);
                        setQty(next * (Number(boxCapacity) || 40));
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                {/* Total Stok Fisik Satuan */}
                <div className="ios-row-horiz">
                  <div>
                    <label style={{ color: '#065f46' }}>Total Stok Fisik ({unit})</label>
                    <div className="ios-sublabel">
                      {boxQty && Number(boxQty) > 0 
                        ? `${boxQty} Dus × ${boxCapacity} ${unit}`
                        : 'Kuantitas fisik satuan dihitung per ' + unit}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input 
                      type="number" 
                      step="any" 
                      inputMode="decimal" 
                      value={qty} 
                      onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))} 
                      className="ios-input-gray ios-input-small"
                      style={{ width: '80px', textAlign: 'right', fontWeight: 800, fontSize: '16px', color: '#065f46', background: '#ecfdf5', borderColor: '#a7f3d0' }}
                      required 
                    />
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#065f46' }}>{unit}</span>
                  </div>
                </div>

                {/* Peringatan Stok Tipis */}
                <div className="ios-row-horiz">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        Peringatan Stok Tipis (Min) <AlertTriangle size={14} color="#f59e0b" />
                      </label>
                      <div className="ios-sublabel">Alert saat stok di bawah nilai ini (dalam satuan {unit})</div>
                    </div>
                  </div>
                  <input type="number" step="any" inputMode="decimal" value={minStock} onChange={(e) => setMinStock(e.target.value === '' ? '' : Number(e.target.value))} className="ios-input-gray ios-input-small" style={{ width: '60px', textAlign: 'center' }} placeholder="0" />
                </div>
              </div>

              {/* OPSI KEMASAN MENENGAH / GROSIR KECIL (SAK / PACK / SLOP / LUSIN / RENCENG) */}
              <div className="ios-section-header" style={{ marginTop: '22px' }}>
                <span>KEMASAN MENENGAH / GROSIR KECIL</span>
                <label style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  color: hasMidTier ? '#6d28d9' : '#64748b',
                  background: hasMidTier ? '#ede9fe' : '#f1f5f9',
                  border: `1px solid ${hasMidTier ? '#ddd6fe' : '#cbd5e1'}`,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}>
                  <input 
                    type="checkbox" 
                    checked={hasMidTier} 
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setHasMidTier(checked);
                      if (checked && !midUnitName) {
                        if (unit.toLowerCase() === 'kg' || category?.toUpperCase().includes('BERAS')) {
                          setMidUnitName('Sak');
                          setMidCapacity(5);
                        } else if (category?.toUpperCase().includes('ROKOK')) {
                          setMidUnitName('Slop');
                          setMidCapacity(10);
                        } else {
                          setMidUnitName('Pack');
                          setMidCapacity(10);
                        }
                      }
                    }} 
                    style={{ accentColor: '#7c3aed', cursor: 'pointer' }}
                  />
                  <span>{hasMidTier ? 'Satuan Menengah Aktif' : 'Aktifkan Satuan Menengah'}</span>
                </label>
              </div>
              {hasMidTier && (
                <div className="ios-group" style={{ border: '1px solid #ddd6fe', background: '#faf5ff' }}>
                  <div className="ios-row-split">
                    <div className="ios-col">
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#5b21b6', marginBottom: '6px' }}>Nama Satuan</label>
                      <select 
                        value={['Sak', 'Karung', 'Bal', 'Slop', 'Renceng', 'Pack', 'Lusin', 'Karton', 'Ikat'].includes(midUnitName) ? midUnitName : (midUnitName ? 'Lainnya' : 'Sak')} 
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'Lainnya') {
                            setMidUnitName('');
                          } else {
                            setMidUnitName(val);
                          }
                        }}
                        className="ios-input-gray"
                        style={{ background: '#ffffff' }}
                      >
                        <option value="Sak">Sak (Beras / Tepung / Pakan)</option>
                        <option value="Karung">Karung (25-50 Kg)</option>
                        <option value="Bal">Bal (Gula / Garam / Krupuk)</option>
                        <option value="Slop">Slop (10 Bungkus Rokok)</option>
                        <option value="Pack">Pack (Kemasan Sedang)</option>
                        <option value="Lusin">Lusin (12 Pcs)</option>
                        <option value="Renceng">Renceng (10-12 Sachet)</option>
                        <option value="Karton">Karton Kecil</option>
                        <option value="Ikat">Ikat</option>
                        <option value="Lainnya">Lainnya (Ketik Manual)...</option>
                      </select>
                      {!['Sak', 'Karung', 'Bal', 'Slop', 'Renceng', 'Pack', 'Lusin', 'Karton', 'Ikat'].includes(midUnitName) && (
                        <input
                          type="text"
                          value={midUnitName}
                          onChange={(e) => setMidUnitName(e.target.value)}
                          placeholder="Ketik nama satuan (cth: Sak 5kg, Bag)..."
                          className="ios-input-gray"
                          style={{ background: '#ffffff', marginTop: '6px' }}
                          autoFocus
                        />
                      )}
                    </div>
                    <div className="ios-col">
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#5b21b6', marginBottom: '6px' }}>Isi per {midUnitName || 'Kemasan'}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <input 
                          type="number" 
                          min={1}
                          value={midCapacity} 
                          onChange={(e) => setMidCapacity(Number(e.target.value) || 1)}
                          className="ios-input-gray"
                          style={{ background: '#ffffff', textAlign: 'center', fontWeight: 800 }}
                        />
                        <span style={{ fontSize: '12px', fontWeight: 700, color: '#6d28d9' }}>{unit}</span>
                      </div>
                    </div>
                  </div>

                  <div className="ios-row-vert" style={{ borderTop: '1px solid #ede9fe' }}>
                    <div className="ios-label-row">
                      <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#5b21b6' }}>Barcode {midUnitName} (Opsional)</label>
                      <span className="ios-hint">Scan kemasan {midUnitName}</span>
                    </div>
                    <div className="ios-input-wrap">
                      <input 
                        type="text" 
                        value={midBarcode} 
                        onChange={(e) => setMidBarcode(e.target.value)}
                        className="ios-input-gray"
                        placeholder={`Barcode khusus kemasan ${midUnitName}...`}
                        style={{ background: '#ffffff' }}
                      />
                      {midBarcode && (
                        <button type="button" className="ios-inside-btn" onClick={() => setMidBarcode('')}>
                          <X size={14} color="#9ca3af" />
                        </button>
                      )}
                      <button 
                        type="button" 
                        className="ios-btn-pindai"
                        onClick={() => { setScannerTarget('mid'); setCameraScannerOpen(true); }}
                        style={{ background: '#ffffff' }}
                      >
                        <Camera size={14} /> Pindai
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION: STRUKTUR HARGA BELI & HARGA JUAL */}
              <div className="ios-section-header" style={{ marginTop: '22px' }}>
                <span>STRUKTUR HARGA BELI (DISTRIBUTOR) &amp; HARGA JUAL</span>
                {(() => {
                  const m = (Number(sellingPrice) - Number(purchasePrice));
                  const pct = Number(sellingPrice) > 0 ? (m / Number(sellingPrice)) * 100 : 0;
                  const color = pct >= 0 ? '#047857' : '#b91c1c';
                  const bg = pct >= 0 ? '#dcfce7' : '#fee2e2';
                  return (
                    <span style={{ backgroundColor: bg, color, border: `1px solid ${pct >= 0 ? '#bbf7d0' : '#fecaca'}`, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 }}>
                      Margin Eceran: {pct > 0 ? '+' : ''}{pct.toFixed(1)}%
                    </span>
                  );
                })()}
              </div>
              <div className="ios-group">
                {/* 1. Harga Beli Distributor per Dus / Karton (Jika punya Dus) */}
                {Number(boxCapacity) > 1 && (
                  <div className="ios-row-horiz" style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <div>
                      <label style={{ color: '#0f172a', fontWeight: 800 }}>Harga Beli Distributor (per Dus / Karton)</label>
                      <div className="ios-sublabel">Harga nota faktur 1 Dus utuh (isi {boxCapacity} {unit})</div>
                    </div>
                    <div className="ios-input-prefix" style={{ background: '#f1f5f9' }}>
                      <span style={{ color: '#475569', fontWeight: 700 }}>Rp</span>
                      <input 
                        type="number" 
                        inputMode="numeric" 
                        value={boxPurchasePrice} 
                        onChange={(e) => {
                          const val = e.target.value;
                          setBoxPurchasePrice(val === '' ? '' : Number(val));
                          const bCap = Number(boxCapacity) || 1;
                          if (val !== '' && bCap > 0) {
                            setPurchasePrice(Math.round(Number(val) / bCap));
                          }
                        }} 
                        placeholder={purchasePrice && Number(boxCapacity) > 1 ? String(Math.round(Number(purchasePrice) * Number(boxCapacity))) : ''}
                        className="ios-input-gray" 
                        style={{ textAlign: 'right', width: '130px', fontWeight: 800, color: '#0f172a' }} 
                      />
                    </div>
                  </div>
                )}

                {/* 2. Harga Modal Pokok (HPP Satuan Dasar) */}
                <div className="ios-row-horiz">
                  <div>
                    <label style={{ fontWeight: 700 }}>Harga Pokok Modal (HPP per {unit})</label>
                    <div className="ios-sublabel">
                      {Number(boxCapacity) > 1 
                        ? `Biaya pokok satuan eceran (otomatis: Rp {harga Dus} ÷ ${boxCapacity})`
                        : `Biaya pokok dasar eceran per ${unit}`}
                    </div>
                  </div>
                  <div className="ios-input-prefix">
                    <span>Rp</span>
                    <input 
                      type="number" 
                      inputMode="numeric" 
                      value={purchasePrice} 
                      onChange={(e) => {
                        const val = e.target.value;
                        setPurchasePrice(val === '' ? '' : Number(val));
                        const bCap = Number(boxCapacity) || 1;
                        if (val !== '' && bCap > 1) {
                          setBoxPurchasePrice(Math.round(Number(val) * bCap));
                        }
                      }} 
                      className="ios-input-gray" 
                      style={{ textAlign: 'right', width: '130px', fontWeight: 700 }} 
                    />
                  </div>
                </div>

                {/* Info Estimasi Modal Kemasan Menengah (Jika aktif) */}
                {hasMidTier && Number(midCapacity) > 1 && purchasePrice !== '' && (
                  <div style={{ padding: '8px 18px', background: '#eff6ff', borderBottom: '1px solid #dbeafe', fontSize: '11.5px', color: '#1e40af', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>ℹ️ Modal per <strong>1 {midUnitName || 'Kemasan'}</strong> (isi {midCapacity} {unit}):</span>
                    <strong style={{ fontSize: '12.5px' }}>Rp {(Math.round(Number(purchasePrice) * Number(midCapacity))).toLocaleString('id-ID')}</strong>
                  </div>
                )}
                
                {/* 3. Harga Jual Eceran */}
                <div className="ios-row-horiz" style={{ background: '#fff7f7' }}>
                  <div>
                    <label style={{ color: 'var(--primary)', fontWeight: 800 }}>1. Harga Jual Eceran (per {unit})</label>
                    <div className="ios-sublabel">Harga standar kasir saat beli satuan/eceran</div>
                  </div>
                  <div className="ios-input-prefix is-red">
                    <span>Rp</span>
                    <input type="number" inputMode="numeric" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value === '' ? '' : Number(e.target.value))} className="ios-input-gray" style={{ textAlign: 'right', width: '130px', color: 'var(--primary)', fontWeight: 800 }} required />
                  </div>
                </div>

                {/* 4. Harga Jual Dus / Karton (Hanya jika produk berdus) */}
                {Number(boxCapacity) > 1 && (
                  <div className="ios-row-horiz" style={{ background: '#f5f3ff' }}>
                    <div>
                      <label style={{ color: '#6d28d9', fontWeight: 800 }}>2. Harga Jual Dus / Karton</label>
                      <div className="ios-sublabel">Harga 1 Dus utuh (isi {boxCapacity} {unit})</div>
                    </div>
                    <div className="ios-input-prefix" style={{ background: '#ede9fe' }}>
                      <span style={{ color: '#6d28d9' }}>Rp</span>
                      <input 
                        type="number" 
                        inputMode="numeric" 
                        value={boxPrice} 
                        onChange={(e) => {
                          setBoxPrice(e.target.value === '' ? '' : Number(e.target.value));
                          setWholesalePrice(e.target.value === '' ? '' : Number(e.target.value));
                        }} 
                        placeholder={sellingPrice && boxCapacity ? String(Number(sellingPrice) * Number(boxCapacity)) : ''}
                        className="ios-input-gray" 
                        style={{ textAlign: 'right', width: '130px', fontWeight: 800, color: '#6d28d9' }} 
                      />
                    </div>
                  </div>
                )}

                {/* 5. Harga Jual Satuan Menengah (Renceng/Lusin) jika aktif */}
                {hasMidTier && (
                  <div className="ios-row-horiz" style={{ background: '#eff6ff' }}>
                    <div>
                      <label style={{ color: '#1d4ed8', fontWeight: 800 }}>3. Harga Jual {midUnitName || 'Kemasan Menengah'}</label>
                      <div className="ios-sublabel">Harga 1 {midUnitName || 'Kemasan'} (isi {midCapacity} {unit})</div>
                    </div>
                    <div className="ios-input-prefix" style={{ background: '#dbeafe' }}>
                      <span style={{ color: '#1d4ed8' }}>Rp</span>
                      <input 
                        type="number" 
                        inputMode="numeric" 
                        value={midPrice} 
                        onChange={(e) => setMidPrice(e.target.value === '' ? '' : Number(e.target.value))} 
                        placeholder={sellingPrice && midCapacity ? String(Number(sellingPrice) * Number(midCapacity)) : ''}
                        className="ios-input-gray" 
                        style={{ textAlign: 'right', width: '130px', fontWeight: 800, color: '#1d4ed8' }} 
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION: GAMBAR PRODUK */}
              <div className="ios-section-header" style={{ marginTop: '20px' }}>
                <span>GAMBAR PRODUK (OPSIONAL)</span>
              </div>
              <div className="ios-group">
                <div className="ios-row-vert">
                  <div className="ios-label-row"><label>Tautan (URL) Gambar / Foto Kamera</label></div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input type="text" inputMode="url" autoCapitalize="off" autoCorrect="off" value={image} onChange={(e) => setImage(e.target.value)} className="ios-input-gray" placeholder="https://..." style={{ flex: 1 }} />
                    <input 
                      type="file" 
                      accept="image/*" 
                      capture="environment" 
                      id="camera-input" 
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const img = new Image();
                          img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let width = img.width;
                            let height = img.height;
                            const MAX_SIZE = 800;
                            if (width > height) {
                              if (width > MAX_SIZE) {
                                height *= MAX_SIZE / width;
                                width = MAX_SIZE;
                              }
                            } else {
                              if (height > MAX_SIZE) {
                                width *= MAX_SIZE / height;
                                height = MAX_SIZE;
                              }
                            }
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx?.drawImage(img, 0, 0, width, height);
                            const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                            setImage(dataUrl);
                          };
                          img.src = event.target?.result as string;
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <button 
                      type="button" 
                      onClick={() => document.getElementById('camera-input')?.click()}
                      className="bo-btn"
                      style={{ backgroundColor: '#2563eb', color: 'white', padding: '0 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold' }}
                    >
                      📷 Kamera
                    </button>
                  </div>
                  {image && image.startsWith('data:image') && (
                    <div style={{ marginTop: '10px' }}>
                      <img src={image} alt="Preview" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px' }} />
                    </div>
                  )}
                </div>
              </div>

              {/* Spacer so we can scroll past keyboard */}
              <div style={{ height: '40px' }} />

              {/* FOOTER ACTIONS */}
              <div className="ios-sheet-footer">
                <button type="button" className="ios-btn-batal" onClick={closeDrawer}>Batal</button>
                <button type="submit" className="ios-btn-simpan">
                  {editingId ? <Save size={18} /> : <Plus size={18} />}
                  {editingId ? 'Simpan Perubahan' : 'Tambahkan ke Daftar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style>{`
        /* iOS Bottom Sheet / Right Drawer Styles */
        .ios-modal-overlay {
          padding: max(20px, calc(env(safe-area-inset-top) + 15px)) 0 0 0;
        }
        .ios-sheet {
          background-color: #f8fafc;
          width: 100%;
          max-width: 100%;
          height: 100%;
          border-radius: 20px 20px 0 0;
          display: flex;
          flex-direction: column;
          box-shadow: 0 -10px 40px rgba(0,0,0,0.18);
          overflow: hidden;
          position: relative;
          animation: slideUp 0.35s cubic-bezier(0.32,0.72,0,1) forwards;
        }
        .ios-sheet.is-closing { animation: slideDown 0.25s ease-in forwards; }

        .ios-sheet-grabber {
          display: flex;
          justify-content: center;
          padding: 8px 0 4px;
        }
        
        .ios-sheet-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 24px;
          flex-shrink: 0;
          background: #ffffff;
          border-bottom: 1px solid #e2e8f0;
        }
        .ios-close-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #f1f5f9;
          border: 1px solid #e2e8f0;
          color: #4b5563;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ios-close-btn:hover {
          background: #e2e8f0;
          color: #0f172a;
        }
        .ios-sheet-body {
          flex: 1;
          overflow-y: auto;
          padding: 16px 24px;
          padding-bottom: 110px;
        }
        
        .ios-section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 4px 2px 8px;
          font-size: 11.5px;
          font-weight: 800;
          color: #64748b;
          letter-spacing: 0.4px;
          flex-wrap: wrap;
          gap: 8px;
        }
        .ios-req { color: var(--primary); font-size: 11px; font-weight: 700; }
        .ios-hint-gray { font-weight: 600; font-size: 11px; color: #94a3b8; }
        
        .ios-group {
          background: #ffffff;
          border-radius: 14px;
          overflow: hidden;
          border: 1px solid #e2e8f0;
          box-shadow: 0 1px 3px rgba(0,0,0,0.03);
          margin-bottom: 6px;
        }
        .ios-row-vert {
          padding: 14px 18px;
          position: relative;
          border-bottom: 1px solid #f1f5f9;
        }
        .ios-row-vert:last-child { border-bottom: none; }
        .ios-label-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          font-size: 13.5px;
          font-weight: 700;
          color: #1e293b;
          flex-wrap: wrap;
          gap: 6px;
        }
        .ios-hint { color: #94a3b8; font-weight: 500; font-size: 12px; }
        .ios-input-gray {
          width: 100%;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 9px;
          padding: 10px 14px;
          font-size: 14.5px;
          color: #0f172a;
          outline: none;
          transition: all 0.2s;
        }
        .ios-input-gray:focus {
          border-color: #3b82f6;
          background: #ffffff;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        .ios-input-small { padding: 8px 12px; }
        
        .ios-input-wrap {
          display: flex;
          gap: 8px;
          align-items: center;
          width: 100%;
        }
        .ios-inside-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          border: none;
          background: none;
          cursor: pointer;
        }
        .ios-btn-pindai {
          display: flex;
          align-items: center;
          gap: 6px;
          background: white;
          border: 1px solid #cbd5e1;
          padding: 0 14px;
          height: 40px;
          border-radius: 9px;
          font-weight: 700;
          font-size: 13px;
          color: #334155;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s;
        }
        .ios-btn-pindai:hover {
          background: #f1f5f9;
        }
        .ios-btn-zap {
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fee2e2;
          border: 1px solid #fecaca;
          width: 40px;
          height: 40px;
          border-radius: 9px;
          color: var(--primary);
          font-size: 16px;
          cursor: pointer;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .ios-btn-zap:hover {
          background: #fecaca;
        }

        .ios-row-split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          padding: 14px 18px;
          border-bottom: 1px solid #f1f5f9;
        }
        .ios-row-split:last-child { border-bottom: none; }
        .ios-col { display: flex; flex-direction: column; }
        .ios-link-red {
          background: none;
          border: none;
          color: var(--primary);
          font-weight: 700;
          font-size: 12.5px;
          cursor: pointer;
          padding: 0;
        }

        .ios-row-horiz {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 18px;
          border-bottom: 1px solid #f1f5f9;
          gap: 16px;
        }
        .ios-row-horiz:last-child { border-bottom: none; }
        .ios-row-horiz > div:first-child { flex: 1; min-width: 0; }
        .ios-row-horiz label {
          font-size: 13.5px;
          font-weight: 700;
          color: #0f172a;
          line-height: 1.35;
        }
        .ios-sublabel {
          font-size: 12px;
          color: #64748b;
          margin-top: 3px;
          line-height: 1.35;
        }
        
        .ios-stepper {
          display: flex;
          align-items: center;
          background: #f1f5f9;
          border-radius: 9px;
          padding: 3px;
          border: 1px solid #cbd5e1;
          flex-shrink: 0;
        }
        .ios-stepper button {
          width: 34px;
          height: 34px;
          border: none;
          background: transparent;
          font-size: 18px;
          font-weight: 700;
          color: #334155;
          cursor: pointer;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .ios-stepper button:hover { background: #e2e8f0; }
        .ios-stepper input {
          width: 52px;
          text-align: center;
          border: none;
          background: transparent;
          font-size: 15px;
          font-weight: 800;
          color: #0f172a;
        }
        
        .ios-segmented {
          display: flex;
          background: #f1f5f9;
          border-radius: 9px;
          padding: 3px;
          gap: 3px;
        }
        .ios-segmented button {
          flex: 1;
          padding: 8px 0;
          border: none;
          background: transparent;
          border-radius: 7px;
          font-size: 13px;
          font-weight: 700;
          color: #64748b;
          transition: all 0.15s;
          cursor: pointer;
        }
        .ios-segmented button.active {
          background: white;
          color: #0f172a;
          box-shadow: 0 1px 3px rgba(0,0,0,0.08);
        }
        
        .ios-input-prefix {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafc;
          padding: 0 12px;
          border-radius: 9px;
          border: 1px solid #e2e8f0;
          flex-shrink: 0;
        }
        .ios-input-prefix span {
          font-size: 13px;
          font-weight: 800;
          color: #64748b;
        }
        .ios-input-prefix .ios-input-gray {
          background: transparent;
          padding: 10px 0;
          border: none;
          box-shadow: none;
        }
        .ios-input-prefix.is-red {
          background: #fff1f2;
          border-color: #fecdd3;
        }
        .ios-input-prefix.is-red span { color: var(--primary); }
        
        .ios-sheet-footer {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(255,255,255,0.96);
          backdrop-filter: blur(12px);
          border-top: 1px solid #e2e8f0;
          padding: 14px 24px;
          display: flex;
          gap: 12px;
          z-index: 20;
        }
        .ios-btn-batal {
          flex: 0 0 110px;
          padding: 14px;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          font-size: 15px;
          font-weight: 700;
          color: #475569;
          cursor: pointer;
          transition: all 0.15s;
        }
        .ios-btn-batal:hover { background: #f1f5f9; color: #0f172a; }
        .ios-btn-simpan {
          flex: 1;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: var(--primary);
          font-size: 15px;
          font-weight: 800;
          color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(220, 38, 38, 0.25);
          transition: all 0.15s;
        }
        .ios-btn-simpan:hover {
          filter: brightness(0.95);
          transform: translateY(-1px);
        }

        /* Desktop: Drawer on right side with wide comfortable layout (580px) */
        @media (min-width: 641px) {
          .ios-modal-overlay {
            justify-content: flex-end !important;
            padding: 0 !important;
          }
          .ios-sheet {
            border-radius: 0;
            width: 580px !important;
            max-width: 580px !important;
            animation: slideInRight 0.3s cubic-bezier(0.22,1,0.36,1) forwards;
            box-shadow: -10px 0 40px rgba(0,0,0,0.14);
          }
          .ios-sheet.is-closing { animation: slideOutRight 0.25s forwards; }
          .ios-sheet-footer { padding: 16px 24px; }
          .ios-sheet-grabber { display: none !important; }
        }

        /* Mobile Screens */
        @media (max-width: 640px) {
          .ios-sheet {
            max-width: 100% !important;
            border-radius: 20px 20px 0 0;
            height: 94vh;
          }
          .ios-sheet-body {
            padding: 12px 16px 100px 16px;
          }
          .ios-sheet-footer {
            padding: 12px 16px 20px;
          }
        }

        /* Small Phones (e.g. <= 440px): avoid horizontal squeezing */
        @media (max-width: 440px) {
          .ios-row-split {
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .ios-row-horiz {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }
          .ios-row-horiz > div:last-child {
            display: flex;
            justify-content: flex-end;
          }
        }

        @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
        @keyframes fadeOut { from { opacity:1 } to { opacity:0 } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes slideOutRight { from { transform: translateX(0); } to { transform: translateX(100%); } }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slideDown { from { transform: translateY(0); } to { transform: translateY(100%); } }
        @keyframes scaleIn { from { opacity:0; transform: scale(0.5); } to { opacity:1; transform: scale(1); } }
      `}</style>

      {/* ===== MODAL: KONFIRMASI & POSTING ===== */}
      {showPostModal && (
        <div style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9997, animation: 'fadeIn 0.2s ease'
        }}>
          <div style={{
            backgroundColor: 'white', borderRadius: '16px',
            width: '96%', maxWidth: '680px',
            boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
            overflow: 'hidden', animation: 'slideUp 0.25s cubic-bezier(0.34,1.4,0.64,1)'
          }}>
            {/* Header */}
            <div style={{
              background: 'linear-gradient(135deg, #1a0505, #2d0a08)',
              padding: '18px 24px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              borderBottom: '1px solid rgba(218,41,28,0.3)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #da291c, #b91c1c)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={18} color="white" />
                </div>
                <div>
                  <div style={{ color: 'white', fontWeight: 800, fontSize: '15px' }}>Konfirmasi Penerimaan Stok</div>
                  <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '12px' }}>Ref: <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{grNumber}</strong></div>
                </div>
              </div>
              {!isPosted && (
                <button onClick={() => setShowPostModal(false)} style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.7)' }}>
                  <X size={16} />
                </button>
              )}
            </div>

            {/* Body */}
            <div style={{ padding: '24px' }}>
              {!isPosted ? (
                <>
                  {/* Info bar */}
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                    {[
                      { label: 'Total Item', value: draftItems.length + ' produk', color: '#1e40af', bg: '#eff6ff' },
                      { label: 'Total Qty Masuk', value: draftItems.reduce((s,i) => s + Number(i.qty), 0) + ' unit', color: '#065f46', bg: '#ecfdf5' },
                      { label: 'Total Nilai Beli', value: 'Rp ' + draftItems.reduce((s,i) => s + Number(i.purchasePrice) * Number(i.qty), 0).toLocaleString('id-ID'), color: '#92400e', bg: '#fffbeb' },
                    ].map(card => (
                      <div key={card.label} style={{ flex: 1, padding: '12px 16px', backgroundColor: card.bg, borderRadius: '10px', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{card.label}</div>
                        <div style={{ fontSize: '18px', fontWeight: 800, color: card.color }}>{card.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Item list */}
                  <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: '10px', marginBottom: '20px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                      <thead>
                        <tr style={{ backgroundColor: '#f9fafb' }}>
                          {['Nama Produk', 'Kategori', 'Qty', 'Harga Beli', 'Subtotal'].map(h => (
                            <th key={h} style={{ padding: '10px 12px', textAlign: h === 'Nama Produk' ? 'left' : 'right', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {draftItems.map((item, i) => (
                          <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            <td style={{ padding: '10px 12px', fontWeight: 600 }}>{item.name}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280' }}>{item.category}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{item.qty} {item.unit}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', color: '#374151' }}>Rp {Number(item.purchasePrice).toLocaleString('id-ID')}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: 'var(--primary)' }}>Rp {(Number(item.purchasePrice) * Number(item.qty)).toLocaleString('id-ID')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Warning */}
                  <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', backgroundColor: '#fef3c7', borderRadius: '8px', marginBottom: '20px', border: '1px solid #fde68a' }}>
                    <AlertTriangle size={16} color="#92400e" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ fontSize: '13px', color: '#92400e' }}>
                      Setelah posting, stok bertambah dan produk baru langsung tampil di Kasir POS. Pastikan semua item sudah sesuai sebelum melanjutkan.
                    </span>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button className="bo-btn bo-btn-secondary" onClick={() => setShowPostModal(false)} disabled={isSubmitting}>Batal</button>
                    <button
                      className="bo-btn bo-btn-primary"
                      style={{ minWidth: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                      onClick={handlePosting}
                      disabled={isSubmitting}
                    >
                      <CheckCircle size={16} /> {isSubmitting ? 'Memproses...' : 'Posting Sekarang'}
                    </button>
                  </div>
                </>
              ) : (
                /* SUCCESS SCREEN */
                <div style={{ textAlign: 'center', padding: '32px 24px' }}>
                  <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: 'linear-gradient(135deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 8px 24px rgba(34,197,94,0.4)', animation: 'scaleIn 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
                    <CheckCircle size={36} color="white" />
                  </div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: '#111827', marginBottom: '6px' }}>Posting Berhasil!</div>
                  <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '4px' }}>Nomor GR: <strong style={{ color: '#1e40af' }}>{grNumber}</strong></div>
                  <div style={{ fontSize: '13px', color: '#9ca3af', marginBottom: '24px' }}>
                    {draftItems.length} produk • {new Date().toLocaleString('id-ID')}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                    <button className="bo-btn bo-btn-secondary" onClick={() => { setShowPostModal(false); setGrNumber(makeGrNumber()); }}>
                      <X size={16} /> Tutup &amp; Bersihkan Sesi
                    </button>
                    <button className="bo-btn bo-btn-primary" onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Printer size={16} /> Cetak GR
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

  );
};

export default StockManagement;

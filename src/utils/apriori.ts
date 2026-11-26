/**
 * Algoritma Apriori untuk Market Basket Analysis & Association Rule Mining
 * Sesuai dengan Metodologi Penelitian Tugas Akhir S1 Informatika
 * Referensi: Susanto & Fenriana (2024), Aggarwal (2020), Agrawal & Srikant (1994)
 */

export interface AprioriItem {
  id: string;
  name: string;
}

export interface FrequentItemset {
  items: string[];      // Array of product IDs or names
  itemNames: string[];  // Readable names
  supportCount: number; // Frekuensi kemunculan bersama dalam transaksi (support count)
  support: number;      // Nilai support (0 - 1)
}

export interface AssociationRule {
  antecedent: string[];      // Item premis / jika dibeli (A)
  antecedentNames: string[];
  consequent: string[];      // Item konsekuensi / maka dibeli juga (B)
  consequentNames: string[];
  support: number;           // Support gabungan P(A ∪ B)
  antecedentSupport: number; // Support premis P(A)
  consequentSupport: number; // Support konsekuensi P(B)
  confidence: number;        // Nilai confidence: P(A ∪ B) / P(A)
  lift: number;              // Nilai lift ratio: Confidence / P(B)
  interpretation: string;    // Penjelasan bisnis / hasil evaluasi
  recommendationType: 'STRONG_POSITIVE' | 'MODERATE_POSITIVE' | 'INDEPENDENT' | 'NEGATIVE';
}

export interface AprioriAnalysisResult {
  totalTransactions: number;
  analyzedTransactions: number;
  minSupport: number;
  minConfidence: number;
  frequentItemsetsByK: {
    k: number;
    itemsets: FrequentItemset[];
  }[];
  allFrequentItemsets: FrequentItemset[];
  rules: AssociationRule[];
  topRecommendations: AssociationRule[];
}

/**
 * Menghasilkan semua kombinasi subset (power set) dari array item
 */
function getCombinations<T>(arr: T[], size: number): T[][] {
  if (size === 0) return [[]];
  if (arr.length < size) return [];
  const [head, ...tail] = arr;
  const withHead = getCombinations(tail, size - 1).map(c => [head, ...c]);
  const withoutHead = getCombinations(tail, size);
  return [...withHead, ...withoutHead];
}

/**
 * Menjalankan Algoritma Apriori pada himpunan data transaksi
 * @param transactions Array data transaksi, di mana tiap transaksi memiliki array items
 * @param minSupport Minimum Support (0 - 1), misal 0.05 untuk 5%
 * @param minConfidence Minimum Confidence (0 - 1), misal 0.4 untuk 40%
 * @param productNameMap Kamus mapping ID produk ke Nama Produk
 */
export function runApriori(
  transactions: { id: string; items: { productId: string; name: string }[] }[],
  minSupport: number = 0.05,
  minConfidence: number = 0.4,
  productNameMap: Record<string, string> = {}
): AprioriAnalysisResult {
  // 1. Ekstraksi transaksi valid (transaksi yang memiliki setidaknya 1 item unik)
  const validTransactions: string[][] = [];
  const nameLookup: Record<string, string> = { ...productNameMap };

  for (const tx of transactions) {
    if (!tx.items || tx.items.length === 0) continue;
    const uniqueIds = Array.from(new Set(tx.items.map(i => {
      if (i.productId && i.name) {
        nameLookup[i.productId] = i.name;
      }
      return i.productId || i.name;
    }))).sort();

    if (uniqueIds.length > 0) {
      validTransactions.push(uniqueIds);
    }
  }

  const N = validTransactions.length;
  if (N === 0) {
    return {
      totalTransactions: transactions.length,
      analyzedTransactions: 0,
      minSupport,
      minConfidence,
      frequentItemsetsByK: [],
      allFrequentItemsets: [],
      rules: [],
      topRecommendations: [],
    };
  }

  const minSupportCount = Math.max(1, Math.ceil(minSupport * N));
  const frequentItemsetsByK: { k: number; itemsets: FrequentItemset[] }[] = [];
  const allFrequentMap = new Map<string, FrequentItemset>();

  // ==========================================
  // TAHAP 1: FREQUENT 1-ITEMSET (L1)
  // ==========================================
  const itemCounts = new Map<string, number>();
  for (const basket of validTransactions) {
    for (const item of basket) {
      itemCounts.set(item, (itemCounts.get(item) || 0) + 1);
    }
  }

  const L1: FrequentItemset[] = [];
  for (const [item, count] of itemCounts.entries()) {
    if (count >= minSupportCount) {
      const itemset: FrequentItemset = {
        items: [item],
        itemNames: [nameLookup[item] || item],
        supportCount: count,
        support: count / N,
      };
      L1.push(itemset);
      allFrequentMap.set(item, itemset);
    }
  }

  // Urutkan L1 berdasarkan support tertinggi
  L1.sort((a, b) => b.supportCount - a.supportCount);
  if (L1.length > 0) {
    frequentItemsetsByK.push({ k: 1, itemsets: L1 });
  }

  // ==========================================
  // TAHAP 2: ITERASI K-ITEMSET (L2, L3, ...)
  // ==========================================
  let prevFrequent: string[][] = L1.map(l => l.items);
  let k = 2;

  while (prevFrequent.length > 0 && k <= 4) { // Batasi hingga 4-itemset untuk performa optimal
    // Join Step: Buat kandidat C_k dari L_{k-1}
    const candidateSet = new Set<string>();
    const candidates: string[][] = [];

    for (let i = 0; i < prevFrequent.length; i++) {
      for (let j = i + 1; j < prevFrequent.length; j++) {
        const itemsetA = prevFrequent[i];
        const itemsetB = prevFrequent[j];

        // Periksa apakah k-2 item pertama sama
        let canJoin = true;
        for (let m = 0; m < k - 2; m++) {
          if (itemsetA[m] !== itemsetB[m]) {
            canJoin = false;
            break;
          }
        }

        if (canJoin) {
          const union = Array.from(new Set([...itemsetA, ...itemsetB])).sort();
          if (union.length === k) {
            const key = union.join('|');
            if (!candidateSet.has(key)) {
              candidateSet.add(key);
              // Prune Step: Semua subset berukuran k-1 harus frekuen
              const subCombinations = getCombinations(union, k - 1);
              const allSubsetsFrequent = subCombinations.every(sub => 
                prevFrequent.some(pf => pf.join('|') === sub.join('|'))
              );
              if (allSubsetsFrequent) {
                candidates.push(union);
              }
            }
          }
        }
      }
    }

    if (candidates.length === 0) break;

    // Hitung kemunculan kandidat pada seluruh keranjang transaksi
    const candidateCounts = new Map<string, number>();
    for (const basket of validTransactions) {
      const basketSet = new Set(basket);
      for (const cand of candidates) {
        if (cand.every(c => basketSet.has(c))) {
          const key = cand.join('|');
          candidateCounts.set(key, (candidateCounts.get(key) || 0) + 1);
        }
      }
    }

    // Filter kandidat yang memenuhi minSupport -> L_k
    const Lk: FrequentItemset[] = [];
    const nextPrevFrequent: string[][] = [];

    for (const cand of candidates) {
      const key = cand.join('|');
      const count = candidateCounts.get(key) || 0;
      if (count >= minSupportCount) {
        const itemset: FrequentItemset = {
          items: cand,
          itemNames: cand.map(id => nameLookup[id] || id),
          supportCount: count,
          support: count / N,
        };
        Lk.push(itemset);
        nextPrevFrequent.push(cand);
        allFrequentMap.set(key, itemset);
      }
    }

    Lk.sort((a, b) => b.supportCount - a.supportCount);
    if (Lk.length > 0) {
      frequentItemsetsByK.push({ k, itemsets: Lk });
      prevFrequent = nextPrevFrequent;
      k++;
    } else {
      break;
    }
  }

  // ==========================================
  // TAHAP 3: PEMBENTUKAN ATURAN ASOSIASI (RULES)
  // ==========================================
  const rules: AssociationRule[] = [];

  // Rules dibentuk dari itemset dengan ukuran k >= 2
  const multiItemsets = frequentItemsetsByK
    .filter(group => group.k >= 2)
    .flatMap(group => group.itemsets);

  for (const itemset of multiItemsets) {
    const items = itemset.items;
    const itemsetSize = items.length;
    const jointSupport = itemset.support;

    // Hasilkan semua kemungkinan premis / anteseden non-kosong
    for (let antSize = 1; antSize < itemsetSize; antSize++) {
      const antecedentCombos = getCombinations(items, antSize);

      for (const antecedent of antecedentCombos) {
        const antecedentSorted = [...antecedent].sort();
        const consequent = items.filter(it => !antecedentSorted.includes(it)).sort();

        const antKey = antecedentSorted.join('|');
        const conKey = consequent.join('|');

        const antItemset = allFrequentMap.get(antKey);
        const conItemset = allFrequentMap.get(conKey);

        if (!antItemset) continue;

        const antSupport = antItemset.support;
        const conSupport = conItemset ? conItemset.support : (itemCounts.get(conKey) || 1) / N;

        const confidence = jointSupport / antSupport;

        if (confidence >= minConfidence) {
          const lift = conSupport > 0 ? confidence / conSupport : 1;

          let interpretation = '';
          let recommendationType: AssociationRule['recommendationType'] = 'INDEPENDENT';

          if (lift > 1.2) {
            recommendationType = 'STRONG_POSITIVE';
            interpretation = `Korelasi Sangat Kuat: Pelanggan yang membeli ${antecedent.map(id => nameLookup[id] || id).join(', ')} memiliki kecenderungan ${(lift).toFixed(2)}x lebih tinggi untuk juga membeli ${consequent.map(id => nameLookup[id] || id).join(', ')}. Sangat direkomendasikan untuk paket bundling atau penataan rak berdampingan.`;
          } else if (lift > 1.0) {
            recommendationType = 'MODERATE_POSITIVE';
            interpretation = `Korelasi Positif: Pembelian berkorelasi positif dengan kecenderungan ${(lift).toFixed(2)}x lebih tinggi dari probabilitas acak. Cocok untuk saran kasir (cross-selling).`;
          } else if (Math.abs(lift - 1.0) <= 0.05) {
            recommendationType = 'INDEPENDENT';
            interpretation = `Independen: Hubungan antara kedua produk mendekati acak (tidak saling mempengaruhi).`;
          } else {
            recommendationType = 'NEGATIVE';
            interpretation = `Korelasi Negatif: Produk ini cenderung bersifat substitutif (saling menggantikan).`;
          }

          rules.push({
            antecedent: antecedentSorted,
            antecedentNames: antecedentSorted.map(id => nameLookup[id] || id),
            consequent,
            consequentNames: consequent.map(id => nameLookup[id] || id),
            support: jointSupport,
            antecedentSupport: antSupport,
            consequentSupport: conSupport,
            confidence,
            lift,
            interpretation,
            recommendationType,
          });
        }
      }
    }
  }

  // Urutkan aturan berdasarkan Lift tertinggi lalu Confidence tertinggi
  rules.sort((a, b) => {
    if (b.lift !== a.lift) return b.lift - a.lift;
    return b.confidence - a.confidence;
  });

  const allFrequentItemsets = frequentItemsetsByK.flatMap(g => g.itemsets);

  return {
    totalTransactions: transactions.length,
    analyzedTransactions: N,
    minSupport,
    minConfidence,
    frequentItemsetsByK,
    allFrequentItemsets,
    rules,
    topRecommendations: rules.filter(r => r.lift > 1.0).slice(0, 10),
  };
}

/**
 * Mendapatkan rekomendasi produk pelengkap (cross-selling) berdasarkan item yang ada di keranjang kasir
 */
export function getCrossSellingSuggestions(
  currentCartProductIds: string[],
  rules: AssociationRule[],
  limit: number = 3
): {
  productId: string;
  productName: string;
  confidence: number;
  lift: number;
  reason: string;
}[] {
  if (currentCartProductIds.length === 0 || rules.length === 0) return [];

  const cartSet = new Set(currentCartProductIds);
  const suggestionsMap = new Map<string, { productId: string; productName: string; confidence: number; lift: number; reason: string }>();

  for (const rule of rules) {
    if (rule.lift <= 1.0) continue; // Hanya rekomendasi dengan korelasi positif

    // Periksa apakah semua item di anteseden ada di keranjang kasir
    const matchAntecedent = rule.antecedent.every(id => cartSet.has(id));

    if (matchAntecedent) {
      // Periksa konsekuensi: ambil item konsekuensi yang BELUM ada di keranjang
      for (let i = 0; i < rule.consequent.length; i++) {
        const conId = rule.consequent[i];
        const conName = rule.consequentNames[i] || conId;

        if (!cartSet.has(conId) && !suggestionsMap.has(conId)) {
          suggestionsMap.set(conId, {
            productId: conId,
            productName: conName,
            confidence: rule.confidence,
            lift: rule.lift,
            reason: `Sering dibeli bersama ${rule.antecedentNames.join(' + ')} (Akurasi: ${(rule.confidence * 100).toFixed(0)}%, Korelasi: ${rule.lift.toFixed(1)}x)`,
          });
        }
      }
    }
  }

  return Array.from(suggestionsMap.values())
    .sort((a, b) => b.lift - a.lift)
    .slice(0, limit);
}

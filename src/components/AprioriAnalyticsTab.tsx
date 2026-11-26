import React, { useState, useMemo } from 'react';
import type { SalesTransaction, Product } from '../types';
import { runApriori, type AssociationRule, type AprioriAnalysisResult } from '../utils/apriori';
import { 
  Sparkles, TrendingUp, Layers, ShoppingBag, 
  ArrowRight, Download, CheckCircle2, AlertCircle, Info,
  Lightbulb, Search, X, Eye, Sliders, ChevronDown, ChevronUp
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface Props {
  sales: SalesTransaction[];
  products: Product[];
}

export const AprioriAnalyticsTab: React.FC<Props> = ({ sales, products }) => {
  // Parameter State
  const [minSupportPct, setMinSupportPct] = useState<number>(3); // 3% default
  const [minConfidencePct, setMinConfidencePct] = useState<number>(30); // 30% default
  const [timeFilter, setTimeFilter] = useState<'all' | '30' | '7'>('all');
  const [showParameters, setShowParameters] = useState<boolean>(true); // collapsible parameters

  // Navigation State
  const [activeSubTab, setActiveSubTab] = useState<'rules' | 'steps' | 'simulator'>('rules');

  // Table Filter & Search State
  const [ruleSearch, setRuleSearch] = useState<string>('');
  const [ruleStrengthFilter, setRuleStrengthFilter] = useState<'all' | 'strong' | 'moderate'>('all');
  const [ruleSortBy, setRuleSortBy] = useState<'lift' | 'confidence' | 'support'>('lift');

  // Selected Rule for Detail Modal
  const [selectedRule, setSelectedRule] = useState<AssociationRule | null>(null);

  // Simulator State
  const [simCart, setSimCart] = useState<string[]>([]);
  const [simSearch, setSimSearch] = useState<string>('');

  // Mapping lookup nama produk
  const productNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const p of products) {
      map[p.id] = p.name;
    }
    return map;
  }, [products]);

  // Filter transaksi berdasarkan rentang waktu
  const filteredSales = useMemo(() => {
    if (timeFilter === 'all') return sales;
    const now = new Date().getTime();
    const days = timeFilter === '30' ? 30 : 7;
    const threshold = now - (days * 24 * 60 * 60 * 1000);
    return sales.filter(s => new Date(s.date).getTime() >= threshold);
  }, [sales, timeFilter]);

  // Eksekusi Algoritma Apriori
  const aprioriResult: AprioriAnalysisResult = useMemo(() => {
    return runApriori(
      filteredSales,
      minSupportPct / 100,
      minConfidencePct / 100,
      productNameMap
    );
  }, [filteredSales, minSupportPct, minConfidencePct, productNameMap]);

  // Filter & Sort Aturan
  const processedRules = useMemo(() => {
    let result = [...aprioriResult.rules];

    // Filter by search query
    if (ruleSearch.trim()) {
      const q = ruleSearch.toLowerCase();
      result = result.filter(r => 
        r.antecedentNames.some(n => n.toLowerCase().includes(q)) ||
        r.consequentNames.some(n => n.toLowerCase().includes(q))
      );
    }

    // Filter by strength
    if (ruleStrengthFilter === 'strong') {
      result = result.filter(r => r.lift > 1.2);
    } else if (ruleStrengthFilter === 'moderate') {
      result = result.filter(r => r.lift > 1.0 && r.lift <= 1.2);
    }

    // Sort
    result.sort((a, b) => {
      if (ruleSortBy === 'lift') return b.lift - a.lift;
      if (ruleSortBy === 'confidence') return b.confidence - a.confidence;
      return b.support - a.support;
    });

    return result;
  }, [aprioriResult.rules, ruleSearch, ruleStrengthFilter, ruleSortBy]);

  // Ekspor hasil aturan ke Excel
  const handleExportExcel = () => {
    if (aprioriResult.rules.length === 0) {
      alert('Belum ada aturan asosiasi yang memenuhi ambang batas untuk diekspor.');
      return;
    }

    const dataRows = aprioriResult.rules.map((rule, idx) => ({
      No: idx + 1,
      'Premis / Jika Membeli (Antecedent)': rule.antecedentNames.join(' + '),
      'Maka Membeli (Consequent)': rule.consequentNames.join(' + '),
      'Support P(A∪B)': (rule.support * 100).toFixed(2) + '%',
      'Confidence P(B|A)': (rule.confidence * 100).toFixed(2) + '%',
      'Lift Ratio': rule.lift.toFixed(3),
      'Kategori Korelasi': rule.recommendationType === 'STRONG_POSITIVE' ? 'Korelasi Sangat Kuat' : 'Korelasi Positif',
      'Interpretasi Bisnis': rule.interpretation,
    }));

    const ws = XLSX.utils.json_to_sheet(dataRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Aturan Asosiasi Apriori');
    XLSX.writeFile(wb, `Hasil_Apriori_Market_Basket_Analysis_${Date.now()}.xlsx`);
  };

  // Hitung rekomendasi simulator kasir
  const simulatorRecommendations = useMemo(() => {
    if (simCart.length === 0) return [];
    const cartSet = new Set(simCart);
    const results: { rule: AssociationRule; recommendedItem: string; recommendedId: string }[] = [];

    for (const rule of aprioriResult.rules) {
      if (rule.lift <= 1.0) continue;
      const matchAntecedent = rule.antecedent.every(id => cartSet.has(id));
      if (matchAntecedent) {
        for (let i = 0; i < rule.consequent.length; i++) {
          const conId = rule.consequent[i];
          if (!cartSet.has(conId)) {
            results.push({
              rule,
              recommendedItem: rule.consequentNames[i] || conId,
              recommendedId: conId,
            });
          }
        }
      }
    }
    return results;
  }, [simCart, aprioriResult.rules]);

  const maxLift = aprioriResult.rules.length > 0 
    ? Math.max(...aprioriResult.rules.map(r => r.lift)).toFixed(2) 
    : '0.00';

  const strongCount = aprioriResult.rules.filter(r => r.lift > 1.2).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, minHeight: 0 }}>
      {/* =====================================================================
          1. TOP 4 APRIORI KPI CARDS (MENGGANTIKAN KPI KEUANGAN AGAR LEGA)
          ===================================================================== */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '12px',
        flexShrink: 0
      }}>
        {/* Card 1: TOTAL TRANSAKSI DIANALISIS */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '14px 18px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              TRANSAKSI DIANALISIS
            </span>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#475569'
            }}>
              <ShoppingBag size={17} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a', lineHeight: 1.1 }}>
            {aprioriResult.analyzedTransactions} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Nota</span>
          </div>
          <span style={{ fontSize: '11.5px', color: '#16a34a', marginTop: '4px', fontWeight: 700 }}>
            ● Keranjang belanja valid
          </span>
        </div>

        {/* Card 2: FREQUENT ITEMSETS */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '14px 18px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#0284c7', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              FREQUENT ITEMSETS
            </span>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#0284c7'
            }}>
              <Layers size={17} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#0284c7', lineHeight: 1.1 }}>
            {aprioriResult.allFrequentItemsets.length} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Pola</span>
          </div>
          <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
            {aprioriResult.frequentItemsetsByK.map(g => `L${g.k}:${g.itemsets.length}`).join(' | ') || '0 pola'}
          </span>
        </div>

        {/* Card 3: ATURAN ASOSIASI */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '14px 18px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              ATURAN ASOSIASI (RULES)
            </span>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#16a34a'
            }}>
              <Sparkles size={17} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#16a34a', lineHeight: 1.1 }}>
            {aprioriResult.rules.length} <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Rules</span>
          </div>
          <span style={{ fontSize: '11.5px', color: '#15803d', marginTop: '4px', fontWeight: 700 }}>
            ● {strongCount} Aturan Korelasi Sangat Kuat
          </span>
        </div>

        {/* Card 4: KORELASI TERTINGGI (LIFT) */}
        <div style={{
          background: '#ffffff', borderRadius: '16px', padding: '14px 18px',
          border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          display: 'flex', flexDirection: 'column'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              KORELASI TERTINGGI (LIFT)
            </span>
            <div style={{
              width: '34px', height: '34px', borderRadius: '10px',
              background: '#ede9fe', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#7c3aed'
            }}>
              <TrendingUp size={17} />
            </div>
          </div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#7c3aed', lineHeight: 1.1 }}>
            {maxLift}x <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>Korelasi</span>
          </div>
          <span style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
            Peningkatan probabilitas pembelian
          </span>
        </div>
      </div>

      {/* =====================================================================
          2. WORKSPACE UTAMA: FULL-HEIGHT TABLE VIEW
          ===================================================================== */}
      <div className="desktop-table-view" style={{
        background: '#ffffff', borderRadius: '16px', border: '1px solid #e2e8f0',
        boxShadow: '0 2px 8px rgba(0,0,0,0.03)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0
      }}>
        {/* ROW 1: HEADER & ACTION CONTROLS */}
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid #f1f5f9', background: '#ffffff',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', flexShrink: 0
        }}>
          {/* Sub-Tabs Switcher */}
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '9px', gap: '3px' }}>
            <button
              type="button"
              onClick={() => setActiveSubTab('rules')}
              style={{
                border: 'none',
                background: activeSubTab === 'rules' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'rules' ? '#dc2626' : '#475569',
                borderRadius: '7px', padding: '6px 14px',
                fontSize: '12px', fontWeight: activeSubTab === 'rules' ? 800 : 600,
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                boxShadow: activeSubTab === 'rules' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              <TrendingUp size={14} />
              <span>Aturan Asosiasi</span>
              <span style={{
                fontSize: '10px', fontWeight: 800, padding: '1px 6px', borderRadius: '999px',
                background: activeSubTab === 'rules' ? '#fee2e2' : '#e2e8f0',
                color: activeSubTab === 'rules' ? '#dc2626' : '#64748b'
              }}>
                {aprioriResult.rules.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('steps')}
              style={{
                border: 'none',
                background: activeSubTab === 'steps' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'steps' ? '#dc2626' : '#475569',
                borderRadius: '7px', padding: '6px 14px',
                fontSize: '12px', fontWeight: activeSubTab === 'steps' ? 800 : 600,
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                boxShadow: activeSubTab === 'steps' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              <Layers size={14} />
              <span>Tahapan Algoritma Apriori</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveSubTab('simulator')}
              style={{
                border: 'none',
                background: activeSubTab === 'simulator' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'simulator' ? '#dc2626' : '#475569',
                borderRadius: '7px', padding: '6px 14px',
                fontSize: '12px', fontWeight: activeSubTab === 'simulator' ? 800 : 600,
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer',
                boxShadow: activeSubTab === 'simulator' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s'
              }}
            >
              <Lightbulb size={14} />
              <span>Simulator Rekomendasi Kasir</span>
            </button>
          </div>

          {/* Right Action Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Periode filter */}
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '2px', borderRadius: '8px', gap: '2px' }}>
              <button
                type="button"
                onClick={() => setTimeFilter('all')}
                style={{
                  border: 'none', background: timeFilter === 'all' ? '#ffffff' : 'transparent',
                  color: timeFilter === 'all' ? '#dc2626' : '#64748b',
                  fontSize: '11px', fontWeight: timeFilter === 'all' ? 800 : 600,
                  padding: '5px 10px', borderRadius: '6px', cursor: 'pointer',
                  boxShadow: timeFilter === 'all' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                Semua Nota
              </button>
              <button
                type="button"
                onClick={() => setTimeFilter('30')}
                style={{
                  border: 'none', background: timeFilter === '30' ? '#ffffff' : 'transparent',
                  color: timeFilter === '30' ? '#dc2626' : '#64748b',
                  fontSize: '11px', fontWeight: timeFilter === '30' ? 800 : 600,
                  padding: '5px 10px', borderRadius: '6px', cursor: 'pointer',
                  boxShadow: timeFilter === '30' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                30 Hari
              </button>
              <button
                type="button"
                onClick={() => setTimeFilter('7')}
                style={{
                  border: 'none', background: timeFilter === '7' ? '#ffffff' : 'transparent',
                  color: timeFilter === '7' ? '#dc2626' : '#64748b',
                  fontSize: '11px', fontWeight: timeFilter === '7' ? 800 : 600,
                  padding: '5px 10px', borderRadius: '6px', cursor: 'pointer',
                  boxShadow: timeFilter === '7' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none'
                }}
              >
                7 Hari
              </button>
            </div>

            {/* Toggle Parameter Panel Button */}
            <button
              type="button"
              onClick={() => setShowParameters(!showParameters)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                background: showParameters ? '#fee2e2' : '#f8fafc',
                color: showParameters ? '#dc2626' : '#334155',
                border: '1px solid',
                borderColor: showParameters ? '#fca5a5' : '#cbd5e1',
                padding: '6px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              <Sliders size={13} />
              <span>Parameter (Sup: {minSupportPct}% | Conf: {minConfidencePct}%)</span>
              {showParameters ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>

            {/* Export Excel Button */}
            <button
              type="button"
              onClick={handleExportExcel}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                background: '#16a34a', color: '#ffffff', border: 'none',
                padding: '6px 12px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700,
                cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.08)'
              }}
            >
              <Download size={13} />
              <span>Ekspor Excel</span>
            </button>
          </div>
        </div>

        {/* COLLAPSIBLE PARAMETER STRIP */}
        {showParameters && (
          <div style={{
            background: '#fafafa', borderBottom: '1px solid #f1f5f9',
            padding: '10px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', flexShrink: 0
          }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                  Minimum Support (Ambang Frekuensi P(A ∪ B)):
                </span>
                <span style={{ background: '#fee2e2', color: '#b91c1c', fontSize: '11px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px' }}>
                  {minSupportPct}% (Min. {Math.max(1, Math.ceil((minSupportPct / 100) * aprioriResult.analyzedTransactions))} transaksi)
                </span>
              </div>
              <input
                type="range" min="1" max="50" value={minSupportPct}
                onChange={(e) => setMinSupportPct(Number(e.target.value))}
                style={{ width: '100%', height: '5px', accentColor: '#dc2626', cursor: 'pointer' }}
              />
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#334155' }}>
                  Minimum Confidence (Derajat Kepastian P(B | A)):
                </span>
                <span style={{ background: '#fef3c7', color: '#b45309', fontSize: '11px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px' }}>
                  {minConfidencePct}% Peluang
                </span>
              </div>
              <input
                type="range" min="10" max="90" step="5" value={minConfidencePct}
                onChange={(e) => setMinConfidencePct(Number(e.target.value))}
                style={{ width: '100%', height: '5px', accentColor: '#d97706', cursor: 'pointer' }}
              />
            </div>
          </div>
        )}

        {/* =====================================================================
            SUB-TAB 1: TABEL ATURAN ASOSIASI (LUAS & LEGA)
            ===================================================================== */}
        {activeSubTab === 'rules' && (
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            {/* Table Filter Toolbar */}
            <div style={{
              padding: '10px 18px', borderBottom: '1px solid #f1f5f9', background: '#ffffff',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0
            }}>
              <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Cari nama barang di aturan..."
                  value={ruleSearch}
                  onChange={(e) => setRuleSearch(e.target.value)}
                  style={{
                    width: '100%', paddingLeft: '32px', paddingRight: ruleSearch ? '28px' : '10px',
                    height: '34px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    fontSize: '12px', color: '#0f172a', background: '#ffffff'
                  }}
                />
                {ruleSearch && (
                  <button
                    type="button"
                    onClick={() => setRuleSearch('')}
                    style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <select
                  value={ruleStrengthFilter}
                  onChange={(e) => setRuleStrengthFilter(e.target.value as any)}
                  style={{
                    border: '1px solid #cbd5e1', borderRadius: '8px',
                    height: '34px', padding: '0 10px', fontSize: '12px', background: '#ffffff', color: '#1e293b'
                  }}
                >
                  <option value="all">Semua Derajat Korelasi</option>
                  <option value="strong">Korelasi Sangat Kuat (Lift &gt; 1.2)</option>
                  <option value="moderate">Korelasi Positif (Lift 1.0 - 1.2)</option>
                </select>

                <select
                  value={ruleSortBy}
                  onChange={(e) => setRuleSortBy(e.target.value as any)}
                  style={{
                    border: '1px solid #cbd5e1', borderRadius: '8px',
                    height: '34px', padding: '0 10px', fontSize: '12px', background: '#ffffff', color: '#1e293b'
                  }}
                >
                  <option value="lift">Urutkan: Lift Tertinggi</option>
                  <option value="confidence">Urutkan: Confidence Tertinggi</option>
                  <option value="support">Urutkan: Support Tertinggi</option>
                </select>

                <span style={{
                  background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0',
                  borderRadius: '999px', padding: '4px 12px', fontSize: '11.5px', fontWeight: 700
                }}>
                  {processedRules.length} Aturan Terbentuk
                </span>
              </div>
            </div>

            {/* Table Data View */}
            <div style={{ width: '100%', flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <table style={{ width: '100%', minWidth: '1150px', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, zIndex: 10 }}>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '50px', textAlign: 'center' }}>NO</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '300px' }}>JIKA MEMBELI (PREMIS A)</th>
                    <th style={{ padding: '12px 6px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '40px', textAlign: 'center' }}></th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '300px' }}>MAKA MEMBELI (KONSEKUENSI B)</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '110px' }}>SUPPORT</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '120px' }}>CONFIDENCE</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '130px' }}>LIFT RATIO</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', width: '200px' }}>STRATEGI REKOMENDASI</th>
                    <th style={{ padding: '12px 16px', color: '#64748b', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', textAlign: 'center', width: '90px' }}>RUMUS</th>
                  </tr>
                </thead>
                <tbody>
                  {processedRules.length === 0 ? (
                    <tr>
                      <td colSpan={9} style={{ textAlign: 'center', padding: '80px 20px', color: '#64748b' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                          <AlertCircle size={44} style={{ opacity: 0.3, color: '#f59e0b' }} />
                          <div style={{ fontSize: '15px', fontWeight: 700, color: '#334155' }}>Tidak Ada Aturan Asosiasi Yang Cocok</div>
                          <div style={{ fontSize: '12.5px', color: '#94a3b8' }}>
                            Cobalah turunkan nilai Minimum Support atau Minimum Confidence pada panel kontrol di atas.
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    processedRules.map((rule, idx) => {
                      const isStrong = rule.lift > 1.2;
                      return (
                        <tr 
                          key={idx}
                          style={{
                            borderBottom: '1px solid #f1f5f9',
                            background: idx % 2 === 0 ? '#ffffff' : '#fafafa',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? '#ffffff' : '#fafafa')}
                        >
                          {/* No */}
                          <td style={{ padding: '14px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>
                            {idx + 1}
                          </td>

                          {/* Antecedent A */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {rule.antecedentNames.map((name, i) => (
                                <span key={i} style={{
                                  background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3',
                                  borderRadius: '8px', padding: '4px 10px', fontSize: '12px', fontWeight: 700,
                                  display: 'inline-flex', alignItems: 'center'
                                }}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Arrow */}
                          <td style={{ padding: '14px 6px', textAlign: 'center' }}>
                            <div style={{
                              width: '26px', height: '26px', borderRadius: '50%', background: '#f1f5f9',
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                              <ArrowRight size={14} color="#64748b" />
                            </div>
                          </td>

                          {/* Consequent B */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {rule.consequentNames.map((name, i) => (
                                <span key={i} style={{
                                  background: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0',
                                  borderRadius: '8px', padding: '4px 10px', fontSize: '12px', fontWeight: 800,
                                  display: 'inline-flex', alignItems: 'center'
                                }}>
                                  {name}
                                </span>
                              ))}
                            </div>
                          </td>

                          {/* Support */}
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e293b' }}>
                              {(rule.support * 100).toFixed(1)}%
                            </div>
                            <div style={{ fontSize: '10.5px', color: '#94a3b8' }}>
                              P(A∪B)
                            </div>
                          </td>

                          {/* Confidence */}
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <span style={{
                              background: rule.confidence >= 0.7 ? '#fef3c7' : '#f1f5f9',
                              color: rule.confidence >= 0.7 ? '#b45309' : '#475569',
                              padding: '4px 10px', borderRadius: '7px', fontSize: '12px', fontWeight: 800
                            }}>
                              {(rule.confidence * 100).toFixed(1)}%
                            </span>
                          </td>

                          {/* Lift Ratio */}
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <div style={{
                              background: isStrong ? '#ede9fe' : '#e0f2fe',
                              color: isStrong ? '#6d28d9' : '#0369a1',
                              padding: '5px 10px', borderRadius: '7px', fontSize: '12.5px', fontWeight: 900,
                              display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}>
                              <span>{rule.lift.toFixed(2)}x</span>
                            </div>
                            <div style={{ fontSize: '10.5px', fontWeight: 700, color: isStrong ? '#7c3aed' : '#0284c7', marginTop: '3px' }}>
                              {isStrong ? 'Sangat Kuat' : 'Korelasi Positif'}
                            </div>
                          </td>

                          {/* Strategi Rekomendasi Badge */}
                          <td style={{ padding: '14px 16px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {isStrong ? (
                                <span style={{
                                  background: '#fdf4ff', color: '#a21caf', border: '1px solid #f5d0fe',
                                  fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
                                  display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content'
                                }}>
                                  📦 Paket Bundling Promo
                                </span>
                              ) : (
                                <span style={{
                                  background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0',
                                  fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '6px',
                                  display: 'inline-flex', alignItems: 'center', gap: '4px', width: 'fit-content'
                                }}>
                                  🛍️ Cross-Selling Kasir
                                </span>
                              )}
                              <span style={{ fontSize: '11px', color: '#64748b' }}>
                                Rak Berdampingan
                              </span>
                            </div>
                          </td>

                          {/* Action Detail Button */}
                          <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                            <button
                              type="button"
                              onClick={() => setSelectedRule(rule)}
                              style={{
                                background: '#ffffff', border: '1px solid #cbd5e1', color: '#334155',
                                padding: '5px 10px', borderRadius: '7px', fontSize: '11.5px', fontWeight: 700,
                                cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px'
                              }}
                            >
                              <Eye size={13} /> Info
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* =====================================================================
            SUB-TAB 2: TAHAPAN ALGORITMA APRIORI (C1/L1, C2/L2, dst.)
            ===================================================================== */}
        {activeSubTab === 'steps' && (
          <div style={{
            padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0, overflowY: 'auto'
          }}>
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '12px',
              padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: '12px', fontSize: '12.5px', color: '#0369a1'
            }}>
              <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontWeight: 800, marginBottom: '2px' }}>Penjelasan Ilmiah Sesuai Metodologi Tugas Akhir:</div>
                Algoritma Apriori menggunakan prinsip <b>Apriori Property</b>: <i>seluruh himpunan bagian (subset) dari frequent itemset pasti juga berstatus frequent</i>. Di bawah ini adalah rincian kandidat $L_k$ yang lolos dari batas minimum support $\ge {minSupportPct}\%$.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
              {aprioriResult.frequentItemsetsByK.map((group) => (
                <div key={group.k} style={{
                  background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0',
                  overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                }}>
                  <div style={{
                    background: '#f8fafc', padding: '12px 16px', borderBottom: '1px solid #e2e8f0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        background: '#dc2626', color: '#ffffff', width: '22px', height: '22px',
                        borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800
                      }}>
                        {group.k}
                      </span>
                      <span>Frequent {group.k}-Itemset (L{group.k})</span>
                    </div>
                    <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b' }}>
                      {group.itemsets.length} Pola
                    </span>
                  </div>

                  <div style={{ maxHeight: '340px', overflowY: 'auto', padding: '10px' }}>
                    {group.itemsets.map((itemset, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 12px', borderRadius: '8px', background: i % 2 === 0 ? '#ffffff' : '#f8fafc',
                        fontSize: '12px', borderBottom: '1px solid #f1f5f9'
                      }}>
                        <div style={{ fontWeight: 600, color: '#1e293b', flex: 1, paddingRight: '8px' }}>
                          {itemset.itemNames.join(' + ')}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                          <span style={{ color: '#64748b', fontSize: '11px' }}>{itemset.supportCount}x beli</span>
                          <span style={{
                            background: '#fee2e2', color: '#b91c1c', fontWeight: 800,
                            padding: '2px 8px', borderRadius: '5px', fontSize: '11px'
                          }}>
                            {(itemset.support * 100).toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* =====================================================================
            SUB-TAB 3: SIMULATOR REKOMENDASI KASIR REALTIME
            ===================================================================== */}
        {activeSubTab === 'simulator' && (
          <div style={{
            padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0, overflowY: 'auto'
          }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Lightbulb size={18} color="#d97706" />
                Simulator Uji Rekomendasi Kasir (Realtime Cross-Selling)
              </h3>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                Pilih produk di bawah untuk mensimulasikan barang yang sedang dimasukkan kasir ke keranjang belanja.
              </p>
            </div>

            {/* Search Simulator Products */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <div style={{ position: 'relative', width: '300px' }}>
                <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input
                  type="text"
                  placeholder="Cari produk katalog..."
                  value={simSearch}
                  onChange={(e) => setSimSearch(e.target.value)}
                  style={{
                    width: '100%', paddingLeft: '32px', paddingRight: '10px',
                    height: '36px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    fontSize: '12px', color: '#0f172a'
                  }}
                />
              </div>
              {simCart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSimCart([])}
                  style={{
                    background: '#fee2e2', color: '#dc2626', border: 'none',
                    padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Kosongkan Keranjang ({simCart.length})
                </button>
              )}
            </div>

            {/* Product Chips Selection */}
            <div style={{
              maxHeight: '180px', overflowY: 'auto', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: '12px', padding: '12px',
              display: 'flex', flexWrap: 'wrap', gap: '8px'
            }}>
              {products
                .filter(p => !simSearch || p.name.toLowerCase().includes(simSearch.toLowerCase()))
                .map(p => {
                  const isSelected = simCart.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) setSimCart(simCart.filter(id => id !== p.id));
                        else setSimCart([...simCart, p.id]);
                      }}
                      style={{
                        border: isSelected ? '1px solid #dc2626' : '1px solid #cbd5e1',
                        background: isSelected ? '#dc2626' : '#ffffff',
                        color: isSelected ? '#ffffff' : '#1e293b',
                        borderRadius: '8px', padding: '6px 12px', fontSize: '12px',
                        fontWeight: isSelected ? 800 : 600, cursor: 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        transition: 'all 0.15s'
                      }}
                    >
                      {isSelected && <CheckCircle2 size={13} color="#ffffff" />}
                      <span>{p.name}</span>
                    </button>
                  );
                })}
            </div>

            {/* Dual Panel Simulator View */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Left: Cart Items */}
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Keranjang Belanja Pelanggan ({simCart.length} Item):
                </div>
                {simCart.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: '#94a3b8', fontSize: '12.5px' }}>
                    Keranjang masih kosong. Pilih produk di atas untuk memulai simulasi.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {simCart.map(id => (
                      <div key={id} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: '#ffffff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #e2e8f0',
                        fontSize: '12.5px', fontWeight: 700, color: '#1e293b'
                      }}>
                        <span>{productNameMap[id] || id}</span>
                        <button
                          type="button"
                          onClick={() => setSimCart(simCart.filter(x => x !== id))}
                          style={{ border: 'none', background: 'none', color: '#dc2626', cursor: 'pointer', fontWeight: 700, fontSize: '11.5px' }}
                        >
                          Hapus
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Triggered AI Recommendations */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px' }}>
                <div style={{ fontSize: '11.5px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Sparkles size={15} color="#16a34a" />
                  Rekomendasi Kasir Yang Otomatis Muncul:
                </div>
                {simulatorRecommendations.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 10px', color: '#15803d', fontSize: '12.5px' }}>
                    {simCart.length === 0 
                      ? 'Masukkan produk ke keranjang untuk memicu saran AI.' 
                      : 'Belum ada aturan asosiasi yang cocok dengan kombinasi barang ini.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {simulatorRecommendations.map((rec, i) => (
                      <div key={i} style={{
                        background: '#ffffff', border: '1px solid #86efac', borderRadius: '10px', padding: '12px 16px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                      }}>
                        <div>
                          <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a' }}>
                            ✨ {rec.recommendedItem}
                          </div>
                          <div style={{ fontSize: '11.5px', color: '#15803d', marginTop: '3px' }}>
                            Akurasi: <b>{(rec.rule.confidence * 100).toFixed(0)}%</b> • Lift: <b>{rec.rule.lift.toFixed(2)}x</b>
                          </div>
                        </div>
                        <span style={{
                          background: '#dcfce7', color: '#166534', fontSize: '11px', fontWeight: 800,
                          padding: '4px 10px', borderRadius: '6px'
                        }}>
                          Cross-Selling
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* =====================================================================
          MODAL DETAIL ATURAN ASOSIASI (POP-UP PENJELASAN AKADEMIS & BISNIS)
          ===================================================================== */}
      {selectedRule && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '16px'
        }}>
          <div style={{
            background: '#ffffff', borderRadius: '16px', width: '100%', maxWidth: '520px',
            overflow: 'hidden', boxShadow: '0 20px 40px rgba(0,0,0,0.2)', border: '1px solid #e2e8f0'
          }}>
            {/* Modal Header */}
            <div style={{
              background: '#0f172a', color: '#ffffff', padding: '14px 18px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 800 }}>
                <Sparkles size={16} color="#fbbf24" />
                <span>Rincian Aturan & Evaluasi Akademis</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRule(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* Formula Card */}
              <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', marginBottom: '6px' }}>
                  Formulasi Aturan Asosiasi (X ⇒ Y):
                </div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ color: '#be123c' }}>{selectedRule.antecedentNames.join(' + ')}</span>
                  <ArrowRight size={14} color="#64748b" />
                  <span style={{ color: '#15803d' }}>{selectedRule.consequentNames.join(' + ')}</span>
                </div>
              </div>

              {/* Metric Breakdown Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                <div style={{ background: '#f1f5f9', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 800 }}>SUPPORT</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#0f172a', marginTop: '2px' }}>
                    {(selectedRule.support * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#64748b' }}>P(A ∪ B)</div>
                </div>

                <div style={{ background: '#fef3c7', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#b45309', fontWeight: 800 }}>CONFIDENCE</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#b45309', marginTop: '2px' }}>
                    {(selectedRule.confidence * 100).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#b45309' }}>P(B | A)</div>
                </div>

                <div style={{ background: '#ede9fe', padding: '10px', borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#6d28d9', fontWeight: 800 }}>LIFT RATIO</div>
                  <div style={{ fontSize: '16px', fontWeight: 900, color: '#6d28d9', marginTop: '2px' }}>
                    {selectedRule.lift.toFixed(2)}x
                  </div>
                  <div style={{ fontSize: '9.5px', color: '#6d28d9' }}>Korelasi</div>
                </div>
              </div>

              {/* Interpretation Box */}
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '12px', borderRadius: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 800, color: '#15803d', textTransform: 'uppercase', marginBottom: '4px' }}>
                  Interpretasi & Rekomendasi Bisnis:
                </div>
                <p style={{ fontSize: '12px', color: '#166534', margin: 0, lineHeight: 1.5 }}>
                  {selectedRule.interpretation}
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setSelectedRule(null)}
                  style={{
                    background: '#0f172a', color: '#ffffff', border: 'none',
                    padding: '8px 16px', borderRadius: '8px', fontSize: '12px', fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  Tutup Rincian
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { useSettingsStore, DEFAULT_INVOICE_FOOTER, defaultInvoiceHeader } from '../../store/useSettingsStore';
import { Settings as SettingsIcon, Save, Percent, RefreshCw, Receipt } from 'lucide-react';

const ROUNDING_OPTIONS = [
  { label: 'Tanpa Pembulatan', value: 0 },
  { label: 'Bulatkan ke 100', value: 100 },
  { label: 'Bulatkan ke 500', value: 500 },
  { label: 'Bulatkan ke 1.000', value: 1000 },
];

type TabId = 'general' | 'tax' | 'rounding' | 'invoice';

const TABS: { id: TabId; label: string; desc: string; Icon: React.ElementType }[] = [
  { id: 'general', label: 'Umum', desc: 'Nama aplikasi', Icon: SettingsIcon },
  { id: 'tax', label: 'PPN / Pajak', desc: 'Aktif & persentase', Icon: Percent },
  { id: 'rounding', label: 'Pembulatan', desc: 'Total tagihan', Icon: RefreshCw },
  { id: 'invoice', label: 'Invoice', desc: 'Header & footer struk', Icon: Receipt },
];

const Settings: React.FC = () => {
  const { appName, setAppName, taxEnabled, setTaxEnabled, taxRate, setTaxRate, roundingUnit, setRoundingUnit, invoiceHeader, setInvoiceHeader, invoiceFooter, setInvoiceFooter } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [localAppName, setLocalAppName] = useState(appName);
  const [localTaxEnabled, setLocalTaxEnabled] = useState(taxEnabled);
  const [localTaxRate, setLocalTaxRate] = useState(taxRate);
  const [localRounding, setLocalRounding] = useState(roundingUnit);
  const effectiveHeader = (invoiceHeader || '').trim() ? invoiceHeader : defaultInvoiceHeader(appName);
  const effectiveFooter = (invoiceFooter || '').trim() ? invoiceFooter : DEFAULT_INVOICE_FOOTER;
  const [localHeader, setLocalHeader] = useState(effectiveHeader);
  const [localFooter, setLocalFooter] = useState(effectiveFooter);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setLocalAppName(appName);
    setLocalTaxEnabled(taxEnabled);
    setLocalTaxRate(taxRate);
    setLocalRounding(roundingUnit);
    setLocalHeader(effectiveHeader);
    setLocalFooter(effectiveFooter);
  }, [appName, taxEnabled, taxRate, roundingUnit, effectiveHeader, effectiveFooter]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setAppName(localAppName);
    setTaxEnabled(localTaxEnabled);
    setTaxRate(localTaxRate);
    setRoundingUnit(localRounding);
    setInvoiceHeader(localHeader);
    setInvoiceFooter(localFooter);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  const resetInvoice = () => {
    setLocalHeader(defaultInvoiceHeader(localAppName));
    setLocalFooter(DEFAULT_INVOICE_FOOTER);
  };

  const previewLines = (text: string) => text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  // Preview calculation
  const exampleSubtotal = 125000;
  const exampleTax = localTaxEnabled ? Math.round(exampleSubtotal * (localTaxRate / 100)) : 0;
  const exampleRaw = exampleSubtotal + exampleTax;
  const exampleRounded = localRounding > 0 ? Math.ceil(exampleRaw / localRounding) * localRounding : exampleRaw;

  const formatIDR = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

  const hasChanges =
    localAppName !== appName ||
    localTaxEnabled !== taxEnabled ||
    localTaxRate !== taxRate ||
    localRounding !== roundingUnit ||
    localHeader !== effectiveHeader ||
    localFooter !== effectiveFooter;

  const CalcPreview = () => (
    <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '14px 16px', maxWidth: '360px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280', letterSpacing: '0.4px', marginBottom: '8px' }}>🧮 PREVIEW KALKULASI</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
          <span style={{ color: '#6b7280' }}>Subtotal (contoh)</span>
          <span>{formatIDR(exampleSubtotal)}</span>
        </div>
        {localTaxEnabled && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>PPN ({localTaxRate}%)</span>
            <span>+ {formatIDR(exampleTax)}</span>
          </div>
        )}
        {localRounding > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
            <span style={{ color: '#6b7280' }}>Pembulatan ke {localRounding}</span>
            <span style={{ color: 'var(--primary)' }}>+ {formatIDR(exampleRounded - exampleRaw)}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '16px', borderTop: '2px solid #e5e7eb', paddingTop: '8px', marginTop: '2px' }}>
          <span>TOTAL TAGIHAN</span>
          <span style={{ color: 'var(--primary)' }}>{formatIDR(exampleRounded)}</span>
        </div>
      </div>
    </div>
  );

  const active = TABS.find(t => t.id === activeTab)!;

  return (
    <div className="bo-container">
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Pengaturan Sistem</h1>
          <p className="bo-page-subtitle">Kelola konfigurasi dan preferensi aplikasi.</p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div className="r-settings-grid" style={{ display: 'grid', gridTemplateColumns: '230px minmax(0, 1fr)', gap: '16px', alignItems: 'start' }}>

          {/* Menu kategori */}
          <nav className="bo-card r-settings-nav" style={{ padding: '8px', marginBottom: 0, display: 'flex', flexDirection: 'column', gap: '4px', position: 'sticky', top: 0 }}>
            {TABS.map(t => {
              const isActive = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
                    padding: '10px 12px', borderRadius: '10px', cursor: 'pointer', border: 'none',
                    background: isActive ? '#fff1f2' : 'transparent',
                    color: isActive ? 'var(--primary)' : '#374151',
                    boxShadow: isActive ? 'inset 3px 0 0 var(--primary)' : 'none',
                    transition: 'background .15s',
                  }}
                >
                  <t.Icon size={18} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '13px', fontWeight: 700, lineHeight: 1.2 }}>{t.label}</span>
                    <span className="r-hide-mobile" style={{ display: 'block', fontSize: '11px', color: isActive ? 'var(--primary)' : '#9ca3af', opacity: isActive ? 0.8 : 1 }}>{t.desc}</span>
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Isi kategori terpilih */}
          <div className="bo-card" style={{ marginBottom: 0 }}>
            <div className="bo-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 className="bo-card-title">
                <active.Icon size={20} style={{ color: 'var(--primary)' }} /> {active.label}
              </h3>
              {activeTab === 'invoice' && (
                <button type="button" onClick={resetInvoice} className="bo-btn" style={{ fontSize: '12px', padding: '6px 12px' }}>
                  Kembalikan Default
                </button>
              )}
            </div>

            <div className="bo-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              {/* Umum */}
              {activeTab === 'general' && (
                <div className="bo-form-group" style={{ maxWidth: '420px' }}>
                  <label className="bo-label">Nama Aplikasi</label>
                  <input
                    type="text"
                    value={localAppName}
                    onChange={(e) => setLocalAppName(e.target.value)}
                    placeholder="Contoh: SRIKANDI MART"
                    className="bo-input"
                    required
                  />
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Nama ini akan ditampilkan pada header, struk kasir, dan judul tab browser.
                  </p>
                </div>
              )}

              {/* PPN */}
              {activeTab === 'tax' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '480px' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#111' }}>Aktifkan PPN</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Jika dimatikan, tidak ada pajak yang dikenakan pada transaksi</div>
                    </div>
                    <label style={{ position: 'relative', display: 'inline-block', width: '48px', height: '26px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={localTaxEnabled}
                        onChange={(e) => setLocalTaxEnabled(e.target.checked)}
                        style={{ opacity: 0, width: 0, height: 0 }}
                      />
                      <span style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: localTaxEnabled ? 'var(--primary)' : '#d1d5db',
                        borderRadius: '13px',
                        transition: 'background 0.2s'
                      }} />
                      <span style={{
                        position: 'absolute', top: '3px', left: localTaxEnabled ? '25px' : '3px',
                        width: '20px', height: '20px',
                        backgroundColor: 'white', borderRadius: '50%',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                        transition: 'left 0.2s'
                      }} />
                    </label>
                  </div>

                  {localTaxEnabled && (
                    <div className="bo-form-group" style={{ maxWidth: '480px' }}>
                      <label className="bo-label">Persentase PPN</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <input
                          type="range"
                          min={0}
                          max={25}
                          step={0.5}
                          value={localTaxRate}
                          onChange={(e) => setLocalTaxRate(Number(e.target.value))}
                          style={{ flex: 1, accentColor: 'var(--primary)' }}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', border: '2px solid #e5e7eb', borderRadius: '8px', overflow: 'hidden', width: '90px' }}>
                          <input
                            type="number"
                            min={0}
                            max={25}
                            step={0.5}
                            value={localTaxRate}
                            onChange={(e) => setLocalTaxRate(Number(e.target.value))}
                            style={{ width: '60px', border: 'none', outline: 'none', padding: '8px', fontSize: '16px', fontWeight: 'bold', textAlign: 'right' }}
                          />
                          <span style={{ padding: '0 8px', fontWeight: 'bold', color: '#6b7280' }}>%</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        {[0, 5, 10, 11, 12].map(v => (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setLocalTaxRate(v)}
                            style={{
                              padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer',
                              border: localTaxRate === v ? '2px solid var(--primary)' : '1px solid #e5e7eb',
                              backgroundColor: localTaxRate === v ? '#fff1f2' : 'white',
                              color: localTaxRate === v ? 'var(--primary)' : '#374151'
                            }}
                          >
                            {v}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <CalcPreview />
                </>
              )}

              {/* Pembulatan */}
              {activeTab === 'rounding' && (
                <>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    {ROUNDING_OPTIONS.map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setLocalRounding(opt.value)}
                        style={{
                          padding: '12px 20px', borderRadius: '10px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px',
                          border: localRounding === opt.value ? '2px solid var(--primary)' : '2px solid #e5e7eb',
                          backgroundColor: localRounding === opt.value ? '#fff1f2' : 'white',
                          color: localRounding === opt.value ? 'var(--primary)' : '#374151',
                          transition: 'all 0.15s'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                    Pembulatan dilakukan ke atas (<em>round up</em>) pada TOTAL TAGIHAN akhir setelah PPN.
                  </p>
                  <CalcPreview />
                </>
              )}

              {/* Invoice */}
              {activeTab === 'invoice' && (
                <div style={{ display: 'flex', gap: '28px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 340px', display: 'flex', flexDirection: 'column', gap: '16px', minWidth: 0 }}>
                    <div className="bo-form-group">
                      <label className="bo-label">Header Struk</label>
                      <textarea
                        className="bo-input"
                        rows={4}
                        value={localHeader}
                        onChange={(e) => setLocalHeader(e.target.value)}
                        placeholder={'Nama toko\nAlamat toko\nTelp / WhatsApp'}
                        style={{ fontFamily: 'monospace', resize: 'vertical' }}
                      />
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Satu baris per baris struk, tampil rata tengah di bagian atas. Contoh: nama toko, alamat, nomor telepon.
                      </p>
                    </div>
                    <div className="bo-form-group">
                      <label className="bo-label">Footer Struk</label>
                      <textarea
                        className="bo-input"
                        rows={4}
                        value={localFooter}
                        onChange={(e) => setLocalFooter(e.target.value)}
                        placeholder={'Terima kasih\nSyarat & ketentuan'}
                        style={{ fontFamily: 'monospace', resize: 'vertical' }}
                      />
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Tampil rata tengah di bagian bawah. Maksimal ±40 karakter per baris untuk kertas 80mm.
                      </p>
                    </div>
                  </div>

                  <div style={{ flex: '0 0 300px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', marginBottom: '6px' }}>PRATINJAU</div>
                    <div style={{ background: 'white', border: '1px solid #e5e7eb', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', padding: '14px 12px', fontFamily: "'Courier New', Consolas, monospace", fontSize: '11px', lineHeight: 1.3, color: '#000' }}>
                      {previewLines(localHeader).map((l, i) => <div key={'h' + i} style={{ textAlign: 'center' }}>{l}</div>)}
                      <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }} />
                      <div style={{ color: '#9ca3af', textAlign: 'center' }}>… isi transaksi …</div>
                      <div style={{ borderTop: '1px dashed #000', margin: '5px 0' }} />
                      {previewLines(localFooter).map((l, i) => <div key={'f' + i} style={{ textAlign: 'center' }}>{l}</div>)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Save Button — selalu terlihat */}
        <div style={{ position: 'sticky', bottom: 0, display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(4px)', border: '1px solid #e5e7eb', borderRadius: '12px' }}>
          <button type="submit" className="bo-btn bo-btn-primary" disabled={!hasChanges && !isSaved} style={{ opacity: !hasChanges && !isSaved ? 0.6 : 1 }}>
            <Save size={18} /> Simpan Semua Pengaturan
          </button>
          {isSaved ? (
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--green)' }}>
              ✅ Perubahan berhasil disimpan!
            </span>
          ) : hasChanges ? (
            <span style={{ fontSize: '0.8rem', color: '#d97706', fontWeight: 600 }}>● Ada perubahan yang belum disimpan</span>
          ) : null}
        </div>
      </form>
    </div>
  );
};

export default Settings;

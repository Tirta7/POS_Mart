import React, { useState, useEffect } from 'react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { Settings as SettingsIcon, Save, Percent, RefreshCw } from 'lucide-react';

const ROUNDING_OPTIONS = [
  { label: 'Tanpa Pembulatan', value: 0 },
  { label: 'Bulatkan ke 100', value: 100 },
  { label: 'Bulatkan ke 500', value: 500 },
  { label: 'Bulatkan ke 1.000', value: 1000 },
];

const Settings: React.FC = () => {
  const { appName, setAppName, taxEnabled, setTaxEnabled, taxRate, setTaxRate, roundingUnit, setRoundingUnit } = useSettingsStore();
  const [localAppName, setLocalAppName] = useState(appName);
  const [localTaxEnabled, setLocalTaxEnabled] = useState(taxEnabled);
  const [localTaxRate, setLocalTaxRate] = useState(taxRate);
  const [localRounding, setLocalRounding] = useState(roundingUnit);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setLocalAppName(appName);
    setLocalTaxEnabled(taxEnabled);
    setLocalTaxRate(taxRate);
    setLocalRounding(roundingUnit);
  }, [appName, taxEnabled, taxRate, roundingUnit]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setAppName(localAppName);
    setTaxEnabled(localTaxEnabled);
    setTaxRate(localTaxRate);
    setRoundingUnit(localRounding);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  // Preview calculation
  const exampleSubtotal = 125000;
  const exampleTax = localTaxEnabled ? Math.round(exampleSubtotal * (localTaxRate / 100)) : 0;
  const exampleRaw = exampleSubtotal + exampleTax;
  const exampleRounded = localRounding > 0 ? Math.ceil(exampleRaw / localRounding) * localRounding : exampleRaw;

  const formatIDR = (n: number) => 'Rp ' + n.toLocaleString('id-ID');

  return (
    <div className="bo-container">
      <div className="bo-page-header">
        <div>
          <h1 className="bo-page-title">Pengaturan Sistem</h1>
          <p className="bo-page-subtitle">Kelola konfigurasi dan preferensi aplikasi.</p>
        </div>
      </div>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* Section: General */}
        <div className="bo-card">
          <div className="bo-card-header">
            <h3 className="bo-card-title">
              <SettingsIcon size={20} style={{ color: 'var(--primary)' }} /> Pengaturan Umum
            </h3>
          </div>
          <div className="bo-card-body bg-[#fafafa]">
            <div className="bo-form-group" style={{ maxWidth: '400px' }}>
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
          </div>
        </div>

        {/* Section: PPN */}
        <div className="bo-card">
          <div className="bo-card-header">
            <h3 className="bo-card-title">
              <Percent size={20} style={{ color: 'var(--primary)' }} /> Pengaturan PPN / Pajak
            </h3>
          </div>
          <div className="bo-card-body bg-[#fafafa]" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Toggle PPN */}
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

            {/* Tax Rate Slider + Input */}
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
          </div>
        </div>

        {/* Section: Rounding */}
        <div className="bo-card">
          <div className="bo-card-header">
            <h3 className="bo-card-title">
              <RefreshCw size={20} style={{ color: 'var(--primary)' }} /> Pembulatan Total Tagihan
            </h3>
          </div>
          <div className="bo-card-body bg-[#fafafa]" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
          </div>
        </div>

        {/* Live Preview */}
        <div className="bo-card">
          <div className="bo-card-header">
            <h3 className="bo-card-title">🧮 Preview Kalkulasi</h3>
          </div>
          <div className="bo-card-body bg-[#fafafa]">
            <div style={{ maxWidth: '360px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: '#6b7280' }}>Subtotal (contoh)</span>
                <span>{formatIDR(exampleSubtotal)}</span>
              </div>
              {localTaxEnabled && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: '#6b7280' }}>PPN ({localTaxRate}%)</span>
                  <span>+ {formatIDR(exampleTax)}</span>
                </div>
              )}
              {localRounding > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: '#6b7280' }}>Pembulatan ke {localRounding}</span>
                  <span style={{ color: 'var(--primary)' }}>+ {formatIDR(exampleRounded - exampleRaw)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '18px', borderTop: '2px solid #e5e7eb', paddingTop: '8px', marginTop: '4px' }}>
                <span>TOTAL TAGIHAN</span>
                <span style={{ color: 'var(--primary)' }}>{formatIDR(exampleRounded)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button type="submit" className="bo-btn bo-btn-primary">
            <Save size={18} /> Simpan Semua Pengaturan
          </button>
          {isSaved && (
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--green)' }}>
              ✅ Perubahan berhasil disimpan!
            </span>
          )}
        </div>

      </form>
    </div>
  );
};

export default Settings;

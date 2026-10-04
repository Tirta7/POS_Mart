import React, { useState, useEffect } from 'react';
import { useSettingsStore, DEFAULT_INVOICE_FOOTER, defaultInvoiceHeader } from '../../store/useSettingsStore';
import { Settings as SettingsIcon, Save, Percent, RefreshCw, Receipt, Bell, ShieldCheck, AlertTriangle, Clock, XOctagon } from 'lucide-react';
import NotificationSettings from './NotificationSettings';

const ROUNDING_OPTIONS = [
  { label: 'Tanpa Pembulatan', value: 0 },
  { label: 'Bulatkan ke 100', value: 100 },
  { label: 'Bulatkan ke 500', value: 500 },
  { label: 'Bulatkan ke 1.000', value: 1000 },
];

type TabId = 'general' | 'tax' | 'rounding' | 'invoice' | 'notification' | 'license';

const TABS: { id: TabId; label: string; desc: string; Icon: React.ElementType }[] = [
  { id: 'general', label: 'Umum', desc: 'Nama aplikasi', Icon: SettingsIcon },
  { id: 'tax', label: 'PPN / Pajak', desc: 'Aktif & persentase', Icon: Percent },
  { id: 'rounding', label: 'Pembulatan', desc: 'Total tagihan', Icon: RefreshCw },
  { id: 'invoice', label: 'Invoice', desc: 'Header & footer struk', Icon: Receipt },
  { id: 'notification', label: 'Notifikasi', desc: 'Push uang masuk', Icon: Bell },
  { id: 'license', label: 'Lisensi', desc: 'Detail lisensi aktif', Icon: ShieldCheck },
];

const Settings: React.FC = () => {
  const { appName, setAppName, appLogo, setAppLogo, taxEnabled, setTaxEnabled, taxRate, setTaxRate, roundingUnit, setRoundingUnit, invoiceHeader, setInvoiceHeader, invoiceFooter, setInvoiceFooter } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [localAppName, setLocalAppName] = useState(appName);
  const [localAppLogo, setLocalAppLogo] = useState<string | null>(appLogo);
  const [localTaxEnabled, setLocalTaxEnabled] = useState(taxEnabled);
  const [localTaxRate, setLocalTaxRate] = useState(taxRate);
  const [localRounding, setLocalRounding] = useState(roundingUnit);
  const effectiveHeader = (invoiceHeader || '').trim() ? invoiceHeader : defaultInvoiceHeader(appName);
  const effectiveFooter = (invoiceFooter || '').trim() ? invoiceFooter : DEFAULT_INVOICE_FOOTER;
  const [localHeader, setLocalHeader] = useState(effectiveHeader);
  const [localFooter, setLocalFooter] = useState(effectiveFooter);
  const [isSaved, setIsSaved] = useState(false);
  const [licenseData, setLicenseData] = useState<any>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);

  useEffect(() => {
    if (activeTab === 'license' && !licenseData) {
      setLicenseLoading(true);
      fetch('/api/license-status')
        .then(res => res.json())
        .then(data => {
          setLicenseData(data);
          setLicenseLoading(false);
        })
        .catch(err => {
          console.error(err);
          setLicenseLoading(false);
        });
    }
  }, [activeTab]);

  useEffect(() => {
    setLocalAppName(appName);
    setLocalAppLogo(appLogo);
    setLocalTaxEnabled(taxEnabled);
    setLocalTaxRate(taxRate);
    setLocalRounding(roundingUnit);
    setLocalHeader(effectiveHeader);
    setLocalFooter(effectiveFooter);
  }, [appName, appLogo, taxEnabled, taxRate, roundingUnit, effectiveHeader, effectiveFooter]);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLocalAppLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setAppName(localAppName);
    setAppLogo(localAppLogo);
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
    localAppLogo !== appLogo ||
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '420px' }}>
                  <div className="bo-form-group">
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
                  
                  <div className="bo-form-group">
                    <label className="bo-label">Logo Aplikasi</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{
                        width: '64px', height: '64px', borderRadius: '8px', 
                        backgroundColor: '#f3f4f6', border: '1px dashed #d1d5db',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        overflow: 'hidden'
                      }}>
                        {localAppLogo ? (
                          <img src={localAppLogo} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                        ) : (
                          <span style={{ fontSize: '24px', color: '#9ca3af', fontWeight: 'bold' }}>{localAppName.charAt(0).toUpperCase() || 'B'}</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label style={{ cursor: 'pointer', padding: '6px 12px', background: 'white', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '13px', fontWeight: 'bold', display: 'inline-block', textAlign: 'center' }}>
                          Pilih Gambar
                          <input type="file" accept="image/png, image/jpeg, image/svg+xml" onChange={handleLogoUpload} style={{ display: 'none' }} />
                        </label>
                        {localAppLogo && (
                          <button type="button" onClick={() => setLocalAppLogo(null)} style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '12px', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                            Hapus Logo
                          </button>
                        )}
                      </div>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Format yang didukung: JPG, PNG, SVG. Ukuran ideal 1:1.
                    </p>
                  </div>
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

              {/* Notifikasi — per device, langsung aktif (tidak perlu tombol Simpan) */}
              {activeTab === 'notification' && <NotificationSettings />}

              {/* Lisensi */}
              {activeTab === 'license' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '600px' }}>
                  {licenseLoading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>Memuat data lisensi...</div>
                  ) : licenseData ? (
                    <>
                      {/* Status Banner */}
                      <div style={{ 
                        padding: '16px', borderRadius: '12px', display: 'flex', gap: '16px', alignItems: 'flex-start',
                        background: licenseData.allowed ? '#ecfdf5' : '#fef2f2', 
                        border: `1px solid ${licenseData.allowed ? '#a7f3d0' : '#fecaca'}` 
                      }}>
                        <div style={{ 
                          padding: '10px', borderRadius: '10px', 
                          background: licenseData.allowed ? '#d1fae5' : '#fee2e2', 
                          color: licenseData.allowed ? '#059669' : '#dc2626' 
                        }}>
                          {licenseData.allowed ? <ShieldCheck size={28} /> : (licenseData.status === 'expired' || licenseData.status === 'locked' ? <XOctagon size={28} /> : <AlertTriangle size={28} />)}
                        </div>
                        <div>
                          <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: licenseData.allowed ? '#065f46' : '#991b1b', fontWeight: 700 }}>
                            {licenseData.status === 'active' ? 'Lisensi Aktif' : 
                             licenseData.status === 'expired' ? 'Lisensi Kedaluwarsa' : 
                             licenseData.status === 'locked' ? 'Aplikasi Terkunci' : 
                             licenseData.status === 'pending' ? 'Menunggu Aktivasi' : 'Status Lisensi: ' + licenseData.status}
                          </h4>
                          <p style={{ margin: 0, fontSize: '13px', color: licenseData.allowed ? '#047857' : '#b91c1c', lineHeight: 1.5 }}>
                            {licenseData.reason || (licenseData.allowed ? 'Aplikasi Anda terhubung dan memiliki lisensi yang valid. Semua fitur dapat digunakan tanpa batasan.' : 'Lisensi tidak valid atau perlu diperpanjang.')}
                          </p>
                        </div>
                      </div>

                      <div className="bo-form-group">
                        <label className="bo-label">Detail Lisensi</label>
                        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <tbody>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '12px 16px', color: '#6b7280', width: '40%' }}>Status</td>
                                <td style={{ padding: '12px 16px', fontWeight: 700, color: licenseData.allowed ? '#059669' : '#dc2626' }}>
                                  {String(licenseData.status || '').toUpperCase()}
                                  {licenseData.offline && <span style={{ marginLeft: '8px', fontSize: '11px', background: '#f3f4f6', color: '#6b7280', padding: '2px 6px', borderRadius: '4px' }}>Offline Mode</span>}
                                </td>
                              </tr>
                              {licenseData.expiresAt && (
                                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>Masa Aktif</td>
                                  <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>
                                    Sampai {new Date(licenseData.expiresAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                                  </td>
                                </tr>
                              )}
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '12px 16px', color: '#6b7280' }}>Machine ID</td>
                                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>{licenseData.machineId || '-'}</td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '12px 16px', color: '#6b7280' }}>Tipe Produk</td>
                                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>SWALAYAN POS</td>
                              </tr>
                              {licenseData.licenseKey && (
                                <tr>
                                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>Lisensi Key</td>
                                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>{licenseData.licenseKey}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '8px' }}>
                          * Data ditarik langsung dari server backend. Hubungi administrator VOC ML Anda untuk info lebih lanjut.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#dc2626' }}>Gagal memuat data lisensi. Pastikan server terhubung.</div>
                  )}
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

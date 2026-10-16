import React, { useState, useEffect } from 'react';
import { useSettingsStore, DEFAULT_INVOICE_FOOTER, defaultInvoiceHeader } from '../../store/useSettingsStore';
import {
  Settings as SettingsIcon,
  Save,
  Percent,
  RefreshCw,
  Receipt,
  Bell,
  ShieldCheck,
  AlertTriangle,
  XOctagon,
  FileSpreadsheet,
  QrCode,
  KeyRound,
  Copy,
  CheckCircle,
  Printer,
  CreditCard,
  Building2,
  FileText
} from 'lucide-react';
import NotificationSettings from './NotificationSettings';
import ExportImportSettings from './ExportImportSettings';
import PrinterSettings from './PrinterSettings';

const ROUNDING_OPTIONS = [
  { label: 'Tanpa Pembulatan', value: 0 },
  { label: 'Bulatkan ke 100', value: 100 },
  { label: 'Bulatkan ke 500', value: 500 },
  { label: 'Bulatkan ke 1.000', value: 1000 },
];

type TabId = 'general' | 'tax' | 'rounding' | 'invoice' | 'printer' | 'notification' | 'license' | 'export_import';

const TABS: { id: TabId; label: string; desc: string; Icon: React.ElementType }[] = [
  { id: 'general', label: 'Umum', desc: 'Nama aplikasi', Icon: SettingsIcon },
  { id: 'tax', label: 'PPN / Pajak', desc: 'Aktif & persentase', Icon: Percent },
  { id: 'rounding', label: 'Pembulatan', desc: 'Total tagihan', Icon: RefreshCw },
  { id: 'invoice', label: 'Invoice & Rekening', desc: 'Header, B2B & Bank', Icon: Receipt },
  { id: 'printer', label: 'Printer Bluetooth', desc: 'Thermal ESC/POS & USB', Icon: Printer },
  { id: 'notification', label: 'Notifikasi', desc: 'Push uang masuk', Icon: Bell },
  { id: 'license', label: 'Lisensi', desc: 'Detail lisensi aktif', Icon: ShieldCheck },
  { id: 'export_import', label: 'Export & Import', desc: 'Backup data Excel', Icon: FileSpreadsheet },
];

const Settings: React.FC = () => {
  const {
    appName,
    appLogo,
    taxEnabled,
    taxRate,
    roundingUnit,
    invoiceHeader,
    invoiceFooter,
    companyAddress,
    companyPhone,
    companyEmail,
    companyNpwp,
    bankName,
    bankAccount,
    bankHolder,
    distributorTerms
  } = useSettingsStore();

  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [invoiceSubTab, setInvoiceSubTab] = useState<'distributor' | 'thermal'>('distributor');

  const [localAppName, setLocalAppName] = useState(appName);
  const [localAppLogo, setLocalAppLogo] = useState<string | null>(appLogo);
  const [localTaxEnabled, setLocalTaxEnabled] = useState(taxEnabled);
  const [localTaxRate, setLocalTaxRate] = useState(taxRate);
  const [localRounding, setLocalRounding] = useState(roundingUnit);
  const effectiveHeader = (invoiceHeader || '').trim() ? invoiceHeader : defaultInvoiceHeader(appName);
  const effectiveFooter = (invoiceFooter || '').trim() ? invoiceFooter : DEFAULT_INVOICE_FOOTER;
  const [localHeader, setLocalHeader] = useState(effectiveHeader);
  const [localFooter, setLocalFooter] = useState(effectiveFooter);

  // Bank & Faktur Distributor B2B
  const [localBankName, setLocalBankName] = useState(bankName);
  const [localBankAccount, setLocalBankAccount] = useState(bankAccount);
  const [localBankHolder, setLocalBankHolder] = useState(bankHolder);
  const [localCompanyAddress, setLocalCompanyAddress] = useState(companyAddress);
  const [localCompanyPhone, setLocalCompanyPhone] = useState(companyPhone);
  const [localCompanyEmail, setLocalCompanyEmail] = useState(companyEmail);
  const [localCompanyNpwp, setLocalCompanyNpwp] = useState(companyNpwp);
  const [localDistributorTerms, setLocalDistributorTerms] = useState(distributorTerms);

  const [isSaved, setIsSaved] = useState(false);
  const [licenseData, setLicenseData] = useState<any>(null);
  const [licenseLoading, setLicenseLoading] = useState(false);
  const [refreshingLicense, setRefreshingLicense] = useState(false);
  const [copiedMid, setCopiedMid] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [activatingKey, setActivatingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<{ text: string; isError: boolean } | null>(null);

  const fetchLicense = async (forceCheck = false) => {
    if (forceCheck) setRefreshingLicense(true);
    else setLicenseLoading(true);
    try {
      const url = forceCheck ? '/api/license/check' : '/api/license-status';
      const method = forceCheck ? 'POST' : 'GET';
      const res = await fetch(url, { method });
      const data = await res.json();
      setLicenseData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLicenseLoading(false);
      setRefreshingLicense(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'license') {
      fetchLicense(false);
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
    setLocalBankName(bankName);
    setLocalBankAccount(bankAccount);
    setLocalBankHolder(bankHolder);
    setLocalCompanyAddress(companyAddress);
    setLocalCompanyPhone(companyPhone);
    setLocalCompanyEmail(companyEmail);
    setLocalCompanyNpwp(companyNpwp);
    setLocalDistributorTerms(distributorTerms);
  }, [
    appName, appLogo, taxEnabled, taxRate, roundingUnit, effectiveHeader, effectiveFooter,
    bankName, bankAccount, bankHolder, companyAddress, companyPhone, companyEmail, companyNpwp, distributorTerms
  ]);

  // Keep localHeader in sync if user changes localAppName and the header is currently the default
  useEffect(() => {
    if (localHeader === defaultInvoiceHeader(appName) || localHeader === defaultInvoiceHeader('TID-DEMO-123')) {
      setLocalHeader(defaultInvoiceHeader(localAppName));
    }
  }, [localAppName]);

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const newSettings = {
      appName: localAppName,
      appLogo: localAppLogo,
      taxEnabled: localTaxEnabled,
      taxRate: localTaxRate,
      roundingUnit: localRounding,
      invoiceHeader: localHeader,
      invoiceFooter: localFooter,
      bankName: localBankName,
      bankAccount: localBankAccount,
      bankHolder: localBankHolder,
      companyAddress: localCompanyAddress,
      companyPhone: localCompanyPhone,
      companyEmail: localCompanyEmail,
      companyNpwp: localCompanyNpwp,
      distributorTerms: localDistributorTerms,
    };
    await useSettingsStore.getState().saveSettings(newSettings);
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
    localFooter !== effectiveFooter ||
    localBankName !== bankName ||
    localBankAccount !== bankAccount ||
    localBankHolder !== bankHolder ||
    localCompanyAddress !== companyAddress ||
    localCompanyPhone !== companyPhone ||
    localCompanyEmail !== companyEmail ||
    localCompanyNpwp !== companyNpwp ||
    localDistributorTerms !== distributorTerms;

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
    <div className="bo-container" style={{ overflowY: 'auto' }}>
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

              {/* Invoice & Rekening */}
              {activeTab === 'invoice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* SUB-TAB NAVIGATOR */}
                  <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '10px', width: 'fit-content', gap: '6px' }}>
                    <button
                      type="button"
                      onClick={() => setInvoiceSubTab('distributor')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        background: invoiceSubTab === 'distributor' ? '#2563eb' : 'transparent',
                        color: invoiceSubTab === 'distributor' ? 'white' : '#64748b',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        boxShadow: invoiceSubTab === 'distributor' ? '0 2px 6px rgba(37,99,235,0.25)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <FileText size={16} />
                      <span>Faktur Distributor & Rekening Bank (A4)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInvoiceSubTab('thermal')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        background: invoiceSubTab === 'thermal' ? 'white' : 'transparent',
                        color: invoiceSubTab === 'thermal' ? '#0f172a' : '#64748b',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        boxShadow: invoiceSubTab === 'thermal' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Receipt size={16} />
                      <span>Struk Kasir (Thermal 58/80mm)</span>
                    </button>
                  </div>

                  {invoiceSubTab === 'distributor' ? (
                    /* SUB-TAB 1: FAKTUR DISTRIBUTOR & REKENING BANK */
                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                        
                        {/* CARD 1: INFORMASI REKENING BANK PEMBAYARAN */}
                        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <CreditCard size={18} color="#059669" />
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                              Rekening Pembayaran Bank Resmi
                            </span>
                          </div>
                          <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 14px 0' }}>
                            Informasi ini akan tercetak otomatis pada kotak <strong>PEMBAYARAN TRANSFER BANK</strong> di invoice / faktur distributor A4.
                          </p>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                              <div className="bo-form-group">
                                <label className="bo-label">Nama Bank</label>
                                <input
                                  type="text"
                                  className="bo-input"
                                  value={localBankName}
                                  onChange={(e) => setLocalBankName(e.target.value)}
                                  placeholder="Contoh: BCA (Bank Central Asia)"
                                />
                              </div>

                              <div className="bo-form-group">
                                <label className="bo-label">Nomor Rekening</label>
                                <input
                                  type="text"
                                  className="bo-input"
                                  value={localBankAccount}
                                  onChange={(e) => setLocalBankAccount(e.target.value)}
                                  placeholder="Contoh: 8830-192-888"
                                  style={{ fontFamily: 'monospace', fontWeight: 700 }}
                                />
                              </div>
                            </div>

                            <div className="bo-form-group">
                              <label className="bo-label">Atas Nama Rekening</label>
                              <input
                                type="text"
                                className="bo-input"
                                value={localBankHolder}
                                onChange={(e) => setLocalBankHolder(e.target.value)}
                                placeholder="Contoh: PT. SWALAYAN RETAIL INDONESIA / NAMA USAHA"
                              />
                            </div>
                          </div>
                        </div>

                        {/* CARD 2: KOP SURAT & IDENTITAS PERUSAHAAN B2B */}
                        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <Building2 size={18} color="#2563eb" />
                            <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                              Kop Surat & Alamat Usaha (Faktur B2B)
                            </span>
                          </div>
                          <p style={{ fontSize: '11.5px', color: '#64748b', margin: '0 0 14px 0' }}>
                            Tampil di bagian atas (Header Faktur) sebagai identitas resmi perusahaan Anda.
                          </p>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div className="bo-form-group">
                              <label className="bo-label">Alamat Lengkap Kantor / Gudang Distribusi</label>
                              <textarea
                                className="bo-input"
                                rows={2}
                                value={localCompanyAddress}
                                onChange={(e) => setLocalCompanyAddress(e.target.value)}
                                placeholder="Contoh: Jl. Raya Pergudangan No. 88, Blok B3-B5, Jakarta"
                                style={{ resize: 'vertical' }}
                              />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                              <div className="bo-form-group">
                                <label className="bo-label">No. Telepon / WhatsApp</label>
                                <input
                                  type="text"
                                  className="bo-input"
                                  value={localCompanyPhone}
                                  onChange={(e) => setLocalCompanyPhone(e.target.value)}
                                  placeholder="Contoh: 0812-3456-7890"
                                />
                              </div>

                              <div className="bo-form-group">
                                <label className="bo-label">Email Perusahaan</label>
                                <input
                                  type="email"
                                  className="bo-input"
                                  value={localCompanyEmail}
                                  onChange={(e) => setLocalCompanyEmail(e.target.value)}
                                  placeholder="Contoh: info@posmart.id"
                                />
                              </div>
                            </div>

                            <div className="bo-form-group">
                              <label className="bo-label">Nomor Pokok Wajib Pajak (NPWP)</label>
                              <input
                                type="text"
                                className="bo-input"
                                value={localCompanyNpwp}
                                onChange={(e) => setLocalCompanyNpwp(e.target.value)}
                                placeholder="Contoh: 01.234.567.8-901.000 (Isi '-' jika belum ada)"
                              />
                            </div>
                          </div>
                        </div>

                        {/* CARD 3: SYARAT & KETENTUAN FAKTUR */}
                        <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '18px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '8px' }}>
                            Syarat & Ketentuan Faktur Penjualan / Pengiriman
                          </div>
                          <textarea
                            className="bo-input"
                            rows={3}
                            value={localDistributorTerms}
                            onChange={(e) => setLocalDistributorTerms(e.target.value)}
                            placeholder="Ketik poin syarat & ketentuan faktur..."
                            style={{ fontSize: '12px', lineHeight: 1.45 }}
                          />
                        </div>

                      </div>

                      {/* PRATINJAU MINIATUR FAKTUR DISTRIBUTOR (LIVE PREVIEW) */}
                      <div>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#6b7280', marginBottom: '6px' }}>
                          PRATINJAU FAKTUR DISTRIBUTOR (A4)
                        </div>
                        <div style={{
                          background: 'white',
                          border: '1px solid #cbd5e1',
                          borderRadius: '8px',
                          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                          padding: '16px 14px',
                          fontSize: '9.5px',
                          lineHeight: 1.35,
                          color: '#1e293b'
                        }}>
                          {/* KOP */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '8px', marginBottom: '10px' }}>
                            <div>
                              <div style={{ fontWeight: 900, fontSize: '12px', color: '#0f172a' }}>{localAppName || 'NAMA USAHA'}</div>
                              <div style={{ color: '#475569', fontSize: '8.5px', maxWidth: '200px' }}>{localCompanyAddress || 'Alamat Perusahaan'}</div>
                              <div style={{ color: '#475569', fontSize: '8.5px' }}>Telp/WA: {localCompanyPhone || '-'} | NPWP: {localCompanyNpwp || '-'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontWeight: 900, fontSize: '12px', color: '#0f172a' }}>FAKTUR PENJUALAN</div>
                              <div style={{ fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>INV-1792163748919</div>
                              <span style={{ background: '#ecfdf5', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '8px' }}>LUNAS</span>
                            </div>
                          </div>

                          {/* KOTAK REKENING BANK & TOTAL (PERSIS SEPERTI MODAL DI SCREENSHOT USER) */}
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '8px 10px', marginBottom: '10px' }}>
                            <div style={{ fontSize: '8.5px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '4px' }}>
                              PEMBAYARAN TRANSFER BANK:
                            </div>
                            <div>Bank: <strong>{localBankName || 'BCA (Bank Central Asia)'}</strong></div>
                            <div>No. Rekening: <strong style={{ color: '#2563eb', fontFamily: 'monospace' }}>{localBankAccount || '8830-192-888'}</strong></div>
                            <div>Atas Nama: <strong>{localBankHolder || localAppName || 'NAMA USAHA'}</strong></div>
                          </div>

                          {/* TERBILANG */}
                          <div style={{ background: '#eff6ff', borderLeft: '3px solid #3b82f6', borderRadius: '4px', padding: '6px 8px', marginBottom: '10px' }}>
                            <div style={{ fontSize: '8px', fontWeight: 700, color: '#1e40af' }}>TERBILANG:</div>
                            <div style={{ fontSize: '8.5px', fontStyle: 'italic', color: '#1e3a8a', fontWeight: 700 }}>
                              "Dua Juta Enam Ratus Tiga Puluh Ribu Tujuh Ratus Rupiah"
                            </div>
                          </div>

                          {/* SYARAT KETENTUAN */}
                          <div style={{ fontSize: '8px', color: '#64748b', background: '#f8fafc', padding: '6px 8px', borderRadius: '4px', border: '1px dashed #cbd5e1', marginBottom: '12px' }}>
                            <div style={{ fontWeight: 700, color: '#334155', marginBottom: '2px' }}>SYARAT & KETENTUAN FAKTUR:</div>
                            <div style={{ whiteSpace: 'pre-line' }}>{localDistributorTerms}</div>
                          </div>

                          {/* TANDA TANGAN */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', gap: '4px', fontSize: '7.5px' }}>
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: '20px' }}>DIBUAT OLEH</div>
                              <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '2px' }}>Admin</div>
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: '20px' }}>GUDANG / CHECKER</div>
                              <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '2px' }}>( ............ )</div>
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: '20px' }}>PENGEMUDI / EKSPEDISI</div>
                              <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '2px' }}>( ............ )</div>
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, marginBottom: '20px' }}>PENERIMA / DISTRIBUTOR</div>
                              <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '2px' }}>Retail (Cap & TTD)</div>
                            </div>
                          </div>

                        </div>
                      </div>
                    </div>
                  ) : (
                    /* SUB-TAB 2: STRUK KASIR THERMAL */
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
              )}

              {/* Notifikasi — per device, langsung aktif (tidak perlu tombol Simpan) */}
              {activeTab === 'notification' && <NotificationSettings />}

              {/* Lisensi */}
              {activeTab === 'license' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '640px' }}>
                  {licenseLoading ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>Memuat data lisensi...</div>
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
                          color: licenseData.allowed ? '#059669' : '#dc2626',
                          flexShrink: 0,
                        }}>
                          {licenseData.allowed ? <ShieldCheck size={28} /> : (licenseData.status === 'expired' || licenseData.status === 'locked' ? <XOctagon size={28} /> : <AlertTriangle size={28} />)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                            <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', color: licenseData.allowed ? '#065f46' : '#991b1b', fontWeight: 700 }}>
                              {licenseData.status === 'active' ? 'Lisensi Aktif' : 
                               licenseData.status === 'expiring' ? 'Lisensi Segera Berakhir' :
                               licenseData.status === 'expired' ? 'Lisensi Kedaluwarsa' : 
                               licenseData.status === 'locked' ? 'Aplikasi Terkunci' : 
                               licenseData.status === 'pending' ? 'Menunggu Aktivasi' : 'Status Lisensi: ' + licenseData.status}
                            </h4>
                            <button
                              type="button"
                              onClick={() => fetchLicense(true)}
                              disabled={refreshingLicense}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                background: '#fff', border: '1px solid #d1d5db', borderRadius: '6px',
                                padding: '4px 8px', fontSize: '11.5px', fontWeight: 600, color: '#374151',
                                cursor: refreshingLicense ? 'not-allowed' : 'pointer'
                              }}
                            >
                              <RefreshCw size={12} style={{ animation: refreshingLicense ? 'spin 1s linear infinite' : 'none' }} />
                              {refreshingLicense ? 'Mengecek...' : 'Cek Ulang Server'}
                            </button>
                          </div>
                          <p style={{ margin: 0, fontSize: '13px', color: licenseData.allowed ? '#047857' : '#b91c1c', lineHeight: 1.5 }}>
                            {licenseData.reason || (licenseData.allowed ? 'Aplikasi Anda terhubung dan memiliki lisensi yang valid. Semua fitur dapat digunakan tanpa batasan.' : 'Lisensi tidak valid atau perlu diperpanjang.')}
                          </p>
                        </div>
                      </div>

                      {/* Tagihan QRIS (jika ada) */}
                      {licenseData.billing && (
                        <div style={{
                          background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '12px',
                          padding: '16px', display: 'flex', gap: '16px', alignItems: 'center'
                        }}>
                          <img
                            src={`/api/license/billing/qris.png?t=${licenseData.billing.amount}`}
                            alt="QRIS Tagihan"
                            style={{ width: '100px', height: '100px', borderRadius: '8px', border: '1px solid #e2e8f0', background: '#fff', objectFit: 'contain', imageRendering: 'pixelated' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                              <QrCode size={13} /> Tagihan Perpanjangan
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0f172a', margin: '2px 0' }}>
                              {licenseData.billing.amount_text}
                            </div>
                            <div style={{ fontSize: '12px', color: '#64748b' }}>
                              QRIS · {licenseData.billing.merchant_name}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Detail Lisensi */}
                      <div className="bo-form-group">
                        <label className="bo-label">Detail Lisensi</label>
                        <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                            <tbody>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '12px 16px', color: '#6b7280', width: '38%' }}>Status</td>
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
                                    {licenseData.daysLeft !== null && licenseData.daysLeft !== undefined && (
                                      <span style={{ marginLeft: '8px', fontSize: '12px', color: licenseData.daysLeft <= 7 ? '#d97706' : '#059669', fontWeight: 600 }}>
                                        ({licenseData.daysLeft} hari lagi)
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              )}
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '12px 16px', color: '#6b7280' }}>Machine ID</td>
                                <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span>{licenseData.machineId || '-'}</span>
                                    {licenseData.machineId && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(licenseData.machineId);
                                          setCopiedMid(true);
                                          setTimeout(() => setCopiedMid(false), 2000);
                                        }}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: copiedMid ? '#10b981' : '#6b7280', padding: '2px' }}
                                        title="Salin Machine ID"
                                      >
                                        {copiedMid ? <CheckCircle size={14} /> : <Copy size={14} />}
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '12px 16px', color: '#6b7280' }}>Tipe Produk</td>
                                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#111827' }}>SWALAYAN POS</td>
                              </tr>
                              {licenseData.licenseKey && (
                                <tr>
                                  <td style={{ padding: '12px 16px', color: '#6b7280' }}>Lisensi Key</td>
                                  <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontWeight: 600, color: '#111827', wordBreak: 'break-all' }}>{licenseData.licenseKey}</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Aktivasi Manual */}
                      <div className="bo-form-group">
                        <label className="bo-label">Aktivasi / Perpanjang Lisensi Manual</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="text"
                            placeholder="VOCML-XXXXX-XXXXX-..."
                            value={manualKey}
                            onChange={(e) => setManualKey(e.target.value)}
                            className="bo-input"
                            style={{ fontFamily: 'monospace', fontSize: '13px' }}
                          />
                          <button
                            type="button"
                            disabled={activatingKey || !manualKey.trim()}
                            onClick={async () => {
                              setActivatingKey(true);
                              setKeyMsg(null);
                              try {
                                const res = await fetch('/api/license/activate', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ licenseKey: manualKey.trim() })
                                });
                                const data = await res.json();
                                if (res.ok && data.allowed) {
                                  setKeyMsg({ text: 'Aktivasi berhasil!', isError: false });
                                  setLicenseData(data);
                                  setManualKey('');
                                } else {
                                  setKeyMsg({ text: data.error || 'Aktivasi gagal.', isError: true });
                                }
                              } catch {
                                setKeyMsg({ text: 'Gagal terhubung ke server', isError: true });
                              } finally {
                                setActivatingKey(false);
                              }
                            }}
                            className="bo-btn bo-btn-primary"
                            style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                          >
                            <KeyRound size={15} />
                            {activatingKey ? 'Mengaktifkan...' : 'Aktivasi'}
                          </button>
                        </div>
                        {keyMsg && (
                          <p style={{ margin: '6px 0 0', fontSize: '12.5px', color: keyMsg.isError ? '#dc2626' : '#059669', fontWeight: 600 }}>
                            {keyMsg.text}
                          </p>
                        )}
                        <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '6px' }}>
                          * Masukkan kode lisensi yang diberikan oleh administrator VOCML untuk memperpanjang secara manual.
                        </p>
                      </div>
                    </>
                  ) : (
                    <div style={{ padding: '20px', textAlign: 'center', color: '#dc2626' }}>Gagal memuat data lisensi. Pastikan server terhubung.</div>
                  )}
                </div>
              )}

              {/* Printer Bluetooth Settings */}
              {activeTab === 'printer' && <PrinterSettings />}

              {/* Export & Import Data */}
              {activeTab === 'export_import' && <ExportImportSettings />}
            </div>
          </div>
        </div>

        {/* Save Button — disembunyikan jika di tab export_import, notification, printer tanpa perubahan form */}
        {(hasChanges || isSaved || (activeTab !== 'export_import' && activeTab !== 'notification' && activeTab !== 'printer')) && (
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
        )}
      </form>
    </div>
  );
};

export default Settings;

import React, { useState } from 'react';
import { usePrinterStore } from '../../store/usePrinterStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import {
  Printer,
  Bluetooth,
  BluetoothConnected,
  BluetoothOff,
  CheckCircle2,
  AlertCircle,
  Scissors,
  Zap,
  RefreshCw,
  Copy,
  FileText,
  Building2,
  CreditCard,
  Save,
  Eye,
  Trash2
} from 'lucide-react';
import { printDistributorInvoice } from '../../utils/distributorInvoice';
import type { SalesTransaction } from '../../types';

const PrinterSettings: React.FC = () => {
  const {
    isSupported,
    isConnected,
    isConnecting,
    deviceName,
    paperWidth,
    autoCut,
    autoPrintOnCheckout,
    autoReconnect,
    printDoubleCopies,
    lastPrintedAt,
    error,
    connect,
    reconnectSavedDevice,
    disconnect,
    forgetDevice,
    testPrint,
    setPaperWidth,
    setAutoCut,
    setAutoPrintOnCheckout,
    setAutoReconnect,
    setPrintDoubleCopies,
    clearError
  } = usePrinterStore();

  const { appName } = useSettingsStore();

  const [activeSubTab, setActiveSubTab] = useState<'thermal' | 'distributor'>('thermal');

  // State untuk Faktur Distributor (A4)
  const [compAddress, setCompAddress] = useState(
    localStorage.getItem('pos_dist_comp_address') || 'Jl. Raya Industri Pergudangan No. 88, Blok B3-B5, Jakarta'
  );
  const [compPhone, setCompPhone] = useState(
    localStorage.getItem('pos_dist_comp_phone') || '0812-3456-7890 / 021-5551234'
  );
  const [compEmail, setCompEmail] = useState(
    localStorage.getItem('pos_dist_comp_email') || 'distribusi@posmart.co.id'
  );
  const [compNpwp, setCompNpwp] = useState(
    localStorage.getItem('pos_dist_comp_npwp') || '01.234.567.8-901.000'
  );
  const [bankName, setBankName] = useState(
    localStorage.getItem('pos_dist_bank_name') || 'BCA (Bank Central Asia)'
  );
  const [bankAccount, setBankAccount] = useState(
    localStorage.getItem('pos_dist_bank_acc') || '8830-192-888'
  );
  const [bankHolder, setBankHolder] = useState(
    localStorage.getItem('pos_dist_bank_holder') || (appName || 'PT SWALAYAN RETAIL INDONESIA')
  );
  const [terms, setTerms] = useState(
    localStorage.getItem('pos_dist_terms') ||
    '1. Barang yang sudah diterima dalam kondisi baik tidak dapat dikembalikan tanpa persetujuan tertulis.\n2. Pembayaran bilyet giro/transfer dianggap sah setelah dana efektif masuk ke rekening.\n3. Komplain barang kurang/cacat maksimal 2x24 jam sejak barang diterima bersama faktur asli.'
  );
  const [defaultPrintFormat, setDefaultPrintFormat] = useState<'thermal' | 'a4'>(
    (localStorage.getItem('pos_default_print_format') as 'thermal' | 'a4') || 'thermal'
  );

  const [savedSuccess, setSavedSuccess] = useState(false);
  const [testPrintSuccess, setTestPrintSuccess] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestPrint = async () => {
    setIsTesting(true);
    setTestPrintSuccess(false);
    clearError();
    const ok = await testPrint(appName || 'HERO PRO SHOP');
    setIsTesting(false);
    if (ok) {
      setTestPrintSuccess(true);
      setTimeout(() => setTestPrintSuccess(false), 5000);
    }
  };

  const handleSaveDistributorSettings = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('pos_dist_comp_address', compAddress);
    localStorage.setItem('pos_dist_comp_phone', compPhone);
    localStorage.setItem('pos_dist_comp_email', compEmail);
    localStorage.setItem('pos_dist_comp_npwp', compNpwp);
    localStorage.setItem('pos_dist_bank_name', bankName);
    localStorage.setItem('pos_dist_bank_acc', bankAccount);
    localStorage.setItem('pos_dist_bank_holder', bankHolder);
    localStorage.setItem('pos_dist_terms', terms);
    localStorage.setItem('pos_default_print_format', defaultPrintFormat);

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 4000);
  };

  const handlePreviewA4 = () => {
    const dummySale: SalesTransaction = {
      id: 'INV-DIST-202610-001',
      date: new Date().toISOString(),
      total: 14750000,
      subtotal: 13500000,
      tax: 1250000,
      rounding: 0,
      paymentMethod: 'TRANSFER BANK',
      tendered: 14750000,
      change: 0,
      customerName: 'CV. Bintang Distribusi Mandiri',
      employeeName: 'Admin Distribusi / Sales',
      items: [
        {
          productId: 'P001',
          name: 'Minyak Goreng Sania Premium 2L (Dus/Karton)',
          qty: 25,
          price: 185000,
          subtotal: 4625000
        },
        {
          productId: 'P002',
          name: 'Beras Pandan Wangi Super 10 Kg',
          qty: 30,
          price: 155000,
          subtotal: 4650000
        },
        {
          productId: 'P003',
          name: 'Gula Pasir Kristal Putih 1 Kg (Karton isi 20)',
          qty: 15,
          price: 280000,
          subtotal: 4200000
        },
        {
          productId: 'P004',
          name: 'Teh Celup Sosro Box (Karton isi 48)',
          variantName: 'Isi 25 Tea Bags',
          qty: 2,
          price: 125000,
          subtotal: 250000,
          isCustomPrice: true,
          customPriceNote: 'Potongan Khusus Grosir'
        }
      ]
    };

    printDistributorInvoice(dummySale, {
      storeName: appName || 'POS MART DISTRIBUSI PUSAT',
      companyAddress: compAddress,
      companyPhone: compPhone,
      companyEmail: compEmail,
      companyNpwp: compNpwp,
      customerName: 'CV. Bintang Distribusi Mandiri',
      customerAddress: 'Kawasan Niaga Sentra Blok C No. 12, Surabaya',
      customerPhone: '0813-8899-7766',
      poNumber: 'PO-BDM/X/2026/089',
      paymentTerms: 'Tempo 14 Hari',
      bankName,
      bankAccount,
      bankHolder,
      notes: terms
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* SUB-TAB NAVIGATOR */}
      <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', width: 'fit-content', gap: '6px' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('thermal')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '9px',
            border: 'none',
            background: activeSubTab === 'thermal' ? 'white' : 'transparent',
            color: activeSubTab === 'thermal' ? '#0f172a' : '#64748b',
            fontWeight: 700,
            fontSize: '13.5px',
            cursor: 'pointer',
            boxShadow: activeSubTab === 'thermal' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <Printer size={17} />
          <span>Printer Bluetooth (Struk Thermal 58/80mm)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('distributor')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
            borderRadius: '9px',
            border: 'none',
            background: activeSubTab === 'distributor' ? '#2563eb' : 'transparent',
            color: activeSubTab === 'distributor' ? 'white' : '#64748b',
            fontWeight: 700,
            fontSize: '13.5px',
            cursor: 'pointer',
            boxShadow: activeSubTab === 'distributor' ? '0 2px 8px rgba(37,99,235,0.3)' : 'none',
            transition: 'all 0.15s ease'
          }}
        >
          <FileText size={17} />
          <span>Format Faktur Distributor (Kertas A4 / B2B)</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: PRINTER BLUETOOTH THERMAL */}
      {/* ========================================================================= */}
      {activeSubTab === 'thermal' && (
        <>
          {/* INTRO HERO BANNER */}
          <div style={{
            background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
            borderRadius: '14px',
            padding: '24px 28px',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '20px',
            boxShadow: '0 4px 12px rgba(15, 23, 42, 0.15)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <div style={{
                width: '54px', height: '54px', borderRadius: '12px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', boxShadow: '0 4px 10px rgba(37, 99, 235, 0.35)'
              }}>
                <Printer size={28} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>
                    Printer Kasir Bluetooth (ESC/POS)
                  </h3>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '20px',
                    background: isConnected ? '#15803d' : '#475569',
                    color: 'white',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isConnected ? '#4ade80' : '#94a3b8' }} />
                    {isConnected ? 'TERHUBUNG' : 'TERPUTUS'}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#94a3b8', lineHeight: 1.5 }}>
                  Cetak struk nota belanja kasir langsung dari laptop, tablet, atau smartphone ke printer thermal via Bluetooth tanpa kabel.
                </p>
              </div>
            </div>

            {/* CONNECTION BUTTONS */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {isConnected ? (
                <>
                  <button
                    type="button"
                    onClick={handleTestPrint}
                    disabled={isTesting}
                    style={{
                      padding: '10px 18px', borderRadius: '8px',
                      background: '#059669', color: 'white', border: 'none',
                      fontWeight: 700, fontSize: '13px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '8px',
                      boxShadow: '0 2px 4px rgba(5, 150, 105, 0.3)'
                    }}
                  >
                    {isTesting ? <RefreshCw size={15} className="spin" /> : <Printer size={15} />}
                    <span>Test Cetak Struk</span>
                  </button>
                  <button
                    type="button"
                    onClick={disconnect}
                    style={{
                      padding: '10px 16px', borderRadius: '8px',
                      background: '#334155', color: '#f1f5f9', border: '1px solid #475569',
                      fontWeight: 600, fontSize: '13px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    <BluetoothOff size={15} />
                    <span>Putuskan</span>
                  </button>
                </>
              ) : deviceName ? (
                <>
                  <button
                    type="button"
                    onClick={() => reconnectSavedDevice(false)}
                    disabled={isConnecting || !isSupported}
                    style={{
                      padding: '11px 20px', borderRadius: '9px', border: 'none',
                      background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                      color: 'white', fontWeight: 700, fontSize: '13.5px',
                      cursor: (isConnecting || !isSupported) ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: '8px',
                      boxShadow: '0 4px 10px rgba(37, 99, 235, 0.35)'
                    }}
                  >
                    {isConnecting ? <RefreshCw size={16} className="spin" /> : <BluetoothConnected size={17} />}
                    <span>{isConnecting ? 'Menyambungkan...' : `Sambungkan ke ${deviceName}`}</span>
                  </button>
                  <button
                    type="button"
                    onClick={connect}
                    disabled={isConnecting || !isSupported}
                    title="Cari dan pilih printer Bluetooth baru"
                    style={{
                      padding: '11px 16px', borderRadius: '9px', border: '1px solid #475569',
                      background: '#1e293b', color: '#e2e8f0', fontWeight: 600, fontSize: '13px',
                      cursor: (isConnecting || !isSupported) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Cari Printer Baru
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={connect}
                  disabled={isConnecting || !isSupported}
                  style={{
                    padding: '11px 22px', borderRadius: '9px', border: 'none',
                    background: isSupported ? 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)' : '#64748b',
                    color: 'white', fontWeight: 700, fontSize: '14px',
                    cursor: (isConnecting || !isSupported) ? 'not-allowed' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px',
                    boxShadow: isSupported ? '0 4px 10px rgba(37, 99, 235, 0.35)' : 'none'
                  }}
                >
                  {isConnecting ? <RefreshCw size={16} className="spin" /> : <BluetoothConnected size={17} />}
                  <span>{isConnecting ? 'Mencari Printer...' : 'Cari & Hubungkan Printer'}</span>
                </button>
              )}
            </div>
          </div>

          {/* ALERTS */}
          {testPrintSuccess && (
            <div style={{
              background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px',
              padding: '12px 18px', color: '#065f46', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px'
            }}>
              <CheckCircle2 size={18} color="#059669" />
              <span><strong>Uji Cetak Berhasil!</strong> Perintah struk telah dikirim ke printer Bluetooth Anda.</span>
            </div>
          )}

          {error && (
            <div style={{
              background: '#fff1f2', border: '1px solid #fecdd3', borderRadius: '10px',
              padding: '12px 18px', color: '#9f1239', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px'
            }}>
              <AlertCircle size={18} color="#e11d48" />
              <span>{error}</span>
            </div>
          )}

          {/* MAIN CONFIGURATION GRID */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '24px' }}>
            
            {/* LEFT COLUMN: PRINTER CONTROLS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* CURRENT DEVICE CARD */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '12px' }}>
                  Perangkat Aktif
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '42px', height: '42px', borderRadius: '8px',
                      background: isConnected ? '#dcfce7' : deviceName ? '#fef3c7' : '#f1f5f9',
                      color: isConnected ? '#16a34a' : deviceName ? '#d97706' : '#94a3b8',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      <Bluetooth size={22} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 800, fontSize: '14.5px', color: '#0f172a' }}>
                          {deviceName || 'Belum Ada Printer Terpilih'}
                        </span>
                        {deviceName && (
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: isConnected ? '#ecfdf5' : '#fef3c7',
                            color: isConnected ? '#059669' : '#b45309'
                          }}>
                            {isConnected ? 'TERHUBUNG' : 'TERSIMPAN (TERPUTUS)'}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                        {isConnected
                          ? 'Terhubung via Bluetooth GATT — Siap mencetak nota kasir'
                          : deviceName
                          ? 'Perangkat tersimpan. Klik "Sambungkan Sekarang" untuk langsung koneksi tanpa scan ulang'
                          : 'Klik "Cari & Hubungkan Printer" untuk menghubungkan printer'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {!isConnected && deviceName && (
                      <>
                        <button
                          type="button"
                          onClick={() => reconnectSavedDevice(false)}
                          disabled={isConnecting}
                          style={{
                            padding: '8px 14px', borderRadius: '8px', border: 'none',
                            background: '#2563eb', color: 'white', fontWeight: 700, fontSize: '12.5px',
                            cursor: isConnecting ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', gap: '6px',
                            boxShadow: '0 2px 4px rgba(37,99,235,0.25)'
                          }}
                        >
                          <RefreshCw size={13} className={isConnecting ? "spin" : ""} />
                          <span>{isConnecting ? 'Menyambungkan...' : 'Sambungkan Sekarang'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={forgetDevice}
                          title="Hapus memori printer tersimpan"
                          style={{
                            padding: '8px 12px', borderRadius: '8px', border: '1px solid #e2e8f0',
                            background: 'white', color: '#dc2626', fontWeight: 600, fontSize: '12px',
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <Trash2 size={13} />
                          <span>Ganti Printer</span>
                        </button>
                      </>
                    )}

                    {isConnected && (
                      <button
                        type="button"
                        onClick={disconnect}
                        style={{
                          padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1',
                          background: 'white', color: '#475569', fontWeight: 600, fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        Putuskan
                      </button>
                    )}
                  </div>
                </div>

                {lastPrintedAt && (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '10px', paddingLeft: '4px' }}>
                    Terakhir mencetak: <strong>{new Date(lastPrintedAt).toLocaleTimeString('id-ID')}</strong>
                  </div>
                )}
              </div>

              {/* PAPER WIDTH SELECTOR */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
                  Ukuran Kertas Thermal
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <button
                    type="button"
                    onClick={() => setPaperWidth('58mm')}
                    style={{
                      padding: '16px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                      border: paperWidth === '58mm' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: paperWidth === '58mm' ? '#eff6ff' : 'white',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '15px', color: paperWidth === '58mm' ? '#1d4ed8' : '#0f172a' }}>
                        58 mm
                      </span>
                      {paperWidth === '58mm' && <CheckCircle2 size={18} color="#2563eb" />}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Kapasitas 32 karakter per baris. Standar printer Bluetooth portabel / mobile POS.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaperWidth('80mm')}
                    style={{
                      padding: '16px', borderRadius: '10px', textAlign: 'left', cursor: 'pointer',
                      border: paperWidth === '80mm' ? '2px solid #2563eb' : '1px solid #cbd5e1',
                      background: paperWidth === '80mm' ? '#eff6ff' : 'white',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontWeight: 800, fontSize: '15px', color: paperWidth === '80mm' ? '#1d4ed8' : '#0f172a' }}>
                        80 mm
                      </span>
                      {paperWidth === '80mm' && <CheckCircle2 size={18} color="#2563eb" />}
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Kapasitas 48 karakter per baris. Standar printer kasir meja (desktop thermal).
                    </div>
                  </button>
                </div>
              </div>

              {/* PRINT PREFERENCES */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px' }}>
                  Preferensi Pencetakan
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <RefreshCw size={18} color="#10b981" />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>Otomatis Sambung Kembali saat Buka Halaman / Refresh</div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>Secara otomatis memulihkan koneksi ke printer {deviceName ? `(${deviceName})` : ''} tanpa perlu scan ulang</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoReconnect}
                      onChange={(e) => setAutoReconnect(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Zap size={18} color="#3b82f6" />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>Otomatis Cetak saat Transaksi Selesai</div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>Langsung kirim struk ke printer Bluetooth tanpa perlu klik cetak manual</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoPrintOnCheckout}
                      onChange={(e) => setAutoPrintOnCheckout(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Copy size={18} color="#8b5cf6" />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>Cetak Langsung 2x (Struk Rangkap)</div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>Cetak otomatis 2 lembar (Lembar Pelanggan & Lembar Toko / Arsip)</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={printDoubleCopies}
                      onChange={(e) => setPrintDoubleCopies(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </label>

                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '10px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Scissors size={18} color="#f59e0b" />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '13.5px', color: '#0f172a' }}>Potong Kertas Otomatis (Auto-Cut)</div>
                        <div style={{ fontSize: '11.5px', color: '#64748b' }}>Kirim sinyal potong kertas ke cutter printer setelah nota selesai dicetak</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoCut}
                      onChange={(e) => setAutoCut(e.target.checked)}
                      style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    />
                  </label>
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: LIVE THERMAL RECEIPT PREVIEW */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Pratinjau Kertas Struk ({paperWidth})
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {printDoubleCopies && (
                    <span style={{ fontSize: '10.5px', fontWeight: 700, background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: '6px' }}>
                      2x Rangkap Aktif
                    </span>
                  )}
                  <span style={{ fontSize: '11px', color: '#64748b' }}>
                    {paperWidth === '58mm' ? '32 Karakter' : '48 Karakter'}
                  </span>
                </div>
              </div>

              <div style={{
                background: 'white',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '24px 20px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.06)',
                fontFamily: "'Courier New', Courier, monospace",
                fontSize: '11px',
                lineHeight: 1.35,
                color: '#000',
                maxWidth: paperWidth === '58mm' ? '280px' : '360px',
                margin: '0 auto',
                width: '100%'
              }}>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '14px', marginBottom: '2px' }}>
                  {appName || 'POS MART'}
                </div>
                <div style={{ textAlign: 'center', fontSize: '11px', marginBottom: '2px' }}>STRUK PENJUALAN KASIR</div>
                {printDoubleCopies && (
                  <div style={{ textAlign: 'center', margin: '3px 0' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, background: '#f1f5f9', border: '1px solid #94a3b8', padding: '1px 6px', borderRadius: '3px' }}>
                      [ LEMBAR 1: PELANGGAN ]
                    </span>
                  </div>
                )}
                <div style={{ textAlign: 'center', fontSize: '10px', color: '#64748b', marginBottom: '8px' }}>Pusat Perbelanjaan & Swalayan</div>
                
                <div style={{ borderBottom: '1px dashed #94a3b8', margin: '8px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>No. Nota</span>
                  <span>INV-20261016-001</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tanggal</span>
                  <span>16 Okt 2026 21:30</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Kasir</span>
                  <span>Budi Santoso</span>
                </div>

                <div style={{ borderBottom: '1px dashed #94a3b8', margin: '8px 0' }} />

                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontWeight: 'bold' }}>1. Indomie Goreng Spesial [DUS]</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>   1 Dus x 128.000</span>
                    <span>128.000</span>
                  </div>
                </div>

                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontWeight: 'bold' }}>2. Sampoerna A Mild 16 [SLOP]</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>   1 Slop x 342.000</span>
                    <span>342.000</span>
                  </div>
                </div>

                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontWeight: 'bold' }}>3. Minyak Bimoli 2L [GROSIR]</div>
                  <div style={{ fontSize: '9.5px', color: '#dc2626' }}>   *Special: Grosir (Normal: 38.000)</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>   3 Pouch x 36.500</span>
                    <span>109.500</span>
                  </div>
                </div>

                <div style={{ marginBottom: '6px' }}>
                  <div style={{ fontWeight: 'bold' }}>4. Kaos Polos Combed 30s [ECER]</div>
                  <div style={{ fontSize: '9.5px', color: '#64748b' }}>   Varian: Hitam M</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>   1 Pcs x 45.000</span>
                    <span>45.000</span>
                  </div>
                </div>

                <div style={{ borderBottom: '1px dashed #94a3b8', margin: '8px 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Total Item</span>
                  <span>4 jenis / 6 qty</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Subtotal</span>
                  <span>624.500</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '13px' }}>
                  <span>TOTAL</span>
                  <span>624.500</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Tunai</span>
                  <span>700.000</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>Kembalian</span>
                  <span>75.500</span>
                </div>

                <div style={{ borderBottom: '1px dashed #94a3b8', margin: '8px 0' }} />
                <div style={{ textAlign: 'center', fontSize: '11px' }}>Terima kasih atas kunjungan Anda</div>
                <div style={{ textAlign: 'center', fontSize: '10px', color: '#64748b' }}>Barang yang dibeli tidak dapat ditukar</div>
              </div>
            </div>

          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: FORMAT FAKTUR DISTRIBUTOR (KERTAS A4 / B2B) */}
      {/* ========================================================================= */}
      {activeSubTab === 'distributor' && (
        <form onSubmit={handleSaveDistributorSettings} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* BANNER PENJELASAN FAKTUR DISTRIBUTOR A4 */}
          <div style={{
            background: 'linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%)',
            borderRadius: '14px',
            padding: '22px 28px',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '16px',
            boxShadow: '0 4px 12px rgba(30, 58, 138, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '50px', height: '50px', borderRadius: '12px',
                background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>
                <FileText size={26} color="#93c5fd" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800 }}>
                  Format Faktur Distributor & B2B (Kertas A4 / Surat Jalan)
                </h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#bfdbfe', maxWidth: '640px', lineHeight: 1.45 }}>
                  Khusus transaksi distributor, agen grosir, dan pengiriman antar gudang. Memuat Kop Resmi Perusahaan, NPWP, Rekening Pembayaran Bank, Terbilang Rupiah, dan 4 Kolom Tanda Tangan (Fakturis, Gudang, Ekspedisi, Penerima).
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={handlePreviewA4}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: '9px',
                  background: 'white',
                  color: '#1e40af',
                  fontWeight: 700,
                  fontSize: '13px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.15)'
                }}
              >
                <Eye size={16} />
                <span>Uji Cetak / Pratinjau A4</span>
              </button>
            </div>
          </div>

          {/* DUAL CONNECTIVITY STATUS: USB & BLUETOOTH */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
            {/* CARD USB */}
            <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#eff6ff', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Printer size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>Printer USB (Kabel)</span>
                  <span style={{ fontSize: '10px', fontWeight: 800, background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '12px' }}>AKTIF / SIAP</span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.35 }}>
                  Mendukung printer USB A4 (Epson, Canon, HP, Brother, Dot-Matrix) via driver sistem komputer.
                </div>
              </div>
            </div>

            {/* CARD BLUETOOTH */}
            <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: isConnected ? '#ecfdf5' : '#f8fafc', color: isConnected ? '#15803d' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Bluetooth size={22} />
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontWeight: 800, fontSize: '13.5px', color: '#0f172a' }}>Printer Bluetooth (Wireless)</span>
                  <span style={{ fontSize: '10px', fontWeight: 800, background: isConnected ? '#ecfdf5' : '#f1f5f9', color: isConnected ? '#059669' : '#64748b', padding: '2px 8px', borderRadius: '12px' }}>
                    {isConnected ? 'TERHUBUNG' : 'OPSIONAL'}
                  </span>
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', lineHeight: 1.35 }}>
                  {isConnected ? `Terhubung ke ${deviceName}. Siap mencetak nota/faktur nirkabel.` : 'Dapat digunakan untuk printer mobile/thermal nirkabel via Web Bluetooth.'}
                </div>
              </div>
            </div>
          </div>

          {savedSuccess && (
            <div style={{
              background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px',
              padding: '12px 18px', color: '#065f46', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px'
            }}>
              <CheckCircle2 size={18} color="#059669" />
              <span><strong>Berhasil Disimpan!</strong> Format faktur distributor A4 telah diperbarui dan langsung aktif.</span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: '24px' }}>
            
            {/* FORM INPUTS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* KOP & IDENTITAS PERUSAHAAN B2B */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Building2 size={18} color="#2563eb" />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                    Kop Surat & Identitas Distributor / Toko
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Alamat Lengkap Kantor / Gudang Distribusi
                    </label>
                    <textarea
                      rows={2}
                      value={compAddress}
                      onChange={e => setCompAddress(e.target.value)}
                      placeholder="Contoh: Jl. Raya Pergudangan No. 88, Blok A, Jakarta Barat"
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        No. Telepon / WhatsApp
                      </label>
                      <input
                        type="text"
                        value={compPhone}
                        onChange={e => setCompPhone(e.target.value)}
                        placeholder="Contoh: 0812-3456-7890"
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Email Perusahaan
                      </label>
                      <input
                        type="email"
                        value={compEmail}
                        onChange={e => setCompEmail(e.target.value)}
                        placeholder="Contoh: info@distributor.com"
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Nomor Pokok Wajib Pajak (NPWP Perusahaan)
                    </label>
                    <input
                      type="text"
                      value={compNpwp}
                      onChange={e => setCompNpwp(e.target.value)}
                      placeholder="Contoh: 01.234.567.8-901.000 (Opsional, isi '-' jika belum ada)"
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>
              </div>

              {/* REKENING TRANSFER BANK UNTUK DISTRIBUTOR */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <CreditCard size={18} color="#059669" />
                  <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase' }}>
                    Rekening Pembayaran Bank Resmi
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Nama Bank
                      </label>
                      <input
                        type="text"
                        value={bankName}
                        onChange={e => setBankName(e.target.value)}
                        placeholder="Contoh: BCA / Mandiri / BRI"
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                        Nomor Rekening
                      </label>
                      <input
                        type="text"
                        value={bankAccount}
                        onChange={e => setBankAccount(e.target.value)}
                        placeholder="Contoh: 8830-192-888"
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1', fontFamily: 'monospace' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                      Atas Nama Rekening
                    </label>
                    <input
                      type="text"
                      value={bankHolder}
                      onChange={e => setBankHolder(e.target.value)}
                      placeholder="Contoh: PT. SWALAYAN RETAIL INDONESIA"
                      style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>
              </div>

              {/* SYARAT & KETENTUAN FAKTUR */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '10px' }}>
                  Syarat & Ketentuan Faktur Distributor
                </div>
                <textarea
                  rows={4}
                  value={terms}
                  onChange={e => setTerms(e.target.value)}
                  placeholder="Ketik poin-poin syarat & ketentuan faktur penjualan / pengiriman..."
                  style={{ width: '100%', padding: '10px 12px', fontSize: '12px', borderRadius: '8px', border: '1px solid #cbd5e1', lineHeight: 1.45 }}
                />
              </div>

              {/* PREFERENSI DEFAULT CETAK DI KASIR */}
              <div style={{ background: 'white', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Format Dokumen Default saat Selesai Transaksi Kasir
                </div>

                <div style={{ display: 'flex', gap: '14px' }}>
                  <label style={{
                    flex: 1, padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: defaultPrintFormat === 'thermal' ? '#eff6ff' : 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '10px'
                  }}>
                    <input
                      type="radio"
                      name="defaultFormat"
                      checked={defaultPrintFormat === 'thermal'}
                      onChange={() => setDefaultPrintFormat('thermal')}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>Struk Kasir (Thermal)</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Cocok untuk kasir eceran / umum</div>
                    </div>
                  </label>

                  <label style={{
                    flex: 1, padding: '12px 14px', borderRadius: '8px', border: '1px solid #cbd5e1',
                    background: defaultPrintFormat === 'a4' ? '#eff6ff' : 'white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '10px'
                  }}>
                    <input
                      type="radio"
                      name="defaultFormat"
                      checked={defaultPrintFormat === 'a4'}
                      onChange={() => setDefaultPrintFormat('a4')}
                    />
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>Faktur Distributor (A4)</div>
                      <div style={{ fontSize: '11px', color: '#64748b' }}>Cocok jika dominan penjualan B2B / grosir</div>
                    </div>
                  </label>
                </div>
              </div>

              {/* TOMBOL SIMPAN */}
              <button
                type="submit"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '13px 24px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '14px',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: '0 4px 10px rgba(37, 99, 235, 0.3)'
                }}
              >
                <Save size={18} />
                <span>Simpan Pengaturan Faktur Distributor</span>
              </button>

            </div>

            {/* MINI VISUAL PREVIEW OF A4 INVOICE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '12px', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Simulasi Visual Dokumen A4 Distributor
              </div>

              <div style={{
                background: 'white',
                border: '1px solid #cbd5e1',
                borderRadius: '8px',
                padding: '20px 18px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
                fontSize: '9.5px',
                lineHeight: 1.35,
                color: '#1e293b'
              }}>
                {/* KOP PREVIEW */}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '8px', marginBottom: '10px' }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: '12px', color: '#0f172a' }}>{appName || 'POS MART DISTRIBUSI'}</div>
                    <div style={{ color: '#475569', fontSize: '8.5px', maxWidth: '200px' }}>{compAddress}</div>
                    <div style={{ color: '#475569', fontSize: '8.5px' }}>Telp: {compPhone}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, fontSize: '13px', color: '#0f172a' }}>FAKTUR PENJUALAN</div>
                    <div style={{ fontWeight: 700, color: '#2563eb', fontFamily: 'monospace' }}>INV-DIST-2026/001</div>
                    <span style={{ background: '#ecfdf5', color: '#059669', padding: '1px 6px', borderRadius: '4px', fontWeight: 700, fontSize: '8px' }}>LUNAS</span>
                  </div>
                </div>

                {/* TARGET PREVIEW */}
                <div style={{ background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', border: '1px solid #e2e8f0', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ fontSize: '8px', fontWeight: 700, color: '#64748b' }}>KEPADA YTH:</div>
                    <div style={{ fontWeight: 800 }}>CV. Bintang Distribusi Mandiri</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '8px', fontWeight: 700, color: '#64748b' }}>TANGGAL / TEMPO:</div>
                    <div>16 Okt 2026 (Tempo 14 Hari)</div>
                  </div>
                </div>

                {/* TABEL PREVIEW */}
                <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '10px', fontSize: '8.5px' }}>
                  <thead>
                    <tr style={{ background: '#0f172a', color: 'white' }}>
                      <th style={{ padding: '4px', textAlign: 'left' }}>Item</th>
                      <th style={{ padding: '4px', textAlign: 'center' }}>Qty</th>
                      <th style={{ padding: '4px', textAlign: 'right' }}>Harga</th>
                      <th style={{ padding: '4px', textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '4px' }}>Minyak Goreng 2L (Karton)</td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>25 Dus</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>185.000</td>
                      <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700 }}>4.625.000</td>
                    </tr>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <td style={{ padding: '4px' }}>Beras Pandan Wangi 10kg</td>
                      <td style={{ padding: '4px', textAlign: 'center' }}>30 Sak</td>
                      <td style={{ padding: '4px', textAlign: 'right' }}>155.000</td>
                      <td style={{ padding: '4px', textAlign: 'right', fontWeight: 700 }}>4.650.000</td>
                    </tr>
                  </tbody>
                </table>

                {/* REKAP & TERBILANG */}
                <div style={{ background: '#eff6ff', padding: '6px 8px', borderRadius: '4px', borderLeft: '3px solid #3b82f6', marginBottom: '8px', fontSize: '8.5px' }}>
                  <div style={{ fontWeight: 700, color: '#1e40af' }}>Terbilang:</div>
                  <div style={{ fontStyle: 'italic' }}>"Sembilan Juta Dua Ratus Tujuh Puluh Lima Ribu Rupiah"</div>
                </div>

                {/* SIGNATURES */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', textAlign: 'center', marginTop: '16px', gap: '4px', fontSize: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: '24px' }}>Fakturis</div>
                    <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '2px' }}>Admin</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: '24px' }}>Gudang</div>
                    <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '2px' }}>( ............ )</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: '24px' }}>Ekspedisi</div>
                    <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '2px' }}>( ............ )</div>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: '24px' }}>Penerima</div>
                    <div style={{ borderTop: '1px solid #94a3b8', paddingTop: '2px' }}>Cap & TTD</div>
                  </div>
                </div>
              </div>
            </div>

          </div>

        </form>
      )}

    </div>
  );
};

export default PrinterSettings;

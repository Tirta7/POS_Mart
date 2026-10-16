import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X, CheckCircle2, BluetoothConnected, RefreshCw, FileText, Receipt, Settings2 } from 'lucide-react';
import type { SalesTransaction } from '../types';
import { buildReceiptHtml, printReceipt } from '../utils/receipt';
import type { ReceiptOptions } from '../utils/receipt';
import { buildDistributorInvoiceHtml, printDistributorInvoice } from '../utils/distributorInvoice';
import type { DistributorInvoiceOptions } from '../utils/distributorInvoice';
import { usePrinterStore } from '../store/usePrinterStore';

interface Props {
  sale: SalesTransaction;
  options: ReceiptOptions;
  /** Langsung membuka dialog cetak saat struk tampil */
  autoPrint?: boolean;
  title?: string;
  printLabel?: string;
  defaultFormat?: 'thermal' | 'a4';
  onClose: () => void;
}

const ReceiptModal: React.FC<Props> = ({
  sale,
  options,
  autoPrint = true,
  title = 'Pembayaran Berhasil',
  printLabel = 'Cetak Ulang',
  defaultFormat,
  onClose
}) => {
  // Format dokumen: 'thermal' (58/80mm) atau 'a4' (Faktur Distributor Resmi)
  const initialFormat = defaultFormat || (localStorage.getItem('pos_default_print_format') === 'a4' ? 'a4' : 'thermal');
  const [printFormat, setPrintFormat] = useState<'thermal' | 'a4'>(initialFormat);

  // Parameter tambahan untuk Faktur Distributor A4
  const [poNumber, setPoNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(sale.paymentMethod === 'TUNAI' ? 'Tunai / Cash' : 'Tempo 14 Hari');
  const [paperSize, setPaperSize] = useState<'A4' | 'A5'>('A4');
  const [showA4Settings, setShowA4Settings] = useState(false);

  // HTML Struk Thermal
  const thermalHtml = useMemo(() => buildReceiptHtml(sale, options), [sale, options]);

  // HTML Faktur Distributor A4
  const distOptions: DistributorInvoiceOptions = useMemo(() => ({
    storeName: options.storeName,
    customerName: options.customerName || sale.customerName,
    poNumber: poNumber.trim() || undefined,
    paymentTerms,
    paperSize,
  }), [options.storeName, options.customerName, sale.customerName, poNumber, paymentTerms, paperSize]);

  const a4Html = useMemo(() => buildDistributorInvoiceHtml(sale, distOptions), [sale, distOptions]);

  const [height, setHeight] = useState(480);
  const printed = useRef(false);

  const { isConnected, deviceName, autoPrintOnCheckout, printReceiptBluetooth } = usePrinterStore();
  const [isBtPrinting, setIsBtPrinting] = useState(false);
  const [btSuccess, setBtSuccess] = useState(false);

  // Auto-print saat pertama kali render (hanya jika mode thermal)
  useEffect(() => {
    if (autoPrint && !printed.current) {
      printed.current = true;
      if (printFormat === 'thermal') {
        if (isConnected && autoPrintOnCheckout) {
          setIsBtPrinting(true);
          printReceiptBluetooth(sale, options).then(ok => {
            setIsBtPrinting(false);
            if (ok) {
              setBtSuccess(true);
              setTimeout(() => setBtSuccess(false), 4000);
            } else {
              printReceipt(sale, options);
            }
          });
        } else {
          printReceipt(sale, options);
        }
      }
    }
  }, [autoPrint, printFormat, sale, options, isConnected, autoPrintOnCheckout, printReceiptBluetooth]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handlePrintBluetooth = async () => {
    setIsBtPrinting(true);
    const ok = await printReceiptBluetooth(sale, options);
    setIsBtPrinting(false);
    if (ok) {
      setBtSuccess(true);
      setTimeout(() => setBtSuccess(false), 4000);
    }
  };

  const handlePrintA4 = () => {
    printDistributorInvoice(sale, distOptions);
  };

  const isA4 = printFormat === 'a4';

  return (
    <div
      className="r-modal-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '16px'
      }}
    >
      <div
        className="r-modal"
        style={{
          background: 'white',
          borderRadius: '16px',
          width: isA4 ? '780px' : '440px',
          maxWidth: '96vw',
          maxHeight: '94vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          transition: 'width 0.25s ease'
        }}
      >
        {/* HEADER MODAL */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={24} color="#16a34a" />
            <div>
              <div style={{ fontWeight: 800, fontSize: '16px', lineHeight: 1.2, color: '#0f172a' }}>{title}</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>No. Faktur: <strong>{sale.id}</strong></div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '8px', color: '#64748b' }}
            title="Tutup (Esc)"
          >
            <X size={22} />
          </button>
        </div>

        {/* TABS PEMILIH FORMAT KERTAS: THERMAL VS A4 DISTRIBUTOR */}
        <div style={{ background: '#f8fafc', padding: '8px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', background: '#e2e8f0', padding: '3px', borderRadius: '10px', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setPrintFormat('thermal')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: printFormat === 'thermal' ? 'white' : 'transparent',
                color: printFormat === 'thermal' ? '#0f172a' : '#64748b',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                boxShadow: printFormat === 'thermal' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Receipt size={15} />
              <span>Struk Kasir (Thermal)</span>
            </button>

            <button
              type="button"
              onClick={() => setPrintFormat('a4')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '8px',
                border: 'none',
                background: printFormat === 'a4' ? '#2563eb' : 'transparent',
                color: printFormat === 'a4' ? 'white' : '#64748b',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
                boxShadow: printFormat === 'a4' ? '0 2px 4px rgba(37,99,235,0.3)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <FileText size={15} />
              <span>Faktur Distributor (A4)</span>
            </button>
          </div>

          {isA4 && (
            <button
              type="button"
              onClick={() => setShowA4Settings(v => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                background: showA4Settings ? '#dbeafe' : 'white',
                color: '#2563eb',
                border: '1px solid #bfdbfe',
                padding: '5px 10px',
                borderRadius: '8px',
                fontSize: '11.5px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Settings2 size={14} />
              <span>{showA4Settings ? 'Sembunyikan Opsi' : 'Opsi Faktur B2B'}</span>
            </button>
          )}
        </div>

        {/* PANEL INPUT OPSI TAMBAHAN UNTUK A4 DISTRIBUTOR */}
        {isA4 && showA4Settings && (
          <div style={{ background: '#f1f5f9', padding: '12px 18px', borderBottom: '1px solid #cbd5e1', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: '1 1 180px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                No. PO / Ref Distributor:
              </label>
              <input
                type="text"
                value={poNumber}
                onChange={e => setPoNumber(e.target.value)}
                placeholder="Contoh: PO-DIST-2026/088"
                style={{ width: '100%', padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
              />
            </div>

            <div style={{ flex: '1 1 180px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                Termin Pembayaran:
              </label>
              <select
                value={paymentTerms}
                onChange={e => setPaymentTerms(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
              >
                <option value="Tunai / Cash">Tunai / Cash</option>
                <option value="COD (Cash on Delivery)">COD (Cash on Delivery)</option>
                <option value="Transfer Bank">Transfer Bank</option>
                <option value="Tempo 7 Hari">Tempo 7 Hari</option>
                <option value="Tempo 14 Hari">Tempo 14 Hari</option>
                <option value="Tempo 30 Hari">Tempo 30 Hari</option>
                <option value="Tempo 60 Hari">Tempo 60 Hari</option>
              </select>
            </div>

            <div style={{ flex: '0 0 120px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '3px' }}>
                Ukuran Kertas:
              </label>
              <select
                value={paperSize}
                onChange={e => setPaperSize(e.target.value as 'A4' | 'A5')}
                style={{ width: '100%', padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid #cbd5e1', background: 'white' }}
              >
                <option value="A4">A4 Standar</option>
                <option value="A5">A5 Landscape</option>
              </select>
            </div>
          </div>
        )}

        {/* NOTIFIKASI SUKSES PRINT BLUETOOTH */}
        {btSuccess && (
          <div style={{ background: '#ecfdf5', borderBottom: '1px solid #a7f3d0', padding: '8px 16px', fontSize: '12px', color: '#065f46', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={16} color="#059669" />
            <span>Struk berhasil dikirim ke printer Bluetooth ({deviceName || 'Printer'})</span>
          </div>
        )}

        {/* CONTAINER PREVIEW DOKUMEN */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#cbd5e1', padding: '16px', display: 'flex', justifyContent: 'center' }}>
          <iframe
            title={isA4 ? 'Pratinjau Faktur Distributor A4' : 'Pratinjau Struk Thermal'}
            srcDoc={isA4 ? a4Html : thermalHtml}
            onLoad={e => {
              const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
              if (doc?.body) {
                setHeight(Math.min(doc.body.scrollHeight + 16, isA4 ? 640 : 500));
              }
            }}
            style={{
              width: isA4 ? '100%' : '80mm',
              maxWidth: '100%',
              minHeight: isA4 ? '520px' : `${height}px`,
              border: 'none',
              background: 'white',
              borderRadius: isA4 ? '6px' : '0px',
              boxShadow: '0 4px 15px rgba(0,0,0,0.15)'
            }}
          />
        </div>

        {/* TOMBOL AKSI CETAK BAWAH */}
        <div style={{ display: 'flex', gap: '10px', padding: '14px 20px', borderTop: '1px solid #eee', alignItems: 'center', background: 'white' }}>
          {isA4 ? (
            /* AKSI MODE FAKTUR DISTRIBUTOR A4 */
            <>
              <button
                type="button"
                onClick={handlePrintA4}
                title="Cetak menggunakan printer yang tersambung kabel USB (Epson, Canon, HP, Brother, Dot-Matrix, dll) atau simpan sebagai PDF"
                style={{
                  flex: 1.5,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 18px',
                  border: 'none',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)',
                  color: 'white',
                  fontWeight: 700,
                  fontSize: '13.5px',
                  cursor: 'pointer',
                  boxShadow: '0 3px 6px rgba(29, 78, 216, 0.25)'
                }}
              >
                <Printer size={17} />
                <span>Cetak via USB / Sistem (A4)</span>
              </button>

              {isConnected && (
                <button
                  type="button"
                  onClick={handlePrintBluetooth}
                  disabled={isBtPrinting}
                  title="Cetak ringkasan Faktur B2B langsung ke printer Bluetooth"
                  style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)'
                  }}
                >
                  {isBtPrinting ? <RefreshCw size={15} className="spin" /> : <BluetoothConnected size={16} />}
                  <span>Cetak Bluetooth</span>
                </button>
              )}
            </>
          ) : (
            /* AKSI MODE STRUK THERMAL KASIR */
            <>
              {isConnected ? (
                <>
                  <button
                    type="button"
                    onClick={handlePrintBluetooth}
                    disabled={isBtPrinting}
                    style={{
                      flex: 1.4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px',
                      border: 'none',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
                      color: 'white',
                      fontWeight: 700,
                      fontSize: '14px',
                      cursor: 'pointer',
                      boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)'
                    }}
                  >
                    {isBtPrinting ? <RefreshCw size={16} className="spin" /> : <BluetoothConnected size={17} />}
                    <span>{isBtPrinting ? 'Mencetak...' : 'Cetak Bluetooth'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => printReceipt(sale, options)}
                    title="Cetak via Dialog Browser / Thermal USB"
                    style={{
                      padding: '12px 14px',
                      border: '1px solid #d1d5db',
                      borderRadius: '10px',
                      background: '#f8fafc',
                      color: '#475569',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Printer size={18} />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => printReceipt(sale, options)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px',
                    border: 'none',
                    borderRadius: '10px',
                    background: 'var(--primary)',
                    color: 'white',
                    fontWeight: 700,
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  <Printer size={18} /> {printLabel}
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 0.8,
              padding: '12px',
              border: '1px solid #d1d5db',
              borderRadius: '10px',
              background: 'white',
              color: '#374151',
              fontWeight: 700,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;

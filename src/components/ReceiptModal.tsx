import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Printer, X, CheckCircle2 } from 'lucide-react';
import type { SalesTransaction } from '../types';
import { buildReceiptHtml, printReceipt } from '../utils/receipt';
import type { ReceiptOptions } from '../utils/receipt';

interface Props {
  sale: SalesTransaction;
  options: ReceiptOptions;
  /** Langsung membuka dialog cetak saat struk tampil */
  autoPrint?: boolean;
  title?: string;
  printLabel?: string;
  onClose: () => void;
}

const ReceiptModal: React.FC<Props> = ({ sale, options, autoPrint = true, title = 'Pembayaran Berhasil', printLabel = 'Cetak Ulang', onClose }) => {
  const html = useMemo(() => buildReceiptHtml(sale, options), [sale, options]);
  const [height, setHeight] = useState(480);
  const printed = useRef(false);

  useEffect(() => {
    if (autoPrint && !printed.current) {
      printed.current = true;
      printReceipt(sale, options);
    }
  }, [autoPrint, sale, options]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="r-modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000 }}>
      <div className="r-modal" style={{ background: 'white', borderRadius: '16px', width: '420px', maxHeight: '94vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #eee' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={24} color="#16a34a" />
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px', lineHeight: 1.2 }}>{title}</div>
              <div style={{ fontSize: '12px', color: '#6b7280' }}>Nota {sale.id.replace('INV-', '')}</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer' }} title="Tutup (Esc)"><X size={22} color="#666" /></button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', background: '#e5e7eb', padding: '16px', display: 'flex', justifyContent: 'center' }}>
          <iframe
            title="Pratinjau Struk"
            srcDoc={html}
            onLoad={(e) => {
              const doc = (e.currentTarget as HTMLIFrameElement).contentDocument;
              if (doc?.body) setHeight(doc.body.scrollHeight + 8);
            }}
            style={{ width: '80mm', maxWidth: '100%', height: `${height}px`, border: 'none', background: 'white', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', padding: '14px 20px', borderTop: '1px solid #eee' }}>
          <button
            onClick={() => printReceipt(sale, options)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: '12px', border: 'none', borderRadius: '10px', background: 'var(--primary)', color: 'white', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
          >
            <Printer size={18} /> {printLabel}
          </button>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px', border: '1px solid #d1d5db', borderRadius: '10px', background: 'white', color: '#374151', fontWeight: 700, fontSize: '15px', cursor: 'pointer' }}
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;

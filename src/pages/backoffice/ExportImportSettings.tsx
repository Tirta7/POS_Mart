import React, { useState } from 'react';
import { 
  FileSpreadsheet, Download, Upload, CheckCircle2, AlertCircle, 
  RefreshCw, ArrowDownCircle, ArrowUpCircle, Check
} from 'lucide-react';
import { 
  exportMasterExcel, parseExcelFile, downloadExcelTemplate, 
  type ParsedImportData 
} from '../../utils/excelExportImport';
import { useInventoryStore } from '../../store/useInventoryStore';
import { useCustomerStore } from '../../store/useCustomerStore';
import { useSupplierStore } from '../../store/useSupplierStore';
import { useSalesStore } from '../../store/useSalesStore';

export const ExportImportSettings: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  // Import states
  const [isParsing, setIsParsing] = useState(false);
  const [parsedData, setParsedData] = useState<ParsedImportData | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // Refresh stores on import completion
  const { fetchProducts, fetchTransactions, fetchCategories } = useInventoryStore();
  const { fetchCustomers } = useCustomerStore();
  const { fetchSuppliers } = useSupplierStore();
  const { fetchSales } = useSalesStore();

  const handleExportAll = async () => {
    try {
      setIsExporting(true);
      setExportSuccessMsg(null);

      const res = await fetch('/api/saas/export/all', {
        headers: { 'x-tenant-id': 'TID-DEMO-123' }
      });

      if (!res.ok) {
        throw new Error('Gagal mengambil data lengkap dari server');
      }

      const fullData = await res.json();
      const savedName = exportMasterExcel(fullData);

      setExportSuccessMsg(`File Excel "${savedName}" berhasil diunduh ke perangkat Anda.`);
      setTimeout(() => setExportSuccessMsg(null), 8000);
    } catch (err: any) {
      console.error('Export failed:', err);
      alert('Gagal mengekspor data: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsParsing(true);
      setImportError(null);
      setImportResult(null);

      const data = await parseExcelFile(file);
      setParsedData(data);
    } catch (err: any) {
      console.error('Parse excel failed:', err);
      setImportError('Gagal membaca file Excel. Pastikan format file adalah .xlsx atau .xls valid.');
      setParsedData(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedData) return;

    try {
      setIsImporting(true);
      setImportError(null);

      const payload = {
        products: parsedData.products,
        customers: parsedData.customers,
        suppliers: parsedData.suppliers,
        users: parsedData.users
      };

      const res = await fetch('/api/saas/import/master', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': 'TID-DEMO-123'
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Terjadi kesalahan saat menyimpan data import');
      }

      const result = await res.json();
      setImportResult(result);

      // Auto-refresh data stores
      await Promise.all([
        fetchProducts(),
        fetchCategories(),
        fetchCustomers(),
        fetchSuppliers(),
        fetchTransactions(),
        fetchSales()
      ]);

      setParsedData(null);
    } catch (err: any) {
      console.error('Import execute error:', err);
      setImportError(err.message || 'Gagal memproses import data.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* INTRO BANNER */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <FileSpreadsheet size={28} />
        </div>
        <div>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
            Integrasi & Backup Data Excel (.xlsx)
          </h4>
          <p style={{ margin: 0, fontSize: '13px', color: '#64748b', lineHeight: 1.5 }}>
            Export seluruh database operasional swalayan ke file Excel multi-sheet terstruktur, atau import data produk, pelanggan, dan supplier secara massal dari Excel.
          </p>
        </div>
      </div>

      {/* NOTIFICATION BANNERS */}
      {exportSuccessMsg && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', color: '#065f46', fontSize: '14px', fontWeight: 600 }}>
          <CheckCircle2 size={20} color="#059669" />
          <span>{exportSuccessMsg}</span>
        </div>
      )}

      {importResult && (
        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '10px', padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
          <CheckCircle2 size={24} color="#059669" style={{ marginTop: '2px' }} />
          <div>
            <h5 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 800, color: '#065f46' }}>
              Import Data Excel Berhasil!
            </h5>
            <div style={{ fontSize: '13px', color: '#047857', display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '4px' }}>
              <span>📦 <strong>{importResult.stats?.products || 0}</strong> Produk Baru</span>
              <span>🔄 <strong>{importResult.stats?.updatedProducts || 0}</strong> Produk Diperbarui</span>
              <span>👥 <strong>{importResult.stats?.customers || 0}</strong> Pelanggan Ditambahkan</span>
              <span>🏢 <strong>{importResult.stats?.suppliers || 0}</strong> Supplier Ditambahkan</span>
              <span>👤 <strong>{importResult.stats?.users || 0}</strong> Karyawan Ditambahkan</span>
            </div>
          </div>
        </div>
      )}

      {importError && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '12px', color: '#991b1b', fontSize: '14px' }}>
          <AlertCircle size={20} color="#dc2626" />
          <span>{importError}</span>
        </div>
      )}

      {/* TWO MAIN SECTIONS: EXPORT & IMPORT */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '20px' }}>
        
        {/* SECTION 1: EXPORT DATA */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#dcfce7', color: '#16a34a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowDownCircle size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>Export Data ke Excel</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>Unduh data lengkap dalam 1 Master Workbook .xlsx</p>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
            Ketika Anda mengklik tombol di bawah ini, seluruh data berikut akan diexport otomatis ke sheet masing-masing:
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            {[
              { icon: '📦', label: 'Manajemen Stok' },
              { icon: '🔄', label: 'Mutasi Stok' },
              { icon: '🛒', label: 'Pembelian Supplier' },
              { icon: '👥', label: 'Data Pelanggan' },
              { icon: '🛍️', label: 'Riwayat Pembelian' },
              { icon: '🏢', label: 'Data Supplier & Hutang' },
              { icon: '👤', label: 'Data Karyawan' },
              { icon: '📊', label: 'Laporan & Analitik' },
              { icon: '🧾', label: 'Daftar Nota Penjualan' }
            ].map((item, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#f8fafc', border: '1px solid #f1f5f9', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleExportAll}
            disabled={isExporting}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              width: '100%', padding: '14px 20px', borderRadius: '10px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: 'white', border: 'none', fontWeight: 800, fontSize: '15px',
              cursor: isExporting ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.25)',
              transition: 'all 0.15s'
            }}
          >
            {isExporting ? (
              <>
                <RefreshCw size={20} className="spin" />
                <span>Memproses Export Excel...</span>
              </>
            ) : (
              <>
                <Download size={20} />
                <span>EXPORT SEMUA DATA (EXCEL .XLSX)</span>
              </>
            )}
          </button>
        </div>

        {/* SECTION 2: IMPORT DATA */}
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ArrowUpCircle size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>Import Data dari Excel</h3>
              <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#64748b' }}>Unggah file Excel untuk menambah atau update data massal</p>
            </div>
          </div>

          <p style={{ margin: 0, fontSize: '13px', color: '#334155', lineHeight: 1.6 }}>
            Unggah file Master Excel atau download template format standar jika ingin mengisi data baru:
          </p>

          {/* TEMPLATE DOWNLOAD BUTTONS */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
              Download Template Standar:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              <button
                type="button"
                onClick={() => downloadExcelTemplate('MASTER')}
                style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} /> Template Master (Lengkap)
              </button>
              <button
                type="button"
                onClick={() => downloadExcelTemplate('PRODUCT')}
                style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} /> Template Produk
              </button>
              <button
                type="button"
                onClick={() => downloadExcelTemplate('CUSTOMER')}
                style={{ padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Download size={14} /> Template Pelanggan
              </button>
            </div>
          </div>

          {/* FILE UPLOAD DROPZONE */}
          <div style={{
            border: '2px dashed #cbd5e1', borderRadius: '10px', padding: '24px 16px',
            textAlign: 'center', background: '#f8fafc', cursor: 'pointer',
            transition: 'border-color 0.2s'
          }}>
            <input
              type="file"
              id="excel-file-input"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <label htmlFor="excel-file-input" style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                <Upload size={22} />
              </div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>
                {isParsing ? 'Membaca File Excel...' : 'Klik untuk Pilih File Excel (.xlsx)'}
              </div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>
                Mendukung Master Workbook atau file lembar tunggal
              </div>
            </label>
          </div>

        </div>
      </div>

      {/* MODAL / SECTION PREVIEW IMPORT */}
      {parsedData && (
        <div style={{ background: 'white', border: '2px solid #3b82f6', borderRadius: '12px', padding: '24px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '17px', fontWeight: 800, color: '#0f172a' }}>
                  Pratinjau Data Siap Diimpor
                </h4>
                <span style={{ fontSize: '12px', fontWeight: 700, background: '#dbeafe', color: '#1d4ed8', padding: '3px 10px', borderRadius: '20px' }}>
                  {parsedData.fileName}
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                Periksa data yang terdeteksi sebelum memasukkannya ke database aplikasi.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setParsedData(null)}
                disabled={isImporting}
                style={{ padding: '8px 16px', borderRadius: '8px', background: '#f1f5f9', color: '#475569', border: '1px solid #cbd5e1', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting || parsedData.totalRows === 0}
                style={{
                  padding: '8px 20px', borderRadius: '8px',
                  background: 'var(--primary, #ef4444)', color: 'white',
                  border: 'none', fontWeight: 800, fontSize: '14px',
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}
              >
                {isImporting ? <RefreshCw size={16} className="spin" /> : <Check size={16} />}
                <span>Mulai Proses Import ({parsedData.totalRows} Baris)</span>
              </button>
            </div>
          </div>

          {/* DETECTED MODULES STATS */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Manajemen Stok</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {parsedData.products.length} <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b' }}>produk</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Data Pelanggan</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {parsedData.customers.length} <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b' }}>pelanggan</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Data Supplier</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {parsedData.suppliers.length} <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b' }}>supplier</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Data Karyawan</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                {parsedData.users.length} <span style={{ fontSize: '12px', fontWeight: 500, color: '#64748b' }}>karyawan</span>
              </div>
            </div>
          </div>

          {/* SAMPLE PREVIEW TABLE (TOP 5 PRODUCTS) */}
          {parsedData.products.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Contoh 5 Baris Pertama Produk yang Terbaca:
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '8px 12px' }}>Barcode / SKU</th>
                      <th style={{ padding: '8px 12px' }}>Nama Produk</th>
                      <th style={{ padding: '8px 12px' }}>Kategori</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Harga Beli</th>
                      <th style={{ padding: '8px 12px', textAlign: 'right' }}>Harga Jual</th>
                      <th style={{ padding: '8px 12px', textAlign: 'center' }}>Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.products.slice(0, 5).map((p, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontFamily: 'monospace' }}>{p.barcode || '-'}</td>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.name}</td>
                        <td style={{ padding: '8px 12px' }}>{p.category || '-'}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>Rp {Number(p.purchase_price || 0).toLocaleString('id-ID')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>Rp {Number(p.selling_price || 0).toLocaleString('id-ID')}</td>
                        <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700 }}>{p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SAMPLE PREVIEW TABLE (TOP 5 CUSTOMERS) */}
          {parsedData.customers.length > 0 && (
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '8px' }}>
                Contoh 5 Baris Pertama Pelanggan yang Terbaca:
              </div>
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
                  <thead style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <tr>
                      <th style={{ padding: '8px 12px' }}>Nama Pelanggan</th>
                      <th style={{ padding: '8px 12px' }}>No. Telepon / WA</th>
                      <th style={{ padding: '8px 12px' }}>Alamat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.customers.slice(0, 5).map((c, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.name}</td>
                        <td style={{ padding: '8px 12px' }}>{c.phone || '-'}</td>
                        <td style={{ padding: '8px 12px' }}>{c.address || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

    </div>
  );
};

export default ExportImportSettings;

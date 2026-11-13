import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Copy,
  CheckCircle,
  CheckCircle2,
  RefreshCw,
  QrCode,
  MessageCircle,
  WifiOff,
  KeyRound,
  AlertTriangle,
  Lock,
  Tag,
  ArrowRight,
  ShieldCheck,
  CalendarCheck2,
  Receipt,
  Download,
  X,
} from 'lucide-react';
import { subscribeLicenseStream } from '../utils/licenseStream';
import { useSettingsStore } from '../store/useSettingsStore';
import { downloadLicenseInvoicePdf } from '../utils/licenseInvoice';

export interface LicensePackage {
  id: string;
  days: number;
  label: string;
  name?: string;
  basePrice?: number;
  promoPrice?: number | null;
  original_price?: number;
  promo_price?: number | null;
  is_promo?: boolean;
  promo_badge?: string;
  promoBadge?: string;
  unique_code?: number;
  final_amount?: number;
  amount: number;
  amount_text: string;
  qris_image_url?: string;
  qris?: string;
}

export interface LicenseBilling {
  reason: 'locked' | 'expired';
  unique_code?: number;
  amount: number;
  amount_text: string;
  currency: string;
  package?: Partial<LicensePackage>;
  packages?: LicensePackage[];
  merchant_name: string;
  merchant_city?: string;
  qris: string;
  qris_image_url: string;
  note: string;
  contact: string;
}

export interface UnlockReceiptPayload {
  invoiceNumber: string;
  method: 'qris' | 'manual' | 'admin';
  paidAt: string;
  addedDays?: number;
  packageId?: string | null;
  packageLabel: string;
  amountNumber: number;
  amountText: string;
  uniqueCode: number;
  merchantName: string;
  adminContact?: string;
}

export interface LicenseState {
  allowed: boolean;
  status: 'active' | 'expiring' | 'expired' | 'locked' | 'pending' | 'offline';
  reason?: string;
  lockReason?: string;
  machineId?: string;
  expiresAt?: string | null;
  daysLeft?: number | null;
  licenseKey?: string | null;
  billing?: LicenseBilling | null;
  unlockReceipt?: UnlockReceiptPayload | null;
  offline?: boolean;
}

const toWaNumber = (contact: string) => {
  const d = (contact || '').replace(/\D/g, '');
  return d.startsWith('0') ? `62${d.slice(1)}` : d;
};

const formatRupiah = (amount: number) =>
  `Rp${Math.round(amount || 0).toLocaleString('id-ID')}`;

const formatIndoDate = (iso?: string | null) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
};

const formatDateTimeNow = () =>
  new Date().toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(/\./g, ':');

const buildInvoiceNumber = (machineId: string) => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const tail = String(machineId || 'POS').replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase() || '0001';
  const timeCode = `${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  return `INV/VOCML/${y}${m}${day}/${tail}-${timeCode}`;
};

const toWibDayIndex = (isoOrYmd?: string | null): number | null => {
  if (!isoOrYmd) return null;
  const raw = String(isoOrYmd).trim();
  let ymd = '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    ymd = raw;
  } else {
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return null;
    ymd = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
  }
  const ms = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
};

interface UnlockSuccessInfo {
  invoiceNumber: string;
  method: 'qris' | 'manual' | 'admin';
  paidAt: string;
  packageLabel: string;
  amountNumber: number;
  amountText: string;
  uniqueCode: number;
  merchantName: string;
  adminContact?: string;
  machineId: string;
  expiresAt?: string | null;
  daysLeft?: number | null;
  licenseKey?: string | null;
}

const isStateLocked = (data: LicenseState | null): boolean =>
  data !== null &&
  (!data.allowed || data.status === 'locked' || data.status === 'expired' || data.status === 'pending');

const getBadgeStyle = (badge: string): React.CSSProperties => {
  const upper = badge.toUpperCase();
  if (upper.includes('LARIS')) {
    return { background: 'linear-gradient(135deg, #f97316, #ef4444)', color: '#ffffff' };
  }
  if (upper.includes('COBA')) {
    return { background: '#ef4444', color: '#ffffff' };
  }
  if (upper.includes('HEMAT')) {
    return { background: '#e11d48', color: '#ffffff' };
  }
  if (upper.includes('EKONOMIS')) {
    return { background: '#2563eb', color: '#ffffff' };
  }
  if (upper.includes('PREMIUM') || upper.includes('BISNIS')) {
    return { background: '#7c3aed', color: '#ffffff' };
  }
  return { background: '#4f46e5', color: '#ffffff' };
};

const PAYMENT_METHODS: { name: string; color: string }[] = [
  { name: 'Mandiri', color: '#003d79' },
  { name: 'BCA', color: '#005baa' },
  { name: 'BRI', color: '#00529c' },
  { name: 'BNI', color: '#f15a23' },
  { name: 'DANA', color: '#118eea' },
  { name: 'OVO', color: '#4c3494' },
  { name: 'GoPay', color: '#00aed6' },
  { name: 'ShopeePay', color: '#ee4d2d' },
];

export const LicenseLockScreen: React.FC = () => {
  const [license, setLicense] = useState<LicenseState | null>(null);
  const [selectedPkgId, setSelectedPkgId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [manualKey, setManualKey] = useState('');
  const [activating, setActivating] = useState(false);
  const [activateMsg, setActivateMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [checkingNow, setCheckingNow] = useState(false);
  const [checkMsg, setCheckMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const appName = useSettingsStore((s) => s.appName);
  const [unlockSuccess, setUnlockSuccess] = useState<UnlockSuccessInfo | null>(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [autoOpenCountdown, setAutoOpenCountdown] = useState<number>(5);

  const prevLockedRef = useRef<boolean | null>(null);
  const lastStateJsonRef = useRef<string>('');
  const isLockedRef = useRef<boolean>(false);
  const lastWakeCheckRef = useRef<number>(0);
  const machineIdRef = useRef<string>('');
  const pendingUnlockMethodRef = useRef<'qris' | 'manual'>('qris');
  const unlockBillingSnapRef = useRef<{
    hadBilling: boolean;
    prevExpiresAt: string | null;
    packages: LicensePackage[];
    packageLabel: string;
    amountNumber: number;
    amountText: string;
    uniqueCode: number;
    merchantName: string;
    adminContact: string;
  }>({
    hadBilling: false,
    prevExpiresAt: null,
    packages: [],
    packageLabel: '',
    amountNumber: 0,
    amountText: '',
    uniqueCode: 0,
    merchantName: '',
    adminContact: '',
  });

  const isLocked = isStateLocked(license);
  isLockedRef.current = isLocked;
  if (license?.machineId) machineIdRef.current = license.machineId;

  const billing: LicenseBilling | null =
    isLocked && (license?.status === 'locked' || license?.status === 'expired')
      ? (license?.billing || null)
      : null;

  const packages: LicensePackage[] = useMemo(
    () => (Array.isArray(billing?.packages) ? billing.packages : []),
    [billing?.packages]
  );

  const defaultPkg = useMemo(() => {
    if (packages.length === 0) return null;
    const pkg30 = packages.find(
      (p) => Number(p.days) === 30 || /30\s*hari/i.test(p.label || p.name || '') || /30d/i.test(p.id)
    );
    if (pkg30) return pkg30;
    if (billing?.package?.id) {
      const fromBilling = packages.find((p) => p.id === billing.package?.id);
      if (fromBilling) return fromBilling;
    }
    const byAmount = packages.find(
      (p) => Number(p.final_amount ?? p.amount) === Number(billing?.amount)
    );
    return byAmount || packages[0];
  }, [packages, billing?.package?.id, billing?.amount]);

  // Pilih paket default 30 Hari saat billing pertama kali tersedia, pertahankan pilihan user saat polling
  useEffect(() => {
    if (!defaultPkg) {
      setSelectedPkgId(null);
      return;
    }
    setSelectedPkgId((prev) => {
      if (prev && packages.some((p) => p.id === prev)) return prev;
      return defaultPkg.id;
    });
  }, [packages, defaultPkg]);

  const selectedPkg = useMemo(
    () => packages.find((p) => p.id === selectedPkgId) || defaultPkg || null,
    [packages, selectedPkgId, defaultPkg]
  );

  const activeAmount = selectedPkg
    ? Number(selectedPkg.final_amount ?? selectedPkg.amount)
    : Number(billing?.amount || 0);

  const activeAmountText =
    selectedPkg?.amount_text || billing?.amount_text || formatRupiah(activeAmount);

  const activeDurationLabel =
    selectedPkg?.label || billing?.package?.label || '';

  const uniqueCode = Number(selectedPkg?.unique_code ?? billing?.unique_code ?? 0);

  useEffect(() => {
    if (!isLocked) return;
    unlockBillingSnapRef.current = {
      hadBilling: Boolean(billing),
      prevExpiresAt: license?.expiresAt || null,
      packages,
      packageLabel: activeDurationLabel || (license?.daysLeft ? `${license.daysLeft} Hari` : ''),
      amountNumber: billing ? Math.round(activeAmount || 0) : 0,
      amountText: billing ? activeAmountText : '',
      uniqueCode: billing ? uniqueCode : 0,
      merchantName: billing?.merchant_name || 'VOCML Payment',
      adminContact: billing?.contact || '',
    };
  }, [isLocked, billing, packages, license?.expiresAt, activeDurationLabel, activeAmount, activeAmountText, uniqueCode, license?.daysLeft]);

  const qrisImageSrc = useMemo(() => {
    if (!billing || !activeAmount) return '';
    const params = new URLSearchParams({
      amount: String(Math.round(activeAmount)),
      size: '512',
    });
    if (selectedPkg?.id) params.set('package_id', selectedPkg.id);
    return `/api/license/billing/qris.png?${params.toString()}`;
  }, [billing, activeAmount, selectedPkg?.id]);

  // Reset QR state bila paket/nominal atau data tagihan berubah
  useEffect(() => {
    setQrFailed(false);
    setQrLoaded(false);
  }, [qrisImageSrc, billing?.qris]);

  const applyState = useCallback((data: LicenseState | null) => {
    if (!data) return;
    const serialized = JSON.stringify(data);
    const changed = serialized !== lastStateJsonRef.current;
    const newLocked = isStateLocked(data);
    const wasLocked = prevLockedRef.current;

    if (changed) {
      lastStateJsonRef.current = serialized;
      setLicense(data);
      window.dispatchEvent(new CustomEvent('voc:license-changed', { detail: data }));
    }

    if (newLocked) {
      setUnlockSuccess(null);
    }

    if (wasLocked === true && !newLocked) {
      setCheckMsg(null);
      setActivateMsg(null);
      const snap = unlockBillingSnapRef.current;
      const localMethod = pendingUnlockMethodRef.current;
      pendingUnlockMethodRef.current = 'qris';
      const resolvedMachineId = data.machineId || machineIdRef.current || '-';
      const srvReceipt = data.unlockReceipt;

      if (srvReceipt) {
        setUnlockSuccess({
          invoiceNumber: srvReceipt.invoiceNumber || buildInvoiceNumber(resolvedMachineId),
          method: localMethod === 'manual' ? 'manual' : (srvReceipt.method || 'qris'),
          paidAt: srvReceipt.paidAt || formatDateTimeNow(),
          packageLabel: srvReceipt.packageLabel,
          amountNumber: localMethod === 'manual' ? 0 : (srvReceipt.amountNumber || 0),
          amountText: localMethod === 'manual' ? '' : (srvReceipt.amountText || ''),
          uniqueCode: localMethod === 'manual' ? 0 : (srvReceipt.uniqueCode || 0),
          merchantName: srvReceipt.merchantName || snap.merchantName || 'VOCML Payment',
          adminContact: srvReceipt.adminContact || snap.adminContact || '',
          machineId: resolvedMachineId,
          expiresAt: data.expiresAt || null,
          daysLeft: data.daysLeft ?? null,
          licenseKey: data.licenseKey || null,
        });
      } else {
        // Fallback jika endpoint tidak menyertakan unlockReceipt: cocokkan paket dari penambahan hari lisensi
        const todayDay = toWibDayIndex(new Date().toISOString());
        const prevExpDay = toWibDayIndex(snap.prevExpiresAt);
        const newExpDay = toWibDayIndex(data.expiresAt);
        const baseDay = (prevExpDay !== null && todayDay !== null && prevExpDay > todayDay) ? prevExpDay : todayDay;
        const addedDays = (newExpDay !== null && baseDay !== null)
          ? Math.max(0, newExpDay - baseDay)
          : Math.max(0, Number(data.daysLeft) || 0);

        let matchedPkg: LicensePackage | null = null;
        if (localMethod !== 'manual' && addedDays > 0 && snap.packages.length > 0) {
          let bestDiff = Infinity;
          for (const p of snap.packages) {
            const diff = Math.abs(Number(p.days) - addedDays);
            if (diff <= 1 && diff < bestDiff) {
              bestDiff = diff;
              matchedPkg = p;
            }
          }
        }

        const resolvedAmt = localMethod === 'manual'
          ? 0
          : matchedPkg
          ? Number(matchedPkg.final_amount ?? matchedPkg.amount)
          : 0;

        setUnlockSuccess({
          invoiceNumber: buildInvoiceNumber(resolvedMachineId),
          method: localMethod === 'manual' ? 'manual' : (matchedPkg ? 'qris' : 'admin'),
          paidAt: formatDateTimeNow(),
          packageLabel:
            matchedPkg?.label ||
            (addedDays > 0 ? `${addedDays} Hari` : data.daysLeft != null ? `${data.daysLeft} Hari` : 'Aktivasi Lisensi'),
          amountNumber: resolvedAmt,
          amountText:
            localMethod === 'manual'
              ? ''
              : matchedPkg?.amount_text || (resolvedAmt > 0 ? formatRupiah(resolvedAmt) : ''),
          uniqueCode: localMethod === 'manual' ? 0 : Number(matchedPkg?.unique_code ?? (matchedPkg ? snap.uniqueCode : 0)),
          merchantName: snap.merchantName || 'VOCML Payment',
          adminContact: snap.adminContact || '',
          machineId: resolvedMachineId,
          expiresAt: data.expiresAt || null,
          daysLeft: data.daysLeft ?? null,
          licenseKey: data.licenseKey || null,
        });
      }

      window.dispatchEvent(new CustomEvent('voc:license-unlocked', {
        detail: { ...data, message: 'Pembayaran berhasil! Lisensi Kasir POS telah aktif kembali' },
      }));
    }

    prevLockedRef.current = newLocked;
  }, []);

  const triggerImmediateCheck = useCallback(async () => {
    try {
      const res = await fetch('/api/license/check', {
        method: 'POST',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
        cache: 'no-store',
      });
      if (!res.ok) return null;
      const data: LicenseState = await res.json();
      applyState(data);
      return data;
    } catch {
      return null;
    }
  }, [applyState]);

  // Ambil tagihan QRIS terbaru dengan Cache-Control: no-cache setiap kali modal / layar terkunci dibuka
  useEffect(() => {
    if (!isLocked) return;
    fetch('/api/license/billing', {
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
      },
      cache: 'no-store',
    })
      .then((r) => r.json())
      .then((data) => {
        if (data?.billing) {
          setLicense((prev) => (prev ? { ...prev, billing: data.billing } : prev));
        }
      })
      .catch(() => {});
  }, [isLocked]);

  // Hitung mundur otomatis untuk membuka aplikasi setelah pembayaran sukses
  useEffect(() => {
    if (!unlockSuccess) {
      setAutoOpenCountdown(5);
      return;
    }
    setAutoOpenCountdown(5);
    const timer = setInterval(() => {
      setAutoOpenCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setUnlockSuccess(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [unlockSuccess]);

  useEffect(() => {
    // 1. Fetch initial status
    fetch('/api/license/status', { cache: 'no-store' })
      .then((r) => r.json())
      .then(applyState)
      .catch(() => {});

    // 2. Subscribe ke singleton SSE lintas tab (maksimal 1 koneksi SSE per browser)
    const unsubscribe = subscribeLicenseStream((data) => {
      applyState(data);
    });

    // 3. Cadangan polling cepat setiap 3 detik khusus saat modal QRIS / layar terkunci terbuka (fallback jika SSE terhalang)
    const pollInterval = setInterval(() => {
      if (!isLockedRef.current) return;
      fetch('/api/license/status', {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
        cache: 'no-store',
      })
        .then((r) => r.json())
        .then(applyState)
        .catch(() => {});
    }, 3000);

    // 4. Cek langsung ke server VOCML saat tab kembali aktif / fokus / online (baik saat terkunci maupun aktif)
    const handleWakeCheck = () => {
      if (document.visibilityState === 'hidden') return;
      const now = Date.now();
      if (now - lastWakeCheckRef.current < 1500) return;
      lastWakeCheckRef.current = now;
      triggerImmediateCheck();
    };
    window.addEventListener('focus', handleWakeCheck);
    window.addEventListener('online', handleWakeCheck);
    document.addEventListener('visibilitychange', handleWakeCheck);

    return () => {
      unsubscribe();
      clearInterval(pollInterval);
      window.removeEventListener('focus', handleWakeCheck);
      window.removeEventListener('online', handleWakeCheck);
      document.removeEventListener('visibilitychange', handleWakeCheck);
    };
  }, [applyState, triggerImmediateCheck]);

  const handleCopyMachineId = () => {
    const id = license?.machineId || '';
    if (!id) return;
    navigator.clipboard.writeText(id).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleCheckNow = async () => {
    setCheckingNow(true);
    setCheckMsg(null);
    const data = await triggerImmediateCheck();
    setCheckingNow(false);

    if (!data) {
      setCheckMsg({
        text: 'Gagal terhubung ke server lisensi. Periksa koneksi internet Anda.',
        isError: true,
      });
      return;
    }

    if (!data.allowed) {
      setCheckMsg({
        text: 'Pembayaran sedang diproses, silakan tunggu beberapa detik',
        isError: true,
      });
    }
  };

  const handleActivateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKey.trim()) return;

    setActivating(true);
    setActivateMsg(null);

    try {
      const res = await fetch('/api/license/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: manualKey.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.allowed) {
        pendingUnlockMethodRef.current = 'manual';
        setActivateMsg({ text: 'Aktivasi berhasil!', isError: false });
        setManualKey('');
        applyState(data);
      } else {
        setActivateMsg({
          text: data.error || 'Aktivasi gagal. Periksa kembali format license key.',
          isError: true,
        });
      }
    } catch {
      setActivateMsg({ text: 'Gagal terhubung ke server lisensi', isError: true });
    } finally {
      setActivating(false);
    }
  };

  const handleDownloadInvoice = () => {
    if (!unlockSuccess || downloadingInvoice) return;
    setDownloadingInvoice(true);
    try {
      downloadLicenseInvoicePdf({
        invoiceNumber: unlockSuccess.invoiceNumber,
        storeName: appName || 'Outlet POS Mart',
        merchantName: unlockSuccess.merchantName,
        adminContact: unlockSuccess.adminContact,
        machineId: unlockSuccess.machineId,
        method: unlockSuccess.method,
        packageLabel: unlockSuccess.packageLabel,
        amountNumber: unlockSuccess.amountNumber,
        amountText: unlockSuccess.amountText || 'LUNAS',
        uniqueCode: unlockSuccess.uniqueCode,
        paidAt: unlockSuccess.paidAt,
        expiresAtText: formatIndoDate(unlockSuccess.expiresAt),
        daysLeft: unlockSuccess.daysLeft,
        licenseKey: unlockSuccess.licenseKey,
      });
    } finally {
      window.setTimeout(() => setDownloadingInvoice(false), 600);
    }
  };

  // Jika baru saja sukses bayar/aktivasi dari kondisi terkunci, tampilkan konfirmasi detail sebelum masuk aplikasi
  if (!isLocked && unlockSuccess) {
    const isManualUnlock = unlockSuccess.method === 'manual';
    const isAdminUnlock = unlockSuccess.method === 'admin';
    const isNonQrisUnlock = isManualUnlock || isAdminUnlock;
    return (
      <div
        id="pos-license-success-screen"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999998,
          background: 'radial-gradient(ellipse at top, #0f2922 0%, #070b14 58%, #030712 100%)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 'max(18px, calc(env(safe-area-inset-top, 0px) + 12px))',
          paddingBottom: 'max(22px, calc(env(safe-area-inset-bottom, 0px) + 16px))',
          paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
          overflowY: 'auto',
          overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          touchAction: 'pan-y',
          overscrollBehaviorY: 'contain',
          fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        }}
      >
        <div
          className="voc-success-shell"
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '510px',
            flexShrink: 0,
            margin: 'auto 0',
            background: 'rgba(13, 19, 34, 0.92)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(16, 185, 129, 0.28)',
            borderRadius: '20px',
            boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65), 0 0 40px rgba(16, 185, 129, 0.12)',
            overflow: 'hidden',
            animation: 'lockFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <button
            type="button"
            onClick={() => setUnlockSuccess(null)}
            aria-label="Tutup"
            title="Tutup dan Buka Kasir"
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '50%',
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
              zIndex: 2,
            }}
          >
            <X size={15} />
          </button>

          {/* Hero Sukses Header */}
          <div
            style={{
              padding: '18px 22px 14px',
              textAlign: 'center',
              background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.14) 0%, rgba(16, 185, 129, 0) 100%)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                margin: '0 auto 8px',
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 0 6px rgba(16, 185, 129, 0.16), 0 8px 20px rgba(16, 185, 129, 0.35)',
              }}
            >
              <CheckCircle2 size={26} strokeWidth={2.4} />
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '3px 10px',
                borderRadius: '9999px',
                background: 'rgba(16, 185, 129, 0.14)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#34d399',
                fontSize: '10.5px',
                fontWeight: 800,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '6px',
              }}
            >
              <ShieldCheck size={12} />
              {isNonQrisUnlock ? 'Lisensi Diaktifkan' : 'Pembayaran Berhasil'}
            </div>

            <h2 style={{ margin: 0, fontSize: '18.5px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
              {isManualUnlock ? 'Aktivasi Lisensi Berhasil' : isAdminUnlock ? 'Lisensi Telah Diaktifkan' : 'Terima Kasih, Pembayaran Lunas!'}
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8', lineHeight: 1.4 }}>
              Lisensi aplikasi telah aktif secara real-time. Seluruh modul kasir &amp; back-office siap digunakan.
            </p>

            <div
              style={{
                marginTop: '10px',
                padding: '8px 12px',
                background: 'rgba(16, 185, 129, 0.16)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: '10px',
                color: '#6ee7b7',
                fontSize: '11.5px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <CheckCircle size={14} />
              <span>Pembayaran berhasil! Lisensi Kasir POS telah aktif kembali</span>
            </div>
          </div>

          {/* Detail Informasi Pembayaran / Aktivasi */}
          <div style={{ padding: '14px 22px 18px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '10.5px',
                fontWeight: 800,
                color: '#94a3b8',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: '8px',
              }}
            >
              <Receipt size={13} color="#34d399" />
              Detail Konfirmasi
            </div>

            <div
              style={{
                background: 'rgba(2, 6, 23, 0.55)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '14px',
                padding: '2px 14px',
                marginBottom: '14px',
              }}
            >
              {unlockSuccess.amountText && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '8px 0',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>Total Dibayar</span>
                  <span style={{ fontSize: '16.5px', fontWeight: 900, color: '#34d399', letterSpacing: '-0.01em' }}>
                    {unlockSuccess.amountText}
                  </span>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '7px 0',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                }}
              >
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Status Lisensi</span>
                <span
                  style={{
                    fontSize: '10.5px',
                    fontWeight: 800,
                    color: '#34d399',
                    background: 'rgba(16, 185, 129, 0.14)',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    borderRadius: '6px',
                    padding: '2px 8px',
                  }}
                >
                  AKTIF / LUNAS
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '7px 0',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                }}
              >
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Metode</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0', textAlign: 'right' }}>
                  {isManualUnlock ? 'License Key Manual' : isAdminUnlock ? 'Aktivasi Server VOCML' : `QRIS Otomatis · ${unlockSuccess.merchantName}`}
                </span>
              </div>

              {unlockSuccess.packageLabel && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '7px 0',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>Paket / Durasi</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc' }}>
                    {unlockSuccess.packageLabel}
                  </span>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '7px 0',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                }}
              >
                <span style={{ fontSize: '12px', color: '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <CalendarCheck2 size={13} /> Masa Aktif s/d
                </span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#f8fafc', textAlign: 'right' }}>
                  {formatIndoDate(unlockSuccess.expiresAt)}
                  {unlockSuccess.daysLeft != null ? ` (${unlockSuccess.daysLeft} hari)` : ''}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '7px 0',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                }}
              >
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Waktu Konfirmasi</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>
                  {unlockSuccess.paidAt}
                </span>
              </div>

              {unlockSuccess.licenseKey && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '7px 0',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                  }}
                >
                  <span style={{ fontSize: '12px', color: '#94a3b8' }}>License Key</span>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#cbd5e1',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      maxWidth: '240px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={unlockSuccess.licenseKey}
                  >
                    {unlockSuccess.licenseKey}
                  </span>
                </div>
              )}

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '7px 0',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                }}
              >
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>No. Invoice</span>
                <span
                  style={{
                    fontSize: '11.5px',
                    fontWeight: 700,
                    color: '#e2e8f0',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >
                  {unlockSuccess.invoiceNumber}
                </span>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '7px 0',
                }}
              >
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Machine ID</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#cbd5e1',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    wordBreak: 'break-all',
                    textAlign: 'right',
                  }}
                >
                  {unlockSuccess.machineId}
                </span>
              </div>
            </div>

            <div className="voc-success-actions">
              <button
                id="license-download-invoice-btn"
                type="button"
                onClick={handleDownloadInvoice}
                disabled={downloadingInvoice}
                style={{
                  width: '100%',
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.35)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: downloadingInvoice ? 'wait' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '7px',
                  whiteSpace: 'nowrap',
                  transition: 'background 0.15s ease',
                }}
              >
                <Download size={15} />
                <span>{downloadingInvoice ? 'Mengunduh...' : 'Download Invoice'}</span>
              </button>

              <button
                id="license-open-app-btn"
                type="button"
                onClick={() => setUnlockSuccess(null)}
                style={{
                  width: '100%',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '12px',
                  padding: '12px 16px',
                  fontSize: '13.5px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  whiteSpace: 'nowrap',
                  boxShadow: '0 10px 26px rgba(16, 185, 129, 0.35)',
                  transition: 'transform 0.15s ease',
                }}
              >
                <span>Buka Aplikasi Sekarang{autoOpenCountdown > 0 ? ` (${autoOpenCountdown}s)` : ''}</span>
                <ArrowRight size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        <style>{`
          .voc-success-actions {
            display: grid;
            grid-template-columns: 1fr 1.35fr;
            gap: 10px;
          }
          @media (max-width: 460px) {
            .voc-success-actions {
              grid-template-columns: 1fr;
            }
          }
          @keyframes lockFadeIn {
            from { opacity: 0; transform: translateY(10px) scale(0.985); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>
      </div>
    );
  }

  // Jangan render apa pun jika lisensi aktif / diizinkan
  if (!isLocked) return null;

  const isPending = license?.status === 'pending';
  const isExpired = billing?.reason === 'expired' || license?.status === 'expired';
  const statusBadgeText = isExpired
    ? 'Lisensi Berakhir'
    : isPending
    ? 'Menunggu Aktivasi'
    : license?.status === 'offline'
    ? 'Mode Offline'
    : 'Lisensi Diblokir';

  const subtitle =
    license?.lockReason ||
    license?.reason ||
    (isPending
      ? 'Aplikasi baru dipasang dan belum diaktifkan oleh admin.'
      : 'Belum melakukan pembayaran perpanjangan.');

  return (
    <div
      id="pos-license-lockscreen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999998,
        background: 'radial-gradient(ellipse at top, #131b36 0%, #070b14 60%, #030712 100%)',
        color: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 'max(20px, calc(env(safe-area-inset-top, 0px) + 14px))',
        paddingBottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 18px))',
        paddingLeft: 'max(14px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(14px, env(safe-area-inset-right, 0px))',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        overscrollBehaviorY: 'contain',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        className="voc-lock-shell"
        style={{
          width: '100%',
          maxWidth: billing ? '940px' : '540px',
          flexShrink: 0,
          margin: 'auto 0',
          background: 'rgba(13, 19, 34, 0.88)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '20px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.65)',
          overflow: 'hidden',
          animation: 'lockFadeIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* HEADER */}
        <header className="voc-lock-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                background: isPending ? 'rgba(245, 158, 11, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                border: `1px solid ${isPending ? 'rgba(245, 158, 11, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                color: isPending ? '#fbbf24' : '#f87171',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {isPending ? <AlertTriangle size={22} /> : <Lock size={22} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.01em' }}>
                  {isPending ? 'Menunggu Aktivasi' : 'Aplikasi Terkunci'}
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 9px',
                    borderRadius: '6px',
                    background: isPending ? 'rgba(245, 158, 11, 0.16)' : 'rgba(239, 68, 68, 0.16)',
                    color: isPending ? '#fbbf24' : '#fca5a5',
                    border: `1px solid ${isPending ? 'rgba(245, 158, 11, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                  }}
                >
                  {statusBadgeText}
                </span>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '12.5px', color: '#94a3b8', lineHeight: 1.4 }}>
                {subtitle}
              </p>
            </div>
          </div>

          <div className="voc-mid-wrap">
            <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              MACHINE ID
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'rgba(2, 6, 23, 0.65)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '6px 10px',
              }}
            >
              <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', color: '#e2e8f0', fontWeight: 700, letterSpacing: '0.02em' }}>
                {license?.machineId || 'MEMUAT...'}
              </span>
              <button
                type="button"
                onClick={handleCopyMachineId}
                title="Salin Machine ID"
                style={{
                  background: copied ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'background 0.2s',
                }}
              >
                {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
                {copied ? 'Tersalin' : 'Salin'}
              </button>
            </div>
          </div>
        </header>

        {/* BODY */}
        <div className={billing ? 'voc-lock-body voc-two-col' : 'voc-lock-body voc-one-col'}>
          {/* PANEL KIRI: QRIS PEMBAYARAN OTOMATIS */}
          {billing && (
            <section id="billing-panel" aria-label="Tagihan QRIS" className="voc-left-col">
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.12)',
                  color: '#34d399',
                  padding: '5px 12px',
                  borderRadius: '8px',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  marginBottom: '16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: '1px solid rgba(16, 185, 129, 0.28)',
                }}
              >
                <QrCode size={14} /> QRIS Pembayaran Otomatis
              </div>

              {!qrFailed ? (
                <div
                  className="voc-qr-box"
                  style={{
                    background: '#ffffff',
                    padding: '12px',
                    borderRadius: '14px',
                    width: '224px',
                    height: '224px',
                    boxSizing: 'border-box',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto',
                    position: 'relative',
                    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45)',
                  }}
                >
                  {!qrLoaded && (
                    <RefreshCw
                      size={26}
                      color="#94a3b8"
                      style={{ position: 'absolute', animation: 'spin 1.1s linear infinite' }}
                    />
                  )}
                  <img
                    id="billing-qris-image"
                    className="voc-qr-img"
                    key={qrisImageSrc}
                    src={qrisImageSrc}
                    alt={`QRIS ${billing.merchant_name} ${activeAmountText}`}
                    width={200}
                    height={200}
                    onLoad={() => setQrLoaded(true)}
                    onError={() => setQrFailed(true)}
                    style={{
                      width: '200px',
                      height: '200px',
                      display: 'block',
                      objectFit: 'contain',
                      imageRendering: 'pixelated',
                      opacity: qrLoaded ? 1 : 0,
                      transition: 'opacity 0.2s',
                    }}
                  />
                </div>
              ) : (
                <div
                  id="billing-qris-offline"
                  style={{
                    width: '224px',
                    minHeight: '180px',
                    margin: '0 auto',
                    padding: '20px 14px',
                    borderRadius: '14px',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    color: '#fca5a5',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                  }}
                >
                  <WifiOff size={28} />
                  <div style={{ fontSize: '12.5px', fontWeight: 600 }}>Hubungkan internet untuk menampilkan QRIS</div>
                  <button
                    id="billing-qris-retry"
                    type="button"
                    onClick={() => {
                      setQrFailed(false);
                      setQrLoaded(false);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      color: '#fff',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      padding: '6px 12px',
                      fontSize: '11.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Coba lagi
                  </button>
                </div>
              )}

              <div style={{ color: '#94a3b8', fontSize: '10.5px', fontWeight: 700, marginTop: '16px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                TOTAL TAGIHAN{activeDurationLabel ? ` · ${activeDurationLabel.toUpperCase()}` : ''}
              </div>
              <div
                id="billing-amount"
                style={{ color: '#ffffff', fontSize: '30px', fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1.2, marginTop: '2px' }}
              >
                {activeAmountText}
              </div>
              <div style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '4px', fontWeight: 600 }}>
                QRIS · {billing.merchant_name}
              </div>

              {billing.note && (
                <div style={{ color: '#94a3b8', fontSize: '11.5px', marginTop: '10px', lineHeight: 1.45, maxWidth: '280px' }}>
                  {billing.note}
                </div>
              )}

              {billing.contact && billing.contact.trim() !== '' && (
                <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', width: '100%' }}>
                  <a
                    id="billing-whatsapp"
                    href={`https://wa.me/${toWaNumber(billing.contact)}?text=${encodeURIComponent(
                      `Halo admin, saya ingin konfirmasi pembayaran perpanjangan lisensi POS_Mart.\nMachine ID: ${license?.machineId || '-'}${activeDurationLabel ? `\nPaket: ${activeDurationLabel}` : ''}\nTotal Tagihan: ${activeAmountText}`
                    )}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      width: '100%',
                      maxWidth: '250px',
                      padding: '10px 16px',
                      background: 'linear-gradient(135deg, #16a34a, #22c55e)',
                      borderRadius: '10px',
                      color: '#ffffff',
                      textDecoration: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      boxShadow: '0 6px 18px rgba(34, 197, 94, 0.28)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                    }}
                  >
                    <MessageCircle size={15} /> Hubungi Admin / Kirim Bukti
                  </a>
                  <div style={{ color: '#64748b', fontSize: '11.5px' }}>
                    Nomor Admin: <strong style={{ color: '#cbd5e1' }}>{billing.contact}</strong>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* PANEL KANAN: PILIH PAKET, CEK BAYAR REALTIME & AKTIVASI MANUAL */}
          <section className="voc-right-col">
            {billing && packages.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11.5px', fontWeight: 700, color: '#cbd5e1', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    <Tag size={13} color="#818cf8" /> Pilih Paket Perpanjangan
                  </div>
                  {uniqueCode > 0 && (
                    <div style={{ fontSize: '11.5px', color: '#94a3b8' }}>
                      Kode Unik Otomatis: <strong style={{ color: '#38bdf8' }}>+{uniqueCode}</strong>
                    </div>
                  )}
                </div>

                <div className="voc-pkg-grid">
                  {packages.map((pkg) => {
                    const isSelected = selectedPkg?.id === pkg.id;
                    const badge = pkg.promo_badge || pkg.promoBadge || '';
                    const originalPrice = Number(pkg.original_price ?? pkg.basePrice ?? 0);
                    const promoPrice = Number(pkg.promo_price ?? pkg.promoPrice ?? 0);
                    const showStrike = Boolean(pkg.is_promo && originalPrice > 0 && promoPrice > 0 && originalPrice > promoPrice);

                    return (
                      <button
                        key={pkg.id}
                        type="button"
                        onClick={() => {
                          setSelectedPkgId(pkg.id);
                          setCheckMsg(null);
                        }}
                        className={`voc-pkg-card ${isSelected ? 'is-selected' : ''}`}
                      >
                        {badge && (
                          <span className="voc-pkg-badge" style={getBadgeStyle(badge)}>
                            {badge}
                          </span>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: '6px' }}>
                          <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#f8fafc' }}>
                            {pkg.label}
                          </span>
                          <span
                            style={{
                              width: '15px',
                              height: '15px',
                              borderRadius: '50%',
                              border: `1.5px solid ${isSelected ? '#6366f1' : 'rgba(148, 163, 184, 0.4)'}`,
                              background: isSelected ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                          >
                            {isSelected && (
                              <span
                                style={{
                                  width: '7px',
                                  height: '7px',
                                  borderRadius: '50%',
                                  background: '#818cf8',
                                }}
                              />
                            )}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                          <span style={{ fontSize: '16px', fontWeight: 800, color: isSelected ? '#a5b4fc' : '#ffffff', letterSpacing: '-0.02em' }}>
                            {pkg.amount_text}
                          </span>
                          {showStrike && (
                            <span style={{ fontSize: '11px', color: '#64748b', textDecoration: 'line-through' }}>
                              {formatRupiah(originalPrice)}
                            </span>
                          )}
                        </div>

                        <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                          +{pkg.days} Hari masa aktif
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Info Auto Unlock */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.75)',
                border: '1px solid rgba(56, 189, 248, 0.18)',
                borderRadius: '10px',
                padding: '10px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                fontSize: '12px',
                color: '#cbd5e1',
                lineHeight: 1.45,
                marginBottom: '12px',
              }}
            >
              <RefreshCw size={14} color="#38bdf8" style={{ flexShrink: 0, animation: 'spin 4s linear infinite' }} />
              <span>
                {billing
                  ? <>Setelah scan / transfer, sistem membuka kunci <strong style={{ color: '#fff' }}>otomatis dalam ±10 detik</strong> tanpa perlu memasukkan kode atau reload halaman.</>
                  : <>Status lisensi dipantau otomatis secara real-time dan akan membuka kunci segera setelah diaktifkan.</>}
              </span>
            </div>

            {/* Tombol Cek Sekarang */}
            <button
              id="billing-check-now"
              type="button"
              onClick={handleCheckNow}
              disabled={checkingNow}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: checkingNow
                  ? 'linear-gradient(135deg, #047857, #065f46)'
                  : 'linear-gradient(135deg, #10b981, #059669)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: checkingNow ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 8px 24px rgba(16, 185, 129, 0.28)',
                marginBottom: checkMsg ? '10px' : '12px',
                transition: 'transform 0.15s, opacity 0.15s',
              }}
            >
              {checkingNow ? (
                <>
                  <RefreshCw size={16} style={{ animation: 'spin 0.9s linear infinite' }} />
                  Mengecek Status Pembayaran...
                </>
              ) : (
                <>
                  <CheckCircle2 size={16} />
                  {billing ? 'Saya Sudah Bayar (Buka Sekarang)' : 'Cek Status Lisensi Sekarang'}
                </>
              )}
            </button>

            {checkMsg && (
              <div
                style={{
                  marginBottom: '12px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  background: checkMsg.isError ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                  border: `1px solid ${checkMsg.isError ? 'rgba(239, 68, 68, 0.3)' : 'rgba(16, 185, 129, 0.3)'}`,
                  color: checkMsg.isError ? '#fca5a5' : '#6ee7b7',
                  fontSize: '12px',
                  lineHeight: 1.45,
                }}
              >
                {checkMsg.text}
              </div>
            )}

            {/* Form Aktivasi License Key Manual */}
            <form onSubmit={handleActivateManual} style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <KeyRound
                    size={14}
                    color="#64748b"
                    style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                  />
                  <input
                    type="text"
                    placeholder="Punya License Key? Masukkan di sini (VOCML-...)"
                    value={manualKey}
                    onChange={(e) => setManualKey(e.target.value)}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      background: 'rgba(2, 6, 23, 0.55)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '10px',
                      padding: '10px 12px 10px 34px',
                      color: '#fff',
                      fontSize: '12.5px',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                      outline: 'none',
                    }}
                  />
                </div>
                <button
                  type="submit"
                  disabled={activating || !manualKey.trim()}
                  style={{
                    background: activating || !manualKey.trim() ? 'rgba(51, 65, 85, 0.7)' : 'rgba(79, 70, 229, 0.9)',
                    color: '#fff',
                    border: '1px solid rgba(129, 140, 248, 0.35)',
                    borderRadius: '10px',
                    padding: '10px 16px',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: activating || !manualKey.trim() ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0,
                  }}
                >
                  {activating ? 'Memproses...' : 'Aktivasi'}
                  {!activating && <ArrowRight size={14} />}
                </button>
              </div>

              {activateMsg && (
                <div
                  style={{
                    marginTop: '8px',
                    fontSize: '12px',
                    color: activateMsg.isError ? '#f87171' : '#4ade80',
                    fontWeight: 600,
                  }}
                >
                  {activateMsg.text}
                </div>
              )}
            </form>

            {/* Metode Pembayaran & Status Koneksi */}
            <div
              style={{
                marginTop: 'auto',
                paddingTop: '14px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {billing && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Metode Pembayaran
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                    {PAYMENT_METHODS.map((pm) => (
                      <span
                        key={pm.name}
                        style={{
                          background: '#ffffff',
                          color: pm.color,
                          fontSize: '9.5px',
                          fontWeight: 800,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          lineHeight: 1.3,
                          letterSpacing: '-0.01em',
                        }}
                      >
                        {pm.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', fontSize: '11.5px', color: '#64748b' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: license?.offline ? '#ef4444' : '#10b981',
                      boxShadow: `0 0 8px ${license?.offline ? '#ef4444' : '#10b981'}`,
                    }}
                  />
                  <span>{license?.offline ? 'Offline Mode' : 'Terhubung ke VOCML'}</span>
                </div>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                  <RefreshCw size={11} style={{ animation: 'spin 2.5s linear infinite' }} />
                  <span>Pembaruan real-time aktif</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div style={{ marginTop: '14px', fontSize: '11.5px', color: '#475569', textAlign: 'center' }}>
        VOC POS Management System · Lisensi Komersial
      </div>

      <style>{`
        .voc-lock-header {
          padding: 18px 24px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .voc-mid-wrap {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .voc-lock-body.voc-two-col {
          display: flex;
          flex-direction: row;
          align-items: stretch;
        }
        .voc-lock-body.voc-one-col {
          display: flex;
          flex-direction: column;
        }
        .voc-left-col {
          flex: 0 0 330px;
          padding: 24px;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
        }
        .voc-right-col {
          flex: 1;
          min-width: 0;
          padding: 24px;
          display: flex;
          flex-direction: column;
        }
        .voc-pkg-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .voc-pkg-card {
          position: relative;
          text-align: left;
          background: rgba(15, 23, 42, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.09);
          border-radius: 12px;
          padding: 14px 12px 12px;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, box-shadow 0.15s, transform 0.15s;
          display: flex;
          flex-direction: column;
          color: inherit;
        }
        .voc-pkg-card:hover {
          border-color: rgba(129, 140, 248, 0.45);
          background: rgba(30, 41, 59, 0.75);
        }
        .voc-pkg-card.is-selected {
          border: 1.5px solid #6366f1;
          background: rgba(79, 70, 229, 0.14);
          box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.35), 0 8px 20px rgba(79, 70, 229, 0.18);
        }
        .voc-pkg-badge {
          position: absolute;
          top: -8px;
          right: 10px;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 0.04em;
          padding: 2px 7px;
          border-radius: 5px;
          text-transform: uppercase;
          box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
          white-space: nowrap;
        }
        @media (max-width: 820px) {
          .voc-lock-body.voc-two-col {
            flex-direction: column;
          }
          .voc-right-col {
            order: 1;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            padding: 18px 16px;
          }
          .voc-left-col {
            order: 2;
            flex: none;
            border-right: none;
            padding: 18px 16px;
          }
          .voc-pkg-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }
        }
        @media (max-width: 480px) {
          .voc-lock-header {
            padding: 14px 16px;
            gap: 10px;
          }
          .voc-right-col,
          .voc-left-col {
            padding: 15px 14px;
          }
          .voc-mid-wrap {
            width: 100%;
            justify-content: space-between;
          }
          .voc-mid-wrap > div {
            max-width: 100%;
            min-width: 0;
            flex: 1;
            justify-content: space-between;
          }
          .voc-mid-wrap > div span:first-child {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 11px !important;
          }
          .voc-qr-box {
            width: 176px !important;
            height: 176px !important;
            padding: 10px !important;
          }
          .voc-qr-img {
            width: 156px !important;
            height: 156px !important;
          }
          .voc-pkg-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 9px;
          }
          .voc-pkg-card {
            padding: 12px 10px 10px;
          }
        }
        @keyframes lockFadeIn {
          from { opacity: 0; transform: translateY(10px) scale(0.985); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LicenseLockScreen;

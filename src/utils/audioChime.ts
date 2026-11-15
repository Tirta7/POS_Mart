/**
 * Audio Chime Lonceng Pembayaran / Kasir ("Ding!")
 * Memutar efek suara perayaan seketika saat pembayaran QRIS berhasil / lisensi terbuka (< 2 detik).
 * Menggunakan Web Audio API sintetis (0 ms latency, tanpa perlu download MP3 eksternal).
 */

export function playCelebrationChime() {
  try {
    const audio = new Audio('/sounds/payment-success.mp3');
    const promise = audio.play();
    if (promise !== undefined) {
      promise.catch(() => {
        synthesizeCashierChime();
      });
    }
  } catch {
    synthesizeCashierChime();
  }
}

export function synthesizeCashierChime() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    // Bell chime 1: Frekuensi C6 (1046.5 Hz) - Bell strike
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1046.5, ctx.currentTime);
    gain1.gain.setValueAtTime(0.35, ctx.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start();
    osc1.stop(ctx.currentTime + 0.65);

    // Bell chime 2: Frekuensi E6 (1318.5 Hz) naik ke C7 (2093 Hz) - Bright victory shimmer
    setTimeout(() => {
      try {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(1318.5, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(2093, ctx.currentTime + 0.55);
        gain2.gain.setValueAtTime(0.45, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.85);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.85);
      } catch {}
    }, 110);
  } catch {
    // Abaikan jika browser membatasi audio sebelum interaksi
  }
}

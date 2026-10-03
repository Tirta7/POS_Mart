/**
 * Mobile table labels
 * ---------------------------------------------------------------------------
 * Di layar HP, tabel `.bo-table` ditampilkan sebagai daftar kartu (lihat
 * src/styles/responsive.css). Supaya setiap nilai punya keterangan, utilitas ini
 * menyalin teks header (<th>) ke atribut `data-label` pada setiap <td> secara
 * otomatis — termasuk tabel dengan colSpan / rowSpan (mis. Mutasi Stok).
 *
 * - `data-label`  : label kolom untuk ditampilkan via CSS `td::before`
 * - `data-full`   : sel dengan colSpan > 1 (mis. empty state) → tampil penuh
 * - `tr[data-cont]`: baris lanjutan dari rowSpan → kartu digabung dengan baris sebelumnya
 *
 * Dipasang sekali di main.tsx dan berjalan otomatis setiap DOM berubah.
 */

const TABLE_SELECTOR = 'table.bo-table';

function setAttr(el: Element, name: string, value: string | null) {
  if (value === null) {
    if (el.hasAttribute(name)) el.removeAttribute(name);
  } else if (el.getAttribute(name) !== value) {
    el.setAttribute(name, value);
  }
}

function labelTable(table: HTMLTableElement) {
  const headRow = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!headRow) return;

  const labels: string[] = [];
  for (const th of Array.from(headRow.cells)) {
    const text = (th.textContent || '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < (th.colSpan || 1); i++) labels.push(text);
  }

  for (const body of Array.from(table.tBodies)) {
    // Sisa rowSpan per kolom dari baris-baris sebelumnya
    let pending: number[] = [];
    for (const row of Array.from(body.rows)) {
      const next = pending.map(v => Math.max(0, v - 1));
      const isContinuation = (pending[0] || 0) > 0;
      let col = 0;

      for (const cell of Array.from(row.cells)) {
        while ((pending[col] || 0) > 0) col++;
        const span = cell.colSpan || 1;
        setAttr(cell, 'data-label', labels[col] ?? '');
        setAttr(cell, 'data-full', span > 1 ? '' : null);
        const rs = Math.max(1, cell.rowSpan || 1);
        for (let k = 0; k < span; k++) next[col + k] = rs - 1;
        col += span;
      }

      setAttr(row, 'data-cont', isContinuation ? '' : null);
      pending = next;
    }
  }
}

function labelAll() {
  document.querySelectorAll<HTMLTableElement>(TABLE_SELECTOR).forEach(labelTable);
}

let scheduled = false;
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    labelAll();
  });
}

export function installMobileTableLabels() {
  if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') return;
  const start = () => {
    labelAll();
    // Hanya memantau perubahan struktur (bukan atribut) agar tidak loop
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  if (document.body) start();
  else window.addEventListener('DOMContentLoaded', start, { once: true });
}

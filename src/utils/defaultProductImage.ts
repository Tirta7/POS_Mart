/**
 * Default placeholder image for products without image.
 * Pure SVG Data URI — loads instantaneously offline with zero network overhead,
 * perfectly neutral for any shop (pro shop, electronics, retail, cafe, etc.).
 */

const SVG_CONTENT = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f8fafc"/><stop offset="100%" stop-color="#e2e8f0"/></linearGradient><filter id="shadow" x="-10%" y="-10%" width="120%" height="125%" filterUnits="userSpaceOnUse"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0f172a" flood-opacity="0.06"/></filter></defs><rect width="300" height="200" fill="url(#bg)"/><circle cx="150" cy="95" r="48" fill="#ffffff" filter="url(#shadow)"/><g transform="translate(126, 71)" stroke="#64748b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"><path d="M24 4L5 14.5V35.5L24 46L43 35.5V14.5L24 4Z" fill="#f1f5f9"/><path d="M5 14.5L24 25L43 14.5"/><path d="M24 46V25"/><path d="M14.5 9.25L33.5 19.75" stroke="#94a3b8" stroke-width="2" stroke-dasharray="2 3"/></g><text x="150" y="165" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="11" font-weight="600" fill="#94a3b8" letter-spacing="1.5" text-anchor="middle">PRODUK</text></svg>`;

export const DEFAULT_PRODUCT_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(SVG_CONTENT)}`;

/**
 * Validates and resolves product image.
 * Replaces obsolete fruit unsplash demo URLs and broken placeholder links
 * with the clean neutral product placeholder.
 */
export function getProductImage(url?: string | null): string {
  if (!url) return DEFAULT_PRODUCT_IMAGE;
  const trimmed = url.trim();
  if (
    !trimmed ||
    trimmed.includes('photo-1542838132-92c53300491e') || // Old fruit/vegetable Unsplash URL
    trimmed.includes('via.placeholder.com') ||
    trimmed.includes('placeholder.com')
  ) {
    return DEFAULT_PRODUCT_IMAGE;
  }
  return trimmed;
}

/**
 * Reusable onError event handler for <img> elements.
 * If the provided image fails to load, gracefully fall back to DEFAULT_PRODUCT_IMAGE.
 */
export function handleProductImageError(e: React.SyntheticEvent<HTMLImageElement, Event>) {
  const target = e.currentTarget;
  if (target.src !== DEFAULT_PRODUCT_IMAGE) {
    target.src = DEFAULT_PRODUCT_IMAGE;
  }
}

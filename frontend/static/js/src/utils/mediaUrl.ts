/** MK1 Wave C (T1-5): request a server-derived downscaled variant of an
 *  uploaded image. The server keeps `thumb` (≤320px) and `display`
 *  (≤1600px) siblings for static-image uploads and FALLS BACK to the
 *  original when no variant exists (PDFs, animated images, small
 *  originals, pre-variant uploads) — so this is always safe to request.
 *  Non-upload URLs (Google Places photos, data: URLs, external) pass
 *  through untouched. */
export function sizedUploadUrl(url: string | null | undefined, size: 'thumb' | 'display'): string {
    if (!url || !url.startsWith('/static/uploads/')) return url || '';
    return `${url}${url.includes('?') ? '&' : '?'}size=${size}`;
}

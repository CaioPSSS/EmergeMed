/**
 * UTF-8 Normalization, Mojibake repair, and text sanitization functions
 * for EmergeMed (UPA) medical content.
 */

/**
 * Fixes Mojibake artifacts caused by character encoding mismatches (e.g., Latin-1 vs UTF-8).
 */
export function fixMojibake(text: string): string {
  if (!text) return text;
  // Only attempt conversion if text contains true Mojibake patterns:
  // 'Ã' or 'Â' followed by Latin-1 supplement characters (\u0080-\u00BF)
  if (/[ÃÂ][\u0080-\u00BF]/.test(text)) {
    try {
      const converted = Buffer.from(text, 'latin1').toString('utf8');
      if (!converted.includes('\uFFFD')) {
        return converted;
      }
    } catch {}
  }
  return text;
}

/**
 * Normalizes text to Unicode NFC (Normalization Form C) to combine accent marks into single characters.
 */
export function normalizeNFC(text: string): string {
  if (!text) return text;
  return text.normalize('NFC');
}

/**
 * Sanitizes chapter and section titles by normalizing UTF-8 (NFC), fixing Mojibake,
 * replacing modifier colons/special characters, and correcting typos.
 */
export function sanitizeTitle(title: string): string {
  if (!title) return title;

  // 1. Fix Mojibake if present
  let sanitized = fixMojibake(title);

  // 2. Normalize to NFC (combines NFD characters like e + \u0301 into é)
  sanitized = sanitized.normalize('NFC');

  // 3. Replace modifier colon (꞉ \uA789), fullwidth colon (\uFF1A), or irregular colon characters
  sanitized = sanitized.replace(/[\uA789\uFF1A]/g, ':');

  // 4. Fix common typos in medical chapter titles
  sanitized = sanitized
    .replace(/\bpacient\b/gi, 'paciente')
    .replace(/\bdoençass\b/gi, 'doenças')
    .replace(/\bemergenc\b/gi, 'emergência');

  return sanitized;
}

export const sanitizeChapterTitle = sanitizeTitle;

/**
 * Normalizes general medical text (vignettes, explanations, prescriptions) with NFC & Mojibake fixes.
 */
export function normalizeText(text: string): string {
  if (!text) return text;
  let normalized = fixMojibake(text);
  normalized = normalized.normalize('NFC');
  normalized = normalized.replace(/[\uA789\uFF1A]/g, ':');
  return normalized;
}

export const sanitizeUtf8Text = normalizeText;

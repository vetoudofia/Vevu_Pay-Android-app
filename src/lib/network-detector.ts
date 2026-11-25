// src/lib/network-detector.ts

// Complete mapping from phone prefix to network slug (lowercase)
const NETWORK_MAP: Record<string, string> = {
  '0803': 'mtn', '0806': 'mtn', '0810': 'mtn', '0813': 'mtn',
  '0814': 'mtn', '0816': 'mtn', '0903': 'mtn', '0906': 'mtn',
  '0913': 'mtn', '0916': 'mtn',
  '0802': 'airtel', '0808': 'airtel', '0812': 'airtel',
  '0902': 'airtel', '0907': 'airtel', '0912': 'airtel',
  '0805': 'glo', '0807': 'glo', '0811': 'glo', '0815': 'glo',
  '0905': 'glo', '0915': 'glo',
  '0809': '9mobile', '0817': '9mobile', '0818': '9mobile',
  '0909': '9mobile', '0917': '9mobile', '0918': '9mobile',
};

const NETWORK_NAME_MAP: Record<string, string> = {
  mtn: 'MTN',
  airtel: 'Airtel',
  glo: 'Glo',
  '9mobile': '9mobile',
};

/**
 * Detect network slug from phone number.
 * Returns the slug (e.g., 'mtn') or null if not detected.
 */
export function detectNetworkSlug(phoneNumber: string): string | null {
  const clean = phoneNumber.replace(/\D/g, '');
  if (clean.length === 0) return null;

  let numberToCheck = clean;
  if (clean.length === 13 && clean.startsWith('234')) {
    numberToCheck = '0' + clean.slice(3);
  } else if (clean.length === 11 && clean.startsWith('0')) {
    numberToCheck = clean;
  } else if (clean.length === 10) {
    numberToCheck = '0' + clean;
  } else {
    return null;
  }

  // Try 4‑digit prefix first, then 3‑digit if needed
  let prefix = numberToCheck.slice(0, 4);
  if (NETWORK_MAP[prefix]) return NETWORK_MAP[prefix];

  prefix = numberToCheck.slice(0, 3);
  return NETWORK_MAP[prefix] || null;
}

/**
 * Get human‑readable network name from slug.
 */
export function detectNetworkName(phoneNumber: string): string | null {
  const slug = detectNetworkSlug(phoneNumber);
  return slug ? NETWORK_NAME_MAP[slug] || slug : null;
}

import { describe, expect, it } from 'vitest';

// Mock of your normalizePhone function
const normalizePhone = (phone: string): string => {
  const clean = phone.replace(/\D/g, '');

  if (clean.length === 10) return '0' + clean;
  if (clean.length === 13 && clean.startsWith('234')) {
    return '0' + clean.slice(3);
  }
  if (clean.length === 14 && clean.startsWith('234')) {
    return '0' + clean.slice(3);
  }

  return clean;
};

describe('Auth Utilities - Phone Normalization', () => {
  it('should normalize a 10-digit number by adding a leading 0', () => {
    expect(normalizePhone('8012345678')).toBe('08012345678');
  });

  it('should normalize a 13-digit number with 234 country code', () => {
    expect(normalizePhone('2348012345678')).toBe('08012345678');
  });

  it('should normalize a 14-digit number with 234 country code', () => {
    expect(normalizePhone('23408012345678')).toBe('08012345678');
  });

  it('should leave an already correct 11-digit number alone', () => {
    expect(normalizePhone('08012345678')).toBe('08012345678');
  });
});

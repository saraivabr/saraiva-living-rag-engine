import { timingSafeEqual } from 'node:crypto';

export function isAuthorizedSyntheticValidation(
  headers: Record<string, string | undefined>,
  expectedSecret?: string,
): boolean {
  if (readHeader(headers, 'x-saraiva-validation-mode')?.trim().toLowerCase() !== 'synthetic') {
    return false;
  }
  return secureStringEquals(
    readHeader(headers, 'x-saraiva-validation-token'),
    expectedSecret?.trim(),
  );
}

function readHeader(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const match = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return match?.[1];
}

function secureStringEquals(received?: string, expected?: string): boolean {
  if (!received || !expected) return false;
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

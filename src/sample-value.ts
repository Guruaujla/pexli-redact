import type { PresetKey } from './patterns';

const FIRST = [
  'alex',
  'sam',
  'jordan',
  'taylor',
  'morgan',
  'casey',
  'riley',
  'jamie',
  'avery',
  'quinn',
  'drew',
  'robin',
];
const LAST = [
  'lee',
  'patel',
  'garcia',
  'nguyen',
  'smith',
  'kim',
  'silva',
  'brown',
  'martin',
  'cohen',
  'singh',
  'clark',
];
const CARD_DIGITS = '4242424242424242424';

function seeded(original: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < original.length; i++) h = Math.imul(h ^ original.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

export function sampleValue(kind: PresetKey, original: string): string {
  const next = seeded(`${kind}:${original}`);
  const pick = <T>(list: readonly T[]) => list[Math.floor(next() * list.length)]!;
  const digit = () => String(Math.floor(next() * 10));
  let digitsSeen = 0;
  const reshape = (fill: (index: number) => string) => original.replace(/\d/g, () => fill(digitsSeen++));
  switch (kind) {
    case 'email': {
      const name = `${pick(FIRST)}.${pick(LAST)}`;
      return original === original.toUpperCase() ? `${name}@EXAMPLE.COM`.toUpperCase() : `${name}@example.com`;
    }
    case 'phone': {
      const total = original.replace(/\D/g, '').length;
      return reshape((i) => (i >= total - 7 && i < total - 4 ? '555'[i - (total - 7)]! : digit()));
    }
    case 'ssn':
      return reshape((i) => (i === 0 ? '9' : digit()));
    case 'creditCard':
      return reshape((i) => CARD_DIGITS[i] ?? '4');
    case 'ipAddress':
      return `192.0.2.${1 + Math.floor(next() * 254)}`;
    case 'macAddress': {
      const sep = original.includes('-') ? '-' : ':';
      const tail = Math.floor(next() * 256)
        .toString(16)
        .padStart(2, '0');
      const out = ['00', '00', '5e', '00', '53', tail].join(sep);
      return original === original.toUpperCase() ? out.toUpperCase() : out;
    }
  }
}

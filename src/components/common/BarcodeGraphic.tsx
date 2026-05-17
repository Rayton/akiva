import { useMemo } from 'react';

const code39Patterns: Record<string, string> = {
  '0': 'nnnwwnwnn',
  '1': 'wnnwnnnnw',
  '2': 'nnwwnnnnw',
  '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw',
  '5': 'wnnwwnnnn',
  '6': 'nnwwwnnnn',
  '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn',
  '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw',
  B: 'nnwnnwnnw',
  C: 'wnwnnwnnn',
  D: 'nnnnwwnnw',
  E: 'wnnnwwnnn',
  F: 'nnwnwwnnn',
  G: 'nnnnnwwnw',
  H: 'wnnnnwwnn',
  I: 'nnwnnwwnn',
  J: 'nnnnwwwnn',
  K: 'wnnnnnnww',
  L: 'nnwnnnnww',
  M: 'wnwnnnnwn',
  N: 'nnnnwnnww',
  O: 'wnnnwnnwn',
  P: 'nnwnwnnwn',
  Q: 'nnnnnnwww',
  R: 'wnnnnnwwn',
  S: 'nnwnnnwwn',
  T: 'nnnnwnwwn',
  U: 'wwnnnnnnw',
  V: 'nwwnnnnnw',
  W: 'wwwnnnnnn',
  X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn',
  Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw',
  '.': 'wwnnnnwnn',
  ' ': 'nwwnnnwnn',
  '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn',
  '+': 'nwnnnwnwn',
  '%': 'nnnwnwnwn',
  '*': 'nwnnwnwnn',
};

function sanitizeBarcodeValue(value: string): string {
  const normalized = value
    .toUpperCase()
    .split('')
    .map((character) => (code39Patterns[character] && character !== '*' ? character : '-'))
    .join('')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 24);

  return normalized || 'A1001';
}

function code39Modules(value: string): { bars: { x: number; width: number }[]; totalWidth: number; text: string } {
  const text = sanitizeBarcodeValue(value);
  let cursor = 0;
  const bars: { x: number; width: number }[] = [];
  const characters = `*${text}*`.split('');

  characters.forEach((character, characterIndex) => {
    const pattern = code39Patterns[character] ?? code39Patterns['-'];
    pattern.split('').forEach((module, moduleIndex) => {
      const width = module === 'w' ? 3 : 1;
      if (moduleIndex % 2 === 0) {
        bars.push({ x: cursor, width });
      }
      cursor += width;
    });

    if (characterIndex < characters.length - 1) {
      cursor += 1;
    }
  });

  return { bars, totalWidth: cursor, text };
}

export function BarcodeGraphic({
  value,
  showText = false,
  className = 'h-full w-full overflow-visible',
}: {
  value: string;
  showText?: boolean;
  className?: string;
}) {
  const barcode = useMemo(() => code39Modules(value), [value]);
  const textHeight = showText ? 7 : 0;
  const height = 36 + textHeight;

  return (
    <svg
      aria-label={`Barcode ${barcode.text}`}
      className={className}
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${barcode.totalWidth} ${height}`}
    >
      <rect width={barcode.totalWidth} height={height} fill="#fff" />
      {barcode.bars.map((bar, index) => (
        <rect key={`${bar.x}-${index}`} x={bar.x} y="0" width={bar.width} height="36" fill="#111827" />
      ))}
      {showText ? (
        <text x={barcode.totalWidth / 2} y="43" fill="#111827" fontSize="6" fontFamily="monospace" textAnchor="middle">
          {barcode.text}
        </text>
      ) : null}
    </svg>
  );
}

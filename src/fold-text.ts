const NEEDS_FOLD = /[^ -~\t\n\r]/;
const IGNORED = /^[\p{Cf}\p{Default_Ignorable_Code_Point}\p{Mn}]$/u;
const SPECIAL = /[\p{Cf}\p{Default_Ignorable_Code_Point}\p{Mn}]|(?![0-9])\p{Decimal_Number}/u;
const DIGIT = /^\p{Decimal_Number}$/u;

export interface FoldedText {
  text: string;
  starts: Int32Array;
  ends: Int32Array;
}

function asciiDigit(digit: string): string {
  if (digit >= '0' && digit <= '9') return digit;
  let point = digit.codePointAt(0) ?? 0;
  let steps = 0;
  while (steps < 9 && DIGIT.test(String.fromCodePoint(point - 1))) {
    point -= 1;
    steps += 1;
  }
  return String(steps);
}

export function foldText(text: string): FoldedText | null {
  if (!NEEDS_FOLD.test(text)) return null;
  if (!SPECIAL.test(text) && text.normalize('NFKC') === text) return null;
  const pieces: string[] = [];
  let starts = new Int32Array(text.length + 16);
  let ends = new Int32Array(text.length + 16);
  let size = 0;
  let at = 0;
  const ensure = (more: number) => {
    if (size + more <= starts.length) return;
    const grown = Math.max(starts.length * 2, size + more);
    const nextStarts = new Int32Array(grown);
    const nextEnds = new Int32Array(grown);
    nextStarts.set(starts);
    nextEnds.set(ends);
    starts = nextStarts;
    ends = nextEnds;
  };
  while (at < text.length) {
    const code = text.charCodeAt(at);
    if (code < 0x80) {
      ensure(1);
      pieces.push(text[at] as string);
      starts[size] = at;
      ends[size] = at + 1;
      size += 1;
      at += 1;
      continue;
    }
    const point = text.codePointAt(at) ?? code;
    const char = String.fromCodePoint(point);
    const from = at;
    at += char.length;
    if (IGNORED.test(char)) continue;
    const normal = char.normalize('NFKC');
    const piece = DIGIT.test(normal) ? asciiDigit(normal) : normal;
    ensure(piece.length);
    for (let i = 0; i < piece.length; i++) {
      starts[size] = from;
      ends[size] = at;
      size += 1;
    }
    pieces.push(piece);
  }
  const folded = pieces.join('');
  return { text: folded, starts: starts.subarray(0, size), ends: ends.subarray(0, size) };
}

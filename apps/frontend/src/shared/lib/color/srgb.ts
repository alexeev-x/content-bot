export type Rgb = { r: number; g: number; b: number };
export type Rgba = Rgb & { a: number };

const HEX = /^#([0-9a-f]{6})$/i;

/** Parses `#rrggbb` (the only format the contract allows); null for anything else. */
export function parseHex(value: string): Rgb | null {
  const match = HEX.exec(value.trim());
  if (!match) return null;
  const n = Number.parseInt(match[1]!, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function toHex({ r, g, b }: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

/** `rgba(r, g, b, a)` string with a trimmed alpha, for tokens such as --color-accent-soft. */
export function toRgbaString({ r, g, b }: Rgb, alpha: number): string {
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Number(alpha.toFixed(3))})`;
}

/** Parses `#rrggbb` or `rgb(a)(r, g, b[, a])` as written in tokens.css. */
export function parseCssColor(value: string): Rgba | null {
  const hex = parseHex(value);
  if (hex) return { ...hex, a: 1 };
  const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(value.trim());
  if (!match) return null;
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4])
  };
}

/** Source-over compositing of a translucent colour on an opaque backdrop. */
export function composite(top: Rgba, backdrop: Rgb): Rgb {
  return {
    r: top.r * top.a + backdrop.r * (1 - top.a),
    g: top.g * top.a + backdrop.g * (1 - top.a),
    b: top.b * top.a + backdrop.b * (1 - top.a)
  };
}

const linear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.x relative luminance. */
function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** WCAG 2.x contrast ratio, 1..21. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

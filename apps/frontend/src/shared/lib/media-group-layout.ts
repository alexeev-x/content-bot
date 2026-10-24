// Faithful port of Telegram Desktop's grouped-media layout (Telegram/SourceFiles/ui/grouped_layout.cpp,
// `Ui::LayoutMediaGroup`): the same proportions, branch conditions, formulas and attempt scoring, so an album
// in the preview is cut like the one in the channel. Pure geometry, no DOM; rects tile a block maxWidth wide.

export type MediaSize = { width: number; height: number };
export type MediaRect = { x: number; y: number; width: number; height: number };

/** A single photo is shown at its own ratio, but never thinner or wider than this (Telegram crops the rest). */
export const SINGLE_MEDIA_MIN_RATIO = 0.6;
export const SINGLE_MEDIA_MAX_RATIO = 2.4;

export function clampSingleMediaRatio(width: number, height: number): number {
  return Math.min(Math.max(width / height, SINGLE_MEDIA_MIN_RATIO), SINGLE_MEDIA_MAX_RATIO);
}

const rect = (x: number, y: number, width: number, height: number): MediaRect => ({ x, y, width, height });
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

function proportion(ratio: number): 'w' | 'n' | 'q' {
  return ratio > 1.2 ? 'w' : ratio < 0.8 ? 'n' : 'q';
}

export function layoutMediaGroup(
  sizes: readonly MediaSize[],
  maxWidth: number,
  minWidth: number,
  spacing: number
): MediaRect[] {
  const count = sizes.length;
  if (count === 0) return [];
  const ratios = sizes.map((size) => (size.width > 0 && size.height > 0 ? size.width / size.height : 1));
  // tdesktop uses a square bounding box: maxHeight = maxWidth, so the max-size ratio is 1.
  const maxHeight = maxWidth;
  const average = ratios.reduce((sum, ratio) => sum + ratio, 0) / count;
  const proportions = ratios.map(proportion).join('');
  const r = (index: number) => ratios[index] ?? 1;

  if (count === 1) {
    const size = sizes[0] ?? { width: 1, height: 1 };
    return [rect(0, 0, maxWidth, Math.floor((size.height * maxWidth) / Math.max(1, size.width)))];
  }
  if (count >= 5 || ratios.some((ratio) => ratio > 2)) {
    return layoutComplex(ratios, average, maxWidth, minWidth, spacing);
  }
  if (count === 2) return layoutTwo(r, proportions, average, maxWidth, maxHeight, minWidth, spacing);
  if (count === 3) return layoutThree(r, proportions, maxWidth, maxHeight, minWidth, spacing);
  return layoutFour(r, proportions, maxWidth, maxHeight, minWidth, spacing);
}

type Ratio = (index: number) => number;

function layoutTwo(
  r: Ratio,
  proportions: string,
  average: number,
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number
): MediaRect[] {
  const maxSizeRatio = maxWidth / maxHeight;
  if (proportions === 'ww' && average > 1.4 * maxSizeRatio && r(1) - r(0) < 0.2) {
    const width = maxWidth;
    const height = Math.round(Math.min(width / r(0), width / r(1), (maxHeight - spacing) / 2));
    return [rect(0, 0, width, height), rect(0, height + spacing, width, height)];
  }
  if (proportions === 'ww' || proportions === 'qq') {
    const width = Math.floor((maxWidth - spacing) / 2);
    const height = Math.round(Math.min(width / r(0), width / r(1), maxHeight));
    return [rect(0, 0, width, height), rect(width + spacing, 0, width, height)];
  }
  const minimalWidth = Math.round(minWidth * 1.5);
  const secondWidth = Math.min(
    Math.round(Math.max(0.4 * (maxWidth - spacing), (maxWidth - spacing) / r(0) / (1 / r(0) + 1 / r(1)))),
    maxWidth - spacing - minimalWidth
  );
  const firstWidth = maxWidth - secondWidth - spacing;
  const height = Math.min(maxHeight, Math.round(Math.min(firstWidth / r(0), secondWidth / r(1))));
  return [rect(0, 0, firstWidth, height), rect(firstWidth + spacing, 0, secondWidth, height)];
}

function layoutThree(
  r: Ratio,
  proportions: string,
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number
): MediaRect[] {
  if (proportions[0] === 'n') {
    const firstHeight = maxHeight;
    const thirdHeight = Math.round(Math.min((maxHeight - spacing) / 2, (r(1) * (maxWidth - spacing)) / (r(2) + r(1))));
    const secondHeight = firstHeight - thirdHeight - spacing;
    const rightWidth = Math.max(
      minWidth,
      Math.round(Math.min((maxWidth - spacing) / 2, thirdHeight * r(2), secondHeight * r(1)))
    );
    const leftWidth = Math.min(Math.round(firstHeight * r(0)), maxWidth - spacing - rightWidth);
    return [
      rect(0, 0, leftWidth, firstHeight),
      rect(leftWidth + spacing, 0, rightWidth, secondHeight),
      rect(leftWidth + spacing, secondHeight + spacing, rightWidth, thirdHeight)
    ];
  }
  const firstWidth = maxWidth;
  const firstHeight = Math.round(Math.min(firstWidth / r(0), (maxHeight - spacing) * 0.66));
  const secondWidth = Math.floor((maxWidth - spacing) / 2);
  const secondHeight = Math.min(
    maxHeight - firstHeight - spacing,
    Math.round(Math.min(secondWidth / r(1), secondWidth / r(2)))
  );
  const thirdWidth = firstWidth - secondWidth - spacing;
  return [
    rect(0, 0, firstWidth, firstHeight),
    rect(0, firstHeight + spacing, secondWidth, secondHeight),
    rect(secondWidth + spacing, firstHeight + spacing, thirdWidth, secondHeight)
  ];
}

function layoutFour(
  r: Ratio,
  proportions: string,
  maxWidth: number,
  maxHeight: number,
  minWidth: number,
  spacing: number
): MediaRect[] {
  if (proportions[0] === 'w') {
    const w = maxWidth;
    const h0 = Math.round(Math.min(w / r(0), (maxHeight - spacing) * 0.66));
    const h = Math.round((maxWidth - 2 * spacing) / (r(1) + r(2) + r(3)));
    const w0 = Math.max(minWidth, Math.round(Math.min((maxWidth - 2 * spacing) * 0.4, h * r(1))));
    const w2 = Math.round(Math.max(Math.max(minWidth, (maxWidth - 2 * spacing) * 0.33), h * r(3)));
    const w1 = w - w0 - w2 - 2 * spacing;
    const h1 = Math.min(maxHeight - h0 - spacing, h);
    const y = h0 + spacing;
    return [
      rect(0, 0, w, h0),
      rect(0, y, w0, h1),
      rect(w0 + spacing, y, w1, h1),
      rect(w0 + w1 + 2 * spacing, y, w2, h1)
    ];
  }
  const h = maxHeight;
  const w0 = Math.round(Math.min(h * r(0), (maxWidth - spacing) * 0.6));
  const w = Math.round((maxHeight - 2 * spacing) / (1 / r(1) + 1 / r(2) + 1 / r(3)));
  const h0 = Math.round(w / r(1));
  const h1 = Math.round(w / r(2));
  const h2 = h - h0 - h1 - 2 * spacing;
  const w1 = Math.max(minWidth, Math.min(maxWidth - w0 - spacing, w));
  const x = w0 + spacing;
  return [rect(0, 0, w0, h), rect(x, 0, w1, h0), rect(x, h0 + spacing, w1, h1), rect(x, h0 + h1 + 2 * spacing, w1, h2)];
}

function layoutComplex(
  ratios: readonly number[],
  average: number,
  maxWidth: number,
  minWidth: number,
  spacing: number
): MediaRect[] {
  const count = ratios.length;
  const maxHeight = (maxWidth * 4) / 3;
  const cropped = ratios.map((ratio) => (average > 1.1 ? clamp(ratio, 1, 2.75) : clamp(ratio, 0.6667, 1)));
  const multiHeight = (offset: number, rowCount: number) => {
    let sum = 0;
    for (let i = offset; i < offset + rowCount; i += 1) sum += cropped[i] ?? 1;
    return (maxWidth - (rowCount - 1) * spacing) / sum;
  };

  // The same attempt order as tdesktop: two rows, then three, then four; the first lowest score wins.
  const attempts: number[][] = [];
  for (let first = 1; first !== count; first += 1) {
    const second = count - first;
    if (first <= 3 && second <= 3) attempts.push([first, second]);
  }
  const secondLimit = average < 0.85 ? 4 : 3;
  for (let first = 1; first !== count - 1; first += 1) {
    for (let second = 1; second !== count - first; second += 1) {
      const third = count - first - second;
      if (first <= 3 && second <= secondLimit && third <= 3) attempts.push([first, second, third]);
    }
  }
  for (let first = 1; first !== count - 1; first += 1) {
    for (let second = 1; second !== count - first; second += 1) {
      for (let third = 1; third !== count - first - second; third += 1) {
        const fourth = count - first - second - third;
        if (first <= 3 && second <= 3 && third <= 3 && fourth <= 3) attempts.push([first, second, third, fourth]);
      }
    }
  }

  let best: { rows: number[]; heights: number[] } | null = null;
  let bestDiff = 0;
  for (const rows of attempts) {
    const heights: number[] = [];
    let offset = 0;
    for (const rowCount of rows) {
      heights.push(multiHeight(offset, rowCount));
      offset += rowCount;
    }
    const totalHeight = heights.reduce((sum, height) => sum + height, 0) + spacing * (rows.length - 1);
    const bad1 = Math.min(...heights) < minWidth ? 1.5 : 1;
    let bad2 = 1;
    for (let i = 1; i < rows.length; i += 1) if ((rows[i - 1] ?? 0) > (rows[i] ?? 0)) bad2 = 1.5;
    const diff = Math.abs(totalHeight - maxHeight) * bad1 * bad2;
    if (best === null || diff < bestDiff) {
      best = { rows, heights };
      bestDiff = diff;
    }
  }
  if (best === null) return [];

  const result: MediaRect[] = [];
  let index = 0;
  let y = 0;
  best.rows.forEach((rowCount, row) => {
    const lineHeight = best.heights[row] ?? 0;
    const height = Math.round(lineHeight);
    let x = 0;
    for (let column = 0; column < rowCount; column += 1) {
      const width = column === rowCount - 1 ? maxWidth - x : Math.round((cropped[index] ?? 1) * lineHeight);
      result.push(rect(x, y, width, height));
      x += width + spacing;
      index += 1;
    }
    y += height + spacing;
  });
  return result;
}

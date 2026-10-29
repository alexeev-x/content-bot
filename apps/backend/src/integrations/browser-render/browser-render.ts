// Cloudflare Browser Rendering through the Worker's `BROWSER` binding (owner, 25.10.2026: free plan, 10 browser minutes
// a day). The screenshot quick action loads an HTML page with Valve's real icons and returns it as a PNG, so heroes,
// items and words come out exactly; no model draws them. Only the binding's one call is typed here.

import { causeDetail, readErrorDetail } from '../../platform/error-detail';

export const BROWSER_RENDER_TIMEOUT_MS = 30_000;
/** The attribute a page sets on <html> once its web fonts are loaded; the shot waits for it. */
export const FONTS_READY = 'data-fonts-ready';
const MAX_PNG_BYTES = 8_000_000;

export interface BrowserBinding {
  quickAction(
    action: 'screenshot',
    params: {
      html: string;
      viewport: { width: number; height: number; deviceScaleFactor?: number };
      screenshotOptions: { type: 'png' } | { type: 'jpeg'; quality: number };
      gotoOptions: { waitUntil: 'networkidle0'; timeout: number };
      waitForSelector?: { selector: string; timeout: number };
    }
  ): Promise<Response>;
}

/** BROWSER_RATE: the free plan allows one screenshot every 10 seconds and 10 browser minutes a day (429). */
export type BrowserRenderErrorCode = 'BROWSER_FAILED' | 'BROWSER_RATE' | 'BROWSER_TIMEOUT' | 'BROWSER_SHAPE';

export class BrowserRenderError extends Error {
  constructor(
    readonly code: BrowserRenderErrorCode,
    readonly httpStatus: number | null = null,
    /** The provider's own error text, bounded and redacted (`platform/error-detail.ts`). */
    readonly detail?: string
  ) {
    super(code);
    this.name = 'BrowserRenderError';
  }
}

export interface PictureRenderer {
  /** A PNG of the page at exactly this size; a JPEG with `jpeg` (the image model takes JPEG references). */
  render(html: string, size: { width: number; height: number }, format?: 'png' | 'jpeg'): Promise<Uint8Array>;
}

export function createBrowserPictureRenderer(binding: BrowserBinding): PictureRenderer {
  return {
    async render(html, { width, height }, format = 'png') {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new BrowserRenderError(
                'BROWSER_TIMEOUT',
                null,
                `страница не отрисовалась за ${BROWSER_RENDER_TIMEOUT_MS / 1000} с`
              )
            ),
          BROWSER_RENDER_TIMEOUT_MS
        );
      });
      let response: Response;
      try {
        response = await Promise.race([
          binding.quickAction('screenshot', {
            html,
            viewport: { width, height },
            screenshotOptions: format === 'png' ? { type: 'png' } : { type: 'jpeg', quality: 90 },
            // The page fetches Valve's icons and the font itself; the shot waits until the network is quiet.
            gotoOptions: { waitUntil: 'networkidle0', timeout: BROWSER_RENDER_TIMEOUT_MS - 5_000 },
            // A quiet network is not enough: a page with no images went quiet before its fonts came, and the shot had
            // no text at all (26.10.2026, «Чья способность?»). The page marks itself once its fonts are in.
            waitForSelector: { selector: `[${FONTS_READY}]`, timeout: 12_000 }
          }),
          timeout
        ]);
      } catch (error) {
        if (error instanceof BrowserRenderError) throw error;
        throw new BrowserRenderError('BROWSER_FAILED', null, causeDetail(error));
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        throw new BrowserRenderError(
          response.status === 429 ? 'BROWSER_RATE' : 'BROWSER_FAILED',
          response.status,
          await readErrorDetail(response)
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      // A PNG starts with its 8-byte signature, a JPEG with FF D8 FF; anything else (an error page) is not a picture.
      const signature = format === 'png' ? [0x89, 0x50, 0x4e, 0x47] : [0xff, 0xd8, 0xff];
      if (bytes.byteLength > MAX_PNG_BYTES || signature.some((value, index) => bytes[index] !== value)) {
        throw new BrowserRenderError('BROWSER_SHAPE', null, `ответ не картинка (${bytes.byteLength} байт)`);
      }
      return bytes;
    }
  };
}

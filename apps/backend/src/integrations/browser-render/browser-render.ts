// Cloudflare Browser Rendering through the Worker's `BROWSER` binding (owner, 25.10.2026: free plan, 10 browser minutes
// a day). The screenshot quick action loads an HTML page with Valve's real icons and returns it as a PNG, so heroes,
// items and words come out exactly; no model draws them. Only the binding's one call is typed here.

export const BROWSER_RENDER_TIMEOUT_MS = 30_000;
const MAX_PNG_BYTES = 8_000_000;

export interface BrowserBinding {
  quickAction(
    action: 'screenshot',
    params: {
      html: string;
      viewport: { width: number; height: number; deviceScaleFactor?: number };
      screenshotOptions: { type: 'png' };
      gotoOptions: { waitUntil: 'networkidle0'; timeout: number };
    }
  ): Promise<Response>;
}

export type BrowserRenderErrorCode = 'BROWSER_FAILED' | 'BROWSER_TIMEOUT' | 'BROWSER_SHAPE';

export class BrowserRenderError extends Error {
  constructor(
    readonly code: BrowserRenderErrorCode,
    readonly httpStatus: number | null = null
  ) {
    super(code);
    this.name = 'BrowserRenderError';
  }
}

export interface PictureRenderer {
  /** A PNG of the page at exactly this size. */
  render(html: string, size: { width: number; height: number }): Promise<Uint8Array>;
}

export function createBrowserPictureRenderer(binding: BrowserBinding): PictureRenderer {
  return {
    async render(html, { width, height }) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new BrowserRenderError('BROWSER_TIMEOUT')), BROWSER_RENDER_TIMEOUT_MS);
      });
      let response: Response;
      try {
        response = await Promise.race([
          binding.quickAction('screenshot', {
            html,
            viewport: { width, height },
            screenshotOptions: { type: 'png' },
            // The page fetches Valve's icons and the font itself; the shot waits until the network is quiet.
            gotoOptions: { waitUntil: 'networkidle0', timeout: BROWSER_RENDER_TIMEOUT_MS - 5_000 }
          }),
          timeout
        ]);
      } catch (error) {
        if (error instanceof BrowserRenderError) throw error;
        throw new BrowserRenderError('BROWSER_FAILED');
      } finally {
        clearTimeout(timer);
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new BrowserRenderError('BROWSER_FAILED', response.status);
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      // A PNG starts with its 8-byte signature; anything else (an error page) is not a picture.
      const png = [0x89, 0x50, 0x4e, 0x47];
      if (bytes.byteLength > MAX_PNG_BYTES || png.some((value, index) => bytes[index] !== value)) {
        throw new BrowserRenderError('BROWSER_SHAPE');
      }
      return bytes;
    }
  };
}

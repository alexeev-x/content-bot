/** jsdom has no layout: answers min-width and max-width media queries for a chosen viewport width. */
export function setViewport(width: number): void {
  window.matchMedia = ((query: string) => {
    const min = /\(min-width:\s*(\d+)px\)/.exec(query);
    const max = /\(max-width:\s*(\d+)px\)/.exec(query);
    const matches = min ? width >= Number(min[1]) : max ? width <= Number(max[1]) : false;
    return {
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

export function clearViewport(): void {
  delete (window as { matchMedia?: unknown }).matchMedia;
}

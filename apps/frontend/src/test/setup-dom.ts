// jsdom has no layout. ProseMirror asks for rectangles when it scrolls the caret into view and on mouse events;
// zero-size answers are enough for the behaviour tests (nothing here asserts geometry).
const emptyRect = (): DOMRect => new DOMRect(0, 0, 0, 0);
const emptyRects = (): DOMRectList => Object.assign([], { item: () => null }) as unknown as DOMRectList;

if (typeof Range !== 'undefined') {
  Range.prototype.getBoundingClientRect ??= emptyRect;
  Range.prototype.getClientRects ??= emptyRects;
}
if (typeof Element !== 'undefined') Element.prototype.getClientRects ??= emptyRects;
if (typeof document !== 'undefined') document.elementFromPoint ??= () => null;
if (typeof window !== 'undefined') window.scrollTo = () => undefined;

// A post in a list row: one bold line, then only what follows it. A post has no separate title any more — the
// title is the text's first line — so showing the title and then the text from its start said everything twice
// (owner, 17.10.2026).

const EXCERPT_LENGTH = 140;

const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

export function postHeadline(title: string, body: string): { headline: string; rest: string } {
  const text = flat(body);
  const headline = flat(title) || flat(body.split('\n').find((line) => line.trim() !== '') ?? '');
  // The text starts with the headline (case and spacing aside): the second line continues after it.
  const continues = headline !== '' && text.toLowerCase().startsWith(headline.toLowerCase());
  const rest = (continues ? text.slice(headline.length) : text).replace(/^[\s.,:;!?—–-]+/, '');
  return {
    headline,
    rest: rest.length > EXCERPT_LENGTH ? `${rest.slice(0, EXCERPT_LENGTH).trimEnd()}…` : rest
  };
}

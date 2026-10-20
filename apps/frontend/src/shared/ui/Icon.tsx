import type { SVGProps } from 'react';

// Inline stroke icons (24 px grid): no icon dependency, tree-shaken with the file.
const PATHS = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h6',
  send: 'M21 3 3 10.5l7 2.5 2.5 7zM10 13 21 3',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM16 3v4M8 3v4M3 10h18',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  image: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zM3 16l5-5 4 4 3-3 6 6M9 8.5v.01',
  alert: 'M12 3 2 20h20zM12 10v4M12 17v.01',
  settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M9 14v6',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  monitor: 'M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 21h8M12 16v5',
  check: 'M4 12.5 9.5 18 20 6.5',
  'check-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l3 3 5-6',
  'x-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 9l6 6M15 9l-6 6',
  x: 'M6 6l12 12M18 6 6 18',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  loader: 'M12 3a9 9 0 1 0 9 9M12 3v9l5 3',
  retry: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01',
  'minus-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h8',
  pause: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM10 9v6M14 9v6',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h1M12 12h1M18 12h1',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-up': 'm6 15 6-6 6 6',
  'chevron-left': 'm15 6-6 6 6 6',
  'chevron-right': 'm9 6 6 6-6 6',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  'arrow-down': 'M12 5v14M6 13l6 6 6-6',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 11v6M12 7.5v.01',
  conflict: 'M9 5v10a3 3 0 0 0 3 3h7M9 5a2 2 0 1 0 0 0.01M19 18a2 2 0 1 0 0 0.01M16 15l3 3 -3 3',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  // Centred on the 24 px grid (it sat 2 px high).
  sparkle: 'M12 5l1.8 5.2L19 12l-5.2 1.8L12 19l-1.8-5.2L5 12l5.2-1.8z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  // A broadcast channel (megaphone): kept apart from «send», which means a publication.
  channel: 'M3 10.5v3a1 1 0 0 0 1 1h2.5L12 19V5L6.5 9.5H4a1 1 0 0 0-1 1zM15.5 9a4 4 0 0 1 0 6M18.5 6a8 8 0 0 1 0 12',
  filter: 'M4 4h16l-6 7.5V18l-4 2v-8.5z',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  palette:
    'M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.2.2-2.5 1.6-2.5H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3zM7.5 12v.01M10 8v.01M14.5 8v.01',
  flask: 'M9 3h6M10 3v6l-5.5 9.5A1.5 1.5 0 0 0 5.8 21h12.4a1.5 1.5 0 0 0 1.3-2.5L14 9V3M7.5 15h9',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  copy: 'M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1zM16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3',
  download: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 9l5-5 5 5M5 20h14',
  grip: 'M9 5v.01M15 5v.01M9 12v.01M15 12v.01M9 19v.01M15 19v.01',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  // Post editor: media, formatting toolbar, crop and publication settings.
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  camera:
    'M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  play: 'M8 5v14l11-7z',
  video: 'M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM16 10l6-3v10l-6-3',
  'image-plus': 'M13 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8M3 16l5-5 4 4 3-3M9 8.5v.01M17 3v6M14 6h6',
  laptop: 'M5 5h14a1 1 0 0 1 1 1v9H4V6a1 1 0 0 1 1-1zM2 19h20',
  bold: 'M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z',
  italic: 'M10 4h8M6 20h8M15 4 9 20',
  underline: 'M7 4v7a5 5 0 0 0 10 0V4M5 20h14',
  strike: 'M4 12h16M16.5 7.5A4 4 0 0 0 12.5 5H11a3 3 0 0 0 0 6M7.5 16.5A4 4 0 0 0 11.5 19H13a3 3 0 0 0 1.5-5.6',
  code: 'm8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14',
  quote: 'M5.5 16c0 -3 1 -6 4 -8M5.5 12h4v4H5.5zM14.5 16c0 -3 1 -6 4 -8M14.5 12h4v4h-4z',
  'list-ordered':
    'M10 6h10M10 12h10M10 18h10M4.5 4.5 6 4v4M4 13.5c0-1.5 2-1.5 2 0 0 1-2 2-2 2.5h2M4 17.5h2l-1 1.2a1 1 0 1 1-1 1.3',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'm15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  smile: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 14a4 4 0 0 0 7 0M9 9.5v.01M15 9.5v.01',
  // Phone composer: attach (as Telegram's 📎) and back to the keyboard from a panel.
  paperclip: 'M20 11.5 12.2 19.3a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4L15 6.9',
  keyboard:
    'M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zM7 10h.01M11 10h.01M15 10h.01M17 10h.01M7 14h.01M17 14h.01M10 14h4',
  // Text formatting (Aa) in the phone composer bar.
  type: 'M4 7V5h11v2M9.5 5v14M7.5 19h4M14 13v-1.5h7V13M17.5 11.5V19M16 19h3',
  'rotate-left': 'M4 4v5h5M4.5 9A8 8 0 1 1 4 13',
  'rotate-right': 'M20 4v5h-5M19.5 9A8 8 0 1 0 20 13',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  minus: 'M5 12h14',
  maximize: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  'arrow-left': 'M19 12H5M11 6l-6 6 6 6',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'log-out': 'M10 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h5M15 8l4 4-4 4M19 12H9',
  pin: 'M9 4h6l-1 6 3 3v2H7v-2l3-3zM12 15v6',
  bell: 'M6 15V10a6 6 0 1 1 12 0v5l2 2H4zM10 20h4',
  message: 'M4 4h16a1 1 0 0 1 1 1v10a1 1 0 0 1 -1 1h-8l-5 4v-4H4a1 1 0 0 1 -1 -1V5a1 1 0 0 1 1 -1z',
  chart: 'M3 20h18M6 16v-5M11 16V5M16 16v-8',
  wallet: 'M4 7.5h15a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7.5zM4 7.5 15 5v2.5M16 13.25h.01',
  tag: 'M3.5 11.5V3.5h8l9 9-8 8zM8 8h.01',
  heart: 'M12 19s-7 -4.4 -7 -10a4 4 0 0 1 7 -2.6A4 4 0 0 1 19 9c0 5.6 -7 10 -7 10z',
  users:
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1M16 3.5a4 4 0 0 1 0 7M22 21v-1a6 6 0 0 0-4-5.6',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'
} as const;

export type IconName = keyof typeof PATHS;

type Props = Omit<SVGProps<SVGSVGElement>, 'name'> & { name: IconName; size?: number };

/** Decorative by default (aria-hidden): the control or text next to it carries the name. */
export function Icon({ name, size = 20, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

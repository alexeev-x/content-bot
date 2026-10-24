export const WRITER_FORMATS = ['fidit', 'igrat', 'standalone', 'telegram'] as const;
export type WriterFormat = (typeof WRITER_FORMATS)[number];
export type WriterMode = 'direct' | 'automatic';

export const FORMAT_LABEL: Record<WriterFormat, string> = {
  fidit: 'Учу фидить',
  igrat: 'Учусь играть',
  standalone: 'Рилс',
  telegram: 'Пост в Telegram'
};

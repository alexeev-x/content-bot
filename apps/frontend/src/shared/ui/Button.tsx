import type { ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import styles from './Button.module.css';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'link' | 'soft';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'xl' | 'field';

type Props = Omit<AriaButtonProps, 'children' | 'className' | 'isPending'> & {
  variant?: ButtonVariant;
  /** `md` 36 px (toolbars, form footers, dialogs); `sm` 34 px (inside rows, popovers, banners); `lg` 44 px with wider padding (primary CTA of an editor footer: «К публикации →»); `xl` 52 px (editor footer CTAs); `field` = field height (36 px, 44 px on touch/narrow screens). `md` and `sm` resolve to 44 px on touch/narrow screens. */
  size?: ButtonSize;
  /* `link`: accent text without a box; `soft`: tonal accent fill. */
  /** Keeps the label, shows a spinner and ignores presses (aria-disabled, so focus is not lost). */
  isLoading?: boolean;
  icon?: IconName;
  fullWidth?: boolean;
  className?: string;
  children?: ReactNode;
};

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  icon,
  fullWidth = false,
  className,
  children,
  ...rest
}: Props) {
  return (
    <AriaButton
      {...rest}
      isPending={isLoading}
      data-variant={variant}
      data-size={size}
      data-full={fullWidth || undefined}
      className={[styles.button, className].filter(Boolean).join(' ')}
    >
      {isLoading ? <Spinner size={18} label={false} /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </AriaButton>
  );
}

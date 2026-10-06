import type { ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import styles from './Button.module.css';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

type Props = Omit<AriaButtonProps, 'children' | 'className' | 'isPending'> & {
  variant?: ButtonVariant;
  /** `md` is 44 px; `sm` is 36 px on a precise pointer and 44 px on touch and narrow screens. */
  size?: ButtonSize;
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

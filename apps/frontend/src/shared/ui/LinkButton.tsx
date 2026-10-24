import type { ReactNode } from 'react';
import { Link, type LinkProps } from 'react-aria-components';
import styles from './Button.module.css';
import type { ButtonSize, ButtonVariant } from './Button';

type Props = Omit<LinkProps, 'children' | 'className'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
};

/** A real link (`<a>`) that looks like a Button: navigation to another page or app, not an action. */
export function LinkButton({ variant = 'secondary', size = 'md', children, ...rest }: Props) {
  return (
    <Link {...rest} data-variant={variant} data-size={size} className={styles.button}>
      {children}
    </Link>
  );
}

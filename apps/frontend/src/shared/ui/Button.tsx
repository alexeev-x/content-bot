import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import styles from './Button.module.css';

type Props = AriaButtonProps & { variant?: 'primary' | 'secondary' };

export function Button({ variant = 'primary', className, ...rest }: Props) {
  const extra = typeof className === 'string' ? className : '';
  return <AriaButton {...rest} className={`${styles.button} ${styles[variant]} ${extra}`.trim()} />;
}

import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import styles from './IconButton.module.css';
import { Icon, type IconName } from './Icon';
import { Spinner } from './Spinner';
import { Tooltip } from './Tooltip';

type Props = Omit<AriaButtonProps, 'children' | 'className' | 'isPending' | 'aria-label'> & {
  /** The accessible name and the tooltip text: an icon alone is never a label. */
  label: string;
  icon: IconName;
  variant?: 'ghost' | 'secondary' | 'danger';
  size?: 'sm' | 'md';
  isLoading?: boolean;
  showTooltip?: boolean;
  className?: string;
};

export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  isLoading = false,
  showTooltip = true,
  className,
  ...rest
}: Props) {
  const button = (
    <AriaButton
      {...rest}
      aria-label={label}
      isPending={isLoading}
      data-variant={variant}
      data-size={size}
      className={[styles.button, className].filter(Boolean).join(' ')}
    >
      {isLoading ? <Spinner size={18} label={false} /> : <Icon name={icon} size={20} />}
    </AriaButton>
  );
  return showTooltip && !rest.isDisabled ? <Tooltip content={label}>{button}</Tooltip> : button;
}

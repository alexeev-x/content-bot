import { Button as AriaButton, Label, Slider as AriaSlider, SliderThumb, SliderTrack } from 'react-aria-components';
import { Icon, type IconName } from './Icon';
import { IconButton } from './IconButton';
import styles from './Slider.module.css';

type Props = {
  /** Visible label («Масштаб») and the slider's accessible name. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  /** Keyboard step of the slider (arrows). */
  step: number;
  /** Step of the − and + buttons; defaults to `step`. */
  stepperStep?: number;
  decrementLabel: string;
  incrementLabel: string;
  /** How assistive technology reads the value, e.g. `{ style: 'percent' }` makes 1.5 read «150%». Default: the plain number. */
  valueFormat?: Intl.NumberFormatOptions;
  /** Keeps the label for assistive technology only (the phone layout puts it above, outside the control). */
  hideLabel?: boolean;
  /** Draws the control in a rounded pill container (phone crop). */
  pill?: boolean;
  /** `round` (default): bordered round buttons. `plain`: bare −/+ glyphs (reference crop pill); the hit area still grows to 44 px on touch. */
  stepperStyle?: 'round' | 'plain';
  isDisabled?: boolean;
};

type StepperProps = {
  style: 'round' | 'plain';
  label: string;
  icon: IconName;
  isDisabled: boolean;
  onPress: () => void;
};

function Stepper({ style, label, icon, isDisabled, onPress }: StepperProps) {
  if (style === 'round') {
    return (
      <IconButton
        label={label}
        icon={icon}
        size="sm"
        variant="secondary"
        showTooltip={false}
        isDisabled={isDisabled}
        onPress={onPress}
        className={styles.stepper}
      />
    );
  }
  return (
    <AriaButton aria-label={label} isDisabled={isDisabled} onPress={onPress} className={styles.plainStepper}>
      <Icon name={icon} size={16} strokeWidth={2.25} />
    </AriaButton>
  );
}

/** Slider with round − and + buttons at its ends (crop zoom). Home/End and arrows work on the thumb; the buttons clamp at the ends. */
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step,
  stepperStep,
  decrementLabel,
  incrementLabel,
  valueFormat,
  hideLabel = false,
  pill = false,
  stepperStyle = 'round',
  isDisabled
}: Props) {
  const stepBy = stepperStep ?? step;
  const clamp = (next: number) => Math.min(max, Math.max(min, next));
  return (
    <AriaSlider
      value={value}
      onChange={onChange}
      minValue={min}
      maxValue={max}
      step={step}
      formatOptions={valueFormat}
      isDisabled={isDisabled}
      data-pill={pill || undefined}
      className={styles.slider}
    >
      <Label className={hideLabel ? styles.hiddenLabel : styles.label}>{label}</Label>
      <div className={styles.control}>
        <Stepper
          style={stepperStyle}
          label={decrementLabel}
          icon="minus"
          isDisabled={Boolean(isDisabled) || value <= min}
          onPress={() => onChange(clamp(value - stepBy))}
        />
        <SliderTrack className={styles.track}>
          {({ state }) => (
            <>
              <div className={styles.rail} />
              <div className={styles.fill} style={{ width: `${state.getThumbPercent(0) * 100}%` }} />
              <SliderThumb className={styles.thumb} />
            </>
          )}
        </SliderTrack>
        <Stepper
          style={stepperStyle}
          label={incrementLabel}
          icon="plus"
          isDisabled={Boolean(isDisabled) || value >= max}
          onPress={() => onChange(clamp(value + stepBy))}
        />
      </div>
    </AriaSlider>
  );
}

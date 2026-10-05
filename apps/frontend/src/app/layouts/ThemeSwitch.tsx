import { Label, Radio, RadioGroup } from 'react-aria-components';
import { ru } from '../../shared/lib/ru';
import { useTheme, type ThemePreference } from '../theme';
import styles from './ThemeSwitch.module.css';

const options: ThemePreference[] = ['light', 'dark', 'system'];

export function ThemeSwitch() {
  const { preference, setPreference } = useTheme();
  return (
    <RadioGroup
      className={styles.group}
      orientation="horizontal"
      value={preference}
      onChange={(value) => setPreference(value as ThemePreference)}
    >
      <Label className={styles.label}>{ru.theme.label}</Label>
      <div className={styles.options}>
        {options.map((option) => (
          <Radio key={option} value={option} className={styles.radio}>
            {ru.theme[option]}
          </Radio>
        ))}
      </div>
    </RadioGroup>
  );
}

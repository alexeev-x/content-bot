import { useState } from 'react';
import {
  ColorArea,
  ColorField as AriaColorField,
  ColorSlider,
  ColorThumb,
  Input,
  Label,
  SliderTrack,
  parseColor,
  type Color
} from 'react-aria-components';
import { parseHex } from '../lib/color';
import { ru } from '../lib/ru';
import field from './Field.module.css';
import styles from './ColorPicker.module.css';

type Props = {
  /** `#rrggbb` */
  value: string;
  /** Called with a lower-case `#rrggbb` on every change, including each step of a drag. */
  onChange: (hex: string) => void;
};

const toColor = (hex: string): Color => parseColor(parseHex(hex) ? hex : '#000000').toFormat('hsb');
const toHexString = (color: Color): string => color.toString('hex').toLowerCase();

/**
 * Saturation/brightness area, hue slider and a HEX field. The HSB colour is kept in state because a hex
 * round trip loses the hue of grey and black, which would make the hue slider jump.
 */
export function ColorPicker({ value, onChange }: Props) {
  const [color, setColor] = useState<Color>(() => toColor(value));
  // A value that did not come from this picker (server answer, other tile) replaces the working colour.
  if (toHexString(color) !== value.toLowerCase() && parseHex(value)) setColor(toColor(value));

  const update = (next: Color) => {
    const hsb = next.toFormat('hsb');
    setColor(hsb);
    onChange(toHexString(hsb));
  };

  return (
    <div className={styles.picker}>
      <ColorArea
        aria-label={ru.ui.colorAreaLabel}
        colorSpace="hsb"
        xChannel="saturation"
        yChannel="brightness"
        value={color}
        onChange={update}
        className={styles.area}
      >
        <ColorThumb className={styles.thumb} />
      </ColorArea>
      <ColorSlider aria-label={ru.ui.hueLabel} colorSpace="hsb" channel="hue" value={color} onChange={update}>
        <SliderTrack className={styles.track}>
          <ColorThumb className={styles.thumb} />
        </SliderTrack>
      </ColorSlider>
      <AriaColorField
        className={field.field}
        value={toColor(value)}
        onChange={(next) => {
          if (next) update(next);
        }}
      >
        <Label className={field.label}>{ru.ui.hexLabel}</Label>
        <Input className={`${field.input} mono`} spellCheck={false} autoCapitalize="off" />
      </AriaColorField>
    </div>
  );
}

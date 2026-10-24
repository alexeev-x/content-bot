import { useState, type CSSProperties, type ImgHTMLAttributes } from 'react';
import styles from './LoadingImage.module.css';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'style' | 'alt'> & {
  src: string;
  alt: string;
  /** Known width / height from the DTO: the box keeps this ratio before and after the bytes arrive, so the layout never jumps. */
  aspectRatio?: number | undefined;
  style?: CSSProperties;
};

/** An `<img>` that shimmers at its final size until the picture has loaded (or failed: the caller's `onError` swaps it out). */
export function LoadingImage({ src, alt, aspectRatio, className, style, onLoad, onError, ...rest }: Props) {
  const [loadedSrc, setLoadedSrc] = useState<string | undefined>(undefined);
  const loading = loadedSrc !== src;
  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      className={`${styles.image} ${className ?? ''}`}
      style={aspectRatio ? { aspectRatio: String(aspectRatio), ...style } : style}
      data-loading={loading || undefined}
      onLoad={(event) => {
        setLoadedSrc(src);
        onLoad?.(event);
      }}
      onError={onError}
    />
  );
}

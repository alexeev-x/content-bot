import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import styles from './PageHeader.module.css';

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** A small badge after the title (e.g. «Превью»). */
  marker?: ReactNode;
  /** Explicitly suppresses shell tools for a focused route with its own reference header. */
  tools?: ReactNode | null;
  /** Moves focus to the page heading after mount, for route-level focus management. */
  focusHeadingOnMount?: boolean;
  /** The actions are a toolbar (tabs, filters): on a phone they take their own row under the title. */
  wideActions?: boolean;
  /** The one main action: full width (44 px) under 600 px, inline from there up. */
  primaryAction?: ReactNode;
  /** A `Menu` (⋯) the caller builds with the other actions; stays beside the title on a phone. */
  secondaryActions?: ReactNode;
};

const PageHeaderToolsContext = createContext<ReactNode>(null);

/** Icon tools (search, owner menu) that every PageHeader below renders in its title row; the shell sets them. */
export const PageHeaderTools = PageHeaderToolsContext.Provider;

export function PageHeader({
  title,
  description,
  actions,
  marker,
  tools: toolsOverride,
  focusHeadingOnMount = false,
  wideActions = false,
  primaryAction,
  secondaryActions
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const contextualTools = useContext(PageHeaderToolsContext);
  const tools = toolsOverride === undefined ? contextualTools : toolsOverride;

  useEffect(() => {
    if (!focusHeadingOnMount) return;
    const frame = window.requestAnimationFrame(() => headingRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [focusHeadingOnMount]);

  return (
    <header
      className={styles.header}
      data-wide-actions={wideActions || undefined}
      data-split={primaryAction || secondaryActions ? '' : undefined}
    >
      <div className={styles.text}>
        <div className={styles.titleRow}>
          <h1 ref={headingRef} className={styles.title} tabIndex={focusHeadingOnMount ? -1 : undefined}>
            {title}
          </h1>
          {marker}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {tools ? <div className={styles.tools}>{tools}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
      {secondaryActions ? <div className={styles.secondary}>{secondaryActions}</div> : null}
      {primaryAction ? <div className={styles.primary}>{primaryAction}</div> : null}
    </header>
  );
}

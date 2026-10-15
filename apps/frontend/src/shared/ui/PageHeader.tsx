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
  wideActions = false
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
    <header className={styles.header} data-wide-actions={wideActions || undefined}>
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
    </header>
  );
}

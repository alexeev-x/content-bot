import { createContext, useContext, type ReactNode } from 'react';
import styles from './PageHeader.module.css';

type Props = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** A small badge after the title (e.g. «Превью»). */
  marker?: ReactNode;
  /** Explicitly suppresses shell tools for a focused route with its own reference header. */
  tools?: ReactNode | null;
};

const PageHeaderToolsContext = createContext<ReactNode>(null);

/** Icon tools (search, owner menu) that every PageHeader below renders in its title row; the shell sets them. */
export const PageHeaderTools = PageHeaderToolsContext.Provider;

export function PageHeader({ title, description, actions, marker, tools: toolsOverride }: Props) {
  const contextualTools = useContext(PageHeaderToolsContext);
  const tools = toolsOverride === undefined ? contextualTools : toolsOverride;
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {marker}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {tools ? <div className={styles.tools}>{tools}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

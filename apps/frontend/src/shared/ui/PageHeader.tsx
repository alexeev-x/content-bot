import { createContext, useContext, type ReactNode } from 'react';
import styles from './PageHeader.module.css';

type Props = { title: string; description?: string; actions?: ReactNode };

const PageHeaderToolsContext = createContext<ReactNode>(null);

/** Icon tools (search, owner menu) that every PageHeader below renders in its title row; the shell sets them. */
export const PageHeaderTools = PageHeaderToolsContext.Provider;

export function PageHeader({ title, description, actions }: Props) {
  const tools = useContext(PageHeaderToolsContext);
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        <h1 className={styles.title}>{title}</h1>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {tools ? <div className={styles.tools}>{tools}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}

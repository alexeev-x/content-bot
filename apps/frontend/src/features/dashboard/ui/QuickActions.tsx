import { Button } from '../../../shared/ui';
import { copy } from './copy';
import shell from './Dashboard.module.css';
import styles from './QuickActions.module.css';
import { Widget } from './Widget';
import type { WidgetEnv } from './widget-env';

/** The four things the owner starts most often, one press each. */
export function QuickActions({ env }: { env: Pick<WidgetEnv, 'onNewPost' | 'onNavigate'> }) {
  return (
    <Widget id="quick-actions" title={copy.quick.title}>
      <div className={`${shell.body} ${styles.grid}`}>
        <Button icon="plus" onPress={env.onNewPost}>
          {copy.quick.newPost}
        </Button>
        <Button variant="secondary" icon="upload" onPress={() => env.onNavigate('/media')}>
          {copy.quick.upload}
        </Button>
        <Button variant="secondary" icon="send" onPress={() => env.onNavigate('/publications')}>
          {copy.quick.publications}
        </Button>
        <Button variant="secondary" icon="link" onPress={() => env.onNavigate('/sources')}>
          {copy.quick.sources}
        </Button>
      </div>
    </Widget>
  );
}

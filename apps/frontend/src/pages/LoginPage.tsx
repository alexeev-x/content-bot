import { ru } from '../shared/lib/ru';
import styles from './LoginPage.module.css';
import { Button, Card, PageHeader } from '../shared/ui';

export function LoginPage() {
  return (
    <>
      <PageHeader title={ru.pages.login} />
      <Card>
        <Button isDisabled>{ru.login.button}</Button>
        <p className={styles.explanation}>{ru.login.explanation}</p>
      </Card>
    </>
  );
}

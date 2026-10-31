import { LabAutopublish } from '../../features/lab-autopublish';
import { BackgroundJobsEditor, useOwnerTimezone } from '../../features/owner-settings';
import { RubricSamplesList } from '../../features/rubric-samples';
import { RubricsRareStates, RubricsRehearsal } from '../../features/rubrics';
import styles from './LabPage.module.css';

export function LabRubrics() {
  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Собирается только нажатая рубрика: живые данные, текст пишет ИИ, картинку рисует код. Придёт вам в чат с ботом
        через 1–3 минуты, в канал ничего не уходит.
      </p>
      <RubricSamplesList />
    </div>
  );
}

export function LabAutopublishSection() {
  const timezone = useOwnerTimezone();
  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Анонс Steam без поста проходит весь автоматический путь, как будто его только что нашёл Cron: ИИ пишет,
        проверяет факты и, если на DEV включена автопубликация, публикует без вас в канал из «Настройки → Общие».
      </p>
      <LabAutopublish timezone={timezone} />
    </div>
  );
}

export function LabBackground() {
  return <BackgroundJobsEditor />;
}

export function LabRehearsal() {
  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Недельный тест планировщика на DEV: все рубрики за неделю, примерно каждый четвёртый слот с нарочным сбоем.
        Здесь видно, что должно было случиться, что случилось и как задумано ли. Рубрики с ИИ выходят заглушкой.
      </p>
      <RubricsRehearsal />
    </div>
  );
}

export function LabStates() {
  return (
    <div className={styles.panel}>
      <p className={styles.intro}>
        Состояния «Рубрик», которые на живых данных бывают редко: каждое нарисовано настоящими компонентами на
        выдуманных данных.
      </p>
      <RubricsRareStates />
    </div>
  );
}

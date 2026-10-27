import { BackgroundJobsPanel } from './BackgroundJobsPanel';
import { GeneralSettingsEditor } from './GeneralSettingsEditor';

/** «Тестирование» → «Фоновые задачи»: the switches saved with the rest of the settings document, nothing else. */
export function BackgroundJobsEditor() {
  return (
    <GeneralSettingsEditor>
      {(view, change) => (
        <BackgroundJobsPanel enabled={view.backgroundEnabled} jobs={view.backgroundJobs} change={change} />
      )}
    </GeneralSettingsEditor>
  );
}

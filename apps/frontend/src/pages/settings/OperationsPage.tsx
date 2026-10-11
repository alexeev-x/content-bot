import { OperationsSettingsEditor } from '../../features/owner-settings';

export function OperationsPage() {
  return (
    <div className="reading-width">
      <OperationsSettingsEditor section="timezone" />
    </div>
  );
}

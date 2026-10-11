import { OperationsSettingsEditor } from '../../features/owner-settings';

export function NotificationsPage() {
  return (
    <div className="reading-width">
      <OperationsSettingsEditor section="notifications" />
    </div>
  );
}

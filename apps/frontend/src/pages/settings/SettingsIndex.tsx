import { Navigate } from '@tanstack/react-router';
import { useMediaQuery } from '../../shared/ui';

/** Wide screens open the first section; on a phone `/settings` is the section list itself (the layout draws it). */
export function SettingsIndex() {
  const wide = useMediaQuery('(min-width: 860px)');
  return wide ? <Navigate to="/settings/channels" replace /> : null;
}

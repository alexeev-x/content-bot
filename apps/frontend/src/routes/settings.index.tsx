import { createFileRoute, redirect } from '@tanstack/react-router';
import { SettingsIndex } from '../pages/settings/SettingsIndex';

export const Route = createFileRoute('/settings/')({
  // On a wide screen the redirect happens before render, so the shell does not treat it as a navigation and move focus.
  // A phone has no redirect: `/settings` is the section list. Resizing across the breakpoint is handled by the component.
  beforeLoad: () => {
    if (typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 860px)').matches) {
      throw redirect({ to: '/settings/channels', replace: true });
    }
  },
  component: SettingsIndex
});

import { createFileRoute } from '@tanstack/react-router';
import { LabRehearsal } from '../pages/lab/LabSections';

// See routes/lab.tsx: the constant folds, so a production build keeps nothing of this page.
declare const __LAB__: boolean | undefined;

function Page() {
  return typeof __LAB__ === 'boolean' && __LAB__ ? <LabRehearsal /> : null;
}

export const Route = createFileRoute('/lab/rehearsal')({ component: Page });

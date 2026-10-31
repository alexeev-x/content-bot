import { createFileRoute } from '@tanstack/react-router';
import { LabComponents } from '../pages/lab/LabSections';

// See routes/lab.tsx: the constant folds, so a production build keeps nothing of this page.
declare const __LAB__: boolean | undefined;

function Page() {
  return typeof __LAB__ === 'boolean' && __LAB__ ? <LabComponents /> : null;
}

export const Route = createFileRoute('/lab/components')({ component: Page });

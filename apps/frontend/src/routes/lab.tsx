import { createFileRoute } from '@tanstack/react-router';
import { LabPage } from '../pages/lab/LabPage';
import { NotFoundPage } from '../pages/NotFoundPage';

// «Тестирование» (owner, 26.10.2026): vite.config.ts gives a production build the literal `false`, so the bundler drops
// this branch and the lab's code; the route stays in the generated tree (one tree for every build) and answers
// «Страница не найдена». Read here, not through a helper, so the constant folds where the import is used. Each page
// under it (`lab.*.tsx`) checks the same constant, so its own chunk is empty in production too.
declare const __LAB__: boolean | undefined;

function LabRoute() {
  return typeof __LAB__ === 'boolean' && __LAB__ ? <LabPage /> : <NotFoundPage />;
}

export const Route = createFileRoute('/lab')({ component: LabRoute });

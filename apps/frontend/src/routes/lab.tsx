import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LabPage } from '../pages/lab/LabPage';
import { NotFoundPage } from '../pages/NotFoundPage';

// «Тестирование» (owner, 26.10.2026): vite.config.ts gives a production build the literal `false`, so the bundler drops
// this branch and the lab's code; the route stays in the generated tree (one tree for every build) and answers
// «Страница не найдена». Read here, not through a helper, so the constant folds where the import is used.
declare const __LAB__: boolean | undefined;

const labSearchSchema = z
  .looseObject({
    // The first tab («Рубрики») is the default and stays out of the URL; a new tool adds its key here.
    tab: z.enum(['autopublish', 'background']).optional().catch(undefined)
  })
  .catch({});

function LabRoute() {
  return typeof __LAB__ === 'boolean' && __LAB__ ? <LabPage /> : <NotFoundPage />;
}

export const Route = createFileRoute('/lab')({ validateSearch: labSearchSchema, component: LabRoute });

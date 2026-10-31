import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { GeneralPage } from '../pages/settings/GeneralPage';

// `tab` opens the «Автопубликация» tab the link from «Рубрики» («Настроить») points at.
const searchSchema = z.object({ tab: z.enum(['news', 'rubrics']).optional().catch(undefined) });

export const Route = createFileRoute('/settings/general')({ validateSearch: searchSchema, component: GeneralPage });

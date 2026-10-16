import { createFileRoute } from '@tanstack/react-router';
import { AiEditorPage } from '../pages/ai-editor/AiEditorPage';

export const Route = createFileRoute('/ai')({ component: AiEditorPage });

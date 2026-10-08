import { createFileRoute } from '@tanstack/react-router';

// The screen is drawn by the layout route; this route only makes `/__proto` resolve.
export const Route = createFileRoute('/__proto/')({ component: () => null });

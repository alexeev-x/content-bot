import { Hono } from 'hono';
// Bootstrap ONLY. No persistence, Telegram sending, or auth is implied by this scaffold.
const app = new Hono();
app.get('/api/v1/health', c => c.json({ status: 'scaffold', service: 'alexeev-api', publishingEnabled: false }));
app.all('/api/v1/*', c => c.json({ error: { code:'UNAVAILABLE', message:'Feature not implemented', requestId: crypto.randomUUID() } }, 503));
export default { fetch: app.fetch };

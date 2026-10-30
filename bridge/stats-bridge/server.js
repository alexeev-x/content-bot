// Render's entry (README): one always-on Node process on the port Render gives.
import { createServer } from 'node:http';
import { listener } from './bridge.js';

createServer(listener).listen(Number(process.env.PORT ?? 10000), '0.0.0.0');

import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('publishing is explicitly disabled in scaffold',()=>{const api=readFileSync('apps/api/src/index.ts','utf8');assert.match(api,/publishingEnabled: false/);assert.match(api,/UNAVAILABLE/)});
test('frontend does not advertise live publishing',()=>{const ui=readFileSync('apps/admin/src/main.tsx','utf8');assert.match(ui,/disabled/);assert.match(ui,/Недоступно/)});

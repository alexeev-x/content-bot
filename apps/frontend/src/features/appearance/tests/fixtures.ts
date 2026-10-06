import type { AppearanceDto, CustomPresetDto } from '@alexeev/contracts';
import { http, HttpResponse, type HttpHandler } from 'msw';
import { errorBody } from '../../../test/fixtures';

export const presetIds = {
  a: '44444444-4444-4444-8444-444444444441',
  b: '44444444-4444-4444-8444-444444444442'
} as const;

export const customPreset = (overrides: Partial<CustomPresetDto> = {}): CustomPresetDto => ({
  id: presetIds.a,
  name: 'Бирюза',
  baseColor: '#0f9d8a',
  ...overrides
});

export const appearance = (overrides: Partial<AppearanceDto> = {}): AppearanceDto => ({
  themeMode: 'system',
  lightAccent: { kind: 'preset', id: 'cobalt' },
  darkAccent: { kind: 'preset', id: 'cobalt' },
  customPresets: [],
  revision: 0,
  updatedAt: null,
  ...overrides
});

export const getAppearance = (dto: AppearanceDto = appearance()): HttpHandler =>
  http.get('*/api/v1/settings/appearance', () => HttpResponse.json(dto));

export const putAppearance = (onBody?: (body: unknown) => void): HttpHandler =>
  http.put('*/api/v1/settings/appearance', async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown> & { revision: number };
    onBody?.(body);
    return HttpResponse.json({ ...body, revision: body.revision + 1, updatedAt: '2026-10-06T09:00:00.000Z' });
  });

export const putConflict = (): HttpHandler =>
  http.put('*/api/v1/settings/appearance', () =>
    HttpResponse.json(errorBody('CONFLICT', { reason: 'STALE_REVISION' }), { status: 409 })
  );

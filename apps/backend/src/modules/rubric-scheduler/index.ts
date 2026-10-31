export { plan, seedLastSent, stableHash, missingNeeds, type PlanInput } from './domain/plan';
export { violations, fitsSlot } from './domain/constraints';
export type { ChannelPost, ForecastSlot, Need, RubricDescriptor, RubricSlot, Violation, Weight } from './domain/types';
export type { ForecastSources } from './application/ports';
export { FORECAST_DAYS, type Forecast, readForecast } from './application/read-forecast';

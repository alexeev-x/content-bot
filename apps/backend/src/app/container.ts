import { type Clock, systemClock } from '../platform/clock';
import { createLogger, type Logger } from '../platform/logging/logger';

// The only place where real implementations are wired. It grows together with the modules
// (repositories, transports); nothing is registered here before it exists.
export interface Container {
  clock: Clock;
  logger: Logger;
}

export function createContainer(): Container {
  return { clock: systemClock, logger: createLogger() };
}

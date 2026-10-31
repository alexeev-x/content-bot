import type { Container } from '../container';
import type { BuildDeps } from './types';

// The rubrics' memory between posts. The lab keeps today's counters in D1: every press advances a bank and remembers the
// horoscope's tellers and the last shame heroes. The scheduler (stage 4) gets its own adapter that reads its history and
// writes nothing while it builds, so a build that never goes out burns no bank line.

export function labRubricPorts(container: Container): Pick<BuildDeps, 'tellers' | 'shameHeroes' | 'turns'> {
  return {
    tellers: {
      used: () => container.systemState.readHoroscopeTellers(),
      remember: (heroIds) => container.systemState.rememberHoroscopeTellers(heroIds, container.clock.now())
    },
    shameHeroes: {
      used: () => container.systemState.readShameHeroes(),
      remember: (heroId) => container.systemState.rememberShameHero(heroId, container.clock.now())
    },
    // The lab's counter ignores the bank's size: it only grows.
    turns: { next: (name) => container.systemState.nextTurn(name, container.clock.now()) }
  };
}

import { channelsCopy } from '../ui/copy';
import type { RequestFailure } from './check-failure';

/** Wording for a failed create (the add dialog). Typed data stays in the form whatever the failure. */
export function createFailureMessage(failure: RequestFailure): string {
  switch (failure.kind) {
    case 'chat_taken':
      return channelsCopy.addDialog.chatTaken;
    case 'in_flight':
      return channelsCopy.addDialog.inFlight;
    case 'key_reused':
      return channelsCopy.addDialog.keyReused;
    case 'forbidden':
      return channelsCopy.failure.forbidden.body;
    case 'unavailable':
      return channelsCopy.failure.unavailable.body;
    case 'rate_limited':
      return channelsCopy.failure.rateLimited.body;
    default:
      return channelsCopy.addDialog.saveFailed;
  }
}

import type { CheckDestinationInput, DestinationCheckDto } from '@alexeev/contracts';
import type { ChatInspector, DestinationRepository } from './ports';

// Nothing is written: the owner learns what Telegram says before the destination is saved.
export async function checkDestination(
  deps: { inspector: ChatInspector; repo: DestinationRepository },
  input: CheckDestinationInput
): Promise<DestinationCheckDto> {
  const inspection = await deps.inspector.inspect(input.chatId);
  const alreadyAddedId = await deps.repo.findIdByChat(inspection);
  return { ...inspection, alreadyAddedId };
}

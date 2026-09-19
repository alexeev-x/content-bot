/** offset подтверждает только непрерывную последовательность доставленных апдейтов. */
export const deliverUpdates = async (updates, offset, deliver) => {
  for (const update of updates) {
    try {
      await deliver(update);
      offset = update.update_id + 1;
    } catch {
      // Поздние апдейты не подтверждаем: getUpdates иначе потеряет неудавшийся ранний.
      break;
    }
  }
  return offset;
};

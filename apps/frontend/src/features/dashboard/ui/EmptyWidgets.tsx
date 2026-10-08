import { Button, EmptyState } from '../../../shared/ui';
import { copy } from './copy';

type Props = {
  /** Offered only where editing can start (the view mode with a known revision). */
  onReset?: () => void;
  onAdd?: () => void;
};

/** A saved layout with no widgets is the owner's choice (or a repaired row), not an error: offer the way back. */
export function EmptyWidgets({ onReset, onAdd }: Props) {
  return (
    <EmptyState
      title={copy.empty.title}
      description={copy.empty.description}
      action={
        onReset || onAdd ? (
          <>
            {onAdd ? (
              <Button icon="plus" onPress={onAdd}>
                {copy.edit.addWidget}
              </Button>
            ) : null}
            {onReset ? (
              <Button variant="secondary" onPress={onReset}>
                {copy.edit.reset}
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}

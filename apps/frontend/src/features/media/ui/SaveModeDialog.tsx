import { useState } from 'react';
import { Button, Dialog } from '../../../shared/ui';
import type { DeriveMode } from '../api/media-api';

type Props = {
  isOpen: boolean;
  fileName: string;
  onChoose: (mode: DeriveMode) => void;
  onClose: () => void;
};

const REPLACE_NOTE = 'Заменит файл в черновиках; опубликованные посты не изменятся.';

/** Asked after «Сохранить» in the library crop: a new file, or replace (confirmed inside the same modal). */
export function SaveModeDialog({ isOpen, fileName, onChoose, onClose }: Props) {
  const [confirming, setConfirming] = useState(false);
  const close = () => {
    setConfirming(false);
    onClose();
  };
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) close();
      }}
      role="alertdialog"
      title={confirming ? `Заменить «${fileName}»?` : 'Как сохранить результат?'}
      description={REPLACE_NOTE}
      footer={
        confirming ? (
          <>
            {/* Intentional: the safe answer takes initial focus in a destructive confirmation (skill ui-patterns). */}
            {/* oxlint-disable-next-line jsx-a11y/no-autofocus */}
            <Button variant="secondary" autoFocus onPress={() => setConfirming(false)}>
              Нет
            </Button>
            <Button
              variant="danger"
              onPress={() => {
                setConfirming(false);
                onChoose('replace');
              }}
            >
              Да, заменить
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onPress={close}>
              Отмена
            </Button>
            <Button variant="secondary" onPress={() => setConfirming(true)}>
              Заменить текущий
            </Button>
            <Button
              variant="primary"
              onPress={() => {
                onChoose('new');
              }}
            >
              Сохранить как новый файл
            </Button>
          </>
        )
      }
    />
  );
}

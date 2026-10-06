import type { PublicationDto } from '@alexeev/contracts';
import { now, parseAbsolute, type ZonedDateTime } from '@internationalized/date';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useMemo, useState } from 'react';
import { Button, DateTimeField, Dialog, useToast } from '../../../shared/ui';
import { publicationKeys, useReschedulePublication } from '../api/publications-queries';
import { browserTimeZone, formatWithZone } from '../model/format-time';
import { publicationActions } from '../model/publication-actions';
import { describeActionError, isTerminalForAction, type ActionError } from '../model/publication-errors';
import { MAX_DAYS_AHEAD } from '../model/publish-form';
import { ActionErrorBanner } from './ActionErrorBanner';
import { copy } from './copy';
import styles from './RescheduleDialog.module.css';

type Props = {
  publication: PublicationDto;
  onOpenChange: (open: boolean) => void;
};

const DAY_MS = 86_400_000;

function validate(value: ZonedDateTime | null): string | undefined {
  if (value === null) return copy.reschedule.needTime;
  const at = value.toDate().getTime();
  if (at <= Date.now()) return copy.reschedule.timeInPast;
  if (at > Date.now() + MAX_DAYS_AHEAD * DAY_MS) return copy.reschedule.timeTooFar;
  return undefined;
}

/** Mounted only while open, so it starts from the current time on every opening and keeps the typed value on errors. */
export function RescheduleDialog({ publication, onOpenChange }: Props) {
  const formId = useId();
  const zone = useMemo(() => browserTimeZone(), []);
  const toast = useToast();
  const queryClient = useQueryClient();
  const reschedule = useReschedulePublication();
  const [value, setValue] = useState<ZonedDateTime | null>(() => parseAbsolute(publication.scheduledAt, zone));
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [failure, setFailure] = useState<ActionError | null>(null);
  const canReschedule = publicationActions(publication.status).canReschedule;

  async function submit() {
    if (reschedule.isPending || !canReschedule) return;
    const problem = validate(value);
    setFieldError(problem);
    if (problem || value === null) return;
    setFailure(null);
    try {
      const updated = await reschedule.mutateAsync({
        id: publication.id,
        input: { revision: publication.revision, scheduledAt: value.toDate().toISOString(), timezone: zone }
      });
      toast.show({
        tone: 'success',
        title: copy.reschedule.toastTitle,
        description: copy.reschedule.toastBody(formatWithZone(updated.scheduledAt, zone))
      });
      onOpenChange(false);
    } catch (error) {
      const described = describeActionError(error, 'reschedule');
      setFailure(described);
      // The server's truth replaces the stale copy; what the owner typed stays in the field.
      if (described.kind === 'stale_revision' || isTerminalForAction(described.kind)) {
        void queryClient.invalidateQueries({ queryKey: publicationKeys.detail(publication.id) });
        void queryClient.invalidateQueries({ queryKey: publicationKeys.lists() });
      }
    }
  }

  const blocked: ActionError | null = canReschedule
    ? null
    : { kind: 'not_reschedulable', tone: 'conflict', ...copy.errors.notReschedulable };
  const shownFailure = blocked ?? failure;

  return (
    <Dialog
      isOpen
      onOpenChange={onOpenChange}
      title={copy.reschedule.title}
      description={copy.reschedule.description}
      footer={
        <>
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            {copy.reschedule.cancel}
          </Button>
          <Button
            type="submit"
            form={formId}
            icon="calendar"
            isLoading={reschedule.isPending}
            isDisabled={!canReschedule}
          >
            {copy.reschedule.submit}
          </Button>
        </>
      }
    >
      <form
        id={formId}
        className={styles.form}
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {shownFailure ? <ActionErrorBanner error={shownFailure} /> : null}
        <DateTimeField
          label={copy.reschedule.field}
          value={value}
          onChange={(next) => {
            setValue(next);
            if (fieldError) setFieldError(validate(next));
          }}
          timeZone={zone}
          minValue={now(zone)}
          isRequired
          isDisabled={!canReschedule}
          {...(fieldError ? { errorMessage: fieldError } : {})}
        />
      </form>
    </Dialog>
  );
}

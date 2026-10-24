import { Link } from '@tanstack/react-router';
import { Banner } from '../../../shared/ui';
import type { LifecycleNotice } from '../model/lifecycle-notices';
import { postsCopy } from './copy';

type Props = { notice: LifecycleNotice; onDismiss?: () => void };

const copy = postsCopy.lifecycle.notices;

/** Persistent explanation of a refused delete or restore; a toast is never the only place it lives. */
export function LifecycleBanner({ notice, onDismiss }: Props) {
  return (
    <Banner
      tone={notice.tone}
      title={notice.title}
      {...(onDismiss ? { onDismiss } : {})}
      action={
        notice.publicationId ? (
          <Link to="/publications" search={{ id: notice.publicationId }}>
            {copy.openPublication}
          </Link>
        ) : undefined
      }
    >
      {notice.body}
      {notice.requestId ? (
        <>
          {' '}
          {copy.requestId}: <code>{notice.requestId}</code>
        </>
      ) : null}
    </Banner>
  );
}

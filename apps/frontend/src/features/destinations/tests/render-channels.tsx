import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { ChannelsPage } from '../../../pages/settings/ChannelsPage';
import { ToastProvider } from '../../../shared/ui';
import { createTestQueryClient, createWrapper } from '../../../test/query-wrapper';

function Harness({ initialId }: { initialId: string | undefined }) {
  // Stands in for the route's `?channel=` search param.
  const [selected, setSelected] = useState(initialId);
  return <ChannelsPage selectedId={selected} onSelect={setSelected} />;
}

export function renderChannels(initialId?: string) {
  const user = userEvent.setup();
  const Wrapper = createWrapper(createTestQueryClient());
  render(
    <Wrapper>
      <ToastProvider>
        <Harness initialId={initialId} />
      </ToastProvider>
    </Wrapper>
  );
  return { user };
}

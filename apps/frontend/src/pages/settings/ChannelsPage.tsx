import { useState } from 'react';
import { AddChannelDialog, ChannelDrawer, ChannelsList, channelsCopy } from '../../features/destinations';
import { Button } from '../../shared/ui';
import { SectionActions } from './section-actions';

type Props = {
  /** The channel open in the drawer; lives in the URL so the view is linkable and Back closes it. */
  selectedId: string | undefined;
  onSelect: (id: string | undefined) => void;
};

export function ChannelsPage({ selectedId, onSelect }: Props) {
  const [adding, setAdding] = useState(false);
  // What rights checks found this session; a channel never checked shows no claim either way.
  const [rights, setRights] = useState<Readonly<Record<string, boolean>>>({});

  function rememberRights(id: string, botCanPost: boolean) {
    setRights((known) => ({ ...known, [id]: botCanPost }));
  }

  return (
    <>
      <SectionActions>
        <Button variant="secondary" icon="plus" onPress={() => setAdding(true)}>
          {channelsCopy.add}
        </Button>
      </SectionActions>
      <ChannelsList rights={rights} onOpen={onSelect} onAdd={() => setAdding(true)} />
      <AddChannelDialog
        isOpen={adding}
        onOpenChange={setAdding}
        onCreated={(destination, botCanPost) => rememberRights(destination.id, botCanPost)}
        onOpenExisting={(id) => {
          setAdding(false);
          onSelect(id);
        }}
      />
      <ChannelDrawer
        channelId={selectedId ?? null}
        onClose={() => onSelect(undefined)}
        onOpenOther={onSelect}
        onRightsKnown={rememberRights}
      />
    </>
  );
}

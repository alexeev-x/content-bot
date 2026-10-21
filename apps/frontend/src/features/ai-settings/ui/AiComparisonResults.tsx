import type { AiComparisonDto, AiComparisonsDto } from '@alexeev/contracts';
import { useState } from 'react';
import { DataTable, Drawer, type DataColumn } from '../../../shared/ui';
import styles from './AiComparison.module.css';

const MODEL_LABEL: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'gpt-6-astra': 'GPT-6 Astra'
};
export const modelLabel = (model: string) => MODEL_LABEL[model] ?? model;

const CHOICE: Record<'a' | 'b' | 'same', string> = { a: 'A', b: 'B', same: 'Одинаково' };

type Row = AiComparisonDto & { index: number };

const winner = (row: AiComparisonDto) =>
  row.choice === null || row.models === null
    ? '—'
    : row.choice === 'same'
      ? 'Одинаково'
      : modelLabel(row.models[row.choice]);

/** After every pick (owner, 21.10.2026): the tally, a table of the pairs and both versions of one in a side panel. */
export function AiComparisonResults({ data }: { data: AiComparisonsDto }) {
  const rows: Row[] = data.items
    .filter((item) => item.status === 'ready')
    .map((item, index) => ({ ...item, index: index + 1 }));
  const [openId, setOpenId] = useState<string | undefined>();
  const opened = rows.find((row) => row.id === openId);
  const columns: DataColumn<Row>[] = [
    { id: 'index', header: '№', cell: (row) => row.index, width: 56 },
    { id: 'label', header: 'Задание', cell: (row) => row.label, isRowHeader: true },
    { id: 'choice', header: 'Ваш выбор', cell: (row) => (row.choice ? CHOICE[row.choice] : '—'), width: 120 },
    {
      id: 'winner',
      header: 'Победила',
      cell: (row) => <span className={styles.winner}>{winner(row)}</span>,
      width: 180
    }
  ];
  return (
    <>
      <ul className={styles.tally} aria-label="Счёт">
        {data.tally.wins.map((win) => (
          <li key={win.model}>
            <span className={styles.tallyModel}>{modelLabel(win.model)}</span>
            <span className={styles.tallyCount}>{win.count}</span>
          </li>
        ))}
        <li>
          <span className={styles.tallyModel}>Одинаково</span>
          <span className={styles.tallyCount}>{data.tally.same}</span>
        </li>
      </ul>
      <DataTable
        aria-label="Итоги сравнения"
        columns={columns}
        rows={rows}
        getRowId={(row) => row.id}
        getRowText={(row) => `${row.index}. ${row.label}`}
        onRowAction={setOpenId}
        activeId={openId}
        density="compact"
        flush
      />
      <Drawer
        isOpen={opened !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenId(undefined);
        }}
        title={opened ? `${opened.index}. ${opened.label}` : 'Пара'}
        size="wide"
      >
        {opened ? (
          <div className={styles.drawerBody}>
            {opened.note ? <p className={styles.muted}>Ваша заметка: {opened.note}</p> : null}
            {(['a', 'b'] as const).map((side) => (
              <section
                key={side}
                className={styles.version}
                data-chosen={opened.choice === side || opened.choice === 'same' || undefined}
                aria-label={`Вариант ${side.toUpperCase()}`}
              >
                <div className={styles.side}>
                  <span className={styles.letter}>{side.toUpperCase()}</span>
                  {opened.models ? <span className={styles.model}>{modelLabel(opened.models[side])}</span> : null}
                  {opened.choice === side ? <span className={styles.chosen}>ваш выбор</span> : null}
                </div>
                <p className={styles.text}>{opened[side]}</p>
              </section>
            ))}
          </div>
        ) : null}
      </Drawer>
    </>
  );
}

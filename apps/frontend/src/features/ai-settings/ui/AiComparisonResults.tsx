import type { AiComparisonDto, AiComparisonsDto } from '@alexeev/contracts';
import { useState } from 'react';
import { DataTable, Drawer, type DataColumn } from '../../../shared/ui';
import styles from './AiComparison.module.css';

const MODEL_LABEL: Record<string, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5',
  'gpt-6.1-sol': 'GPT-6.1 Sol',
  'gpt-6-astra': 'GPT-6 Astra'
};
const modelLabel = (model: string) => MODEL_LABEL[model] ?? model;

const CHOICE: Record<'a' | 'b' | 'same', string> = { a: 'A', b: 'B', same: 'Одинаково' };

/** The test's rule: no winner over all tasks without the split by format. */
const FORMATS = [
  { id: 'reels', label: 'Reels', match: (code: string) => /^R\d/.test(code) },
  { id: 'telegram', label: 'Telegram', match: (code: string) => code.startsWith('TG') },
  { id: 'ideas', label: 'Идеи', match: (code: string) => code.startsWith('IDEA') }
] as const;

const usd = (value: number) => `$${value.toFixed(value < 0.1 ? 3 : 2)}`;
const seconds = (ms: number) => `${Math.round(ms / 1000)} с`;

const winnerOf = (row: AiComparisonDto) =>
  row.choice === null || row.models === null ? null : row.choice === 'same' ? 'same' : row.models[row.choice];

type Row = AiComparisonDto & { index: number };

type FormatRow = { id: string; label: string; wins: Record<string, number>; same: number; total: number };
type ModelRow = { id: string; texts: number; failed: number; cost: number; unpriced: number; ms: number[] };

function summarize(items: readonly AiComparisonDto[], models: readonly string[]) {
  const formats: FormatRow[] = FORMATS.map((format) => {
    const rows = items.filter((item) => item.status === 'ready' && format.match(item.code ?? ''));
    const wins = Object.fromEntries(models.map((model) => [model, 0]));
    let same = 0;
    for (const row of rows) {
      const winner = winnerOf(row);
      if (winner === 'same') same += 1;
      else if (winner !== null) wins[winner] = (wins[winner] ?? 0) + 1;
    }
    return { id: format.id, label: format.label, wins, same, total: rows.length };
  });
  const perModel = new Map<string, ModelRow>(
    models.map((model) => [model, { id: model, texts: 0, failed: 0, cost: 0, unpriced: 0, ms: [] }])
  );
  for (const item of items) {
    if (item.models === null || item.stats === null) continue;
    for (const side of ['a', 'b'] as const) {
      const stat = perModel.get(item.models[side]);
      const sideStats = item.stats[side];
      if (stat === undefined) continue;
      if (sideStats.error !== null) stat.failed += 1;
      else stat.texts += 1;
      if (sideStats.costUsd === null) stat.unpriced += 1;
      else stat.cost += sideStats.costUsd;
      if (sideStats.ms !== null) stat.ms.push(sideStats.ms);
    }
  }
  return { formats, perModel: [...perModel.values()] };
}

/** After every pick (owner, 21.10.2026): wins by format, cost and time per model, the pairs and both versions of one. */
export function AiComparisonResults({ data }: { data: AiComparisonsDto }) {
  const rows: Row[] = data.items.map((item, index) => ({ ...item, index: index + 1 }));
  const models = [...new Set(data.items.flatMap((item) => (item.models ? [item.models.a, item.models.b] : [])))];
  const { formats, perModel } = summarize(data.items, models);
  const [openId, setOpenId] = useState<string | undefined>();
  const opened = rows.find((row) => row.id === openId);

  const formatColumns: DataColumn<FormatRow>[] = [
    { id: 'format', header: 'Формат', cell: (row) => row.label, isRowHeader: true },
    ...models.map((model) => ({
      id: model,
      header: modelLabel(model),
      cell: (row: FormatRow) => row.wins[model] ?? 0,
      align: 'end' as const,
      width: 160
    })),
    { id: 'same', header: 'Одинаково', cell: (row) => row.same, align: 'end', width: 120 },
    { id: 'total', header: 'Пар', cell: (row) => row.total, align: 'end', width: 80 }
  ];
  const modelColumns: DataColumn<ModelRow>[] = [
    { id: 'model', header: 'Модель', cell: (row) => modelLabel(row.id), isRowHeader: true },
    { id: 'texts', header: 'Текстов', cell: (row) => row.texts, align: 'end', width: 100 },
    { id: 'failed', header: 'Не ответила', cell: (row) => row.failed, align: 'end', width: 120 },
    {
      id: 'cost',
      header: 'Всего',
      cell: (row) => `${usd(row.cost)}${row.unpriced > 0 ? ` (+${row.unpriced} без цены)` : ''}`,
      align: 'end',
      width: 140
    },
    {
      id: 'per',
      header: 'За текст',
      cell: (row) => (row.texts > 0 ? usd(row.cost / row.texts) : '—'),
      align: 'end',
      width: 110
    },
    {
      id: 'ms',
      header: 'Время в среднем',
      cell: (row) => (row.ms.length > 0 ? seconds(row.ms.reduce((sum, ms) => sum + ms, 0) / row.ms.length) : '—'),
      align: 'end',
      width: 150
    }
  ];
  const columns: DataColumn<Row>[] = [
    { id: 'code', header: 'Код', cell: (row) => row.code ?? row.index, width: 96 },
    { id: 'label', header: 'Задание', cell: (row) => row.label, isRowHeader: true },
    {
      id: 'choice',
      header: 'Ваш выбор',
      cell: (row) => (row.status !== 'ready' ? 'Не завершена' : row.choice ? CHOICE[row.choice] : '—'),
      width: 130
    },
    {
      id: 'winner',
      header: 'Победила',
      cell: (row) => {
        const winner = winnerOf(row);
        return (
          <span className={styles.winner}>
            {winner === null ? '—' : winner === 'same' ? 'Одинаково' : modelLabel(winner)}
          </span>
        );
      },
      width: 180
    }
  ];
  return (
    <div className={styles.results}>
      <section className={styles.block} aria-labelledby="cmp-formats">
        <h3 id="cmp-formats" className={styles.blockTitle}>
          Победы по форматам
        </h3>
        <DataTable
          aria-label="Победы по форматам"
          columns={formatColumns}
          rows={formats}
          getRowId={(row) => row.id}
          density="compact"
          flush
        />
      </section>
      <section className={styles.block} aria-labelledby="cmp-cost">
        <h3 id="cmp-cost" className={styles.blockTitle}>
          Цена и время
        </h3>
        <p className={styles.muted}>
          Цена — все вызовы стороны: текст, проверка фактов, исправление и повтор после сбоя. Время — от запроса до
          готового текста.
        </p>
        <DataTable
          aria-label="Цена и время по моделям"
          columns={modelColumns}
          rows={perModel}
          getRowId={(row) => row.id}
          density="compact"
          flush
        />
      </section>
      <section className={styles.block} aria-labelledby="cmp-pairs">
        <h3 id="cmp-pairs" className={styles.blockTitle}>
          Пары
        </h3>
        <DataTable
          aria-label="Пары сравнения"
          columns={columns}
          rows={rows}
          getRowId={(row) => row.id}
          getRowText={(row) => `${row.code ?? row.index}. ${row.label}`}
          onRowAction={setOpenId}
          activeId={openId}
          density="compact"
          flush
        />
      </section>
      <Drawer
        isOpen={opened !== undefined}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenId(undefined);
        }}
        title={opened ? `${opened.code ?? opened.index} · ${opened.label}` : 'Пара'}
        size="wide"
      >
        {opened ? (
          <div className={styles.drawerBody}>
            {opened.note ? <p className={styles.muted}>Ваша заметка: {opened.note}</p> : null}
            {(['a', 'b'] as const).map((side) => {
              const stat = opened.stats?.[side];
              return (
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
                  {stat ? (
                    <p className={styles.model}>
                      {[
                        stat.costUsd === null ? 'без цены' : usd(stat.costUsd),
                        stat.ms === null ? null : seconds(stat.ms),
                        stat.error
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                  <p className={styles.text}>{opened[side] ?? 'Текста нет.'}</p>
                </section>
              );
            })}
            <p className={styles.task}>{opened.task}</p>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

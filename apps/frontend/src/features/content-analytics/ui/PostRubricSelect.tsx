import { useQuery } from '@tanstack/react-query';
import { Select } from '../../../shared/ui';
import { contentRubricsQueryOptions, postRubricQueryOptions, useSetPostRubric } from '../api/content-analytics-queries';

const NONE = 'none';

/**
 * The post editor's «Рубрика» (plan B3): the owner's pick wins over the rubric's hashtag or name in the text. Hidden
 * until a rubric exists (Настройки → Аналитика). Saved at once, apart from the post and its revision.
 */
export function PostRubricSelect({ postId, isDisabled = false }: { postId: string; isDisabled?: boolean }) {
  const rubrics = useQuery(contentRubricsQueryOptions());
  const picked = useQuery(postRubricQueryOptions(postId));
  const save = useSetPostRubric(postId);
  const list = rubrics.data?.rubrics ?? [];
  if (list.length === 0 || picked.data === undefined) return null;
  // While the request runs the select shows the asked rubric; the cache changes only on the server's answer.
  const value = save.isPending ? (save.variables ?? NONE) : (picked.data.rubricId ?? NONE);
  return (
    <Select
      label="Рубрика"
      inlineLabel
      options={[{ id: NONE, label: 'Без рубрики' }, ...list.map((rubric) => ({ id: rubric.id, label: rubric.name }))]}
      value={value}
      isDisabled={isDisabled || save.isPending}
      onChange={(id) => save.mutate(id === NONE ? null : id)}
      errorMessage={save.isError ? 'Не сохранилось. Выберите ещё раз.' : undefined}
    />
  );
}

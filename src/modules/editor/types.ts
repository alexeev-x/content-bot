export type Rubric = {
  key: string;
  title: string;
  instructions: string;
};

export type SavedMaterial = {
  id: string;
  kind: 'draft' | 'author_example';
  rubric?: Rubric;
};

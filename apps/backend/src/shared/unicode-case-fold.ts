// D1 (SQLite without ICU) folds only ASCII in lower(), LIKE and COLLATE NOCASE, so «ауд» would never match
// «Аудит». The query is folded in JS; the column is folded in SQL by lower() plus one replace() per
// uppercase letter the query can contain. Only letters of the query need folding: any other uppercase
// letter in the column cannot match a lowercase query character anyway.

/** The query as the column will be folded: compare it with `instr(caseFoldSql(column, q), ?)`. */
export function foldSearchQuery(query: string): string {
  return query.toLocaleLowerCase('ru');
}

/**
 * SQL expression for `column` folded to lower case for the letters of `query`. The interpolated characters are
 * single letters whose upper and lower forms differ, so they can never contain a quote.
 */
export function caseFoldSql(column: string, query: string): string {
  let expression = `lower(${column})`;
  const uppercaseCharacters = new Set<string>();
  for (const character of foldSearchQuery(query)) {
    const uppercase = character.toLocaleUpperCase('ru');
    if ([...uppercase].length === 1 && uppercase !== character) uppercaseCharacters.add(uppercase);
  }
  for (const uppercase of uppercaseCharacters)
    expression = `replace(${expression}, '${uppercase}', '${uppercase.toLocaleLowerCase('ru')}')`;
  return expression;
}

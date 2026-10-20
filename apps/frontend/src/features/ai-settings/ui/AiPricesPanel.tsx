import type { AiOverviewDto } from '@alexeev/contracts';
import { Disclosure, DisclosureGroup } from '../../../shared/ui';
import { copy } from './copy';
import styles from './AiSettingsPage.module.css';

/**
 * The provider's prices per million tokens, as the cost of every request is computed: a reference, not a setting, so
 * it sits folded at the end of Настройки → ИИ.
 */
export function AiPricesPanel({ overview }: { overview: AiOverviewDto }) {
  const { catalog } = overview;
  return (
    <DisclosureGroup>
      <Disclosure id="prices" title={copy.pricesTitle(catalog.providerLabel, catalog.pricesCheckedOn)}>
        <div className={styles.pricesBody}>
          <table className={styles.prices}>
            <thead>
              <tr>
                <th scope="col">{copy.model}</th>
                <th scope="col">{copy.input}</th>
                <th scope="col">{copy.cached}</th>
                <th scope="col">{copy.output}</th>
              </tr>
            </thead>
            <tbody>
              {catalog.models.map((model) => (
                <tr key={model.id}>
                  <th scope="row">{model.label}</th>
                  <td>${model.inputPerMillion}</td>
                  <td>${model.cachedInputPerMillion}</td>
                  <td>${model.outputPerMillion}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={styles.meta}>{copy.pricesHint}</p>
        </div>
      </Disclosure>
    </DisclosureGroup>
  );
}

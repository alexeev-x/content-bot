export type SettingKey = 'appearance' | 'operations';

export interface SettingRecord {
  /** The JSON document as stored; the application parses it with the contract schema. */
  value: string;
  revision: number;
  /** UTC epoch milliseconds. */
  updatedAt: number;
}

export interface SettingWrite {
  key: SettingKey;
  value: string;
  /** 0 means "no row yet": the write is then an insert guarded against a concurrent first save. */
  expectedRevision: number;
  actor: string;
  now: number;
  /** Names of the fields that changed, for the audit row (never their values). */
  fields: string[];
}

export interface SettingsRepository {
  find(key: SettingKey): Promise<SettingRecord | null>;
  /**
   * Writes the value and the audit row in one batch, both guarded by the revision.
   * `not_applied`: another save won (or the row is not at `expectedRevision`); nothing was written.
   */
  save(write: SettingWrite): Promise<'saved' | 'not_applied'>;
}

export interface DashboardLayoutRecord {
  /** The JSON array of widgets as stored; the application parses it with the contract schema. */
  value: string;
  revision: number;
}

export interface DashboardLayoutWrite {
  value: string;
  /** 0 means "no row yet": the write is then an insert guarded against a concurrent first save. */
  expectedRevision: number;
  actor: string;
  now: number;
  /** The number of widgets, for the audit row (never their content). */
  widgetCount: number;
}

export interface DashboardLayoutRepository {
  find(): Promise<DashboardLayoutRecord | null>;
  /**
   * Writes the layout and the audit row in one batch, both guarded by the revision.
   * `not_applied`: another save won (or the row is not at `expectedRevision`); nothing was written.
   */
  save(write: DashboardLayoutWrite): Promise<'saved' | 'not_applied'>;
}

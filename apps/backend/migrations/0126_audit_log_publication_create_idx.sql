-- «Публикации» derive a publication's type from who created it (the audit row `publication.create`), once per listed
-- row; audit_log has no index by entity, so each lookup scanned the whole log. Partial, so only those rows are
-- indexed. Expand-only: a new index.
CREATE INDEX audit_log_publication_create_idx ON audit_log (entity_id) WHERE action = 'publication.create';

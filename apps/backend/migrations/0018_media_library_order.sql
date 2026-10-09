CREATE INDEX media_assets_created_idx ON media_assets (created_at DESC, id DESC);
CREATE INDEX media_assets_kind_created_idx ON media_assets (kind, created_at DESC, id DESC);

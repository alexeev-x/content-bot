CREATE INDEX media_assets_sha256_idx ON media_assets (sha256);
CREATE INDEX media_assets_file_name_idx ON media_assets (file_name COLLATE NOCASE);
CREATE INDEX post_media_media_id_idx ON post_media (media_id, post_id);

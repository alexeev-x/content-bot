-- Trigram indexes support case-insensitive Unicode substring search over post text and channel titles.
CREATE VIRTUAL TABLE posts_search USING fts5(title, body, content='posts', content_rowid='rowid', tokenize='trigram');
INSERT INTO posts_search(posts_search) VALUES ('rebuild');
CREATE TRIGGER posts_search_insert AFTER INSERT ON posts BEGIN
  INSERT INTO posts_search(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;
CREATE TRIGGER posts_search_delete AFTER DELETE ON posts BEGIN
  INSERT INTO posts_search(posts_search, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
END;
CREATE TRIGGER posts_search_update AFTER UPDATE OF title, body ON posts BEGIN
  INSERT INTO posts_search(posts_search, rowid, title, body) VALUES ('delete', old.rowid, old.title, old.body);
  INSERT INTO posts_search(rowid, title, body) VALUES (new.rowid, new.title, new.body);
END;

CREATE VIRTUAL TABLE destinations_search USING fts5(title, content='destinations', content_rowid='rowid', tokenize='trigram');
INSERT INTO destinations_search(destinations_search) VALUES ('rebuild');
CREATE TRIGGER destinations_search_insert AFTER INSERT ON destinations BEGIN
  INSERT INTO destinations_search(rowid, title) VALUES (new.rowid, new.title);
END;
CREATE TRIGGER destinations_search_delete AFTER DELETE ON destinations BEGIN
  INSERT INTO destinations_search(destinations_search, rowid, title) VALUES ('delete', old.rowid, old.title);
END;
CREATE TRIGGER destinations_search_update AFTER UPDATE OF title ON destinations BEGIN
  INSERT INTO destinations_search(destinations_search, rowid, title) VALUES ('delete', old.rowid, old.title);
  INSERT INTO destinations_search(rowid, title) VALUES (new.rowid, new.title);
END;

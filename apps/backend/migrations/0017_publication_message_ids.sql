ALTER TABLE publications
  ADD COLUMN external_message_ids TEXT
  CHECK (external_message_ids IS NULL OR
    (json_valid(external_message_ids) AND json_type(external_message_ids) = 'array' AND
     json_array_length(external_message_ids) BETWEEN 1 AND 10));

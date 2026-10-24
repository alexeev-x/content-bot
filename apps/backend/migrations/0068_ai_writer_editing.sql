-- «✏️ Изменить» under an AI draft (owner, 17.10.2026: replying to a message is awkward): the chat waits for the
-- owner's own version of that draft, and the next plain message is stored as the edit. Expand-only: one nullable
-- column; NULL means no edit is awaited.
ALTER TABLE ai_writer_requests ADD COLUMN editing_generation_id TEXT;

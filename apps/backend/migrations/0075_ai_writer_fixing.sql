-- «Что не так?» (stage P2 of the AI plan, owner 19.10.2026): after the tap the chat waits for the owner's own words
-- about the draft; the next plain message is that remark and the bot writes a corrected version. One wait at a
-- time, like `editing_generation_id` (0068) and `noting_feedback_id` (0071). Expand only: NULL means no wait.
ALTER TABLE ai_writer_requests ADD COLUMN fixing_generation_id TEXT;

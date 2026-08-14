-- Add UPDATE policy for system_messages so users can mark them as read/dismissed
CREATE POLICY "messages_update" ON system_messages FOR UPDATE
USING (auth.role() = 'authenticated');

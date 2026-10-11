// Guest chats expire after 72 hours without being opened by the visitor.
// Client/member chats have an empty token hash and are excluded.
export async function expireGuestChats(query) {
  await query("DELETE FROM chat_sessions WHERE token_hash <> '' AND last_opened_at <= now() - interval '3 days'");
}

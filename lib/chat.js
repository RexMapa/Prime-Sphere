// Shared helpers for live chat.
export const MAX_MESSAGE = 2000;

// sender: 'visitor' | 'admin' | 'system' (visitor sees it) | 'note' (admins only)
export function toMessage(r) {
  const m = { id: r.id, sender: r.sender, body: r.body, createdAt: r.created_at };
  if (r.sender === 'admin') { m.name = r.admin_name || ''; m.adminId = r.admin_id || null; }
  return m;
}

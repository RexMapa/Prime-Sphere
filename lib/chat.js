// Shared helpers for live chat.
export const MAX_MESSAGE = 2000;

export function toMessage(r) {
  return { id: r.id, sender: r.sender, body: r.body, createdAt: r.created_at };
}

// Deletes screenshots/images we uploaded to Vercel Blob when they are no longer used.
import { del } from '@vercel/blob';

export const isBlob = (u) => typeof u === 'string' && /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(u);

export async function removeBlobs(urls) {
  const list = [...new Set(urls.filter(isBlob))];
  if (!list.length || !process.env.BLOB_READ_WRITE_TOKEN) return;
  try { await del(list); } catch (e) { console.error('Blob cleanup failed', e); }
}

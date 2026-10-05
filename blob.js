// Deletes screenshots/images we uploaded to Vercel Blob when they are no longer used.
import { del } from '@vercel/blob';

const TOKEN = () => process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID_READ_WRITE_TOKEN;

export const isBlob = (u) => typeof u === 'string' && /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//.test(u);

export async function removeBlobs(urls) {
  const list = [...new Set(urls.filter(isBlob))];
  if (!list.length || !TOKEN()) return;
  try { await del(list, { token: TOKEN() }); } catch (e) { console.error('Blob cleanup failed', e); }
}

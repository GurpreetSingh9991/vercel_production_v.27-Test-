/**
 * services/r2ImageUpload.ts
 * 
 * Handles all R2 image upload logic for TradeFlow web app.
 * Flow:
 *   1. Get presigned URL from our Cloudflare Worker (which verifies Supabase JWT)
 *   2. Upload image DIRECTLY to R2 (fast, no backend bottleneck)
 *   3. Save the returned R2 URL into trades.images[] in Supabase
 */

import { getSupabaseClient } from './supabase'; // your existing supabase client

// ─── Config ──────────────────────────────────────────────────────────────────
// Set this in your .env file:  VITE_IMAGE_WORKER_URL=https://your-worker.workers.dev
const WORKER_URL = import.meta.env.VITE_IMAGE_WORKER_URL as string;

if (!WORKER_URL) {
  console.warn('[r2ImageUpload] VITE_IMAGE_WORKER_URL is not set. Image uploads will fail.');
}

// ─── Types ───────────────────────────────────────────────────────────────────
export interface UploadResult {
  publicUrl: string;
  r2Key: string;
}

export interface UploadProgress {
  file: File;
  progress: number; // 0–100
  status: 'pending' | 'uploading' | 'done' | 'error';
  result?: UploadResult;
  error?: string;
}

// ─── Get current user's JWT from Supabase ────────────────────────────────────
async function getAuthToken(): Promise<string> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('No Supabase client');

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error('Not authenticated');

  return session.access_token; // This is the Supabase JWT the Worker will verify
}

// ─── Step 1: Ask Worker for upload URL ───────────────────────────────────────
async function getUploadUrl(
  tradeId: string,
  file: File,
  token: string
): Promise<{ uploadUrl: string; r2Key: string; publicUrl: string; useProxy: boolean }> {
  const response = await fetch(`${WORKER_URL}/upload-url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      tradeId,
      fileName: file.name,
      contentType: file.type,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Worker error: ${response.status}`);
  }

  return response.json();
}

// ─── Step 2a: Upload directly to R2 via presigned URL ────────────────────────
async function uploadToR2Presigned(
  presignedUrl: string,
  file: File,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', presignedUrl);
    xhr.setRequestHeader('Content-Type', file.type);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 upload failed: ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

// ─── Step 2b: Upload via Worker proxy (fallback) ──────────────────────────────
async function uploadToR2Proxy(
  r2Key: string,
  file: File,
  token: string,
  onProgress?: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `${WORKER_URL}/upload?key=${encodeURIComponent(r2Key)}`);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Proxy upload failed: ${xhr.status}`));
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

// ─── Step 3: Save URL to Supabase trade row ───────────────────────────────────
export async function appendImageToTrade(tradeId: string, imageUrl: string): Promise<void> {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const { error } = await supabase
    .from('trades')
    .update({
      images: supabase.rpc
        ? undefined // use RPC below
        : [],
    })
    .eq('id', tradeId);

  // Use raw SQL via RPC to array_append (avoids overwriting the whole array)
  await supabase.rpc('append_trade_image', {
    p_trade_id: tradeId,
    p_image_url: imageUrl,
  });
}

// ─── Remove URL from Supabase trade row + delete from R2 ─────────────────────
export async function deleteTradeImage(tradeId: string, imageUrl: string, r2Key: string): Promise<void> {
  const supabase = getSupabaseClient();
  const token = await getAuthToken();

  // Remove from Supabase
  if (supabase) {
    await supabase.rpc('remove_trade_image', {
      p_trade_id: tradeId,
      p_image_url: imageUrl,
    });
  }

  // Delete from R2 via Worker
  await fetch(`${WORKER_URL}/delete`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ r2Key }),
  });
}

// ─── Main export: upload one image ───────────────────────────────────────────
export async function uploadTradeImage(
  file: File,
  tradeId: string,
  onProgress?: (pct: number) => void
): Promise<UploadResult> {
  // Validate file
  if (!file.type.startsWith('image/')) {
    throw new Error('Only image files are allowed');
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error('Image must be under 10MB');
  }

  onProgress?.(5);

  // 1. Get auth token (Supabase JWT)
  const token = await getAuthToken();
  onProgress?.(10);

  // 2. Ask Worker for upload URL
  const { uploadUrl, r2Key, publicUrl, useProxy } = await getUploadUrl(tradeId, file, token);
  onProgress?.(20);

  // 3. Upload to R2
  if (useProxy) {
    await uploadToR2Proxy(r2Key, file, token, (pct) => onProgress?.(20 + pct * 0.7));
  } else {
    await uploadToR2Presigned(uploadUrl, file, (pct) => onProgress?.(20 + pct * 0.7));
  }
  onProgress?.(90);

  // 4. Save URL in Supabase (only if trade already exists — for new trades, pass URL back to form)
  await appendImageToTrade(tradeId, publicUrl);
  onProgress?.(100);

  return { publicUrl, r2Key };
}

// ─── Batch upload multiple images ─────────────────────────────────────────────
export async function uploadMultipleTradeImages(
  files: File[],
  tradeId: string,
  onProgressUpdate?: (items: UploadProgress[]) => void
): Promise<UploadResult[]> {
  const progress: UploadProgress[] = files.map(f => ({
    file: f,
    progress: 0,
    status: 'pending',
  }));

  const results: UploadResult[] = [];

  await Promise.all(
    files.map(async (file, i) => {
      progress[i].status = 'uploading';
      onProgressUpdate?.([...progress]);

      try {
        const result = await uploadTradeImage(file, tradeId, (pct) => {
          progress[i].progress = pct;
          onProgressUpdate?.([...progress]);
        });

        progress[i].status = 'done';
        progress[i].progress = 100;
        progress[i].result = result;
        results.push(result);
      } catch (err: any) {
        progress[i].status = 'error';
        progress[i].error = err.message;
      }

      onProgressUpdate?.([...progress]);
    })
  );

  return results;
}

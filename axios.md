# Axios Integration — multipartUpload.tsx

## Why Axios

The original code used raw `XMLHttpRequest` (XHR) for chunk uploads to get byte-level upload progress via `xhr.upload.onprogress`. Axios internally uses XHR and exposes the same capability via `onUploadProgress` — cleaner API, less boilerplate.

`fetch` was NOT used because it has no upload progress events regardless of content type or body format.

## Installation

```bash
npm install axios@1.14.0
```

> **Note:** `axios@1.14.1` and `axios@0.30.4` were compromised in a supply chain attack on March 31, 2026 (North Korea-linked threat actor UNC1069). Those versions contained a Remote Access Trojan (RAT). Safe versions are `1.14.0` and below / `0.30.3` and below.

## What Changed

### Before — `xhrUploadChunk` (~50 lines)

- Manually created `XMLHttpRequest`
- Listened to `xhr.upload.onprogress` for byte progress
- Manually wired `AbortSignal` → `xhr.abort()`
- Manually handled `xhr.onload`, `xhr.onerror`, `xhr.onabort`
- Retry loop with backoff using recursion

### After — `axiosUploadChunk` (~25 lines)

```ts
async function axiosUploadChunk(
  url: string,
  chunk: Blob,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
  retries: number = MAX_RETRIES
): Promise<string> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.put(url, chunk, {
        headers: { 'Content-Type': chunk.type || 'application/octet-stream' },
        signal,
        onUploadProgress: (e) => {
          if (e.loaded) onProgress(e.loaded);
        },
      });
      const etag = res.headers['etag'];
      if (!etag) throw new Error('ETag missing. Check bucket CORS.');
      return etag;
    } catch (err: any) {
      if (axios.isCancel(err) || err.name === 'AbortError' || err.name === 'CanceledError') {
        throw Object.assign(new Error('AbortError'), { name: 'AbortError' });
      }
      if (attempt === retries) throw err;
      onProgress(0);
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error('Unreachable');
}
```

- Axios handles XHR internally
- `onUploadProgress` fires per-byte same as `xhr.upload.onprogress`
- `signal` passed directly — Axios handles abort natively
- `axios.isCancel()` catches Axios-specific cancel errors alongside AbortError
- Retry loop with backoff using for loop (cleaner than recursion)

## What Did NOT Change

- `fetchWithRetry` — still used for all JSON API calls (`/start`, `/urls`, `/resume`, `/complete`, `/abort`)
- Progress tracking logic (`committedBytesRef`, `chunkProgressRef`) — unchanged
- IDB persistence — unchanged
- Pause/resume/cancel flow — unchanged

## How Progress Still Works

Same as before — Axios `onUploadProgress` internally fires `xhr.upload.onprogress`:

```
axios.put(url, chunk, { onUploadProgress: (e) => e.loaded })
        ↓
    XHR internally
        ↓
xhr.upload.onprogress → e.loaded = real bytes sent
```

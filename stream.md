# Session Notes — Multipart Upload Improvements

**File:** `src/components/multipartUpload.tsx`
**Date:** 2026-04-02

---

## Overview

Four separate problems were identified and fixed in the S3 multipart upload component during this session:

1. Live byte-level upload progress streaming
2. Resume progress resetting to 0% on pause → resume
3. IndexedDB not persisting chunk progress across page refreshes
4. Resume after page refresh still re-uploading the entire file despite IDB fix

---

## Problem 1 — No Live Byte Progress

### What was happening
The original code used `fetch` for chunk (part) uploads. `fetch` does not expose upload progress — there is no `onprogress` event for the request body. Progress only updated in steps: one jump per completed chunk (e.g., every 10 MB).

### Root cause
`fetch` API has no upload progress support. The Streams API workaround (`ReadableStream` body) is not yet cross-browser reliable.

### Fix — Replace chunk `fetch` with `XMLHttpRequest`

Two helper functions were added above the component:

**`xhrUploadChunk`**
```ts
function xhrUploadChunk(
  url: string,
  chunk: Blob,
  signal: AbortSignal,
  onProgress: (loaded: number) => void,
  retries = MAX_RETRIES
): Promise<string>
```
- Opens an `XMLHttpRequest` PUT request
- Attaches `xhr.upload.onprogress` which fires on every network tick with `event.loaded` (bytes sent so far)
- Calls `onProgress(event.loaded)` to stream the byte count back to the component
- On failure (non-2xx or network error): retries up to `MAX_RETRIES` times with 1s/2s/3s backoff
- On retry: calls `onProgress(0)` to reset that chunk's in-flight counter
- Respects the `AbortSignal` — calls `xhr.abort()` when signal fires (for pause)
- Rejects with `{ name: 'AbortError' }` on abort so the existing pause logic still works

**`formatBytes`**
```ts
function formatBytes(bytes: number): string
```
Converts raw bytes to human-readable string: `B`, `KB`, `MB`, `GB`.

### New state and refs added inside the component

| Name | Type | Purpose |
|---|---|---|
| `uploadedBytes` | `useState(0)` | Live bytes sent (displayed in UI) |
| `totalBytes` | `useState(0)` | Total file size (set when upload starts) |
| `committedBytesRef` | `useRef(0)` | Bytes from fully completed chunks (not in-flight) |
| `chunkProgressRef` | `useRef(Map)` | Per-chunk in-flight bytes: `Map<partNumber, loadedBytes>` |

### How live progress works across 3 concurrent chunks

```
Total displayed = committedBytesRef + sum(chunkProgressRef.values())
```

Each concurrent chunk has its own entry in `chunkProgressRef`. On every XHR progress event:
1. Update `chunkProgressRef.set(partNumber, loaded)`
2. Sum all in-flight values
3. Add to `committedBytesRef` (bytes from already-completed chunks)
4. Call `setUploadedBytes` and `setProgressPercent`

When a chunk fully completes:
1. `committedBytesRef += chunk.size` (move from in-flight to committed)
2. `chunkProgressRef.delete(partNumber)` (remove from in-flight map)
3. Explicitly call `setUploadedBytes` / `setProgressPercent` to sync display

All progress values are capped with `Math.min(..., file.size)` and `Math.min(..., 100)` to prevent overflow.

### UI changes
The uploading status now shows:
```
Uploading… 42%
12.5 MB / 30.0 MB
[=========>        ]  ← animated progress bar
```
Paused state also shows the byte offset:
```
⏸ Paused at 42% — 12.5 MB / 30.0 MB
```

---

## Problem 2 — Resume Resets Progress to 0%

### What was happening
After pausing at (say) 50% and clicking Resume, the progress bar jumped back to 0% before counting up again. In the worst case the upload also re-sent bytes that were already in S3.

### Root cause
After the `/resume` network call the code recalculated `committedBytesRef` using:
```ts
committedBytesRef.current = (totalParts - partsList.length) * partSize;
```
`partsList` is the `missingParts` array returned by the backend. If the backend returns ALL parts as missing (which happens when the Render.com free-tier server sleeps and loses state, or when S3 `ListParts` is unreliable), then:
```
(totalParts - totalParts) * partSize = 0
```
`committedBytesRef` → 0, progress → 0%. Upload re-sends everything from scratch.

### Fix — Three-part defence

**1. Immediate visual feedback before network call**

When Resume is clicked, show the current in-memory `committedBytesRef` immediately — before waiting for the `/resume` response:
```ts
chunkProgressRef.current.clear();
if (committedBytesRef.current > 0) {
  setProgressPercent(Math.min(Math.round((committedBytesRef.current / file.size) * 100), 100));
  setUploadedBytes(Math.min(committedBytesRef.current, file.size));
}
```
The user sees the correct progress instantly with no flicker.

**2. `Math.max` guard — progress never goes backwards**

After the backend responds:
```ts
const backendCommitted = (totalParts - partsList.length) * partSize;
committedBytesRef.current = Math.max(committedBytesRef.current, backendCommitted);
```
If the backend returns fewer committed bytes than we know locally, we keep the local (higher) value. Progress can only go forward.

**3. Overflow cap**

If the backend says all parts are missing but `committedBytesRef` is non-zero (from local state), re-uploading all parts would push the counter past `file.size`. All display calls are capped:
```ts
setUploadedBytes(Math.min(total, file.size));
setProgressPercent(Math.min(Math.round((total / file.size) * 100), 100));
```

---

## Problem 3 — IDB Not Persisting Chunk Progress Across Page Refreshes

### What was happening
After pausing, refreshing the page, re-adding the same file, and clicking Upload — the entire file re-uploaded from byte 0 instead of resuming from the paused position.

### Root cause
IDB (`UploadProgressDB` / `uploads` store) was written **only once** at the very start of a fresh upload, and it only stored:
```ts
{ uploadId, fileKey }
```
It was **never updated** as chunks completed. After a page refresh:
- All refs (`committedBytesRef`, `uploadedPartsRef`, etc.) reset to zero
- IDB had `uploadId` + `fileKey` but no record of which S3 parts were done
- The auto-resume path called `/resume` on the backend, which queries S3 `ListParts`
- If S3 `ListParts` was unreliable or the backend was unavailable, all parts were returned as missing → full re-upload

### How S3 multipart resume actually works (important context)

S3 multipart upload tracks parts at the **part level**, not the byte level within a part. A part either fully exists in S3 or it does not. If chunk 3 was interrupted at 5 MB into a 10 MB chunk, S3 does **not** store those 5 MB. On resume, chunk 3 must be re-sent in full from byte `(partNumber - 1) * partSize`. Chunks 1 and 2 (fully uploaded) are never re-sent.

This means: if 3 of 10 parts are in S3, the resume correctly starts uploading from part 4, not from byte 0. The frontend just needs to correctly identify which parts are in S3.

### Fix — Persist and restore progress via IDB

**1. Initial IDB write now includes empty arrays**
```ts
await saveUploadState(fileId, {
  uploadId: uploadIdRef.current,
  fileKey: fileKeyRef.current,
  uploadedParts: [],      // populated after each batch
  committedBytes: 0,      // updated after each batch
});
```

**2. IDB updated after every completed batch**
```ts
uploadedPartsRef.current.push(...results);

// Non-blocking IDB write — persists progress so refresh can resume from here
saveUploadState(fileId, {
  uploadId: uploadIdRef.current,
  fileKey: fileKeyRef.current,
  uploadedParts: uploadedPartsRef.current,  // ETags of all completed parts
  committedBytes: committedBytesRef.current, // exact byte offset
}).catch(console.error);
```
This runs after every batch of 3 chunks, so IDB is always at most one batch behind.

**3. Restore from IDB on page-refresh resume**
```ts
// Refs are 0/empty after page refresh — restore from IDB
if (committedBytesRef.current === 0 && (state?.committedBytes ?? 0) > 0) {
  committedBytesRef.current = state.committedBytes;
}
if (uploadedPartsRef.current.length === 0 && state?.uploadedParts?.length > 0) {
  uploadedPartsRef.current = state.uploadedParts;
}
```
Only restores when the in-memory values are empty (i.e., after a page refresh). If we're just pausing/resuming within the same session, the in-memory values are used as-is.

**4. Backend remains authoritative, IDB is fallback**
```ts
uploadedPartsRef.current = (uploadedParts?.length > 0 ? uploadedParts : uploadedPartsRef.current);
```
The `/resume` call still queries S3 `ListParts` (most accurate source). If the backend returns a valid `uploadedParts` list, it's used. If it returns nothing (server unavailable, etc.), the IDB-restored list is kept.

### End-to-end flow after page refresh

```
1. User uploads 3/10 chunks → IDB: { uploadId, fileKey, uploadedParts: [1,2,3], committedBytes: 30MB }
2. User pauses → uploadState = 'paused'
3. User refreshes page → all React state/refs reset to zero
4. User re-adds same file → fileId = "filename-size" (same key)
5. User clicks Upload → startAndUpload(false)
6. getUploadState(fileId) → finds IDB record ✓
7. isResume = true (auto-resume triggered)
8. committedBytesRef restored to 30MB from IDB ✓
9. uploadedPartsRef restored to [parts 1,2,3] from IDB ✓
10. Progress bar shows 30% immediately ✓
11. /resume called → backend queries S3 ListParts → confirms parts 1,2,3 done
12. missingParts = [4,5,6,7,8,9,10] → only these are uploaded
13. Upload continues from part 4 (byte 30MB) ✓
```

---

## Problem 4 — Resume After Page Refresh Still Re-uploads Entire File

### What was happening
Even after Problem 3's IDB fix (saving `uploadedParts` + `committedBytes` after each batch), a page refresh followed by re-uploading the same file would still re-upload everything from byte 0.

### Root cause
The IDB restore correctly populated `uploadedPartsRef` and `committedBytesRef` before the `/resume` call. However, **`partsList` was still set directly from the backend's `missingParts`** without any cross-referencing:

```ts
partsList = missingParts || [];  // ← used as-is from backend
```

If the backend (Render.com free-tier, sleeps after inactivity) returns all parts as missing — even though parts 1, 2, 3 are confirmed in S3 and in IDB — then `partsList` contains all parts and the entire file is re-uploaded. The IDB state was being restored for visual display only, but had no effect on which parts were actually uploaded.

### Fix — Cross-reference backend `missingParts` against local confirmed list

After receiving the `/resume` response, the backend's missing list is filtered against our locally confirmed parts (from IDB or in-memory):

```ts
// Merge: take whichever source has MORE confirmed parts
const backendDone = uploadedParts?.length > 0 ? uploadedParts : [];
const localDone = uploadedPartsRef.current;  // restored from IDB
const confirmedParts = backendDone.length >= localDone.length ? backendDone : localDone;
uploadedPartsRef.current = confirmedParts;

// Skip parts the backend calls "missing" but we already know are done
const doneset = new Set(confirmedParts.map((p) => p.PartNumber));
partsList = (missingParts || []).filter((p: any) => !doneset.has(p.partNumber));
```

**Why this is safe**: A part is only added to `uploadedPartsRef` when XHR returns a confirmed ETag from S3. If `handleAbort` (Cancel) is called, `clearUploadState` removes the IDB record entirely — so stale ETags from a genuinely aborted upload can never interfere.

### How both sources are compared

| Scenario | `backendDone` | `localDone` (IDB) | `confirmedParts` | `partsList` |
|---|---|---|---|---|
| Backend working correctly | `[1,2,3]` | `[1,2,3]` | `[1,2,3]` (backend wins, equal) | `[4..10]` |
| Backend broken / sleeping | `[]` | `[1,2,3]` | `[1,2,3]` (local wins, more) | `[4..10]` |
| Page refresh, no prior IDB | `[1,2,3]` | `[]` | `[1,2,3]` (backend wins, more) | `[4..10]` |

In all three cases the result is the same: only truly missing parts are uploaded.

---

## IDB Store Reference

| Key | Value fields |
|---|---|
| `"${file.name}-${file.size}"` | `uploadId`, `fileKey`, `uploadedParts[]`, `committedBytes` |

- **Written**: once on fresh upload start, then after every completed batch
- **Read**: at the beginning of every `startAndUpload` call
- **Cleared**: on successful upload completion and on manual cancel (handleAbort)

---

## Files Changed

| File | Changes |
|---|---|
| `src/components/multipartUpload.tsx` | XHR helpers, live progress state/refs, resume fixes, IDB improvements, cross-reference deduplication |
| `stream.md` | This file — created and updated after every change |

No other files were modified.

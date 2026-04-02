import { useState, useRef } from 'react';
import { FilePond } from 'react-filepond';
import { openDB } from 'idb';
import axios from 'axios';
import 'filepond/dist/filepond.min.css';

const DB_NAME = 'UploadProgressDB';
const STORE_NAME = 'uploads';

async function initDB() {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    },
  });
}

async function saveUploadState(fileId: string, state: any) {
  const db = await initDB();
  await db.put(STORE_NAME, state, fileId);
}

async function getUploadState(fileId: string) {
  const db = await initDB();
  return db.get(STORE_NAME, fileId);
}

async function clearUploadState(fileId: string) {
  const db = await initDB();
  await db.delete(STORE_NAME, fileId);
}

function getFileId(file: File) {
  return `${file.name}-${file.size}`;
}

const API_BASE_URL = 'https://s3-multipart-upload.onrender.com/multipart';
type UploadState = 'idle' | 'uploading' | 'paused' | 'done' | 'error';
const MB = 1024 * 1024;
const GB = 1024 * MB;
const CONCURRENCY = 3;  // upload 3 chunks at a time
const MAX_RETRIES = 3;  // retry failed chunks up to 3 times

function getOptimalPartSize(fileSize: number): number {
  if (fileSize <= 100 * MB) return 10 * MB;
  if (fileSize <= 1 * GB) return 100 * MB;
  if (fileSize <= 5 * GB) return 500 * MB;
  return 1 * GB;
}

// Retry wrapper
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries: number = MAX_RETRIES
): Promise<Response> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (attempt === retries) throw new Error(`Request failed with status ${res.status}`);
    } catch (err: any) {
      if (err.name === 'AbortError') throw err; // don't retry aborts
      if (attempt === retries) throw err;
    }
    await new Promise(r => setTimeout(r, 1000 * attempt)); // 1s, 2s, 3s backoff
  }
  throw new Error('Unreachable');
}

// Axios-based chunk uploader — gives real per-byte progress via onUploadProgress
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
      onProgress(0); // reset this chunk's progress on retry
      await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error('Unreachable');
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}

export function FilePondUploader() {
  const [files, setFiles] = useState<any[]>([]);
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progressPercent, setProgressPercent] = useState(0);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');
  const [completedFile, setCompletedFile] = useState<any>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const committedBytesRef = useRef(0);
  const chunkProgressRef = useRef<Map<number, number>>(new Map());
  const uploadIdRef = useRef('');
  const fileKeyRef = useRef('');
  const uploadedPartsRef = useRef<{ PartNumber: number; ETag: string }[]>([]);

  const startAndUpload = async (isResume = false) => {
    if (files.length === 0) return;
    const file: File = files[0].file;
    const fileId = getFileId(file);
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setUploadState('uploading');
    setErrorMessage('');

    try {
      const partSize = getOptimalPartSize(file.size);
      const totalParts = Math.ceil(file.size / partSize);
      let partsList: any[] = [];

      // Check IndexedDB for existing upload state
      const state = await getUploadState(fileId);

      // Auto-resume if state found and not explicitly starting fresh
      if (!isResume && state) {
        console.log("Found existing upload state in IndexedDB, auto-resuming...");
        isResume = true;
      }

      setTotalBytes(file.size);

      if (!isResume) {
        setProgressPercent(0);
        setUploadedBytes(0);
        committedBytesRef.current = 0;
        chunkProgressRef.current.clear();
        uploadedPartsRef.current = []; // reset for entirely new upload

        // Step 1: Start
        const startRes = await fetchWithRetry(`${API_BASE_URL}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || 'application/octet-stream',
            fileSize: file.size,
            type: file.type ? file.type.split('/')[0] : 'file',
          }),
          signal: abortController.signal,
        });
        const startData = await startRes.json();
        uploadIdRef.current = startData.uploadId;
        fileKeyRef.current = startData.fileKey;

        // Persist uploadId + fileKey to IDB so resume can identify this upload after a page refresh
        await saveUploadState(fileId, {
          uploadId: uploadIdRef.current,
          fileKey: fileKeyRef.current,
          committedBytes: 0,
        });

        // Step 2: Get URLs
        const urlsRes = await fetchWithRetry(`${API_BASE_URL}/urls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: uploadIdRef.current,
            fileKey: fileKeyRef.current,
            partsCount: totalParts,
          }),
          signal: abortController.signal,
        });
        const { parts } = await urlsRes.json();
        partsList = parts;
      } else {
        // Resume uploading
        if (!uploadIdRef.current && state) {
          uploadIdRef.current = state.uploadId;
          fileKeyRef.current = state.fileKey;
        }

        // After a page refresh, refs are zero — restore from IDB so we don't lose progress
        if (committedBytesRef.current === 0 && (state?.committedBytes ?? 0) > 0) {
          committedBytesRef.current = state.committedBytes;
        }
        // Show restored progress immediately before the /resume network round-trip
        chunkProgressRef.current.clear();
        if (committedBytesRef.current > 0) {
          setProgressPercent(Math.min(Math.round((committedBytesRef.current / file.size) * 100), 100));
          setUploadedBytes(Math.min(committedBytesRef.current, file.size));
        }

        const resumeRes = await fetchWithRetry(`${API_BASE_URL}/resume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uploadId: uploadIdRef.current,
            fileKey: fileKeyRef.current,
            partsCount: totalParts,
          }),
          signal: abortController.signal,
        });
        const resumeData = await resumeRes.json();

        const { missingParts, uploadedParts } = resumeData;

        uploadedPartsRef.current = uploadedParts ?? [];
        partsList = missingParts ?? [];
      }

      // Step 3: Upload Chunks (parallel with concurrency limit + live byte progress via Axios)
      if (isResume) committedBytesRef.current = (totalParts - partsList.length) * partSize;
      chunkProgressRef.current.clear();
      if (isResume) {
        setProgressPercent(Math.min(Math.round((committedBytesRef.current / file.size) * 100), 100));
        setUploadedBytes(Math.min(committedBytesRef.current, file.size));
      }

      for (let i = 0; i < partsList.length; i += CONCURRENCY) {
        const batch = partsList.slice(i, i + CONCURRENCY);

        const results = await Promise.all(
          batch.map(async (part: any) => {
            // Use partNumber to accurately slice chunks even when resuming
            const idx = part.partNumber - 1;
            const startByte = idx * partSize;
            const endByte = Math.min(startByte + partSize, file.size);
            const chunk = file.slice(startByte, endByte);

            chunkProgressRef.current.set(part.partNumber, 0);

            const etag = await axiosUploadChunk(
              part.url,
              chunk,
              abortController.signal,
              (loaded: number) => {
                chunkProgressRef.current.set(part.partNumber, loaded);
                const inFlight = Array.from(chunkProgressRef.current.values()).reduce((a, b) => a + b, 0);
                const total = committedBytesRef.current + inFlight;
                setUploadedBytes(Math.min(total, file.size));
                setProgressPercent(Math.min(Math.round((total / file.size) * 100), 100));
              }
            );

            // Move this chunk's bytes from in-flight to committed
            committedBytesRef.current += chunk.size;
            chunkProgressRef.current.delete(part.partNumber);
            // Explicitly sync display after chunk completion (covers the gap between last progress event and next batch)
            setUploadedBytes(Math.min(committedBytesRef.current, file.size));
            setProgressPercent(Math.min(Math.round((committedBytesRef.current / file.size) * 100), 100));

            return { PartNumber: part.partNumber, ETag: etag };
          })
        );
        uploadedPartsRef.current.push(...results);
        // Persist progress after every batch so a page refresh can show restored progress immediately
        saveUploadState(fileId, {
          uploadId: uploadIdRef.current,
          fileKey: fileKeyRef.current,
          committedBytes: committedBytesRef.current,
        }).catch(console.error);
      }

      // Step 4: Complete
      const completeRes = await fetchWithRetry(`${API_BASE_URL}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: uploadIdRef.current,
          fileKey: fileKeyRef.current,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream',
          type: file.type ? file.type.split('/')[0] : 'file',
          // Backend expects sorted parts array
          parts: uploadedPartsRef.current.sort((a, b) => a.PartNumber - b.PartNumber),
        }),
        signal: abortController.signal,
      });

      const completeData = await completeRes.json();
      setCompletedFile(completeData.file);
      setUploadState('done');

      // Cleanup IDB after successful upload
      await clearUploadState(fileId);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Assume paused intentionally by user
        setUploadState('paused');
      } else {
        setErrorMessage(err.message || 'Upload failed');
        setUploadState('error');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handlePause = () => abortControllerRef.current?.abort();

  const handleAbort = async () => {
    // If it's still uploading, stop it
    abortControllerRef.current?.abort();
    if (uploadIdRef.current && fileKeyRef.current) {
      fetch(`${API_BASE_URL}/abort`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId: uploadIdRef.current, fileKey: fileKeyRef.current }),
      }).catch(console.error);
    }

    // Clear IDB state since we are manually aborting
    if (files.length > 0) {
      await clearUploadState(getFileId(files[0].file));
    }

    // Deep wipe everything
    uploadIdRef.current = '';
    fileKeyRef.current = '';
    uploadedPartsRef.current = [];
    committedBytesRef.current = 0;
    chunkProgressRef.current.clear();
    setUploadState('idle');
    setCompletedFile(null);
    setProgressPercent(0);
    setUploadedBytes(0);
    setTotalBytes(0);
    setFiles([]); // Clear FilePond
  };

  const handleDownload = async () => {
    if (!completedFile?.id) return;
    try {
      const response = await fetch(`${API_BASE_URL}/${completedFile.id}/download`);
      if (!response.ok) throw new Error('Download failed');

      // Parse the response to extract the presigned download URL
      const dataText = await response.text();
      let downloadUrl = '';

      try {
        const dataJson = JSON.parse(dataText);
        downloadUrl = dataJson.url || dataJson.downloadUrl || dataJson.presignedUrl;
      } catch (e) {
        // Fallback if the backend returned the URL as plain text
        downloadUrl = dataText.replace(/['"]/g, '').trim();
      }

      if (!downloadUrl || !downloadUrl.startsWith('http')) {
        throw new Error('Invalid download URL received from server');
      }

      // Fetch the actual file content from the presigned URL
      const fileResponse = await fetch(downloadUrl);
      if (!fileResponse.ok) throw new Error('Failed to fetch file content');

      // Convert the actual file response into a Blob
      const blob = await fileResponse.blob();

      // Create a temporary local URL for the Blob
      const url = window.URL.createObjectURL(blob);

      // Create a hidden anchor tag to trigger the Native browser download
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      // Use the original filename received from the backend
      a.download = completedFile.name || 'downloaded_file';

      document.body.appendChild(a);
      a.click();

      // Clean up the DOM and memory
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download file', err);
      alert('Failed to download file securely');
    }
  };

  const handleDelete = async () => {
    if (!completedFile?.id) return;
    try {
      await fetch(`${API_BASE_URL}/${completedFile.id}`, { method: 'DELETE' });
      setUploadState('idle');
      setCompletedFile(null);
      setFiles([]); // Clear FilePond UI
    } catch (err) {
      console.error('Failed to delete', err);
      alert('Failed to delete file');
    }
  };

  const isUploading = uploadState === 'uploading';
  const isPaused = uploadState === 'paused';
  const isDone = uploadState === 'done';
  const isError = uploadState === 'error';
  const isTooSmall = files.length > 0 && files[0].file.size <= 5 * MB;

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto', fontFamily: 'sans-serif' }}>
      <h2>Multipart Upload to S3</h2>
      <FilePond files={files} onupdatefiles={setFiles} allowMultiple={false} maxFiles={1} server={null} />

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {uploadState === 'idle' && (
          <button onClick={() => startAndUpload(false)} disabled={files.length === 0 || isTooSmall}>
            Upload
          </button>
        )}

        {isUploading && (
          <button onClick={handlePause}>Pause Upload</button>
        )}

        {(isPaused || isError) && (
          <>
            <button onClick={() => startAndUpload(true)}>Resume Upload</button>
            <button onClick={handleAbort} style={{ backgroundColor: '#dc3545', color: '#fff', border: 'none', padding: '0 1rem', borderRadius: '4px' }}>
              Cancel Upload
            </button>
          </>
        )}

        {isDone && (
          <>
            <button onClick={handleDownload} style={{ backgroundColor: '#28a745', color: '#fff', border: 'none', padding: '0 1rem', borderRadius: '4px' }}>
              Download
            </button>
            <button onClick={handleDelete} style={{ backgroundColor: '#dc3545', color: '#fff', border: 'none', padding: '0 1rem', borderRadius: '4px' }}>
              Delete File
            </button>
          </>
        )}
      </div>

      {isTooSmall && <div style={{ color: 'red', marginTop: '10px' }}>✗ File must be larger than 5 MB</div>}
      {isUploading && (
        <div style={{ marginTop: '10px' }}>
          <div>Uploading… {progressPercent}%</div>
          <div style={{ fontSize: '12px', color: '#555', marginTop: '4px' }}>
            {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
          </div>
          <div style={{ marginTop: '6px', height: '6px', background: '#eee', borderRadius: '3px' }}>
            <div style={{ width: `${progressPercent}%`, height: '100%', background: '#4a90e2', borderRadius: '3px', transition: 'width 0.15s ease' }} />
          </div>
        </div>
      )}
      {isDone && <div style={{ color: 'green', marginTop: '10px' }}>✓ Upload complete</div>}
      {isPaused && (
        <div style={{ color: 'orange', marginTop: '10px' }}>
          ⏸ Paused at {progressPercent}% — {formatBytes(uploadedBytes)} / {formatBytes(totalBytes)}
        </div>
      )}
      {isError && <div style={{ color: 'red', marginTop: '10px' }}>✗ {errorMessage}</div>}
    </div>
  );
}
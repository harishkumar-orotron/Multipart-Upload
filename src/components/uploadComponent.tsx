// Upload on button click (not auto-upload on file add)

// 'use client'

// import { useState, useEffect } from 'react'
// import { FilePond, registerPlugin } from 'react-filepond'
// import 'filepond/dist/filepond.min.css'

// import FilePondPluginImagePreview from 'filepond-plugin-image-preview'
// import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css'

// import { getToken } from '../lib/auth'

// registerPlugin(FilePondPluginImagePreview)

// const STORAGE_KEY = 'uploaded_files'

// type UploadedFile = {
//   fileName: string
//   downloadUrl: string
//   originalDocPath: string
//   status: string
//   uploadedAt: string
// }

// const downloadFile = async (url: string, filename: string) => {
//   const response = await fetch(url)
//   const blob = await response.blob()
//   console.log(blob)

//   const link = document.createElement('a')
//   link.href = URL.createObjectURL(blob)
//   link.download = filename
//   console.log(link.href)
//   console.log(link)
//   console.log(link.download)

//   document.body.appendChild(link)
//   link.click()
//   document.body.removeChild(link)
//   URL.revokeObjectURL(link.href)
// }

// export default function UploadComponent() {
//   const [files, setFiles] = useState<any[]>([])
//   const [uploading, setUploading] = useState(false)

//   // Load from localStorage on first render
//   const [responses, setResponses] = useState<UploadedFile[]>(() => {
//     try {
//       const saved = localStorage.getItem(STORAGE_KEY)
//       return saved ? JSON.parse(saved) : []
//     } catch {
//       return []
//     }
//   })

//   // Save to localStorage whenever list changes
//   useEffect(() => {
//     localStorage.setItem(STORAGE_KEY, JSON.stringify(responses))
//   }, [responses])

//   const handleUpload = async () => {
//     if (files.length === 0) return
//     setUploading(true)

//     for (const fileItem of files) {
//       const file: File = fileItem.file
//       const fileName = file.name

//       try {
//         // STEP 1: Get pre-signed URLs from API
//         const res = await fetch(
//           'https://v2-dev-api.esigns.io/staging/v1.0/documents-templates/processed-files',
//           {
//             method: 'POST',
//             headers: {
//               'Content-Type': 'application/json',
//               'Authorization': getToken() ?? '',
//             },
//             body: JSON.stringify({
//               attachments: false,
//               filenames: [fileName],
//               merge_filename: false,
//               files_state: "files_converted_to_pdf"
//             }),
//           }
//         )

//         const result = await res.json()
//         console.log("FULL API RESPONSE:", result)

//         if (!result.success) throw new Error(result.message)

//         const uploadUrl = result.data.upload_urls?.[0]
//         const downloadUrl = result.data.download_urls?.[0]
//         const originalDocPath = result.data.original_doc_paths?.[0] ?? ''

//         if (!uploadUrl) throw new Error("Upload URL missing")

//         // STEP 2: Upload file to S3
//         const uploadRes = await fetch(uploadUrl, {
//           method: 'PUT',
//           headers: { 'Content-Type': file.type },
//           body: file,
//         })

//         if (!uploadRes.ok) throw new Error("S3 upload failed")

//         setResponses((prev) => [
//           { fileName, downloadUrl, originalDocPath, status: 'Uploaded', uploadedAt: new Date().toLocaleString() },
//           ...prev,
//         ])
//       } catch (err: any) {
//         setResponses((prev) => [
//           { fileName, downloadUrl: '', originalDocPath: '', status: err.message, uploadedAt: new Date().toLocaleString() },
//           ...prev,
//         ])
//       }
//     }

//     setUploading(false)
//   }

//   const handleDownload = async (item: UploadedFile) => {
//     try {
//       await downloadFile(item.downloadUrl, item.fileName)
//     } catch (err: any) {
//       alert(`Download failed: ${err.message}`)
//     }
//   }

//   const handleClear = () => {
//     localStorage.removeItem(STORAGE_KEY)
//     setResponses([])
//   }

//   return (
//     <div>
//       <FilePond
//         files={files}
//         onupdatefiles={setFiles}
//         allowMultiple={true}
//         server={null}
//         name="files"
//       />

//       <button
//         onClick={handleUpload}
//         disabled={uploading || files.length === 0}
//         style={{
//           marginTop: '10px',
//           padding: '8px 20px',
//           backgroundColor: uploading || files.length === 0 ? '#aaa' : '#4a90e2',
//           color: '#fff',
//           border: 'none',
//           borderRadius: '4px',
//           cursor: uploading || files.length === 0 ? 'not-allowed' : 'pointer',
//         }}
//       >
//         {uploading ? 'Uploading...' : 'Upload'}
//       </button>

//       {responses.length > 0 && (
//         <div style={{ marginTop: '20px' }}>
//           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
//             <h3>Uploaded Files:</h3>
//             <button
//               onClick={handleClear}
//               style={{ fontSize: '12px', color: '#e00', background: 'none', border: 'none', cursor: 'pointer' }}
//             >
//               Clear All
//             </button>
//           </div>

//           {responses.map((item, index) => {
//             return (
//               <div key={index} style={{ marginBottom: '12px', padding: '8px', border: '1px solid #eee', borderRadius: '4px' }}>
//                 <strong>{item.fileName}</strong>
//                 <div style={{ fontSize: '12px', color: '#888' }}>{item.uploadedAt}</div>
//                 <div>Status: {item.status}</div>
//                 {item.downloadUrl && (
//                   <button
//                     onClick={() => handleDownload(item)}
//                     style={{
//                       marginTop: '6px',
//                       padding: '4px 12px',
//                       backgroundColor: '#4a90e2',
//                       color: '#fff',
//                       border: 'none',
//                       borderRadius: '4px',
//                       cursor: 'pointer',
//                       fontSize: '13px',
//                     }}
//                   >
//                     Download
//                   </button>
//                 )}
//               </div>
//             )
//           })}
//         </div>
//       )}
//     </div>
//   )
// }



// import { useState } from 'react'
// import { getToken } from '../lib/auth'

// const downloadFile = async (url: string, filename: string) => {
//   const response = await fetch(url)
//   if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`)

//   const blob = await response.blob()
//   const objectUrl = URL.createObjectURL(blob)

//   const link = document.createElement('a')
//   link.href = objectUrl
//   link.download = filename
//   document.body.appendChild(link)
//   link.click()
//   document.body.removeChild(link)

//   setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
// }

// export default function UploadComponent() {
//   const [docPath, setDocPath] = useState('')
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState('')

//   const handleDownload = async () => {
//     if (!docPath.trim()) return
//     setLoading(true)
//     setError('')

//     try {
//       // STEP 1: Generate fresh download URL using originalDocPath
//       const res = await fetch(
//         'https://v2-dev-api.esigns.io/staging/v1.0/documents-templates/download-urls',
//         {
//           method: 'POST',
//           headers: {
//             'Content-Type': 'application/json',
//             'Authorization': getToken() ?? '',
//           },
//           body: JSON.stringify({ paths: [docPath.trim()] }),
//         }
//       )

//       const result = await res.json()
//       if (!result.success) throw new Error(result.message)
//         console.log(result)

//       const freshUrl = result.data?.download_urls?.[0]
//       if (!freshUrl) throw new Error('No download URL returned')

//       // STEP 2: Get correct filename from response path
//       const filename = result.data?.paths?.[0]?.split('/').pop() ?? docPath.split('/').pop() ?? 'download'

//       // STEP 3: Force download using blob
//       await downloadFile(freshUrl, filename)
//     } catch (err: any) {
//       setError(err.message)
//     } finally {
//       setLoading(false)
//     }
//   }

//   return (
//     <div style={{ maxWidth: 600, margin: '40px auto', padding: '0 16px' }}>
//       <h3>Download File</h3>

//       <textarea
//         value={docPath}
//         onChange={(e) => setDocPath(e.target.value)}
//         placeholder="Paste originalDocPath here e.g. unknown_company/company_docs/..."
//         rows={3}
//         style={{
//           width: '100%',
//           padding: '10px 12px',
//           borderRadius: 4,
//           border: '1px solid #ccc',
//           fontSize: 13,
//           resize: 'vertical',
//           boxSizing: 'border-box',
//         }}
//       />

//       {error && <div style={{ color: 'red', fontSize: 13, marginTop: 6 }}>{error}</div>}

//       <button
//         onClick={handleDownload}
//         disabled={loading || !docPath.trim()}
//         style={{
//           marginTop: 10,
//           padding: '8px 20px',
//           backgroundColor: loading || !docPath.trim() ? '#aaa' : '#28a745',
//           color: '#fff',
//           border: 'none',
//           borderRadius: 4,
//           cursor: loading || !docPath.trim() ? 'not-allowed' : 'pointer',
//           fontSize: 14,
//         }}
//       >
//         {loading ? 'Downloading...' : 'Download'}
//       </button>
//     </div>
//   )
// }


// ─── Full upload + download implementation (kept for reference) ───────────────
// import { useState, useEffect } from 'react'
// import { FilePond, registerPlugin } from 'react-filepond'
// ... full implementation commented out to avoid duplicate identifier errors


// https://esignprod-kf.s3.us-east-1.amazonaws.com/unknown_company
// /company_docs/processed_documents/3f074dae-0733-4232-83ba-be0a76f4a781_
// leaseaggrement.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-
// Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA3XGALYHYNW3H473L%2F20260322%2Fus
// -east-1%2Fs3%2Faws4_request&X-Amz-Date=20260322T094043Z&X-
// Amz-Expires=36000&X-Amz-Signature=19676a217d89736d8cba191b953f924a2c75c8ac8d0592c21511
// f1d1dc100b12&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-
// id=GetObject





// {
//     "success": true,
//     "message": "Upload and Download presignedURLs generated successfully",
//     "data": {
//         "upload_urls": [
//             "https://esignprod-kf.s3.us-east-1.amazonaws.com/unknown_company/company_docs/processed_documents/4e9559bd-7fd4-4d89-a878-9194ecc346d9_contract_rental_agreement.docx?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA3XGALYHYNW3H473L%2F20260323%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260323T054314Z&X-Amz-Expires=36000&X-Amz-Signature=9150afd64ccd47588cb7824c8caf4c3b324a43e0804944f56de3b246cd589c91&X-Amz-SignedHeaders=host&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject"
//         ],
//         "download_urls": [
//             "https://esignprod-kf.s3.us-east-1.amazonaws.com/unknown_company/company_docs/processed_documents/4e9559bd-7fd4-4d89-a878-9194ecc346d9_contract_rental_agreement.docx?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA3XGALYHYNW3H473L%2F20260323%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260323T054314Z&X-Amz-Expires=36000&X-Amz-Signature=aed0d8ebb0dcf8da20e908d060b287c671ee23e36b8f8ae9e8b39f8470eff66b&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject"
//         ],
//         "doc_paths": [
//             "unknown_company/company_docs/processed_documents/company-documents-v2/34a5c164-36bf-4113-936d-1d12193b7486_contract_rental_agreement.pdf"
//         ],
//         "original_doc_paths": [
//             "unknown_company/company_docs/processed_documents/4e9559bd-7fd4-4d89-a878-9194ecc346d9_contract_rental_agreement.docx"
//         ],
//         "converted_upload_urls": [
//             "https://esignprod-kf.s3.us-east-1.amazonaws.com/unknown_company/company_docs/processed_documents/company-documents-v2/34a5c164-36bf-4113-936d-1d12193b7486_contract_rental_agreement.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA3XGALYHYNW3H473L%2F20260323%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260323T054314Z&X-Amz-Expires=36000&X-Amz-Signature=dfa364ec7bc30137abd6e6f74d5cafd501b9986b6ced4dd7af211f73399b182d&X-Amz-SignedHeaders=host&x-amz-checksum-crc32=AAAAAA%3D%3D&x-amz-sdk-checksum-algorithm=CRC32&x-id=PutObject"
//         ],
//         "converted_download_urls": [
//             "https://esignprod-kf.s3.us-east-1.amazonaws.com/unknown_company/company_docs/processed_documents/company-documents-v2/34a5c164-36bf-4113-936d-1d12193b7486_contract_rental_agreement.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=AKIA3XGALYHYNW3H473L%2F20260323%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20260323T054314Z&X-Amz-Expires=36000&X-Amz-Signature=0d904486c714ed31f9fda6e254ecb54994be1e8a2821da5784bfafe2417d3c9b&X-Amz-SignedHeaders=host&x-amz-checksum-mode=ENABLED&x-id=GetObject"
//         ]
//     }
// }



import { useState, useEffect } from 'react'
import { FilePond, registerPlugin } from 'react-filepond'
import 'filepond/dist/filepond.min.css'
import FilePondPluginImagePreview from 'filepond-plugin-image-preview'
import 'filepond-plugin-image-preview/dist/filepond-plugin-image-preview.css'
import { getToken } from '../lib/auth'

registerPlugin(FilePondPluginImagePreview)

const STORAGE_KEY = 'uploaded_files'

type UploadedFile = {
  fileName: string
  originalDocPath: string
  uploadedAt: string
}

type UploadStatus = 'idle' | 'uploading' | 'done' | 'error'
type DownloadStatus = 'idle' | 'downloading' | 'done' | 'error'

const blobDownload = async (url: string, filename: string) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
}

export default function UploadComponent() {
  const [pondFiles, setPondFiles] = useState<any[]>([])
  const [uploadStatus, setUploadStatus] = useState<Record<string, UploadStatus>>({})
  const [selectedPond, setSelectedPond] = useState<Set<string>>(new Set())

  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [selectedUploaded, setSelectedUploaded] = useState<Set<number>>(new Set())
  const [downloadStatus, setDownloadStatus] = useState<Record<number, DownloadStatus>>({})

  // Persist uploaded files to localStorage on every change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(uploadedFiles))
  }, [uploadedFiles])

  // ─── Upload ─────────────────────────────────────────────────────────────────

  const uploadSingle = async (fileItem: any) => {
    const file: File = fileItem.file
    const name = file.name

    setUploadStatus(prev => ({ ...prev, [name]: 'uploading' }))

    try {
      // STEP 1: Get pre-signed URL from API 1
      const res = await fetch(
        'https://v2-dev-api.esigns.io/staging/v1.0/documents-templates/processed-files',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: getToken() ?? '' },
          body: JSON.stringify({
            attachments: false,
            filenames: [name],
            merge_filename: false,
            files_state: 'files_converted_to_pdf',
          }),
        }
      )
      const result = await res.json()
      if (!result.success) throw new Error(result.message)

      const uploadUrl = result.data.upload_urls?.[0]
      const originalDocPath = result.data.original_doc_paths?.[0]
      if (!uploadUrl) throw new Error('Upload URL missing')

      // STEP 2: PUT file directly to S3
      const putRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      if (!putRes.ok) throw new Error('S3 upload failed')

      // STEP 3: Save only the path (not the expiring URL) to localStorage
      setUploadedFiles(prev => [
        { fileName: name, originalDocPath, uploadedAt: new Date().toLocaleString() },
        ...prev,
      ])
      setUploadStatus(prev => ({ ...prev, [name]: 'done' }))
    } catch {
      setUploadStatus(prev => ({ ...prev, [name]: 'error' }))
    }
  }

  const handleUploadSelected = async () => {
    const items = pondFiles.filter(f => selectedPond.has(f.file.name))
    if (items.length === 0) return

    // Mark all selected files as uploading
    setUploadStatus(prev => {
      const next = { ...prev }
      items.forEach(f => { next[f.file.name] = 'uploading' })
      return next
    })

    try {
      // STEP 1: Single API call with ALL selected filenames
      const res = await fetch(
        'https://v2-dev-api.esigns.io/staging/v1.0/documents-templates/processed-files',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: getToken() ?? '' },
          body: JSON.stringify({
            attachments: false,
            filenames: items.map(f => f.file.name),
            merge_filename: false,
            files_state: 'files_converted_to_pdf',
          }),
        }
      )
      const result = await res.json()
      if (!result.success) throw new Error(result.message)

      // STEP 2: PUT all files to S3 in parallel using their indexed URLs
      await Promise.all(
        items.map(async (fileItem, i) => {
          const file: File = fileItem.file
          const uploadUrl = result.data.upload_urls?.[i]
          const originalDocPath = result.data.original_doc_paths?.[i]
          if (!uploadUrl) throw new Error(`Upload URL missing for ${file.name}`)

          const putRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file,
          })
          if (!putRes.ok) throw new Error(`S3 upload failed for ${file.name}`)

          setUploadedFiles(prev => [
            { fileName: file.name, originalDocPath, uploadedAt: new Date().toLocaleString() },
            ...prev,
          ])
          setUploadStatus(prev => ({ ...prev, [file.name]: 'done' }))
        })
      )
    } catch {
      setUploadStatus(prev => {
        const next = { ...prev }
        items.forEach(f => { next[f.file.name] = 'error' })
        return next
      })
    }
  }

  // ─── Download ────────────────────────────────────────────────────────────────

  const downloadSingle = async (item: UploadedFile, index: number) => {
    setDownloadStatus(prev => ({ ...prev, [index]: 'downloading' }))

    try {
      // STEP 1: Call API 2 with stored path to get a fresh (non-expired) download URL
      const res = await fetch(
        'https://v2-dev-api.esigns.io/staging/v1.0/documents-templates/download-urls',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: getToken() ?? '' },
          body: JSON.stringify({ paths: [item.originalDocPath] }),
        }
      )
      const result = await res.json()
      if (!result.success) throw new Error(result.message)

      const freshUrl = result.data?.download_urls?.[0]
      if (!freshUrl) throw new Error('No download URL returned')

      // STEP 2: Blob download — stays on same page, no navigation
      await blobDownload(freshUrl, item.fileName)
      setDownloadStatus(prev => ({ ...prev, [index]: 'done' }))
    } catch (err: any) {
      setDownloadStatus(prev => ({ ...prev, [index]: 'error' }))
      alert(`Download failed: ${err.message}`)
    }
  }

  const handleDownloadSelected = async () => {
    const items = [...selectedUploaded].map(i => ({ item: uploadedFiles[i], index: i }))
    if (items.length === 0) return

    // Mark all selected as downloading
    setDownloadStatus(prev => {
      const next = { ...prev }
      items.forEach(({ index }) => { next[index] = 'downloading' })
      return next
    })

    try {
      // STEP 1: Single API call with ALL selected paths
      const res = await fetch(
        'https://v2-dev-api.esigns.io/staging/v1.0/documents-templates/download-urls',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: getToken() ?? '' },
          body: JSON.stringify({ paths: items.map(({ item }) => item.originalDocPath) }),
        }
      )
      const result = await res.json()
      if (!result.success) throw new Error(result.message)

      // STEP 2: Blob-download all files in parallel using indexed URLs
      await Promise.all(
        items.map(async ({ item, index }, i) => {
          const freshUrl = result.data?.download_urls?.[i]
          if (!freshUrl) throw new Error(`No download URL for ${item.fileName}`)

          await blobDownload(freshUrl, item.fileName)
          setDownloadStatus(prev => ({ ...prev, [index]: 'done' }))
        })
      )
    } catch {
      setDownloadStatus(prev => {
        const next = { ...prev }
        items.forEach(({ index }) => { next[index] = 'error' })
        return next
      })
    }
  }

  // ─── Select All helpers ──────────────────────────────────────────────────────

  const allPondSelected =
    pondFiles.length > 0 && pondFiles.every(f => selectedPond.has(f.file.name))

  const toggleSelectAllPond = () => {
    if (allPondSelected) {
      setSelectedPond(new Set())
    } else {
      setSelectedPond(new Set(pondFiles.map(f => f.file.name)))
    }
  }

  const allUploadedSelected =
    uploadedFiles.length > 0 && uploadedFiles.every((_, i) => selectedUploaded.has(i))

  const toggleSelectAllUploaded = () => {
    if (allUploadedSelected) {
      setSelectedUploaded(new Set())
    } else {
      setSelectedUploaded(new Set(uploadedFiles.map((_, i) => i)))
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: 700, margin: '0 auto', padding: '0 16px 40px' }}>
      {/* FilePond drop zone */}
      <FilePond
        files={pondFiles}
        onupdatefiles={setPondFiles}
        allowMultiple={true}
        server={null}
        name="files"
        labelIdle='Drag & Drop your files or <span class="filepond--label-action">Browse</span>'
      />

      {/* ── Files pending upload ── */}
      {pondFiles.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={sectionHeaderStyle}>
            <label style={checkLabelStyle}>
              <input type="checkbox" checked={allPondSelected} onChange={toggleSelectAllPond} />
              Select All ({pondFiles.length})
            </label>
            <button
              onClick={handleUploadSelected}
              disabled={selectedPond.size === 0}
              style={btn(selectedPond.size > 0, '#4a90e2')}
            >
              Upload Selected ({selectedPond.size})
            </button>
          </div>

          {pondFiles.map((fileItem, i) => {
            const name: string = fileItem.file.name
            const status = uploadStatus[name] ?? 'idle'
            const checked = selectedPond.has(name)
            return (
              <div key={i} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selectedPond)
                    checked ? next.delete(name) : next.add(name)
                    setSelectedPond(next)
                  }}
                />
                <span style={fileNameStyle}>{name}</span>
                <span style={{ fontSize: 12, color: statusColor(status), minWidth: 80, textAlign: 'right' }}>
                  {status === 'uploading' ? 'Uploading...' : status === 'done' ? '✓ Done' : status === 'error' ? '✗ Error' : ''}
                </span>
                <button
                  onClick={() => uploadSingle(fileItem)}
                  disabled={status === 'uploading' || status === 'done'}
                  style={{ ...btn(status !== 'uploading' && status !== 'done', '#4a90e2'), marginLeft: 8, padding: '4px 12px', fontSize: 12 }}
                >
                  {status === 'uploading' ? '...' : status === 'done' ? 'Uploaded' : 'Upload'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Uploaded files (persisted in localStorage, survives refresh) ── */}
      {uploadedFiles.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <div style={sectionHeaderStyle}>
            <h3 style={{ margin: 0, fontSize: 15 }}>Uploaded Files</h3>
            <button
              onClick={handleDownloadSelected}
              disabled={selectedUploaded.size === 0}
              style={btn(selectedUploaded.size > 0, '#28a745')}
            >
              Download Selected ({selectedUploaded.size})
            </button>
          </div>

          <label style={{ ...checkLabelStyle, marginBottom: 8 }}>
            <input type="checkbox" checked={allUploadedSelected} onChange={toggleSelectAllUploaded} />
            Select All
          </label>

          {uploadedFiles.map((item, index) => {
            const dStatus = downloadStatus[index] ?? 'idle'
            const checked = selectedUploaded.has(index)
            return (
              <div key={index} style={rowStyle}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const next = new Set(selectedUploaded)
                    checked ? next.delete(index) : next.add(index)
                    setSelectedUploaded(next)
                  }}
                />
                <div style={{ flex: 1, marginLeft: 8, overflow: 'hidden' }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.fileName}
                  </div>
                  <div style={{ fontSize: 11, color: '#888' }}>{item.uploadedAt}</div>
                </div>
                <span style={{ fontSize: 12, color: statusColor(dStatus), minWidth: 90, textAlign: 'right' }}>
                  {dStatus === 'downloading' ? 'Downloading...' : dStatus === 'done' ? '✓ Done' : dStatus === 'error' ? '✗ Error' : ''}
                </span>
                <button
                  onClick={() => downloadSingle(item, index)}
                  disabled={dStatus === 'downloading'}
                  style={{ ...btn(dStatus !== 'downloading', '#28a745'), marginLeft: 8, padding: '4px 12px', fontSize: 12 }}
                >
                  {dStatus === 'downloading' ? '...' : 'Download'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Style helpers ────────────────────────────────────────────────────────────

const sectionHeaderStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 8,
}

const checkLabelStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 600,
  cursor: 'pointer',
}

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  padding: '8px 10px',
  border: '1px solid #eee',
  borderRadius: 4,
  marginBottom: 6,
}

const fileNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  marginLeft: 8,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const btn = (active: boolean, color: string): React.CSSProperties => ({
  padding: '6px 16px',
  backgroundColor: active ? color : '#aaa',
  color: '#fff',
  border: 'none',
  borderRadius: 4,
  cursor: active ? 'pointer' : 'not-allowed',
  fontSize: 13,
  whiteSpace: 'nowrap',
})

const statusColor = (status: string) => {
  if (status === 'done') return '#28a745'
  if (status === 'error') return '#dc3545'
  if (status === 'uploading' || status === 'downloading') return '#e67e00'
  return 'transparent'
}
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { clearAuthUser, getAuthUser } from '../lib/auth'
import { FilePondUploader } from '#/components/multipartUpload'
export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const navigate = useNavigate()
  const user = typeof window !== 'undefined' ? getAuthUser() : null

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!getAuthUser()) navigate({ to: '/login' as string })
  }, [])

  const handleLogout = () => {
    clearAuthUser()
    navigate({ to: '/login' as string })
  }

  if (!user) return null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px' }}>
        <h1><b>Upload Files</b></h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={handleLogout}
            style={{ padding: '6px 14px', backgroundColor: '#e55', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13 }}
          >
            Logout
          </button>
        </div>
      </div>
      {/* <UploadComponent /> */}
      <FilePondUploader />
    </div>
  )
}
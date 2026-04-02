import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { getAuthUser, setAuthUser } from '../lib/auth'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

// ✏️ Update this to your actual login API endpoint
const LOGIN_URL ="https://v2-dev-api.esigns.io/staging/v1.0/signin/v2"

function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Already logged in → go to home
  useEffect(() => {
    if (getAuthUser()) navigate({ to: '/' })
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const result = await res.json()

      if (!result.success) throw new Error(result.message || 'Login failed')

      const token = result.data?.access_token ?? result.access_token
      const id = result.data?.user?.id ?? result.data?.id ?? ''
      const userEmail = result.data?.user?.email ?? result.data?.email ?? email

      if (!token) throw new Error('No token received')

      setAuthUser({ token, email: userEmail, id })
      navigate({ to: '/' })
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: '0 16px' }}>
      <h2 style={{ marginBottom: 24, textAlign: 'center' }}>Login</h2>

      <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: '10px 12px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ padding: '10px 12px', borderRadius: 4, border: '1px solid #ccc', fontSize: 14 }}
        />

        {error && <div style={{ color: 'red', fontSize: 13 }}>{error}</div>}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px',
            backgroundColor: loading ? '#aaa' : '#4a90e2',
            color: '#fff',
            border: 'none',
            borderRadius: 4,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: 14,
          }}
        >
          {loading ? 'Logging in...' : 'Login'}
        </button>
      </form>
    </div>
  )
}

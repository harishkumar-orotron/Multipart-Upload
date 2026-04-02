const AUTH_KEY = 'auth_user'

export type AuthUser = {
  token: string
  email: string
  id: string
}

export function getAuthUser(): AuthUser | null {
  try {
    const saved = localStorage.getItem(AUTH_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

export function setAuthUser(user: AuthUser) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
}

export function clearAuthUser() {
  localStorage.removeItem(AUTH_KEY)
}

export function getToken(): string | null {
  return getAuthUser()?.token ?? null
}

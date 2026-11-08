import { createClient, type AuthError, type Session, type User } from "@supabase/supabase-js"

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

const configurationError = new Error(
  "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be configured.",
)

type AuthResult = {
  error: AuthError | Error | null
}

type AuthClient = {
  getSession: () => Promise<{
    data: { session: Session | null }
    error: AuthError | Error | null
  }>
  onAuthStateChange: (
    callback: (event: string, session: Session | null) => void,
  ) => {
    data: { subscription: { unsubscribe: () => void } }
  }
  signInWithPassword: (credentials: {
    email: string
    password: string
  }) => Promise<{
    data: { user: User | null; session: Session | null }
    error: AuthError | Error | null
  }>
  resetPasswordForEmail: (
    email: string,
    options: { redirectTo: string },
  ) => Promise<AuthResult>
  resend: (options: {
    type: "signup"
    email: string
  }) => Promise<AuthResult>
  updateUser: (attributes: { password: string }) => Promise<AuthResult>
  signOut: () => Promise<AuthResult>
  signUp: (options: {
    email: string
    password: string
    options: { data: { username: string } }
  }) => Promise<{
    data: { user: User | null; session: Session | null }
    error: AuthError | Error | null
  }>
}

const unavailableAuth: AuthClient = {
  async getSession() {
    return { data: { session: null }, error: configurationError }
  },
  onAuthStateChange() {
    return { data: { subscription: { unsubscribe: () => undefined } } }
  },
  async signInWithPassword() {
    return {
      data: { user: null, session: null },
      error: configurationError,
    }
  },
  async resetPasswordForEmail() {
    return { error: configurationError }
  },
  async resend() {
    return { error: configurationError }
  },
  async updateUser() {
    return { error: configurationError }
  },
  async signOut() {
    return { error: configurationError }
  },
  async signUp() {
    return {
      data: { user: null, session: null },
      error: configurationError,
    }
  },
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)
export const supabase: { auth: AuthClient } =
  isSupabaseConfigured
    ? { auth: createClient(supabaseUrl, supabaseAnonKey).auth }
    : { auth: unavailableAuth }

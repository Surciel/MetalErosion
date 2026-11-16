import { ApiError } from "@/services/api"
import { supabase } from "@/services/supabase"

/** Run an API call with the current access token; a missing session is a 401. */
export async function withToken<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new ApiError("Your session has expired. Please log in again.", 401)
  return call(token)
}

export function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

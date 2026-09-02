import { useState } from "react"
import PageGrid from "@/components/PageGrid"
import type { View } from "@/types"

export default function LoginPage({
  onNavigate,
  onLogin,
}: {
  onNavigate: (v: View) => void
  onLogin: (username: string) => void
}) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (username.trim()) onLogin(username.trim())
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--color-bg)" }}
    >
      <header
        className="px-8 py-4"
        style={{ background: "var(--color-header)" }}
      >
        <PageGrid>
          <div
            className="flex items-center gap-3"
            style={{ gridColumn: "1 / -1" }}
          >
            <svg
              viewBox="0 0 32 32"
              className="w-7 h-7 flex-shrink-0"
              fill="none"
            >
              <circle cx="16" cy="16" r="13" fill="#8fa87a" fillOpacity="0.3" />
              <path
                d="M9 20 C10.5 13, 14.5 10, 16 9 C17.5 10, 21.5 13, 23 20 C20 23, 12 23, 9 20Z"
                fill="#c0392b"
                fillOpacity="0.85"
              />
              <circle
                cx="16"
                cy="14.5"
                r="3.5"
                fill="#e8ddd0"
                fillOpacity="0.9"
              />
            </svg>
            <span className="text-white font-bold text-lg tracking-tight">
              RustScan
            </span>
          </div>
        </PageGrid>
      </header>

      <main className="flex-1 flex items-center py-16 px-4">
        <PageGrid>
          {/* cols 4–9: 6-column centered card */}
          <div style={{ gridColumn: "4 / 10" }}>
            <div
              className="rounded-2xl overflow-hidden shadow-2xl"
              style={{ background: "var(--color-surface)" }}
            >
              <div
                className="flex flex-col items-center justify-center py-10 px-8"
                style={{ background: "var(--color-card)" }}
              >
                <div
                  className="w-16 h-16 rounded-full mb-3 flex items-center justify-center"
                  style={{ background: "var(--color-btn)" }}
                >
                  <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
                    <circle
                      cx="24"
                      cy="24"
                      r="20"
                      fill="#8fa87a"
                      fillOpacity="0.3"
                    />
                    <path
                      d="M14 30 C16 20, 22 16, 24 14 C26 16, 32 20, 34 30 C30 34, 18 34, 14 30Z"
                      fill="#c0392b"
                      fillOpacity="0.8"
                    />
                    <circle
                      cx="24"
                      cy="22"
                      r="5"
                      fill="#e8ddd0"
                      fillOpacity="0.9"
                    />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-white">Login</h2>
                <p className="text-xs text-white/50 mt-1">Welcome back</p>
              </div>

              <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-3">
                <input
                  type="text"
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-white/40 outline-none transition-all"
                  style={{ background: "var(--color-btn)" }}
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-white/40 outline-none transition-all"
                  style={{ background: "var(--color-btn)" }}
                />
                <button
                  type="button"
                  className="text-xs text-white/40 hover:text-white/70 text-left transition-colors"
                >
                  Forgot password?
                </button>
                <button
                  type="submit"
                  className="w-full py-3 rounded-lg font-semibold text-white transition-all text-sm mt-2"
                  style={{ background: "var(--color-btn)" }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "var(--color-btn-hover)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "var(--color-btn)")
                  }
                >
                  Login Account
                </button>
                <p className="text-xs text-center text-white/40 mt-2">
                  No account?{" "}
                  <button
                    type="button"
                    onClick={() => onNavigate("signup")}
                    className="text-white/70 hover:text-white underline transition-colors"
                  >
                    Sign up
                  </button>
                </p>
              </form>
            </div>
          </div>
        </PageGrid>
      </main>
    </div>
  )
}

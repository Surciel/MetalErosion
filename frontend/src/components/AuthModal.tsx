import { useState } from "react"
import type { LoginCredentials, SignupCredentials, View } from "@/types"

function Logo() {
  return (
    <div
      className="w-16 h-16 rounded-2xl mb-3 flex items-center justify-center"
      style={{ background: "var(--color-btn)" }}
    >
      <svg viewBox="0 0 48 48" className="w-10 h-10" fill="none">
        <circle cx="24" cy="24" r="20" fill="#8fa87a" fillOpacity="0.3" />
        <path
          d="M14 30 C16 20, 22 16, 24 14 C26 16, 32 20, 34 30 C30 34, 18 34, 14 30Z"
          fill="#c0392b"
          fillOpacity="0.8"
        />
        <circle cx="24" cy="22" r="5" fill="#e8ddd0" fillOpacity="0.9" />
      </svg>
    </div>
  )
}

function LoginForm({
  onLogin,
  onSwitch,
}: {
  onLogin: (credentials: LoginCredentials) => void
  onSwitch: () => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (email.trim() && password) onLogin({ email: email.trim(), password })
      }}
      className="flex flex-col gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col items-center pb-4">
        <Logo />
        <h2 className="text-xl font-bold text-white">Welcome back!</h2>
      </div>

      <input
        type="text"
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
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
        Forgot Password?
      </button>
      <button
        type="submit"
        className="w-full py-3 rounded-lg font-semibold text-white transition-all text-sm mt-1"
        style={{ background: "var(--color-btn)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--color-btn-hover)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "var(--color-btn)")
        }
      >
        Login
      </button>
      <p className="text-xs text-center text-white/40">
        No account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="text-white/70 hover:text-white underline transition-colors"
        >
          Sign up here
        </button>
      </p>
    </form>
  )
}

function SignupForm({
  onSignup,
  onSwitch,
}: {
  onSignup: (credentials: SignupCredentials) => void
  onSwitch: () => void
}) {
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [retype, setRetype] = useState("")

  const fields = [
    { placeholder: "Email", value: email, onChange: setEmail, type: "email" },
    {
      placeholder: "Username",
      value: username,
      onChange: setUsername,
      type: "text",
    },
    {
      placeholder: "Password",
      value: password,
      onChange: setPassword,
      type: "password",
    },
    {
      placeholder: "Retype password",
      value: retype,
      onChange: setRetype,
      type: "password",
    },
  ] as const

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (username.trim() && email.trim() && password && password === retype) {
          onSignup({ username: username.trim(), email: email.trim(), password })
        }
      }}
      className="flex flex-col gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col items-center pb-4">
        <Logo />
        <h2 className="text-xl font-bold text-white">Create Account</h2>
        <p className="text-xs text-white/50 mt-1">Get started with RustScan</p>
      </div>

      {fields.map((field) => (
        <input
          key={field.placeholder}
          type={field.type}
          placeholder={field.placeholder}
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-white/40 outline-none transition-all"
          style={{ background: "var(--color-btn)" }}
          required
        />
      ))}
      <button
        type="submit"
        className="w-full py-3 rounded-lg font-semibold text-white transition-all text-sm mt-1"
        style={{ background: "var(--color-btn)" }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = "var(--color-btn-hover)")
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "var(--color-btn)")
        }
      >
        Confirm
      </button>
      <p className="text-xs text-center text-white/40">
        Already have an account?{" "}
        <button
          type="button"
          onClick={onSwitch}
          className="text-white/70 hover:text-white underline transition-colors"
        >
          Login
        </button>
      </p>
    </form>
  )
}

export default function AuthModal({
  mode,
  onLogin,
  onSignup,
  onClose,
  onSwitchMode,
}: {
  mode: "login" | "signup"
  onLogin: (credentials: LoginCredentials) => void
  onSignup: (credentials: SignupCredentials) => void
  onClose: () => void
  onSwitchMode: (m: View) => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backdropFilter: "blur(6px)", background: "rgba(30,40,20,0.55)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm mx-4 rounded-2xl shadow-2xl p-8"
        style={{ background: "var(--color-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "login" ? (
          <LoginForm
            onLogin={onLogin}
            onSwitch={() => onSwitchMode("signup")}
          />
        ) : (
          <SignupForm
            onSignup={onSignup}
            onSwitch={() => onSwitchMode("login")}
          />
        )}
      </div>
    </div>
  )
}

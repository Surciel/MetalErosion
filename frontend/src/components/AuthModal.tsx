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
  onForgotPassword,
  onSwitch,
}: {
  onLogin: (credentials: LoginCredentials) => void
  onForgotPassword: (email: string) => void
  onSwitch: () => void
}) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [forgotMode, setForgotMode] = useState(false)

  if (forgotMode) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (email.trim()) onForgotPassword(email.trim())
        }}
        className="flex flex-col gap-3"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col items-center pb-4">
          <Logo />
          <h2 className="text-xl font-bold text-white">Recover account</h2>
          <p className="text-xs text-white/50 mt-1 text-center">Enter your email and we&apos;ll send a password reset link.</p>
        </div>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-white/40 outline-none transition-all"
          style={{ background: "var(--color-btn)" }}
          required
        />
        <button
          type="submit"
          className="w-full py-3 rounded-lg font-semibold text-white transition-all text-sm mt-1"
          style={{ background: "var(--color-btn)" }}
        >
          Send reset link
        </button>
        <button
          type="button"
          onClick={() => setForgotMode(false)}
          className="text-xs text-white/55 hover:text-white transition-colors"
        >
          Back to login
        </button>
      </form>
    )
  }

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
        onClick={() => setForgotMode(true)}
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

function ResetPasswordForm({
  onResetPassword,
}: {
  onResetPassword: (password: string) => void
}) {
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [error, setError] = useState("")

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (password !== confirmation) {
          setError("Passwords do not match.")
          return
        }
        setError("")
        if (password) onResetPassword(password)
      }}
      className="flex flex-col gap-3"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex flex-col items-center pb-4">
        <Logo />
        <h2 className="text-xl font-bold text-white">Set a new password</h2>
        <p className="text-xs text-white/50 mt-1 text-center">Choose a new password for your account.</p>
      </div>
      <input
        type="password"
        placeholder="New password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-white/40 outline-none transition-all"
        style={{ background: "var(--color-btn)" }}
        minLength={6}
        required
      />
      <input
        type="password"
        placeholder="Confirm new password"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        className="w-full px-4 py-3 rounded-lg text-sm text-white placeholder-white/40 outline-none transition-all"
        style={{ background: "var(--color-btn)" }}
        minLength={6}
        required
      />
      {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
      <button
        type="submit"
        className="w-full py-3 rounded-lg font-semibold text-white transition-all text-sm mt-1"
        style={{ background: "var(--color-btn)" }}
      >
        Update password
      </button>
    </form>
  )
}

function SignupForm({
  onSignup,
  onResendConfirmation,
  onSwitch,
}: {
  onSignup: (credentials: SignupCredentials) => void
  onResendConfirmation: (email: string) => void
  onSwitch: () => void
}) {
  const [email, setEmail] = useState("")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [retype, setRetype] = useState("")

  const fields = [
    {
      placeholder: "Email",
      value: email,
      onChange: setEmail,
      type: "email",
      name: "email",
      autoComplete: "email",
    },
    {
      placeholder: "Username",
      value: username,
      onChange: setUsername,
      type: "text",
      name: "username",
      autoComplete: "username",
    },
    {
      placeholder: "Password",
      value: password,
      onChange: setPassword,
      type: "password",
      name: "new-password",
      autoComplete: "new-password",
    },
    {
      placeholder: "Retype password",
      value: retype,
      onChange: setRetype,
      type: "password",
      name: "confirm-password",
      autoComplete: "new-password",
    },
  ] as const

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        if (
          username.trim() &&
          email.trim() &&
          password &&
          password === retype
        ) {
          onSignup({
            username: username.trim(),
            email: email.trim(),
            password,
          })
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
          name={field.name}
          autoComplete={field.autoComplete}
          placeholder={field.placeholder}
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          inputMode={"inputMode" in field ? field.inputMode : undefined}
          maxLength={"maxLength" in field ? field.maxLength : undefined}
          pattern={"pattern" in field ? field.pattern : undefined}
          className={`w-full px-4 py-3 rounded-lg text-sm text-white placeholder-white/40 outline-none transition-all ${"className" in field ? field.className : ""}`}
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
      <button
        type="button"
        onClick={() => onResendConfirmation(email.trim())}
        className="text-xs text-white/45 hover:text-white/75 transition-colors disabled:opacity-30"
        disabled={!email.trim()}
      >
        Resend confirmation email
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
  onForgotPassword,
  onResetPassword,
  onSignup,
  onClose,
  onSwitchMode,
  onResendConfirmation,
}: {
  mode: "login" | "signup" | "reset-password"
  onLogin: (credentials: LoginCredentials) => void
  onSignup: (credentials: SignupCredentials) => void
  onForgotPassword: (email: string) => void
  onResetPassword: (password: string) => void
  onClose: () => void
  onSwitchMode: (m: View) => void
  onResendConfirmation: (email: string) => void
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
            onForgotPassword={onForgotPassword}
            onSwitch={() => onSwitchMode("signup")}
          />
        ) : mode === "signup" ? (
          <SignupForm
            onSignup={onSignup}
            onResendConfirmation={onResendConfirmation}
            onSwitch={() => onSwitchMode("login")}
          />
        ) : (
          <ResetPasswordForm onResetPassword={onResetPassword} />
        )}
      </div>
    </div>
  )
}

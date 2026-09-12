import { useEffect, useState } from "react"
import LandingPage from "@/pages/LandingPage"
import AuthModal from "@/components/AuthModal"
import HomePage from "@/pages/HomePage"
import CalculatingPage from "@/pages/CalculatingPage"
import ResultsPage from "@/pages/ResultsPage"
import InfoPage from "@/pages/InfoPage"
import HistoryPage from "@/pages/HistoryPage"
import HistoryDetailPage from "@/pages/HistoryDetailPage"
import AdminPage from "@/pages/AdminPage"
import { getAdminMetrics } from "@/utils/adminMetrics"
import { getScanHistory } from "@/services/api"
import { supabase } from "@/services/supabase"
import type {
  Account,
  LoginCredentials,
  MetricRange,
  RecoveryRequest,
  ScanResult,
  SignupCredentials,
  View,
} from "@/types"

export default function App() {
  const [view, setView] = useState<View>("landing")
  const [activeAccount, setActiveAccount] = useState<Account | null>(null)
  const [accounts] = useState<Account[]>([])
  const [recoveryRequests] = useState<RecoveryRequest[]>([])
  const [metricRange, setMetricRange] = useState<MetricRange>("month")
  const [authError, setAuthError] = useState("")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState("")
  const [uploadedImageName, setUploadedImageName] = useState("")
  const [currentResult, setCurrentResult] = useState<ScanResult | null>(null)
  const [sessionScans, setSessionScans] = useState<ScanResult[]>([])
  const [history, setHistory] = useState<ScanResult[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState("")
  const [selectedHistoryScan, setSelectedHistoryScan] =
    useState<ScanResult | null>(null)

  const accountFromUser = (user: {
    id: string
    email?: string
    created_at: string
    last_sign_in_at?: string
    user_metadata: { username?: string }
    app_metadata: { role?: string }
  }): Account => {
    const email = user.email ?? ""
    const username =
      user.user_metadata.username?.trim() || email.split("@")[0] || "User"
    const role: Account["role"] =
      user.app_metadata.role === "admin" ? "admin" : "user"

    return {
      id: user.id,
      username,
      email,
      role,
      status: "active",
      createdAt: user.created_at,
      lastActiveAt: user.last_sign_in_at ?? user.created_at,
    }
  }

  const loadHistory = async (accessToken: string, userId: string) => {
    setHistoryLoading(true)
    setHistoryError("")

    try {
      setHistory(await getScanHistory(accessToken, userId))
    } catch (cause: unknown) {
      setHistoryError(
        cause instanceof Error ? cause.message : "Unable to load scan history.",
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        if (mounted) setAuthError(error.message)
        return
      }

      if (mounted && session?.user) {
        setActiveAccount(accountFromUser(session.user))
        void loadHistory(session.access_token, session.user.id)
        setView("home")
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return

      if (session?.user) {
        setActiveAccount(accountFromUser(session.user))
        void loadHistory(session.access_token, session.user.id)
      } else {
        setActiveAccount(null)
        setHistory([])
        setHistoryError("")
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  const handleLogin = async (credentials: LoginCredentials) => {
    setAuthError("")
    const { data, error } = await supabase.auth.signInWithPassword(credentials)

    if (error) {
      setAuthError(error.message)
      return
    }

    if (!data.user) {
      setAuthError("Login succeeded without an authenticated user.")
      return
    }

    setActiveAccount(accountFromUser(data.user))
    setView("home")
  }

  const handleSignup = async (credentials: SignupCredentials) => {
    setAuthError("")
    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          username: credentials.username,
          recovery_pin: credentials.recoveryPin,
        },
      },
    })

    if (error) {
      setAuthError(error.message)
      return
    }

    if (!data.user) {
      setAuthError("Sign up did not return an authenticated user.")
      return
    }

    if (!data.session) {
      setAuthError("Check your email to confirm your account before logging in.")
      return
    }

    setActiveAccount(accountFromUser(data.user))
    setView("home")
  }

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut()
    if (error) {
      setAuthError(error.message)
      return
    }

    setActiveAccount(null)
    setSessionScans([])
    setCurrentResult(null)
    setUploadedFile(null)
    setView("landing")
  }

  const handleUpload = (file: File, url: string) => {
    setUploadedFile(file)
    setUploadedImageUrl(url)
    setUploadedImageName(file.name)
    setView("calculating")
  }

  const handleCalculationDone = (result: ScanResult) => {
    setCurrentResult(result)
    setSessionScans((prev) => [...prev, result])
    setHistory((prev) => [result, ...prev.filter((scan) => scan.id !== result.id)])
    setView("results")
  }

  const handleSelectHistoryScan = (scan: ScanResult) => {
    setSelectedHistoryScan(scan)
    setView("history-detail")
  }

  const username = activeAccount?.username ?? "User"
  const adminMetrics = getAdminMetrics(accounts, history, metricRange)

  switch (view) {
    case "landing":
    case "login":
    case "signup":
      return (
        <>
          <LandingPage onNavigate={setView} />
          {(view === "login" || view === "signup") && (
            <AuthModal
              mode={view}
              onLogin={handleLogin}
              onSignup={handleSignup}
              onClose={() => {
                setAuthError("")
                setView("landing")
              }}
              onSwitchMode={(nextView) => {
                setAuthError("")
                setView(nextView)
              }}
            />
          )}
            {authError && (
              <p className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-red-900/90 px-4 py-3 text-sm text-white shadow-lg">
                {authError}
              </p>
            )}
        </>
      )
    case "home":
      return (
        <HomePage
          username={username}
          isAdmin={activeAccount?.role === "admin"}
          onUpload={handleUpload}
          onNavigate={setView}
        />
      )
    case "admin":
      return activeAccount?.role === "admin" ? (
        <AdminPage
          username={username}
          accounts={accounts}
          metrics={adminMetrics}
          recoveryRequests={recoveryRequests}
          onNavigate={setView}
          onLogout={handleLogout}
          onRangeChange={setMetricRange}
            onUpdateAccount={() => undefined}
            onToggleAccount={() => undefined}
            onHandleRecovery={() => undefined}
        />
      ) : (
        <HomePage
          username={username}
          isAdmin={activeAccount?.role === "admin"}
          onUpload={handleUpload}
          onNavigate={setView}
        />
      )
    case "calculating":
      return (
        <CalculatingPage
          username={username}
          imageUrl={uploadedImageUrl}
          imageName={uploadedImageName}
          file={uploadedFile}
          onDone={handleCalculationDone}
        />
      )
    case "results":
      return currentResult ? (
        <ResultsPage
          username={username}
          result={currentResult}
          sessionScans={sessionScans}
          onNavigate={setView}
          onClose={() => setView("home")}
        />
      ) : null
    case "rust-info":
      return currentResult ? (
        <InfoPage
          username={username}
          title="Rust Percentage"
          result={currentResult}
          type="rust"
          onBack={() => setView("results")}
          onNavigate={setView}
        />
      ) : null
    case "classification-info":
      return currentResult ? (
        <InfoPage
          username={username}
          title="Classification Details"
          result={currentResult}
          type="classification"
          onBack={() => setView("results")}
          onNavigate={setView}
        />
      ) : null
    case "history":
      return (
        <HistoryPage
          username={username}
          history={history}
          historyLoading={historyLoading}
          historyError={historyError}
          onSelect={handleSelectHistoryScan}
          onNavigate={setView}
        />
      )
    case "history-detail":
      return selectedHistoryScan ? (
        <HistoryDetailPage
          username={username}
          scan={selectedHistoryScan}
          history={history}
          onBack={() => setView("history")}
          onNavigate={setView}
        />
      ) : null
    default:
      return null
  }
}

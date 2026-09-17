import { useEffect, useRef, useState } from "react"
import LandingPage from "@/pages/LandingPage"
import AuthModal from "@/components/AuthModal"
import HomePage from "@/pages/HomePage"
import CalculatingPage from "@/pages/CalculatingPage"
import ResultsPage from "@/pages/ResultsPage"
import InfoPage from "@/pages/InfoPage"
import HistoryPage from "@/pages/HistoryPage"
import HistoryDetailPage from "@/pages/HistoryDetailPage"
import AdminPage from "@/pages/AdminPage"
import type { User } from "@supabase/supabase-js"
import {
  getAdminAccounts,
  getAdminMetrics,
  getAdminRecoveryRequests,
  getCurrentAccount,
  getScanHistory,
  deleteScanHistory,
  updateScanHistory,
  ApiError,
  updateAdminAccount,
  updateAdminRecoveryRequest,
} from "@/services/api"
import { supabase } from "@/services/supabase"
import type {
  Account,
  AdminMetrics,
  LoginCredentials,
  MetricRange,
  RecoveryRequest,
  ScanResult,
  SignupCredentials,
  View,
} from "@/types"

export default function App() {
  const [view, setView] = useState<View>("landing")
  const viewRef = useRef<View>("landing")
  viewRef.current = view
  const [activeAccount, setActiveAccount] = useState<Account | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [recoveryRequests, setRecoveryRequests] = useState<RecoveryRequest[]>([])
  const [metricRange, setMetricRange] = useState<MetricRange>("month")
  const [adminMetrics, setAdminMetrics] = useState<AdminMetrics>({
    totalAccounts: 0,
    activeAccounts: 0,
    scansToday: 0,
    scansThisWeek: 0,
    scansThisMonth: 0,
    selectedRange: "month",
    selectedRangeScans: 0,
  })
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState("")
  const [authError, setAuthError] = useState("")
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [uploadedImageUrl, setUploadedImageUrl] = useState("")
  const [uploadedImageName, setUploadedImageName] = useState("")
  const [scanTitle, setScanTitle] = useState("")
  const [currentResult, setCurrentResult] = useState<ScanResult | null>(null)
  const [sessionScans, setSessionScans] = useState<ScanResult[]>([])
  const [history, setHistory] = useState<ScanResult[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState("")
  const [selectedHistoryScan, setSelectedHistoryScan] =
    useState<ScanResult | null>(null)

  const accountFromUser = (user: User): Account => {
    const email = user.email ?? ""
    const username =
      (typeof user.user_metadata.username === "string"
        ? user.user_metadata.username.trim()
        : "") || email.split("@")[0] || "User"
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

  const accountForSession = async (
    user: User,
    accessToken: string,
  ): Promise<Account> => {
    try {
      return await getCurrentAccount(accessToken)
    } catch {
      return accountFromUser(user)
    }
  }

  const loadHistory = async (accessToken: string) => {
    setHistoryLoading(true)
    setHistoryError("")

    try {
      setHistory(await getScanHistory(accessToken))
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) {
        handleSessionExpired()
        return
      }
      setHistoryError(
        cause instanceof Error ? cause.message : "Unable to load scan history.",
      )
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleSessionExpired = () => {
    setActiveAccount(null)
    setHistory([])
    setAccounts([])
    setRecoveryRequests([])
    setHistoryError("")
    setAdminError("")
    setAuthError("Your session has expired. Please log in again.")
    setView("landing")
  }

  const loadAdminData = async (accessToken: string, range: MetricRange) => {
    setAdminLoading(true)
    setAdminError("")

    try {
      const [nextAccounts, nextMetrics, nextRecoveryRequests] = await Promise.all([
        getAdminAccounts(accessToken),
        getAdminMetrics(accessToken, range),
        getAdminRecoveryRequests(accessToken),
      ])
      setAccounts(nextAccounts)
      setAdminMetrics(nextMetrics)
      setRecoveryRequests(nextRecoveryRequests)
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) {
        handleSessionExpired()
        return
      }
      setAdminError(
        cause instanceof Error ? cause.message : "Unable to load admin data.",
      )
    } finally {
      setAdminLoading(false)
    }
  }

  useEffect(() => {
    let mounted = true

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (error) {
        if (mounted) setAuthError(error.message)
        return
      }

      if (mounted && session?.user) {
        const account = await accountForSession(session.user, session.access_token)
        setActiveAccount(account)
        void loadHistory(session.access_token)
        if (account.role === "admin") {
          void loadAdminData(session.access_token, metricRange)
        }
        if (["landing", "login", "signup", "reset-password"].includes(viewRef.current)) {
          setView(account.role === "admin" ? "admin" : "home")
        }
      }
    })

    const {
          data: { subscription },
        } = supabase.auth.onAuthStateChange(async (_event, session) => {
          if (!mounted) return

          if (_event === "PASSWORD_RECOVERY") {
            setAuthError("")
            setView("reset-password")
            return
          }

          if (session?.user) {
            const account = await accountForSession(session.user, session.access_token)
            setActiveAccount(account)
            void loadHistory(session.access_token)
            if (account.role === "admin") {
              void loadAdminData(session.access_token, metricRange)
            }
          } else if (_event === "SIGNED_OUT") {
            setActiveAccount(null)
            setHistory([])
            setHistoryError("")
            setAccounts([])
            setRecoveryRequests([])
            setAdminError("")
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

    const account = await accountForSession(data.user, data.session?.access_token ?? "")
    setActiveAccount(account)
    setView(account.role === "admin" ? "admin" : "home")
  }

  const handleForgotPassword = async (email: string) => {
    setAuthError("")
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setAuthError(error.message)
      return
    }

    setAuthError("Check your email for a password reset link.")
  }

  const handleResendConfirmation = async (email: string) => {
    if (!email) {
      setAuthError("Enter your email address first.")
      return
    }

    setAuthError("")
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    })

    setAuthError(error?.message ?? "A new confirmation email has been sent.")
  }

  const handleResetPassword = async (password: string) => {
    setAuthError("")
    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setAuthError(error.message)
      return
    }

    await supabase.auth.signOut()
    setActiveAccount(null)
    setView("login")
    setAuthError("Your password was updated. You can now log in.")
  }

  const handleSignup = async (credentials: SignupCredentials) => {
    setAuthError("")
    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: {
          username: credentials.username,
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

    const account = await accountForSession(data.user, data.session.access_token)
    setActiveAccount(account)
    setView(account.role === "admin" ? "admin" : "home")
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
    setAccounts([])
    setRecoveryRequests([])
    setAdminError("")
    setView("landing")
  }

  const handleUpload = (file: File, url: string, title: string) => {
    setUploadedFile(file)
    setUploadedImageUrl(url)
    setUploadedImageName(file.name)
    setScanTitle(title)
    setView("calculating")
  }

    const handleCalculationDone = (result: ScanResult) => {
    setCurrentResult(result)
    setSessionScans((prev) => [...prev, result])
    setHistory((prev) => [result, ...prev.filter((scan) => scan.id !== result.id)])
    setSelectedHistoryScan(result)
      setView("results")
  }

  const handleSelectHistoryScan = (scan: ScanResult) => {
    setSelectedHistoryScan(scan)
    setView("history-detail")
  }

  const handleDeleteHistoryScan = async (
    scanId: string,
    stayOnHistory = false,
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) {
      handleSessionExpired()
      return
    }

    try {
      await deleteScanHistory(session.access_token, scanId)
      const remainingHistory = history.filter((scan) => scan.id !== scanId)
      setHistory(remainingHistory)
      setSessionScans((current) => current.filter((scan) => scan.id !== scanId))

      const nextScan = remainingHistory[0] ?? null
      setSelectedHistoryScan(nextScan)
      setCurrentResult((current) => (current?.id === scanId ? nextScan : current))
      setView(stayOnHistory || !nextScan ? "history" : "history-detail")
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) {
        handleSessionExpired()
        return
      }
      setHistoryError(
        cause instanceof Error ? cause.message : "Unable to delete scan history.",
      )
      throw cause instanceof Error
        ? cause
        : new Error("Unable to delete scan history.")
    }
  }

  const handleUpdateHistoryScan = async (scanId: string, title: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) {
      handleSessionExpired()
      throw new Error("Your session has expired. Please log in again.")
    }

    try {
      const updatedScan = await updateScanHistory(
        session.access_token,
        scanId,
        title,
      )
      const replaceScan = (scan: ScanResult) =>
        scan.id === updatedScan.id ? updatedScan : scan
      setHistory((current) => current.map(replaceScan))
      setSessionScans((current) => current.map(replaceScan))
      setSelectedHistoryScan((current) => current ? replaceScan(current) : current)
      setCurrentResult((current) => current ? replaceScan(current) : current)
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) {
        handleSessionExpired()
      }
      throw cause instanceof Error
        ? cause
        : new Error("Unable to update scan title.")
    }
  }

  const handleAdminRangeChange = async (range: MetricRange) => {
    setMetricRange(range)
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (session?.access_token) {
      await loadAdminData(session.access_token, range)
    }
  }

  const handleAdminAccountUpdate = async (
    accountId: string,
    changes: Pick<Account, "username" | "email" | "role">,
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setAdminError("Your session has expired. Please log in again.")
      return
    }

    try {
      const updatedAccount = await updateAdminAccount(
        session.access_token,
        accountId,
        changes,
      )
      setAccounts((current) =>
        current.map((account) =>
          account.id === updatedAccount.id ? updatedAccount : account,
        ),
      )
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) {
        handleSessionExpired()
        return
      }
      setAdminError(
        cause instanceof Error ? cause.message : "Unable to update account.",
      )
    }
  }

  const handleAdminRecovery = async (requestId: string) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) {
      setAdminError("Your session has expired. Please log in again.")
      return
    }

    try {
      const updatedRequest = await updateAdminRecoveryRequest(
        session.access_token,
        requestId,
      )
      setRecoveryRequests((current) =>
        current.map((request) =>
          request.id === updatedRequest.id ? updatedRequest : request,
        ),
      )
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) {
        handleSessionExpired()
        return
      }
      setAdminError(
        cause instanceof Error
          ? cause.message
          : "Unable to update recovery request.",
      )
    }
  }

  const username = activeAccount?.username ?? "User"

  switch (view) {
    case "landing":
    case "login":
    case "signup":
    case "reset-password":
      return (
        <>
          <LandingPage onNavigate={setView} />
          {(view === "login" || view === "signup" || view === "reset-password") && (
            <AuthModal
              mode={view}
              onLogin={handleLogin}
              onSignup={handleSignup}
              onForgotPassword={handleForgotPassword}
              onResendConfirmation={handleResendConfirmation}
              onResetPassword={handleResetPassword}
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
          loading={adminLoading}
          error={adminError}
          onNavigate={setView}
          onLogout={handleLogout}
          onRangeChange={handleAdminRangeChange}
          onUpdateAccount={handleAdminAccountUpdate}
          onHandleRecovery={handleAdminRecovery}
        />
      ) : (
        <HomePage
          username={username}
          isAdmin={false}
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
          scanTitle={scanTitle}
          file={uploadedFile}
          onDone={handleCalculationDone}
          onNavigate={setView}
          onSessionExpired={handleSessionExpired}
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
          onUpload={handleUpload}
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
          onDelete={handleDeleteHistoryScan}
          onEdit={handleUpdateHistoryScan}
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
          onDelete={handleDeleteHistoryScan}
          onEdit={handleUpdateHistoryScan}
        />
      ) : null
    default:
      return null
  }
}

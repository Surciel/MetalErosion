import { useState } from "react"
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
  const [history] = useState<ScanResult[]>([])
  const [selectedHistoryScan, setSelectedHistoryScan] =
    useState<ScanResult | null>(null)

  const handleLogin = (_credentials: LoginCredentials) => {
    setAuthError("Supabase authentication is not connected yet.")
  }
  const handleSignup = (_credentials: SignupCredentials) => {
    setAuthError("Supabase authentication is not connected yet.")
  }

  const handleLogout = () => {
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
              onClose={() => setView("landing")}
              onSwitchMode={setView}
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

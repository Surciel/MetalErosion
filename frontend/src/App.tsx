import { useState } from "react"
import { MOCK_HISTORY } from "@/data/mockData"
import LandingPage from "@/pages/LandingPage"
import AuthModal from "@/components/AuthModal"
import HomePage from "@/pages/HomePage"
import CalculatingPage from "@/pages/CalculatingPage"
import ResultsPage from "@/pages/ResultsPage"
import InfoPage from "@/pages/InfoPage"
import HistoryPage from "@/pages/HistoryPage"
import HistoryDetailPage from "@/pages/HistoryDetailPage"
import type { View, ScanResult } from "@/types"

export default function App() {
  const [view, setView] = useState<View>("landing")
  const [username, setUsername] = useState("User")
  const [uploadedImageUrl, setUploadedImageUrl] = useState("")
  const [uploadedImageName, setUploadedImageName] = useState("")
  const [currentResult, setCurrentResult] = useState<ScanResult | null>(null)
  const [sessionScans, setSessionScans] = useState<ScanResult[]>([])
  const [history, setHistory] = useState<ScanResult[]>(MOCK_HISTORY)
  const [selectedHistoryScan, setSelectedHistoryScan] =
    useState<ScanResult | null>(null)

  const handleLogin = (u: string) => {
    setUsername(u)
    setSessionScans([])
    setView("home")
  }
  const handleSignup = (u: string) => {
    setUsername(u)
    setSessionScans([])
    setView("home")
  }

  const handleUpload = (file: File, url: string) => {
    setUploadedImageUrl(url)
    setUploadedImageName(file.name)
    setView("calculating")
  }

  const handleCalculationDone = (result: ScanResult) => {
    setCurrentResult(result)
    setSessionScans((prev) => [...prev, result])
    setHistory((prev) => [result, ...prev])
    setView("results")
  }

  const handleSelectHistoryScan = (scan: ScanResult) => {
    setSelectedHistoryScan(scan)
    setView("history-detail")
  }

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
        </>
      )
    case "home":
      return (
        <HomePage
          username={username}
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

import { createContext, useContext } from "react"
import type { AccountRole, ScanDetails, ScanOptions, ScanResult, View } from "@/types"

/** What every signed-in page can do without having it passed down as props. */
export interface Nav {
  view: View
  navigate: (view: View) => void
  username: string
  role: AccountRole
  userId: string
  logout: () => void
  sessionExpired: () => void
  openSite: (siteId: string) => void
  openAsset: (assetId: string) => void
  /** Show one inspection; `backTo` is where its Back button returns. */
  openScan: (scan: ScanResult, backTo: View) => void
  openScanReport: (scan: ScanResult) => void
  openSiteReport: (siteId: string) => void
  startScan: (file: File, previewUrl: string, title: string, details: ScanDetails) => void
  /** Tell the app a scan changed (review, edit) so every list shows the new values. */
  scanUpdated: (scan: ScanResult) => void
  scanOptions: ScanOptions
  optionsError: string
  selectedSiteId: string | null
  selectedAssetId: string | null
}

export const NavContext = createContext<Nav | null>(null)

export function useNav(): Nav {
  const nav = useContext(NavContext)
  if (!nav) throw new Error("useNav must be used inside a signed-in page.")
  return nav
}

/** For components that also render outside a signed-in page. */
export function useOptionalNav(): Nav | null {
  return useContext(NavContext)
}

export const isManager = (role: AccountRole) => role === "engineer" || role === "admin"

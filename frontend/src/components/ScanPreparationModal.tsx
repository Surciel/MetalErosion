import { useEffect, useMemo, useState } from "react"
import { primeAlertAudio } from "@/utils/alertSound"
import { AnalysisRequestError, checkScanImage, getSiteRegister, getSites } from "@/services/api"
import { withToken } from "@/services/session"
import { supabase } from "@/services/supabase"
import type { Asset, ScanDetails, ScanOptions, Site } from "@/types"

/** Result of the backend photo check that must pass before the scan details can be picked. */
type PhotoCheck =
  | { state: "checking" }
  | { state: "passed" }
  | { state: "rejected"; message: string }
  | { state: "failed"; message: string }

type ScanPreparationModalProps = {
  file: File
  sourceUrl: string
  /** Loaded from the backend, so the pickers and the prediction use the same lists. */
  scanOptions: ScanOptions
  /** Why the options could not be loaded, if they could not. */
  optionsError?: string
  /** Set when the scan was started from an asset's page: the asset is then fixed. */
  presetAsset?: { asset: Asset; site: Site }
  onCancel: () => void
  onConfirm: (file: File, previewUrl: string, title: string, details: ScanDetails) => void
}

const MAX_TITLE_LENGTH = 120
// Mirrors the backend limits (backend/main.py MAX_IMAGE_BYTES, image_quality.py formats)
// so the user is told before the upload instead of after it.
const MAX_FILE_BYTES = 15 * 1024 * 1024
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"]

function fileProblem(file: File): string {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    return "This file type is not supported. Use a JPEG, PNG or WebP image."
  }
  if (file.size > MAX_FILE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return `This image is ${sizeMb} MB. The limit is 15 MB.`
  }
  return ""
}

const selectClass =
  "rounded-lg border px-3 py-2.5 text-sm text-white outline-none focus:border-white/60 disabled:cursor-not-allowed"
const selectStyle = { borderColor: "var(--color-border)", background: "var(--color-btn)" }

export default function ScanPreparationModal({
  file,
  sourceUrl,
  scanOptions,
  optionsError = "",
  presetAsset,
  onCancel,
  onConfirm,
}: ScanPreparationModalProps) {
  const [title, setTitle] = useState(() =>
    presetAsset ? `${presetAsset.asset.tag} inspection` : file.name.replace(/\.[^/.]+$/, ""),
  )
  // "asset": the scan joins a steel element's inspection history.
  // "quick": a one-off scan; the element type and environment are entered by hand.
  const [mode, setMode] = useState<"asset" | "quick">("asset")
  const [sites, setSites] = useState<Site[] | null>(presetAsset ? [presetAsset.site] : null)
  const [siteId, setSiteId] = useState(presetAsset?.site.id ?? "")
  const [assets, setAssets] = useState<Asset[] | null>(presetAsset ? [presetAsset.asset] : null)
  const [assetId, setAssetId] = useState(presetAsset?.asset.id ?? "")
  // Nothing is preselected: the environment sets the corrosion rate and the element type
  // sets the checks in the answer, so both must be deliberate choices.
  const [elementType, setElementType] = useState("")
  const [environment, setEnvironment] = useState("")
  const [error, setError] = useState("")

  const titleLength = useMemo(() => title.trim().length, [title])
  const problem = useMemo(() => fileProblem(file), [file])
  const optionsUnavailable =
    scanOptions.elementTypes.length === 0 || scanOptions.environments.length === 0
  const [photoCheck, setPhotoCheck] = useState<PhotoCheck>({ state: "checking" })
  const [checkAttempt, setCheckAttempt] = useState(0)
  const photoPassed = photoCheck.state === "passed"
  // The details can only be chosen once the photo is confirmed to show metal.
  const blocked = optionsUnavailable || Boolean(problem) || !photoPassed

  const selectedSite = sites?.find((site) => site.id === siteId)
  const selectedAsset = assets?.find((asset) => asset.id === assetId)
  const selectedElement = scanOptions.elementTypes.find((option) => option.name === elementType)
  const selectedEnvironment = scanOptions.environments.find((option) => option.code === environment)
  const siteEnvironment = scanOptions.environments.find((option) => option.code === selectedSite?.environment)

  // The scan's details: taken from the asset and its site, or entered by hand.
  const details: ScanDetails | null =
    mode === "asset"
      ? selectedAsset && selectedSite
        ? { elementType: selectedAsset.elementType, environment: selectedSite.environment, assetId: selectedAsset.id }
        : null
      : selectedElement && selectedEnvironment
        ? { elementType: selectedElement.name, environment: selectedEnvironment.code }
        : null

  // Run the backend's photo checks (lighting, sharpness, metal) as soon as the photo
  // is chosen, so a non-metal photo is stopped before the details are picked.
  useEffect(() => {
    if (problem) return
    const controller = new AbortController()
    setPhotoCheck({ state: "checking" })
    void (async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token
        if (!token) {
          setPhotoCheck({ state: "failed", message: "Your session has expired. Please log in again." })
          return
        }
        await checkScanImage(file, token, controller.signal)
        if (!controller.signal.aborted) setPhotoCheck({ state: "passed" })
      } catch (cause: unknown) {
        if (controller.signal.aborted) return
        if (cause instanceof AnalysisRequestError && !cause.retryable) {
          setPhotoCheck({ state: "rejected", message: cause.message })
        } else {
          setPhotoCheck({
            state: "failed",
            message:
              cause instanceof Error ? cause.message : "The photo could not be checked. Try again.",
          })
        }
      }
    })()
    return () => controller.abort()
  }, [file, problem, checkAttempt])

  // The sites to choose from. With none (or if they cannot be loaded) only a quick scan
  // is possible, so the pop-up switches to it.
  useEffect(() => {
    if (presetAsset) return
    let cancelled = false
    void withToken(getSites)
      .then((loaded) => {
        if (cancelled) return
        setSites(loaded)
        if (loaded.length === 0) setMode("quick")
      })
      .catch(() => {
        if (cancelled) return
        setSites([])
        setMode("quick")
      })
    return () => {
      cancelled = true
    }
  }, [presetAsset])

  useEffect(() => {
    if (presetAsset || !siteId) return
    let cancelled = false
    setAssets(null)
    setAssetId("")
    void withToken((token) => getSiteRegister(token, siteId))
      .then((register) => {
        if (!cancelled) setAssets([...register.assets].sort((left, right) => left.tag.localeCompare(right.tag)))
      })
      .catch(() => {
        if (!cancelled) setAssets([])
      })
    return () => {
      cancelled = true
    }
  }, [presetAsset, siteId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel()
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onCancel])

  const missingHint =
    mode === "asset" ? "Choose the site and the asset." : "Choose the element type and the exposure environment."

  const handleConfirm = () => {
    if (blocked) return
    const normalizedTitle = title.trim()
    if (!normalizedTitle) {
      setError("Enter a name for this scan.")
      return
    }
    if (normalizedTitle.length > MAX_TITLE_LENGTH) {
      setError(`Use ${MAX_TITLE_LENGTH} characters or fewer.`)
      return
    }
    if (!details) {
      setError(missingHint)
      return
    }

    // Unlock audio during this click so the severity alert can play when results arrive.
    primeAlertAudio()
    // Callers revoke `sourceUrl` after confirming, so hand over a fresh preview URL.
    onConfirm(file, URL.createObjectURL(file), normalizedTitle, details)
  }

  // One message that stops the scan: shown on its own, with a single way forward.
  const blockingMessage =
    problem ||
    (optionsUnavailable
      ? optionsError ||
        "The element types and environments could not be loaded, so the scan cannot start. Check that the backend is running, then choose the image again."
      : photoCheck.state === "rejected"
        ? photoCheck.message
        : "")
  const checking = !blockingMessage && photoCheck.state === "checking"
  const checkFailed = !blockingMessage && photoCheck.state === "failed"
  const ready = !blockingMessage && photoPassed
  const footerHint = error || (ready && !details ? missingHint : "")
  const dimmed = ready ? "" : "opacity-40"

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="scan-preparation-title"
    >
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border shadow-2xl" style={{ background: "var(--color-header)", borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between gap-4 border-b px-5 py-3.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <h2 id="scan-preparation-title" className="text-lg font-semibold text-white">New inspection scan</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="text-2xl leading-none text-white/50 hover:text-white">×</button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            handleConfirm()
          }}
        >
          <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex items-center justify-center overflow-hidden rounded-xl bg-black/35 p-3 md:sticky md:top-0 md:self-start">
              <img src={sourceUrl} alt="Scan preview" className="block max-h-[56vh] max-w-full rounded-lg object-contain" />
            </div>

            <div className="flex flex-col gap-5">
              {blockingMessage && (
                <div className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3.5" role="alert">
                  <p className="text-sm font-semibold text-white">
                    {optionsUnavailable && !problem ? "Scans can't start right now" : "This photo can't be scanned"}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-red-100/90">{blockingMessage}</p>
                </div>
              )}

              {checking && (
                <div className="flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-white/75" style={{ borderColor: "var(--color-border)" }} role="status">
                  <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white" aria-hidden="true" />
                  Checking the photo for a steel surface…
                </div>
              )}

              {checkFailed && (
                <div className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3.5" role="alert">
                  <p className="text-sm font-semibold text-white">The photo couldn't be checked</p>
                  <p className="mt-1 text-sm leading-relaxed text-red-100/90">
                    {photoCheck.state === "failed" ? photoCheck.message : ""}
                  </p>
                  <button
                    type="button"
                    onClick={() => setCheckAttempt((attempt) => attempt + 1)}
                    className="mt-3 rounded-lg border border-white/30 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
                  >
                    Try again
                  </button>
                </div>
              )}

              {ready && (
                <p className="flex items-center gap-2 text-sm text-emerald-300" role="status">
                  <span aria-hidden="true">✓</span> Steel surface detected. This photo can be scanned.
                </p>
              )}

              {!blockingMessage && (
                <>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-white/80">Scan name</span>
                    <input
                      value={title}
                      onChange={(event) => { setTitle(event.target.value); setError("") }}
                      maxLength={MAX_TITLE_LENGTH}
                      autoFocus
                      className="rounded-lg border bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-white/60"
                      style={{ borderColor: "var(--color-border)" }}
                      placeholder="e.g. Roof truss T-3, north end"
                    />
                    {titleLength > MAX_TITLE_LENGTH - 20 && (
                      <span className="text-right text-[11px] text-white/40">{titleLength}/{MAX_TITLE_LENGTH}</span>
                    )}
                  </label>

                  {presetAsset ? (
                    <div className="rounded-lg bg-white/5 px-3 py-2.5 text-sm leading-6 text-white/80">
                      <p><span className="text-white/50">Asset:</span> <span className="font-semibold text-white">{presetAsset.asset.tag}</span>{presetAsset.asset.name ? ` · ${presetAsset.asset.name}` : ""}</p>
                      <p><span className="text-white/50">Element type:</span> {presetAsset.asset.elementType}</p>
                      <p><span className="text-white/50">Site:</span> {presetAsset.site.name} · exposure {presetAsset.site.environment}</p>
                    </div>
                  ) : (
                    <>
                      <div className={`flex gap-1 rounded-lg p-1 transition-opacity ${dimmed}`} style={{ background: "var(--color-btn)" }} role="group" aria-label="What the scan is for">
                        {([
                          ["asset", "An asset on a site"],
                          ["quick", "Quick scan, no asset"],
                        ] as const).map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            disabled={!ready || (value === "asset" && sites !== null && sites.length === 0)}
                            aria-pressed={mode === value}
                            onClick={() => { setMode(value); setError("") }}
                            className={`min-h-10 flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              mode === value ? "bg-white/15 text-white" : "text-white/60 hover:text-white"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {mode === "asset" ? (
                        <>
                          <label className={`flex flex-col gap-1.5 transition-opacity ${dimmed}`}>
                            <span className="text-sm font-medium text-white/80">Site</span>
                            <select value={siteId} disabled={!ready || !sites} onChange={(event) => { setSiteId(event.target.value); setError("") }} className={selectClass} style={selectStyle}>
                              <option value="" disabled>{sites ? "Choose the site" : "Loading sites…"}</option>
                              {(sites ?? []).map((site) => (
                                <option key={site.id} value={site.id}>{site.name} ({site.environment})</option>
                              ))}
                            </select>
                          </label>
                          <label className={`flex flex-col gap-1.5 transition-opacity ${ready && siteId ? "" : "opacity-40"}`}>
                            <span className="text-sm font-medium text-white/80">Asset</span>
                            <select value={assetId} disabled={!ready || !siteId || !assets} onChange={(event) => { setAssetId(event.target.value); setError("") }} className={selectClass} style={selectStyle}>
                              <option value="" disabled>
                                {!siteId ? "Choose a site first" : !assets ? "Loading assets…" : assets.length === 0 ? "This site has no assets yet" : "Choose the steel element"}
                              </option>
                              {(assets ?? []).map((asset) => (
                                <option key={asset.id} value={asset.id}>{asset.tag}{asset.name ? ` · ${asset.name}` : ""}</option>
                              ))}
                            </select>
                            <span className="text-xs leading-5 text-white/45">
                              {selectedAsset && selectedSite
                                ? `${selectedAsset.elementType}, exposure ${selectedSite.environment}${siteEnvironment ? ` (${siteEnvironment.name})` : ""}. The scan joins this asset's inspection history.`
                                : "New assets are added from the Sites and assets page."}
                            </span>
                          </label>
                        </>
                      ) : (
                        <>
                          <label className={`flex flex-col gap-1.5 transition-opacity ${dimmed}`}>
                            <span className="text-sm font-medium text-white/80">Element type</span>
                            <select value={elementType} disabled={!ready} onChange={(event) => { setElementType(event.target.value); setError("") }} className={selectClass} style={selectStyle}>
                              <option value="" disabled>Choose the type of steel element</option>
                              {scanOptions.elementTypes.map((option) => (
                                <option key={option.name} value={option.name}>{option.name}</option>
                              ))}
                            </select>
                            <span className="text-xs leading-5 text-white/45">
                              {selectedElement ? selectedElement.examples : "It sets what the result tells you to check."}
                            </span>
                          </label>

                          <label className={`flex flex-col gap-1.5 transition-opacity ${dimmed}`}>
                            <span className="text-sm font-medium text-white/80">Exposure environment</span>
                            <select value={environment} disabled={!ready} onChange={(event) => { setEnvironment(event.target.value); setError("") }} className={selectClass} style={selectStyle}>
                              <option value="" disabled>Choose where the element is exposed</option>
                              {scanOptions.environments.map((option) => (
                                <option key={option.code} value={option.code}>{option.code} · {option.name}</option>
                              ))}
                            </select>
                            <span className="text-xs leading-5 text-white/45">
                              {selectedEnvironment
                                ? selectedEnvironment.description
                                : "ISO 12944 corrosivity category. It sets the baseline corrosion rate."}
                            </span>
                          </label>

                          {selectedEnvironment && (
                            <p className="rounded-lg bg-white/5 px-3 py-2.5 text-xs leading-5 text-white/65">
                              In {selectedEnvironment.code}, rust is assumed to grow {selectedEnvironment.ratePerDay}% of the surface per day, about {Math.round(selectedEnvironment.yearsNewToCritical)} years from rust-free to critical. This is a starting assumption, not a measurement. A quick scan has no trend; scan an asset to build one.
                            </p>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t px-5 py-3.5" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            {blockingMessage ? (
              <button type="button" onClick={onCancel} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110" style={{ background: "var(--color-accent)" }}>
                Choose a different photo
              </button>
            ) : (
              <>
                {footerHint && (
                  <p className={`mr-auto text-sm ${error ? "text-red-200" : "text-white/50"}`} role={error ? "alert" : undefined}>
                    {footerHint}
                  </p>
                )}
                <button type="button" onClick={onCancel} className="rounded-lg border px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white" style={{ borderColor: "var(--color-border)" }}>Cancel</button>
                <button type="submit" disabled={blocked || !details} className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40" style={{ background: "var(--color-accent)" }}>
                  {checking ? "Checking photo…" : "Start scan"}
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from "react"
import PageShell, { ActionButton, EmptyState, Notice } from "@/components/PageShell"
import { FormDialog, SiteForm } from "@/components/InventoryForms"
import { useNav } from "@/components/NavContext"
import { ApiError, createSite, getSites } from "@/services/api"
import { errorMessage, withToken } from "@/services/session"
import type { Site, SiteInput } from "@/types"

/** Every site in the organisation. A site is a place with one exposure environment. */
export default function SitesPage() {
  const nav = useNav()
  const [sites, setSites] = useState<Site[] | null>(null)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    setError("")
    try {
      setSites(await withToken(getSites))
    } catch (cause: unknown) {
      if (cause instanceof ApiError && cause.status === 401) return nav.sessionExpired()
      setError(errorMessage(cause, "The sites could not be loaded."))
      setSites([])
    }
    // nav is stable for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const add = async (input: SiteInput) => {
    const site = await withToken((token) => createSite(token, input))
    setAdding(false)
    nav.openSite(site.id)
  }

  const environmentName = (code: string) =>
    nav.scanOptions.environments.find((option) => option.code === code)?.name ?? ""

  return (
    <PageShell
      title="Sites and assets"
      subtitle="A site is a building, plant or project. Its steel elements are its assets, and each asset keeps its own inspection history."
      actions={<ActionButton primary onClick={() => setAdding(true)}>Add a site</ActionButton>}
    >
      {error && <Notice tone="error">{error}</Notice>}
      {sites === null ? (
        <p className="py-16 text-center text-sm text-white/50">Loading sites...</p>
      ) : sites.length === 0 && !error ? (
        <EmptyState
          title="No sites yet"
          text="Add the first site, then list its steel elements as assets. Scans of an asset build its inspection history and its trend."
          action={<ActionButton primary onClick={() => setAdding(true)}>Add a site</ActionButton>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sites.map((site) => (
            <button
              key={site.id}
              type="button"
              onClick={() => nav.openSite(site.id)}
              className="flex flex-col gap-3 rounded-2xl border p-5 text-left transition-colors hover:border-white/40"
              style={{ background: "var(--color-card)", borderColor: "transparent" }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="text-base font-semibold leading-snug text-white">{site.name}</p>
                {site.isDemo && <span className="flex-shrink-0 rounded-full border border-amber-300/50 px-2 py-0.5 text-[11px] text-amber-200">Demo data</span>}
              </div>
              <p className="text-xs text-white/55">{site.location ?? "No location recorded"}</p>
              <div className="mt-auto flex items-center justify-between gap-3 text-xs text-white/70">
                <span className="rounded-full border border-white/20 px-2.5 py-1">{site.environment} · {environmentName(site.environment)}</span>
                <span>{site.assetCount} asset{site.assetCount === 1 ? "" : "s"}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {adding && (
        <FormDialog title="Add a site" onClose={() => setAdding(false)}>
          <SiteForm scanOptions={nav.scanOptions} onSave={add} onCancel={() => setAdding(false)} />
        </FormDialog>
      )}
    </PageShell>
  )
}

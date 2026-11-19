import { BackendStatus } from './components/BackendStatus'

export default function App() {
  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="contour-bg border-b border-ink/20 bg-ink text-paper">
        <div className="mx-auto max-w-5xl px-6 py-10">
          <h1 className="text-3xl font-bold tracking-tight">GeoNexus</h1>
          <p className="mt-2 max-w-xl text-paper/80">
            Agricultural land survey and resurvey management — connecting maps, land and data.
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <p className="mb-8 max-w-prose text-ink/80">
          This is the application foundation. Parcel records, maps, survey workflows and sign-in are not available yet
          and will be added in later development phases.
        </p>
        <BackendStatus />
      </main>

      <footer className="border-t border-ink/15 bg-white/60">
        <p className="mx-auto max-w-5xl px-6 py-4 text-sm text-ink/70">
          GeoNexus is an independent academic project, not an official cadastral or government system. Nothing shown here
          is a certified or legally valid land boundary.
        </p>
      </footer>
    </div>
  )
}

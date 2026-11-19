import { useEffect, useState } from 'react'
import { fetchHealth, type HealthResponse } from '../api/health'

const TIMEOUT_MS = 5000

type State =
  | { kind: 'checking' }
  | { kind: 'up'; health: HealthResponse }
  | { kind: 'down' }

export function BackendStatus() {
  const [state, setState] = useState<State>({ kind: 'checking' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    let unmounted = false
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    fetchHealth(controller.signal)
      .then((health) => {
        if (!unmounted) setState({ kind: 'up', health })
      })
      .catch(() => {
        if (!unmounted) setState({ kind: 'down' })
      })
      .finally(() => clearTimeout(timer))

    return () => {
      unmounted = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [attempt])

  const recheck = () => {
    setState({ kind: 'checking' })
    setAttempt((n) => n + 1)
  }

  return (
    <section aria-labelledby="backend-status-heading" className="rounded-lg border border-ink/15 bg-white p-6 shadow-sm">
      <h2 id="backend-status-heading" className="text-lg font-semibold text-ink">
        Backend connection
      </h2>

      <div role="status" aria-live="polite" className="mt-4 flex items-start gap-3">
        <span
          aria-hidden="true"
          className={
            'mt-1.5 h-3 w-3 shrink-0 rounded-full ' +
            (state.kind === 'up' ? 'bg-emerald-600' : state.kind === 'down' ? 'bg-red-600' : 'animate-pulse bg-amber-500')
          }
        />
        <div>
          {state.kind === 'checking' && <p className="font-medium text-ink">Checking the backend…</p>}
          {state.kind === 'up' && (
            <>
              <p className="font-medium text-ink">Backend is reachable</p>
              <p className="mt-1 text-sm text-ink/70">
                Service <code className="rounded bg-ink/5 px-1">{state.health.service}</code> reported status{' '}
                <code className="rounded bg-ink/5 px-1">{state.health.status}</code>.
              </p>
            </>
          )}
          {state.kind === 'down' && (
            <>
              <p className="font-medium text-ink">Backend is not reachable</p>
              <p className="mt-1 text-sm text-ink/70">
                Start the database and the backend as described in the README, then check again.
              </p>
            </>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={recheck}
        disabled={state.kind === 'checking'}
        className="mt-5 rounded-md border border-ink/30 px-3 py-1.5 text-sm font-medium text-ink hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Check again
      </button>
    </section>
  )
}

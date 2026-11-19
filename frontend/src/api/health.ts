/** Base URL of the backend REST API. Same-origin `/api/v1` by default (proxied by Vite in dev). */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/+$/, '')

export interface HealthResponse {
  status: 'UP'
  service: string
  timestamp: string
}

function isHealthResponse(value: unknown): value is HealthResponse {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return v.status === 'UP' && typeof v.service === 'string' && typeof v.timestamp === 'string'
}

/** Calls `GET /health` and returns the parsed body, or throws if the backend is not healthy. */
export async function fetchHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!response.ok) {
    throw new Error(`Health check failed with HTTP ${response.status}`)
  }
  const body: unknown = await response.json()
  if (!isHealthResponse(body)) {
    throw new Error('Health check returned an unexpected response shape')
  }
  return body
}

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const healthBody = { status: 'UP', service: 'geonexus-backend', timestamp: '2026-01-01T00:00:00Z' }

function mockFetch(impl: () => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App shell', () => {
  it('shows the product name and the academic disclaimer', async () => {
    mockFetch(() => Promise.resolve(Response.json(healthBody)))
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'GeoNexus' })).toBeInTheDocument()
    expect(screen.getByText(/not an official cadastral or government system/i)).toBeInTheDocument()
    await screen.findByText('Backend is reachable')
  })

  it('reports a reachable backend and calls /api/v1/health', async () => {
    const fetchMock = mockFetch(() => Promise.resolve(Response.json(healthBody)))
    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/v1/health', expect.objectContaining({ headers: { Accept: 'application/json' } }))
  })

  it('reports an unreachable backend when the request fails, and can retry', async () => {
    const fetchMock = mockFetch(() => Promise.reject(new TypeError('network down')))
    render(<App />)
    expect(await screen.findByText('Backend is not reachable')).toBeInTheDocument()

    fetchMock.mockImplementation(() => Promise.resolve(Response.json(healthBody)))
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('treats a non-OK HTTP status as unreachable', async () => {
    mockFetch(() => Promise.resolve(new Response('boom', { status: 503 })))
    render(<App />)
    expect(await screen.findByText('Backend is not reachable')).toBeInTheDocument()
  })

  it('rejects an unexpected response shape', async () => {
    mockFetch(() => Promise.resolve(Response.json({ status: 'DOWN' })))
    render(<App />)
    await waitFor(() => expect(screen.getByText('Backend is not reachable')).toBeInTheDocument())
  })
})

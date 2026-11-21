import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const healthBody = { status: 'UP', service: 'geonexus-backend', timestamp: '2026-01-01T00:00:00Z' }
const parcelsBody = {
  content: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      parcelCode: 'PR-2024-0412',
      name: 'Kothapeta Block 3',
      village: 'Kothapeta',
      district: 'Guntur',
      state: 'Andhra Pradesh',
      landUse: 'AGRICULTURAL',
      status: 'DRAFT',
      currentAreaSqM: 142850.0,
      currentVersionNo: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  ],
  page: 0,
  size: 10,
  totalElements: 1,
  totalPages: 1,
  last: true
}

function mockFetch(impl: (url: string) => Promise<Response>) {
  const fn = vi.fn(impl)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App shell', () => {
  it('shows the product name and the academic disclaimer', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/parcels')) return Promise.resolve(Response.json(parcelsBody))
      return Promise.reject(new Error('Unknown url'))
    })
    render(<App />)
    expect(screen.getByRole('heading', { level: 1, name: 'GeoNexus' })).toBeInTheDocument()
    expect(screen.getByText(/not an official cadastral or government system/i)).toBeInTheDocument()
    await screen.findByText('Backend is reachable')
  })

  it('reports a reachable backend and calls /api/v1/health', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })
    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/health',
      expect.objectContaining({ headers: { Accept: 'application/json' } })
    )
  })

  it('reports an unreachable backend when health check fails, and can retry', async () => {
    const fetchMock = mockFetch((url) => {
      if (url.includes('/health')) return Promise.reject(new TypeError('network down'))
      return Promise.resolve(Response.json(parcelsBody))
    })
    render(<App />)
    expect(await screen.findByText('Backend is not reachable')).toBeInTheDocument()

    fetchMock.mockImplementation((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })
    await userEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()
  })

  it('navigates between views and displays Stitch design sections', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })
    render(<App />)

    // Open map workspace
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))
    expect(screen.getByText('Parcel review canvas')).toBeInTheDocument()

    // Open boundary review
    await userEvent.click(screen.getByRole('button', { name: '◫Boundary review' }))
    expect(screen.getByText('Boundary comparison')).toBeInTheDocument()
    expect(screen.getByText('Vertex change ledger')).toBeInTheDocument()

    // Open parcels dossier
    await userEvent.click(screen.getByRole('button', { name: '◇Parcels' }))
    expect(screen.getByText(/Parcel dossier:/)).toBeInTheDocument()
  })

  it('renders dynamic SVG geometry paths from GeoJSON coordinates', async () => {
    const detailWithGeom = {
      id: '00000000-0000-0000-0000-000000000001',
      parcelCode: 'PR-2024-0412',
      name: 'Kothapeta Block 3',
      district: 'Guntur',
      state: 'Andhra Pradesh',
      status: 'UNDER_REVIEW',
      currentGeometry: {
        id: 'g-1',
        parcelId: '00000000-0000-0000-0000-000000000001',
        versionNo: 1,
        status: 'VERIFIED',
        areaSqM: 142850.0,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [80.4312, 16.3021],
              [80.4355, 16.3025],
              [80.4348, 16.2985],
              [80.4305, 16.2981],
              [80.4312, 16.3021]
            ]
          ]
        }
      }
    }
    const historyWithProposed = [
      {
        id: 'g-2',
        parcelId: '00000000-0000-0000-0000-000000000001',
        versionNo: 2,
        status: 'PROPOSED',
        areaSqM: 144120.0,
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [80.431, 16.3023],
              [80.4357, 16.3027],
              [80.4349, 16.2984],
              [80.4303, 16.298],
              [80.431, 16.3023]
            ]
          ]
        }
      }
    ]

    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/geometries')) return Promise.resolve(Response.json(historyWithProposed))
      if (url.includes('/parcels/00000000-0000-0000-0000-000000000001')) {
        return Promise.resolve(Response.json(detailWithGeom))
      }
      if (url.includes('/parcels')) return Promise.resolve(Response.json(parcelsBody))
      return Promise.reject(new Error('Unknown url: ' + url))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))
    expect(screen.getByText('Parcel review canvas')).toBeInTheDocument()

    // Verify SVG contains dynamic paths for recorded and proposed geometries
    const svg = screen.getByRole('img', { name: /recorded and proposed parcel boundaries/i })
    expect(svg).toBeInTheDocument()
    const recordedPath = svg.querySelector('path.recorded')
    const proposedPath = svg.querySelector('path.proposed')
    expect(recordedPath).toBeInTheDocument()
    expect(proposedPath).toBeInTheDocument()
    expect(recordedPath?.getAttribute('d')).toMatch(/^M\s*\d+/)
    expect(proposedPath?.getAttribute('d')).toMatch(/^M\s*\d+/)
  })

  it('renders graceful empty state when parcel has no recorded geometry', async () => {
    const detailWithoutGeom = {
      id: '00000000-0000-0000-0000-000000000001',
      parcelCode: 'PR-2024-0412',
      name: 'Unsurveyed Parcel',
      district: 'Guntur',
      state: 'Andhra Pradesh',
      status: 'DRAFT',
      currentGeometry: null
    }

    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/geometries')) return Promise.resolve(Response.json([]))
      if (url.includes('/parcels/00000000-0000-0000-0000-000000000001')) {
        return Promise.resolve(Response.json(detailWithoutGeom))
      }
      if (url.includes('/parcels')) return Promise.resolve(Response.json(parcelsBody))
      return Promise.reject(new Error('Unknown url: ' + url))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))
    expect(await screen.findByText('No Verified Boundary Registered')).toBeInTheDocument()
    expect(screen.getByText(/does not have verified boundary coordinates/i)).toBeInTheDocument()
    expect(screen.getByText('＋ Propose Initial Boundary')).toBeInTheDocument()
  })

  it('renders graceful error state when geometry fetch fails', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/parcels/00000000-0000-0000-0000-000000000001')) {
        return Promise.reject(new Error('PostGIS service unreachable'))
      }
      if (url.includes('/parcels')) return Promise.resolve(Response.json(parcelsBody))
      return Promise.reject(new Error('Unknown url: ' + url))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))
    expect(await screen.findByText('⚠ Geometry Loading Error')).toBeInTheDocument()
    expect(screen.getByText('PostGIS service unreachable')).toBeInTheDocument()
  })
})

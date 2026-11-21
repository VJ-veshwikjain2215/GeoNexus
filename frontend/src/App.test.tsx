import { render, screen, within } from '@testing-library/react'
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

const multiParcelsBody = {
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
    },
    {
      id: '00000000-0000-0000-0000-000000000002',
      parcelCode: 'PR-2024-0389',
      name: 'Mylavaram Sector 1',
      village: 'Mylavaram',
      district: 'NTR',
      state: 'Andhra Pradesh',
      landUse: 'AGRICULTURAL',
      status: 'ACTIVE',
      currentAreaSqM: 81000.0,
      currentVersionNo: 1,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z'
    }
  ],
  page: 0,
  size: 10,
  totalElements: 2,
  totalPages: 1,
  last: true
}

const defaultDetailWithGeom = {
  id: '00000000-0000-0000-0000-000000000001',
  parcelCode: 'PR-2024-0412',
  name: 'Kothapeta Block 3',
  village: 'Kothapeta',
  district: 'Guntur',
  state: 'Andhra Pradesh',
  landUse: 'AGRICULTURAL',
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

const dossierBody = {
  parcelId: '00000000-0000-0000-0000-000000000001',
  parcelCode: 'PR-2024-0412',
  name: 'Kothapeta Block 3',
  village: 'Kothapeta',
  taluk: 'Guntur Rural',
  district: 'Guntur',
  state: 'Andhra Pradesh',
  landUse: 'AGRICULTURAL',
  status: 'VERIFIED',
  areaHa: 14.285,
  areaSqM: 142850.0,
  perimeterM: 1540.2,
  verticesCount: 4,
  stations: [
    { station: 'ST-01', longitude: 80.4312, latitude: 16.3021, eastingUtm44: 439200.0, northingUtm44: 1802500.0, elevationM: 28.4, status: 'VERIFIED' }
  ],
  history: [],
  verificationHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  crs: 'EPSG:4326 / EPSG:32644 (UTM 44N)',
  precisionTolerance: '± 0.015 m',
  disclaimer: 'ACADEMIC RESEARCH AID',
  generatedAt: '2026-11-21T10:00:00Z'
}

const comparisonBody = {
  parcelId: '00000000-0000-0000-0000-000000000001',
  parcelCode: 'PR-2024-0412',
  locality: 'Kothapeta Block 3',
  district: 'Guntur',
  baselineVersionNo: 1,
  proposedVersionNo: 2,
  baselineAreaHa: 14.285,
  proposedAreaHa: 14.415,
  areaDeltaHa: 0.13,
  areaDeltaPercent: 0.91,
  varianceClassification: 'SILT_DRIFT_VARIANCE',
  withinTolerance: true,
  maxDisplacementM: 4.82,
  averageDisplacementM: 2.14,
  displacements: [
    { station: 'ST-01', lonBaseline: 80.4312, latBaseline: 16.3021, lonProposed: 80.431, latProposed: 16.3024, shiftDistanceM: 4.8, status: 'DISPLACED' }
  ],
  surveyorNotes: 'Resurvey traverse indicates silt deposition.',
  adjudicationDirective: 'RECOMMEND_SEAL',
  status: 'UNDER_REVIEW',
  reviewedBy: 'Dr. E. Vance',
  reviewedAt: '2026-11-21T10:00:00Z',
  crs: 'EPSG:4326 / EPSG:32644 (UTM 44N)',
  precisionTolerance: '± 0.015 m',
  disclaimer: 'ACADEMIC RESEARCH AID',
  generatedAt: '2026-11-21T10:00:00Z'
}

const auditPageBody = {
  content: [
    {
      id: 1001,
      occurredAt: '2026-11-21T14:22:05Z',
      actorUsername: 'K. Ramachandran',
      action: 'GEOMETRY_VERIFIED',
      outcome: 'SUCCESS',
      parcelCode: 'PR-2024-0365',
      integrityHash: '9f72b834dc015ae3218765432109876543210987654321098765432109876c41'
    },
    {
      id: 1002,
      occurredAt: '2026-11-21T11:05:32Z',
      actorUsername: 'P. Suresh',
      action: 'COORDINATE_INGESTED',
      outcome: 'SUCCESS',
      parcelCode: 'PR-2024-0428',
      integrityHash: '4a1f2b6838459f72b834dc015ae3218765432109876543210987654321098765'
    },
    {
      id: 1003,
      occurredAt: '2026-11-20T17:40:19Z',
      actorUsername: 'S. Varma',
      action: 'GEOMETRY_REJECTED',
      outcome: 'FAILURE',
      parcelCode: 'PR-2024-0389',
      integrityHash: 'ba1a1a741f064a1f2b6838459f72b834dc015ae3218765432109876543210987'
    },
    {
      id: 1004,
      occurredAt: '2026-10-12T09:15:00Z',
      actorUsername: 'Director Cadastre',
      action: 'BASELINE_IMPORT',
      outcome: 'SUCCESS',
      parcelCode: 'PR-2024-0412',
      integrityHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    }
  ],
  page: 0,
  size: 20,
  totalElements: 4,
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

  it('clearly labels static dashboard metrics and activity as demonstration data', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    // Dashboard metrics
    expect(screen.getByRole('region', { name: /Demonstration operations metrics/i })).toBeInTheDocument()
    expect(screen.getByText('14 awaiting review (simulated)')).toBeInTheDocument()
    const demoTags = screen.getAllByText('[Demo]')
    expect(demoTags.length).toBeGreaterThanOrEqual(4)

    // Activity feed
    expect(screen.getByText('[Demonstration activity log]')).toBeInTheDocument()
    expect(screen.getByText(/PR-2024-0412 demonstration traverse/i)).toBeInTheDocument()
  })

  it('dynamically filters parcels with global search and displays empty state and clear button', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(multiParcelsBody))
    })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()
    expect(await screen.findByText('PR-2024-0412')).toBeInTheDocument()
    expect(screen.getByText('PR-2024-0389')).toBeInTheDocument()

    const searchInput = screen.getByLabelText('Search parcels')

    // Filter to Mylavaram
    await userEvent.type(searchInput, 'Mylavaram')
    expect(screen.getByText('PR-2024-0389')).toBeInTheDocument()
    expect(screen.queryByText('PR-2024-0412')).not.toBeInTheDocument()
    expect(screen.getByText('Filtered queue (1 match)')).toBeInTheDocument()

    // Filter to non-matching string
    await userEvent.clear(searchInput)
    await userEvent.type(searchInput, 'NonExistentLocality')
    expect(screen.getByText('No parcels found matching your search.')).toBeInTheDocument()
    expect(screen.getByText('Filtered queue (0 matches)')).toBeInTheDocument()

    // Clear search using clear button
    const clearButton = screen.getByRole('button', { name: 'Clear search' })
    await userEvent.click(clearButton)
    expect(searchInput).toHaveValue('')
    expect(screen.getByText('PR-2024-0412')).toBeInTheDocument()
    expect(screen.getByText('PR-2024-0389')).toBeInTheDocument()
  })

  it('navigates to parcel view when Enter key is pressed in search input', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/parcels/00000000-0000-0000-0000-000000000002')) {
        return Promise.resolve(Response.json(multiParcelsBody.content[1]))
      }
      if (url.includes('/parcels/00000000-0000-0000-0000-000000000001')) {
        return Promise.resolve(Response.json(multiParcelsBody.content[0]))
      }
      if (url.includes('/geometries')) {
        return Promise.resolve(Response.json([]))
      }
      return Promise.resolve(Response.json(multiParcelsBody))
    })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    const searchInput = screen.getByLabelText('Search parcels')
    await userEvent.type(searchInput, 'PR-2024-0389{enter}')

    // Verify view shifted to parcel inspection dossier
    expect(await screen.findByText(/Parcel dossier: PR-2024-0389/i)).toBeInTheDocument()
  })

  it('exports vertex change ledger as CSV when Export CSV is clicked in Boundary review', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL')

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '◫Boundary review' }))
    expect(screen.getByText('Vertex change ledger')).toBeInTheDocument()

    const exportBtn = screen.getByRole('button', { name: 'Export vertex ledger as CSV' })
    await userEvent.click(exportBtn)

    expect(createObjectURLSpy).toHaveBeenCalled()
    expect(revokeObjectURLSpy).toHaveBeenCalled()
  })

  it('controls map zoom and scale bar dynamically in Map Workspace', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/parcels/00000000-0000-0000-0000-000000000001')) {
        return Promise.resolve(Response.json(defaultDetailWithGeom))
      }
      if (url.includes('/geometries')) {
        return Promise.resolve(Response.json([]))
      }
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))
    expect(screen.getByText('Parcel review canvas')).toBeInTheDocument()

    // Default scale
    expect(await screen.findByText('SCALE 1:2500')).toBeInTheDocument()

    // Zoom in (+0.25 => 1.25 => 2500/1.25 = 2000)
    const zoomInBtn = screen.getByRole('button', { name: 'Zoom in' })
    await userEvent.click(zoomInBtn)
    expect(screen.getByText('SCALE 1:2000')).toBeInTheDocument()

    // Zoom out (-0.25 => 1.0 => 2500, then again => 0.75 => 2500/0.75 = 3333)
    const zoomOutBtn = screen.getByRole('button', { name: 'Zoom out' })
    await userEvent.click(zoomOutBtn)
    expect(screen.getByText('SCALE 1:2500')).toBeInTheDocument()
    await userEvent.click(zoomOutBtn)
    expect(screen.getByText('SCALE 1:3333')).toBeInTheDocument()

    // Fit extent resets to 1.0
    const fitBtn = screen.getByRole('button', { name: 'Fit extent' })
    await userEvent.click(fitBtn)
    expect(screen.getByText('SCALE 1:2500')).toBeInTheDocument()
  })

  it('toggles spatial layers and updates active layer badge in Map Workspace', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/parcels/00000000-0000-0000-0000-000000000001')) {
        return Promise.resolve(Response.json(defaultDetailWithGeom))
      }
      if (url.includes('/geometries')) {
        return Promise.resolve(Response.json([]))
      }
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))

    // Initial active layer count is 5 (topo contours defaults to unchecked)
    expect(await screen.findByText('5 ACTIVE')).toBeInTheDocument()

    // Toggle Topo Contours ON
    const contoursCheckbox = screen.getByRole('checkbox', { name: /Contours \(0\.5m interval\)/i })
    await userEvent.click(contoursCheckbox)
    expect(screen.getByText('6 ACTIVE')).toBeInTheDocument()

    // Toggle Registered Parcels OFF
    const registeredCheckbox = screen.getByRole('checkbox', { name: /Registered Parcels/i })
    await userEvent.click(registeredCheckbox)
    expect(screen.getByText('5 ACTIVE')).toBeInTheDocument()
  })

  it('toggles distance measurement caliper display with dynamic measurement in Map Workspace (MAP-01)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/parcels/00000000-0000-0000-0000-000000000001')) {
        return Promise.resolve(Response.json(defaultDetailWithGeom))
      }
      if (url.includes('/geometries')) {
        return Promise.resolve(Response.json([]))
      }
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))

    // Measurement vector readout is present initially with dynamic meter formatting
    const caliperBtn = screen.getByRole('button', { name: 'Distance measurement' })
    expect(caliperBtn).toBeInTheDocument()
    expect(caliperBtn.textContent).toMatch(/(\d+\.\d+)\s*m/)

    // Click caliper button to toggle OFF
    await userEvent.click(caliperBtn)
    const svg = screen.getByRole('img', { name: /recorded and proposed parcel boundaries/i })
    expect(svg.querySelector('.measurement-vector')).toBeNull()

    // Click caliper button to toggle ON again
    await userEvent.click(caliperBtn)
    expect(svg.querySelector('.measurement-vector')).not.toBeNull()
  })

  it('renders authentic UTM Easting and Northing coordinates in station table (GEO-06)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/parcels/00000000-0000-0000-0000-000000000001')) {
        return Promise.resolve(Response.json(defaultDetailWithGeom))
      }
      if (url.includes('/spatial-analysis')) {
        return Promise.resolve(
          Response.json({
            parcelId: '00000000-0000-0000-0000-000000000001',
            parcelCode: 'PR-2024-0412',
            recordedAreaHa: 14.285,
            perimeterM: 1894.2,
            isValidTopology: true,
            overlappingParcelsCount: 0,
            stationDisplacements: [
              {
                station: 'ST-01',
                lonExisting: 80.4312,
                latExisting: 16.3021,
                lonProposed: 80.431,
                latProposed: 16.3024,
                shiftDistanceM: 1.2
              }
            ]
          })
        )
      }
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))

    // Easting should be formatted in meters (e.g. around 439,xxx m)
    const eastings = await screen.findAllByText(/439,\d{3}\.\d{2}\s*m/)
    expect(eastings.length).toBeGreaterThan(0)
    // Northing should be formatted in meters (e.g. around 1,802,xxx m)
    const northings = await screen.findAllByText(/1,802,\d{3}\.\d{2}\s*m/)
    expect(northings.length).toBeGreaterThan(0)
  })

  it('displays correct EPSG:4326 (UTM 44N) CRS in Map Workspace (UI-02)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))

    expect(await screen.findByText('CRS: EPSG:4326 (UTM 44N)')).toBeInTheDocument()
  })

  it('provides mobile view switcher tabs for responsive fidelity (UI-03)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))

    const mapTab = screen.getByRole('button', { name: '⌑ Map View' })
    const layersTab = screen.getByRole('button', { name: /▤ Layers/i })
    const inspectorTab = screen.getByRole('button', { name: 'ℹ Inspector' })

    expect(mapTab).toBeInTheDocument()
    expect(layersTab).toBeInTheDocument()
    expect(inspectorTab).toBeInTheDocument()

    await userEvent.click(layersTab)
    expect(layersTab).toHaveClass('active')
  })

  it('binds live spatial analysis diagnostics in BoundaryView (UI-01)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/spatial-analysis')) {
        return Promise.resolve(
          Response.json({
            parcelId: '00000000-0000-0000-0000-000000000001',
            parcelCode: 'PR-2024-0412',
            recordedAreaSqM: 142850.0,
            recordedAreaHa: 14.285,
            proposedAreaSqM: 144120.0,
            proposedAreaHa: 14.412,
            areaDeltaSqM: 1270.0,
            areaDeltaPercentage: 0.89,
            perimeterM: 1894.2,
            stationCount: 4,
            isValidTopology: true,
            polygonClosureDeltaM: 0.000,
            selfIntersectionViolations: 0,
            adjacentCollisionOverlaps: 0,
            overlappingParcels: [],
            overlappingParcelsCount: 0,
            maxDisplacementM: 2.4,
            averageDisplacementM: 1.1,
            stationDisplacements: []
          })
        )
      }
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '◫Boundary review' }))

    expect(await screen.findByText('Boundary comparison')).toBeInTheDocument()
    expect(await screen.findByText(/0\.000\s*m/)).toBeInTheDocument()
    expect(await screen.findByText(/2\.40\s*m shift/)).toBeInTheDocument()
  })

  it('exports parcel boundary GeoJSON feature safely without fabricating geometry (MAP-05)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL')
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL')

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))

    const exportGeoJsonBtn = screen.getByRole('button', { name: 'Export parcel boundary GeoJSON' })
    await userEvent.click(exportGeoJsonBtn)

    expect(createObjectURLSpy).toHaveBeenCalled()
    expect(revokeObjectURLSpy).toHaveBeenCalled()
  })

  it('renders AI Boundary Assistant controls, slider, and disclaimer in Map Workspace (Phase 7)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))

    expect(await screen.findByText('AI Boundary Assistant')).toBeInTheDocument()
    expect(screen.getByText(/AI-suggested field edges are assistive drafts/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run AI Edge Detection' })).toBeInTheDocument()
    expect(screen.getByLabelText('AI edge detection sensitivity')).toBeInTheDocument()
  })

  it('executes AI edge extraction, displays candidate metrics, and submits proposal (Phase 7)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/ai-boundary/detect')) {
        return Promise.resolve(
          Response.json({
            parcelId: '00000000-0000-0000-0000-000000000001',
            parcelCode: 'PR-2024-0412',
            detectionId: 'DET-AI-9999',
            algorithm: 'CANNY_CONTOUR_BUND_SEGMENTATION_V1',
            imagerySource: 'Drone Orthomosaic (Synthetic)',
            confidence: 0.915,
            qualityScore: 0.89,
            edgeSharpness: 0.92,
            detectedAt: '2026-11-21T12:00:00Z',
            detectedAreaSqM: 144120.0,
            detectedAreaHa: 14.412,
            recordedAreaSqM: 142850.0,
            recordedAreaHa: 14.285,
            areaDeltaSqM: 1270.0,
            areaDeltaPercentage: 0.89,
            detectedGeometry: {
              type: 'Polygon',
              coordinates: [
                [
                  [80.4310, 16.3024],
                  [80.4358, 16.3027],
                  [80.4352, 16.2982],
                  [80.4303, 16.2979],
                  [80.4310, 16.3024]
                ]
              ]
            },
            detectedStations: [
              { station: 'AI-01', longitude: 80.4310, latitude: 16.3024, edgeConfidence: 0.94, displacementFromRecordedM: 1.2 }
            ],
            academicDisclaimer: 'ACADEMIC EXPERIMENTAL AID',
            status: 'PROPOSED_ASSISTIVE_DRAFT'
          })
        )
      }
      if (url.includes('/ai-boundary/propose')) {
        return Promise.resolve(
          Response.json({
            id: 'geom-ai-01',
            parcelId: '00000000-0000-0000-0000-000000000001',
            versionNo: 2,
            source: 'AI_DETECTED',
            confidence: 0.915,
            status: 'PROPOSED'
          })
        )
      }
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '⌑Map workspace' }))

    const detectBtn = screen.getByRole('button', { name: 'Run AI Edge Detection' })
    await userEvent.click(detectBtn)

    expect(await screen.findByText('91.5% Confidence')).toBeInTheDocument()
    const detectedAreas = await screen.findAllByText('14.412 ha')
    expect(detectedAreas.length).toBeGreaterThan(0)

    const acceptBtn = screen.getByRole('button', { name: 'Accept as Resurvey Proposal →' })
    expect(acceptBtn).toBeInTheDocument()

    await userEvent.click(acceptBtn)
    expect(await screen.findByRole('status')).toBeInTheDocument()
  })

  it('displays AI_DETECTED provenance badge and warning alert in Boundary review when proposal is AI-derived (Phase 7)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/geometries')) {
        return Promise.resolve(
          Response.json([
            {
              id: 'geom-01',
              parcelId: '00000000-0000-0000-0000-000000000001',
              versionNo: 2,
              status: 'PROPOSED',
              source: 'AI_DETECTED',
              confidence: 0.915,
              geometry: {
                type: 'Polygon',
                coordinates: [
                  [
                    [80.4310, 16.3024],
                    [80.4358, 16.3027],
                    [80.4352, 16.2982],
                    [80.4303, 16.2979],
                    [80.4310, 16.3024]
                  ]
                ]
              }
            }
          ])
        )
      }
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: '◫Boundary review' }))

    expect(await screen.findByText(/Assistive AI Boundary Suggestion/i)).toBeInTheDocument()
    expect(screen.getByText('AI_DETECTED')).toBeInTheDocument()
  })

  it('renders Phase 8 Analytics Dashboard with legal ribbon, KPI cards, and sub-metric breakdowns', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/analytics/dashboard')) {
        return Promise.resolve(
          Response.json({
            summary: {
              totalParcels: 4,
              inFlightResurveysCount: 42,
              flaggedForReviewCount: 18,
              validationsPassedMtd: 184,
              activeGeodeticPillars: 36,
              firstPassRatePercent: 99.1,
              meanRmseM: 0.004,
              dataSource: 'LIVE_DATABASE_AGGREGATION'
            },
            areaDistribution: [
              { rangeLabel: '< 2 ha', category: 'Marginal', parcelCount: 1, totalAreaHa: 1.85, percentage: 12.5 },
              { rangeLabel: '2 – 5 ha', category: 'Small', parcelCount: 2, totalAreaHa: 7.6, percentage: 25.0 }
            ],
            administrativeBreakdown: [
              {
                subdistrict: 'Kothapeta High Basin',
                taluk: 'Kothapeta',
                district: 'Guntur',
                totalTargetParcels: 1240,
                completedAndSealed: 1098,
                underActiveSurvey: 142,
                completionPercentage: 88.5,
                groundStatus: 'On Schedule',
                leadSurveyor: 'Dr. E. Vance',
                isSyntheticTarget: true
              }
            ],
            boundaryVariance: { totalProposalsEvaluated: 14, avgDeltaHa: 0.12, flaggedVarianceCount: 3 },
            actionableInsights: [
              {
                id: 'INS-01',
                severity: 'WARNING',
                title: 'Area Drift Exceeds Statutory Tolerance (PR-2024-0412)',
                description: 'Proposed resurvey indicates +0.13 ha gain.',
                recommendedAction: 'Mandatory Senior Reviewer physical inspection required.'
              }
            ],
            recentActivity: [],
            seasonalTrends: [],
            crs: 'EPSG:4326 / EPSG:32644',
            precisionTolerance: '± 0.015 m',
            disclaimer: 'LEGAL & SCHOLARLY NOTICE',
            generatedAt: new Date().toISOString()
          })
        )
      }
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    // Legal notice ribbon
    expect(screen.getByText(/LEGAL & SCHOLARLY NOTICE:/i)).toBeInTheDocument()
    expect(screen.getByText(/SURVEY STAMP: 2024-Q4.8/i)).toBeInTheDocument()

    // Metric sub-breakdowns
    expect(screen.getByText('14 Awaiting Rev.')).toBeInTheDocument()
    expect(screen.getByText('9 Area Var >0.5%')).toBeInTheDocument()
    expect(screen.getByText('99.1% First-Pass')).toBeInTheDocument()
    expect(screen.getByText('100% Signal')).toBeInTheDocument()
  })

  it('filters Priority Action Queue with interactive pills and navigates to boundary review (Phase 8)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    // Priority Action Queue rows
    expect(screen.getByText('Kothapeta Block 3')).toBeInTheDocument()
    expect(screen.getByText('Mylavaram Sector 1')).toBeInTheDocument()

    // Filter by Disputed
    const disputedPill = screen.getByRole('button', { name: /Disputed \(1\)/i })
    await userEvent.click(disputedPill)
    expect(screen.getByText('Mylavaram Sector 1')).toBeInTheDocument()
    expect(screen.queryByText('Kothapeta Block 3')).not.toBeInTheDocument()

    // Filter by Silt Shift
    const siltPill = screen.getByRole('button', { name: /Silt Shift \(1\)/i })
    await userEvent.click(siltPill)
    expect(screen.getByText('Kothapeta Block 3')).toBeInTheDocument()
    expect(screen.queryByText('Mylavaram Sector 1')).not.toBeInTheDocument()

    // Reset to All
    const allPill = screen.getByRole('button', { name: /All \(4\)/i })
    await userEvent.click(allPill)
    expect(screen.getByText('Kothapeta Block 3')).toBeInTheDocument()
    expect(screen.getByText('Mylavaram Sector 1')).toBeInTheDocument()

    // Click Compare on first row
    const compareButtons = screen.getAllByRole('button', { name: /Compare/i })
    await userEvent.click(compareButtons[0])

    // Should navigate to boundary review
    expect(await screen.findByText('Boundary comparison')).toBeInTheDocument()
  })

  it('renders Agricultural Area Distribution and Actionable Insights (Phase 8)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    // Area distribution
    expect(screen.getByText(/Agricultural holding size distribution/i)).toBeInTheDocument()
    expect(screen.getByText(/Marginal/i)).toBeInTheDocument()
    expect(screen.getByText(/Semi-Medium/i)).toBeInTheDocument()

    // Actionable insights
    expect(screen.getByText(/Actionable cadastral insights/i)).toBeInTheDocument()
    expect(screen.getByText(/Area Drift Exceeds Statutory Tolerance/i)).toBeInTheDocument()
    expect(screen.getByText(/Adjoining Line Conflict/i)).toBeInTheDocument()
    expect(screen.getByText(/Mandatory Senior Reviewer physical inspection/i)).toBeInTheDocument()
  })

  it('renders Cadastral Audit Ledger and Seasonal Subdistrict Progress Table (Phase 8)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    // Ledger icons & entries
    expect(screen.getByText('Cadastral audit ledger')).toBeInTheDocument()
    expect(screen.getByText('OK')).toBeInTheDocument()
    expect(screen.getByText('PT')).toBeInTheDocument()
    expect(screen.getByText('REJ')).toBeInTheDocument()
    expect(screen.getByText('IMP')).toBeInTheDocument()
    expect(screen.getByText(/Resurvey Certified/i)).toBeInTheDocument()
    expect(screen.getByText(/DGPS Coordinates Ingested/i)).toBeInTheDocument()
    expect(screen.getByText(/Closure Error Trip Rejection/i)).toBeInTheDocument()

    // Seasonal progress subdistricts
    expect(screen.getByText(/Survey completion & resurvey trend/i)).toBeInTheDocument()
    expect(screen.getByText('Kothapeta High Basin')).toBeInTheDocument()
    expect(screen.getByText('Mylavaram Riparian Corridor')).toBeInTheDocument()
    expect(screen.getByText('Nuzvid Orchard Belt')).toBeInTheDocument()
    expect(screen.getByText('Tiruvuru Lower Canal Zone')).toBeInTheDocument()
    expect(screen.getByText('Vissannapeta Uplands')).toBeInTheDocument()
    expect(screen.getByText('Gampalagudem West')).toBeInTheDocument()
    expect(screen.getByText('Delayed by Monsoon')).toBeInTheDocument()
    expect(screen.getAllByText('On Schedule').length).toBeGreaterThanOrEqual(1)
  })

  it('triggers Adjudication Docket CSV download on Export Docket click (Phase 8)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURLMock = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    const exportBtn = screen.getByRole('button', { name: /Export Docket \(CSV\)/i })
    await userEvent.click(exportBtn)

    expect(createObjectURLMock).toHaveBeenCalled()
    expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-url')
  })

  it('navigates to Reports view and renders official Cadastral Parcel Dossier with UTM 44N stations (Phase 9)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/boundary-comparison')) return Promise.resolve(Response.json(comparisonBody))
      if (url.includes('/reports/parcels')) return Promise.resolve(Response.json(dossierBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    // Click Reports in sidebar navigation
    const reportsNav = screen.getByRole('button', { name: /Reports/i })
    await userEvent.click(reportsNav)

    // Verify official header and metadata
    expect(await screen.findByText(/OFFICIAL CADASTRAL PARCEL DOSSIER & BOUNDARY LEDGER/i)).toBeInTheDocument()
    expect(screen.getByText(/STATE OF ANDHRA PRADESH • DISTRICT 4 CADASTRAL SETTLEMENT/i)).toBeInTheDocument()
    expect(screen.getByText(/1. Cadastral Land Holding Dossier/i)).toBeInTheDocument()
    expect(screen.getAllByText(/PR-2024-0412/i).length).toBeGreaterThan(0)

    // Verify UTM Zone 44N stations ledger
    expect(screen.getByText(/3. Geodetic Corner Stations Ledger/i)).toBeInTheDocument()
    expect(screen.getByText(/Easting UTM 44N \(m\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Northing UTM 44N \(m\)/i)).toBeInTheDocument()
    expect(screen.getByText('ST-01')).toBeInTheDocument()

    // Verify four-eyes sign-off & disclaimer
    expect(screen.getByText(/Field Cadastral Surveyor/i)).toBeInTheDocument()
    expect(screen.getByText(/Senior Cadastral Review Officer/i)).toBeInTheDocument()
    expect(screen.getByText(/LEGAL & SCHOLARLY DISCLAIMER:/i)).toBeInTheDocument()
  })

  it('switches tabs in Reports view and executes print and download exports (Phase 9)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/boundary-comparison')) return Promise.resolve(Response.json(comparisonBody))
      if (url.includes('/reports/parcels')) return Promise.resolve(Response.json(dossierBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    const printMock = vi.fn()
    window.print = printMock

    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURLMock = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Reports/i }))
    expect(await screen.findByText(/OFFICIAL CADASTRAL PARCEL DOSSIER/i)).toBeInTheDocument()

    // Switch to Boundary Comparison tab
    const compTab = screen.getByRole('button', { name: /Boundary Comparison & Variance/i })
    await userEvent.click(compTab)
    expect(screen.getByText(/ADJUDICATION & BOUNDARY COMPARISON REPORT/i)).toBeInTheDocument()
    expect(screen.getByText(/Tolerance Directive:/i)).toBeInTheDocument()

    // Switch to Corner Stations Ledger tab
    const stationTab = screen.getByRole('button', { name: /Corner Stations Ledger/i })
    await userEvent.click(stationTab)
    expect(screen.getByText(/GEODETIC CORNER STATIONS & UTM ZONE 44N LEDGER/i)).toBeInTheDocument()

    // Click Print / PDF
    const printBtn = screen.getByRole('button', { name: /Print \/ PDF/i })
    await userEvent.click(printBtn)
    expect(printMock).toHaveBeenCalled()

    // Click Station CSV
    const csvBtn = screen.getByRole('button', { name: /Station CSV/i })
    await userEvent.click(csvBtn)
    expect(createObjectURLMock).toHaveBeenCalled()

    // Click GeoJSON
    const geoJsonBtn = screen.getByRole('button', { name: /GeoJSON/i })
    await userEvent.click(geoJsonBtn)
    expect(createObjectURLMock).toHaveBeenCalled()
  })

  it('navigates to Audit history, filters actions and exports audit ledger CSV (Phase 9)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/reports/audit')) return Promise.resolve(Response.json(auditPageBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    const createObjectURLMock = vi.fn().mockReturnValue('blob:mock-url')
    const revokeObjectURLMock = vi.fn()
    vi.stubGlobal('URL', { createObjectURL: createObjectURLMock, revokeObjectURL: revokeObjectURLMock })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    // Click Audit history in sidebar navigation
    const auditNav = screen.getByRole('button', { name: /Audit history/i })
    await userEvent.click(auditNav)

    // Verify title and immutable ledger
    expect(await screen.findByText('Audit history & traceability')).toBeInTheDocument()
    expect(screen.getByText(/Cryptographically verifiable record of all boundary proposals/i)).toBeInTheDocument()

    // Verify audit rows & badges
    expect(screen.getAllByText('GEOMETRY_VERIFIED').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('COORDINATE_INGESTED').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('GEOMETRY_REJECTED').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('BASELINE_IMPORT').length).toBeGreaterThanOrEqual(1)

    // Search filter
    const searchInput = screen.getByPlaceholderText(/Search parcel, actor, action, or hash…/i)
    await userEvent.type(searchInput, 'PR-2024-0365')
    expect(screen.getByText('PR-2024-0365')).toBeInTheDocument()
    expect(screen.queryByText('PR-2024-0389')).not.toBeInTheDocument()

    // Export Audit CSV
    const exportAuditBtn = screen.getByRole('button', { name: /Export Audit Log \(CSV\)/i })
    await userEvent.click(exportAuditBtn)
    expect(createObjectURLMock).toHaveBeenCalled()
  })

  it('navigates to Reports from ParcelView via Official Dossier button (Phase 9)', async () => {
    mockFetch((url) => {
      if (url.includes('/health')) return Promise.resolve(Response.json(healthBody))
      if (url.includes('/boundary-comparison')) return Promise.resolve(Response.json(comparisonBody))
      if (url.includes('/reports/parcels')) return Promise.resolve(Response.json(dossierBody))
      return Promise.resolve(Response.json(parcelsBody))
    })

    render(<App />)
    expect(await screen.findByText('Backend is reachable')).toBeInTheDocument()

    // Navigate to Parcels view via primary navigation
    const navEl = screen.getByRole('navigation', { name: 'Primary navigation' })
    const parcelsNav = within(navEl).getByRole('button', { name: /Parcels/i })
    await userEvent.click(parcelsNav)
    expect(await screen.findByText(/Parcel dossier: PR-2024-0412/i)).toBeInTheDocument()

    // Click Official Dossier & Reports
    const dossierBtn = screen.getByRole('button', { name: /Official Dossier & Reports/i })
    await userEvent.click(dossierBtn)

    // Should arrive at ReportsView
    expect(await screen.findByText(/OFFICIAL CADASTRAL PARCEL DOSSIER & BOUNDARY LEDGER/i)).toBeInTheDocument()
  })
})

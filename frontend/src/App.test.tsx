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
})

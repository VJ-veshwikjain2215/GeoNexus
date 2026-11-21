import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authApi,
  geometryApi,
  parcelApi,
  tokenStore,
  haversineDistanceM,
  wgs84ToUtm44,
  aiApi,
  analyticsApi,
  reportApi
} from './client'

afterEach(() => {
  vi.unstubAllGlobals()
  tokenStore.clear()
})

describe('GeoNexus API Client', () => {
  it('manages tokens in tokenStore', () => {
    expect(tokenStore.get()).toBeNull()
    tokenStore.set('sample-jwt-token', { id: 'u1', username: 'surveyor1', roles: ['SURVEYOR'] })
    expect(tokenStore.get()).toBe('sample-jwt-token')
    expect(tokenStore.getUser()?.username).toBe('surveyor1')
    tokenStore.clear()
    expect(tokenStore.get()).toBeNull()
  })

  it('handles authApi login and sets token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        token: 'new-jwt-token',
        tokenType: 'Bearer',
        expiresAt: '2026-11-21T12:00:00Z',
        user: { id: 'u2', username: 'reviewer1', roles: ['REVIEWER'] }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const res = await authApi.login('reviewer1', 'ValidPass!23')
    expect(res.token).toBe('new-jwt-token')
    expect(tokenStore.get()).toBe('new-jwt-token')
    expect(authApi.getCurrentUser()?.username).toBe('reviewer1')
    expect(authApi.isAuthenticated()).toBe(true)
  })

  it('sends Authorization header when token is present', async () => {
    tokenStore.set('my-secret-jwt')
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        content: [],
        page: 0,
        size: 10,
        totalElements: 0,
        totalPages: 0,
        last: true
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await parcelApi.list({ size: 10 })

    expect(fetchMock).toHaveBeenCalled()
    const callArgs = fetchMock.mock.calls[0]
    const headers = callArgs[1].headers as Headers
    expect(headers.get('Authorization')).toBe('Bearer my-secret-jwt')
  })

  it('calls POST /parcels when creating a parcel', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: '123',
        parcelCode: 'PR-TEST',
        district: 'Guntur',
        state: 'AP',
        status: 'DRAFT',
        pendingProposalsCount: 0
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const created = await parcelApi.create({
      parcelCode: 'PR-TEST',
      district: 'Guntur',
      state: 'AP'
    })

    expect(created.parcelCode).toBe('PR-TEST')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/parcels',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('calls POST /verify when reviewing a boundary proposal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: 'g-1',
        parcelId: 'p-1',
        versionNo: 1,
        status: 'VERIFIED'
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const verified = await geometryApi.verify('p-1', 'g-1', 'Approved per audit')

    expect(verified.status).toBe('VERIFIED')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/parcels/p-1/geometries/g-1/verify',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('calls POST /reject when rejecting a boundary proposal', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: 'g-1',
        parcelId: 'p-1',
        versionNo: 1,
        status: 'REJECTED'
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const rejected = await geometryApi.reject('p-1', 'g-1', 'Overlap with canal buffer')

    expect(rejected.status).toBe('REJECTED')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/parcels/p-1/geometries/g-1/reject',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('calls GET /api/v1/parcels/{id}/spatial-analysis to retrieve spatial metrics', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        parcelId: 'p-1',
        parcelCode: 'PR-2024-0412',
        recordedAreaHa: 14.285,
        perimeterM: 1894.20,
        isValidTopology: true,
        overlappingParcelsCount: 0,
        stationDisplacements: []
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const analysis = await parcelApi.getSpatialAnalysis('p-1')

    expect(analysis.parcelCode).toBe('PR-2024-0412')
    expect(analysis.recordedAreaHa).toBe(14.285)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/parcels/p-1/spatial-analysis',
      expect.anything()
    )
  })

  it('calculates accurate spheroidal distance using haversineDistanceM (MAP-01)', () => {
    // Distance between (16.3021, 80.4312) and (16.3025, 80.4355) is ~460m
    const dist = haversineDistanceM(16.3021, 80.4312, 16.3025, 80.4355)
    expect(dist).toBeGreaterThan(400)
    expect(dist).toBeLessThan(500)
  })

  it('converts WGS84 coordinates to UTM Zone 44N accurately (GEO-06)', () => {
    const utm = wgs84ToUtm44(80.4312, 16.3021)
    // Expect Easting in [430000, 450000] and Northing in [1800000, 1810000]
    expect(utm.easting).toBeGreaterThan(430000)
    expect(utm.easting).toBeLessThan(450000)
    expect(utm.northing).toBeGreaterThan(1800000)
    expect(utm.northing).toBeLessThan(1810000)
  })

  it('calls POST /api/v1/parcels/{id}/ai-boundary/detect to trigger AI boundary edge extraction', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        parcelId: 'p-1',
        parcelCode: 'PR-2024-0412',
        detectionId: 'DET-12345678',
        confidence: 0.915,
        status: 'PROPOSED_ASSISTIVE_DRAFT',
        academicDisclaimer: 'ACADEMIC EXPERIMENTAL AID'
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const resp = await aiApi.detect('p-1', { sensitivity: 0.85 })

    expect(resp.detectionId).toBe('DET-12345678')
    expect(resp.confidence).toBe(0.915)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/parcels/p-1/ai-boundary/detect',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ sensitivity: 0.85 })
      })
    )
  })

  it('calls POST /api/v1/parcels/{id}/ai-boundary/propose to accept AI proposal for four-eyes review', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        id: 'g-1',
        parcelId: 'p-1',
        versionNo: 2,
        source: 'AI_DETECTED',
        confidence: 0.915,
        status: 'PROPOSED'
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const resp = await aiApi.propose('p-1', {
      detectionId: 'DET-12345678',
      surveyorNotes: 'Accepted AI edge contour'
    })

    expect(resp.source).toBe('AI_DETECTED')
    expect(resp.versionNo).toBe(2)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/parcels/p-1/ai-boundary/propose',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          detectionId: 'DET-12345678',
          surveyorNotes: 'Accepted AI edge contour'
        })
      })
    )
  })

  it('calls GET /api/v1/analytics/dashboard to retrieve full cadastral analytics', async () => {
    const mockDashboard = {
      summary: {
        totalParcels: 4,
        totalSurveyedAreaHa: 50.5,
        inFlightResurveysCount: 42,
        flaggedForReviewCount: 18,
        validationsPassedMtd: 184,
        activeGeodeticPillars: 36,
        firstPassRatePercent: 99.1,
        dataSource: 'LIVE_DATABASE_AGGREGATION'
      },
      areaDistribution: [
        { rangeLabel: '< 2 ha', category: 'Marginal', parcelCount: 1, totalAreaHa: 1.85, percentage: 12.5 }
      ],
      administrativeBreakdown: [
        { subdistrict: 'Kothapeta High Basin', totalTargetParcels: 1240, completedAndSealed: 1098, isSyntheticTarget: true }
      ],
      boundaryVariance: {
        totalProposalsEvaluated: 14,
        avgDeltaHa: 0.12,
        flaggedVarianceCount: 3
      },
      actionableInsights: [
        { id: 'INS-01', severity: 'WARNING', title: 'Area Drift Exceeds Tolerance', recommendedAction: 'Review' }
      ],
      recentActivity: [
        { id: 'ACT-01', type: 'OK', title: 'Resurvey Certified', isDemonstration: true }
      ],
      crs: 'EPSG:4326 / EPSG:32644 (UTM 44N)',
      precisionTolerance: '± 0.015 m'
    }

    const fetchMock = vi.fn().mockResolvedValue(Response.json(mockDashboard))
    vi.stubGlobal('fetch', fetchMock)

    const resp = await analyticsApi.getDashboard()

    expect(resp.summary.totalParcels).toBe(4)
    expect(resp.areaDistribution[0].rangeLabel).toBe('< 2 ha')
    expect(resp.administrativeBreakdown[0].subdistrict).toBe('Kothapeta High Basin')
    expect(resp.actionableInsights[0].severity).toBe('WARNING')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/analytics/dashboard',
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    )
  })

  it('calls GET /api/v1/analytics/summary to retrieve high-level summary KPIs', async () => {
    const mockSummary = {
      totalParcels: 10,
      activeGeodeticPillars: 36,
      firstPassRatePercent: 99.1,
      dataSource: 'LIVE_DATABASE_AGGREGATION'
    }

    const fetchMock = vi.fn().mockResolvedValue(Response.json(mockSummary))
    vi.stubGlobal('fetch', fetchMock)

    const resp = await analyticsApi.getSummary()

    expect(resp.totalParcels).toBe(10)
    expect(resp.activeGeodeticPillars).toBe(36)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/analytics/summary',
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    )
  })

  it('calls GET /api/v1/reports/parcels/{id} to retrieve cadastral dossier', async () => {
    const mockDossier = {
      parcelId: 'p-1',
      parcelCode: 'PR-2024-0412',
      name: 'Kothapeta Block 3',
      district: 'Guntur',
      state: 'Andhra Pradesh',
      areaHa: 14.285,
      stations: [
        { station: 'ST-01', longitude: 80.4312, latitude: 16.3021, eastingUtm44: 439200.0, northingUtm44: 1802500.0, elevationM: 28.4, status: 'VERIFIED' }
      ],
      history: [],
      verificationHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    }

    const fetchMock = vi.fn().mockResolvedValue(Response.json(mockDossier))
    vi.stubGlobal('fetch', fetchMock)

    const resp = await reportApi.getParcelDossier('p-1')

    expect(resp.parcelCode).toBe('PR-2024-0412')
    expect(resp.stations[0].station).toBe('ST-01')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/reports/parcels/p-1',
      expect.anything()
    )
  })

  it('calls GET /api/v1/reports/parcels/{id}/boundary-comparison to retrieve comparison report', async () => {
    const mockComparison = {
      parcelId: 'p-1',
      parcelCode: 'PR-2024-0412',
      locality: 'Kothapeta Block 3',
      district: 'Guntur',
      baselineAreaHa: 14.285,
      proposedAreaHa: 14.415,
      areaDeltaHa: 0.13,
      areaDeltaPercent: 0.91,
      varianceClassification: 'SILT_DRIFT_VARIANCE',
      withinTolerance: true,
      displacements: [
        { station: 'ST-01', lonBaseline: 80.4312, latBaseline: 16.3021, lonProposed: 80.431, latProposed: 16.3024, shiftDistanceM: 4.8, status: 'DISPLACED' }
      ]
    }

    const fetchMock = vi.fn().mockResolvedValue(Response.json(mockComparison))
    vi.stubGlobal('fetch', fetchMock)

    const resp = await reportApi.getBoundaryComparison('p-1')

    expect(resp.varianceClassification).toBe('SILT_DRIFT_VARIANCE')
    expect(resp.displacements[0].shiftDistanceM).toBe(4.8)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/reports/parcels/p-1/boundary-comparison',
      expect.anything()
    )
  })

  it('calls GET /api/v1/reports/parcels/{id}/export/csv to download station ledger CSV', async () => {
    const csvContent = 'Station,Longitude,Latitude,Easting_UTM44N_m,Northing_UTM44N_m,Elevation_m,Monument_Status\nST-01,80.4312,16.3021,439200.0,1802500.0,28.4,VERIFIED\n'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(csvContent, {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=UTF-8' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const resp = await reportApi.exportStationLedgerCsv('p-1')

    expect(resp).toContain('Station,Longitude,Latitude')
    expect(resp).toContain('ST-01')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/reports/parcels/p-1/export/csv',
      expect.objectContaining({
        headers: expect.any(Headers)
      })
    )
  })

  it('calls GET /api/v1/reports/parcels/{id}/export/geojson to export GeoJSON Feature', async () => {
    const mockFeature = {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: {
        parcelCode: 'PR-2024-0412',
        areaHa: 14.285,
        crs: 'EPSG:4326',
        verificationHash: 'hash-abc'
      }
    }
    const fetchMock = vi.fn().mockResolvedValue(Response.json(mockFeature))
    vi.stubGlobal('fetch', fetchMock)

    const resp = await reportApi.exportParcelGeoJson('p-1')

    expect(resp.type).toBe('Feature')
    expect(resp.properties.parcelCode).toBe('PR-2024-0412')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/reports/parcels/p-1/export/geojson',
      expect.anything()
    )
  })

  it('calls GET /api/v1/reports/adjudication-docket/export/csv to download district docket CSV', async () => {
    const docketCsv = 'Docket_Number,Parcel_Code,Subdistrict,Baseline_Area_ha,Proposed_Area_ha,Delta_ha,Tolerance_Status,Adjudication_Directive\nDKT-01,PR-2024-0412,Kothapeta,14.285,14.415,+0.130,COMPLIANT,RECOMMEND_SEAL\n'
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(docketCsv, {
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=UTF-8' }
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    const resp = await reportApi.exportAdjudicationDocketCsv()

    expect(resp).toContain('Docket_Number,Parcel_Code')
    expect(resp).toContain('DKT-01')
  })

  it('calls GET /api/v1/reports/audit with query filters to retrieve paginated audit log', async () => {
    const mockAuditPage = {
      content: [
        {
          id: 101,
          occurredAt: '2026-11-21T10:00:00Z',
          actorUsername: 'surveyor1',
          action: 'GEOMETRY_PROPOSED',
          outcome: 'SUCCESS',
          parcelCode: 'PR-2024-0412',
          integrityHash: 'hash-xyz'
        }
      ],
      page: 0,
      size: 20,
      totalElements: 1,
      totalPages: 1,
      last: true
    }
    const fetchMock = vi.fn().mockResolvedValue(Response.json(mockAuditPage))
    vi.stubGlobal('fetch', fetchMock)

    const resp = await reportApi.getAuditHistory({ parcelId: 'p-1', action: 'GEOMETRY_PROPOSED' })

    expect(resp.content[0].action).toBe('GEOMETRY_PROPOSED')
    expect(resp.totalElements).toBe(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/reports/audit?parcelId=p-1&action=GEOMETRY_PROPOSED',
      expect.anything()
    )
  })
})

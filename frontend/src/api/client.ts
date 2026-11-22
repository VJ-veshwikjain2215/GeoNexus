/**
 * Centralized GeoNexus API Client.
 * Connects frontend components to Spring Boot REST endpoints (/api/v1).
 */

export interface UserSummary {
  id: string
  username: string
  roles: Array<'ADMIN' | 'SURVEYOR' | 'REVIEWER' | 'VIEWER'>
}

export interface LoginResponse {
  accessToken?: string
  token?: string
  tokenType: string
  expiresInSeconds?: number
  expiresAt?: string
  user: UserSummary
}

export interface GeoJsonGeometry {
  type: string
  coordinates: unknown
}

export interface GeoJsonFeature<P = Record<string, unknown>> {
  type: 'Feature'
  id: string
  geometry: GeoJsonGeometry
  properties: P
}

export interface GeoJsonFeatureCollection<P = Record<string, unknown>> {
  type: 'FeatureCollection'
  features: GeoJsonFeature<P>[]
}

export interface ParcelSummary {
  id: string
  parcelCode: string
  name?: string
  village?: string
  district: string
  state: string
  landUse: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  externalReference?: string
  currentAreaSqM?: number
  currentVersionNo?: number
  createdAt: string
  updatedAt: string
}

export interface StationDisplacement {
  station: string
  lonExisting: number
  latExisting: number
  lonProposed: number
  latProposed: number
  shiftDistanceM: number
}

export interface OverlapDetail {
  parcelId: string
  parcelCode: string
  locality: string
  overlapAreaSqM: number
}

export interface SpatialAnalysisResponse {
  parcelId: string
  parcelCode: string
  recordedAreaSqM?: number
  recordedAreaHa?: number
  proposedAreaSqM?: number
  proposedAreaHa?: number
  areaDeltaSqM?: number
  areaDeltaPercentage?: number
  perimeterM: number
  stationCount: number
  isValidTopology: boolean
  polygonClosureDeltaM: number
  selfIntersectionViolations: number
  adjacentCollisionOverlaps: number
  overlappingParcels: OverlapDetail[]
  overlappingParcelsCount: number
  maxDisplacementM?: number
  averageDisplacementM?: number
  stationDisplacements: StationDisplacement[]
}

export interface DetectedStation {
  station: string
  longitude: number
  latitude: number
  edgeConfidence: number
  displacementFromRecordedM: number
}

export interface AiBoundaryDetectionRequest {
  sensitivity?: number
  smoothingTolerance?: number
  imagerySource?: string
  algorithm?: string
}

export interface AiBoundaryDetectionResponse {
  parcelId: string
  parcelCode: string
  detectionId: string
  algorithm: string
  imagerySource: string
  confidence: number
  qualityScore: number
  edgeSharpness: number
  detectedAt: string
  detectedAreaSqM: number
  detectedAreaHa: number
  recordedAreaSqM?: number
  recordedAreaHa?: number
  areaDeltaSqM?: number
  areaDeltaPercentage?: number
  detectedGeometry: GeoJsonGeometry
  detectedStations: DetectedStation[]
  academicDisclaimer: string
  status: string
}

export interface AiProposeBoundaryRequest {
  detectionId: string
  surveyorNotes?: string
}

export interface CadastralSummaryStats {
  totalParcels: number
  activeParcels: number
  draftParcels: number
  archivedParcels: number
  verifiedParcels: number
  pendingBoundaryProposals: number
  totalSurveyedAreaHa: number
  averageParcelAreaHa: number
  inFlightResurveysCount: number
  flaggedForReviewCount: number
  validationsPassedMtd: number
  activeGeodeticPillars: number
  firstPassRatePercent: number
  meanRmseM: number
  dataSource: string
}

export interface AreaDistributionBin {
  rangeLabel: string
  category: string
  minAreaHa: number
  maxAreaHa: number
  parcelCount: number
  totalAreaHa: number
  percentage: number
}

export interface AdministrativeBreakdown {
  subdistrict: string
  taluk: string
  district: string
  totalTargetParcels: number
  completedAndSealed: number
  underActiveSurvey: number
  completionPercentage: number
  groundStatus: string
  leadSurveyor: string
  isSyntheticTarget: boolean
}

export interface BoundaryVarianceMetrics {
  totalProposalsEvaluated: number
  positiveDeltaCount: number
  negativeDeltaCount: number
  zeroDeltaCount: number
  averageDeltaHa: number
  averageDeltaPercent: number
  maxDeltaHa: number
  aiAssistedCount: number
  groundSurveyCount: number
  flaggedVarianceCount: number
}

export interface ActionableCadastralInsight {
  id: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  category: string
  title: string
  description: string
  parcelCode?: string
  parcelId?: string
  recommendedAction: string
}

export interface CadastralActivityItem {
  id: string
  type: 'OK' | 'PT' | 'REJ' | 'IMP' | 'AI'
  title: string
  timestamp: string
  description: string
  actor: string
  parcelCode?: string
  varianceText?: string
  hash?: string
  isDemonstration: boolean
}

export interface SeasonalTrendPoint {
  period: string
  targetCount: number
  completedCount: number
  inProgressCount: number
  disputedCount: number
  velocityHectaresPerDay: number
}

export interface AnalyticsDashboardResponse {
  summary: CadastralSummaryStats
  areaDistribution: AreaDistributionBin[]
  administrativeBreakdown: AdministrativeBreakdown[]
  boundaryVariance: BoundaryVarianceMetrics
  actionableInsights: ActionableCadastralInsight[]
  recentActivity: CadastralActivityItem[]
  seasonalTrends: SeasonalTrendPoint[]
  crs: string
  precisionTolerance: string
  disclaimer: string
  generatedAt: string
}

// ==================== PHASE 9 REPORTS & AUDIT INTERFACES ====================
export interface StationCoordinateRecord {
  station: string
  longitude: number
  latitude: number
  eastingUtm44: number
  northingUtm44: number
  elevationM: number
  status: string
}

export interface GeometryVersionSummary {
  versionNo: number
  source: string
  status: string
  areaHa: number
  areaDeltaHa?: number
  areaDeltaPercent?: number
  surveyorUsername?: string
  reviewerUsername?: string
  createdAt: string
  reviewedAt?: string
  notes?: string
}

export interface ParcelDossierReport {
  parcelId: string
  parcelCode: string
  name?: string
  village?: string
  taluk?: string
  district: string
  state: string
  landUse: string
  status: string
  ownerName?: string
  externalReference?: string
  notes?: string
  currentVersionNo?: number
  areaSqM?: number
  areaHa?: number
  perimeterM?: number
  verticesCount?: number
  stations: StationCoordinateRecord[]
  history: GeometryVersionSummary[]
  surveyReference?: string
  surveyorName?: string
  reviewerName?: string
  reviewedAt?: string
  certificationSeal?: string
  verificationHash?: string
  crs: string
  precisionTolerance: string
  disclaimer: string
  generatedAt: string
}

export interface StationDisplacementRecord {
  station: string
  lonBaseline: number
  latBaseline: number
  lonProposed: number
  latProposed: number
  shiftDistanceM: number
  status: string
}

export interface BoundaryComparisonReport {
  parcelId: string
  parcelCode: string
  locality: string
  district: string
  baselineVersionNo: number
  proposedVersionNo: number
  baselineAreaHa: number
  proposedAreaHa: number
  areaDeltaHa: number
  areaDeltaPercent: number
  varianceClassification: string
  withinTolerance: boolean
  maxDisplacementM: number
  averageDisplacementM: number
  displacements: StationDisplacementRecord[]
  surveyorNotes?: string
  adjudicationDirective: string
  status: string
  reviewedBy?: string
  reviewedAt?: string
  crs: string
  precisionTolerance: string
  disclaimer: string
  generatedAt: string
}

export interface AuditRecordResponse {
  id: number
  occurredAt: string
  actorUserId?: string
  actorUsername?: string
  action: string
  outcome: string
  entityType?: string
  entityId?: string
  parcelId?: string
  parcelCode?: string
  origin?: string
  requestId?: string
  clientIp?: string
  details?: Record<string, unknown>
  integrityHash?: string
}

export interface AuditFilterQuery {
  page?: number
  size?: number
  parcelId?: string
  action?: string
}

export interface GeometryResponse {
  id: string
  parcelId: string
  versionNo: number
  areaSqM?: number
  source: 'SURVEY' | 'MANUAL_ENTRY' | 'IMPORT' | 'AI_DETECTED'
  surveyId?: string
  basedOnGeometryId?: string
  sourceDescription?: string
  sourceReference?: string
  confidence?: number
  createdBy: UserSummary
  createdAt: string
  status: 'PROPOSED' | 'VERIFIED' | 'REJECTED' | 'SUPERSEDED'
  reviewedBy?: UserSummary
  reviewedAt?: string
  reviewNotes?: string
  supersededById?: string
  supersededAt?: string
  geometry?: GeoJsonGeometry
}

export interface ParcelDetail {
  id: string
  parcelCode: string
  name?: string
  village?: string
  district: string
  state: string
  landUse: string
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
  externalReference?: string
  notes?: string
  owner: UserSummary
  createdBy: UserSummary
  updatedBy?: UserSummary
  currentGeometry?: GeometryResponse
  pendingProposalsCount: number
  createdAt: string
  updatedAt: string
  rowVersion: number
}

export interface PagedResponse<T> {
  content: T[]
  page: number
  size: number
  totalElements: number
  totalPages: number
  last: boolean
}

export interface CreateParcelPayload {
  parcelCode: string
  name?: string
  village?: string
  district: string
  state: string
  landUse?: string
  ownerUserId?: string
  externalReference?: string
  notes?: string
  initialGeometry?: ProposeGeometryPayload
}

export interface UpdateParcelPayload {
  name?: string
  village?: string
  district?: string
  state?: string
  landUse?: string
  status?: string
  externalReference?: string
  notes?: string
}

export interface ProposeGeometryPayload {
  geometry: GeoJsonGeometry
  source: 'SURVEY' | 'MANUAL_ENTRY' | 'IMPORT' | 'AI_DETECTED'
  surveyId?: string
  basedOnGeometryId?: string
  sourceDescription?: string
  sourceReference?: string
  confidence?: number
}

const TOKEN_KEY = 'geonexus_access_token'
const USER_KEY = 'geonexus_user'

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set: (token: string, user?: UserSummary): void => {
    try {
      localStorage.setItem(TOKEN_KEY, token)
      if (user) {
        localStorage.setItem(USER_KEY, JSON.stringify(user))
      }
    } catch {
      // ignore
    }
  },
  getUser: (): UserSummary | null => {
    try {
      const data = localStorage.getItem(USER_KEY)
      return data ? JSON.parse(data) : null
    } catch {
      return null
    }
  },
  clear: (): void => {
    try {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(USER_KEY)
    } catch {
      // ignore
    }
  }
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public violations?: Array<{ field: string; message: string }>
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL || '/api/v1'
  const url = `${baseUrl.replace(/\/$/, '')}/${endpoint.replace(/^\//, '')}`

  const headers = new Headers(options.headers || {})
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  const token = tokenStore.get()
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(url, { ...options, headers })

  if (!response.ok) {
    let errCode = 'REQUEST_FAILED'
    let errMsg = `Request failed with status ${response.status}`
    let violations: Array<{ field: string; message: string }> | undefined

    try {
      const errorJson = await response.json()
      errCode = errorJson.code || errCode
      errMsg = errorJson.message || errMsg
      violations = errorJson.violations
    } catch {
      // non-JSON response body
    }

    throw new ApiError(response.status, errCode, errMsg, violations)
  }

  if (response.status === 204) {
    return undefined as unknown as T
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
    return (await response.text()) as unknown as T
  }

  return response.json() as Promise<T>
}

// ==================== AUTH API ====================
export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const data = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
    const token = data.accessToken || data.token
    if (token) {
      tokenStore.set(token, data.user)
    }
    return data
  },
  logout: (): void => {
    tokenStore.clear()
  },
  getCurrentUser: (): UserSummary | null => tokenStore.getUser(),
  isAuthenticated: (): boolean => Boolean(tokenStore.get()),
  getMe: async (): Promise<UserSummary> => {
    const user = await request<UserSummary>('/auth/me')
    if (user) {
      const token = tokenStore.get()
      if (token) {
        tokenStore.set(token, user)
      }
    }
    return user
  }
}

// ==================== PARCEL API ====================
export interface ParcelFilterQuery {
  page?: number
  size?: number
  status?: string
  district?: string
  state?: string
  ownerId?: string
  search?: string
}

export const parcelApi = {
  list: async (filters: ParcelFilterQuery = {}): Promise<PagedResponse<ParcelSummary>> => {
    const params = new URLSearchParams()
    if (filters.page !== undefined) params.set('page', String(filters.page))
    if (filters.size !== undefined) params.set('size', String(filters.size))
    if (filters.status) params.set('status', filters.status)
    if (filters.district) params.set('district', filters.district)
    if (filters.state) params.set('state', filters.state)
    if (filters.ownerId) params.set('ownerId', filters.ownerId)
    if (filters.search) params.set('search', filters.search)

    const query = params.toString() ? `?${params.toString()}` : ''
    return request<PagedResponse<ParcelSummary>>(`/parcels${query}`)
  },

  get: async (id: string): Promise<ParcelDetail> => {
    return request<ParcelDetail>(`/parcels/${id}`)
  },

  create: async (payload: CreateParcelPayload): Promise<ParcelDetail> => {
    return request<ParcelDetail>('/parcels', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  update: async (id: string, payload: UpdateParcelPayload): Promise<ParcelDetail> => {
    return request<ParcelDetail>(`/parcels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    })
  },

  getGeoJson: async (id: string): Promise<GeoJsonFeature> => {
    return request<GeoJsonFeature>(`/parcels/${id}/geojson`)
  },

  getSpatialAnalysis: async (id: string): Promise<SpatialAnalysisResponse> => {
    return request<SpatialAnalysisResponse>(`/parcels/${id}/spatial-analysis`)
  },

  listGeoJson: async (status?: string, district?: string): Promise<GeoJsonFeatureCollection> => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    if (district) params.set('district', district)
    const query = params.toString() ? `?${params.toString()}` : ''
    return request<GeoJsonFeatureCollection>(`/parcels/geojson${query}`)
  }
}

// ==================== GEOMETRY API ====================
export const geometryApi = {
  listHistory: async (parcelId: string): Promise<GeometryResponse[]> => {
    const data = await request<GeometryResponse[] | PagedResponse<GeometryResponse>>(
      `/parcels/${parcelId}/geometries`
    )
    if (Array.isArray(data)) {
      return data
    }
    if (data && Array.isArray((data as PagedResponse<GeometryResponse>).content)) {
      return (data as PagedResponse<GeometryResponse>).content
    }
    return []
  },

  getCurrent: async (parcelId: string): Promise<GeometryResponse> => {
    return request<GeometryResponse>(`/parcels/${parcelId}/geometries/current`)
  },

  getById: async (parcelId: string, geometryId: string): Promise<GeometryResponse> => {
    return request<GeometryResponse>(`/parcels/${parcelId}/geometries/${geometryId}`)
  },

  propose: async (parcelId: string, payload: ProposeGeometryPayload): Promise<GeometryResponse> => {
    return request<GeometryResponse>(`/parcels/${parcelId}/geometries/propose`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  },

  verify: async (parcelId: string, geometryId: string, notes?: string): Promise<GeometryResponse> => {
    return request<GeometryResponse>(`/parcels/${parcelId}/geometries/${geometryId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ notes })
    })
  },

  reject: async (parcelId: string, geometryId: string, reason: string): Promise<GeometryResponse> => {
    return request<GeometryResponse>(`/parcels/${parcelId}/geometries/${geometryId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    })
  }
}

// ==================== AI BOUNDARY API (PHASE 7) ====================
export const aiApi = {
  detect: async (
    parcelId: string,
    params?: AiBoundaryDetectionRequest
  ): Promise<AiBoundaryDetectionResponse> => {
    return request<AiBoundaryDetectionResponse>(`/parcels/${parcelId}/ai-boundary/detect`, {
      method: 'POST',
      body: JSON.stringify(params ?? {})
    })
  },

  propose: async (
    parcelId: string,
    payload: AiProposeBoundaryRequest
  ): Promise<GeometryResponse> => {
    return request<GeometryResponse>(`/parcels/${parcelId}/ai-boundary/propose`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }
}

export const analyticsApi = {
  getDashboard: async (): Promise<AnalyticsDashboardResponse> => {
    return request<AnalyticsDashboardResponse>('/analytics/dashboard')
  },

  getSummary: async (): Promise<CadastralSummaryStats> => {
    return request<CadastralSummaryStats>('/analytics/summary')
  }
}

// ==================== PHASE 9 REPORTS & AUDIT API ====================
export const reportApi = {
  getParcelDossier: async (parcelId: string): Promise<ParcelDossierReport> => {
    return request<ParcelDossierReport>(`/reports/parcels/${parcelId}`)
  },

  getBoundaryComparison: async (parcelId: string): Promise<BoundaryComparisonReport> => {
    return request<BoundaryComparisonReport>(`/reports/parcels/${parcelId}/boundary-comparison`)
  },

  exportStationLedgerCsv: async (parcelId: string): Promise<string> => {
    return request<string>(`/reports/parcels/${parcelId}/export/csv`, {
      headers: { Accept: 'text/csv' }
    })
  },

  exportParcelGeoJson: async (parcelId: string): Promise<GeoJsonFeature> => {
    return request<GeoJsonFeature>(`/reports/parcels/${parcelId}/export/geojson`, {
      headers: { Accept: 'application/geo+json, application/json' }
    })
  },

  exportAdjudicationDocketCsv: async (): Promise<string> => {
    return request<string>('/reports/adjudication-docket/export/csv', {
      headers: { Accept: 'text/csv' }
    })
  },

  getAuditHistory: async (filters: AuditFilterQuery = {}): Promise<PagedResponse<AuditRecordResponse>> => {
    const params = new URLSearchParams()
    if (filters.page !== undefined) params.set('page', String(filters.page))
    if (filters.size !== undefined) params.set('size', String(filters.size))
    if (filters.parcelId) params.set('parcelId', filters.parcelId)
    if (filters.action) params.set('action', filters.action)
    const query = params.toString() ? `?${params.toString()}` : ''
    return request<PagedResponse<AuditRecordResponse>>(`/reports/audit${query}`)
  }
}

/**
 * Calculates spheroidal distance in meters between two WGS84 points using Haversine formula.
 */
export function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371008.8 // WGS 84 authalic sphere radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(R * c * 100) / 100
}

/**
 * Converts WGS84 coordinates to UTM Zone 44N Easting and Northing in meters.
 * Valid for India / Andhra Pradesh cadastral zone (GEO-06).
 */
export function wgs84ToUtm44(lon: number, lat: number): { easting: number; northing: number } {
  const a = 6378137.0
  const f = 1 / 298.257223563
  const k0 = 0.9996
  const e2 = 2 * f - f * f
  const ePrime2 = e2 / (1 - e2)

  const latRad = (lat * Math.PI) / 180
  const lonRad = (lon * Math.PI) / 180
  const lon0Rad = (81.0 * Math.PI) / 180 // UTM Zone 44 central meridian

  const N = a / Math.sqrt(1 - e2 * Math.sin(latRad) * Math.sin(latRad))
  const T = Math.tan(latRad) * Math.tan(latRad)
  const C = ePrime2 * Math.cos(latRad) * Math.cos(latRad)
  const A = Math.cos(latRad) * (lonRad - lon0Rad)

  const M =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * latRad -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * latRad) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * latRad) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * latRad))

  const easting =
    500000 +
    k0 *
      N *
      (A +
        ((1 - T + C) * A * A * A) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * ePrime2) * A * A * A * A * A) / 120)

  const northing =
    k0 *
    (M +
      N *
        Math.tan(latRad) *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * A * A * A * A) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * ePrime2) * A * A * A * A * A * A) / 720))

  return {
    easting: Math.round(easting * 100) / 100,
    northing: Math.round(northing * 100) / 100
  }
}


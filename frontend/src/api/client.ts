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
  token: string
  tokenType: string
  expiresAt: string
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

  return response.json() as Promise<T>
}

// ==================== AUTH API ====================
export const authApi = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const data = await request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
    tokenStore.set(data.token, data.user)
    return data
  },
  logout: (): void => {
    tokenStore.clear()
  },
  getCurrentUser: (): UserSummary | null => tokenStore.getUser(),
  isAuthenticated: (): boolean => Boolean(tokenStore.get())
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

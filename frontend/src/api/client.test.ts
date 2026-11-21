import { afterEach, describe, expect, it, vi } from 'vitest'
import { authApi, geometryApi, parcelApi, tokenStore } from './client'

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
})

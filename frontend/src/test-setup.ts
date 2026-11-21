import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

if (typeof window !== 'undefined') {
  if (!window.URL.createObjectURL) {
    window.URL.createObjectURL = () => 'blob:mock-url'
  }
  if (!window.URL.revokeObjectURL) {
    window.URL.revokeObjectURL = () => {}
  }
}

// ── Leaflet mock for jsdom ───────────────────────────────────────────────────
// jsdom does not support canvas or CSS transforms needed by Leaflet.
// We mock the leaflet module so that LeafletParcelMap renders its fallback
// HTML state correctly in tests without throwing.
vi.mock('leaflet', () => {
  const mockLayer = { addTo: vi.fn().mockReturnThis(), remove: vi.fn(), on: vi.fn(), bindTooltip: vi.fn().mockReturnThis() }
  const mockMap = {
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    setView: vi.fn(),
    fitBounds: vi.fn(),
    zoomIn: vi.fn(),
    zoomOut: vi.fn(),
    getZoom: vi.fn(() => 14)
  }
  const mockTileLayer = { ...mockLayer, on: vi.fn() }
  return {
    map: vi.fn(() => mockMap),
    tileLayer: vi.fn(() => mockTileLayer),
    polygon: vi.fn(() => mockLayer),
    layerGroup: vi.fn(() => ({ ...mockLayer, addTo: vi.fn().mockReturnThis() })),
    marker: vi.fn(() => mockLayer),
    divIcon: vi.fn(() => ({})),
    latLng: vi.fn((lat: number, lng: number) => ({ lat, lng })),
    latLngBounds: vi.fn(() => ({ pad: vi.fn().mockReturnThis() }))
  }
})


/**
 * LeafletParcelMap – GeoNexus OSM-backed cadastral map canvas.
 *
 * Replaces the simulated SVG basemap with a real OpenStreetMap tile layer.
 * Parcel GeoJSON boundaries (EPSG:4326) are rendered as Leaflet polygon overlays.
 *
 * Attribution: © OpenStreetMap contributors (ODbL 1.0)
 * https://www.openstreetmap.org/copyright
 *
 * DISCLAIMER: Parcel boundaries displayed are synthetic/academic research data.
 * They do NOT represent certified government cadastral records.
 *
 * No paid APIs or API keys are required. OSM tile policy:
 * https://operations.osmfoundation.org/policies/tiles/
 */

import { useEffect, useRef, useCallback, useMemo, useState } from 'react'
import type { GeoJsonGeometry } from '../api/client'
import type { DetectedStation, LayerVisibility } from '../types/map'

// ── Leaflet import ───────────────────────────────────────────────────────────
// Leaflet is imported as a namespace and guarded with typeof document so that
// jsdom tests that do not create a full DOM do not crash on map initialization.
import * as leafletLib from 'leaflet'
const L: typeof import('leaflet') | null =
  typeof document !== 'undefined' ? leafletLib : null

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParcelOverlay {
  code: string
  area: string
  geometry?: GeoJsonGeometry
}

export interface LeafletParcelMapProps {
  recordedGeometry?: GeoJsonGeometry | null
  proposedGeometry?: GeoJsonGeometry | null
  aiDetectedGeometry?: GeoJsonGeometry | null
  aiDetectedStations?: DetectedStation[]
  parcelCode?: string
  locality?: string
  areaHa?: string
  proposedAreaHa?: string
  areaDeltaText?: string
  isLoading?: boolean
  error?: string | null
  onPropose?: () => void
  onSelectParcelCode?: (code: string) => void
  activeLayers?: LayerVisibility
  onCoordinateMove?: (lat: string, lon: string) => void
  surroundingParcels?: ParcelOverlay[]
  onTriggerAiDetect?: () => void
  isAiDetecting?: boolean
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

function geomToLatLngs(
  geom: GeoJsonGeometry
): [number, number][][] | null {
  if (!geom || !Array.isArray(geom.coordinates)) return null
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates as number[][][]
    return rings.map((ring) => ring.map(([lng, lat]) => [lat, lng] as [number, number]))
  }
  if (geom.type === 'MultiPolygon') {
    const result: [number, number][][] = []
    for (const poly of geom.coordinates as number[][][][]) {
      for (const ring of poly) {
        result.push(ring.map(([lng, lat]) => [lat, lng] as [number, number]))
      }
    }
    return result
  }
  return null
}

/** Flatten a geometry to a list of [lat, lng] positions (outer rings only). */
function geomToPositions(geom: GeoJsonGeometry): [number, number][] {
  const rings = geomToLatLngs(geom)
  return rings ? rings[0] ?? [] : []
}

/** Compute bounding box center for a geometry. */
function geomCenter(geom: GeoJsonGeometry): [number, number] | null {
  const positions = geomToPositions(geom)
  if (!positions.length) return null
  const lats = positions.map(([lat]) => lat)
  const lngs = positions.map(([, lng]) => lng)
  return [
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2
  ]
}

// ── Default map center: Kothapeta, Andhra Pradesh ────────────────────────────
const DEFAULT_CENTER: [number, number] = [16.3003, 80.433]
const DEFAULT_ZOOM = 14

// ── OSM Tile URL & attribution ───────────────────────────────────────────────
const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'

// ── Styling constants (matches GeoNexus design system) ───────────────────────
const STYLE_RECORDED = {
  color: '#4A1F2B',
  weight: 2.5,
  fillColor: '#FFFDFC',
  fillOpacity: 0.5,
  dashArray: undefined as string | undefined
}
const STYLE_PROPOSED = {
  color: '#C75C3E',
  weight: 2.5,
  fillColor: 'transparent',
  fillOpacity: 0,
  dashArray: '8 5'
}
const STYLE_AI = {
  color: '#E5A234',
  weight: 2.5,
  fillColor: 'rgba(229,162,52,0.1)',
  fillOpacity: 0.1,
  dashArray: '6 3'
}
const STYLE_SURROUNDING = {
  color: '#4A1F2B',
  weight: 1.5,
  fillColor: '#F7E9E1',
  fillOpacity: 0.35,
  dashArray: undefined as string | undefined
}

// ── Component ─────────────────────────────────────────────────────────────────

export function LeafletParcelMap({
  recordedGeometry,
  proposedGeometry,
  aiDetectedGeometry,
  aiDetectedStations = [],
  parcelCode = 'PR-2024-0412',
  locality = 'Kothapeta Block 3',
  areaHa = '14.285 ha',
  proposedAreaHa,
  areaDeltaText,
  isLoading = false,
  error = null,
  onPropose,
  onSelectParcelCode,
  activeLayers,
  onCoordinateMove,
  surroundingParcels = [],
  onTriggerAiDetect,
  isAiDetecting = false
}: LeafletParcelMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<import('leaflet').Map | null>(null)
  const tileErrorRef = useRef(false)
  const [tileError, setTileError] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  // Track layer refs for removal/re-add on prop changes
  const recordedLayerRef = useRef<import('leaflet').Polygon | null>(null)
  const proposedLayerRef = useRef<import('leaflet').Polygon | null>(null)
  const aiLayerRef = useRef<import('leaflet').LayerGroup | null>(null)
  const surroundingLayersRef = useRef<import('leaflet').LayerGroup | null>(null)

  // ── Compute initial center from geometries ──────────────────────────────
  const initialCenter = useMemo((): [number, number] => {
    if (recordedGeometry) {
      const c = geomCenter(recordedGeometry)
      if (c) return c
    }
    if (proposedGeometry) {
      const c = geomCenter(proposedGeometry)
      if (c) return c
    }
    return DEFAULT_CENTER
  }, [recordedGeometry, proposedGeometry])

  // ── Initialize Leaflet map on mount ────────────────────────────────────
  useEffect(() => {
    if (!L || !containerRef.current || mapRef.current) return

    const map = L.map(containerRef.current, {
      center: initialCenter,
      zoom: DEFAULT_ZOOM,
      zoomControl: false, // We render custom zoom controls in MapView
      attributionControl: true
    })

    // OSM tile layer
    const tileLayer = L.tileLayer(OSM_TILE_URL, {
      attribution: OSM_ATTRIBUTION,
      maxZoom: 19,
      // Graceful tile error handling
      errorTileUrl: ''
    })

    tileLayer.on('tileerror', () => {
      if (!tileErrorRef.current) {
        tileErrorRef.current = true
        setTileError(true)
      }
    })

    tileLayer.addTo(map)

    // Track mouse move → coordinate readout
    map.on('mousemove', (e) => {
      const lat = e.latlng.lat
      const lng = e.latlng.lng
      const latDeg = Math.floor(Math.abs(lat))
      const latMin = Math.floor((Math.abs(lat) - latDeg) * 60)
      const latSec = ((Math.abs(lat) - latDeg - latMin / 60) * 3600).toFixed(1)
      const lngDeg = Math.floor(Math.abs(lng))
      const lngMin = Math.floor((Math.abs(lng) - lngDeg) * 60)
      const lngSec = ((Math.abs(lng) - lngDeg - lngMin / 60) * 3600).toFixed(1)
      const latStr = `${latDeg}°${latMin}′${latSec}″ ${lat >= 0 ? 'N' : 'S'}`
      const lngStr = `${lngDeg}°${lngMin}′${lngSec}″ ${lng >= 0 ? 'E' : 'W'}`
      onCoordinateMove?.(latStr, lngStr)
    })

    mapRef.current = map
    setMapReady(true)

    return () => {
      map.remove()
      mapRef.current = null
      tileErrorRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // ── Fit map to recorded geometry ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!L || !map || !recordedGeometry) return
    const positions = geomToPositions(recordedGeometry)
    if (positions.length >= 2) {
      try {
        const bounds = L.latLngBounds(positions.map((p) => L!.latLng(p[0], p[1])))
        map.fitBounds(bounds.pad(0.3))
      } catch {
        // ignore invalid bounds
      }
    }
  }, [recordedGeometry, mapReady])

  // ── Recorded boundary layer ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!L || !map) return

    // Remove old layer
    if (recordedLayerRef.current) {
      recordedLayerRef.current.remove()
      recordedLayerRef.current = null
    }

    if (!recordedGeometry || activeLayers?.registeredParcels === false) return

    const latlngs = geomToLatLngs(recordedGeometry)
    if (!latlngs || !latlngs.length) return

    const poly = L.polygon(latlngs as [number, number][][], STYLE_RECORDED)
    poly.bindTooltip(
      `<strong>${parcelCode}</strong><br/>${areaHa}<br/><small style="color:#6e625d">Registered boundary</small>`,
      { sticky: true, className: 'geonexus-tooltip' }
    )
    poly.addTo(map)
    recordedLayerRef.current = poly
  }, [recordedGeometry, activeLayers?.registeredParcels, parcelCode, areaHa, mapReady])

  // ── Proposed boundary layer ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!L || !map) return

    if (proposedLayerRef.current) {
      proposedLayerRef.current.remove()
      proposedLayerRef.current = null
    }

    if (!proposedGeometry || activeLayers?.proposedResurveys === false) return

    const latlngs = geomToLatLngs(proposedGeometry)
    if (!latlngs || !latlngs.length) return

    const poly = L.polygon(latlngs as [number, number][][], STYLE_PROPOSED)
    poly.bindTooltip(
      `<strong>${parcelCode}</strong> – Proposed Resurvey<br/>${proposedAreaHa || areaHa}<br/><small style="color:#c75c3e">Δ ${areaDeltaText || ''}</small>`,
      { sticky: true, className: 'geonexus-tooltip' }
    )
    poly.addTo(map)
    proposedLayerRef.current = poly
  }, [proposedGeometry, activeLayers?.proposedResurveys, parcelCode, areaHa, proposedAreaHa, areaDeltaText, mapReady])

  // ── AI-detected boundary layer ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!L || !map) return

    if (aiLayerRef.current) {
      aiLayerRef.current.remove()
      aiLayerRef.current = null
    }

    if (!aiDetectedGeometry || activeLayers?.aiDetectedBoundaries === false) return

    const group = L.layerGroup()
    const latlngs = geomToLatLngs(aiDetectedGeometry)
    if (latlngs && latlngs.length) {
      const poly = L.polygon(latlngs as [number, number][][], STYLE_AI)
      poly.bindTooltip('AI Detected Boundary (Draft – Assistive Only)', {
        sticky: true,
        className: 'geonexus-tooltip'
      })
      poly.addTo(group)
    }

    // AI station markers
    for (let i = 0; i < aiDetectedStations.length; i++) {
      const st = aiDetectedStations[i]
      const icon = L.divIcon({
        className: '',
        html: `<div style="width:10px;height:10px;background:#E5A234;border:2px solid #FFF8ED;border-radius:50%;transform:translate(-5px,-5px)"></div>`,
        iconSize: [10, 10]
      })
      const marker = L.marker([st.latitude, st.longitude], { icon })
      marker.bindTooltip(
        `${st.station} – Conf: ${(st.edgeConfidence * 100).toFixed(0)}%`,
        { className: 'geonexus-tooltip' }
      )
      marker.addTo(group)
    }

    group.addTo(map)
    aiLayerRef.current = group
  }, [aiDetectedGeometry, aiDetectedStations, activeLayers?.aiDetectedBoundaries, mapReady])

  // ── Surrounding parcels layer ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!L || !map) return

    if (surroundingLayersRef.current) {
      surroundingLayersRef.current.remove()
      surroundingLayersRef.current = null
    }

    if (!surroundingParcels.length || activeLayers?.registeredParcels === false) return

    const group = L.layerGroup()
    for (const sp of surroundingParcels) {
      if (!sp.geometry) continue
      const latlngs = geomToLatLngs(sp.geometry)
      if (!latlngs) continue
      const poly = L.polygon(latlngs as [number, number][][], STYLE_SURROUNDING)
      poly.bindTooltip(
        `<strong>${sp.code}</strong><br/>${sp.area}`,
        { sticky: true, className: 'geonexus-tooltip' }
      )
      poly.on('click', () => onSelectParcelCode?.(sp.code))
      poly.addTo(group)
    }
    group.addTo(map)
    surroundingLayersRef.current = group
  }, [surroundingParcels, activeLayers?.registeredParcels, onSelectParcelCode, mapReady])

  // ── Fit to all parcels callback (for external "fit" button) ────────────
  const fitToParcels = useCallback(() => {
    const map = mapRef.current
    if (!L || !map) return
    const allGeoms = [recordedGeometry, proposedGeometry, ...surroundingParcels.map((p) => p.geometry)]
    const positions: [number, number][] = []
    for (const g of allGeoms) {
      if (g) positions.push(...geomToPositions(g))
    }
    if (positions.length >= 2) {
      try {
        const bounds = L.latLngBounds(positions.map((p) => L!.latLng(p[0], p[1])))
        map.fitBounds(bounds.pad(0.2))
      } catch { /* ignore */ }
    } else {
      map.setView(initialCenter, DEFAULT_ZOOM)
    }
  }, [recordedGeometry, proposedGeometry, surroundingParcels, initialCenter])

  // Expose fitToParcels via data attribute so parent buttons can call it
  useEffect(() => {
    if (containerRef.current) {
      // @ts-expect-error – attaching non-standard property for internal use
      containerRef.current.__fitToParcels = fitToParcels
    }
  }, [fitToParcels])

  // ── Zoom handlers ───────────────────────────────────────────────────────
  const handleZoomIn = () => mapRef.current?.zoomIn()
  const handleZoomOut = () => mapRef.current?.zoomOut()

  // ── Render: loading / error states ──────────────────────────────────────
  if (isLoading) {
    return (
      <div
        className="map-canvas leaflet-map-canvas"
        aria-label="Loading parcel map"
        style={{ position: 'relative', minHeight: 465 }}
        data-testid="leaflet-map-container"
      >
        <div className="map-grid" />
        <div className="map-state-overlay">
          <em className="status valid" style={{ padding: '8px 14px', fontSize: '12px' }}>
            ◐ Loading cadastral vector geometry…
          </em>
          <p style={{ marginTop: '10px', color: '#6e625d', fontSize: '12px' }}>
            Resolving EPSG:4326 GeoJSON boundary for {parcelCode}
          </p>
        </div>
        <div className="map-footer">
          GeoJSON storage: EPSG:4326 · Loading spatial coordinates…
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="map-canvas leaflet-map-canvas"
        aria-label="Parcel map error"
        style={{ position: 'relative', minHeight: 465 }}
        data-testid="leaflet-map-container"
      >
        <div className="map-grid" />
        <div className="map-state-overlay">
          <div
            style={{
              padding: '16px 20px',
              background: '#ffdad6',
              border: '1px solid #ba1a1a',
              color: '#93000a',
              borderRadius: '4px',
              maxWidth: '420px',
              textAlign: 'center'
            }}
          >
            <strong style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>
              ⚠ Geometry Loading Error
            </strong>
            <p style={{ margin: 0, fontSize: '12px' }}>{error}</p>
          </div>
        </div>
        <div className="map-footer">
          GeoJSON storage: EPSG:4326 · Error resolving spatial boundary
        </div>
      </div>
    )
  }

  const hasGeometry = Boolean(recordedGeometry || proposedGeometry)

  if (!hasGeometry) {
    return (
      <div
        className="map-canvas leaflet-map-canvas"
        aria-label="Empty parcel boundary map"
        style={{ position: 'relative', minHeight: 465 }}
        data-testid="leaflet-map-container"
      >
        <div className="map-grid" />
        <div className="map-state-overlay">
          <div
            style={{
              padding: '24px 28px',
              background: '#fffdfc',
              border: '1px solid #d9cec7',
              borderRadius: '4px',
              maxWidth: '440px',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(74,31,43,0.06)'
            }}
          >
            <span style={{ fontSize: '28px', color: '#a03f24', display: 'block', marginBottom: '8px' }}>◇</span>
            <strong
              style={{
                display: 'block',
                fontSize: '18px',
                color: '#4a1f2b',
                fontFamily: 'Newsreader, Georgia, serif'
              }}
            >
              No Verified Boundary Registered
            </strong>
            <p style={{ margin: '8px 0 16px', color: '#6e625d', fontSize: '12px', lineHeight: 1.5 }}>
              Parcel <b>{parcelCode}</b> does not have verified boundary coordinates registered in EPSG:4326.
            </p>
            {onPropose && (
              <button className="button orange-button" onClick={onPropose}>
                ＋ Propose Initial Boundary
              </button>
            )}
          </div>
        </div>
        <div className="map-footer">
          GeoJSON storage: EPSG:4326 · Unsurveyed registry record
        </div>
      </div>
    )
  }

  // ── Normal render: Leaflet map container + HUD overlays ─────────────────
  return (
    <div
      className="map-canvas leaflet-map-canvas"
      aria-label="Parcel map"
      style={{ position: 'relative', minHeight: 465 }}
      data-testid="leaflet-map-container"
    >
      {/* OSM Tile Map fills the canvas */}
      <div
        ref={containerRef}
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 0
        }}
        aria-hidden="true"
      />

      {/* Tile load failure notice (non-blocking) */}
      {tileError && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            background: '#fff1cf',
            border: '1px solid #e5a234',
            color: '#624000',
            padding: '4px 10px',
            fontSize: '11px',
            borderRadius: '3px',
            pointerEvents: 'none'
          }}
          role="alert"
        >
          ⚠ Map tiles unavailable – working offline or network restricted
        </div>
      )}

      {/* Coordinate readouts / labels */}
      <span className="map-label one" style={{ zIndex: 20 }}>
        {parcelCode}
        <br />
        <small>{areaHa}</small>
      </span>
      <span className="map-label two" style={{ zIndex: 20 }}>
        {locality}
        <br />
        <small>EPSG:4326</small>
      </span>

      {/* Floating HUD Toolbar */}
      <div className="map-hud-toolbar" role="toolbar" aria-label="Map tools" style={{ zIndex: 25 }}>
        <button
          type="button"
          className="hud-btn"
          title="Pan Map"
          aria-label="Pan tool"
        >
          <span>✋</span>
        </button>
        <div className="hud-sep" />
        <button
          type="button"
          className="hud-btn"
          title="Edit Boundary"
          aria-label="Edit boundary"
          onClick={onPropose}
          style={{ color: '#c75c3e' }}
        >
          <span>✎</span>
          <span style={{ fontSize: '11px', fontWeight: 600 }}>Edit Boundary</span>
        </button>
        <button
          type="button"
          className={`hud-btn ${isAiDetecting ? 'active' : ''}`}
          title="AI Boundary Edge Detection"
          aria-label="AI Boundary Detection"
          onClick={onTriggerAiDetect}
          style={{ color: '#624000', borderColor: '#e5a234', background: isAiDetecting ? '#ffddb2' : undefined }}
        >
          <span>⚡</span>
          <span style={{ fontSize: '11px', fontWeight: 600 }}>
            {isAiDetecting ? 'Detecting…' : 'AI Detect'}
          </span>
        </button>
        <div className="hud-sep" />
        <button
          type="button"
          className="hud-btn"
          title="Fit to parcels"
          aria-label="Fit extent"
          onClick={fitToParcels}
        >
          <span>⌗</span>
        </button>
        <button
          type="button"
          className="hud-btn"
          title="Toggle Fullscreen"
          aria-label="Toggle fullscreen"
          onClick={() => {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen?.().catch(() => {})
            } else {
              document.exitFullscreen?.().catch(() => {})
            }
          }}
        >
          <span>⛶</span>
        </button>
      </div>

      {/* Compass Rose */}
      <div className="map-compass" title="Orientation" style={{ zIndex: 25 }}>
        <span className="compass-n">N</span>
        <svg viewBox="0 0 20 40" width="14" height="26">
          <polygon fill="#C75C3E" points="10,0 20,20 10,16" />
          <polygon fill="#4A1F2B" points="10,0 0,20 10,16" />
          <polygon fill="#6E625D" points="10,40 20,20 10,16" />
          <polygon fill="#D9CEC7" points="10,40 0,20 10,16" />
        </svg>
        <span className="compass-deg">0.0°</span>
      </div>

      {/* Zoom Cluster */}
      <div className="map-zoom-cluster" role="group" aria-label="Map zoom controls" style={{ zIndex: 25 }}>
        <button aria-label="Zoom in" title="Zoom In" onClick={handleZoomIn}>+</button>
        <div style={{ height: '1px', background: '#d9cec7', margin: '1px 3px' }} />
        <button aria-label="Zoom out" title="Zoom Out" onClick={handleZoomOut}>−</button>
      </div>

      {/* Orthophoto backdrop – honest labeling when layer is on */}
      {activeLayers?.orthophotoBackdrop && (
        <div
          style={{
            position: 'absolute',
            top: 48,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 22,
            background: '#f7e9e1',
            border: '1px solid #e5a234',
            color: '#624000',
            padding: '3px 8px',
            fontSize: '10px',
            fontWeight: 600,
            borderRadius: '2px',
            pointerEvents: 'none'
          }}
        >
          ⚠ Aerial imagery not configured — no real orthomosaic available
        </div>
      )}

      {/* OSM Attribution is rendered by Leaflet automatically */}
      {/* Cartographic footer */}
      <div className="map-footer" style={{ zIndex: 25 }}>
        Basemap: OpenStreetMap © contributors (ODbL 1.0) · GeoJSON parcels: EPSG:4326 ·{' '}
        <span style={{ color: '#a03f24', fontWeight: 600 }}>
          Synthetic data – not certified cadastral boundaries
        </span>
      </div>
    </div>
  )
}

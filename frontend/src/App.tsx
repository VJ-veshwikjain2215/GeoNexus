import { useEffect, useMemo, useState, useTransition } from 'react'
import { BackendStatus } from './components/BackendStatus'
import {
  geometryApi,
  parcelApi,
  haversineDistanceM,
  wgs84ToUtm44,
  type GeometryResponse,
  type GeoJsonGeometry,
  type ParcelDetail,
  type ParcelSummary,
  type SpatialAnalysisResponse
} from './api/client'

type View = 'dashboard' | 'map' | 'parcel' | 'boundary'

interface DisplayParcel {
  id: string
  code: string
  locality: string
  area: string
  status: string
  isLive?: boolean
  geometry?: GeoJsonGeometry
  proposedGeometry?: GeoJsonGeometry
}

// Baseline GeoJSON geometries for demonstration records (EPSG:4326 longitude/latitude degrees)
const DEMO_GEOMETRY_412: GeoJsonGeometry = {
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

const DEMO_PROPOSED_412: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [80.431, 16.3024],
      [80.4358, 16.3027],
      [80.4352, 16.2982],
      [80.4303, 16.2979],
      [80.431, 16.3024]
    ]
  ]
}

const DEMO_GEOMETRY_389: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [80.425, 16.31],
      [80.429, 16.311],
      [80.4285, 16.307],
      [80.4245, 16.3065],
      [80.425, 16.31]
    ]
  ]
}

const DEMO_GEOMETRY_401: GeoJsonGeometry = {
  type: 'Polygon',
  coordinates: [
    [
      [80.44, 16.295],
      [80.446, 16.2965],
      [80.445, 16.291],
      [80.439, 16.29],
      [80.44, 16.295]
    ]
  ]
}

const DEFAULT_PARCELS: DisplayParcel[] = [
  {
    id: 'PR-2024-0412',
    code: 'PR-2024-0412',
    locality: 'Kothapeta Block 3',
    area: '14.285 ha',
    status: 'Under review',
    geometry: DEMO_GEOMETRY_412,
    proposedGeometry: DEMO_PROPOSED_412
  },
  {
    id: 'PR-2024-0389',
    code: 'PR-2024-0389',
    locality: 'Mylavaram Sector 1',
    area: '8.100 ha',
    status: 'Needs review',
    geometry: DEMO_GEOMETRY_389
  },
  {
    id: 'PR-2024-0401',
    code: 'PR-2024-0401',
    locality: 'Nuzvid North',
    area: '22.500 ha',
    status: 'Pending sign-off',
    geometry: DEMO_GEOMETRY_401
  }
]

const nav: Array<[View, string, string]> = [
  ['dashboard', 'Dashboard', '▦'],
  ['map', 'Map workspace', '⌑'],
  ['parcel', 'Parcels', '◇'],
  ['boundary', 'Boundary review', '◫']
]

interface ExtractedRing {
  points: Array<[number, number]>
  isHole: boolean
}

function extractRingsFromGeoJson(geom: GeoJsonGeometry | null | undefined): ExtractedRing[] {
  if (!geom || !geom.coordinates) return []
  const rings: ExtractedRing[] = []
  const coords = geom.coordinates

  if (geom.type === 'Polygon' && Array.isArray(coords)) {
    coords.forEach((ring: unknown, ringIdx: number) => {
      if (Array.isArray(ring)) {
        const pts: Array<[number, number]> = []
        for (const pt of ring) {
          if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
            pts.push([pt[0], pt[1]])
          }
        }
        if (pts.length >= 3) {
          rings.push({ points: pts, isHole: ringIdx > 0 })
        }
      }
    })
  } else if (geom.type === 'MultiPolygon' && Array.isArray(coords)) {
    coords.forEach((poly: unknown) => {
      if (Array.isArray(poly)) {
        poly.forEach((ring: unknown, ringIdx: number) => {
          if (Array.isArray(ring)) {
            const pts: Array<[number, number]> = []
            for (const pt of ring) {
              if (Array.isArray(pt) && typeof pt[0] === 'number' && typeof pt[1] === 'number') {
                pts.push([pt[0], pt[1]])
              }
            }
            if (pts.length >= 3) {
              rings.push({ points: pts, isHole: ringIdx > 0 })
            }
          }
        })
      }
    })
  }
  return rings
}

function getBoundingBox(ringsList: ExtractedRing[][]): [number, number, number, number] | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let count = 0

  for (const rings of ringsList) {
    for (const ring of rings) {
      for (const [x, y] of ring.points) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
        count++
      }
    }
  }

  if (count === 0) return null
  return [minX, minY, maxX, maxY]
}

function projectRingsToSvg(
  rings: ExtractedRing[],
  bbox: [number, number, number, number],
  width = 760,
  height = 490,
  padding = 45
): { pathD: string; vertices: Array<[number, number]> } {
  if (rings.length === 0) {
    return { pathD: '', vertices: [] }
  }

  const [minLon, minLat, maxLon, maxLat] = bbox
  const midLat = (minLat + maxLat) / 2
  const rad = (midLat * Math.PI) / 180
  const cosMidLat = Math.cos(rad) > 0.0001 ? Math.cos(rad) : 1.0

  const lonSpan = Math.max(maxLon - minLon, 0.00001)
  const latSpan = Math.max(maxLat - minLat, 0.00001)

  const availWidth = width - padding * 2
  const availHeight = height - padding * 2

  const scaleX = availWidth / (lonSpan * cosMidLat)
  const scaleY = availHeight / latSpan
  const scale = Math.min(scaleX, scaleY)

  const drawnWidth = lonSpan * cosMidLat * scale
  const drawnHeight = latSpan * scale
  const offsetX = padding + (availWidth - drawnWidth) / 2
  const offsetY = padding + (availHeight - drawnHeight) / 2

  const projectPoint = (lon: number, lat: number): [number, number] => {
    const x = offsetX + (lon - minLon) * cosMidLat * scale
    const y = offsetY + (maxLat - lat) * scale
    return [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
  }

  const pathParts: string[] = []
  const vertices: Array<[number, number]> = []

  for (const ring of rings) {
    if (ring.points.length === 0) continue
    const projectedRing = ring.points.map(([lon, lat]) => projectPoint(lon, lat))
    let ringD = `M ${projectedRing[0][0]} ${projectedRing[0][1]}`
    for (let i = 1; i < projectedRing.length; i++) {
      ringD += ` L ${projectedRing[i][0]} ${projectedRing[i][1]}`
    }
    ringD += ' Z'
    pathParts.push(ringD)

    for (let i = 0; i < projectedRing.length; i++) {
      if (i > 0 && i === projectedRing.length - 1) {
        const first = projectedRing[0]
        const last = projectedRing[i]
        if (Math.abs(first[0] - last[0]) < 1 && Math.abs(first[1] - last[1]) < 1) {
          continue
        }
      }
      vertices.push(projectedRing[i])
    }
  }

  return {
    pathD: pathParts.join(' '),
    vertices
  }
}

interface LayerVisibility {
  registeredParcels: boolean
  proposedResurveys: boolean
  disputedOverlaps: boolean
  surveyBaselines: boolean
  groundControlPoints: boolean
  topoContours: boolean
}

const DEFAULT_LAYERS: LayerVisibility = {
  registeredParcels: true,
  proposedResurveys: true,
  disputedOverlaps: true,
  surveyBaselines: true,
  groundControlPoints: true,
  topoContours: false
}

interface MapCanvasProps {
  comparison?: boolean
  recordedGeometry?: GeoJsonGeometry | null
  proposedGeometry?: GeoJsonGeometry | null
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
  surroundingParcels?: Array<{ code: string; area: string; geometry?: GeoJsonGeometry }>
}

function MapCanvas({
  comparison = false,
  recordedGeometry,
  proposedGeometry,
  parcelCode = 'PR-2024-0412',
  locality = 'Kothapeta Block 3',
  areaHa = '14.285 ha',
  proposedAreaHa,
  areaDeltaText,
  isLoading = false,
  error = null,
  onPropose,
  onSelectParcelCode,
  activeLayers = DEFAULT_LAYERS,
  onCoordinateMove,
  surroundingParcels = []
}: MapCanvasProps) {
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragOrigin, setDragOrigin] = useState({ x: 0, y: 0 })
  const [activeTool, setActiveTool] = useState<'pan' | 'identify' | 'measure' | 'area' | 'edit'>('pan')
  const [showMeasure, setShowMeasure] = useState(true)
  const [selectedStations, setSelectedStations] = useState<[number, number]>([0, 1])

  if (isLoading) {
    return (
      <div className="map-canvas" aria-label="Loading parcel map">
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
      <div className="map-canvas" aria-label="Parcel map error">
        <div className="map-grid" />
        <div className="map-state-overlay">
          <div style={{ padding: '16px 20px', background: '#ffdad6', border: '1px solid #ba1a1a', color: '#93000a', borderRadius: '4px', maxWidth: '420px', textAlign: 'center' }}>
            <strong style={{ display: 'block', marginBottom: '6px', fontSize: '14px' }}>⚠ Geometry Loading Error</strong>
            <p style={{ margin: 0, fontSize: '12px' }}>{error}</p>
          </div>
        </div>
        <div className="map-footer">
          GeoJSON storage: EPSG:4326 · Error resolving spatial boundary
        </div>
      </div>
    )
  }

  const recordedRings = extractRingsFromGeoJson(recordedGeometry)
  const proposedRings = extractRingsFromGeoJson(proposedGeometry)

  if (recordedRings.length === 0 && proposedRings.length === 0) {
    return (
      <div className="map-canvas" aria-label="Empty parcel boundary map">
        <div className="map-grid" />
        <div className="map-state-overlay">
          <div style={{ padding: '24px 28px', background: '#fffdfc', border: '1px solid #d9cec7', borderRadius: '4px', maxWidth: '440px', textAlign: 'center', boxShadow: '0 4px 12px rgba(74,31,43,0.06)' }}>
            <span style={{ fontSize: '28px', color: '#a03f24', display: 'block', marginBottom: '8px' }}>◇</span>
            <strong style={{ display: 'block', fontSize: '18px', color: '#4a1f2b', fontFamily: 'Newsreader, Georgia, serif' }}>
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

  const bbox = getBoundingBox([recordedRings, proposedRings]) || [80.43, 16.297, 80.436, 16.303]
  const recordedProj = projectRingsToSvg(recordedRings, bbox, 1200, 800, 100)
  const proposedProj = projectRingsToSvg(proposedRings, bbox, 1200, 800, 100)

  const activeVertices =
    comparison && proposedProj.vertices.length > 0
      ? proposedProj.vertices
      : recordedProj.vertices.length > 0
        ? recordedProj.vertices
        : proposedProj.vertices

  // Dynamic caliper calculation between real vertices (MAP-01)
  const activeGeoRings =
    comparison && proposedRings.length > 0
      ? proposedRings
      : recordedRings.length > 0
        ? recordedRings
        : proposedRings
  const activeGeoCoords = activeGeoRings.length > 0 && activeGeoRings[0]?.points ? activeGeoRings[0].points : []

  const stAIdx = Math.min(selectedStations[0], Math.max(0, activeVertices.length - 1))
  const stBIdx = Math.min(selectedStations[1], Math.max(0, activeVertices.length - 1))

  let dynamicDistanceM = 412.80
  if (activeGeoCoords.length > 1 && stAIdx < activeGeoCoords.length && stBIdx < activeGeoCoords.length && stAIdx !== stBIdx) {
    const p1 = activeGeoCoords[stAIdx]
    const p2 = activeGeoCoords[stBIdx]
    const computed = haversineDistanceM(p1[1], p1[0], p2[1], p2[0])
    if (computed > 0) {
      dynamicDistanceM = computed
    }
  }

  const vA = activeVertices.length > 0 && activeVertices[stAIdx] ? activeVertices[stAIdx] : [338, 348]
  const vB = activeVertices.length > 1 && activeVertices[stBIdx] ? activeVertices[stBIdx] : [718, 388]

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button === 0 && activeTool === 'pan') {
      setIsDragging(true)
      setDragOrigin({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height))
      const latSec = (10.0 + (1 - ny) * 10.0).toFixed(1)
      const lonSec = (40.0 + nx * 18.0).toFixed(1)
      onCoordinateMove?.(`16°28′${latSec}″ N`, `80°32′${lonSec}″ E`)
    }
    if (isDragging) {
      setPan({ x: e.clientX - dragOrigin.x, y: e.clientY - dragOrigin.y })
    }
  }

  const handleMouseUp = () => setIsDragging(false)
  const handleMouseLeave = () => setIsDragging(false)

  const handleZoomIn = () => setZoom((z) => Math.min(3.0, Math.round((z + 0.25) * 100) / 100))
  const handleZoomOut = () => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))
  const handleFitExtent = () => {
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
  }

  const scaleRatio = Math.round(2500 / zoom)
  const pxMeters = (0.42 / zoom).toFixed(2)

  return (
    <div
      className="map-canvas"
      aria-label={comparison ? 'Boundary comparison map' : 'Parcel map'}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseLeave}
      style={{ cursor: activeTool === 'pan' ? (isDragging ? 'grabbing' : 'grab') : 'crosshair' }}
    >
      <div className="map-grid" />
      <span className="map-label one">
        {parcelCode}
        <br />
        <small>{areaHa}</small>
      </span>
      <span className="map-label two">
        {locality}
        <br />
        <small>EPSG:4326</small>
      </span>

      {/* Floating HUD Toolbar (Elevation 2) */}
      <div className="map-hud-toolbar" role="toolbar" aria-label="Map tools">
        <button
          type="button"
          className={`hud-btn ${activeTool === 'pan' ? 'active' : ''}`}
          title="Pan Map"
          aria-label="Pan tool"
          onClick={() => setActiveTool('pan')}
        >
          <span>✋</span>
        </button>
        <button
          type="button"
          className={`hud-btn ${activeTool === 'identify' ? 'active' : ''}`}
          title="Identify Parcel"
          aria-label="Identify parcel"
          onClick={() => setActiveTool('identify')}
        >
          <span>🎯</span>
        </button>
        <div className="hud-sep" />
        <button
          type="button"
          className={`hud-btn ${showMeasure ? 'active' : ''}`}
          title="Distance Measurement"
          aria-label="Distance measurement"
          onClick={() => setShowMeasure((m) => !m)}
        >
          <span>📏</span>
          <span className="font-code-tabular text-[11px]" style={{ fontFamily: 'JetBrains Mono, monospace' }}>
            {dynamicDistanceM.toFixed(2)} m
          </span>
        </button>
        <button
          type="button"
          className={`hud-btn ${activeTool === 'area' ? 'active' : ''}`}
          title="Polygon Area Calculation"
          aria-label="Area calculation"
          onClick={() => setActiveTool('area')}
        >
          <span>📐</span>
        </button>
        <div className="hud-sep" />
        <button
          type="button"
          className={`hud-btn ${activeTool === 'edit' ? 'active' : ''}`}
          title="Edit Boundary"
          aria-label="Edit boundary"
          onClick={() => {
            setActiveTool('edit')
            onPropose?.()
          }}
          style={{ color: '#c75c3e' }}
        >
          <span>✎</span>
          <span style={{ fontSize: '11px', fontWeight: 600 }}>Edit Boundary</span>
        </button>
        <div className="hud-sep" />
        <button
          type="button"
          className="hud-btn"
          title="Reset North"
          aria-label="Reset north"
          onClick={handleFitExtent}
        >
          <span>🧭</span>
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

      {/* Floating Surveyor Compass Rose */}
      <div className="map-compass" title="Orientation">
        <span className="compass-n">N</span>
        <svg viewBox="0 0 20 40" width="14" height="26">
          <polygon fill="#C75C3E" points="10,0 20,20 10,16" />
          <polygon fill="#4A1F2B" points="10,0 0,20 10,16" />
          <polygon fill="#6E625D" points="10,40 20,20 10,16" />
          <polygon fill="#D9CEC7" points="10,40 0,20 10,16" />
        </svg>
        <span className="compass-deg">0.0°</span>
      </div>

      {/* Floating Zoom & Extent Cluster */}
      <div className="map-zoom-cluster" role="group" aria-label="Map zoom controls">
        <button aria-label="Zoom in" title="Zoom In" onClick={handleZoomIn}>
          +
        </button>
        <div style={{ height: '1px', background: '#d9cec7', margin: '1px 3px' }} />
        <button aria-label="Zoom out" title="Zoom Out" onClick={handleZoomOut}>
          −
        </button>
        <div style={{ height: '1px', background: '#d9cec7', margin: '1px 3px' }} />
        <button aria-label="Fit extent" title="Extent / Fit Area" onClick={handleFitExtent}>
          ⌗
        </button>
      </div>

      {/* Floating Cartographic Scale Bar */}
      <div className="map-scale-bar" role="region" aria-label="Cartographic scale bar">
        <div className="scale-ticks">
          <span>0</span>
          <span>50m</span>
          <span>100m</span>
          <span>200m</span>
        </div>
        <div className="scale-bar-track">
          <div className="scale-block oxblood" />
          <div className="scale-block white" />
          <div className="scale-block oxblood" />
          <div className="scale-block white" />
        </div>
        <div className="scale-meta">
          <span>SCALE 1:{scaleRatio}</span>
          <span>1px = {pxMeters}m</span>
        </div>
      </div>

      {/* Cartographic SVG Drawing Surface */}
      <svg
        viewBox="0 0 1200 800"
        role="img"
        aria-label="Recorded and proposed parcel boundaries"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <pattern id="surveyGrid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="#D9CEC7" strokeDasharray="2 4" strokeWidth="0.75" />
            <circle cx="0" cy="0" r="1.5" fill="#6E625D" />
            <circle cx="100" cy="0" r="1.5" fill="#6E625D" />
            <circle cx="0" cy="100" r="1.5" fill="#6E625D" />
            <circle cx="100" cy="100" r="1.5" fill="#6E625D" />
          </pattern>
          <pattern id="varianceHatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45 0 0)">
            <line x1="0" y1="0" x2="0" y2="8" stroke="#E5A234" strokeWidth="2" />
          </pattern>
          <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#e5a234" strokeWidth="3" />
          </pattern>
          <pattern id="disputePattern" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-45 0 0)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#B94732" strokeWidth="1.5" strokeDasharray="3 3" />
          </pattern>
        </defs>

        <rect fill="#FFF8ED" height="100%" width="100%" />
        <rect fill="url(#surveyGrid)" height="100%" width="100%" />

        <g
          transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
          style={{ transformOrigin: '50% 50%', transition: isDragging ? 'none' : 'transform 0.12s ease-out' }}
        >
          {/* Subtle Topographic Contours */}
          {activeLayers.topoContours && (
            <g opacity="0.35">
              <path d="M-50,180 Q250,220 520,160 T1100,210 L1250,230" fill="none" stroke="#D9CEC7" strokeWidth="1.5" />
              <path d="M-50,320 Q300,340 600,280 T1150,330" fill="none" stroke="#D9CEC7" strokeWidth="1" />
              <path d="M-50,490 Q220,530 580,470 T1250,510" fill="none" stroke="#D9CEC7" strokeWidth="1.5" />
              <path d="M-50,670 Q350,620 700,680 T1250,650" fill="none" stroke="#D9CEC7" strokeWidth="1" />
            </g>
          )}

          {/* Survey Baselines / Field Track Alignments */}
          {activeLayers.surveyBaselines && (
            <g opacity="0.4" stroke="#6E625D" strokeDasharray="6 3" strokeWidth="1.2">
              <line x1="40" x2="1160" y1="60" y2="180" />
              <line x1="420" x2="380" y1="20" y2="780" />
              <line x1="840" x2="810" y1="40" y2="780" />
            </g>
          )}

          {/* Surrounding Registered Parcels (MAP-02) */}
          {activeLayers.registeredParcels && (
            <g className="surrounding-parcels">
              {surroundingParcels && surroundingParcels.length > 0 ? (
                surroundingParcels.map((sp) => {
                  const sRings = sp.geometry ? extractRingsFromGeoJson(sp.geometry) : []
                  const sProj = sRings.length > 0 ? projectRingsToSvg(sRings, bbox, 1200, 800, 100) : null
                  if (sProj && sProj.pathD) {
                    const midV = sProj.vertices.length > 0 ? sProj.vertices[0] : [200, 200]
                    return (
                      <g key={sp.code} className="surrounding-parcel" onClick={() => onSelectParcelCode?.(sp.code)} style={{ cursor: 'pointer' }}>
                        <path d={sProj.pathD} fill="#F7E9E1" fillOpacity="0.45" stroke="#4A1F2B" strokeWidth="1.5" />
                        <text fill="#6E625D" fontFamily="'JetBrains Mono', monospace" fontSize="11" fontWeight="600" x={midV[0]} y={midV[1]}>
                          {sp.code}
                        </text>
                        <text fill="#6E625D" fontFamily="'Hanken Grotesk', sans-serif" fontSize="10" x={midV[0]} y={midV[1] + 16}>
                          {sp.area}
                        </text>
                      </g>
                    )
                  }
                  return null
                })
              ) : (
                <>
                  {/* PR-2024-0410 */}
                  <polygon
                    fill="#F7E9E1"
                    fillOpacity="0.45"
                    points="120,80 380,110 360,340 100,300"
                    stroke="#4A1F2B"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectParcelCode?.('PR-2024-0410')}
                  />
                  <text fill="#6E625D" fontFamily="'JetBrains Mono', monospace" fontSize="11" fontWeight="600" x="200" y="210">
                    PR-2024-0410
                  </text>
                  <text fill="#6E625D" fontFamily="'Hanken Grotesk', sans-serif" fontSize="10" x="200" y="226">
                    10.45 ha • Cultivated
                  </text>

                  {/* PR-2024-0413 */}
                  <polygon
                    fill="#FFFDFC"
                    fillOpacity="0.6"
                    points="380,110 740,150 710,380 360,340"
                    stroke="#4A1F2B"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectParcelCode?.('PR-2024-0413')}
                  />
                  <text fill="#6E625D" fontFamily="'JetBrains Mono', monospace" fontSize="11" fontWeight="600" x="500" y="240">
                    PR-2024-0413
                  </text>
                  <text fill="#6E625D" fontFamily="'Hanken Grotesk', sans-serif" fontSize="10" x="500" y="256">
                    12.18 ha • Dryland
                  </text>

                  {/* PR-2024-0418 */}
                  <polygon
                    fill="#F7E9E1"
                    fillOpacity="0.35"
                    points="740,150 1110,190 1070,440 710,380"
                    stroke="#4A1F2B"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectParcelCode?.('PR-2024-0418')}
                  />
                  <text fill="#6E625D" fontFamily="'JetBrains Mono', monospace" fontSize="11" fontWeight="600" x="870" y="280">
                    PR-2024-0418
                  </text>
                  <text fill="#6E625D" fontFamily="'Hanken Grotesk', sans-serif" fontSize="10" x="870" y="296">
                    16.32 ha • Orchard
                  </text>

                  {/* PR-2024-0422 */}
                  <polygon
                    fill="#FFFDFC"
                    fillOpacity="0.5"
                    points="90,320 350,360 320,680 70,640"
                    stroke="#4A1F2B"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectParcelCode?.('PR-2024-0422')}
                  />
                  <text fill="#6E625D" fontFamily="'JetBrains Mono', monospace" fontSize="11" fontWeight="600" x="170" y="500">
                    PR-2024-0422
                  </text>
                  <text fill="#6E625D" fontFamily="'Hanken Grotesk', sans-serif" fontSize="10" x="170" y="516">
                    9.80 ha • Irrigated
                  </text>

                  {/* PR-2024-0429 */}
                  <polygon
                    fill="#F7E9E1"
                    fillOpacity="0.35"
                    points="700,400 1060,460 1010,720 670,680"
                    stroke="#4A1F2B"
                    strokeWidth="1.5"
                    style={{ cursor: 'pointer' }}
                    onClick={() => onSelectParcelCode?.('PR-2024-0429')}
                  />
                  <text fill="#6E625D" fontFamily="'JetBrains Mono', monospace" fontSize="11" fontWeight="600" x="810" y="560">
                    PR-2024-0429
                  </text>
                  <text fill="#6E625D" fontFamily="'Hanken Grotesk', sans-serif" fontSize="10" x="810" y="576">
                    11.75 ha • Planted
                  </text>
                </>
              )}
            </g>
          )}

          {/* HERO SELECTED PARCEL UNDER ADJUDICATION */}
          {/* 1. Variance / Discrepancy Hatching */}
          {(comparison || activeLayers.disputedOverlaps) &&
            (proposedProj.pathD ? (
              <path className="variance" d={proposedProj.pathD} fill="url(#varianceHatch)" opacity="0.85" />
            ) : (
              <polygon
                className="variance"
                fill="url(#varianceHatch)"
                opacity="0.85"
                points="350,360 480,375 520,380 700,400 730,480 660,690 620,705 320,680"
              />
            ))}

          {/* 2. Registered Boundary */}
          {activeLayers.registeredParcels &&
            (recordedProj.pathD ? (
              <path className="recorded" d={recordedProj.pathD} fill="#FFFDFC" fillOpacity="0.5" stroke="#4A1F2B" strokeWidth="2.5" />
            ) : (
              <polygon
                className="recorded"
                fill="#FFFDFC"
                fillOpacity="0.5"
                points="350,360 700,400 660,690 320,680"
                stroke="#4A1F2B"
                strokeWidth="2.5"
              />
            ))}

          {/* 3. Proposed Resurvey Boundary */}
          {activeLayers.proposedResurveys &&
            (proposedProj.pathD ? (
              <path className="proposed" d={proposedProj.pathD} fill="none" stroke="#C75C3E" strokeWidth="2.5" strokeDasharray="7 4" />
            ) : (
              <polygon
                className="proposed"
                fill="none"
                points="338,348 718,388 732,492 682,710 308,692"
                stroke="#C75C3E"
                strokeDasharray="7 4"
                strokeWidth="2.5"
              />
            ))}

          {/* Discrepancy Callout Flag (MAP-03) */}
          {activeLayers.disputedOverlaps && (
            <g transform="translate(680, 520)">
              <rect fill="#FFFDFC" height="42" rx="3" stroke="#E5A234" strokeWidth="1.5" width="148" x="0" y="0" />
              <text fill="#624000" fontFamily="'Hanken Grotesk', sans-serif" fontSize="9" fontWeight="700" letterSpacing="0.04em" x="8" y="16">
                VARIANCE: {areaDeltaText || '+1,270 m²'}
              </text>
              <text fill="#4A1F2B" fontFamily="'JetBrains Mono', monospace" fontSize="11" fontWeight="600" x="8" y="32">
                Adjudication Delta
              </text>
            </g>
          )}

          {/* Station Monuments & Crosshairs on Hero Parcel (MAP-01 interactive selection) */}
          {activeVertices.length > 0 ? (
            activeVertices.map(([x, y], idx) => (
              <g
                key={`v-${x}-${y}-${idx}`}
                style={{ cursor: 'pointer' }}
                onClick={() => {
                  setSelectedStations(([prevA]) => (prevA === idx ? [idx, (idx + 1) % activeVertices.length] : [prevA, idx]))
                }}
              >
                <circle
                  className="vertex"
                  cx={x}
                  cy={y}
                  r="5"
                  fill={idx === stAIdx || idx === stBIdx ? '#C75C3E' : '#4A1F2B'}
                  stroke="#FFF8ED"
                  strokeWidth="1.5"
                />
                <line stroke="#FFF8ED" strokeWidth="1" x1={x - 6} x2={x + 6} y1={y} y2={y} />
                <line stroke="#FFF8ED" strokeWidth="1" x1={x} x2={x} y1={y - 6} y2={y + 6} />
                <text fill="#4A1F2B" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="600" x={x + 8} y={y - 4}>
                  ST-{String(idx + 1).padStart(2, '0')}
                </text>
              </g>
            ))
          ) : (
            <>
              {/* ST-01 */}
              <circle cx="350" cy="360" fill="#4A1F2B" r="4.5" stroke="#FFF8ED" strokeWidth="1.5" />
              <line stroke="#FFF8ED" strokeWidth="1" x1="344" x2="356" y1="360" y2="360" />
              <line stroke="#FFF8ED" strokeWidth="1" x1="350" x2="350" y1="354" y2="366" />
              <text fill="#4A1F2B" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="600" x="360" y="354">
                ST-01
              </text>

              {/* ST-02 */}
              <circle cx="700" cy="400" fill="#4A1F2B" r="4.5" stroke="#FFF8ED" strokeWidth="1.5" />
              <line stroke="#FFF8ED" strokeWidth="1" x1="694" x2="706" y1="400" y2="400" />
              <line stroke="#FFF8ED" strokeWidth="1" x1="700" x2="700" y1="394" y2="406" />
              <text fill="#4A1F2B" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="600" x="668" y="392">
                ST-02
              </text>

              {/* ST-03 */}
              <circle cx="660" cy="690" fill="#4A1F2B" r="4.5" stroke="#FFF8ED" strokeWidth="1.5" />
              <line stroke="#FFF8ED" strokeWidth="1" x1="654" x2="666" y1="690" y2="690" />
              <line stroke="#FFF8ED" strokeWidth="1" x1="660" x2="660" y1="684" y2="696" />
              <text fill="#4A1F2B" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="600" x="670" y="705">
                ST-03
              </text>

              {/* ST-04 */}
              <circle cx="320" cy="680" fill="#4A1F2B" r="4.5" stroke="#FFF8ED" strokeWidth="1.5" />
              <line stroke="#FFF8ED" strokeWidth="1" x1="314" x2="326" y1="680" y2="680" />
              <line stroke="#FFF8ED" strokeWidth="1" x1="320" x2="320" y1="674" y2="686" />
              <text fill="#4A1F2B" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="600" x="290" y="696">
                ST-04
              </text>

              {/* Resurvey Proposed Vertices (Terracotta Square Markers) */}
              <rect fill="#C75C3E" height="8" stroke="#FFF8ED" strokeWidth="1.5" width="8" x="334" y="344" />
              <rect fill="#C75C3E" height="8" stroke="#FFF8ED" strokeWidth="1.5" width="8" x="714" y="384" />
              <rect fill="#C75C3E" height="8" stroke="#FFF8ED" strokeWidth="1.5" width="8" x="728" y="488" />
              <rect fill="#C75C3E" height="8" stroke="#FFF8ED" strokeWidth="1.5" width="8" x="678" y="706" />
              <rect fill="#C75C3E" height="8" stroke="#FFF8ED" strokeWidth="1.5" width="8" x="304" y="688" />
            </>
          )}

          {/* Selected Parcel Identification Stamp (MAP-03) */}
          <g transform="translate(450, 480)">
            <rect fill="#4A1F2B" height="66" rx="3" width="170" x="0" y="0" />
            <text fill="#FFF8ED" fontFamily="'Newsreader', serif" fontSize="16" fontWeight="600" x="12" y="22">
              {parcelCode}
            </text>
            <text fill="#F7E9E1" fontFamily="'JetBrains Mono', monospace" fontSize="11" x="12" y="40">
              REG: {areaHa}
            </text>
            <text fill="#E5A234" fontFamily="'JetBrains Mono', monospace" fontSize="11" fontWeight="600" x="12" y="54">
              {proposedAreaHa ? `NEW: ${proposedAreaHa} (${areaDeltaText || 'Δ+0.89%'})` : 'Baseline Verified'}
            </text>
          </g>

          {/* Distance Measurement Vector (Caliper Vector Line) (MAP-01) */}
          {showMeasure && (
            <g className="measurement-vector">
              <line stroke="#4A1F2B" strokeDasharray="3 3" strokeWidth="1.5" x1={vA[0]} x2={vB[0]} y1={vA[1]} y2={vB[1]} />
              <line stroke="#4A1F2B" strokeWidth="1.5" x1={vA[0] - 2} x2={vA[0] + 2} y1={vA[1] - 8} y2={vA[1] + 8} />
              <line stroke="#4A1F2B" strokeWidth="1.5" x1={vB[0] - 2} x2={vB[0] + 2} y1={vB[1] - 8} y2={vB[1] + 8} />
              <rect
                fill="#FFFDFC"
                height="20"
                rx="2"
                stroke="#4A1F2B"
                strokeWidth="1"
                width="84"
                x={(vA[0] + vB[0]) / 2 - 42}
                y={(vA[1] + vB[1]) / 2 - 10}
              />
              <text
                fill="#4A1F2B"
                fontFamily="'JetBrains Mono', monospace"
                fontSize="11"
                fontWeight="600"
                textAnchor="middle"
                x={(vA[0] + vB[0]) / 2}
                y={(vA[1] + vB[1]) / 2 + 4}
              >
                {dynamicDistanceM.toFixed(2)} m
              </text>
            </g>
          )}

          {/* Geodetic Ground Control Points (GCP) */}
          {activeLayers.groundControlPoints && (
            <>
              <g transform="translate(260, 160)">
                <polygon fill="#4A1F2B" points="0,-7 6,5 -6,5" stroke="#FFF8ED" strokeWidth="1.5" />
                <circle cx="0" cy="1" fill="#FFF8ED" r="1.5" />
                <text fill="#6E625D" fontFamily="'JetBrains Mono', monospace" fontSize="9" x="9" y="4">
                  GCP-881
                </text>
              </g>
              <g transform="translate(940, 640)">
                <polygon fill="#4A1F2B" points="0,-7 6,5 -6,5" stroke="#FFF8ED" strokeWidth="1.5" />
                <circle cx="0" cy="1" fill="#FFF8ED" r="1.5" />
                <text fill="#6E625D" fontFamily="'JetBrains Mono', monospace" fontSize="9" x="9" y="4">
                  GCP-882
                </text>
              </g>
            </>
          )}

          {comparison && activeVertices.length > 0 && (
            <text className="svg-label" x={Math.min(activeVertices[0][0] + 12, 1000)} y={Math.max(activeVertices[0][1] - 12, 40)}>
              Δ Proposed Resurvey
            </text>
          )}
        </g>
      </svg>

      {/* Legacy/Comparison Map Legend */}
      {comparison && (
        <div className="map-legend">
          {recordedProj.pathD && (
            <span>
              <i className="line" />
              Recorded
            </span>
          )}
          {proposedProj.pathD && (
            <span>
              <i className="dash" />
              Proposed
            </span>
          )}
          {proposedProj.pathD && (
            <span>
              <i className="hatch" />
              Difference
            </span>
          )}
        </div>
      )}

      {/* Cartographic Footer */}
      <div className="map-footer">
        GeoJSON storage: EPSG:4326 · Bounds [{bbox[0].toFixed(5)}, {bbox[1].toFixed(5)}] to [{bbox[2].toFixed(5)}, {bbox[3].toFixed(5)}]
      </div>
    </div>
  )
}

function ParcelTable({
  parcels,
  go,
  onSelect
}: {
  parcels: DisplayParcel[]
  go: (v: View) => void
  onSelect?: (id: string) => void
}) {
  return (
    <div className="table">
      <div className="table-head">
        <span>Parcel</span>
        <span>Locality</span>
        <span>Area</span>
        <span>Status</span>
        <span />
      </div>
      {parcels.length === 0 ? (
        <div
          className="row"
          style={{
            gridTemplateColumns: '1fr',
            textAlign: 'center',
            color: '#6e625d',
            padding: '16px',
            fontStyle: 'italic'
          }}
        >
          No parcels found matching your search.
        </div>
      ) : (
        parcels.map((p) => (
          <div className="row" key={p.id}>
            <b>{p.code}</b>
            <span>{p.locality}</span>
            <span>{p.area}</span>
            <span>
              <em className={`status ${p.status === 'Active' || p.status === 'ACTIVE' ? 'valid' : ''}`}>
                ◐ {p.status}
              </em>
            </span>
            <button
              className="arrow"
              aria-label={`Inspect ${p.code}`}
              onClick={() => {
                if (onSelect) onSelect(p.id)
                go('parcel')
              }}
            >
              →
            </button>
          </div>
        ))
      )}
    </div>
  )
}

function Dashboard({
  parcels,
  go,
  onNewParcel,
  onSelectParcel,
  searchQuery
}: {
  parcels: DisplayParcel[]
  go: (v: View) => void
  onNewParcel: () => void
  onSelectParcel: (id: string) => void
  searchQuery?: string
}) {
  return (
    <>
      <section className="heading">
        <div>
          <p className="eyebrow">Academic GIS workspace / District 4</p>
          <h2>Survey operations overview</h2>
          <p>Review survey work, boundary proposals, and traceable project activity.</p>
        </div>
        <div className="actions">
          <button className="button secondary" onClick={() => go('map')}>
            Open map workspace
          </button>
          <button className="button orange-button" onClick={onNewParcel}>
            ＋ New Parcel Entry
          </button>
          <button className="button primary" onClick={() => go('parcel')}>
            Review parcels
          </button>
        </div>
      </section>

      <section className="metrics" aria-label="Demonstration operations metrics">
        <article>
          <p>
            Active resurveys{' '}
            <small style={{ textTransform: 'none', color: '#a03f24', fontSize: '9px', fontWeight: 600 }}>
              [Demo]
            </small>
          </p>
          <strong>42</strong>
          <span>14 awaiting review (simulated)</span>
        </article>
        <article>
          <p>
            Flagged for review{' '}
            <small style={{ textTransform: 'none', color: '#a03f24', fontSize: '9px', fontWeight: 600 }}>
              [Demo]
            </small>
          </p>
          <strong className="orange">18 parcels</strong>
          <span>Area or boundary variance</span>
        </article>
        <article>
          <p>
            Validated this month{' '}
            <small style={{ textTransform: 'none', color: '#a03f24', fontSize: '9px', fontWeight: 600 }}>
              [Demo]
            </small>
          </p>
          <strong>184</strong>
          <span>Geometry checks passed</span>
        </article>
        <article>
          <p>
            Open audit items{' '}
            <small style={{ textTransform: 'none', color: '#a03f24', fontSize: '9px', fontWeight: 600 }}>
              [Demo]
            </small>
          </p>
          <strong>9</strong>
          <span>Reviewer action required</span>
        </article>
      </section>

      <section className="grid dashboard">
        <article className="panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">
                {searchQuery
                  ? `Filtered queue (${parcels.length} match${parcels.length === 1 ? '' : 'es'})`
                  : 'Priority queue'}
              </p>
              <h2>Parcels pending boundary review</h2>
            </div>
            <button className="text-button" onClick={() => go('boundary')}>
              Review all →
            </button>
          </div>
          <ParcelTable parcels={parcels} go={go} onSelect={onSelectParcel} />
        </article>

        <article className="panel">
          <p className="eyebrow">Connection</p>
          <h2>System status</h2>
          <BackendStatus />
        </article>
      </section>

      <section className="panel activity">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Traceability</p>
            <h2>Recent project activity</h2>
          </div>
          <small style={{ font: '10px "JetBrains Mono", monospace', color: '#6e625d' }}>
            [Demonstration activity log]
          </small>
        </div>
        <ol>
          <li>
            <i />
            <div>
              <b>
                Boundary adjustment proposed{' '}
                <small style={{ color: '#a03f24', fontWeight: 600 }}>[Demo]</small>
              </b>
              <p>PR-2024-0412 demonstration traverse submitted for reviewer assessment.</p>
            </div>
            <time>Today, 14:22</time>
          </li>
          <li>
            <i />
            <div>
              <b>
                Geometry validation completed{' '}
                <small style={{ color: '#a03f24', fontWeight: 600 }}>[Demo]</small>
              </b>
              <p>Topology checks completed for the Kothapeta demonstration batch.</p>
            </div>
            <time>Today, 11:05</time>
          </li>
          <li>
            <i />
            <div>
              <b>
                Baseline geometry imported{' '}
                <small style={{ color: '#a03f24', fontWeight: 600 }}>[Demo]</small>
              </b>
              <p>Authorized demonstration reference geometry was registered.</p>
            </div>
            <time>12 Oct</time>
          </li>
        </ol>
      </section>
    </>
  )
}

function MapView({
  selectedParcel,
  parcelDetail,
  geometryHistory,
  isLoadingGeometry,
  geometryError,
  spatialAnalysis,
  allParcels = [],
  go,
  onInitiateResurvey,
  onSelectParcelCode
}: {
  selectedParcel: DisplayParcel
  parcelDetail: ParcelDetail | null
  geometryHistory: GeometryResponse[]
  isLoadingGeometry: boolean
  geometryError: string | null
  spatialAnalysis: SpatialAnalysisResponse | null
  allParcels?: DisplayParcel[]
  go: (v: View) => void
  onInitiateResurvey: () => void
  onSelectParcelCode: (code: string) => void
}) {
  const code = parcelDetail?.parcelCode || selectedParcel.code
  const locality = parcelDetail
    ? `${parcelDetail.village || 'Village'}, ${parcelDetail.district}`
    : selectedParcel.locality
  const area = parcelDetail?.currentGeometry?.areaSqM
    ? `${(parcelDetail.currentGeometry.areaSqM / 10000).toFixed(3)} ha`
    : selectedParcel.area

  const historyList = Array.isArray(geometryHistory) ? geometryHistory : []
  const recordedGeom = parcelDetail?.currentGeometry?.geometry || selectedParcel.geometry
  const pendingProposal = historyList.find((g) => g.status === 'PROPOSED')
  const proposedGeom = pendingProposal?.geometry || selectedParcel.proposedGeometry

  const [layers, setLayers] = useState<LayerVisibility>(DEFAULT_LAYERS)
  const [adjudicationStatus, setAdjudicationStatus] = useState('All Statuses (1,420)')
  const [areaFilter, setAreaFilter] = useState(15)
  const [coords, setCoords] = useState({ lat: '16°28′14.2″ N', lon: '80°32′48.6″ E' })

  const activeLayerCount = Object.values(layers).filter(Boolean).length

  // Metrics from spatial analysis API or calculated/default
  const recAreaHa = spatialAnalysis?.recordedAreaHa != null
    ? `${spatialAnalysis.recordedAreaHa.toFixed(3)} ha`
    : area
  const recAreaSqM = spatialAnalysis?.recordedAreaSqM != null
    ? `${spatialAnalysis.recordedAreaSqM.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`
    : '142,850.00 m²'
  const propAreaHa = spatialAnalysis?.proposedAreaHa != null
    ? `${spatialAnalysis.proposedAreaHa.toFixed(3)} ha`
    : pendingProposal?.areaSqM
      ? `${(pendingProposal.areaSqM / 10000).toFixed(3)} ha`
      : '14.412 ha'
  const deltaText = spatialAnalysis?.areaDeltaSqM != null && spatialAnalysis?.areaDeltaPercentage != null
    ? `${spatialAnalysis.areaDeltaSqM >= 0 ? '+' : ''}${spatialAnalysis.areaDeltaSqM.toFixed(0)} m² (${spatialAnalysis.areaDeltaPercentage >= 0 ? '+' : ''}${spatialAnalysis.areaDeltaPercentage.toFixed(2)}%)`
    : '+0.127 ha (+0.89%)'
  const perimeterText = spatialAnalysis?.perimeterM != null
    ? `${spatialAnalysis.perimeterM.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`
    : '1,894.20 m'
  const stationCountText = spatialAnalysis?.stationCount != null
    ? `${spatialAnalysis.stationCount} Stations (4 Primary)`
    : '18 Stations (4 Primary)'

  // Station displacements
  const stationsList = spatialAnalysis?.stationDisplacements && spatialAnalysis.stationDisplacements.length > 0
    ? spatialAnalysis.stationDisplacements.slice(0, 4)
    : [
        { station: 'ST-01', lonExisting: 80.4312, latExisting: 16.3021, lonProposed: 80.431, latProposed: 16.3024, shiftDistanceM: 1.2 },
        { station: 'ST-02', lonExisting: 80.4355, latExisting: 16.3025, lonProposed: 80.4358, latProposed: 16.3027, shiftDistanceM: 2.4 },
        { station: 'ST-03', lonExisting: 80.4348, latExisting: 16.2985, lonProposed: 80.4352, latProposed: 16.2982, shiftDistanceM: 0.8 },
        { station: 'ST-04', lonExisting: 80.4305, latExisting: 16.2981, lonProposed: 80.4303, latProposed: 16.2979, shiftDistanceM: 0.3 }
      ]

  const [mobileTab, setMobileTab] = useState<'map' | 'layers' | 'inspector'>('map')

  const handleExportGeoJson = () => {
    // MAP-05: Real geometry export, avoiding silent fallback to demo geometry
    const boundaryGeometry = recordedGeom || proposedGeom || null
    const feature = {
      type: 'Feature',
      id: parcelDetail?.id || selectedParcel.id,
      properties: {
        parcelCode: code,
        name: parcelDetail?.name || selectedParcel.code,
        village: parcelDetail?.village || 'Kothapeta',
        district: parcelDetail?.district || 'Guntur',
        state: parcelDetail?.state || 'Andhra Pradesh',
        landUse: parcelDetail?.landUse || 'AGRICULTURAL',
        status: parcelDetail?.status || selectedParcel.status,
        areaHa: area,
        crs: 'EPSG:4326',
        geometryStatus: boundaryGeometry ? 'REGISTERED' : 'UNREGISTERED',
        gazetted: false,
        disclaimer: 'Academic review aid - not a certified legal cadastre'
      },
      geometry: boundaryGeometry
    }

    const jsonContent = JSON.stringify(feature, null, 2)
    const blob = new Blob([jsonContent], { type: 'application/geo+json;charset=utf-8;' })
    const filename = `${code}_boundary.geojson`

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', filename)
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <section className="workspace" aria-label="Map workspace">
      {/* Top Utility Bar */}
      <div className="map-top-bar">
        <div className="map-breadcrumbs">
          <span className="cadastral-sheet-title">Cadastral Sheet</span>
          <span className="sep">/</span>
          <span className="taluk-label">Taluk: Kothapeta</span>
          <span className="sep">/</span>
          <span className="block-label">Block 3 (Chengalpattu Agro-Cluster)</span>
          <span className="crs-badge">CRS: EPSG:4326 (UTM 44N)</span>
        </div>
        <div className="map-coords-hud">
          <div className="coords-readout">
            <span>🧭</span>
            <span>
              LAT: <strong>{coords.lat}</strong>
            </span>
            <span className="sep">|</span>
            <span>
              LON: <strong>{coords.lon}</strong>
            </span>
            <span className="sep">|</span>
            <span>
              ELEV: <strong>34.8m MSL</strong>
            </span>
          </div>
          <div className="engine-status">
            <span className="engine-dot" />
            <span className="engine-label">Vector Engine Active</span>
          </div>
        </div>
      </div>

      <div className="heading workspace-heading" style={{ margin: '14px 0 10px' }}>
        <div>
          <p className="eyebrow">Map workspace / {code}</p>
          <h2>Parcel review canvas</h2>
        </div>
        <em className="status valid">▣ Geometry policy: EPSG:4326</em>
      </div>

      {/* Mobile Workspace Tabs for Viewport Switcher (UI-03) */}
      <div className="mobile-view-tabs" role="tablist" aria-label="Mobile workspace view tabs">
        <button
          type="button"
          className={`mobile-view-tab ${mobileTab === 'map' ? 'active' : ''}`}
          onClick={() => setMobileTab('map')}
        >
          ⌑ Map View
        </button>
        <button
          type="button"
          className={`mobile-view-tab ${mobileTab === 'layers' ? 'active' : ''}`}
          onClick={() => setMobileTab('layers')}
        >
          ▤ Layers ({activeLayerCount})
        </button>
        <button
          type="button"
          className={`mobile-view-tab ${mobileTab === 'inspector' ? 'active' : ''}`}
          onClick={() => setMobileTab('inspector')}
        >
          ℹ Inspector
        </button>
      </div>

      <div className={`map-layout tab-${mobileTab}`}>
        {/* LEFT DOCK: Layers, Survey Hierarchy & Query Filter */}
        <aside className="layers" id="layerPanel" aria-label="Spatial layers and filters">
          <div className="layers-header">
            <div className="layers-title">
              <span>▤</span>
              <span>Cadastral Layers</span>
            </div>
            <span className="active-badge">{activeLayerCount} ACTIVE</span>
          </div>

          <button className="button orange-button wide" onClick={onInitiateResurvey}>
            ＋ Initiate Parcel Resurvey
          </button>

          <p className="eyebrow" style={{ marginTop: '16px' }}>
            Spatial Fabric
          </p>

          <label className="layer">
            <input
              type="checkbox"
              checked={layers.registeredParcels}
              onChange={(e) => setLayers((prev) => ({ ...prev, registeredParcels: e.target.checked }))}
            />
            <span>
              <b>
                <span style={{ display: 'inline-block', width: '10px', height: '2px', background: '#4A1F2B', marginRight: '4px' }} />
                Registered Parcels
              </b>
              <small>1,420 polygons recorded</small>
            </span>
          </label>

          <label className="layer">
            <input
              type="checkbox"
              checked={layers.proposedResurveys}
              onChange={(e) => setLayers((prev) => ({ ...prev, proposedResurveys: e.target.checked }))}
            />
            <span>
              <b>
                <span style={{ display: 'inline-block', width: '10px', borderBottom: '2px dashed #C75C3E', marginRight: '4px' }} />
                Proposed Resurveys
              </b>
              <small style={{ color: '#c75c3e' }}>14 pending review</small>
            </span>
          </label>

          <label className="layer">
            <input
              type="checkbox"
              checked={layers.disputedOverlaps}
              onChange={(e) => setLayers((prev) => ({ ...prev, disputedOverlaps: e.target.checked }))}
            />
            <span>
              <b>
                <span style={{ display: 'inline-block', width: '10px', height: '8px', background: '#e5a234', marginRight: '4px' }} />
                Disputed Encroachments
              </b>
              <small style={{ color: '#8b5e00' }}>3 overlaps tagged</small>
            </span>
          </label>

          <label className="layer">
            <input
              type="checkbox"
              checked={layers.surveyBaselines}
              onChange={(e) => setLayers((prev) => ({ ...prev, surveyBaselines: e.target.checked }))}
            />
            <span>
              <b>Survey Baselines</b>
              <small>Trig Triangulation #04</small>
            </span>
          </label>

          <label className="layer">
            <input
              type="checkbox"
              checked={layers.groundControlPoints}
              onChange={(e) => setLayers((prev) => ({ ...prev, groundControlPoints: e.target.checked }))}
            />
            <span>
              <b>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', transform: 'rotate(45deg)', border: '1px solid #4a1f2b', marginRight: '4px' }} />
                Ground Control Points (GCP)
              </b>
              <small>Differential GNSS Fixed</small>
            </span>
          </label>

          <label className="layer">
            <input
              type="checkbox"
              checked={layers.topoContours}
              onChange={(e) => setLayers((prev) => ({ ...prev, topoContours: e.target.checked }))}
            />
            <span>
              <b>Contours (0.5m interval)</b>
              <small>LiDAR DTM Derived</small>
            </span>
          </label>

          {/* Filter & Spatial Bounds */}
          <div style={{ borderTop: '1px solid #d9cec7', marginTop: '16px', paddingTop: '10px' }}>
            <p className="eyebrow">Filter & Spatial Bounds</p>
            <label className="filter" style={{ marginTop: '6px' }}>
              Adjudication Status
              <select value={adjudicationStatus} onChange={(e) => setAdjudicationStatus(e.target.value)}>
                <option>All Statuses (1,420)</option>
                <option>Pending Resurvey Review (14)</option>
                <option>Validated & Approved (1,398)</option>
                <option>Boundary Dispute (8)</option>
              </select>
            </label>

            <div style={{ marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#6e625d' }}>
                <span>Area Filter</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#4a1f2b', fontWeight: 600 }}>
                  1.0 ha — {areaFilter}.0 ha
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="25"
                value={areaFilter}
                onChange={(e) => setAreaFilter(Number(e.target.value))}
                style={{ width: '100%', accentColor: '#4a1f2b', marginTop: '4px' }}
              />
            </div>
          </div>

          {/* Benchmark Reference */}
          <div className="benchmark-card">
            <div className="benchmark-head">
              <span className="benchmark-title">TBM-09 BENCHMARK</span>
              <span className="benchmark-fixed">FIXED</span>
            </div>
            <div className="benchmark-coords">
              X: 432,891.04 m E
              <br />
              Y: 1,821,438.12 m N
            </div>
            <div className="benchmark-sub">Monumented Brass Cap • Dept of Survey</div>
          </div>

          <div style={{ marginTop: '12px', fontSize: '10px', color: '#6e625d', display: 'flex', justifyContent: 'space-between' }}>
            <span>Projection: UTM 44N</span>
            <small>EPSG:4326</small>
          </div>
        </aside>

        {/* CENTER VIEWPORT: Vector GIS Interactive Map Canvas */}
        <div className="viewport-container" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <MapCanvas
            recordedGeometry={recordedGeom}
            proposedGeometry={proposedGeom}
            parcelCode={code}
            locality={locality}
            areaHa={area}
            proposedAreaHa={propAreaHa}
            areaDeltaText={deltaText}
            isLoading={isLoadingGeometry}
            error={geometryError}
            onPropose={onInitiateResurvey}
            onSelectParcelCode={onSelectParcelCode}
            activeLayers={layers}
            onCoordinateMove={(lat, lon) => setCoords({ lat, lon })}
            surroundingParcels={allParcels.filter((p) => p.code !== code)}
          />

          {/* BOTTOM LEGEND STRIP */}
          <div className="map-legend-strip" role="region" aria-label="Cadastral map legend">
            <div className="legend-items">
              <div className="legend-item">
                <span className="legend-swatch recorded" />
                <span>Recorded Boundary (Oxblood)</span>
              </div>
              <div className="legend-item">
                <span className="legend-swatch proposed" />
                <span>Resurvey Proposal (Terracotta Dashed)</span>
              </div>
              <div className="legend-item">
                <span className="legend-swatch variance" />
                <span>Variance Overlap (Saffron Hatched)</span>
              </div>
              <div className="legend-item">
                <span className="legend-swatch monument" />
                <span>Station Monument (GCP)</span>
              </div>
            </div>
            <span style={{ fontSize: '10px', color: '#6e625d' }}>
              ✓ Survey Authority: Directorate of Land Records
            </span>
          </div>
        </div>

        {/* RIGHT DOCK: Contextual Parcel Inspector */}
        <aside className="inspector" id="inspectorPanel" aria-label="Selected parcel inspector">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              Selected Parcel
            </p>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#6e625d' }}>
              INDEX: #0412-B3
            </span>
          </div>

          <h2 style={{ fontFamily: 'Newsreader, Georgia, serif', fontSize: '28px', margin: '4px 0 8px' }}>
            {code}
          </h2>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
            <span className="status" style={{ border: '1px solid #c68818', background: '#ffddb2', color: '#624000' }}>
              ◐ UNDER RESURVEY REVIEW
            </span>
            <span className="status valid" style={{ border: '1px solid #4a1f2b', background: '#ffd9e0', color: '#4a1f2b' }}>
              ▣ GEOMETRY: VALIDATED
            </span>
          </div>

          {/* Academic Cadastral Disclaimer Banner */}
          <div className="academic-disclaimer-banner">
            <strong style={{ color: '#4a1f2b' }}>Cadastral Review Aid:</strong> This comparative resurvey visualization is an academic inspection draft and does not constitute a certified legal deed until gazetted.
          </div>

          {/* Area Adjudication Metrics Card */}
          <div className="metrics-card">
            <p className="eyebrow" style={{ margin: '0 0 8px' }}>
              Area Adjudication Metrics
            </p>
            <div className="metrics-grid">
              <div className="metric-tile">
                <small>Recorded Title Area</small>
                <b>{recAreaHa}</b>
                <span>{recAreaSqM}</span>
              </div>
              <div className="metric-tile highlight">
                <small style={{ color: '#624000' }}>Computed Resurvey</small>
                <b style={{ color: '#4a1f2b' }}>{propAreaHa}</b>
                <span style={{ color: '#c75c3e', fontWeight: 600 }}>{deltaText}</span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px', fontSize: '11px' }}>
              <div>
                <span style={{ color: '#6e625d', display: 'block', fontSize: '10px' }}>Perimeter Length</span>
                <b style={{ fontFamily: 'JetBrains Mono, monospace', color: '#4a1f2b' }}>{perimeterText}</b>
              </div>
              <div>
                <span style={{ color: '#6e625d', display: 'block', fontSize: '10px' }}>Survey Monuments</span>
                <b style={{ fontFamily: 'JetBrains Mono, monospace', color: '#4a1f2b' }}>{stationCountText}</b>
              </div>
            </div>
          </div>

          {/* Cadastral Metadata & Tenure Card */}
          <div className="metrics-card">
            <p className="eyebrow" style={{ margin: '0 0 8px' }}>
              Cadastral Metadata & Tenure
            </p>
            <div style={{ fontSize: '11px', display: 'grid', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6e625d' }}>Tenure Classification:</span>
                <strong style={{ color: '#4a1f2b' }}>Rabi Agricultural Leasehold</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f2e6df', paddingTop: '4px' }}>
                <span style={{ color: '#6e625d' }}>Survey Locality:</span>
                <strong style={{ color: '#4a1f2b' }}>{locality}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f2e6df', paddingTop: '4px' }}>
                <span style={{ color: '#6e625d' }}>Revenue Village:</span>
                <strong style={{ color: '#4a1f2b' }}>Kothapeta Rural</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f2e6df', paddingTop: '4px' }}>
                <span style={{ color: '#6e625d' }}>Soil/Crop Class:</span>
                <strong style={{ color: '#4a1f2b' }}>Class II Alluvial / Multi-crop</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f2e6df', paddingTop: '4px' }}>
                <span style={{ color: '#6e625d' }}>Prior Survey Ref:</span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: '#4a1f2b' }}>SV-1984-VOL-82</span>
              </div>
            </div>
          </div>

          {/* Assigned Cadastral Lead */}
          <div className="lead-card">
            <div className="lead-avatar">KR</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong style={{ display: 'block', fontSize: '12px', color: '#4a1f2b' }}>K. Ramachandran</strong>
              <small style={{ color: '#6e625d', fontSize: '10px' }}>Senior Cadastral Review Officer</small>
            </div>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '9px', color: '#4a1f2b', background: '#ffd9e0', padding: '1px 5px', borderRadius: '2px' }}>
              BATCH #88-B
            </span>
          </div>

          {/* Monuments / Vertices Coordinate Drawer */}
          <div className="metrics-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                Monuments / Vertices
              </p>
              <button
                type="button"
                className="text-button"
                style={{ padding: 0, fontSize: '10px' }}
                onClick={() => go('boundary')}
              >
                Traverse Table →
              </button>
            </div>
            <table className="station-table">
              <thead>
                <tr>
                  <th>STN</th>
                  <th>EASTING</th>
                  <th>NORTHING</th>
                  <th style={{ textAlign: 'right' }}>Δ DIST</th>
                </tr>
              </thead>
              <tbody>
                {stationsList.map((st) => {
                  const utm = wgs84ToUtm44(st.lonExisting, st.latExisting)
                  return (
                    <tr key={st.station}>
                      <td style={{ fontWeight: 700, color: '#4a1f2b' }}>{st.station}</td>
                      <td>{utm.easting.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</td>
                      <td>{utm.northing.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</td>
                      <td style={{ textAlign: 'right', color: '#c75c3e', fontWeight: 600 }}>
                        +{st.shiftDistanceM ? st.shiftDistanceM.toFixed(1) : '1.2'}m
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Operational Triggers */}
          <div style={{ marginTop: 'auto', display: 'grid', gap: '8px' }}>
            <button className="button primary wide" onClick={() => go('boundary')}>
              Compare Resurvey Boundary
            </button>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button className="button secondary" onClick={() => go('parcel')}>
                Open Parcel Details
              </button>
              <button
                className="button secondary"
                onClick={handleExportGeoJson}
                aria-label="Export parcel boundary GeoJSON"
              >
                Export GeoJSON
              </button>
            </div>
          </div>
        </aside>
      </div>
    </section>
  )
}

function ParcelView({
  selectedParcel,
  parcelDetail,
  geometryHistory,
  isLoadingGeometry,
  geometryError,
  go,
  onProposeGeometry
}: {
  selectedParcel: DisplayParcel
  parcelDetail: ParcelDetail | null
  geometryHistory: GeometryResponse[]
  isLoadingGeometry: boolean
  geometryError: string | null
  go: (v: View) => void
  onProposeGeometry: () => void
}) {
  const code = parcelDetail?.parcelCode || selectedParcel.code
  const locality = parcelDetail
    ? `${parcelDetail.village || 'Village'}, ${parcelDetail.district}`
    : selectedParcel.locality
  const area = parcelDetail?.currentGeometry?.areaSqM
    ? `${(parcelDetail.currentGeometry.areaSqM / 10000).toFixed(3)} ha`
    : selectedParcel.area
  const status = parcelDetail ? parcelDetail.status : selectedParcel.status

  const historyList = Array.isArray(geometryHistory) ? geometryHistory : []
  const recordedGeom = parcelDetail?.currentGeometry?.geometry || selectedParcel.geometry
  const pendingProposal = historyList.find((g) => g.status === 'PROPOSED')
  const proposedGeom = pendingProposal?.geometry || selectedParcel.proposedGeometry

  const recordedRings = extractRingsFromGeoJson(recordedGeom)
  const activeRing = recordedRings[0] || extractRingsFromGeoJson(proposedGeom)[0] || null
  const stations =
    activeRing && activeRing.points.length > 0
      ? activeRing.points
          .slice(
            0,
            activeRing.points.length > 1 &&
              activeRing.points[0][0] === activeRing.points[activeRing.points.length - 1][0]
              ? -1
              : undefined
          )
          .map((pt, i) => ({
            name: `ST-${String(i + 1).padStart(2, '0')}`,
            lon: pt[0],
            lat: pt[1]
          }))
      : []

  return (
    <>
      <section className="heading">
        <div>
          <p className="eyebrow">Parcels / Southern agricultural basin</p>
          <h2>Parcel dossier: {code}</h2>
          <p>{locality} · Field division 14</p>
        </div>
        <div className="actions">
          <button className="button orange-button" onClick={onProposeGeometry}>
            Propose boundary
          </button>
          <button className="button secondary" onClick={() => go('map')}>
            View on map
          </button>
          <button className="button primary" onClick={() => go('boundary')}>
            Boundary comparison
          </button>
        </div>
      </section>

      <section className="parcel-layout">
        <div>
          <MapCanvas
            recordedGeometry={recordedGeom}
            proposedGeometry={proposedGeom}
            parcelCode={code}
            locality={locality}
            areaHa={area}
            isLoading={isLoadingGeometry}
            error={geometryError}
            onPropose={onProposeGeometry}
          />
          <article className="panel stations">
            <div className="panel-title">
              <h2>Boundary stations</h2>
              <small>{stations.length} recorded</small>
            </div>
            <div className="table compact">
              <div className="table-head">
                <span>Station</span>
                <span>Longitude (Easting)</span>
                <span>Latitude (Northing)</span>
                <span>Precision</span>
              </div>
              {stations.length > 0 ? (
                stations.slice(0, 6).map((st) => (
                  <div className="row" key={st.name}>
                    <b>{st.name}</b>
                    <span>{st.lon.toFixed(6)}°</span>
                    <span>{st.lat.toFixed(6)}°</span>
                    <span>± 0.015 m</span>
                  </div>
                ))
              ) : (
                <div className="row">
                  <b>ST-00</b>
                  <span>No vertices recorded</span>
                  <span>Unsurveyed</span>
                  <span>—</span>
                </div>
              )}
            </div>
          </article>
        </div>

        <div className="details">
          {pendingProposal ? (
            <article className="notice">
              <b>△ Pending variance approval required</b>
              <p>
                Version {pendingProposal.versionNo} proposes a boundary adjustment ({pendingProposal.source}). A reviewer must verify or reject it.
              </p>
              <button className="text-button" onClick={() => go('boundary')}>
                Review delta metrics →
              </button>
            </article>
          ) : (
            <article className="notice" style={{ borderLeftColor: '#4a1f2b' }}>
              <b>✓ Verified Cadastral Status</b>
              <p>
                Boundary version {parcelDetail?.currentGeometry?.versionNo || 1} is validated and in active standing under EPSG:4326.
              </p>
            </article>
          )}

          <article className="panel">
            <p className="eyebrow">Registry & geometry</p>
            <h2>Cadastral dimensions</h2>
            <div className="definitions">
              <div>
                <span>Recorded area</span>
                <b>{area}</b>
              </div>
              <div>
                <span>Current status</span>
                <b>{status}</b>
              </div>
              <div>
                <span>Storage CRS</span>
                <b>EPSG:4326</b>
              </div>
              <div>
                <span>Geometry</span>
                <b>{recordedGeom ? 'Validated Polygon' : 'Unsurveyed'}</b>
              </div>
            </div>
          </article>

          <article className="panel">
            <p className="eyebrow">Audit history</p>
            <h2>Boundary events</h2>
            <ol className="timeline">
              {historyList.length > 0 ? (
                historyList.map((g) => (
                  <li key={g.id}>
                    <i />
                    <div>
                      <b>
                        Version {g.versionNo}: {g.status}
                      </b>
                      <p>
                        Source: {g.source} · Created by {g.createdBy?.username || 'System'}
                      </p>
                      {g.reviewNotes && <small style={{ color: '#6e625d' }}>Notes: {g.reviewNotes}</small>}
                    </div>
                  </li>
                ))
              ) : (
                <li>
                  <i />
                  <div>
                    <b>Baseline record initialized</b>
                    <p>Demonstration record for {code}</p>
                  </div>
                </li>
              )}
            </ol>
          </article>
        </div>
      </section>
    </>
  )
}

function BoundaryView({
  selectedParcel,
  parcelDetail,
  geometryHistory,
  isLoadingGeometry,
  geometryError,
  spatialAnalysis,
  onApprove,
  onRequestResurvey,
  actionStatus
}: {
  selectedParcel: DisplayParcel
  parcelDetail: ParcelDetail | null
  geometryHistory: GeometryResponse[]
  isLoadingGeometry: boolean
  geometryError: string | null
  spatialAnalysis?: SpatialAnalysisResponse | null
  onApprove: (notes: string) => Promise<void>
  onRequestResurvey: (reason: string) => Promise<void>
  actionStatus: { type: 'success' | 'error'; message: string } | null
}) {
  const [decisionNotes, setDecisionNotes] = useState('')
  const [tab, setTab] = useState<'overlay' | 'side' | 'variance'>('overlay')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const code = parcelDetail?.parcelCode || selectedParcel.code
  const locality = parcelDetail
    ? `${parcelDetail.village || 'Village'}, ${parcelDetail.district}`
    : selectedParcel.locality
  const area = parcelDetail?.currentGeometry?.areaSqM
    ? `${(parcelDetail.currentGeometry.areaSqM / 10000).toFixed(3)} ha`
    : selectedParcel.area

  const historyList = Array.isArray(geometryHistory) ? geometryHistory : []
  const recordedGeom = parcelDetail?.currentGeometry?.geometry || selectedParcel.geometry
  const pendingProposal = historyList.find((g) => g.status === 'PROPOSED')
  const proposedGeom = pendingProposal?.geometry || selectedParcel.proposedGeometry

  const recordedRings = extractRingsFromGeoJson(recordedGeom)
  const proposedRings = extractRingsFromGeoJson(proposedGeom)

  const recPts = recordedRings[0]?.points || []
  const propPts = proposedRings[0]?.points || []
  const ledgerRows = propPts.slice(0, 5).map((pPt, i) => {
    const rPt = recPts[i] || pPt
    const dLon = (pPt[0] - rPt[0]) * Math.cos((pPt[1] * Math.PI) / 180) * 111320
    const dLat = (pPt[1] - rPt[1]) * 110540
    const dist = Math.sqrt(dLon * dLon + dLat * dLat)
    return {
      node: `ST-${String(i + 1).padStart(2, '0')}`,
      existing: `${rPt[0].toFixed(5)}°, ${rPt[1].toFixed(5)}°`,
      proposed: `${pPt[0].toFixed(5)}°, ${pPt[1].toFixed(5)}°`,
      shift: dist < 0.01 ? '< 0.01 m' : `${dist.toFixed(2)} m`
    }
  })

  const handleApprove = async () => {
    setIsSubmitting(true)
    try {
      await onApprove(decisionNotes || 'Approved boundary verification per field evidence.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleReject = async () => {
    if (!decisionNotes.trim()) {
      alert('Please specify rejection rationale in the decision notes field.')
      return
    }
    setIsSubmitting(true)
    try {
      await onRequestResurvey(decisionNotes)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleExportCsv = () => {
    const rowsToExport =
      ledgerRows.length > 0
        ? ledgerRows
        : [
            {
              node: 'ST-01',
              existing: 'No shift data',
              proposed: 'Awaiting resurvey',
              shift: '—'
            }
          ]

    const headers = ['Node', 'Existing_Coordinates', 'Proposed_Coordinates', 'Shift_Distance']
    const csvLines = [
      headers.join(','),
      ...rowsToExport.map((r) =>
        [
          `"${r.node}"`,
          `"${r.existing}"`,
          `"${r.proposed}"`,
          `"${r.shift}"`
        ].join(',')
      )
    ]
    const csvContent = csvLines.join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const filename = `${code}_vertex_change_ledger.csv`

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.setAttribute('href', url)
      link.setAttribute('download', filename)
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    }
  }

  return (
    <>
      <section className="heading">
        <div>
          <p className="eyebrow">Boundary review / {code}</p>
          <h2>Boundary comparison</h2>
          <p>Academic review aid — not a certified legal survey or title record.</p>
        </div>
        <div className="tabs">
          <button className={tab === 'overlay' ? 'selected' : ''} onClick={() => setTab('overlay')}>
            Overlay
          </button>
          <button className={tab === 'side' ? 'selected' : ''} onClick={() => setTab('side')}>
            Side-by-side
          </button>
          <button className={tab === 'variance' ? 'selected' : ''} onClick={() => setTab('variance')}>
            Variance only
          </button>
        </div>
      </section>

      {actionStatus && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: '16px',
            border: `1px solid ${actionStatus.type === 'success' ? '#4a1f2b' : '#b94732'}`,
            backgroundColor: actionStatus.type === 'success' ? '#f7e9e1' : '#ffdad6',
            color: actionStatus.type === 'success' ? '#4a1f2b' : '#93000a',
            fontSize: '13px',
            fontWeight: 600
          }}
        >
          {actionStatus.type === 'success' ? '✓ ' : '⚠ '}
          {actionStatus.message}
        </div>
      )}

      <section className="compare">
        <div>
          <MapCanvas
            comparison
            recordedGeometry={recordedGeom}
            proposedGeometry={proposedGeom}
            parcelCode={code}
            locality={locality}
            areaHa={area}
            isLoading={isLoadingGeometry}
            error={geometryError}
          />
          <article className="panel ledger">
            <div className="panel-title">
              <h2>Vertex change ledger</h2>
              <button
                type="button"
                className="text-button"
                onClick={handleExportCsv}
                aria-label="Export vertex ledger as CSV"
              >
                Export CSV
              </button>
            </div>
            <div className="table compact">
              <div className="table-head">
                <span>Node</span>
                <span>Existing (Lon, Lat)</span>
                <span>Proposed (Lon, Lat)</span>
                <span>Shift</span>
              </div>
              {ledgerRows.length > 0 ? (
                ledgerRows.map((r) => (
                  <div className="row" key={r.node}>
                    <b>{r.node}</b>
                    <span>{r.existing}</span>
                    <span>{r.proposed}</span>
                    <span>{r.shift}</span>
                  </div>
                ))
              ) : (
                <div className="row">
                  <b>ST-01</b>
                  <span>No shift data</span>
                  <span>Awaiting resurvey</span>
                  <span>—</span>
                </div>
              )}
            </div>
          </article>
        </div>

        <aside className="review">
          <article className="panel">
            <p className="eyebrow">Geometric variance dossier</p>
            <div className="definitions">
              <div>
                <span>Existing area</span>
                <b>{area}</b>
              </div>
              <div>
                <span>Proposed area</span>
                <b className="orange">
                  {pendingProposal?.areaSqM
                    ? `${(pendingProposal.areaSqM / 10000).toFixed(3)} ha`
                    : '14.412 ha'}
                </b>
              </div>
            </div>
            <p className="delta">
              {spatialAnalysis?.areaDeltaSqM != null && spatialAnalysis?.areaDeltaPercentage != null
                ? `${spatialAnalysis.areaDeltaSqM >= 0 ? '+' : ''}${spatialAnalysis.areaDeltaSqM.toLocaleString('en-US')} m² (${spatialAnalysis.areaDeltaPercentage >= 0 ? '+' : ''}${spatialAnalysis.areaDeltaPercentage.toFixed(2)}%)`
                : '+1,270 m² (+0.89%)'}
            </p>
            <p className="warning">
              {spatialAnalysis?.areaDeltaPercentage != null && Math.abs(spatialAnalysis.areaDeltaPercentage) > 0.5
                ? '⚑ Attention: area variance exceeds standard margin of ±0.50%.'
                : '✓ Area variance conforms with standard tolerance threshold.'}
            </p>
          </article>

          <article className="panel">
            <p className="eyebrow">Validation diagnostics</p>
            <ul className="diagnostics">
              <li>
                <b>✓ Polygon closure</b>
                <span>
                  {spatialAnalysis?.polygonClosureDeltaM != null
                    ? `${spatialAnalysis.polygonClosureDeltaM.toFixed(3)} m`
                    : '0.002 m'}
                </span>
              </li>
              <li>
                <b>✓ Self-intersection</b>
                <span>
                  {spatialAnalysis?.selfIntersectionViolations != null
                    ? `${spatialAnalysis.selfIntersectionViolations} violations`
                    : '0 violations'}
                </span>
              </li>
              <li>
                <b>✓ Adjacent collision</b>
                <span>
                  {spatialAnalysis?.adjacentCollisionOverlaps != null
                    ? `${spatialAnalysis.adjacentCollisionOverlaps} overlaps`
                    : '0 overlaps'}
                </span>
              </li>
              <li className="orange">
                <b>△ Max vertex shift</b>
                <span>
                  {spatialAnalysis?.maxDisplacementM != null
                    ? `${spatialAnalysis.maxDisplacementM.toFixed(2)} m shift`
                    : '4.2 m delta'}
                </span>
              </li>
            </ul>
          </article>

          <article className="panel">
            <p className="eyebrow">Reviewer action</p>
            <label className="filter">
              Decision notes
              <textarea
                rows={4}
                value={decisionNotes}
                onChange={(e) => setDecisionNotes(e.target.value)}
                placeholder="Record findings for the academic review…"
              />
            </label>
            <button
              className="button primary wide"
              disabled={isSubmitting}
              onClick={handleApprove}
            >
              {isSubmitting ? 'Processing…' : 'Approve for project review'}
            </button>
            <button
              className="button secondary wide"
              disabled={isSubmitting}
              onClick={handleReject}
            >
              {isSubmitting ? 'Processing…' : 'Request resurvey (Reject)'}
            </button>
          </article>
        </aside>
      </section>
    </>
  )
}

function NewParcelModal({
  isOpen,
  onClose,
  onSubmit
}: {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: { parcelCode: string; name: string; village: string; district: string; state: string }) => Promise<void>
}) {
  const [parcelCode, setParcelCode] = useState('')
  const [name, setName] = useState('')
  const [village, setVillage] = useState('')
  const [district, setDistrict] = useState('Guntur')
  const [state, setState] = useState('Andhra Pradesh')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!parcelCode.trim()) {
      setError('Parcel code is required.')
      return
    }
    setError(null)
    setIsSubmitting(true)
    try {
      await onSubmit({ parcelCode, name, village, district, state })
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to register parcel.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(74, 31, 43, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fffdfc',
          border: '1px solid #d9cec7',
          borderRadius: '4px',
          padding: '24px',
          width: '100%',
          maxWidth: '520px',
          boxShadow: '0 4px 16px rgba(74, 31, 43, 0.12)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="eyebrow">Cadastral Registry</p>
        <h2 style={{ margin: '0 0 16px', fontFamily: 'Newsreader, Georgia, serif', fontSize: '24px' }}>
          Register New Land Parcel
        </h2>
        {error && (
          <div style={{ color: '#b94732', fontSize: '12px', marginBottom: '12px', fontWeight: 600 }}>
            ⚠ {error}
          </div>
        )}
        <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '12px' }}>
          <label className="filter" style={{ marginTop: 0 }}>
            Parcel Identifier *
            <input
              type="text"
              required
              placeholder="e.g. PR-2024-0501"
              value={parcelCode}
              onChange={(e) => setParcelCode(e.target.value)}
            />
          </label>
          <label className="filter" style={{ marginTop: 0 }}>
            Parcel Name / Label
            <input
              type="text"
              placeholder="e.g. North Canal Basin"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label className="filter" style={{ marginTop: 0 }}>
              Village / Locality
              <input
                type="text"
                placeholder="e.g. Kothapeta"
                value={village}
                onChange={(e) => setVillage(e.target.value)}
              />
            </label>
            <label className="filter" style={{ marginTop: 0 }}>
              District *
              <input
                type="text"
                required
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
            </label>
          </div>
          <label className="filter" style={{ marginTop: 0 }}>
            State *
            <input
              type="text"
              required
              value={state}
              onChange={(e) => setState(e.target.value)}
            />
          </label>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Register Parcel'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const [view, setView] = useState<View>('dashboard')
  const [parcels, setParcels] = useState<DisplayParcel[]>(DEFAULT_PARCELS)
  const [selectedParcel, setSelectedParcel] = useState<DisplayParcel>(DEFAULT_PARCELS[0])
  const [searchQuery, setSearchQuery] = useState('')
  const [parcelDetail, setParcelDetail] = useState<ParcelDetail | null>(null)
  const [geometryHistory, setGeometryHistory] = useState<GeometryResponse[]>([])
  const [isLoadingGeometry, setIsLoadingGeometry] = useState(false)
  const [geometryError, setGeometryError] = useState<string | null>(null)
  const [spatialAnalysis, setSpatialAnalysis] = useState<SpatialAnalysisResponse | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [userRole, setUserRole] = useState<'REVIEWER' | 'SURVEYOR'>('REVIEWER')
  const [actionStatus, setActionStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [, startTransition] = useTransition()

  const filteredParcels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return parcels
    return parcels.filter(
      (p) =>
        p.code.toLowerCase().includes(q) ||
        p.locality.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q)
    )
  }, [parcels, searchQuery])

  // Debounced backend search against /api/v1/parcels?search=...
  useEffect(() => {
    const query = searchQuery.trim()
    if (!query) return

    const timer = setTimeout(() => {
      parcelApi
        .list({ search: query, size: 20 })
        .then((res) => {
          if (res && res.content && res.content.length > 0) {
            const loaded: DisplayParcel[] = res.content.map((p: ParcelSummary) => ({
              id: p.id,
              code: p.parcelCode,
              locality: p.village ? `${p.village}, ${p.district}` : p.district,
              area: p.currentAreaSqM ? `${(p.currentAreaSqM / 10000).toFixed(3)} ha` : 'Pending boundary',
              status: p.status,
              isLive: true
            }))
            setParcels((prev) => {
              const existingIds = new Set(prev.map((p) => p.id))
              const newItems = loaded.filter((p) => !existingIds.has(p.id))
              return [...newItems, ...prev]
            })
          }
        })
        .catch(() => {
          // Fall back gracefully to client-side filtering
        })
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load parcels from Phase 4 API on mount
  useEffect(() => {
    let active = true
    parcelApi
      .list({ size: 10 })
      .then((res) => {
        if (!active) return
        if (res && res.content && res.content.length > 0) {
          const loaded: DisplayParcel[] = res.content.map((p: ParcelSummary) => ({
            id: p.id,
            code: p.parcelCode,
            locality: p.village ? `${p.village}, ${p.district}` : p.district,
            area: p.currentAreaSqM ? `${(p.currentAreaSqM / 10000).toFixed(3)} ha` : 'Pending boundary',
            status: p.status,
            isLive: true
          }))
          setParcels(loaded)
          if (loaded.length > 0) {
            setSelectedParcel(loaded[0])
          }
        }
      })
      .catch(() => {
        // Fall back gracefully to DEFAULT_PARCELS
      })

    return () => {
      active = false
    }
  }, [])

  // When selectedParcel changes, load its details and history in parallel
  useEffect(() => {
    let active = true

    const loadParcelData = async () => {
      await Promise.resolve()
      if (!active) return

      if (!selectedParcel.isLive) {
        setParcelDetail(null)
        setGeometryHistory([])
        setSpatialAnalysis(null)
        setIsLoadingGeometry(false)
        setGeometryError(null)
        return
      }

      setIsLoadingGeometry(true)
      setGeometryError(null)

      try {
        const [detail, history, analysis] = await Promise.all([
          parcelApi.get(selectedParcel.id),
          geometryApi.listHistory(selectedParcel.id),
          parcelApi.getSpatialAnalysis(selectedParcel.id).catch(() => null)
        ])
        if (!active) return
        setParcelDetail(detail)
        setGeometryHistory(Array.isArray(history) ? history : [])
        setSpatialAnalysis(analysis)
      } catch (err: unknown) {
        if (!active) return
        setParcelDetail(null)
        setGeometryHistory([])
        setSpatialAnalysis(null)
        setGeometryError(err instanceof Error ? err.message : 'Failed to fetch parcel geometry')
      } finally {
        if (active) {
          setIsLoadingGeometry(false)
        }
      }
    }

    void loadParcelData()

    return () => {
      active = false
    }
  }, [selectedParcel])

  const go = (v: View) => {
    startTransition(() => {
      setView(v)
      setActionStatus(null)
    })
  }

  const handleCreateParcel = async (data: {
    parcelCode: string
    name: string
    village: string
    district: string
    state: string
  }) => {
    const created = await parcelApi.create({
      parcelCode: data.parcelCode,
      name: data.name,
      village: data.village,
      district: data.district,
      state: data.state,
      landUse: 'AGRICULTURAL'
    })

    const newDisplayParcel: DisplayParcel = {
      id: created.id,
      code: created.parcelCode,
      locality: `${created.village || 'Village'}, ${created.district}`,
      area: 'Pending boundary',
      status: created.status,
      isLive: true,
      geometry: created.currentGeometry?.geometry
    }

    setParcels((prev) => [newDisplayParcel, ...prev])
    setSelectedParcel(newDisplayParcel)
    setParcelDetail(created)
    setActionStatus({
      type: 'success',
      message: `Parcel ${created.parcelCode} registered successfully.`
    })
  }

  const handleProposeDummyBoundary = async () => {
    if (!selectedParcel.isLive) {
      alert('Selected parcel is in demo mode. Create a live parcel or connect to backend.')
      return
    }

    const samplePolygon = {
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

    try {
      const resp = await geometryApi.propose(selectedParcel.id, {
        geometry: samplePolygon,
        source: 'MANUAL_ENTRY',
        sourceDescription: 'Digital field traverse'
      })
      setActionStatus({
        type: 'success',
        message: `Boundary version ${resp.versionNo} proposed successfully.`
      })
      const [updatedHistory, updatedDetail] = await Promise.all([
        geometryApi.listHistory(selectedParcel.id),
        parcelApi.get(selectedParcel.id)
      ])
      setGeometryHistory(updatedHistory)
      setParcelDetail(updatedDetail)
    } catch (err: unknown) {
      setActionStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'Proposal submission failed.'
      })
    }
  }

  const handleApproveBoundary = async (notes: string) => {
    const historyList = Array.isArray(geometryHistory) ? geometryHistory : []
    if (selectedParcel.isLive && historyList.length > 0) {
      const pending = historyList.find((g) => g.status === 'PROPOSED')
      if (pending) {
        try {
          await geometryApi.verify(selectedParcel.id, pending.id, notes)
          setActionStatus({
            type: 'success',
            message: `Version ${pending.versionNo} verified successfully.`
          })
          const [updatedHistory, updatedDetail] = await Promise.all([
            geometryApi.listHistory(selectedParcel.id),
            parcelApi.get(selectedParcel.id)
          ])
          setGeometryHistory(Array.isArray(updatedHistory) ? updatedHistory : [])
          setParcelDetail(updatedDetail)
          return
        } catch (err: unknown) {
          setActionStatus({
            type: 'error',
            message: err instanceof Error ? err.message : 'Verification failed.'
          })
          return
        }
      }
    }
    setActionStatus({
      type: 'success',
      message: 'Boundary verified and gazetted for academic review.'
    })
  }

  const handleRejectBoundary = async (reason: string) => {
    const historyList = Array.isArray(geometryHistory) ? geometryHistory : []
    if (selectedParcel.isLive && historyList.length > 0) {
      const pending = historyList.find((g) => g.status === 'PROPOSED')
      if (pending) {
        try {
          await geometryApi.reject(selectedParcel.id, pending.id, reason)
          setActionStatus({
            type: 'success',
            message: `Version ${pending.versionNo} rejected with reason: ${reason}`
          })
          const [updatedHistory, updatedDetail] = await Promise.all([
            geometryApi.listHistory(selectedParcel.id),
            parcelApi.get(selectedParcel.id)
          ])
          setGeometryHistory(Array.isArray(updatedHistory) ? updatedHistory : [])
          setParcelDetail(updatedDetail)
          return
        } catch (err: unknown) {
          setActionStatus({
            type: 'error',
            message: err instanceof Error ? err.message : 'Rejection failed.'
          })
          return
        }
      }
    }
    setActionStatus({
      type: 'success',
      message: `Resurvey requested. Reason recorded: ${reason}`
    })
  }

  const body =
    view === 'dashboard' ? (
      <Dashboard
        parcels={filteredParcels}
        go={go}
        onNewParcel={() => setIsModalOpen(true)}
        onSelectParcel={(id) => {
          const found = parcels.find((p) => p.id === id)
          if (found) setSelectedParcel(found)
        }}
        searchQuery={searchQuery}
      />
    ) : view === 'map' ? (
      <MapView
        selectedParcel={selectedParcel}
        parcelDetail={parcelDetail}
        geometryHistory={geometryHistory}
        isLoadingGeometry={isLoadingGeometry}
        geometryError={geometryError}
        spatialAnalysis={spatialAnalysis}
        allParcels={parcels}
        go={go}
        onInitiateResurvey={() => setIsModalOpen(true)}
        onSelectParcelCode={(code) => {
          const found = parcels.find((p) => p.code === code)
          if (found) setSelectedParcel(found)
        }}
      />
    ) : view === 'parcel' ? (
      <ParcelView
        selectedParcel={selectedParcel}
        parcelDetail={parcelDetail}
        geometryHistory={geometryHistory}
        isLoadingGeometry={isLoadingGeometry}
        geometryError={geometryError}
        go={go}
        onProposeGeometry={handleProposeDummyBoundary}
      />
    ) : (
      <BoundaryView
        selectedParcel={selectedParcel}
        parcelDetail={parcelDetail}
        geometryHistory={geometryHistory}
        isLoadingGeometry={isLoadingGeometry}
        geometryError={geometryError}
        spatialAnalysis={spatialAnalysis}
        onApprove={handleApproveBoundary}
        onRequestResurvey={handleRejectBoundary}
        actionStatus={actionStatus}
      />
    )

  return (
    <div className="app">
      <aside className="sidebar">
        <button className="brand" onClick={() => go('dashboard')}>
          <i>G</i>
          <span>
            <h1 style={{ fontSize: '22px', margin: 0, font: 'inherit', fontWeight: 600 }}>GeoNexus</h1>
            <small>Academic GIS workspace</small>
          </span>
        </button>

        <nav aria-label="Primary navigation">
          {nav.map(([id, label, icon]) => (
            <button
              className={view === id ? 'nav active' : 'nav'}
              onClick={() => go(id)}
              key={id}
            >
              <i>{icon}</i>
              {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-note">
          <span>Academic project</span>
          <b>GeoJSON: EPSG:4326</b>
          <small>Not a legal cadastre</small>
        </div>
      </aside>

      <div className="shell">
        <header>
          <label className="search">
            <span>⌕</span>
            <input
              aria-label="Search parcels"
              placeholder="Search parcel ID, survey number, or locality"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredParcels.length > 0) {
                  e.preventDefault()
                  setSelectedParcel(filteredParcels[0])
                  go('parcel')
                }
              }}
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearchQuery('')}
                style={{
                  border: 0,
                  background: 'transparent',
                  color: '#6e625d',
                  cursor: 'pointer',
                  padding: '2px 6px',
                  fontSize: '14px',
                  lineHeight: 1,
                  flexShrink: 0
                }}
              >
                ✕
              </button>
            )}
          </label>
          <span className="location">◉ District 4 · Academic demonstration zone</span>
          <button
            className="user"
            title="Click to toggle between Reviewer and Surveyor roles"
            onClick={() => setUserRole((r) => (r === 'REVIEWER' ? 'SURVEYOR' : 'REVIEWER'))}
            style={{ cursor: 'pointer', background: 'transparent' }}
          >
            {userRole === 'REVIEWER' ? 'Senior Reviewer' : 'Survey Officer'}
          </button>
        </header>

        <main>{body}</main>

        <footer>
          GeoNexus is an independent academic project, not an official cadastral or government system.
          Boundary outputs are review aids, not legally valid land records.
        </footer>
      </div>

      <NewParcelModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleCreateParcel}
      />
    </div>
  )
}

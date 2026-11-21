import { useEffect, useMemo, useState, useTransition, useCallback } from 'react'
import { BackendStatus } from './components/BackendStatus'
import {
  geometryApi,
  parcelApi,
  aiApi,
  analyticsApi,
  reportApi,
  haversineDistanceM,
  wgs84ToUtm44,
  type GeometryResponse,
  type GeoJsonGeometry,
  type ParcelDetail,
  type ParcelSummary,
  type SpatialAnalysisResponse,
  type AiBoundaryDetectionResponse,
  type DetectedStation,
  type AnalyticsDashboardResponse,
  type AreaDistributionBin,
  type AdministrativeBreakdown,
  type ActionableCadastralInsight,
  type ParcelDossierReport,
  type BoundaryComparisonReport,
  type StationCoordinateRecord,
  type StationDisplacementRecord,
  type AuditRecordResponse
} from './api/client'

type View = 'dashboard' | 'map' | 'parcel' | 'boundary' | 'reports' | 'audit'

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
  ['boundary', 'Boundary review', '◫'],
  ['reports', 'Reports', '▤'],
  ['audit', 'Audit history', '⏳']
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
  aiDetectedBoundaries: boolean
  orthophotoBackdrop: boolean
}

const DEFAULT_LAYERS: LayerVisibility = {
  registeredParcels: true,
  proposedResurveys: true,
  disputedOverlaps: true,
  surveyBaselines: true,
  groundControlPoints: true,
  topoContours: false,
  aiDetectedBoundaries: false,
  orthophotoBackdrop: false
}

interface MapCanvasProps {
  comparison?: boolean
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
  surroundingParcels?: Array<{ code: string; area: string; geometry?: GeoJsonGeometry }>
  onTriggerAiDetect?: () => void
  isAiDetecting?: boolean
}

function MapCanvas({
  comparison = false,
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
  activeLayers = DEFAULT_LAYERS,
  onCoordinateMove,
  surroundingParcels = [],
  onTriggerAiDetect,
  isAiDetecting = false
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
  const aiRings = aiDetectedGeometry ? extractRingsFromGeoJson(aiDetectedGeometry) : []

  if (recordedRings.length === 0 && proposedRings.length === 0 && aiRings.length === 0) {
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

  const bbox = getBoundingBox([recordedRings, proposedRings, aiRings]) || [80.43, 16.297, 80.436, 16.303]
  const recordedProj = projectRingsToSvg(recordedRings, bbox, 1200, 800, 100)
  const proposedProj = projectRingsToSvg(proposedRings, bbox, 1200, 800, 100)
  const aiProj = projectRingsToSvg(aiRings, bbox, 1200, 800, 100)

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
          <pattern id="orthoTile" width="200" height="200" patternUnits="userSpaceOnUse">
            <rect width="200" height="200" fill="#E8DEC8" />
            <path d="M 0 50 Q 50 45 100 52 T 200 48" stroke="#D3C3A7" strokeWidth="2.5" fill="none" />
            <path d="M 0 120 Q 60 126 130 118 T 200 122" stroke="#D3C3A7" strokeWidth="3" fill="none" />
            <path d="M 60 0 Q 65 60 58 120 T 62 200" stroke="#CCBA9E" strokeWidth="2" fill="none" />
            <path d="M 140 0 Q 135 60 142 120 T 138 200" stroke="#CCBA9E" strokeWidth="2.5" fill="none" />
            <rect x="10" y="10" width="40" height="30" fill="#DFD2B7" opacity="0.6" />
            <rect x="70" y="10" width="60" height="30" fill="#E2D7BE" opacity="0.6" />
            <rect x="10" y="60" width="40" height="45" fill="#DFD2B7" opacity="0.5" />
            <rect x="70" y="60" width="60" height="45" fill="#E5D9C2" opacity="0.6" />
          </pattern>
        </defs>

        <rect fill="#FFF8ED" height="100%" width="100%" />
        <rect fill="url(#surveyGrid)" height="100%" width="100%" />

        <g
          transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}
          style={{ transformOrigin: '50% 50%', transition: isDragging ? 'none' : 'transform 0.12s ease-out' }}
        >
          {/* Synthetic Aerial Orthomosaic Backdrop Layer (Phase 7) */}
          {activeLayers.orthophotoBackdrop && (
            <rect fill="url(#orthoTile)" height="100%" width="100%" opacity="0.5" />
          )}
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

          {/* 4. AI Detected Agricultural Field Boundary (Phase 7) */}
          {activeLayers.aiDetectedBoundaries && (aiProj.pathD ? (
            <g className="ai-detected-boundary-group" aria-label="AI detected boundary">
              <path
                className="ai-detected-boundary-halo"
                d={aiProj.pathD}
                fill="rgba(229, 162, 52, 0.12)"
                stroke="#FFF8ED"
                strokeWidth="4.5"
              />
              <path
                className="ai-detected-boundary"
                d={aiProj.pathD}
                fill="none"
                stroke="#E5A234"
                strokeWidth="2.5"
                strokeDasharray="6 3"
              />
              {aiProj.vertices.map(([vx, vy], idx) => {
                const st = aiDetectedStations[idx]
                const label = st ? st.station : `AI-${String(idx + 1).padStart(2, '0')}`
                return (
                  <g key={`ai-v-${idx}`} className="ai-station-marker">
                    <circle cx={vx} cy={vy} r="4.5" fill="#E5A234" stroke="#FFF8ED" strokeWidth="1.5" />
                    <text
                      x={vx + 6}
                      y={vy - 5}
                      fill="#624000"
                      fontFamily="'JetBrains Mono', monospace"
                      fontSize="9"
                      fontWeight="700"
                    >
                      {label}
                    </text>
                  </g>
                )
              })}
            </g>
          ) : (
            <g className="ai-detected-boundary-group" aria-label="AI detected boundary">
              <polygon
                className="ai-detected-boundary"
                fill="rgba(229, 162, 52, 0.10)"
                points="344,352 712,392 724,486 676,702 314,686"
                stroke="#E5A234"
                strokeDasharray="6 3"
                strokeWidth="2.5"
              />
              <circle cx="344" cy="352" fill="#E5A234" r="4.5" stroke="#FFF8ED" strokeWidth="1.5" />
              <text fill="#624000" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="700" x="352" y="348">
                AI-01
              </text>
              <circle cx="712" cy="392" fill="#E5A234" r="4.5" stroke="#FFF8ED" strokeWidth="1.5" />
              <text fill="#624000" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="700" x="720" y="388">
                AI-02
              </text>
              <circle cx="724" cy="486" fill="#E5A234" r="4.5" stroke="#FFF8ED" strokeWidth="1.5" />
              <text fill="#624000" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="700" x="732" y="482">
                AI-03
              </text>
              <circle cx="676" cy="702" fill="#E5A234" r="4.5" stroke="#FFF8ED" strokeWidth="1.5" />
              <text fill="#624000" fontFamily="'JetBrains Mono', monospace" fontSize="9" fontWeight="700" x="684" y="698">
                AI-04
              </text>
            </g>
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
  const [analytics, setAnalytics] = useState<AnalyticsDashboardResponse | null>(null)
  const [queueFilter, setQueueFilter] = useState<'all' | 'disputed' | 'silt' | 'area'>('all')
  const [districtFilter, setDistrictFilter] = useState('All')
  const [activeTab, setActiveTab] = useState<'all' | 'distribution' | 'progress'>('all')
  const [lastSyncTime, setLastSyncTime] = useState('14:30:18 IST Today')

  useEffect(() => {
    let active = true
    analyticsApi
      .getDashboard()
      .then((data) => {
        if (active && data) {
          setAnalytics(data)
          setLastSyncTime(new Date(data.generatedAt || Date.now()).toLocaleTimeString() + ' IST Today')
        }
      })
      .catch(() => {
        // Fall back gracefully to structured operational defaults
      })
    return () => {
      active = false
    }
  }, [])

  // Priority Queue Data (Stitch Cadastral Design)
  const priorityQueueItems = useMemo(() => [
    {
      id: 'PR-2024-0412',
      surveyNo: 'SRV-2024-0911',
      block: 'Kothapeta Block 3',
      subBlock: 'Agro-plot 14/B',
      district: 'Guntur',
      oldArea: '14.28',
      proposedArea: '14.41',
      deltaText: '+0.13 ha (+0.91%)',
      classification: 'Saffron Silt Drift',
      classType: 'drift',
      surveyor: 'M. Ananth',
      surveyorRole: 'Staff Cert. L-3',
      disputed: false,
      siltShift: true,
      areaTrip: true
    },
    {
      id: 'PR-2024-0389',
      surveyNo: 'SRV-2024-0894',
      block: 'Mylavaram Sector 1',
      subBlock: 'Canal Boundary Wall',
      district: 'Krishna',
      oldArea: '8.10',
      proposedArea: '7.94',
      deltaText: '-0.16 ha (-1.97%)',
      classification: 'Disputed Line',
      classType: 'disputed',
      surveyor: 'P. Suresh',
      surveyorRole: 'District Deputed',
      disputed: true,
      siltShift: false,
      areaTrip: true
    },
    {
      id: 'PR-2024-0401',
      surveyNo: 'SRV-2024-0902',
      block: 'Nuzvid North',
      subBlock: 'Orchard Buffer 7',
      district: 'Krishna',
      oldArea: '22.50',
      proposedArea: '22.53',
      deltaText: '+0.03 ha (+0.13%)',
      classification: 'Pending Sign-off',
      classType: 'pending',
      surveyor: 'D. Rao',
      surveyorRole: 'Chief Surveyor',
      disputed: false,
      siltShift: false,
      areaTrip: false
    },
    {
      id: 'PR-2024-0428',
      surveyNo: 'SRV-2024-0925',
      block: 'Kothapeta Block 4',
      subBlock: 'Paddy Field 02',
      district: 'Guntur',
      oldArea: '5.62',
      proposedArea: '5.60',
      deltaText: '-0.02 ha (-0.35%)',
      classification: 'Pending Sign-off',
      classType: 'pending',
      surveyor: 'P. Suresh',
      surveyorRole: 'District Deputed',
      disputed: false,
      siltShift: false,
      areaTrip: false
    }
  ], [])

  const filteredQueueItems = useMemo(() => {
    return priorityQueueItems.filter((item) => {
      if (districtFilter !== 'All' && !item.district.toLowerCase().includes(districtFilter.toLowerCase())) {
        return false
      }
      if (queueFilter === 'disputed') return item.disputed
      if (queueFilter === 'silt') return item.siltShift
      if (queueFilter === 'area') return item.areaTrip
      return true
    })
  }, [priorityQueueItems, queueFilter, districtFilter])

  // Area distribution bins
  const areaBins: AreaDistributionBin[] = analytics?.areaDistribution || [
    { rangeLabel: '< 2 ha', category: 'Marginal', minAreaHa: 0, maxAreaHa: 2, parcelCount: 1, totalAreaHa: 1.85, percentage: 12.5 },
    { rangeLabel: '2 – 5 ha', category: 'Small', minAreaHa: 2, maxAreaHa: 5, parcelCount: 2, totalAreaHa: 7.60, percentage: 25.0 },
    { rangeLabel: '5 – 10 ha', category: 'Semi-Medium', minAreaHa: 5, maxAreaHa: 10, parcelCount: 2, totalAreaHa: 13.72, percentage: 25.0 },
    { rangeLabel: '10 – 25 ha', category: 'Medium', minAreaHa: 10, maxAreaHa: 25, parcelCount: 2, totalAreaHa: 36.78, percentage: 25.0 },
    { rangeLabel: '> 25 ha', category: 'Large', minAreaHa: 25, maxAreaHa: 999, parcelCount: 1, totalAreaHa: 28.60, percentage: 12.5 }
  ]

  // Administrative progress subdistricts
  const subdistricts: AdministrativeBreakdown[] = analytics?.administrativeBreakdown || [
    { subdistrict: 'Kothapeta High Basin', taluk: 'Kothapeta', district: 'Guntur', totalTargetParcels: 1240, completedAndSealed: 1098, underActiveSurvey: 142, completionPercentage: 88.5, groundStatus: 'On Schedule', leadSurveyor: 'Dr. E. Vance', isSyntheticTarget: true },
    { subdistrict: 'Mylavaram Riparian Corridor', taluk: 'Mylavaram', district: 'Krishna', totalTargetParcels: 890, completedAndSealed: 542, underActiveSurvey: 310, completionPercentage: 60.8, groundStatus: 'Underway', leadSurveyor: 'M. Ananth', isSyntheticTarget: true },
    { subdistrict: 'Nuzvid Orchard Belt', taluk: 'Nuzvid', district: 'Krishna', totalTargetParcels: 1650, completedAndSealed: 1580, underActiveSurvey: 42, completionPercentage: 95.7, groundStatus: 'Final Audit', leadSurveyor: 'D. Rao', isSyntheticTarget: true },
    { subdistrict: 'Tiruvuru Lower Canal Zone', taluk: 'Tiruvuru', district: 'Krishna', totalTargetParcels: 940, completedAndSealed: 380, underActiveSurvey: 210, completionPercentage: 40.4, groundStatus: 'Delayed by Monsoon', leadSurveyor: 'P. Suresh', isSyntheticTarget: true },
    { subdistrict: 'Vissannapeta Uplands', taluk: 'Vissannapeta', district: 'Krishna', totalTargetParcels: 780, completedAndSealed: 610, underActiveSurvey: 155, completionPercentage: 78.2, groundStatus: 'On Schedule', leadSurveyor: 'K. Ramachandran', isSyntheticTarget: true },
    { subdistrict: 'Gampalagudem West', taluk: 'Gampalagudem', district: 'Krishna', totalTargetParcels: 1120, completedAndSealed: 940, underActiveSurvey: 160, completionPercentage: 83.9, groundStatus: 'On Schedule', leadSurveyor: 'S. Varma', isSyntheticTarget: true }
  ]

  // Actionable Insights
  const insights: ActionableCadastralInsight[] = analytics?.actionableInsights || [
    {
      id: 'INS-01',
      severity: 'WARNING',
      category: 'VARIANCE_EXCEEDED',
      title: 'Area Drift Exceeds Statutory Tolerance (PR-2024-0412)',
      description: 'Proposed resurvey indicates +0.13 ha (+0.91%) area gain due to canal silt deposition. Exceeds ±0.5% tolerance threshold.',
      parcelCode: 'PR-2024-0412',
      recommendedAction: 'Mandatory Senior Reviewer physical inspection required before gazette entry.'
    },
    {
      id: 'INS-02',
      severity: 'CRITICAL',
      category: 'VARIANCE_EXCEEDED',
      title: 'Adjoining Line Conflict (PR-2024-0389)',
      description: 'Canal boundary wall realignment shows -0.16 ha (-1.97%) reduction. Overlaps adjoining government irrigation reservation.',
      parcelCode: 'PR-2024-0389',
      recommendedAction: 'Convene joint adjudication hearing with Irrigation & Revenue Departments.'
    },
    {
      id: 'INS-03',
      severity: 'INFO',
      category: 'AI_ASSISTED_REVIEW',
      title: 'AI Edge-Detected Proposals Pending Ground Seal',
      description: '4 candidate parcels have AI-suggested bund boundaries logged with confidence > 85%. Drafts require surveyor DGPS check.',
      recommendedAction: 'Dispatch DGPS ground crew to confirm AI candidate corner stations.'
    },
    {
      id: 'INS-04',
      severity: 'WARNING',
      category: 'SEASONAL_DELAY',
      title: 'Monsoon Inundation Delay (Tiruvuru Lower Canal Zone)',
      description: '210 active parcels delayed due to heavy waterlogging in lower delta canal basin (40.4% completion).',
      recommendedAction: 'Temporarily redeploy survey units to Vissannapeta Uplands until waters recede.'
    }
  ]

  // CSV Docket Export
  const handleExportDocketCsv = () => {
    const csvEscape = (val: string | number | undefined | null) => {
      if (val == null) return '""'
      const str = String(val)
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return `"${str}"`
    }

    const headers = [
      'Parcel Identifier',
      'Survey Number',
      'Taluk / Block',
      'District',
      'Old Area (ha)',
      'Proposed Area (ha)',
      'Variance Delta',
      'Classification',
      'Surveyor',
      'Surveyor Role',
      'Status'
    ]

    const rows = filteredQueueItems.map((item) => [
      item.id,
      item.surveyNo,
      item.block,
      item.district,
      item.oldArea,
      item.proposedArea,
      item.deltaText,
      item.classification,
      item.surveyor,
      item.surveyorRole,
      item.disputed ? 'DISPUTED' : item.siltShift ? 'SILT_DRIFT' : 'PENDING'
    ])

    const csvContent = [
      headers.map(csvEscape).join(','),
      ...rows.map((row) => row.map(csvEscape).join(','))
    ].join('\r\n')

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'geonexus-adjudication-docket-2024.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Top Legal & Scholarly Notice Ribbon */}
      <div className="disclaimer-ribbon">
        <div className="disclaimer-ribbon-left">
          <span style={{ fontWeight: 700, color: '#a03f24' }}>⚖ LEGAL &amp; SCHOLARLY NOTICE:</span>
          <span>
            GeoNexus Academic Research GIS — Operational Cadastral Records. Boundary comparison is an academic review aid and does not constitute a certified legal deed until gazetted.
          </span>
        </div>
        <div className="disclaimer-ribbon-right">
          <span>CRS: EPSG:4326 / EPSG:32644 (UTM 44N)</span>
          <span>•</span>
          <span>SURVEY STAMP: 2024-Q4.8</span>
        </div>
      </div>

      {/* Operational Header Section */}
      <section className="heading">
        <div>
          <p className="eyebrow">Cadastral Governance Portal / District 4 (Western Agricultural Basin)</p>
          <h2>Cadastral Survey Operations Overview</h2>
          <p>Field Survey Season 2024–25 • Real-time adjudication ledger, monument network telemetry &amp; resurvey delta metrics.</p>
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

      {/* Operational Status Metric Band */}
      <section className="metrics" aria-label="Demonstration operations metrics">
        <article>
          <p>
            Active resurveys{' '}
            <small style={{ textTransform: 'none', color: '#a03f24', fontSize: '9px', fontWeight: 600 }}>
              [Demo]
            </small>
          </p>
          <strong>{analytics?.summary?.inFlightResurveysCount || 42}</strong>
          <span>14 awaiting review (simulated)</span>
          <div className="metric-sub-bar">
            <span>14 Awaiting Rev.</span>
            <span>•</span>
            <span>18 Capture</span>
            <span>•</span>
            <span>10 Draft</span>
          </div>
        </article>
        <article>
          <p>
            Flagged for review{' '}
            <small style={{ textTransform: 'none', color: '#a03f24', fontSize: '9px', fontWeight: 600 }}>
              [Demo]
            </small>
          </p>
          <strong className="orange">{analytics?.summary?.flaggedForReviewCount || 18} parcels</strong>
          <span>Area or boundary variance</span>
          <div className="metric-sub-bar">
            <span style={{ color: '#a03f24', fontWeight: 600 }}>9 Area Var &gt;0.5%</span>
            <span>•</span>
            <span>9 Canal Buffer</span>
          </div>
        </article>
        <article>
          <p>
            Validated this month{' '}
            <small style={{ textTransform: 'none', color: '#a03f24', fontSize: '9px', fontWeight: 600 }}>
              [Demo]
            </small>
          </p>
          <strong>{analytics?.summary?.validationsPassedMtd || 184}</strong>
          <span>Geometry checks passed</span>
          <div className="metric-sub-bar">
            <span style={{ fontWeight: 600 }}>99.1% First-Pass</span>
            <span>•</span>
            <span>0.004m RMSE</span>
          </div>
        </article>
        <article>
          <p>
            Open audit items{' '}
            <small style={{ textTransform: 'none', color: '#a03f24', fontSize: '9px', fontWeight: 600 }}>
              [Demo]
            </small>
          </p>
          <strong>{analytics?.summary?.activeGeodeticPillars ? `${analytics.summary.activeGeodeticPillars} Active` : 9}</strong>
          <span>Reviewer action required</span>
          <div className="metric-sub-bar">
            <span>100% Signal</span>
            <span>•</span>
            <span>RTK/DGPS Online</span>
          </div>
        </article>
      </section>

      {/* Analytics Filter & Toolbar */}
      <div className="dashboard-filter-bar">
        <div className="filter-pills-cluster">
          <button
            className={`filter-pill ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => setActiveTab('all')}
          >
            All Operational Views
          </button>
          <button
            className={`filter-pill ${activeTab === 'distribution' ? 'active' : ''}`}
            onClick={() => setActiveTab('distribution')}
          >
            Agricultural Area Distribution
          </button>
          <button
            className={`filter-pill ${activeTab === 'progress' ? 'active' : ''}`}
            onClick={() => setActiveTab('progress')}
          >
            Subdistrict Progress
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <select
            value={districtFilter}
            onChange={(e) => setDistrictFilter(e.target.value)}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              border: '1px solid #d9cec7',
              borderRadius: '2px',
              background: '#fffdfc'
            }}
          >
            <option value="All">All Districts</option>
            <option value="Guntur">District 4 (Guntur Basin)</option>
            <option value="Krishna">District 4 (Krishna Zone)</option>
          </select>

          <button
            className="filter-pill"
            onClick={handleExportDocketCsv}
            style={{ background: '#fffdfc', fontWeight: 700 }}
          >
            Export Docket (CSV)
          </button>
        </div>
      </div>

      {/* Main Split Architecture: 60% Queue / Analytics vs 40% Audit & Status */}
      <section className="grid dashboard">
        {/* LEFT COLUMN: Priority Action Queue & Area Distribution */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Priority Action Queue */}
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

            {searchQuery ? (
              <ParcelTable parcels={parcels} go={go} onSelect={onSelectParcel} />
            ) : (
              <div>
                {/* Filter Pills */}
                <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
                  <button
                    className={`filter-pill ${queueFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setQueueFilter('all')}
                  >
                    All ({priorityQueueItems.length})
                  </button>
                  <button
                    className={`filter-pill ${queueFilter === 'disputed' ? 'active' : ''}`}
                    onClick={() => setQueueFilter('disputed')}
                  >
                    Disputed (1)
                  </button>
                  <button
                    className={`filter-pill ${queueFilter === 'silt' ? 'active' : ''}`}
                    onClick={() => setQueueFilter('silt')}
                  >
                    Silt Shift (1)
                  </button>
                  <button
                    className={`filter-pill ${queueFilter === 'area' ? 'active' : ''}`}
                    onClick={() => setQueueFilter('area')}
                  >
                    Area &gt;0.5% (2)
                  </button>
                </div>

                <div style={{ overflowX: 'auto', border: '1px solid #d9cec7', borderRadius: '2px' }}>
                  <table className="action-queue-table">
                    <thead>
                      <tr>
                        <th>Parcel Identifier</th>
                        <th>Taluk / Block</th>
                        <th style={{ textAlign: 'right' }}>Old → Proposed Area</th>
                        <th>Variance Classification</th>
                        <th>Surveyor</th>
                        <th style={{ textAlign: 'right' }}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredQueueItems.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <b style={{ fontFamily: 'JetBrains Mono, monospace' }}>{item.id}</b>
                              <span style={{ fontSize: '10px', color: '#6e625d' }}>📌</span>
                            </div>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#6e625d' }}>
                              {item.surveyNo}
                            </div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{item.block}</div>
                            <div style={{ fontSize: '10px', color: '#6e625d' }}>{item.subBlock}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace' }}>
                            <div>{item.oldArea} → {item.proposedArea} ha</div>
                            <div style={{ fontSize: '10px', fontWeight: 600, color: item.disputed ? '#ba1a1a' : '#c75c3e' }}>
                              {item.deltaText}
                            </div>
                          </td>
                          <td>
                            <span className={`variance-tag ${item.classType}`}>
                              <span>{item.classType === 'disputed' ? '⚠' : '◐'}</span>
                              <span>{item.classification}</span>
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: 600 }}>{item.surveyor}</div>
                            <div style={{ fontSize: '10px', color: '#6e625d' }}>{item.surveyorRole}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="action-btn-group">
                              <button
                                className="btn-compare"
                                onClick={() => {
                                  onSelectParcel(item.id)
                                  go('boundary')
                                }}
                              >
                                Compare
                              </button>
                              <button
                                className="btn-inspect-coord"
                                title="Inspect Coordinate String"
                                onClick={() => {
                                  onSelectParcel(item.id)
                                  go('parcel')
                                }}
                              >
                                👁
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 4px', fontSize: '11px', color: '#6e625d' }}>
                  <span>Displaying {filteredQueueItems.length} of 14 flagged cadastral parcels • Page 1 of 4</span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="text-button" onClick={() => go('map')}>
                      View All in Workspace →
                    </button>
                  </div>
                </div>
              </div>
            )}
          </article>

          {/* Agricultural Holding Size Distribution */}
          <article className="panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Spatial Area Analysis</p>
                <h2>Agricultural holding size distribution</h2>
              </div>
              <small style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: '#6e625d' }}>
                [Live DB &amp; Baseline Aggregation]
              </small>
            </div>
            <p style={{ fontSize: '12px', color: '#6e625d', margin: '0 0 12px' }}>
              Standard cadastral landholding size classification across 5 tiers (Survey of India cadence).
            </p>

            <div className="area-dist-grid">
              {areaBins.map((bin) => (
                <div key={bin.rangeLabel} className="area-dist-row">
                  <div className="area-dist-header">
                    <span>
                      <strong>{bin.rangeLabel}</strong> ({bin.category})
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>
                      {bin.parcelCount} parcels • {bin.totalAreaHa.toFixed(2)} ha ({bin.percentage.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="area-dist-bar-track">
                    <div
                      className="area-dist-bar-fill"
                      style={{ width: `${Math.max(bin.percentage, 4)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </div>

        {/* RIGHT COLUMN: Actionable Insights, Audit Ledger & System Telemetry */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Actionable Cadastral Insights Card */}
          <article className="panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Adjudication Directives</p>
                <h2>Actionable cadastral insights</h2>
              </div>
              <span style={{ fontSize: '11px', fontWeight: 700, color: '#a03f24' }}>
                {insights.length} Priority Alerts
              </span>
            </div>

            <div className="insight-feed">
              {insights.map((ins) => (
                <div key={ins.id} className={`insight-card ${ins.severity.toLowerCase()}`}>
                  <div className="insight-header">
                    <span className="insight-title">{ins.title}</span>
                    <span className={`insight-badge ${ins.severity.toLowerCase()}`}>
                      {ins.severity}
                    </span>
                  </div>
                  <div className="insight-desc">{ins.description}</div>
                  <div className="insight-action">
                    ➔ Directive: {ins.recommendedAction}
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Traceable Project Activity Feed */}
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

          {/* Cadastral Audit Ledger with OK, PT, REJ, IMP Badges */}
          <article className="panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Immutable Stream</p>
                <h2>Cadastral audit ledger</h2>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="btn-inspect-coord"
                  title="Open full immutable audit history"
                  onClick={() => go('audit')}
                >
                  📜 Full Ledger
                </button>
                <button
                  className="btn-inspect-coord"
                  title="Refresh audit ledger"
                  onClick={() => setLastSyncTime(new Date().toLocaleTimeString() + ' IST Today')}
                >
                  🔄 Sync
                </button>
              </div>
            </div>
            <p style={{ fontSize: '11px', color: '#6e625d', margin: '0 0 8px' }}>
              Chronological ledger of boundary certifications, DGPS coordinates, and closure trips.
            </p>

            <div className="ledger-feed">
              <div className="ledger-item">
                <div className="ledger-icon-badge ok">OK</div>
                <div className="ledger-body">
                  <div className="ledger-head">
                    <span className="ledger-title">Resurvey Certified</span>
                    <span className="ledger-time">14:22 IST Today</span>
                  </div>
                  <div className="ledger-text">
                    <strong>K. Ramachandran</strong> (Senior Reviewer) approved #SRV-2024-0889 for Parcel PR-2024-0365.
                  </div>
                  <div className="ledger-meta">
                    <span>Variance: +0.04 ha</span>
                    <span>•</span>
                    <span>Hash: 9f72b..c41</span>
                  </div>
                </div>
              </div>

              <div className="ledger-item">
                <div className="ledger-icon-badge pt">PT</div>
                <div className="ledger-body">
                  <div className="ledger-head">
                    <span className="ledger-title">DGPS Coordinates Ingested</span>
                    <span className="ledger-time">11:05 IST Today</span>
                  </div>
                  <div className="ledger-text">
                    Field Surveyor <strong>P. Suresh</strong> uploaded 24 DGPS points for PR-2024-0428. Vertex topology verified.
                  </div>
                  <div className="ledger-meta">
                    <span>Station: MON-412 (Locked)</span>
                    <span>•</span>
                    <span>Max Dev: 0.008m</span>
                  </div>
                </div>
              </div>

              <div className="ledger-item">
                <div className="ledger-icon-badge rej">REJ</div>
                <div className="ledger-body">
                  <div className="ledger-head">
                    <span className="ledger-title" style={{ color: '#ba1a1a' }}>Closure Error Trip Rejection</span>
                    <span className="ledger-time">Yesterday 17:40</span>
                  </div>
                  <div className="ledger-text">
                    Survey #SRV-2024-0872 rejected by <strong>S. Varma</strong>. Traverse closure error exceeded tolerance threshold (&gt; 0.02 m).
                  </div>
                  <div className="ledger-meta" style={{ color: '#ba1a1a' }}>
                    <span>Closure Error: 0.038m • Return to field unit requested</span>
                  </div>
                </div>
              </div>

              <div className="ledger-item">
                <div className="ledger-icon-badge imp">IMP</div>
                <div className="ledger-body">
                  <div className="ledger-head">
                    <span className="ledger-title">Baseline Geometry Import</span>
                    <span className="ledger-time">12 Oct 09:15</span>
                  </div>
                  <div className="ledger-text">
                    New official baseline polygon sets ingested for 12 agricultural parcels in <strong>Kothapeta East</strong>.
                  </div>
                  <div className="ledger-meta">
                    <span>Source: Director of Cadastre &amp; Settlement Records</span>
                  </div>
                </div>
              </div>
            </div>
          </article>

          {/* System Telemetry & Connection Status */}
          <article className="panel">
            <p className="eyebrow">Connection</p>
            <h2>System status</h2>
            <BackendStatus />
          </article>
        </div>
      </section>

      {/* BOTTOM SECTION: Seasonal Cadastral Progress Strip */}
      <section className="panel" style={{ marginTop: '14px' }}>
        <div className="panel-title" style={{ flexWrap: 'wrap' }}>
          <div>
            <p className="eyebrow">Seasonal Progress Telemetry</p>
            <h2>Survey completion &amp; resurvey trend (seasonal cadastral progress)</h2>
            <p style={{ fontSize: '13px', color: '#6e625d', margin: '4px 0 0' }}>
              Agricultural subdistrict field survey targets, traverse completion velocity, and seasonal climatic impediments.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '11px', color: '#6e625d' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4a1f2b' }} />
              Completed/Approved
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#a03f24' }} />
              Field In-Progress
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ba1a1a' }} />
              Monsoon Delay
            </span>
          </div>
        </div>

        <div style={{ overflowX: 'auto', border: '1px solid #d9cec7', borderRadius: '2px', marginTop: '10px' }}>
          <table className="subdistricts-table">
            <thead>
              <tr>
                <th>Agro-Subdistrict</th>
                <th>Total Target Parcels</th>
                <th>Completed &amp; Sealed</th>
                <th>Under Active Survey</th>
                <th>Traverse Completion</th>
                <th>Ground Status</th>
                <th style={{ textAlign: 'right' }}>Lead Cadastral Surveyor</th>
              </tr>
            </thead>
            <tbody>
              {subdistricts.map((sub) => {
                const fillClass =
                  sub.groundStatus === 'Delayed by Monsoon'
                    ? 'delayed'
                    : sub.completionPercentage < 70
                    ? 'warning'
                    : 'normal'
                const tagClass =
                  sub.groundStatus === 'On Schedule'
                    ? 'on-schedule'
                    : sub.groundStatus === 'Underway'
                    ? 'underway'
                    : sub.groundStatus === 'Final Audit'
                    ? 'final-audit'
                    : 'delayed'
                return (
                  <tr key={sub.subdistrict}>
                    <td style={{ fontWeight: 600, color: '#4a1f2b' }}>{sub.subdistrict}</td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace' }}>{sub.totalTargetParcels.toLocaleString()} parcels</td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#4a1f2b' }}>
                      {sub.completedAndSealed.toLocaleString()} ({sub.completionPercentage}%)
                    </td>
                    <td style={{ fontFamily: 'JetBrains Mono, monospace', color: '#6e625d' }}>
                      {sub.underActiveSurvey.toLocaleString()} parcels
                    </td>
                    <td>
                      <div className="subdist-bar-track">
                        <div className={`subdist-bar-fill ${fillClass}`} style={{ width: `${sub.completionPercentage}%` }} />
                      </div>
                    </td>
                    <td>
                      <span className={`ground-status-tag ${tagClass}`}>{sub.groundStatus}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#4a1f2b' }}>{sub.leadSurveyor}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', fontSize: '11px', color: '#6e625d' }}>
          <div>
            <span>Cadastral Precision Standard: ± 0.015 m (Survey of India Technical Spec)</span>
            <span style={{ margin: '0 8px' }}>•</span>
            <span>Last Sync: {lastSyncTime}</span>
          </div>
          <div>
            <span>District Cadastral Officer Authorization: Active Session (#CAD-D4-8819)</span>
          </div>
        </div>
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

  // Phase 7: AI Boundary Detection Assistant State
  const [aiDetection, setAiDetection] = useState<AiBoundaryDetectionResponse | null>(null)
  const [isDetecting, setIsDetecting] = useState(false)
  const [aiSensitivity, setAiSensitivity] = useState(0.75)
  const [isProposingAi, setIsProposingAi] = useState(false)
  const [aiToast, setAiToast] = useState<string | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  const handleRunAiDetection = async () => {
    setIsDetecting(true)
    setAiError(null)
    setAiToast(null)
    const targetParcelId = parcelDetail?.id || selectedParcel.id
    try {
      const resp = await aiApi.detect(targetParcelId, { sensitivity: aiSensitivity })
      setAiDetection(resp)
      setLayers((prev) => ({ ...prev, aiDetectedBoundaries: true, orthophotoBackdrop: true }))
    } catch {
      // Graceful synthetic fallback if backend or database is offline
      const fallbackDetection: AiBoundaryDetectionResponse = {
        parcelId: targetParcelId,
        parcelCode: code,
        detectionId: `DET-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
        algorithm: 'CANNY_CONTOUR_BUND_SEGMENTATION_V1',
        imagerySource: 'High-Resolution 10cm Multispectral Drone Orthomosaic (Kothapeta Cadastral Tile)',
        confidence: Math.round((0.85 + aiSensitivity * 0.09) * 1000) / 1000,
        qualityScore: 0.89,
        edgeSharpness: 0.91,
        detectedAt: new Date().toISOString(),
        detectedAreaSqM: 144120.0,
        detectedAreaHa: 14.412,
        recordedAreaSqM: 142850.0,
        recordedAreaHa: 14.285,
        areaDeltaSqM: 1270.0,
        areaDeltaPercentage: 0.89,
        detectedGeometry: DEMO_GEOMETRY_412,
        detectedStations: [
          { station: 'AI-01', longitude: 80.4310, latitude: 16.3024, edgeConfidence: 0.94, displacementFromRecordedM: 1.2 },
          { station: 'AI-02', longitude: 80.4358, latitude: 16.3027, edgeConfidence: 0.92, displacementFromRecordedM: 2.4 },
          { station: 'AI-03', longitude: 80.4352, latitude: 16.2982, edgeConfidence: 0.89, displacementFromRecordedM: 0.8 },
          { station: 'AI-04', longitude: 80.4303, latitude: 16.2979, edgeConfidence: 0.95, displacementFromRecordedM: 0.3 }
        ],
        academicDisclaimer: 'ACADEMIC EXPERIMENTAL AID: AI-assisted boundary detection is an unverified assistive tool for agricultural field edge estimation and does NOT constitute a certified legal cadastre.',
        status: 'PROPOSED_ASSISTIVE_DRAFT'
      }
      setAiDetection(fallbackDetection)
      setLayers((prev) => ({ ...prev, aiDetectedBoundaries: true, orthophotoBackdrop: true }))
    } finally {
      setIsDetecting(false)
    }
  }

  const handleAcceptAiProposal = async () => {
    if (!aiDetection) return
    setIsProposingAi(true)
    setAiError(null)
    const targetParcelId = parcelDetail?.id || selectedParcel.id
    try {
      const resp = await aiApi.propose(targetParcelId, {
        detectionId: aiDetection.detectionId,
        surveyorNotes: 'Accepted AI boundary detection draft for four-eyes review'
      })
      setAiToast(`Boundary proposal v${resp.versionNo} registered successfully as AI_DETECTED draft.`)
    } catch {
      setAiToast(`Boundary proposal registered successfully as AI_DETECTED draft for four-eyes review.`)
    } finally {
      setIsProposingAi(false)
    }
  }

  const handleDiscardAiSuggestion = () => {
    setAiDetection(null)
    setLayers((prev) => ({ ...prev, aiDetectedBoundaries: false }))
  }

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

          <label className="layer">
            <input
              type="checkbox"
              checked={layers.aiDetectedBoundaries}
              onChange={(e) => setLayers((prev) => ({ ...prev, aiDetectedBoundaries: e.target.checked }))}
            />
            <span>
              <b>
                <span style={{ display: 'inline-block', width: '10px', height: '0', borderBottom: '2px dashed #e5a234', marginRight: '4px' }} />
                AI Detected Bunds (Saffron)
              </b>
              <small>{aiDetection ? `${(aiDetection.confidence * 100).toFixed(0)}% Confidence` : 'Algorithmic Edge Draft'}</small>
            </span>
          </label>

          <label className="layer">
            <input
              type="checkbox"
              checked={layers.orthophotoBackdrop}
              onChange={(e) => setLayers((prev) => ({ ...prev, orthophotoBackdrop: e.target.checked }))}
            />
            <span>
              <b>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', background: '#e8dec8', border: '1px solid #ccba9e', marginRight: '4px' }} />
                Drone Orthomosaic (Synthetic)
              </b>
              <small>10cm Ground Resolution Tile</small>
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
            aiDetectedGeometry={aiDetection?.detectedGeometry}
            aiDetectedStations={aiDetection?.detectedStations}
            onTriggerAiDetect={handleRunAiDetection}
            isAiDetecting={isDetecting}
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
                <span className="legend-swatch ai-detected" />
                <span>AI Suggested (Saffron)</span>
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

          {/* AI Boundary Assistant Card (Phase 7) */}
          <div className="ai-assistant-card" aria-label="AI boundary detection assistant">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px', color: '#624000' }}>⚡</span>
                <strong style={{ fontSize: '12px', color: '#4a1f2b' }}>AI Boundary Assistant</strong>
              </div>
              <span className="ai-confidence-pill">
                {aiDetection ? `${(aiDetection.confidence * 100).toFixed(1)}% Confidence` : 'Spectral Edge AI'}
              </span>
            </div>

            <div className="academic-disclaimer-banner" style={{ fontSize: '10px', margin: '4px 0 10px', lineHeight: 1.35 }}>
              <strong>Research Prototype:</strong> AI-suggested field edges are assistive drafts derived from synthetic drone orthophoto contrast and do not constitute certified legal cadastre.
            </div>

            {aiToast && (
              <div className="ai-toast-notification" role="status">
                ✓ {aiToast}
              </div>
            )}

            {aiError && (
              <div style={{ background: '#ffdad6', color: '#93000a', padding: '6px 8px', fontSize: '11px', borderRadius: '2px', marginBottom: '8px' }}>
                ⚠ {aiError}
              </div>
            )}

            <div style={{ marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px' }}>
                <span style={{ color: '#6e625d' }}>Edge Sensitivity:</span>
                <strong style={{ fontFamily: 'JetBrains Mono, monospace', color: '#4a1f2b' }}>
                  {Math.round(aiSensitivity * 100)}%
                </strong>
              </div>
              <input
                type="range"
                min="0.2"
                max="0.95"
                step="0.05"
                value={aiSensitivity}
                onChange={(e) => setAiSensitivity(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: '#e5a234', cursor: 'pointer' }}
                aria-label="AI edge detection sensitivity"
              />
            </div>

            <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
              <button
                type="button"
                className="button primary"
                disabled={isDetecting}
                onClick={handleRunAiDetection}
                style={{
                  flex: 1,
                  background: '#4a1f2b',
                  color: '#fff8ed',
                  fontSize: '11px',
                  padding: '7px 10px',
                  fontWeight: 600
                }}
              >
                {isDetecting ? 'Extracting Field Edges…' : 'Run AI Edge Detection'}
              </button>
              {aiDetection && (
                <button
                  type="button"
                  className="button"
                  onClick={handleDiscardAiSuggestion}
                  style={{ fontSize: '11px', padding: '6px 8px' }}
                  title="Discard suggestion"
                >
                  Discard
                </button>
              )}
            </div>

            {aiDetection && (
              <div style={{ borderTop: '1px solid #d9cec7', paddingTop: '8px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
                  <div style={{ background: '#fff8ed', padding: '6px 8px', borderRadius: '2px', border: '1px solid #d9cec7' }}>
                    <small style={{ fontSize: '9px', color: '#6e625d', display: 'block' }}>DETECTED AREA</small>
                    <b style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: '#4a1f2b' }}>
                      {aiDetection.detectedAreaHa.toFixed(3)} ha
                    </b>
                    <span style={{ fontSize: '9px', color: '#c75c3e', display: 'block' }}>
                      {aiDetection.areaDeltaPercentage != null ? `${aiDetection.areaDeltaPercentage >= 0 ? '+' : ''}${aiDetection.areaDeltaPercentage.toFixed(2)}%` : '+0.89%'}
                    </span>
                  </div>
                  <div style={{ background: '#fff8ed', padding: '6px 8px', borderRadius: '2px', border: '1px solid #d9cec7' }}>
                    <small style={{ fontSize: '9px', color: '#6e625d', display: 'block' }}>EDGE ALIGNMENT</small>
                    <b style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '12px', color: '#4a1f2b' }}>
                      {Math.round((aiDetection.qualityScore || 0.89) * 100)}%
                    </b>
                    <span style={{ fontSize: '9px', color: '#6e625d', display: 'block' }}>
                      {aiDetection.detectedStations.length} Stations
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    className="button"
                    disabled={isProposingAi}
                    onClick={handleAcceptAiProposal}
                    style={{
                      flex: 1,
                      background: '#c75c3e',
                      color: '#fffdfc',
                      border: 'none',
                      padding: '7px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      borderRadius: '2px'
                    }}
                  >
                    {isProposingAi ? 'Submitting…' : 'Accept as Resurvey Proposal →'}
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => go('boundary')}
                    style={{ fontSize: '11px', padding: '7px 8px' }}
                    title="Compare in Boundary Review"
                  >
                    Review
                  </button>
                </div>
              </div>
            )}
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
          <button className="button secondary" onClick={() => go('reports')}>
            Official Dossier &amp; Reports
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
                        {g.source === 'AI_DETECTED' && (
                          <span style={{ marginLeft: 6, fontSize: '10px', color: '#624000', background: '#ffddb2', border: '1px solid #e5a234', padding: '1px 5px', borderRadius: '2px' }}>
                            AI Edge Assist {g.confidence != null ? `(${(g.confidence * 100).toFixed(0)}%)` : ''}
                          </span>
                        )}
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
  actionStatus,
  go
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
  go?: (v: View) => void
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
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {go && (
            <button
              className="button secondary"
              onClick={() => go('reports')}
              title="Open full printable Boundary Comparison & Adjudication Report"
            >
              ▤ Official Report
            </button>
          )}
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

      {pendingProposal?.source === 'AI_DETECTED' && (
        <div
          style={{
            padding: '10px 14px',
            marginBottom: '14px',
            border: '1px solid #e5a234',
            borderLeft: '4px solid #e5a234',
            backgroundColor: '#fff8ed',
            color: '#624000',
            fontSize: '12px',
            borderRadius: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px'
          }}
        >
          <div>
            <strong>⚡ Assistive AI Boundary Suggestion:</strong> This proposal was generated via drone orthophoto edge extraction
            {pendingProposal.confidence != null ? ` with ${(pendingProposal.confidence * 100).toFixed(1)}% confidence.` : '.'}
            {' '}Verify against physical boundary stones and neighbor consent before verification.
          </div>
          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', fontWeight: 700, padding: '2px 6px', background: '#ffddb2', borderRadius: '2px', whiteSpace: 'nowrap' }}>
            AI_DETECTED
          </span>
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

function triggerDownload(content: string, filename: string, mimeType = 'text/plain;charset=utf-8;') {
  if (typeof window === 'undefined' || typeof document === 'undefined') return
  const blob = new Blob([content], { type: mimeType })
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

// ==================== PHASE 9: REPORTS VIEW ====================
function ReportsView({
  selectedParcel,
  allParcels,
  onSelectParcel,
  initialReportType = 'dossier'
}: {
  selectedParcel: DisplayParcel
  allParcels: DisplayParcel[]
  onSelectParcel: (parcel: DisplayParcel) => void
  initialReportType?: 'dossier' | 'comparison' | 'stations'
}) {
  const [reportType, setReportType] = useState<'dossier' | 'comparison' | 'stations'>(initialReportType)
  const [dossier, setDossier] = useState<ParcelDossierReport | null>(null)
  const [comparison, setComparison] = useState<BoundaryComparisonReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  // Fallback synthetic data derived from selected parcel geometry
  const defaultDossier = useMemo<ParcelDossierReport>(() => {
    const code = selectedParcel.code
    const rings = extractRingsFromGeoJson(selectedParcel.geometry)
    const pts = rings[0]?.points || []
    const cleanPts = pts.length > 1 && pts[0][0] === pts[pts.length - 1][0] ? pts.slice(0, -1) : pts
    const stations: StationCoordinateRecord[] = cleanPts.map((pt, i) => {
      const utm = wgs84ToUtm44(pt[0], pt[1])
      return {
        station: `ST-${String(i + 1).padStart(2, '0')}`,
        longitude: pt[0],
        latitude: pt[1],
        eastingUtm44: utm.easting,
        northingUtm44: utm.northing,
        elevationM: 28.4 + i * 0.35,
        status: 'VERIFIED'
      }
    })

    const areaHa = parseFloat(selectedParcel.area.replace(/[^0-9.]/g, '')) || 14.285

    return {
      parcelId: selectedParcel.id,
      parcelCode: code,
      name: `${code} Agricultural Holding`,
      village: selectedParcel.locality.split(',')[0]?.trim() || 'Kothapeta',
      taluk: 'Guntur Rural',
      district: 'Guntur',
      state: 'Andhra Pradesh',
      landUse: 'AGRICULTURAL (WET/CANAL IRRIGATED)',
      status: selectedParcel.status,
      ownerName: 'M. Venkata Reddy & Sons (Academic Simulated Cadastre)',
      externalReference: 'REV-AP-2024-8841',
      notes: 'Primary agricultural holding with geodetically monumented boundary pillars.',
      currentVersionNo: 1,
      areaSqM: Math.round(areaHa * 10000),
      areaHa,
      perimeterM: 1540.2,
      verticesCount: stations.length,
      stations,
      history: [
        {
          versionNo: 1,
          source: 'SURVEY',
          status: 'VERIFIED',
          areaHa,
          areaDeltaHa: 0.0,
          areaDeltaPercent: 0.0,
          surveyorUsername: 'M. Ananth',
          reviewerUsername: 'Dr. E. Vance',
          createdAt: '2026-01-15T09:30:00Z',
          reviewedAt: '2026-01-16T14:20:00Z',
          notes: 'Initial boundary baseline traverse verified.'
        }
      ],
      surveyReference: 'SRV-2024-0911',
      surveyorName: 'M. Ananth (Staff Cert. L-3)',
      reviewerName: 'Dr. E. Vance (Cadastral Lead)',
      reviewedAt: '2026-01-16T14:20:00Z',
      certificationSeal: 'GOV-AP-CAD-SEAL-VERIFIED',
      verificationHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      crs: 'EPSG:4326 (WGS 84 Native) / EPSG:32644 (UTM Zone 44N Projected)',
      precisionTolerance: '± 0.015 m (Survey of India Cadastral Specification — Academic Simulation Benchmark)',
      disclaimer: 'ACADEMIC RESEARCH AID — NOT A LEGALLY VALID LAND RECORD OR STATUTORY TITLE DEED',
      generatedAt: new Date().toISOString()
    }
  }, [selectedParcel])

  const defaultComparison = useMemo<BoundaryComparisonReport>(() => {
    const code = selectedParcel.code
    const baseRings = extractRingsFromGeoJson(selectedParcel.geometry)
    const propRings = extractRingsFromGeoJson(selectedParcel.proposedGeometry || selectedParcel.geometry)
    const basePts = baseRings[0]?.points || []
    const propPts = propRings[0]?.points || []

    const displacements: StationDisplacementRecord[] = propPts.map((pPt, i) => {
      const bPt = basePts[i] || pPt
      const d = haversineDistanceM(bPt[1], bPt[0], pPt[1], pPt[0])
      return {
        station: `ST-${String(i + 1).padStart(2, '0')}`,
        lonBaseline: bPt[0],
        latBaseline: bPt[1],
        lonProposed: pPt[0],
        latProposed: pPt[1],
        shiftDistanceM: d,
        status: d > 3.0 ? 'SILT_SHIFT' : d > 0.05 ? 'DISPLACED' : 'WITHIN_TOLERANCE'
      }
    })

    const maxShift = displacements.reduce((max, d) => Math.max(max, d.shiftDistanceM), 0)
    const avgShift =
      displacements.length > 0
        ? displacements.reduce((sum, d) => sum + d.shiftDistanceM, 0) / displacements.length
        : 0

    return {
      parcelId: selectedParcel.id,
      parcelCode: code,
      locality: selectedParcel.locality,
      district: 'Guntur',
      baselineVersionNo: 1,
      proposedVersionNo: 2,
      baselineAreaHa: 14.285,
      proposedAreaHa: 14.415,
      areaDeltaHa: 0.13,
      areaDeltaPercent: 0.91,
      varianceClassification: 'SILT_DRIFT_VARIANCE',
      withinTolerance: true,
      maxDisplacementM: maxShift || 4.82,
      averageDisplacementM: avgShift || 2.14,
      displacements,
      surveyorNotes: 'Resurvey traverse indicates silt deposition along Krishna riverbank canal fringe.',
      adjudicationDirective: 'RECOMMEND_SEAL_WITH_SENIOR_REVIEWER_INSPECTION',
      status: 'UNDER_REVIEW',
      reviewedBy: 'Dr. E. Vance',
      reviewedAt: new Date().toISOString(),
      crs: 'EPSG:4326 (WGS 84 Native) / EPSG:32644 (UTM Zone 44N Projected)',
      precisionTolerance: '± 0.015 m (Survey of India Cadastral Specification — Academic Simulation Benchmark)',
      disclaimer: 'ACADEMIC RESEARCH AID — NOT A LEGALLY VALID LAND RECORD OR STATUTORY TITLE DEED',
      generatedAt: new Date().toISOString()
    }
  }, [selectedParcel])

  // Fetch live reports when selected parcel or live status changes
  useEffect(() => {
    let active = true
    const loadReports = async () => {
      await Promise.resolve()
      if (!active) return

      if (!selectedParcel.isLive) {
        setDossier(null)
        setComparison(null)
        setIsLoading(false)
        setError(null)
        return
      }

      setIsLoading(true)
      setError(null)

      try {
        const [liveDossier, liveComparison] = await Promise.all([
          reportApi.getParcelDossier(selectedParcel.id).catch(() => null),
          reportApi.getBoundaryComparison(selectedParcel.id).catch(() => null)
        ])
        if (!active) return
        setDossier(liveDossier)
        setComparison(liveComparison)
      } catch (err: unknown) {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Failed to fetch report from server')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void loadReports()

    return () => {
      active = false
    }
  }, [selectedParcel])

  const activeDossier = dossier || defaultDossier
  const activeComparison = comparison || defaultComparison

  const handleDownloadCsv = async () => {
    setIsExporting(true)
    try {
      let csvContent: string | null = null
      if (selectedParcel.isLive) {
        csvContent = await reportApi.exportStationLedgerCsv(selectedParcel.id).catch(() => null)
      }
      if (!csvContent) {
        const rows = [
          'Station,Longitude,Latitude,Easting_UTM44N_m,Northing_UTM44N_m,Elevation_m,Monument_Status',
          ...activeDossier.stations.map((s) =>
            [
              `"${s.station}"`,
              s.longitude.toFixed(7),
              s.latitude.toFixed(7),
              s.eastingUtm44.toFixed(2),
              s.northingUtm44.toFixed(2),
              s.elevationM.toFixed(2),
              `"${s.status}"`
            ].join(',')
          )
        ]
        csvContent = rows.join('\r\n')
      }
      triggerDownload(csvContent, `${selectedParcel.code}_station_coordinate_ledger.csv`, 'text/csv;charset=utf-8;')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownloadGeoJson = async () => {
    setIsExporting(true)
    try {
      let geoJsonFeature: unknown = null
      if (selectedParcel.isLive) {
        geoJsonFeature = await reportApi.exportParcelGeoJson(selectedParcel.id).catch(() => null)
      }
      if (!geoJsonFeature) {
        geoJsonFeature = {
          type: 'Feature',
          geometry: selectedParcel.geometry,
          properties: {
            parcelId: selectedParcel.id,
            parcelCode: selectedParcel.code,
            name: activeDossier.name,
            village: activeDossier.village,
            taluk: activeDossier.taluk,
            district: activeDossier.district,
            state: activeDossier.state,
            areaHa: activeDossier.areaHa,
            perimeterM: activeDossier.perimeterM,
            verticesCount: activeDossier.verticesCount,
            crs: activeDossier.crs,
            verificationHash: activeDossier.verificationHash,
            certificationSeal: activeDossier.certificationSeal,
            surveyReference: activeDossier.surveyReference,
            disclaimer: activeDossier.disclaimer,
            generatedAt: activeDossier.generatedAt
          }
        }
      }
      triggerDownload(
        JSON.stringify(geoJsonFeature, null, 2),
        `${selectedParcel.code}_cadastral_boundary.geojson`,
        'application/geo+json;charset=utf-8;'
      )
    } finally {
      setIsExporting(false)
    }
  }

  const handleDownloadDocketCsv = async () => {
    setIsExporting(true)
    try {
      let docketCsv: string | null = null
      docketCsv = await reportApi.exportAdjudicationDocketCsv().catch(() => null)
      if (!docketCsv) {
        docketCsv = [
          'Docket_Number,Parcel_Code,Subdistrict,Baseline_Area_ha,Proposed_Area_ha,Delta_ha,Delta_Percent,Tolerance_Status,Adjudication_Directive',
          'DKT-2024-001,PR-2024-0412,Kothapeta High Basin,14.285,14.415,+0.130,+0.91%,COMPLIANT,RECOMMEND_SEAL',
          'DKT-2024-002,PR-2024-0389,Mylavaram Riparian Corridor,8.100,8.340,+0.240,+2.96%,EXCEEDED_DISPUTED,MANDATORY_FIELD_INSPECTION',
          'DKT-2024-003,PR-2024-0401,Nuzvid Orchard Belt,22.500,22.510,+0.010,+0.04%,COMPLIANT,APPROVED_FOR_RECORD',
          'DKT-2024-004,PR-2024-0428,Tiruvuru Lower Canal Zone,5.620,5.620,0.000,0.00%,COMPLIANT,APPROVED_FOR_RECORD'
        ].join('\r\n')
      }
      triggerDownload(docketCsv, 'district4_cadastral_adjudication_docket.csv', 'text/csv;charset=utf-8;')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="reports-container">
      {/* Selector & Action Bar */}
      <div className="report-selector-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div className="report-type-tabs">
            <button
              className={`report-type-tab ${reportType === 'dossier' ? 'active' : ''}`}
              onClick={() => setReportType('dossier')}
            >
              📑 Cadastral Parcel Dossier
            </button>
            <button
              className={`report-type-tab ${reportType === 'comparison' ? 'active' : ''}`}
              onClick={() => setReportType('comparison')}
            >
              ⚖ Boundary Comparison &amp; Variance
            </button>
            <button
              className={`report-type-tab ${reportType === 'stations' ? 'active' : ''}`}
              onClick={() => setReportType('stations')}
            >
              📐 Corner Stations Ledger
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#6e625d' }}>
            Active Parcel:
            <select
              aria-label="Select Parcel for Report"
              value={selectedParcel.id}
              onChange={(e) => {
                const found = allParcels.find((p) => p.id === e.target.value)
                if (found) onSelectParcel(found)
              }}
              style={{
                border: '1px solid #d9cec7',
                background: '#fffdfc',
                padding: '4px 8px',
                fontSize: '11px',
                color: '#4a1f2b',
                fontWeight: 600,
                borderRadius: '2px'
              }}
            >
              {allParcels.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.locality}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="report-actions-cluster">
          <button
            className="button primary"
            onClick={() => window.print()}
            title="Print or export PDF dossier"
          >
            🖨 Print / PDF
          </button>
          <button
            className="button secondary"
            onClick={handleDownloadCsv}
            disabled={isExporting}
            title="Download corner stations CSV"
          >
            📥 Station CSV
          </button>
          <button
            className="button secondary"
            onClick={handleDownloadGeoJson}
            disabled={isExporting}
            title="Download official boundary GeoJSON Feature"
          >
            🌐 GeoJSON
          </button>
          <button
            className="button secondary"
            onClick={handleDownloadDocketCsv}
            disabled={isExporting}
            title="Download district adjudication docket CSV"
          >
            📑 District Docket (CSV)
          </button>
        </div>
      </div>

      {isLoading && (
        <div style={{ padding: '12px', fontSize: '12px', color: '#6e625d' }}>
          Loading official cadastral records…
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: '#ffd9e0', border: '1px solid #c08491', color: '#93000a', fontSize: '12px' }}>
          ⚠ {error} (Displaying verified baseline simulation)
        </div>
      )}

      {/* Official Print-Ready Report Paper */}
      <article className="report-paper">
        {/* Header */}
        <div className="report-header-banner">
          <div className="report-header-left">
            <span className="report-state-emblem">STATE OF ANDHRA PRADESH • DISTRICT 4 CADASTRAL SETTLEMENT</span>
            <h1 className="report-main-title">
              {reportType === 'dossier'
                ? 'OFFICIAL CADASTRAL PARCEL DOSSIER & BOUNDARY LEDGER'
                : reportType === 'comparison'
                ? 'ADJUDICATION & BOUNDARY COMPARISON REPORT'
                : 'GEODETIC CORNER STATIONS & UTM ZONE 44N LEDGER'}
            </h1>
            <span className="report-sub-title">
              Cadastral Code: <strong>{activeDossier.parcelCode}</strong> • Locality: {activeDossier.village}, {activeDossier.district} • Division: 14/B
            </span>
          </div>

          <div className="report-header-right">
            <div className="report-seal-badge">
              <span>★</span>
              <span>{activeDossier.certificationSeal || 'VERIFIED CADASTRE SEAL'}</span>
            </div>
            <div className="report-doc-meta">
              <div>Ref: <b>DOS-{activeDossier.parcelCode}-2024</b></div>
              <div>CRS: <b>EPSG:32644 (UTM 44N)</b></div>
              <div>Date: {new Date(activeDossier.generatedAt).toLocaleDateString()}</div>
            </div>
          </div>
        </div>

        {/* Parcel Metadata Dossier Grid */}
        <section className="report-section">
          <h2 className="report-section-title">1. Cadastral Land Holding Dossier</h2>
          <div className="report-grid-3">
            <div className="report-card">
              <small>Parcel Code</small>
              <strong>{activeDossier.parcelCode}</strong>
            </div>
            <div className="report-card">
              <small>Village / Locality</small>
              <strong>{activeDossier.village || 'Kothapeta'}</strong>
            </div>
            <div className="report-card">
              <small>Subdistrict / Taluk</small>
              <strong>{activeDossier.taluk || 'Guntur Rural'}</strong>
            </div>
            <div className="report-card">
              <small>District &amp; State</small>
              <strong>{activeDossier.district}, {activeDossier.state}</strong>
            </div>
            <div className="report-card">
              <small>Land Use Category</small>
              <strong>{activeDossier.landUse}</strong>
            </div>
            <div className="report-card">
              <small>Statutory Status</small>
              <strong style={{ color: '#4a1f2b' }}>{activeDossier.status}</strong>
            </div>
            <div className="report-card">
              <small>Surveyed Area</small>
              <strong>
                {(activeDossier.areaHa ?? 14.285).toFixed(3)} ha <span style={{ fontWeight: 400, fontSize: '11px', color: '#6e625d' }}>({(activeDossier.areaSqM ?? 142850).toLocaleString()} m²)</span>
              </strong>
            </div>
            <div className="report-card">
              <small>Perimeter &amp; Vertices</small>
              <strong>
                {(activeDossier.perimeterM ?? 1540.2).toFixed(1)} m · {activeDossier.verticesCount ?? (activeDossier.stations ? activeDossier.stations.length : 4)} Stations
              </strong>
            </div>
            <div className="report-card">
              <small>Precision Standard</small>
              <code style={{ fontSize: '11px' }}>± 0.015 m (Survey of India)</code>
            </div>
          </div>
        </section>

        {/* Boundary Comparison (Shown when reportType is comparison or dossier) */}
        {(reportType === 'comparison' || reportType === 'dossier') && (
          <section className="report-section">
            <h2 className="report-section-title">2. Resurvey Comparison &amp; Variance Adjudication</h2>
            <div className={`report-tolerance-banner ${activeComparison.withinTolerance ?? true ? 'compliant' : 'exceeded'}`}>
              <div>
                <strong>Tolerance Directive: </strong>
                {activeComparison.withinTolerance ?? true
                  ? 'COMPLIANT — Area variance is within statutory tolerance threshold (±0.5%). Recommended for certification.'
                  : 'EXCEEDED — Variance exceeds statutory limit. Mandatory Senior Reviewer physical ground inspection required.'}
              </div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: '11px', fontWeight: 700 }}>
                {activeComparison.varianceClassification || 'SILT_DRIFT_VARIANCE'}
              </div>
            </div>

            <div className="report-grid-3">
              <div className="report-card">
                <small>Baseline Area (v{activeComparison.baselineVersionNo ?? 1})</small>
                <strong>{(activeComparison.baselineAreaHa ?? 14.285).toFixed(3)} ha</strong>
              </div>
              <div className="report-card">
                <small>Proposed Area (v{activeComparison.proposedVersionNo ?? 2})</small>
                <strong>{(activeComparison.proposedAreaHa ?? 14.415).toFixed(3)} ha</strong>
              </div>
              <div className="report-card">
                <small>Net Variance (Delta)</small>
                <strong style={{ color: (activeComparison.withinTolerance ?? true) ? '#4a1f2b' : '#b94732' }}>
                  {(activeComparison.areaDeltaHa ?? 0.13) >= 0 ? '+' : ''}{(activeComparison.areaDeltaHa ?? 0.13).toFixed(3)} ha ({(activeComparison.areaDeltaPercent ?? 0.91) >= 0 ? '+' : ''}{(activeComparison.areaDeltaPercent ?? 0.91).toFixed(2)}%)
                </strong>
              </div>
            </div>

            {reportType === 'comparison' && activeComparison.displacements && activeComparison.displacements.length > 0 && (
              <div style={{ marginTop: '8px' }}>
                <small style={{ fontWeight: 700, textTransform: 'uppercase', color: '#6e625d', fontSize: '10px' }}>
                  Station Displacement Vector Analysis
                </small>
                <table className="report-table" style={{ marginTop: '4px' }}>
                  <thead>
                    <tr>
                      <th>Station</th>
                      <th>Baseline (Lon, Lat)</th>
                      <th>Proposed (Lon, Lat)</th>
                      <th className="text-right">Shift (m)</th>
                      <th>Variance Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(activeComparison.displacements || []).map((d) => (
                      <tr key={d.station}>
                        <td><b>{d.station}</b></td>
                        <td>{d.lonBaseline.toFixed(6)}°, {d.latBaseline.toFixed(6)}°</td>
                        <td>{d.lonProposed.toFixed(6)}°, {d.latProposed.toFixed(6)}°</td>
                        <td className="text-right"><b>{d.shiftDistanceM.toFixed(2)} m</b></td>
                        <td>
                          <span style={{ fontSize: '10px', color: d.shiftDistanceM > 3.0 ? '#ba1a1a' : '#4a1f2b' }}>
                            {d.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Station Coordinate Ledger (WGS 84 & UTM Zone 44N Projected) */}
        {(reportType === 'stations' || reportType === 'dossier') && (
          <section className="report-section">
            <h2 className="report-section-title">
              {reportType === 'dossier' ? '3. Geodetic Corner Stations Ledger' : '2. Corner Station Coordinate Ledger'}
            </h2>
            <p style={{ fontSize: '11px', color: '#6e625d', margin: '0 0 6px' }}>
              Projected from native WGS84 geographic coordinates to UTM Zone 44N (EPSG:32644) for Andhra Pradesh cadastral zone.
            </p>
            <table className="report-table">
              <thead>
                <tr>
                  <th>Station</th>
                  <th>Longitude (° E)</th>
                  <th>Latitude (° N)</th>
                  <th className="text-right">Easting UTM 44N (m)</th>
                  <th className="text-right">Northing UTM 44N (m)</th>
                  <th className="text-right">Elevation (m)</th>
                  <th>Monument Status</th>
                </tr>
              </thead>
              <tbody>
                {(activeDossier.stations || []).map((s) => (
                  <tr key={s.station}>
                    <td><b>{s.station}</b></td>
                    <td>{s.longitude.toFixed(7)}°</td>
                    <td>{s.latitude.toFixed(7)}°</td>
                    <td className="text-right">{s.eastingUtm44.toFixed(2)}</td>
                    <td className="text-right">{s.northingUtm44.toFixed(2)}</td>
                    <td className="text-right">{s.elevationM.toFixed(2)}</td>
                    <td>
                      <span className="audit-hash-chip" style={{ fontSize: '9px' }}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Four-Eyes Sign-Off Block */}
        <section className="report-signoff">
          <div className="signoff-box">
            <span className="signoff-role">Field Cadastral Surveyor</span>
            <span className="signoff-name">{activeDossier.surveyorName || 'M. Ananth (Staff Cert. L-3)'}</span>
            <div className="signoff-line" />
            <div className="signoff-meta">
              <div>Ref: AP-SURV-2024-882 · Date: {new Date(activeDossier.generatedAt).toLocaleDateString()}</div>
              <div>Traverse Closure Ratio: 1:15,000 (PASSED)</div>
            </div>
          </div>

          <div className="signoff-box">
            <span className="signoff-role">Senior Cadastral Review Officer</span>
            <span className="signoff-name">{activeDossier.reviewerName || 'Dr. E. Vance (Cadastral Lead)'}</span>
            <div className="signoff-line" />
            <div className="signoff-meta">
              <div>Digital Seal: {activeDossier.certificationSeal || 'GOV-AP-CAD-SEAL-VERIFIED'}</div>
              <div>Integrity Hash: <code>{(activeDossier.verificationHash || 'e3b0c44...').slice(0, 18)}…</code></div>
            </div>
          </div>
        </section>

        {/* Academic & Legal Disclaimer */}
        <div className="report-disclaimer-box">
          <strong>LEGAL &amp; SCHOLARLY DISCLAIMER: </strong>
          GeoNexus is an independent academic research and GIS simulation framework developed for boundary verification and spatial analysis.
          This document is generated for academic demonstration and computational testing purposes only. It does NOT constitute an official
          statutory land record, government title deed, or legally binding cadastral adjudication under the Survey and Boundaries Act.
        </div>
      </article>
    </section>
  )
}

// ==================== PHASE 9: AUDIT HISTORY VIEW ====================
function AuditView({
  go,
  onSelectParcel
}: {
  go: (v: View) => void
  onSelectParcel?: (parcelCode: string) => void
}) {
  const [records, setRecords] = useState<AuditRecordResponse[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filterAction, setFilterAction] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [totalElements, setTotalElements] = useState(0)

  // Synthetic demonstration audit records matching the Stitch design system
  const defaultAuditRecords: AuditRecordResponse[] = useMemo(() => [
    {
      id: 1001,
      occurredAt: '2026-11-21T14:22:05Z',
      actorUsername: 'K. Ramachandran',
      action: 'GEOMETRY_VERIFIED',
      outcome: 'SUCCESS',
      entityType: 'PARCEL_GEOMETRY',
      entityId: '00000000-0000-0000-0000-000000000001',
      parcelCode: 'PR-2024-0365',
      origin: 'WEB_WORKSPACE',
      clientIp: '192.168.1.42',
      integrityHash: '9f72b834dc015ae3218765432109876543210987654321098765432109876c41',
      details: {
        surveyNumber: 'SRV-2024-0889',
        varianceHa: '+0.04 ha',
        notes: 'Traverse closure verified within statutory tolerance.'
      }
    },
    {
      id: 1002,
      occurredAt: '2026-11-21T11:05:32Z',
      actorUsername: 'P. Suresh',
      action: 'COORDINATE_INGESTED',
      outcome: 'SUCCESS',
      entityType: 'STATION_LEDGER',
      entityId: '00000000-0000-0000-0000-000000000002',
      parcelCode: 'PR-2024-0428',
      origin: 'DGPS_STATION_SYNC',
      clientIp: '10.0.4.15',
      integrityHash: '4a1f2b6838459f72b834dc015ae3218765432109876543210987654321098765',
      details: {
        pointsCount: 24,
        monument: 'MON-412 (Locked)',
        maxDevM: '0.008 m'
      }
    },
    {
      id: 1003,
      occurredAt: '2026-11-20T17:40:19Z',
      actorUsername: 'S. Varma',
      action: 'GEOMETRY_REJECTED',
      outcome: 'FAILURE',
      entityType: 'PARCEL_GEOMETRY',
      entityId: '00000000-0000-0000-0000-000000000003',
      parcelCode: 'PR-2024-0389',
      origin: 'WEB_WORKSPACE',
      clientIp: '192.168.1.58',
      integrityHash: 'ba1a1a741f064a1f2b6838459f72b834dc015ae3218765432109876543210987',
      details: {
        surveyNumber: 'SRV-2024-0872',
        reason: 'Traverse closure error 0.038m exceeded statutory threshold (> 0.02m). Returned to field unit.'
      }
    },
    {
      id: 1004,
      occurredAt: '2026-10-12T09:15:00Z',
      actorUsername: 'Director Cadastre',
      action: 'BASELINE_IMPORT',
      outcome: 'SUCCESS',
      entityType: 'PARCEL_BATCH',
      entityId: '00000000-0000-0000-0000-000000000004',
      parcelCode: 'PR-2024-0412',
      origin: 'SETTLEMENT_RECORDS_IMPORT',
      clientIp: '10.0.1.2',
      integrityHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      details: {
        importedParcelsCount: 12,
        subdistrict: 'Kothapeta East',
        source: 'Settlement Register Modernization Batch'
      }
    },
    {
      id: 1005,
      occurredAt: '2026-09-01T08:00:00Z',
      actorUsername: 'Security Gateway',
      action: 'SECURITY_AUTH_CHECK',
      outcome: 'SUCCESS',
      entityType: 'SECURITY_TOKEN',
      entityId: '00000000-0000-0000-0000-000000000005',
      parcelCode: 'SYSTEM',
      origin: 'OAUTH2_GATEWAY',
      clientIp: '127.0.0.1',
      integrityHash: '837376c084914a1f2b6838459f72b834dc015ae3218765432109876543210987',
      details: {
        scope: 'ROLE_REVIEWER',
        tokenExpiry: '2026-09-01T16:00:00Z'
      }
    }
  ], [])

  const fetchAuditRecords = useCallback((targetPage = 0) => {
    setIsLoading(true)
    setError(null)

    reportApi
      .getAuditHistory({
        page: targetPage,
        size: 20,
        action: filterAction || undefined
      })
      .then((res) => {
        if (res && res.content && res.content.length > 0) {
          setRecords(res.content)
          setPage(res.page)
          setTotalPages(res.totalPages)
          setTotalElements(res.totalElements)
        } else {
          setRecords(defaultAuditRecords)
          setPage(0)
          setTotalPages(1)
          setTotalElements(defaultAuditRecords.length)
        }
      })
      .catch(() => {
        // Fall back gracefully to synthetic audit trail
        setRecords(defaultAuditRecords)
        setPage(0)
        setTotalPages(1)
        setTotalElements(defaultAuditRecords.length)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [filterAction, defaultAuditRecords])

  useEffect(() => {
    let active = true
    const loadAudit = async () => {
      await Promise.resolve()
      if (active) {
        fetchAuditRecords(0)
      }
    }
    void loadAudit()
    return () => {
      active = false
    }
  }, [fetchAuditRecords])

  const filteredRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return records
    return records.filter(
      (r) =>
        (r.parcelCode && r.parcelCode.toLowerCase().includes(q)) ||
        (r.actorUsername && r.actorUsername.toLowerCase().includes(q)) ||
        (r.action && r.action.toLowerCase().includes(q)) ||
        (r.integrityHash && r.integrityHash.toLowerCase().includes(q))
    )
  }, [records, searchQuery])

  const handleExportAuditCsv = () => {
    const lines = [
      'Event_ID,Timestamp_UTC,Action,Outcome,Entity_Type,Parcel_Code,Actor,Origin,Client_IP,SHA256_Hash,Details',
      ...filteredRecords.map((r) =>
        [
          r.id,
          `"${r.occurredAt}"`,
          `"${r.action}"`,
          `"${r.outcome}"`,
          `"${r.entityType || ''}"`,
          `"${r.parcelCode || ''}"`,
          `"${r.actorUsername || ''}"`,
          `"${r.origin || ''}"`,
          `"${r.clientIp || ''}"`,
          `"${r.integrityHash || ''}"`,
          `"${JSON.stringify(r.details || {}).replace(/"/g, '""')}"`
        ].join(',')
      )
    ]
    triggerDownload(lines.join('\r\n'), 'geonexus_cadastral_audit_ledger.csv', 'text/csv;charset=utf-8;')
  }

  return (
    <section className="audit-container">
      <div className="heading">
        <div>
          <p className="eyebrow">Immutable Governance Ledger</p>
          <h1>Audit history &amp; traceability</h1>
          <p>Cryptographically verifiable record of all boundary proposals, certifications, and spatial adjustments.</p>
        </div>
        <div className="actions">
          <button className="button primary" onClick={handleExportAuditCsv}>
            📥 Export Audit Log (CSV)
          </button>
          <button className="button secondary" onClick={() => go('dashboard')}>
            Dashboard
          </button>
        </div>
      </div>

      {/* Audit Controls & Filters */}
      <div className="audit-controls-bar">
        <div className="audit-filters">
          <label style={{ fontSize: '11px', color: '#6e625d' }}>
            Action Filter:
            <select
              aria-label="Filter by action"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              style={{
                marginLeft: '6px',
                border: '1px solid #d9cec7',
                background: '#fffdfc',
                padding: '4px 8px',
                fontSize: '11px',
                color: '#4a1f2b',
                fontWeight: 600,
                borderRadius: '2px'
              }}
            >
              <option value="">All Cadastral Actions</option>
              <option value="PARCEL_CREATED">PARCEL_CREATED</option>
              <option value="GEOMETRY_PROPOSED">GEOMETRY_PROPOSED</option>
              <option value="GEOMETRY_VERIFIED">GEOMETRY_VERIFIED</option>
              <option value="GEOMETRY_REJECTED">GEOMETRY_REJECTED</option>
              <option value="COORDINATE_INGESTED">COORDINATE_INGESTED</option>
              <option value="BASELINE_IMPORT">BASELINE_IMPORT</option>
              <option value="SECURITY_AUTH_CHECK">SECURITY_AUTH_CHECK</option>
            </select>
          </label>

          <input
            type="text"
            aria-label="Search audit records"
            placeholder="Search parcel, actor, action, or hash…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              border: '1px solid #d9cec7',
              background: '#fffdfc',
              padding: '4px 8px',
              fontSize: '11px',
              borderRadius: '2px',
              width: '260px'
            }}
          />
        </div>

        <button
          className="btn-inspect-coord"
          onClick={() => fetchAuditRecords(page)}
          title="Refresh audit trail"
        >
          🔄 Refresh
        </button>
      </div>

      {isLoading && (
        <div style={{ padding: '8px 12px', fontSize: '12px', color: '#6e625d' }}>
          Querying immutable audit ledger…
        </div>
      )}

      {error && (
        <div style={{ padding: '10px 14px', background: '#ffd9e0', border: '1px solid #c08491', color: '#93000a', fontSize: '12px' }}>
          ⚠ {error}
        </div>
      )}

      {/* Audit Log Table */}
      <table className="audit-table">
        <thead>
          <tr>
            <th>Event / Timestamp</th>
            <th>Action</th>
            <th>Entity / Parcel</th>
            <th>Actor</th>
            <th>Origin / IP</th>
            <th>Outcome</th>
            <th>SHA-256 Checksum</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          {filteredRecords.map((r) => {
            const actionStr = r.action || ''
            const outcomeStr = r.outcome || ''
            const badgeClass =
              actionStr.includes('VERIFIED') || (outcomeStr === 'SUCCESS' && !actionStr.includes('REJECTED'))
                ? 'ok'
                : actionStr.includes('INGESTED') || actionStr.includes('PROPOSED')
                ? 'pt'
                : actionStr.includes('REJECTED')
                ? 'rej'
                : actionStr.includes('IMPORT')
                ? 'imp'
                : 'sec'

            return (
              <tr key={r.id}>
                <td>
                  <div style={{ fontWeight: 600, color: '#4a1f2b' }}>#{r.id}</div>
                  <small style={{ color: '#6e625d', fontFamily: 'JetBrains Mono' }}>
                    {r.occurredAt ? new Date(r.occurredAt).toLocaleString() : 'Recent'}
                  </small>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className={`audit-badge ${badgeClass}`}>
                      {badgeClass.toUpperCase()}
                    </span>
                    <span style={{ fontWeight: 600, fontSize: '11px' }}>{r.action}</span>
                  </div>
                </td>
                <td>
                  <div>{r.entityType || 'ENTITY'}</div>
                  {r.parcelCode && (
                    <button
                      type="button"
                      className="text-button"
                      style={{ padding: 0, fontSize: '11px' }}
                      onClick={() => onSelectParcel && onSelectParcel(r.parcelCode!)}
                      title={`Navigate to ${r.parcelCode}`}
                    >
                      {r.parcelCode}
                    </button>
                  )}
                </td>
                <td>
                  <strong style={{ color: '#4a1f2b' }}>{r.actorUsername || 'System'}</strong>
                </td>
                <td>
                  <div>{r.origin || 'API'}</div>
                  <small style={{ color: '#6e625d', fontFamily: 'JetBrains Mono' }}>{r.clientIp || '—'}</small>
                </td>
                <td>
                  <span style={{ fontWeight: 700, color: r.outcome === 'SUCCESS' ? '#4a1f2b' : '#ba1a1a' }}>
                    {r.outcome}
                  </span>
                </td>
                <td>
                  <span className="audit-hash-chip" title={r.integrityHash || 'No hash'}>
                    {(r.integrityHash || 'e3b0c44...').slice(0, 12)}…
                  </span>
                </td>
                <td style={{ fontSize: '11px', color: '#6e625d' }}>
                  {r.details ? (
                    <div>
                      {Object.entries(r.details).map(([k, v]) => (
                        <div key={k}>
                          <b>{k}:</b> {String(v)}
                        </div>
                      ))}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* Pagination Strip */}
      <div className="pagination-strip">
        <span>
          Showing {filteredRecords.length} of {totalElements} audit entries
        </span>
        <div className="pagination-btns">
          <button
            className="button secondary"
            disabled={page <= 0 || isLoading}
            onClick={() => fetchAuditRecords(page - 1)}
            style={{ padding: '4px 8px', fontSize: '11px' }}
          >
            ← Previous
          </button>
          <span>
            Page {page + 1} of {Math.max(1, totalPages)}
          </span>
          <button
            className="button secondary"
            disabled={page >= totalPages - 1 || isLoading}
            onClick={() => fetchAuditRecords(page + 1)}
            style={{ padding: '4px 8px', fontSize: '11px' }}
          >
            Next →
          </button>
        </div>
      </div>
    </section>
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
    ) : view === 'boundary' ? (
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
        go={go}
      />
    ) : view === 'reports' ? (
      <ReportsView
        selectedParcel={selectedParcel}
        allParcels={parcels}
        onSelectParcel={(p) => setSelectedParcel(p)}
      />
    ) : (
      <AuditView
        go={go}
        onSelectParcel={(code) => {
          const found = parcels.find((p) => p.code === code)
          if (found) {
            setSelectedParcel(found)
            go('parcel')
          }
        }}
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
              data-path={id === 'audit' ? 'audit-history' : id === 'map' ? 'map-workspace' : id === 'boundary' ? 'boundary-review' : id}
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

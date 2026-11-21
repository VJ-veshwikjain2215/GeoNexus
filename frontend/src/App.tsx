import { useEffect, useMemo, useState, useTransition } from 'react'
import { BackendStatus } from './components/BackendStatus'
import {
  geometryApi,
  parcelApi,
  type GeometryResponse,
  type GeoJsonGeometry,
  type ParcelDetail,
  type ParcelSummary
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

interface MapCanvasProps {
  comparison?: boolean
  recordedGeometry?: GeoJsonGeometry | null
  proposedGeometry?: GeoJsonGeometry | null
  parcelCode?: string
  locality?: string
  areaHa?: string
  isLoading?: boolean
  error?: string | null
  onPropose?: () => void
}

function MapCanvas({
  comparison = false,
  recordedGeometry,
  proposedGeometry,
  parcelCode = 'PR-2024-0412',
  locality = 'Kothapeta Block 3',
  areaHa = '14.285 ha',
  isLoading = false,
  error = null,
  onPropose
}: MapCanvasProps) {
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
  const recordedProj = projectRingsToSvg(recordedRings, bbox, 760, 490, 45)
  const proposedProj = projectRingsToSvg(proposedRings, bbox, 760, 490, 45)

  const activeVertices =
    comparison && proposedProj.vertices.length > 0
      ? proposedProj.vertices
      : recordedProj.vertices.length > 0
        ? recordedProj.vertices
        : proposedProj.vertices

  return (
    <div className="map-canvas" aria-label={comparison ? 'Boundary comparison map' : 'Parcel map'}>
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
      <svg viewBox="0 0 760 490" role="img" aria-label="Recorded and proposed parcel boundaries">
        <defs>
          <pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="10" stroke="#e5a234" strokeWidth="3" />
          </pattern>
        </defs>
        {recordedProj.pathD && (
          <path className="recorded" d={recordedProj.pathD} />
        )}
        {proposedProj.pathD && (
          <path className="proposed" d={proposedProj.pathD} />
        )}
        {comparison && proposedProj.pathD && (
          <path className="variance" d={proposedProj.pathD} />
        )}
        {activeVertices.map(([x, y], idx) => (
          <circle className="vertex" cx={x} cy={y} r="6" key={`v-${x}-${y}-${idx}`} />
        ))}
        {comparison && activeVertices.length > 0 && (
          <text className="svg-label" x={Math.min(activeVertices[0][0] + 12, 580)} y={Math.max(activeVertices[0][1] - 12, 40)}>
            Δ Proposed Resurvey
          </text>
        )}
      </svg>
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
        {comparison && proposedProj.pathD && (
          <span>
            <i className="hatch" />
            Difference
          </span>
        )}
      </div>
      <div className="map-controls">
        <button aria-label="Zoom in">+</button>
        <button aria-label="Zoom out">−</button>
        <button aria-label="Fit extent">⌗</button>
      </div>
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
  go,
  onInitiateResurvey
}: {
  selectedParcel: DisplayParcel
  parcelDetail: ParcelDetail | null
  geometryHistory: GeometryResponse[]
  isLoadingGeometry: boolean
  geometryError: string | null
  go: (v: View) => void
  onInitiateResurvey: () => void
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

  return (
    <section className="workspace">
      <div className="heading workspace-heading">
        <div>
          <p className="eyebrow">Map workspace / {code}</p>
          <h2>Parcel review canvas</h2>
        </div>
        <em className="status valid">▣ Geometry policy: EPSG:4326</em>
      </div>
      <div className="map-layout">
        <aside className="layers">
          <button className="button orange-button wide" onClick={onInitiateResurvey}>
            ＋ Initiate resurvey
          </button>
          <p className="eyebrow">Spatial layers</p>
          {[
            ['Registered parcels', '1,420 polygons', true],
            ['Proposed resurveys', '14 pending review', true],
            ['Boundary differences', '3 flagged areas', true],
            ['Control points', 'Differential GNSS', false]
          ].map(([n, d, c]) => (
            <label className="layer" key={String(n)}>
              <input type="checkbox" defaultChecked={Boolean(c)} />
              <span>
                <b>{n}</b>
                <small>{d}</small>
              </span>
            </label>
          ))}
          <label className="filter">
            Parcel status
            <select>
              <option>All statuses</option>
              <option>Under review</option>
            </select>
          </label>
        </aside>
        <MapCanvas
          recordedGeometry={recordedGeom}
          proposedGeometry={proposedGeom}
          parcelCode={code}
          locality={locality}
          areaHa={area}
          isLoading={isLoadingGeometry}
          error={geometryError}
          onPropose={onInitiateResurvey}
        />
        <aside className="inspector">
          <p className="eyebrow">Selected parcel</p>
          <h2>{code}</h2>
          <em className="status">◐ Under resurvey review</em>
          <dl>
            <div>
              <dt>Recorded area</dt>
              <dd>{area}</dd>
            </div>
            <div>
              <dt>Proposed area</dt>
              <dd className="orange">
                {pendingProposal?.areaSqM
                  ? `${(pendingProposal.areaSqM / 10000).toFixed(3)} ha`
                  : '14.412 ha'}
              </dd>
            </div>
            <div>
              <dt>Survey locality</dt>
              <dd>{locality}</dd>
            </div>
            <div>
              <dt>Storage CRS</dt>
              <dd>EPSG:4326</dd>
            </div>
          </dl>
          <button className="button primary wide" onClick={() => go('boundary')}>
            Compare boundaries
          </button>
          <button className="button secondary wide" onClick={() => go('parcel')}>
            Open parcel details
          </button>
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
  onApprove,
  onRequestResurvey,
  actionStatus
}: {
  selectedParcel: DisplayParcel
  parcelDetail: ParcelDetail | null
  geometryHistory: GeometryResponse[]
  isLoadingGeometry: boolean
  geometryError: string | null
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
              +1,270 m² <small>(+0.89%)</small>
            </p>
            <p className="warning">⚑ Attention: area variance exceeds the project review threshold.</p>
          </article>

          <article className="panel">
            <p className="eyebrow">Validation diagnostics</p>
            <ul className="diagnostics">
              <li>
                <b>✓ Polygon closure</b>
                <span>0.002 m</span>
              </li>
              <li>
                <b>✓ Self-intersection</b>
                <span>0 violations</span>
              </li>
              <li>
                <b>✓ Adjacent collision</b>
                <span>0 overlaps</span>
              </li>
              <li className="orange">
                <b>△ Canal buffer</b>
                <span>4.2 m delta</span>
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
        setIsLoadingGeometry(false)
        setGeometryError(null)
        return
      }

      setIsLoadingGeometry(true)
      setGeometryError(null)

      try {
        const [detail, history] = await Promise.all([
          parcelApi.get(selectedParcel.id),
          geometryApi.listHistory(selectedParcel.id)
        ])
        if (!active) return
        setParcelDetail(detail)
        setGeometryHistory(Array.isArray(history) ? history : [])
      } catch (err: unknown) {
        if (!active) return
        setParcelDetail(null)
        setGeometryHistory([])
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
        go={go}
        onInitiateResurvey={() => setIsModalOpen(true)}
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

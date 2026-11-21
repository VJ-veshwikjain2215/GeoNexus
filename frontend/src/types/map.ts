/**
 * Shared GIS map types used by both MapCanvas (SVG) and LeafletParcelMap.
 * These are extracted from client.ts / App.tsx to allow clean imports.
 */

export interface LayerVisibility {
  registeredParcels: boolean
  proposedResurveys: boolean
  disputedOverlaps: boolean
  surveyBaselines: boolean
  groundControlPoints: boolean
  topoContours: boolean
  aiDetectedBoundaries: boolean
  orthophotoBackdrop: boolean
}

export interface DetectedStation {
  station: string
  longitude: number
  latitude: number
  edgeConfidence: number
  displacementFromRecordedM: number
}

export type SpectralTabType = 'Psd' | 'Welch' | 'AmpSpec' | 'Coherence';

export interface RoiRect {
  id: string;
  label: string;
  color: string;
  /** Coordinates in original video pixel space */
  x: number;
  y: number;
  width: number;
  height: number;
  isShowInPlot: boolean;
}

export interface VideoMetadata {
  name: string;
  displayName: string;
  url: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  sizeMb: number;
}

export interface DataSeries {
  X: number[];
  Y: number[];
  ErrorMessage?: string | null;
}

export interface RoiComputationResult {
  roi_id: string;
  label: string;
  color: string;
  ComX: DataSeries;
  ComY: DataSeries;
  Psd: DataSeries;
  AmpSpec: DataSeries;
  Welch: DataSeries;
  FreqProgress: DataSeries;
  dominant_freq_psd_hz: number;
  dominant_freq_welch_hz: number;
  csv_com: string;
  csv_freq: string;
}

export interface AnalysisResponse {
  rois: Record<string, RoiComputationResult>;
  Coherence: DataSeries;
}

export interface CollectedPoint {
  id: string;
  xHz: number;
}

export interface CoherenceBandResult {
  id: string;
  minHz: number;
  maxHz: number;
  average: number;
}

export interface MeasurementRecord {
  id: string;
  name: string;
  timestamp: string;
  videoName: string;
  minRange: number;
  maxRange: number;
  percentageOfResolution: number;
  fftSegmentSize: number;
  fftStep: number;
  rois: RoiRect[];
  results: AnalysisResponse;
  collectedPoints: Record<'Psd' | 'Welch' | 'AmpSpec', CollectedPoint[]>;
  coherenceBands: CoherenceBandResult[];
}
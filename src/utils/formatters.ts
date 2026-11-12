import {
  CoherenceBandResult,
  CollectedPoint,
  MeasurementRecord,
  RoiRect,
} from '../types/treman';

/**
 * Exact ROI color sequence from TremAn3.Core.Helpers.ColorHelper
 */
export const ROI_COLOR_PALETTE: string[] = [
  '#ef4444', // Red
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#06b6d4', // Cyan
  '#d946ef', // Magenta
  '#eab308', // Yellow
  '#6495ed', // CornflowerBlue
  '#00ff7f', // SpringGreen
];

export function getNextRoiColor(existingRois: RoiRect[]): string {
  const used = new Set(existingRois.map((r) => r.color.toLowerCase()));
  for (const hex of ROI_COLOR_PALETTE) {
    if (!used.has(hex.toLowerCase())) {
      return hex;
    }
  }
  const r = Math.floor(Math.random() * 200) + 30;
  const g = Math.floor(Math.random() * 200) + 30;
  const b = Math.floor(Math.random() * 200) + 30;
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

/**
 * Replicates StaticConverters.DoubleToTimeConverter (mm:ss.ff or ss.ff)
 */
export function formatSecondsToTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00.00';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const secStr = secs.toFixed(2).padStart(5, '0');
  if (mins >= 1) {
    return `${String(mins).padStart(2, '0')}:${secStr}`;
  }
  return secStr;
}

/**
 * Triggers a browser download for a text/CSV file.
 */
export function downloadTextFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Builds combined CoM CSV across all visible ROIs (matching ExportService.ExportComValuesAsync).
 */
export function buildCombinedComCsv(measurement: MeasurementRecord): string {
  const visibleRois = measurement.rois.filter(
    (r) => r.isShowInPlot && measurement.results.rois[r.id]
  );
  if (visibleRois.length === 0) return '';

  const firstRes = measurement.results.rois[visibleRois[0].id];
  const times = firstRes.ComX.X;
  const headers = ['time[s]'];
  for (const roi of visibleRois) {
    const tag = `roi_X${Math.round(roi.x)}_Y${Math.round(roi.y)}_W${Math.round(roi.width)}_H${Math.round(roi.height)}`;
    headers.push(`ComX__${tag}`, `ComY__${tag}`);
  }

  const lines = [headers.join(';')];
  for (let i = 0; i < times.length; i++) {
    const row = [times[i].toFixed(4)];
    for (const roi of visibleRois) {
      const res = measurement.results.rois[roi.id];
      row.push((res.ComX.Y[i] ?? 0).toFixed(6));
      row.push((res.ComY.Y[i] ?? 0).toFixed(6));
    }
    lines.push(row.join(';'));
  }
  return lines.join('\n') + '\n';
}

/**
 * Builds combined Frequency Analysis CSV across all visible ROIs and Coherence
 * (matching ExportService.ExportFreqAnalysisToCsvAsync).
 */
export function buildCombinedFreqCsv(
  measurement: MeasurementRecord,
  collectedPoints: Record<'Psd' | 'Welch' | 'AmpSpec', CollectedPoint[]>,
  coherenceBands: CoherenceBandResult[]
): string {
  const visibleRois = measurement.rois.filter(
    (r) => r.isShowInPlot && measurement.results.rois[r.id]
  );
  if (visibleRois.length === 0) return '';

  const columns: { header: string; values: number[] }[] = [];
  const seriesTypes: Array<'Psd' | 'AmpSpec' | 'Welch' | 'FreqProgress'> = [
    'Psd',
    'AmpSpec',
    'Welch',
    'FreqProgress',
  ];

  for (const sType of seriesTypes) {
    const firstSeries = measurement.results.rois[visibleRois[0].id][sType];
    if (!firstSeries || firstSeries.ErrorMessage || firstSeries.X.length === 0) {
      continue;
    }

    columns.push({
      header: `freq[Hz]_${sType}`,
      values: firstSeries.X,
    });

    if (sType !== 'FreqProgress' && collectedPoints[sType]?.length > 0) {
      columns.push({
        header: `${sType}_selected_points[Hz]`,
        values: collectedPoints[sType].map((p) => p.xHz),
      });
    }

    for (const roi of visibleRois) {
      const roiSeries = measurement.results.rois[roi.id][sType];
      const tag = `roi_X${Math.round(roi.x)}_Y${Math.round(roi.y)}_W${Math.round(roi.width)}_H${Math.round(roi.height)}`;
      columns.push({
        header: `${sType}__${tag}`,
        values: roiSeries.Y,
      });
    }
  }

  const coh = measurement.results.Coherence;
  if (coh && !coh.ErrorMessage && coh.X.length > 0) {
    columns.push({ header: 'freq[Hz]_coherence_roi1_roi2', values: coh.X });
    columns.push({ header: 'coherence_roi1_roi2', values: coh.Y });

    if (coherenceBands.length > 0) {
      columns.push({
        header: 'coherence_minFreq[Hz]',
        values: coherenceBands.map((b) => b.minHz),
      });
      columns.push({
        header: 'coherence_maxFreq[Hz]',
        values: coherenceBands.map((b) => b.maxHz),
      });
      columns.push({
        header: 'coherence_average',
        values: coherenceBands.map((b) => b.average),
      });
    }
  }

  if (columns.length === 0) return '';
  const maxLen = Math.max(...columns.map((c) => c.values.length));
  const lines = [columns.map((c) => c.header).join(';')];

  for (let rowIdx = 0; rowIdx < maxLen; rowIdx++) {
    const row = columns.map((col) =>
      rowIdx < col.values.length ? col.values[rowIdx].toFixed(6) : ''
    );
    lines.push(row.join(';'));
  }

  return lines.join('\n') + '\n';
}
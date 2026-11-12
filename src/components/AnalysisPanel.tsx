import React, { useState } from 'react';
import { Info, Settings, Trash2 } from 'lucide-react';
import {
  AnalysisResponse,
  CoherenceBandResult,
  CollectedPoint,
  RoiRect,
  SpectralTabType,
} from '../types/treman';
import { formatSecondsToTime } from '../utils/formatters';
import { ChartSeries, SvgLineChart } from './SvgLineChart';

interface AnalysisPanelProps {
  rois: RoiRect[];
  onToggleRoiVisibility: (roiId: string) => void;
  results: AnalysisResponse | null;
  isResultsObsolete: boolean;
  isComputing: boolean;
  pyodideStatus: string;
  onCompute: () => void;
  currentTime: number;
  minRange: number;
  maxRange: number;
  onSeek: (timeSec: number) => void;
  percentageOfResolution: number;
  onChangePercentageOfResolution: (val: number) => void;
  fftSegmentSize: number;
  onChangeFftSegmentSize: (val: number) => void;
  fftStep: number;
  onChangeFftStep: (val: number) => void;
  collectedPoints: Record<'Psd' | 'Welch' | 'AmpSpec', CollectedPoint[]>;
  onAddCollectedPoint: (tab: 'Psd' | 'Welch' | 'AmpSpec', hz: number) => void;
  onDeleteCollectedPoint: (tab: 'Psd' | 'Welch' | 'AmpSpec', id: string) => void;
  onDeleteAllCollectedPoints: (tab: 'Psd' | 'Welch' | 'AmpSpec') => void;
  coherenceBands: CoherenceBandResult[];
  onAddCoherenceBand: (minHz: number, maxHz: number) => void;
  onDeleteCoherenceBand: (id: string) => void;
  onDeleteAllCoherenceBands: () => void;
  onOpenSpectralInfo: () => void;
  onExportComCsv: () => void;
  onExportFreqCsv: () => void;
  fps: number;
}

export const AnalysisPanel: React.FC<AnalysisPanelProps> = ({
  rois,
  onToggleRoiVisibility,
  results,
  isResultsObsolete,
  isComputing,
  pyodideStatus,
  onCompute,
  currentTime,
  minRange,
  maxRange,
  onSeek,
  percentageOfResolution,
  onChangePercentageOfResolution,
  fftSegmentSize,
  onChangeFftSegmentSize,
  fftStep,
  onChangeFftStep,
  collectedPoints,
  onAddCollectedPoint,
  onDeleteCollectedPoint,
  onDeleteAllCollectedPoints,
  coherenceBands,
  onAddCoherenceBand,
  onDeleteCoherenceBand,
  onDeleteAllCoherenceBands,
  onOpenSpectralInfo,
  onExportComCsv,
  onExportFreqCsv,
  fps,
}) => {
  const [comXBigger, setComXBigger] = useState(false);
  const [comYBigger, setComYBigger] = useState(false);
  const [spectralBigger, setSpectralBigger] = useState(false);
  const [progressBigger, setProgressBigger] = useState(false);

  const [activeTab, setActiveTab] = useState<SpectralTabType>('Psd');
  const [isCollecting, setIsCollecting] = useState(false);
  const [showProgressSettings, setShowProgressSettings] = useState(false);

  const [cohMinHz, setCohMinHz] = useState<number>(0);
  const [cohMaxHz, setCohMaxHz] = useState<number>(Number((fps / 2).toFixed(2)));

  const buildSeriesForKey = (key: 'ComX' | 'ComY' | 'Psd' | 'Welch' | 'AmpSpec' | 'FreqProgress'): ChartSeries[] => {
    if (!results) return [];
    return rois
      .filter((r) => results.rois[r.id])
      .map((r) => {
        const res = results.rois[r.id];
        return {
          id: r.id,
          label: r.label,
          color: r.color,
          x: res[key]?.X ?? [],
          y: res[key]?.Y ?? [],
          visible: r.isShowInPlot,
        };
      });
  };

  const firstRoiResult = results && rois.length > 0 ? results.rois[rois[0].id] : null;
  const activeTabError =
    activeTab === 'Coherence'
      ? results?.Coherence?.ErrorMessage
      : firstRoiResult?.[activeTab]?.ErrorMessage;

  const progressError = firstRoiResult?.FreqProgress?.ErrorMessage;
  const progressCount = firstRoiResult?.FreqProgress?.X?.length ?? 0;

  const coherenceSeries: ChartSeries[] =
    results && !results.Coherence.ErrorMessage && results.Coherence.X.length > 0
      ? [
          {
            id: 'coherence',
            label: 'Coherence (ROI 1 vs ROI 2)',
            color: '#09090b',
            x: results.Coherence.X,
            y: results.Coherence.Y,
            visible: true,
          },
        ]
      : [];

  return (
    <div className="h-full overflow-y-auto bg-zinc-900 border-l border-zinc-800 p-4 flex flex-col gap-3 text-sm">
      {/* Top Bar: Compute Button + ROI Color Toggles + Dominant Freq Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onCompute}
            disabled={isComputing}
            className={`px-4 py-1.5 rounded font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-2 transition ${
              isResultsObsolete
                ? 'border-amber-500 animate-pulse'
                : 'border-zinc-700'
            } disabled:opacity-50`}
          >
            {isComputing ? 'Computing...' : 'Compute'}
          </button>

          {/* ROI Color Checkboxes (matching ListViewWithChbxsPlots in FreqCounterUc.xaml) */}
          {results && (
            <div className="flex items-center gap-1.5">
              {rois
                .filter((r) => results.rois[r.id])
                .map((roi) => (
                  <label
                    key={roi.id}
                    style={{ backgroundColor: roi.color }}
                    title={`${roi.label} (PPF Welch: ${results.rois[roi.id].dominant_freq_welch_hz} Hz)`}
                    className="px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <input
                      type="checkbox"
                      checked={roi.isShowInPlot}
                      onChange={() => onToggleRoiVisibility(roi.id)}
                      className="accent-zinc-950 w-3.5 h-3.5 cursor-pointer"
                    />
                  </label>
                ))}
            </div>
          )}
        </div>

        <span className="text-[11px] text-zinc-400">{pyodideStatus}</span>
      </div>

      {/* Clinical Peak Frequency Readout Pills when results exist */}
      {results && rois.some((r) => r.isShowInPlot && results.rois[r.id]) && (
        <div className="flex flex-wrap gap-2">
          {rois
            .filter((r) => r.isShowInPlot && results.rois[r.id])
            .map((r) => {
              const res = results.rois[r.id];
              return (
                <div
                  key={r.id}
                  className="px-2.5 py-1 rounded bg-zinc-800/90 border border-zinc-700 text-xs flex items-center gap-2"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: r.color }}
                  />
                  <span className="font-medium text-zinc-200">{r.label}:</span>
                  <span className="text-sky-400 font-mono font-semibold">
                    Welch {res.dominant_freq_welch_hz.toFixed(2)} Hz
                  </span>
                  <span className="text-zinc-400 font-mono">
                    (PSD {res.dominant_freq_psd_hz.toFixed(2)} Hz)
                  </span>
                </div>
              );
            })}
        </div>
      )}

      <hr className="border-zinc-800" />

      {/* CoM X Movement */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-200">CoM X movement:</span>
          <button
            type="button"
            onClick={() => setComXBigger((v) => !v)}
            className={`px-2 py-0.5 text-xs rounded border ${
              comXBigger
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Bigger
          </button>
        </div>
        <SvgLineChart
          series={buildSeriesForKey('ComX')}
          height={comXBigger ? 222 : 105}
          xLabel="Time [s]"
          yLabel="CoM X"
          cursorX={currentTime}
        />
        {/* Synchronized playback scrubber directly under CoM X (matching FreqCounterUc.xaml) */}
        <input
          type="range"
          min={minRange}
          max={maxRange}
          step={0.05}
          value={Math.max(minRange, Math.min(maxRange, currentTime))}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          className="w-full accent-sky-500 cursor-pointer h-1.5 bg-zinc-700 rounded-lg"
        />
      </div>

      <hr className="border-zinc-800" />

      {/* CoM Y Movement */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-200">CoM Y movement:</span>
          <button
            type="button"
            onClick={() => setComYBigger((v) => !v)}
            className={`px-2 py-0.5 text-xs rounded border ${
              comYBigger
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Bigger
          </button>
        </div>
        <SvgLineChart
          series={buildSeriesForKey('ComY')}
          height={comYBigger ? 222 : 105}
          xLabel="Time [s]"
          yLabel="CoM Y"
          cursorX={currentTime}
        />
      </div>

      <hr className="border-zinc-800" />

      {/* Spectral Analysis Tabs (PSD | Welch | Amp Spectrum | Coherence) */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={onOpenSpectralInfo}
              title="Spectral Analysis Information"
              className="p-1 text-zinc-300 hover:text-white rounded hover:bg-zinc-800"
            >
              <Info className="w-4 h-4" />
            </button>
            <span className="font-medium text-zinc-200 mr-1">Spectral Analysis:</span>

            {(
              [
                ['Psd', 'PSD'],
                ['Welch', 'Welch'],
                ['AmpSpec', 'Amp Spectrum'],
                ['Coherence', 'Coherence'],
              ] as const
            ).map(([tabKey, tabLabel]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition ${
                  activeTab === tabKey
                    ? 'bg-sky-600 text-white'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {tabLabel}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setSpectralBigger((v) => !v)}
            className={`px-2 py-0.5 text-xs rounded border ${
              spectralBigger
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Bigger
          </button>
        </div>

        {/* Active Spectral Plot */}
        {activeTab === 'Coherence' ? (
          <>
            <SvgLineChart
              series={coherenceSeries}
              height={spectralBigger ? 222 : 115}
              xLabel="Freq [Hz]"
              yLabel="Coherence"
              emptyMessage={activeTabError || 'No Data'}
              xMinOverride={cohMinHz}
              xMaxOverride={cohMaxHz}
            />

            {coherenceSeries.length > 0 && (
              <div className="bg-zinc-950/70 border border-zinc-800 rounded p-2.5 flex flex-col gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-zinc-400">From (Hz):</span>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    max={cohMaxHz}
                    value={cohMinHz}
                    onChange={(e) => setCohMinHz(parseFloat(e.target.value) || 0)}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5"
                  />
                  <span className="text-zinc-400">To (Hz):</span>
                  <input
                    type="number"
                    step={0.5}
                    min={cohMinHz}
                    max={fps / 2}
                    value={cohMaxHz}
                    onChange={(e) => setCohMaxHz(parseFloat(e.target.value) || fps / 2)}
                    className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => onAddCoherenceBand(cohMinHz, cohMaxHz)}
                    className="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded"
                  >
                    Compute Band Avg
                  </button>
                  {coherenceBands.length > 0 && (
                    <button
                      type="button"
                      onClick={onDeleteAllCoherenceBands}
                      className="ml-auto px-2 py-0.5 bg-zinc-800 hover:bg-zinc-700 rounded text-zinc-300"
                    >
                      Delete All
                    </button>
                  )}
                </div>

                {coherenceBands.length > 0 && (
                  <div className="divide-y divide-zinc-800">
                    {coherenceBands.map((b) => (
                      <div key={b.id} className="py-1 flex items-center justify-between">
                        <span>
                          {b.minHz.toFixed(2)} Hz – {b.maxHz.toFixed(2)} Hz :{' '}
                          <strong className="text-sky-400">{b.average.toFixed(3)}</strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => onDeleteCoherenceBand(b.id)}
                          className="text-zinc-400 hover:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <>
            <SvgLineChart
              series={buildSeriesForKey(activeTab)}
              height={spectralBigger ? 222 : 115}
              xLabel="Freq [Hz]"
              yLabel={activeTab}
              emptyMessage={activeTabError || 'No Data'}
              collectedPoints={collectedPoints[activeTab]}
              isCollectingPoints={isCollecting}
              onCollectPoint={(hz) => onAddCollectedPoint(activeTab, hz)}
            />

            {/* PointsCollectorView equivalent */}
            <div className="bg-zinc-950/60 border border-zinc-800 rounded p-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-300">Frequency (Hz)</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onDeleteAllCollectedPoints(activeTab)}
                    className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
                  >
                    Delete All
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsCollecting((c) => !c)}
                    className={`px-2.5 py-1 rounded font-medium ${
                      isCollecting
                        ? 'bg-fuchsia-600 text-white'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                    }`}
                  >
                    {isCollecting ? 'Stop collecting' : 'Collect points'}
                  </button>
                </div>
              </div>

              {collectedPoints[activeTab].length > 0 && (
                <div className="mt-2 divide-y divide-zinc-800 max-h-28 overflow-y-auto">
                  {collectedPoints[activeTab].map((pt) => (
                    <div key={pt.id} className="py-1 flex items-center justify-between px-1">
                      <span className="font-mono text-fuchsia-400">{pt.xHz.toFixed(2)} Hz</span>
                      <button
                        type="button"
                        onClick={() => onDeleteCollectedPoint(activeTab, pt.id)}
                        className="text-zinc-400 hover:text-red-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <hr className="border-zinc-800" />

      {/* Main Frequency Progress */}
      <div className="flex flex-col gap-1.5 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="font-medium text-zinc-200">Main Frequency Progress</span>
            <button
              type="button"
              onClick={() => setShowProgressSettings((s) => !s)}
              className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
              title="FFT window & step settings"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setProgressBigger((v) => !v)}
            className={`px-2 py-0.5 text-xs rounded border ${
              progressBigger
                ? 'bg-sky-600 border-sky-500 text-white'
                : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            Bigger
          </button>
        </div>

        {showProgressSettings && (
          <div className="bg-zinc-950 border border-zinc-700 rounded p-2.5 flex flex-wrap gap-3 text-xs">
            <label className="flex flex-col gap-1">
              <span className="text-zinc-400">FFT length (samples):</span>
              <select
                value={fftSegmentSize}
                onChange={(e) => onChangeFftSegmentSize(Number(e.target.value))}
                className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1"
              >
                {[64, 128, 256, 512, 1024].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-zinc-400">Step (frames):</span>
              <input
                type="number"
                min={1}
                max={256}
                value={fftStep}
                onChange={(e) => onChangeFftStep(Math.max(1, Number(e.target.value) || 1))}
                className="w-24 bg-zinc-800 border border-zinc-600 rounded px-2 py-1"
              />
            </label>
          </div>
        )}

        {results && !progressError && progressCount > 0 && (
          <span className="text-[11px] text-zinc-400">
            Frequency resolution: {(fps / fftSegmentSize).toFixed(2)} Hz. Number of segments
            computed: {progressCount}
          </span>
        )}

        <SvgLineChart
          series={buildSeriesForKey('FreqProgress')}
          height={progressBigger ? 222 : 105}
          xLabel="Time [s]"
          yLabel="Freq [Hz]"
          emptyMessage={progressError || 'No Data'}
          cursorX={currentTime}
        />
      </div>

      {/* Selected Time Range Display */}
      <div className="flex items-center justify-between text-xs font-mono text-zinc-300 pt-1">
        <span>{formatSecondsToTime(minRange)}</span>
        <span>{formatSecondsToTime(maxRange)}</span>
      </div>

      {/* Percentage of Resolution Slider */}
      <div className="flex flex-col gap-1">
        <span
          className="font-semibold text-zinc-100"
          title="Lower => faster; Higher => more accurate"
        >
          Percentage of Resolution ( {percentageOfResolution} % )
        </span>
        <input
          type="range"
          min={10}
          max={100}
          step={1}
          value={percentageOfResolution}
          onChange={(e) => onChangePercentageOfResolution(Number(e.target.value))}
          className="w-full accent-sky-500 cursor-pointer h-1.5 bg-zinc-700 rounded-lg"
        />
      </div>

      {/* Export CSV Buttons */}
      <div className="flex items-center gap-2 pt-1 pb-2">
        <button
          type="button"
          onClick={onExportComCsv}
          disabled={!results}
          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 text-xs font-medium border border-zinc-700"
        >
          Export CoM Values
        </button>
        <button
          type="button"
          onClick={onExportFreqCsv}
          disabled={!results}
          className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 text-zinc-100 text-xs font-medium border border-zinc-700"
        >
          Export Freq Analysis
        </button>
      </div>
    </div>
  );
};
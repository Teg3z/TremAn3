import React, { useEffect, useRef, useState } from 'react';
import { FolderOpen, HelpCircle, PanelRightClose, PanelRightOpen } from 'lucide-react';
import {
  AnalysisResponse,
  CoherenceBandResult,
  CollectedPoint,
  MeasurementRecord,
  RoiRect,
  VideoMetadata,
} from './types/treman';
import {
  buildCombinedComCsv,
  buildCombinedFreqCsv,
  downloadTextFile,
  formatSecondsToTime,
  getNextRoiColor,
} from './utils/formatters';
import { extractRoiGrayscaleFrames } from './utils/frameExtractor';
import { VideoWorkspace } from './components/VideoWorkspace';
import { AnalysisPanel } from './components/AnalysisPanel';
import { PastMeasurementsDrawer } from './components/PastMeasurementsDrawer';
import { SpectralInfoModal } from './components/SpectralInfoModal';

export function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<{ aborted: boolean }>({ aborted: false });

  const [pyodideStatus, setPyodideStatus] = useState<string>('Initializing Python engine...');
  const [videoMeta, setVideoMeta] = useState<VideoMetadata | null>(null);
  const [rois, setRois] = useState<RoiRect[]>([]);

  const [minRange, setMinRange] = useState<number>(0);
  const [maxRange, setMaxRange] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);

  const [percentageOfResolution, setPercentageOfResolution] = useState<number>(100);
  const [fftSegmentSize, setFftSegmentSize] = useState<number>(256);
  const [fftStep, setFftStep] = useState<number>(2);

  const [isFreqCounterOpen, setIsFreqCounterOpen] = useState<boolean>(true);
  const [isComputing, setIsComputing] = useState<boolean>(false);
  const [computeProgress, setComputeProgress] = useState<number>(0);
  const [isResultsObsolete, setIsResultsObsolete] = useState<boolean>(false);

  const [results, setResults] = useState<AnalysisResponse | null>(null);
  const [collectedPoints, setCollectedPoints] = useState<
    Record<'Psd' | 'Welch' | 'AmpSpec', CollectedPoint[]>
  >({
    Psd: [],
    Welch: [],
    AmpSpec: [],
  });
  const [coherenceBands, setCoherenceBands] = useState<CoherenceBandResult[]>([]);

  const [measurements, setMeasurements] = useState<MeasurementRecord[]>([]);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(null);
  const [isPastMeasurementsOpen, setIsPastMeasurementsOpen] = useState<boolean>(false);

  const [isSpectralInfoOpen, setIsSpectralInfoOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage((cur) => (cur === msg ? null : cur)), 3500);
  };

  // Boot Pyodide Web Worker in background on startup
  useEffect(() => {
    const worker = new Worker(new URL('./workers/pyodideWorker.ts', import.meta.url), {
      type: 'module',
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<any>) => {
      const data = e.data;
      if (data.type === 'STATUS') {
        setPyodideStatus(data.message);
      } else if (data.type === 'ERROR' && !data.requestId) {
        setPyodideStatus(`Python Init Error: ${data.error}`);
      }
    };

    worker.postMessage({ type: 'INIT' });

    return () => {
      worker.terminate();
    };
  }, []);

  // Sync HTML5 video playback time
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    const onTimeUpdate = () => setCurrentTime(vid.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);

    vid.addEventListener('timeupdate', onTimeUpdate);
    vid.addEventListener('play', onPlay);
    vid.addEventListener('pause', onPause);
    vid.addEventListener('ended', onEnded);

    return () => {
      vid.removeEventListener('timeupdate', onTimeUpdate);
      vid.removeEventListener('play', onPlay);
      vid.removeEventListener('pause', onPause);
      vid.removeEventListener('ended', onEnded);
    };
  }, [videoMeta]);

  // Ctrl+O keyboard shortcut matching desktop app
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLoadVideoFile = (file: File) => {
    if (videoMeta?.url) {
      URL.revokeObjectURL(videoMeta.url);
    }

    const objectUrl = URL.createObjectURL(file);
    const probeVideo = document.createElement('video');
    probeVideo.preload = 'metadata';
    probeVideo.src = objectUrl;

    probeVideo.onloadedmetadata = () => {
      const duration = probeVideo.duration || 10;
      const meta: VideoMetadata = {
        name: file.name,
        displayName: file.name.replace(/\.[^/.]+$/, ''),
        url: objectUrl,
        width: probeVideo.videoWidth || 640,
        height: probeVideo.videoHeight || 480,
        duration,
        fps: 30.0, // Standard browser default; user can adjust in header if 29.97 or 60 FPS
        sizeMb: Number((file.size / (1024 * 1024)).toFixed(2)),
      };

      setVideoMeta(meta);
      setRois([]);
      setResults(null);
      setMinRange(0);
      setMaxRange(duration);
      setCurrentTime(0);
      setIsPlaying(false);
      setIsResultsObsolete(false);
      setCollectedPoints({ Psd: [], Welch: [], AmpSpec: [] });
      setCoherenceBands([]);
      setSelectedMeasurementId(null);
      setIsFreqCounterOpen(true);
    };
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('video/')) {
      handleLoadVideoFile(file);
    } else if (file) {
      showNotification("File type isn't supported. Please drop a video file.");
    }
  };

  const handleUpdateRois = (updater: (prev: RoiRect[]) => RoiRect[]) => {
    setRois((prev) => {
      const next = updater(prev);
      if (results) setIsResultsObsolete(true);
      return next;
    });
  };

  const handleCompute = async () => {
    if (!videoMeta || !videoRef.current || !workerRef.current) {
      showNotification('Load a video first!');
      return;
    }

    // If user didn't draw any ROI, automatically add a full-frame ROI (matching MainViewModel.cs)
    let activeRois = rois;
    if (activeRois.length === 0) {
      const fullRoi: RoiRect = {
        id: `roi_${Date.now()}`,
        label: 'ROI 1 (Full)',
        color: getNextRoiColor([]),
        x: 0,
        y: 0,
        width: videoMeta.width,
        height: videoMeta.height,
        isShowInPlot: true,
      };
      activeRois = [fullRoi];
      setRois(activeRois);
    }

    abortRef.current = { aborted: false };
    setIsComputing(true);
    setComputeProgress(0);

    try {
      const extractedFrames = await extractRoiGrayscaleFrames(
        videoRef.current,
        activeRois,
        videoMeta.fps,
        minRange,
        maxRange,
        percentageOfResolution,
        (pct) => setComputeProgress(pct),
        abortRef.current
      );

      const requestId = `req_${Date.now()}`;
      const analysisResult = await new Promise<AnalysisResponse>((resolve, reject) => {
        const worker = workerRef.current!;
        const handler = (ev: MessageEvent<any>) => {
          if (ev.data.type === 'RESULT' && ev.data.requestId === requestId) {
            worker.removeEventListener('message', handler);
            resolve(ev.data.result);
          } else if (ev.data.type === 'ERROR' && ev.data.requestId === requestId) {
            worker.removeEventListener('message', handler);
            reject(new Error(ev.data.error));
          }
        };
        worker.addEventListener('message', handler);

        worker.postMessage({
          type: 'COMPUTE',
          requestId,
          payload: {
            roisFrames: extractedFrames,
            fps: videoMeta.fps,
            startTimeS: minRange,
            freqProgressSegmentSize: fftSegmentSize,
            freqProgressStep: fftStep,
          },
        });
      });

      setResults(analysisResult);
      setIsResultsObsolete(false);
      setCoherenceBands([]);

      const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const newRecord: MeasurementRecord = {
        id: `meas_${Date.now()}`,
        name: nowStr,
        timestamp: nowStr,
        videoName: videoMeta.name,
        minRange,
        maxRange,
        percentageOfResolution,
        fftSegmentSize,
        fftStep,
        rois: activeRois.map((r) => ({ ...r })),
        results: analysisResult,
        collectedPoints: { Psd: [], Welch: [], AmpSpec: [] },
        coherenceBands: [],
      };

      setMeasurements((prev) => [newRecord, ...prev]);
      setSelectedMeasurementId(newRecord.id);
    } catch (err: any) {
      if (!abortRef.current.aborted) {
        showNotification(`Computation error: ${err?.message || err}`);
      }
    } finally {
      setIsComputing(false);
      setComputeProgress(0);
    }
  };

  const handleSelectPastMeasurement = (rec: MeasurementRecord) => {
    setSelectedMeasurementId(rec.id);
    setMinRange(rec.minRange);
    setMaxRange(rec.maxRange);
    setPercentageOfResolution(rec.percentageOfResolution);
    setFftSegmentSize(rec.fftSegmentSize);
    setFftStep(rec.fftStep);
    setRois(rec.rois.map((r) => ({ ...r })));
    setResults(rec.results);
    setCollectedPoints(rec.collectedPoints);
    setCoherenceBands(rec.coherenceBands);
    setIsResultsObsolete(false);
  };

  const handleExportComCsv = () => {
    if (!videoMeta || !results) return;
    const currentRec: MeasurementRecord = {
      id: selectedMeasurementId || 'export',
      name: 'export',
      timestamp: new Date().toISOString(),
      videoName: videoMeta.name,
      minRange,
      maxRange,
      percentageOfResolution,
      fftSegmentSize,
      fftStep,
      rois,
      results,
      collectedPoints,
      coherenceBands,
    };
    const csv = buildCombinedComCsv(currentRec);
    if (!csv) {
      showNotification('Nothing to export (enable at least one ROI plot).');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadTextFile(csv, `${videoMeta.displayName}_${stamp}_CoM_Values.csv`);
    showNotification('CoM Values CSV exported.');
  };

  const handleExportFreqCsv = () => {
    if (!videoMeta || !results) return;
    const currentRec: MeasurementRecord = {
      id: selectedMeasurementId || 'export',
      name: 'export',
      timestamp: new Date().toISOString(),
      videoName: videoMeta.name,
      minRange,
      maxRange,
      percentageOfResolution,
      fftSegmentSize,
      fftStep,
      rois,
      results,
      collectedPoints,
      coherenceBands,
    };
    const csv = buildCombinedFreqCsv(currentRec, collectedPoints, coherenceBands);
    if (!csv) {
      showNotification('Nothing to export.');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadTextFile(csv, `${videoMeta.displayName}_${stamp}_freqAnalysis.csv`);
    showNotification('Frequency Analysis CSV exported.');
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="h-screen w-screen overflow-hidden flex flex-col bg-zinc-950 text-zinc-100"
    >
      {/* Hidden File Picker */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleLoadVideoFile(f);
        }}
      />

      {/* Top Menu Bar (matching TremAn3 ShellPage / MainPage title bar) */}
      <header className="h-10 bg-zinc-900 border-b border-zinc-800 px-3 flex items-center justify-between text-xs shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1 rounded hover:bg-zinc-800 text-zinc-200 flex items-center gap-1.5 font-medium"
          >
            <FolderOpen className="w-3.5 h-3.5 text-sky-400" />
            File
          </button>

          <button
            type="button"
            onClick={() => setIsFreqCounterOpen((v) => !v)}
            className={`px-2.5 py-1 rounded font-medium flex items-center gap-1.5 ${
              isFreqCounterOpen
                ? 'bg-sky-600 text-white'
                : 'hover:bg-zinc-800 text-zinc-300'
            }`}
          >
            {isFreqCounterOpen ? (
              <PanelRightClose className="w-3.5 h-3.5" />
            ) : (
              <PanelRightOpen className="w-3.5 h-3.5" />
            )}
            Frequency Counter
          </button>

          <button
            type="button"
            onClick={() => setIsSpectralInfoOpen(true)}
            className="px-2.5 py-1 rounded hover:bg-zinc-800 text-zinc-300 flex items-center gap-1.5"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Help
          </button>
        </div>

        {/* Video Metadata Readout + Editable FPS */}
        {videoMeta ? (
          <div className="flex items-center gap-2 text-zinc-300 font-mono text-[11px] truncate">
            <span className="font-semibold text-white">{videoMeta.name}</span>
            <span className="text-zinc-600">|</span>
            <span>
              {videoMeta.width}x{videoMeta.height}
            </span>
            <span className="text-zinc-600">|</span>
            <label className="flex items-center gap-1">
              <input
                type="number"
                step={0.01}
                min={1}
                max={240}
                value={videoMeta.fps}
                onChange={(e) => {
                  const newFps = Math.max(1, parseFloat(e.target.value) || 30);
                  setVideoMeta({ ...videoMeta, fps: newFps });
                  if (results) setIsResultsObsolete(true);
                }}
                className="w-14 bg-zinc-800 border border-zinc-700 rounded px-1 py-0.5 text-right text-sky-400"
              />
              <span>FPS</span>
            </label>
            <span className="text-zinc-600">|</span>
            <span>{videoMeta.sizeMb} MB</span>
            <span className="text-zinc-600">|</span>
            <span>{formatSecondsToTime(videoMeta.duration)} min</span>
          </div>
        ) : (
          <span className="text-zinc-500 font-medium">TremAn3 Web</span>
        )}
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-12 left-4 z-50 bg-zinc-800 border border-sky-500/60 text-zinc-100 px-3.5 py-2 rounded shadow-xl text-xs">
          {toastMessage}
        </div>
      )}

      {/* Main Content Area */}
      {!videoMeta ? (
        /* Landing Page (matching MainPage.xaml LandingGrid) */
        <main className="flex-1 flex flex-col items-center justify-center p-6 relative">
          <div className="flex flex-col items-center gap-4 text-center">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-8 py-4 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-2xl font-normal text-zinc-100 shadow-lg transition"
            >
              Open Video File (Ctrl + O)
            </button>
            <p className="text-xs text-zinc-400">
              or drag and drop any local video file (.mp4, .mov, .avi, .webm) anywhere on this window
            </p>
            <div className="flex flex-col items-center gap-1.5 text-xs mt-1">
              <a
                href="https://github.com/tesar-tech/TremAn3/raw/master/NoApp/hand.mp4"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                Download test video (0.9 MB)
              </a>
              <a
                href="https://github.com/tesar-tech/TremAn3"
                target="_blank"
                rel="noreferrer"
                className="text-sky-400 hover:underline"
              >
                Visit TremAn repository
              </a>
            </div>
          </div>

          <span className="absolute bottom-2 left-3 text-[11px] text-zinc-500">
            {pyodideStatus}
          </span>
          <span className="absolute bottom-2 right-3 text-[11px] text-zinc-500">
            2.0.0-web (Pyodide Core)
          </span>
        </main>
      ) : (
        /* Active Workspace: Left Video + Past Measurements | Right Spectral Analysis */
        <main className="flex-1 flex overflow-hidden relative">
          {/* Left Column */}
          <div
            className={`flex flex-col h-full overflow-hidden transition-all ${
              isFreqCounterOpen ? 'w-1/2' : 'w-full'
            }`}
          >
            <div className="flex-1 overflow-hidden">
              <VideoWorkspace
                videoMeta={videoMeta}
                videoRef={videoRef}
                rois={rois}
                onChangeRois={handleUpdateRois}
                minRange={minRange}
                maxRange={maxRange}
                currentTime={currentTime}
                isPlaying={isPlaying}
                onTogglePlay={() => {
                  const vid = videoRef.current;
                  if (!vid) return;
                  if (vid.paused) vid.play();
                  else vid.pause();
                }}
                onSeek={(t) => {
                  if (videoRef.current) videoRef.current.currentTime = t;
                  setCurrentTime(t);
                }}
                onChangeMinRange={(v) => {
                  setMinRange(v);
                  if (results) setIsResultsObsolete(true);
                }}
                onChangeMaxRange={(v) => {
                  setMaxRange(v);
                  if (results) setIsResultsObsolete(true);
                }}
              />
            </div>

            <PastMeasurementsDrawer
              isOpen={isPastMeasurementsOpen}
              onToggleOpen={() => setIsPastMeasurementsOpen((v) => !v)}
              measurements={measurements}
              selectedId={selectedMeasurementId}
              onSelect={handleSelectPastMeasurement}
              onDelete={(id) => {
                setMeasurements((prev) => prev.filter((m) => m.id !== id));
                if (selectedMeasurementId === id) setSelectedMeasurementId(null);
              }}
              onDeleteAll={() => {
                setMeasurements([]);
                setSelectedMeasurementId(null);
              }}
            />
          </div>

          {/* Right Column: Frequency Counter & Spectral Plots */}
          {isFreqCounterOpen && (
            <div className="w-1/2 h-full overflow-hidden">
              <AnalysisPanel
                rois={rois}
                onToggleRoiVisibility={(roiId) =>
                  setRois((prev) =>
                    prev.map((r) =>
                      r.id === roiId ? { ...r, isShowInPlot: !r.isShowInPlot } : r
                    )
                  )
                }
                results={results}
                isResultsObsolete={isResultsObsolete}
                isComputing={isComputing}
                pyodideStatus={pyodideStatus}
                onCompute={handleCompute}
                currentTime={currentTime}
                minRange={minRange}
                maxRange={maxRange}
                onSeek={(t) => {
                  if (videoRef.current) videoRef.current.currentTime = t;
                  setCurrentTime(t);
                }}
                percentageOfResolution={percentageOfResolution}
                onChangePercentageOfResolution={(v) => {
                  setPercentageOfResolution(v);
                  if (results) setIsResultsObsolete(true);
                }}
                fftSegmentSize={fftSegmentSize}
                onChangeFftSegmentSize={(v) => {
                  setFftSegmentSize(v);
                  if (results) setIsResultsObsolete(true);
                }}
                fftStep={fftStep}
                onChangeFftStep={(v) => {
                  setFftStep(v);
                  if (results) setIsResultsObsolete(true);
                }}
                collectedPoints={collectedPoints}
                onAddCollectedPoint={(tab, hz) =>
                  setCollectedPoints((prev) => ({
                    ...prev,
                    [tab]: [...prev[tab], { id: `pt_${Date.now()}_${Math.random()}`, xHz: hz }],
                  }))
                }
                onDeleteCollectedPoint={(tab, id) =>
                  setCollectedPoints((prev) => ({
                    ...prev,
                    [tab]: prev[tab].filter((p) => p.id !== id),
                  }))
                }
                onDeleteAllCollectedPoints={(tab) =>
                  setCollectedPoints((prev) => ({ ...prev, [tab]: [] }))
                }
                coherenceBands={coherenceBands}
                onAddCoherenceBand={(minHz, maxHz) => {
                  if (!results?.Coherence?.X?.length) return;
                  const xs = results.Coherence.X;
                  const ys = results.Coherence.Y;
                  const vals: number[] = [];
                  for (let i = 0; i < xs.length; i++) {
                    if (xs[i] >= minHz && xs[i] <= maxHz) vals.push(ys[i]);
                  }
                  if (vals.length === 0) return;
                  const avg = vals.reduce((acc, v) => acc + v, 0) / vals.length;
                  setCoherenceBands((prev) => [
                    ...prev,
                    { id: `coh_${Date.now()}`, minHz, maxHz, average: avg },
                  ]);
                }}
                onDeleteCoherenceBand={(id) =>
                  setCoherenceBands((prev) => prev.filter((b) => b.id !== id))
                }
                onDeleteAllCoherenceBands={() => setCoherenceBands([])}
                onOpenSpectralInfo={() => setIsSpectralInfoOpen(true)}
                onExportComCsv={handleExportComCsv}
                onExportFreqCsv={handleExportFreqCsv}
                fps={videoMeta.fps}
              />
            </div>
          )}

          {/* Computation Progress Modal Overlay (matching LoadingContentUc.xaml) */}
          {isComputing && (
            <div className="absolute inset-0 z-40 bg-black/55 backdrop-blur-xs flex items-center justify-center">
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-80 shadow-2xl flex flex-col gap-3">
                <div className="text-center font-medium text-sky-400 text-sm">
                  Computing CoMX and CoMY values
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono w-14">{computeProgress.toFixed(1)}%</span>
                  <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${computeProgress}%` }}
                      className="h-full bg-sky-500 transition-all duration-150"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    abortRef.current.aborted = true;
                  }}
                  className="self-center px-4 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-200 border border-zinc-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      <SpectralInfoModal
        isOpen={isSpectralInfoOpen}
        onClose={() => setIsSpectralInfoOpen(false)}
      />
    </div>
  );
}

export default App;
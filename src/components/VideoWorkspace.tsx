import React, { useRef, useState } from 'react';
import { Play, Pause, Pencil, X } from 'lucide-react';
import { RoiRect, VideoMetadata } from '../types/treman';
import { formatSecondsToTime, getNextRoiColor } from '../utils/formatters';

interface VideoWorkspaceProps {
  videoMeta: VideoMetadata;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  rois: RoiRect[];
  onChangeRois: (updater: (prev: RoiRect[]) => RoiRect[]) => void;
  minRange: number;
  maxRange: number;
  currentTime: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (timeSec: number) => void;
  onChangeMinRange: (val: number) => void;
  onChangeMaxRange: (val: number) => void;
}

type DragMode =
  | { type: 'create'; startX: number; startY: number; roiId: string; moved: boolean }
  | { type: 'move'; roiId: string; startX: number; startY: number; origRect: RoiRect }
  | {
      type: 'resize';
      corner: 'lt' | 'rt' | 'rb' | 'lb';
      roiId: string;
      startX: number;
      startY: number;
      origRect: RoiRect;
    };

export const VideoWorkspace: React.FC<VideoWorkspaceProps> = ({
  videoMeta,
  videoRef,
  rois,
  onChangeRois,
  minRange,
  maxRange,
  currentTime,
  isPlaying,
  onTogglePlay,
  onSeek,
  onChangeMinRange,
  onChangeMaxRange,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [dragMode, setDragMode] = useState<DragMode | null>(null);
  const [editingRoiId, setEditingRoiId] = useState<string | null>(null);

  const clientToVideoCoords = (clientX: number, clientY: number) => {
    if (!overlayRef.current) return { x: 0, y: 0 };
    const rect = overlayRef.current.getBoundingClientRect();
    const relX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    return {
      x: relX * videoMeta.width,
      y: relY * videoMeta.height,
    };
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setEditingRoiId(null);

    const pt = clientToVideoCoords(e.clientX, e.clientY);
    const newId = `roi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const color = getNextRoiColor(rois);
    const newRoi: RoiRect = {
      id: newId,
      label: `ROI ${rois.length + 1}`,
      color,
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      width: 2,
      height: 2,
      isShowInPlot: true,
    };

    onChangeRois((prev) => [...prev, newRoi]);
    setDragMode({
      type: 'create',
      startX: pt.x,
      startY: pt.y,
      roiId: newId,
      moved: false,
    });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragMode) return;
    const pt = clientToVideoCoords(e.clientX, e.clientY);
    const minSize = Math.max(12, Math.round((videoMeta.height / 300) * 15));

    if (dragMode.type === 'create') {
      const x = Math.min(pt.x, dragMode.startX);
      const y = Math.min(pt.y, dragMode.startY);
      const w = Math.abs(pt.x - dragMode.startX);
      const h = Math.abs(pt.y - dragMode.startY);

      setDragMode({ ...dragMode, moved: w > 3 || h > 3 });
      onChangeRois((prev) =>
        prev.map((r) =>
          r.id === dragMode.roiId
            ? {
                ...r,
                x: Math.round(x),
                y: Math.round(y),
                width: Math.max(2, Math.round(w)),
                height: Math.max(2, Math.round(h)),
              }
            : r
        )
      );
    } else if (dragMode.type === 'move') {
      const dx = pt.x - dragMode.startX;
      const dy = pt.y - dragMode.startY;
      const nextX = Math.max(
        0,
        Math.min(videoMeta.width - dragMode.origRect.width, dragMode.origRect.x + dx)
      );
      const nextY = Math.max(
        0,
        Math.min(videoMeta.height - dragMode.origRect.height, dragMode.origRect.y + dy)
      );
      onChangeRois((prev) =>
        prev.map((r) =>
          r.id === dragMode.roiId ? { ...r, x: Math.round(nextX), y: Math.round(nextY) } : r
        )
      );
    } else if (dragMode.type === 'resize') {
      const { origRect, corner } = dragMode;
      const dx = pt.x - dragMode.startX;
      const dy = pt.y - dragMode.startY;

      let { x, y, width, height } = origRect;

      if (corner === 'lt' || corner === 'lb') {
        const newX = Math.max(0, Math.min(origRect.x + origRect.width - minSize, origRect.x + dx));
        width = origRect.width + (origRect.x - newX);
        x = newX;
      }
      if (corner === 'rt' || corner === 'rb') {
        width = Math.max(minSize, Math.min(videoMeta.width - origRect.x, origRect.width + dx));
      }
      if (corner === 'lt' || corner === 'rt') {
        const newY = Math.max(0, Math.min(origRect.y + origRect.height - minSize, origRect.y + dy));
        height = origRect.height + (origRect.y - newY);
        y = newY;
      }
      if (corner === 'lb' || corner === 'rb') {
        height = Math.max(minSize, Math.min(videoMeta.height - origRect.y, origRect.height + dy));
      }

      onChangeRois((prev) =>
        prev.map((r) =>
          r.id === dragMode.roiId
            ? {
                ...r,
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(width),
                height: Math.round(height),
              }
            : r
        )
      );
    }
  };

  const handlePointerUp = () => {
    if (!dragMode) return;
    if (dragMode.type === 'create' && !dragMode.moved) {
      // Exact behavior from SelectionRectangleViewModel.cs: single click creates a 40*ratio box
      const ratio = videoMeta.height / 300;
      const defaultBox = Math.max(24, Math.round(40 * ratio));
      onChangeRois((prev) =>
        prev.map((r) =>
          r.id === dragMode.roiId
            ? {
                ...r,
                width: Math.min(videoMeta.width - r.x, defaultBox),
                height: Math.min(videoMeta.height - r.y, defaultBox),
              }
            : r
        )
      );
    }
    setDragMode(null);
  };

  const duration = Math.max(0.1, videoMeta.duration);
  const minPct = (minRange / duration) * 100;
  const maxPct = (maxRange / duration) * 100;
  const curPct = (currentTime / duration) * 100;

  return (
    <div className="flex flex-col h-full bg-zinc-950 select-none">
      {/* Video Container with Aspect-Locked ROI Overlay */}
      <div className="flex-1 flex items-center justify-center p-3 overflow-hidden relative">
        <div
          className="relative max-h-full max-w-full shadow-2xl border border-zinc-800 bg-black"
          style={{ aspectRatio: `${videoMeta.width} / ${videoMeta.height}` }}
        >
          <video
            ref={videoRef}
            src={videoMeta.url}
            className="w-full h-full block object-contain pointer-events-none"
            playsInline
          />

          {/* Interactive ROI Drawing & Manipulation Canvas */}
          <div
            ref={overlayRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="absolute inset-0 cursor-crosshair"
          >
            {rois.map((roi) => {
              const leftPct = (roi.x / videoMeta.width) * 100;
              const topPct = (roi.y / videoMeta.height) * 100;
              const widthPct = (roi.width / videoMeta.width) * 100;
              const heightPct = (roi.height / videoMeta.height) * 100;

              return (
                <div
                  key={roi.id}
                  style={{
                    left: `${leftPct}%`,
                    top: `${topPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                    borderColor: roi.color,
                    backgroundColor: 'rgba(112, 255, 0, 0.12)',
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    overlayRef.current?.setPointerCapture(e.pointerId);
                    const pt = clientToVideoCoords(e.clientX, e.clientY);
                    setDragMode({
                      type: 'move',
                      roiId: roi.id,
                      startX: pt.x,
                      startY: pt.y,
                      origRect: { ...roi },
                    });
                  }}
                  className="absolute border-2 cursor-move group"
                >
                  {/* 4 Corner Resize Handles (matching SelectionRectangleUc.xaml) */}
                  {(['lt', 'rt', 'rb', 'lb'] as const).map((corner) => {
                    const posClass =
                      corner === 'lt'
                        ? 'top-0 left-0 cursor-nwse-resize'
                        : corner === 'rt'
                        ? 'top-0 right-0 cursor-nesw-resize'
                        : corner === 'rb'
                        ? 'bottom-0 right-0 cursor-nwse-resize'
                        : 'bottom-0 left-0 cursor-nesw-resize';
                    return (
                      <div
                        key={corner}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          overlayRef.current?.setPointerCapture(e.pointerId);
                          const pt = clientToVideoCoords(e.clientX, e.clientY);
                          setDragMode({
                            type: 'resize',
                            corner,
                            roiId: roi.id,
                            startX: pt.x,
                            startY: pt.y,
                            origRect: { ...roi },
                          });
                        }}
                        className={`absolute w-3.5 h-3.5 bg-purple-600/45 hover:bg-purple-500/80 ${posClass}`}
                      />
                    );
                  })}

                  {/* Top-Center Edit Coordinates Button */}
                  <button
                    type="button"
                    title="Edit exact ROI coordinates"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingRoiId(editingRoiId === roi.id ? null : roi.id);
                    }}
                    style={{ color: roi.color }}
                    className="absolute top-0.5 left-1/2 -translate-x-1/2 bg-zinc-900/85 hover:bg-zinc-800 p-1 rounded shadow"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>

                  {/* Bottom-Center Delete ROI Button */}
                  <button
                    type="button"
                    title="Delete ROI"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onChangeRois((prev) => prev.filter((item) => item.id !== roi.id));
                    }}
                    style={{ color: roi.color }}
                    className="absolute bottom-0.5 left-1/2 -translate-x-1/2 bg-zinc-900/85 hover:bg-zinc-800 p-1 rounded shadow"
                  >
                    <X className="w-3 h-3" />
                  </button>

                  {/* Exact Coordinate Editor Popover */}
                  {editingRoiId === roi.id && (
                    <div
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-1/2 top-7 -translate-x-1/2 z-30 bg-zinc-900 border border-zinc-700 rounded-md p-2 shadow-xl flex items-center gap-2 text-xs text-zinc-200"
                    >
                      {(
                        [
                          ['X', 'x', videoMeta.width - roi.width],
                          ['Y', 'y', videoMeta.height - roi.height],
                          ['W', 'width', videoMeta.width - roi.x],
                          ['H', 'height', videoMeta.height - roi.y],
                        ] as const
                      ).map(([lbl, key, maxVal]) => (
                        <label key={key} className="flex items-center gap-1">
                          <span className="text-zinc-400 font-semibold">{lbl}</span>
                          <input
                            type="number"
                            min={key === 'width' || key === 'height' ? 10 : 0}
                            max={maxVal}
                            value={roi[key]}
                            onChange={(e) => {
                              const val = Math.max(0, Math.min(maxVal, Number(e.target.value) || 0));
                              onChangeRois((prev) =>
                                prev.map((item) =>
                                  item.id === roi.id ? { ...item, [key]: val } : item
                                )
                              );
                            }}
                            className="w-14 bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 text-right"
                          />
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Transport & RangeSelectorWithValue Control Bar */}
      <div className="px-4 py-2.5 bg-zinc-900/90 border-t border-zinc-800 flex flex-col gap-2">
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={onTogglePlay}
            className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-100 transition"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-zinc-300 w-14 text-right">
            {formatSecondsToTime(currentTime)}
          </span>

          {/* Custom Dual-Thumb RangeSelectorWithValue equivalent */}
          <div className="relative flex-1 h-9 flex items-center">
            {/* Full Track */}
            <div className="w-full h-1 bg-zinc-700 rounded-full relative">
              {/* Active Selected Range Bar */}
              <div
                style={{ left: `${minPct}%`, width: `${Math.max(0, maxPct - minPct)}%` }}
                className="absolute top-0 bottom-0 bg-sky-500 rounded-full"
              />
            </div>

            {/* Playback Seek Input (Round Thumb) */}
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={currentTime}
              onChange={(e) => onSeek(parseFloat(e.target.value))}
              aria-label="Playback position"
              className="absolute inset-0 w-full opacity-0 cursor-pointer z-10"
            />
            {/* Visual Round Playback Thumb */}
            <div
              style={{ left: `${curPct}%` }}
              className="absolute -translate-x-1/2 -top-0.5 flex flex-col items-center pointer-events-none z-20"
            >
              <div className="w-4 h-4 rounded-full bg-sky-400 border-2 border-zinc-950 shadow" />
              <div className="w-0.5 h-2 bg-emerald-400" />
            </div>

            {/* Min Range Thumb */}
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={minRange}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (maxRange - v >= 1.0) onChangeMinRange(v);
              }}
              aria-label="Analysis start time"
              className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent z-30 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:cursor-ew-resize"
            />

            {/* Max Range Thumb */}
            <input
              type="range"
              min={0}
              max={duration}
              step={0.05}
              value={maxRange}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (v - minRange >= 1.0) onChangeMaxRange(v);
              }}
              aria-label="Analysis end time"
              className="pointer-events-none absolute inset-0 w-full appearance-none bg-transparent z-30 [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-6 [&::-webkit-slider-thumb]:rounded [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:cursor-ew-resize"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
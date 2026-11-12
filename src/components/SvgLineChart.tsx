import React, { useMemo, useRef, useState } from 'react';
import { CollectedPoint } from '../types/treman';

export interface ChartSeries {
  id: string;
  label: string;
  color: string;
  x: number[];
  y: number[];
  visible?: boolean;
}

interface SvgLineChartProps {
  series: ChartSeries[];
  height: number;
  xLabel?: string;
  yLabel?: string;
  emptyMessage?: string;
  /** Vertical playback cursor X coordinate (used on CoM X and CoM Y plots) */
  cursorX?: number;
  /** Vertical fuchsia frequency markers (used on PSD, Welch, Amp Spectrum) */
  collectedPoints?: CollectedPoint[];
  isCollectingPoints?: boolean;
  onCollectPoint?: (xVal: number) => void;
  /** Optional custom X-axis bounds (used for Coherence From/To Hz filter) */
  xMinOverride?: number;
  xMaxOverride?: number;
}

export const SvgLineChart: React.FC<SvgLineChartProps> = ({
  series,
  height,
  xLabel = '',
  yLabel = '',
  emptyMessage = 'No Data',
  cursorX,
  collectedPoints = [],
  isCollectingPoints = false,
  onCollectPoint,
  xMinOverride,
  xMaxOverride,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number; px: number; py: number } | null>(
    null
  );

  const visibleSeries = useMemo(
    () => series.filter((s) => s.visible !== false && s.x.length > 0 && s.y.length > 0),
    [series]
  );

  const bounds = useMemo(() => {
    if (visibleSeries.length === 0) return null;

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const s of visibleSeries) {
      for (let i = 0; i < s.x.length; i++) {
        const xv = s.x[i];
        const yv = s.y[i];
        if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
        // Skip 0 Hz DC bin on dB PSD plots (matches C# OxyPlot ignoring -Infinity)
        if (yLabel === 'Psd' && xv === 0) continue;
        if (xMinOverride !== undefined && xv < xMinOverride) continue;
        if (xMaxOverride !== undefined && xv > xMaxOverride) continue;
        if (xv < minX) minX = xv;
        if (xv > maxX) maxX = xv;
        if (yv < minY) minY = yv;
        if (yv > maxY) maxY = yv;
      }
    }

    if (xMinOverride !== undefined) minX = xMinOverride;
    if (xMaxOverride !== undefined) maxX = xMaxOverride;

    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
    if (maxX === minX) maxX = minX + 1;
    if (maxY === minY) {
      minY -= 1;
      maxY += 1;
    }

    const yPad = (maxY - minY) * 0.08;
    return {
      minX,
      maxX,
      minY: minY - yPad,
      maxY: maxY + yPad,
    };
  }, [visibleSeries, xMinOverride, xMaxOverride]);

  const width = 640;
  const padLeft = 48;
  const padRight = 14;
  const padTop = 10;
  const padBottom = 22;
  const plotW = width - padLeft - padRight;
  const plotH = Math.max(40, height - padTop - padBottom);

  const mapX = (x: number) =>
    bounds ? padLeft + ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * plotW : padLeft;

  const mapY = (y: number) =>
    bounds ? padTop + plotH - ((y - bounds.minY) / (bounds.maxY - bounds.minY)) * plotH : padTop;

  const unmapX = (px: number) => {
    if (!bounds) return 0;
    const ratio = Math.max(0, Math.min(1, (px - padLeft) / plotW));
    return bounds.minX + ratio * (bounds.maxX - bounds.minX);
  };

  const unmapY = (py: number) => {
    if (!bounds) return 0;
    const ratio = Math.max(0, Math.min(1, 1 - (py - padTop) / plotH));
    return bounds.minY + ratio * (bounds.maxY - bounds.minY);
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !bounds) return;
    const rect = svgRef.current.getBoundingClientRect();
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    if (px >= padLeft && px <= padLeft + plotW && py >= padTop && py <= padTop + plotH) {
      setHoverCoord({
        x: unmapX(px),
        y: unmapY(py),
        px,
        py,
      });
    } else {
      setHoverCoord(null);
    }
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isCollectingPoints || !onCollectPoint || !svgRef.current || !bounds) return;
    const rect = svgRef.current.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    if (px >= padLeft && px <= padLeft + plotW) {
      onCollectPoint(Number(unmapX(px).toFixed(3)));
    }
  };

  if (!bounds) {
    return (
      <div
        style={{ height }}
        className="w-full bg-white text-zinc-900 rounded border border-zinc-700 flex items-center justify-center font-semibold text-sm select-none"
      >
        {emptyMessage}
      </div>
    );
  }

  const xTicks = Array.from({ length: 6 }, (_, i) => bounds.minX + ((bounds.maxX - bounds.minX) * i) / 5);
  const yTicks = Array.from({ length: 4 }, (_, i) => bounds.minY + ((bounds.maxY - bounds.minY) * i) / 3);

  return (
    <div className="relative w-full bg-white rounded border border-zinc-700 overflow-hidden select-none">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        style={{ height }}
        className={`w-full block ${isCollectingPoints ? 'cursor-crosshair' : 'cursor-default'}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoverCoord(null)}
        onClick={handleClick}
      >
        {/* Horizontal gridlines & Y ticks */}
        {yTicks.map((yt, idx) => {
          const py = mapY(yt);
          return (
            <g key={`y-${idx}`}>
              <line
                x1={padLeft}
                y1={py}
                x2={padLeft + plotW}
                y2={py}
                stroke="#e4e4e7"
                strokeWidth="1"
              />
              <text
                x={padLeft - 5}
                y={py + 3}
                textAnchor="end"
                fontSize="10"
                fill="#52525b"
              >
                {Math.abs(yt) >= 100 || (Math.abs(yt) < 0.01 && yt !== 0)
                  ? yt.toExponential(1)
                  : yt.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Vertical gridlines & X ticks */}
        {xTicks.map((xt, idx) => {
          const px = mapX(xt);
          return (
            <g key={`x-${idx}`}>
              <line
                x1={px}
                y1={padTop}
                x2={px}
                y2={padTop + plotH}
                stroke="#e4e4e7"
                strokeWidth="1"
              />
              <text
                x={px}
                y={padTop + plotH + 14}
                textAnchor="middle"
                fontSize="10"
                fill="#52525b"
              >
                {xt.toFixed(1)}
              </text>
            </g>
          );
        })}

        {/* Plot border */}
        <rect
          x={padLeft}
          y={padTop}
          width={plotW}
          height={plotH}
          fill="none"
          stroke="#a1a1aa"
          strokeWidth="1"
        />

        {/* Clip region for data curves */}
        <defs>
          <clipPath id={`clip-${xLabel}-${yLabel}-${height}`}>
            <rect x={padLeft} y={padTop} width={plotW} height={plotH} />
          </clipPath>
        </defs>

        <g clipPath={`url(#clip-${xLabel}-${yLabel}-${height})`}>
          {/* Data polylines */}
          {visibleSeries.map((s) => {
            const pts: string[] = [];
            for (let i = 0; i < s.x.length; i++) {
              if (yLabel === 'Psd' && s.x[i] === 0) continue;
              if (xMinOverride !== undefined && s.x[i] < xMinOverride) continue;
              if (xMaxOverride !== undefined && s.x[i] > xMaxOverride) continue;
              pts.push(`${mapX(s.x[i]).toFixed(1)},${mapY(s.y[i]).toFixed(1)}`);
            }
            return (
              <polyline
                key={s.id}
                fill="none"
                stroke={s.color}
                strokeWidth="1.5"
                points={pts.join(' ')}
              />
            );
          })}

          {/* Collected Frequency Annotations (OxyColors.Fuchsia) */}
          {collectedPoints.map((pt) => {
            const px = mapX(pt.xHz);
            return (
              <line
                key={pt.id}
                x1={px}
                y1={padTop}
                x2={px}
                y2={padTop + plotH}
                stroke="#d946ef"
                strokeWidth="1.5"
                strokeDasharray="4 2"
              />
            );
          })}

          {/* Synchronized Video Playback Cursor (OxyColors.Black) */}
          {cursorX !== undefined && cursorX >= bounds.minX && cursorX <= bounds.maxX && (
            <line
              x1={mapX(cursorX)}
              y1={padTop}
              x2={mapX(cursorX)}
              y2={padTop + plotH}
              stroke="#09090b"
              strokeWidth="1.5"
            />
          )}
        </g>

        {/* Hover crosshair */}
        {hoverCoord && (
          <g>
            <line
              x1={hoverCoord.px}
              y1={padTop}
              x2={hoverCoord.px}
              y2={padTop + plotH}
              stroke="#71717a"
              strokeWidth="0.8"
              strokeDasharray="2 2"
            />
            <rect
              x={Math.min(width - 115, hoverCoord.px + 6)}
              y={Math.max(padTop + 2, hoverCoord.py - 22)}
              width="108"
              height="18"
              rx="3"
              fill="rgba(24,24,27,0.88)"
            />
            <text
              x={Math.min(width - 110, hoverCoord.px + 10)}
              y={Math.max(padTop + 14, hoverCoord.py - 10)}
              fontSize="10"
              fill="#f4f4f5"
            >
              {hoverCoord.x.toFixed(2)} | {hoverCoord.y.toFixed(2)}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
};
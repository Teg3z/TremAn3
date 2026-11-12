import React from 'react';
import { Trash2 } from 'lucide-react';
import { MeasurementRecord } from '../types/treman';

interface PastMeasurementsDrawerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  measurements: MeasurementRecord[];
  selectedId: string | null;
  onSelect: (rec: MeasurementRecord) => void;
  onDelete: (id: string) => void;
  onDeleteAll: () => void;
}

export const PastMeasurementsDrawer: React.FC<PastMeasurementsDrawerProps> = ({
  isOpen,
  onToggleOpen,
  measurements,
  selectedId,
  onSelect,
  onDelete,
  onDeleteAll,
}) => {
  return (
    <div className="bg-zinc-900 border-t border-zinc-800 px-3 py-1.5 flex flex-col">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onToggleOpen}
          className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200"
        >
          {isOpen ? 'Hide' : `Show measurements (${measurements.length})`}
        </button>

        {isOpen && measurements.length > 0 && (
          <button
            type="button"
            onClick={onDeleteAll}
            className="px-2.5 py-1 rounded hover:bg-zinc-800 text-xs text-red-400 flex items-center gap-1"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete all
          </button>
        )}
      </div>

      {isOpen && (
        <div className="mt-2 max-h-40 overflow-y-auto divide-y divide-zinc-800 border border-zinc-800 rounded bg-zinc-950">
          {measurements.length === 0 ? (
            <div className="p-3 text-xs text-zinc-500 text-center">
              No measurements recorded in this session yet.
            </div>
          ) : (
            measurements.map((m) => (
              <div
                key={m.id}
                onClick={() => onSelect(m)}
                className={`px-3 py-2 flex items-center justify-between cursor-pointer text-xs ${
                  selectedId === m.id ? 'bg-sky-950/60 text-sky-200' : 'hover:bg-zinc-900 text-zinc-300'
                }`}
              >
                <div>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-[11px] text-zinc-500">
                    {m.videoName} • {m.rois.length} ROI(s) • {m.percentageOfResolution}% res
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(m.id);
                  }}
                  className="p-1 text-zinc-400 hover:text-red-400"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
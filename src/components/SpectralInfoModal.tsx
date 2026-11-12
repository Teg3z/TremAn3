import React from 'react';
import { X } from 'lucide-react';

interface SpectralInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SpectralInfoModal: React.FC<SpectralInfoModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-900 border border-zinc-700 rounded-lg max-w-xl w-full max-h-[85vh] overflow-y-auto p-5 shadow-2xl text-sm text-zinc-200 flex flex-col gap-4"
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
          <h2 className="text-base font-semibold text-white">Spectral Analysis Info</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <h3 className="font-semibold text-sky-400">PSD — Power Spectral Density</h3>
          <p className="text-xs text-zinc-300 mt-1">
            Matches MATLAB <code>periodogram(x, rectwin(length(x)), length(x), Fs)</code>. X-axis:
            Frequency (0 to Fs/2 Hz). Y-axis: Power/Frequency (dB/Hz), averaged across X and Y.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-sky-400">Welch — Welch’s Power Spectral Density</h3>
          <p className="text-xs text-zinc-300 mt-1">
            Window length of 256 samples with overlap 255 (step 1) and Hamming window. X-axis:
            Frequency (Hz). Y-axis: squared pixels/Hz (linear).
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-sky-400">AmpSpec — Amplitude Spectrum</h3>
          <p className="text-xs text-zinc-300 mt-1">
            Single-sided magnitude spectrum <code>abs(fft(x))</code> from the whole selected
            segment without windowing or averaging.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-sky-400">Coherence — Magnitude-Squared Coherence</h3>
          <p className="text-xs text-zinc-300 mt-1">
            Requires two ROIs. Evaluates C<sub>xy</sub>(f) = |P<sub>xy</sub>(f)|² / (P
            <sub>xx</sub>(f) · P<sub>yy</sub>(f)) with window 256 and overlap 255, returning
            values between 0 and 1.
          </p>
        </div>

        <div className="flex justify-end pt-2 border-t border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-white font-medium text-xs"
          >
            Ok
          </button>
        </div>
      </div>
    </div>
  );
};
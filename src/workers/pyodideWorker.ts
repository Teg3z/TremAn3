/// <reference lib="webworker" />

import { ExtractedRoiFrames } from '../utils/frameExtractor';

interface WorkerInitMessage {
  type: 'INIT';
}

interface WorkerComputeMessage {
  type: 'COMPUTE';
  requestId: string;
  payload: {
    roisFrames: ExtractedRoiFrames[];
    fps: number;
    startTimeS: number;
    freqProgressSegmentSize: number;
    freqProgressStep: number;
  };
}

type IncomingMessage = WorkerInitMessage | WorkerComputeMessage;

let pyodideInstance: any = null;
let initPromise: Promise<void> | null = null;

async function ensurePyodideReady(): Promise<void> {
  if (pyodideInstance) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    self.postMessage({
      type: 'STATUS',
      status: 'loading_pyodide',
      message: 'Loading Pyodide WebAssembly runtime...',
    });

    // Load Pyodide dynamically from official jsDelivr CDN
    const pyodideModule = await import(
      /* @vite-ignore */ 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.mjs'
    );
    const pyodide = await pyodideModule.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
    });

    self.postMessage({
      type: 'STATUS',
      status: 'loading_packages',
      message: 'Installing NumPy & SciPy in browser memory...',
    });
    await pyodide.loadPackage(['numpy', 'scipy']);

    self.postMessage({
      type: 'STATUS',
      status: 'loading_core',
      message: 'Loading treman_core.py computational module...',
    });
    const response = await fetch('/treman_core.py');
    if (!response.ok) {
      throw new Error(`Failed to fetch /treman_core.py (${response.status})`);
    }
    const pythonCode = await response.text();
    pyodide.FS.writeFile('treman_core.py', pythonCode);
    await pyodide.runPythonAsync('import treman_core');

    pyodideInstance = pyodide;
    self.postMessage({
      type: 'STATUS',
      status: 'ready',
      message: 'Python computational engine ready.',
    });
  })();

  return initPromise;
}

self.onmessage = async (event: MessageEvent<IncomingMessage>) => {
  const msg = event.data;

  try {
    if (msg.type === 'INIT') {
      await ensurePyodideReady();
      return;
    }

    if (msg.type === 'COMPUTE') {
      await ensurePyodideReady();

      const {
        roisFrames,
        fps,
        startTimeS,
        freqProgressSegmentSize,
        freqProgressStep,
      } = msg.payload;

      // Transfer flat Uint8Arrays into NumPy 3D arrays (N, H, W) inside Python
      const pyRoisList = pyodideInstance.toPy([]);

      for (const item of roisFrames) {
        const pyBuf = pyodideInstance.toPy(item.grayBuffer);
        pyodideInstance.globals.set('_tmp_buf', pyBuf);
        pyodideInstance.globals.set('_tmp_n', item.frameCount);
        pyodideInstance.globals.set('_tmp_h', item.height);
        pyodideInstance.globals.set('_tmp_w', item.width);
        pyodideInstance.globals.set('_tmp_id', item.roi_id);
        pyodideInstance.globals.set('_tmp_label', item.label);
        pyodideInstance.globals.set('_tmp_color', item.color);

        await pyodideInstance.runPythonAsync(`
import numpy as np
_arr_3d = np.frombuffer(_tmp_buf, dtype=np.uint8).reshape((_tmp_n, _tmp_h, _tmp_w)).copy()
_roi_dict = {
    "roi_id": _tmp_id,
    "label": _tmp_label,
    "color": _tmp_color,
    "frames": _arr_3d
}
`);
        const roiDict = pyodideInstance.globals.get('_roi_dict');
        pyRoisList.append(roiDict);
        if (pyBuf && typeof pyBuf.destroy === 'function') {
          pyBuf.destroy();
        }
      }

      pyodideInstance.globals.set('_rois_payload', pyRoisList);
      pyodideInstance.globals.set('_fps', fps);
      pyodideInstance.globals.set('_start_time_s', startTimeS);
      pyodideInstance.globals.set('_seg_size', freqProgressSegmentSize);
      pyodideInstance.globals.set('_step', freqProgressStep);

      const jsonResultStr: string = await pyodideInstance.runPythonAsync(`
import json
import treman_core

_res = treman_core.analyze_rois_for_react(
    rois_frames=_rois_payload,
    fps=float(_fps),
    start_time_s=float(_start_time_s),
    freq_progress_segment_size=int(_seg_size),
    freq_progress_step=int(_step)
)
json.dumps(_res)
`);

      pyRoisList.destroy();

      self.postMessage({
        type: 'RESULT',
        requestId: msg.requestId,
        result: JSON.parse(jsonResultStr),
      });
    }
  } catch (err: any) {
    self.postMessage({
      type: 'ERROR',
      requestId: msg.type === 'COMPUTE' ? msg.requestId : undefined,
      error: err?.message || String(err),
    });
  }
};
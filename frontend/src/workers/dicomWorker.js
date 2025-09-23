// src/workers/dicomWorker.js
self.importScripts('https://unpkg.com/itk-wasm@1.0.0-b.9/dist/itk-wasm.min.js');
self.onmessage = async (e) => {
  const result = await itk.readImageDICOMFileSeries(e.data);
  self.postMessage(result);
};
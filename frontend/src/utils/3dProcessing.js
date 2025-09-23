import * as itk from 'itk-wasm';

export async function create3DVolume(dicomFiles) {
  const series = await Promise.all(dicomFiles.map(file => itk.readImageDICOMFileSeries(file)));
  const volume = itk.imageToVolume(series);
  const mesh = itk.marchingCubes(volume, { threshold: 100 });
  return mesh;
}
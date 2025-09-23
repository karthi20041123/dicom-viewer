import * as cornerstone from 'cornerstone-core';
import cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import * as dicomParser from 'dicom-parser';

cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
cornerstoneWADOImageLoader.configure({
  useWebWorkers: true, // Enable Web Workers for performance (optional, requires worker setup)
});

export async function loadDicomFile(file) {
  try {
    if (!file) throw new Error('No file provided');
    const imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
    const image = await cornerstone.loadAndCacheImage(imageId);
    return image;
  } catch (error) {
    console.error('Failed to load DICOM image:', error);
    throw error;
  }
}
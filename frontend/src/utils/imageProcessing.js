// src/utils/imageProcessing.js
import cv from 'opencv.js';

export function adjustContrast(imageData) {
  const src = cv.matFromImageData(imageData);
  const dst = new cv.Mat();
  cv.convertScaleAbs(src, dst, 1.5, 0); // Adjust contrast
  return dst;
}
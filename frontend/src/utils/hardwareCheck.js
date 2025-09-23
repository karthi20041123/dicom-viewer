// src/utils/hardwareCheck.js
export function isHighEndDevice() {
  return navigator.hardwareConcurrency > 4; // Example threshold
}
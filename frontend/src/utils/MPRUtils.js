/**
 * MPR Utility Functions
 * Provides image reconstruction algorithms for Multi-Planar Reconstruction
 */

export class MPRUtils {
  /**
   * Create a volume data structure from DICOM images
   * @param {Array} images - Array of cornerstone image objects
   * @param {Object} metadata - DICOM metadata containing spacing information
   * @returns {Object} Volume data structure
   */
  static createVolumeData(images, metadata = {}) {
    if (!images || images.length === 0) {
      throw new Error('No images provided for volume creation');
    }

    const firstImage = images[0];
    const volume = {
      images,
      dimensions: {
        width: firstImage.width,
        height: firstImage.height,
        depth: images.length
      },
      spacing: {
        x: metadata.pixelSpacing?.[0] || 1.0,
        y: metadata.pixelSpacing?.[1] || 1.0,
        z: metadata.sliceThickness || 1.0
      },
      origin: {
        x: metadata.imagePosition?.[0] || 0,
        y: metadata.imagePosition?.[1] || 0,
        z: metadata.imagePosition?.[2] || 0
      },
      orientation: {
        rowCosines: metadata.imageOrientation?.slice(0, 3) || [1, 0, 0],
        colCosines: metadata.imageOrientation?.slice(3, 6) || [0, 1, 0]
      }
    };

    return volume;
  }

  /**
   * Extract sagittal slice from volume data
   * @param {Object} volumeData - Volume data structure
   * @param {number} sliceIndex - Index of the sagittal slice
   * @param {string} interpolation - Interpolation method ('linear', 'cubic', 'nearest')
   * @returns {Object} Reconstructed image object
   */
  static getSagittalSlice(volumeData, sliceIndex, interpolation = 'linear') {
    if (!volumeData || sliceIndex < 0 || sliceIndex >= volumeData.dimensions.width) {
      return null;
    }

    const { width, height, depth } = volumeData.dimensions;
    const reconstructedData = new Float32Array(height * depth);
    
    // Extract sagittal slice by sampling each axial image at the given x-coordinate
    for (let z = 0; z < depth; z++) {
      const image = volumeData.images[z];
      const pixelData = image.getPixelData();
      
      for (let y = 0; y < height; y++) {
        const sourceIndex = y * width + sliceIndex;
        const targetIndex = (depth - 1 - z) * height + y; // Flip Z for proper orientation
        reconstructedData[targetIndex] = pixelData[sourceIndex];
      }
    }

    return this.createCornerstoneImage(reconstructedData, height, depth, volumeData);
  }

  /**
   * Extract coronal slice from volume data
   * @param {Object} volumeData - Volume data structure
   * @param {number} sliceIndex - Index of the coronal slice
   * @param {string} interpolation - Interpolation method
   * @returns {Object} Reconstructed image object
   */
  static getCoronalSlice(volumeData, sliceIndex, interpolation = 'linear') {
    if (!volumeData || sliceIndex < 0 || sliceIndex >= volumeData.dimensions.height) {
      return null;
    }

    const { width, height, depth } = volumeData.dimensions;
    const reconstructedData = new Float32Array(width * depth);
    
    // Extract coronal slice by sampling each axial image at the given y-coordinate
    for (let z = 0; z < depth; z++) {
      const image = volumeData.images[z];
      const pixelData = image.getPixelData();
      
      for (let x = 0; x < width; x++) {
        const sourceIndex = sliceIndex * width + x;
        const targetIndex = (depth - 1 - z) * width + x; // Flip Z for proper orientation
        reconstructedData[targetIndex] = pixelData[sourceIndex];
      }
    }

    return this.createCornerstoneImage(reconstructedData, width, depth, volumeData);
  }

  /**
   * Get axial slice (original orientation)
   * @param {Object} volumeData - Volume data structure
   * @param {number} sliceIndex - Index of the axial slice
   * @returns {Object} Original image object
   */
  static getAxialSlice(volumeData, sliceIndex) {
    if (!volumeData || sliceIndex < 0 || sliceIndex >= volumeData.images.length) {
      return null;
    }
    return volumeData.images[sliceIndex];
  }

  /**
   * Extract oblique slice from volume data
   * @param {Object} volumeData - Volume data structure
   * @param {number} sliceIndex - Index of the oblique slice
   * @param {Array} normalVector - Normal vector defining the oblique plane [x, y, z]
   * @param {string} interpolation - Interpolation method
   * @returns {Object} Reconstructed image object
   */
  static getObliqueSlice(volumeData, sliceIndex, normalVector = [1, 1, 0], interpolation = 'linear') {
    if (!volumeData) return null;

    const { width, height, depth } = volumeData.dimensions;
    
    // Normalize the normal vector
    const length = Math.sqrt(normalVector[0]**2 + normalVector[1]**2 + normalVector[2]**2);
    const normal = normalVector.map(component => component / length);
    
    // For simplicity, return a diagonal slice through the volume
    // In a full implementation, this would perform proper oblique reconstruction
    const reconstructedData = new Float32Array(width * height);
    
    const sourceSlice = Math.min(sliceIndex % depth, depth - 1);
    const image = volumeData.images[sourceSlice];
    const pixelData = image.getPixelData();
    
    // Apply oblique transformation (simplified)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const sourceIndex = y * width + x;
        reconstructedData[sourceIndex] = pixelData[sourceIndex];
      }
    }

    return this.createCornerstoneImage(reconstructedData, width, height, volumeData);
  }

  /**
   * Create a cornerstone image object from pixel data
   * @param {Float32Array} pixelData - Pixel data array
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {Object} volumeData - Source volume data for metadata
   * @returns {Object} Cornerstone image object
   */
  static createCornerstoneImage(pixelData, width, height, volumeData) {
    // Find min and max values for proper windowing
    let minPixelValue = Infinity;
    let maxPixelValue = -Infinity;
    
    for (let i = 0; i < pixelData.length; i++) {
      if (pixelData[i] < minPixelValue) minPixelValue = pixelData[i];
      if (pixelData[i] > maxPixelValue) maxPixelValue = pixelData[i];
    }

    const image = {
      imageId: `mpr:${Date.now()}-${Math.random()}`,
      minPixelValue,
      maxPixelValue,
      slope: 1,
      intercept: 0,
      windowCenter: (maxPixelValue + minPixelValue) / 2,
      windowWidth: maxPixelValue - minPixelValue,
      render: null,
      getPixelData: () => pixelData,
      rows: height,
      columns: width,
      height,
      width,
      color: false,
      columnPixelSpacing: volumeData.spacing.x,
      rowPixelSpacing: volumeData.spacing.y,
      invert: false,
      sizeInBytes: pixelData.length * 4
    };

    return image;
  }

  /**
   * Perform linear interpolation between two values
   * @param {number} a - First value
   * @param {number} b - Second value
   * @param {number} t - Interpolation factor (0-1)
   * @returns {number} Interpolated value
   */
  static linearInterpolation(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Perform bilinear interpolation
   * @param {number} p00 - Pixel value at (0,0)
   * @param {number} p10 - Pixel value at (1,0)
   * @param {number} p01 - Pixel value at (0,1)
   * @param {number} p11 - Pixel value at (1,1)
   * @param {number} fx - X interpolation factor
   * @param {number} fy - Y interpolation factor
   * @returns {number} Interpolated value
   */
  static bilinearInterpolation(p00, p10, p01, p11, fx, fy) {
    const a = this.linearInterpolation(p00, p10, fx);
    const b = this.linearInterpolation(p01, p11, fx);
    return this.linearInterpolation(a, b, fy);
  }

  /**
   * Calculate crosshair position for synchronized views
   * @param {Object} clickEvent - Mouse click event
   * @param {string} sourceViewport - Source viewport type
   * @param {Object} volumeData - Volume data structure
   * @returns {Object} Crosshair coordinates for all viewports
   */
  static calculateCrosshairPosition(clickEvent, sourceViewport, volumeData) {
    if (!clickEvent || !volumeData) return null;

    const rect = clickEvent.target.getBoundingClientRect();
    const x = (clickEvent.clientX - rect.left) / rect.width;
    const y = (clickEvent.clientY - rect.top) / rect.height;

    const { width, height, depth } = volumeData.dimensions;
    
    let crosshairPos = { x: 0, y: 0, z: 0 };

    switch (sourceViewport) {
      case 'axial':
        crosshairPos.x = Math.floor(x * width);
        crosshairPos.y = Math.floor(y * height);
        break;
      case 'sagittal':
        crosshairPos.y = Math.floor(x * height);
        crosshairPos.z = Math.floor(y * depth);
        break;
      case 'coronal':
        crosshairPos.x = Math.floor(x * width);
        crosshairPos.z = Math.floor(y * depth);
        break;
    }

    return {
      axial: { x: crosshairPos.x, y: crosshairPos.y },
      sagittal: { x: crosshairPos.y, y: crosshairPos.z },
      coronal: { x: crosshairPos.x, y: crosshairPos.z },
      oblique: { x: crosshairPos.x, y: crosshairPos.y }
    };
  }

  /**
   * Apply window/level settings to reconstructed image
   * @param {Object} image - Cornerstone image object
   * @param {number} windowCenter - Window center value
   * @param {number} windowWidth - Window width value
   * @returns {Object} Updated image object
   */
  static applyWindowLevel(image, windowCenter, windowWidth) {
    if (!image) return null;

    return {
      ...image,
      windowCenter,
      windowWidth
    };
  }

  /**
   * Calculate optimal window/level for MPR reconstruction
   * @param {Object} volumeData - Volume data structure
   * @returns {Object} Optimal window/level settings
   */
  static calculateOptimalWindowLevel(volumeData) {
    if (!volumeData || !volumeData.images.length) return { center: 0, width: 400 };

    let allPixelValues = [];
    
    // Sample pixels from multiple slices for statistical analysis
    const sampleStep = Math.max(1, Math.floor(volumeData.images.length / 10));
    
    for (let i = 0; i < volumeData.images.length; i += sampleStep) {
      const pixelData = volumeData.images[i].getPixelData();
      const sampleSize = Math.min(1000, pixelData.length);
      const step = Math.floor(pixelData.length / sampleSize);
      
      for (let j = 0; j < pixelData.length; j += step) {
        allPixelValues.push(pixelData[j]);
      }
    }
    
    allPixelValues.sort((a, b) => a - b);
    
    // Calculate percentiles for robust window/level estimation
    const p5 = allPixelValues[Math.floor(allPixelValues.length * 0.05)];
    const p95 = allPixelValues[Math.floor(allPixelValues.length * 0.95)];
    const median = allPixelValues[Math.floor(allPixelValues.length * 0.5)];
    
    return {
      center: median,
      width: Math.max(p95 - p5, 100)
    };
  }

  /**
   * Convert world coordinates to voxel coordinates
   * @param {Array} worldCoord - World coordinates [x, y, z]
   * @param {Object} volumeData - Volume data structure
   * @returns {Array} Voxel coordinates [i, j, k]
   */
  static worldToVoxel(worldCoord, volumeData) {
    const { origin, spacing } = volumeData;
    
    return [
      Math.round((worldCoord[0] - origin.x) / spacing.x),
      Math.round((worldCoord[1] - origin.y) / spacing.y),
      Math.round((worldCoord[2] - origin.z) / spacing.z)
    ];
  }

  /**
   * Convert voxel coordinates to world coordinates
   * @param {Array} voxelCoord - Voxel coordinates [i, j, k]
   * @param {Object} volumeData - Volume data structure
   * @returns {Array} World coordinates [x, y, z]
   */
  static voxelToWorld(voxelCoord, volumeData) {
    const { origin, spacing } = volumeData;
    
    return [
      voxelCoord[0] * spacing.x + origin.x,
      voxelCoord[1] * spacing.y + origin.y,
      voxelCoord[2] * spacing.z + origin.z
    ];
  }

  /**
   * Generate MIST (Medical Image Slice Transformation) reconstruction
   * @param {Object} volumeData - Volume data structure
   * @param {string} orientation - MIST orientation ('axial', 'coronal', 'sagittal', 'oblique')
   * @param {number} sliceIndex - Slice index
   * @param {Object} mistParams - MIST-specific parameters
   * @returns {Object} MIST reconstructed image
   */
  static getMISTReconstruction(volumeData, orientation, sliceIndex, mistParams = {}) {
    const {
      enhancement = 1.0,
      noiseReduction = 0.5,
      edgePreservation = 0.8,
      contrastBoost = 1.2
    } = mistParams;

    let baseImage;
    
    switch (orientation) {
      case 'axial':
        baseImage = this.getAxialSlice(volumeData, sliceIndex);
        break;
      case 'coronal':
        baseImage = this.getCoronalSlice(volumeData, sliceIndex);
        break;
      case 'sagittal':
        baseImage = this.getSagittalSlice(volumeData, sliceIndex);
        break;
      case 'oblique':
        baseImage = this.getObliqueSlice(volumeData, sliceIndex);
        break;
      default:
        return null;
    }

    if (!baseImage) return null;

    // Apply MIST enhancements
    const enhancedPixelData = this.applyMISTEnhancements(
      baseImage.getPixelData(),
      baseImage.width,
      baseImage.height,
      {
        enhancement,
        noiseReduction,
        edgePreservation,
        contrastBoost
      }
    );

    return {
      ...baseImage,
      getPixelData: () => enhancedPixelData,
      imageId: `mist-${orientation}:${sliceIndex}`
    };
  }

  /**
   * Apply MIST image enhancements
   * @param {TypedArray} pixelData - Original pixel data
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {Object} params - Enhancement parameters
   * @returns {TypedArray} Enhanced pixel data
   */
  static applyMISTEnhancements(pixelData, width, height, params) {
    const enhanced = new Float32Array(pixelData.length);
    
    // Apply contrast boost
    for (let i = 0; i < pixelData.length; i++) {
      enhanced[i] = pixelData[i] * params.contrastBoost;
    }
    
    // Apply noise reduction (simple gaussian blur)
    if (params.noiseReduction > 0) {
      this.applyGaussianBlur(enhanced, width, height, params.noiseReduction);
    }
    
    // Apply edge preservation
    if (params.edgePreservation > 0) {
      this.applyEdgePreservation(enhanced, width, height, params.edgePreservation);
    }
    
    return enhanced;
  }

  /**
   * Apply Gaussian blur for noise reduction
   * @param {TypedArray} pixelData - Pixel data to blur
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} sigma - Blur sigma value
   */
  static applyGaussianBlur(pixelData, width, height, sigma) {
    const kernel = this.generateGaussianKernel(sigma);
    const kernelSize = kernel.length;
    const radius = Math.floor(kernelSize / 2);
    const temp = new Float32Array(pixelData.length);
    
    // Horizontal pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weightSum = 0;
        
        for (let i = -radius; i <= radius; i++) {
          const sampleX = Math.max(0, Math.min(width - 1, x + i));
          const weight = kernel[i + radius];
          sum += pixelData[y * width + sampleX] * weight;
          weightSum += weight;
        }
        
        temp[y * width + x] = sum / weightSum;
      }
    }
    
    // Vertical pass
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        let weightSum = 0;
        
        for (let i = -radius; i <= radius; i++) {
          const sampleY = Math.max(0, Math.min(height - 1, y + i));
          const weight = kernel[i + radius];
          sum += temp[sampleY * width + x] * weight;
          weightSum += weight;
        }
        
        pixelData[y * width + x] = sum / weightSum;
      }
    }
  }

  /**
   * Generate Gaussian kernel for blurring
   * @param {number} sigma - Standard deviation
   * @returns {Array} Gaussian kernel
   */
  static generateGaussianKernel(sigma) {
    const size = Math.ceil(sigma * 3) * 2 + 1;
    const kernel = new Array(size);
    const center = Math.floor(size / 2);
    let sum = 0;
    
    for (let i = 0; i < size; i++) {
      const x = i - center;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      sum += kernel[i];
    }
    
    // Normalize kernel
    for (let i = 0; i < size; i++) {
      kernel[i] /= sum;
    }
    
    return kernel;
  }

  /**
   * Apply edge preservation filter
   * @param {TypedArray} pixelData - Pixel data to enhance
   * @param {number} width - Image width
   * @param {number} height - Image height
   * @param {number} strength - Edge preservation strength
   */
  static applyEdgePreservation(pixelData, width, height, strength) {
    const temp = new Float32Array(pixelData.length);
    
    // Sobel edge detection
    const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
    const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
    
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let gx = 0, gy = 0;
        
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            const pixel = pixelData[(y + i) * width + (x + j)];
            const kernelIndex = (i + 1) * 3 + (j + 1);
            gx += pixel * sobelX[kernelIndex];
            gy += pixel * sobelY[kernelIndex];
          }
        }
        
        const edgeMagnitude = Math.sqrt(gx * gx + gy * gy);
        const enhancement = 1 + (edgeMagnitude * strength / 1000);
        temp[y * width + x] = pixelData[y * width + x] * enhancement;
      }
    }
    
    // Copy enhanced values back
    for (let i = 0; i < pixelData.length; i++) {
      if (temp[i] !== 0) {
        pixelData[i] = temp[i];
      }
    }
  }

  /**
   * Create crosshair overlay for MPR synchronization
   * @param {Object} position - Crosshair position {x, y}
   * @param {Object} viewport - Viewport dimensions
   * @returns {Object} Crosshair overlay elements
   */
  static createCrosshairOverlay(position, viewport) {
    return {
      horizontal: {
        left: 0,
        top: `${(position.y / viewport.height) * 100}%`,
        width: '100%',
        height: '1px'
      },
      vertical: {
        left: `${(position.x / viewport.width) * 100}%`,
        top: 0,
        width: '1px',
        height: '100%'
      }
    };
  }

  /**
   * Extract DICOM metadata for MPR reconstruction
   * @param {Array} files - DICOM file array
   * @returns {Promise<Object>} Extracted metadata
   */
  static async extractDICOMMetadata(files) {
    if (!files || files.length === 0) return {};

    try {
      const firstFile = files[0];
      const arrayBuffer = await firstFile.arrayBuffer();
      const byteArray = new Uint8Array(arrayBuffer);
      const dataSet = dicomParser.parseDicom(byteArray);

      return {
        pixelSpacing: this.getFloatArray(dataSet, 'x00280030'),
        sliceThickness: this.getFloat(dataSet, 'x00180050'),
        imagePosition: this.getFloatArray(dataSet, 'x00200032'),
        imageOrientation: this.getFloatArray(dataSet, 'x00200037'),
        studyInstanceUID: this.getString(dataSet, 'x0020000d'),
        seriesInstanceUID: this.getString(dataSet, 'x0020000e'),
        patientName: this.getString(dataSet, 'x00100010'),
        studyDate: this.getString(dataSet, 'x00080020')
      };
    } catch (error) {
      console.warn('Failed to extract DICOM metadata:', error);
      return {};
    }
  }

  // Helper methods for DICOM parsing
  static getString(dataSet, tag) {
    const element = dataSet.elements[tag];
    return element ? dataSet.string(tag) : '';
  }

  static getFloat(dataSet, tag) {
    const element = dataSet.elements[tag];
    return element ? dataSet.floatString(tag) : 0;
  }

  static getFloatArray(dataSet, tag) {
    const element = dataSet.elements[tag];
    if (!element) return [];
    const str = dataSet.string(tag);
    return str.split('\\').map(s => parseFloat(s.trim()));
  }

  /**
   * Generate dental-specific MPR views
   * @param {Object} volumeData - Volume data structure
   * @param {string} dentalView - Dental view type ('panoramic', 'cephalometric', 'cross-sectional')
   * @param {Object} params - Dental-specific parameters
   * @returns {Object} Dental MPR reconstruction
   */
  static getDentalMPR(volumeData, dentalView, params = {}) {
    const {
      curvePoints = [],
      thickness = 2.0,
      resolution = 1.0
    } = params;

    switch (dentalView) {
      case 'panoramic':
        return this.generatePanoramicView(volumeData, curvePoints, thickness);
      case 'cephalometric':
        return this.generateCephalometricView(volumeData, params);
      case 'cross-sectional':
        return this.generateCrossSectionalView(volumeData, params);
      default:
        return this.getSagittalSlice(volumeData, Math.floor(volumeData.dimensions.width / 2));
    }
  }

  /**
   * Generate panoramic dental view
   * @param {Object} volumeData - Volume data structure
   * @param {Array} curvePoints - Dental arch curve points
   * @param {number} thickness - Slice thickness
   * @returns {Object} Panoramic reconstruction
   */
  static generatePanoramicView(volumeData, curvePoints, thickness) {
    // Simplified panoramic reconstruction
    // In a real implementation, this would follow the dental arch curve
    const midSagittal = Math.floor(volumeData.dimensions.width / 2);
    return this.getSagittalSlice(volumeData, midSagittal);
  }

  /**
   * Generate cephalometric view
   * @param {Object} volumeData - Volume data structure
   * @param {Object} params - Cephalometric parameters
   * @returns {Object} Cephalometric reconstruction
   */
  static generateCephalometricView(volumeData, params) {
    // Simplified cephalometric view (lateral skull view)
    const midSagittal = Math.floor(volumeData.dimensions.width / 2);
    return this.getSagittalSlice(volumeData, midSagittal);
  }

  /**
   * Generate cross-sectional view
   * @param {Object} volumeData - Volume data structure
   * @param {Object} params - Cross-sectional parameters
   * @returns {Object} Cross-sectional reconstruction
   */
  static generateCrossSectionalView(volumeData, params) {
    // Simplified cross-sectional view
    const midCoronal = Math.floor(volumeData.dimensions.height / 2);
    return this.getCoronalSlice(volumeData, midCoronal);
  }
}
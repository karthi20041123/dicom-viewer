import React, { useEffect, useRef } from "react";
import * as cornerstone from "cornerstone-core";
import vtkImageData from "@kitware/vtk.js/Common/DataModel/ImageData";
import vtkImageReslice from "@kitware/vtk.js/Imaging/Core/ImageReslice";
import vtkMatrixBuilder from "@kitware/vtk.js/Common/Core/MatrixBuilder";
import vtkDataArray from "@kitware/vtk.js/Common/Core/DataArray";

const MultiplanarReconstruction = ({
  viewerRef,
  viewerRefs,
  files,
  imageIds,
  isElementEnabled,
  isImageLoaded,
  mprMode,
  onClose,
  disabled,
  currentIndex,
  brightness,
  contrast,
  layout,
  pixelSpacing,
  sliceThickness,
}) => {
  const mprDataRef = useRef({
    volume: null,
    axialImages: [],
    coronalImages: [],
    sagittalImages: [],
  });

  // Helper function to validate and clamp viewport values
  const validateViewport = (center, width) => {
    const clampedCenter = Math.max(-1000, Math.min(1000, center || 0));
    const clampedWidth = Math.max(1, Math.min(2000, width || 1));
    return { windowCenter: clampedCenter, windowWidth: clampedWidth };
  };

  // Function to create Cornerstone image from VTK slice
  const createCornerstoneImageFromSlice = (slice, plane, index, originalImage) => {
    if (!slice || !slice.getPointData().getScalars()) {
      console.warn(`Invalid slice data for plane ${plane}, index ${index}`);
      return null;
    }

    const pixelData = slice.getPointData().getScalars().getData();
    const dims = slice.getDimensions();
    const { windowCenter, windowWidth } = validateViewport(brightness, contrast);

    let rowPixelSpacing, columnPixelSpacing;
    switch (plane) {
      case "axial":
        columnPixelSpacing = pixelSpacing[1]; // x
        rowPixelSpacing = pixelSpacing[0]; // y
        break;
      case "coronal":
        columnPixelSpacing = pixelSpacing[1]; // x
        rowPixelSpacing = sliceThickness; // z
        break;
      case "sagittal":
        columnPixelSpacing = pixelSpacing[0]; // y
        rowPixelSpacing = sliceThickness; // z
        break;
      default:
        columnPixelSpacing = pixelSpacing[1];
        rowPixelSpacing = pixelSpacing[0];
        break;
    }

    return {
      imageId: `mpr:${plane}:${index}`,
      minPixelValue: originalImage.minPixelValue || Math.min(...pixelData),
      maxPixelValue: originalImage.maxPixelValue || Math.max(...pixelData),
      slope: originalImage.slope || 1,
      intercept: originalImage.intercept || 0,
      windowCenter,
      windowWidth,
      getPixelData: () => pixelData,
      rows: dims[1],
      columns: dims[0],
      height: dims[1],
      width: dims[0],
      color: false,
      columnPixelSpacing,
      rowPixelSpacing,
      invert: false,
      sizeInBytes: pixelData.byteLength,
      data: originalImage.data, // Reuse metadata
    };
  };

  useEffect(() => {
    if (!isImageLoaded || !isElementEnabled || !files.length || disabled || !imageIds || !Array.isArray(imageIds)) {
      console.warn("MPR: Invalid conditions", {
        isImageLoaded,
        isElementEnabled,
        filesLength: files.length,
        disabled,
        imageIds,
      });
      return;
    }

    // Register custom image loader for MPR images
    cornerstone.registerImageLoader("mpr", (imageId) => {
      const [plane, indexStr] = imageId.replace("mpr:", "").split(":");
      const index = parseInt(indexStr);
      let images = [];
      if (plane === "axial") images = mprDataRef.current.axialImages;
      else if (plane === "coronal") images = mprDataRef.current.coronalImages;
      else if (plane === "sagittal") images = mprDataRef.current.sagittalImages;
      return Promise.resolve(images[index] || null);
    });

    const loadImages = async () => {
      mprDataRef.current = { volume: null, axialImages: [], coronalImages: [], sagittalImages: [] };

      // Preload all images with Cornerstone
      const loadedImages = (await Promise.all(
        imageIds.map((imageId) =>
          cornerstone.loadImage(imageId).catch((err) => {
            console.error(`Failed to load image ${imageId}:`, err);
            return null;
          })
        )
      )).filter((image) => image !== null);

      if (loadedImages.length === 0) {
        console.error("No valid images loaded for MPR");
        return;
      }

      // Assume all images have same dimensions
      const firstImage = loadedImages[0];
      const width = firstImage.width;
      const height = firstImage.height;
      const depth = loadedImages.length;
      const spacing = [pixelSpacing[1], pixelSpacing[0], sliceThickness]; // [x, y, z]

      // Create vtkImageData volume
      const volume = vtkImageData.newInstance();
      volume.setDimensions([width, height, depth]);
      volume.setSpacing(spacing);
      volume.setOrigin([0, 0, 0]);
      volume.setDirection([1, 0, 0, 0, 1, 0, 0, 0, 1]);

      // Fill volume with pixel data
      const scalars = new Uint16Array(width * height * depth);
      loadedImages.forEach((image, z) => {
        const pixelData = image.getPixelData();
        if (pixelData && pixelData.length === width * height) {
          const offset = z * width * height;
          scalars.set(pixelData, offset);
        } else {
          console.warn(`Invalid pixel data for image at index ${z}`);
        }
      });

      const scalarArray = vtkDataArray.newInstance({
        name: "Scalars",
        values: scalars,
        numberOfComponents: 1,
      });

      volume.getPointData().setScalars(scalarArray);
      mprDataRef.current.volume = volume;

      // Create reslicer
      const reslicer = vtkImageReslice.newInstance();
      reslicer.setInputData(volume);
      reslicer.setOutputDimensionality(2);
      reslicer.setInterpolationMode(1); // LINEAR

      // Function to extract slice for a plane at specific index
      const extractSlice = (plane, index, sliceCount) => {
        let axisMatrix;
        let center = [0, 0, 0];

        if (plane === "axial" || plane.includes("mist_axial")) {
          center = [
            (width - 1) / 2 * spacing[0],
            (height - 1) / 2 * spacing[1],
            index * spacing[2],
          ];
          axisMatrix = vtkMatrixBuilder
            .buildFromDegree()
            .translate(...center)
            .identity()
            .getMatrix();
        } else if (plane === "coronal" || plane.includes("mist_coronal")) {
          center = [
            (width - 1) / 2 * spacing[0],
            index * spacing[1],
            (depth - 1) / 2 * spacing[2],
          ];
          axisMatrix = vtkMatrixBuilder
            .buildFromDegree()
            .translate(...center)
            .rotateX(90)
            .getMatrix();
        } else if (plane === "sagittal" || plane.includes("mist_sagittal")) {
          center = [
            index * spacing[0],
            (height - 1) / 2 * spacing[1],
            (depth - 1) / 2 * spacing[2],
          ];
          axisMatrix = vtkMatrixBuilder
            .buildFromDegree()
            .translate(...center)
            .rotateY(90)
            .getMatrix();
        } else {
          // oblique
          center = [
            (width - 1) / 2 * spacing[0],
            (height - 1) / 2 * spacing[1],
            index * spacing[2],
          ];
          axisMatrix = vtkMatrixBuilder
            .buildFromDegree()
            .translate(...center)
            .rotateZ(45)
            .getMatrix();
        }

        reslicer.setResliceAxes(axisMatrix);
        reslicer.update();

        return reslicer.getOutputData();
      };

      // Generate images for each plane
      // Axial
      mprDataRef.current.axialImages = [];
      for (let index = 0; index < depth; index++) {
        const slice = extractSlice("axial", index, depth);
        const image = createCornerstoneImageFromSlice(slice, "axial", index, firstImage);
        if (image) mprDataRef.current.axialImages.push(image);
      }

      // Coronal
      mprDataRef.current.coronalImages = [];
      for (let index = 0; index < height; index++) {
        const slice = extractSlice("coronal", index, height);
        const image = createCornerstoneImageFromSlice(slice, "coronal", index, firstImage);
        if (image) mprDataRef.current.coronalImages.push(image);
      }

      // Sagittal
      mprDataRef.current.sagittalImages = [];
      for (let index = 0; index < width; index++) {
        const slice = extractSlice("sagittal", index, width);
        const image = createCornerstoneImageFromSlice(slice, "sagittal", index, firstImage);
        if (image) mprDataRef.current.sagittalImages.push(image);
      }

      // Update viewers based on mprMode
      const elements = [viewerRef.current, ...viewerRefs.current.map((ref) => ref.current).filter(Boolean)];

      let plane = "axial";
      if (mprMode.includes("coronal")) plane = "coronal";
      else if (mprMode.includes("sagittal")) plane = "sagittal";
      else if (mprMode === "mist_oblique") plane = "oblique";

      const getImagesForPlane = (p) => {
        if (p === "axial") return mprDataRef.current.axialImages;
        if (p === "coronal") return mprDataRef.current.coronalImages;
        if (p === "sagittal") return mprDataRef.current.sagittalImages;
        return mprDataRef.current.axialImages; // default
      };

      if (mprMode === "orthogonal") {
        const addElements = elements.slice(1);
        const planes = ["coronal", "sagittal", "axial"];
        addElements.forEach((element, idx) => {
          if (!element) return;
          const p = planes[idx % planes.length];
          const images = getImagesForPlane(p);
          if (images.length === 0) return;
          const mid = Math.floor(images.length / 2);
          const imageIds = images.map((_, j) => `mpr:${p}:${j}`);
          const stack = { currentImageIdIndex: mid, imageIds };
          cornerstoneTools.clearToolState(element, "stack");
          cornerstoneTools.addToolState(element, "stack", stack);
          cornerstone
            .loadImage(imageIds[mid])
            .then((image) => {
              cornerstone.displayImage(element, image);
              const viewport = cornerstone.getViewport(element) || {};
              cornerstone.setViewport(element, {
                ...viewport,
                voi: validateViewport(brightness, contrast),
              });
              cornerstone.updateImage(element);
            })
            .catch((err) => console.error("Failed to display MPR image:", err));
        });
      } else {
        const images = getImagesForPlane(plane);
        if (images.length === 0) return;
        const imageIds = images.map((_, j) => `mpr:${plane}:${j}`);
        elements.forEach((element, idx) => {
          if (!element) return;
          const curr = Math.min(currentIndex + idx, images.length - 1);
          const stack = { currentImageIdIndex: curr, imageIds };
          cornerstoneTools.clearToolState(element, "stack");
          cornerstoneTools.addToolState(element, "stack", stack);
          cornerstone
            .loadImage(imageIds[curr])
            .then((image) => {
              cornerstone.displayImage(element, image);
              const viewport = cornerstone.getViewport(element) || {};
              cornerstone.setViewport(element, {
                ...viewport,
                voi: validateViewport(brightness, contrast),
              });
              cornerstone.updateImage(element);
            })
            .catch((err) => console.error("Failed to display MPR image:", err));
        });
      }
    };

    loadImages().catch((err) => {
      console.error("Error in loadImages:", err);
    });

    return () => {
      const elements = [viewerRef.current, ...viewerRefs.current.map((ref) => ref.current).filter(Boolean)];
      elements.forEach((element) => {
        if (element) {
          try {
            cornerstone.updateImage(element);
          } catch (err) {
            console.error("Error during MPR cleanup:", err);
          }
        }
      });
      if (mprDataRef.current.volume) {
        mprDataRef.current.volume.delete();
      }
    };
  }, [
    isImageLoaded,
    isElementEnabled,
    files,
    imageIds,
    mprMode,
    currentIndex,
    brightness,
    contrast,
    disabled,
    viewerRef,
    viewerRefs,
    pixelSpacing,
    sliceThickness,
  ]);

  return null; // Render within DicomViewer
};

export default MultiplanarReconstruction;
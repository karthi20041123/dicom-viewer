// src/components/ThreeDViewer.js
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { create3DVolume } from '../utils/3dProcessing';

const ThreeDViewer = ({ dicomFiles }) => {
  const mountRef = useRef(null);

  useEffect(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(512, 512);
    mountRef.current.appendChild(renderer.domElement);

    create3DVolume(dicomFiles).then(mesh => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3));
      const material = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
      const meshObj = new THREE.Mesh(geometry, material);
      scene.add(meshObj);
      camera.position.z = 5;
      renderer.render(scene, camera);
    });

    return () => mountRef.current.removeChild(renderer.domElement);
  }, [dicomFiles]);

  return <div ref={mountRef} />;
};

export default ThreeDViewer;
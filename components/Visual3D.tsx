import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Analyser } from '../lib/analyser';
import { fs as backdropFS, vs as backdropVS } from '../lib/backdrop-shader';
import { vs as sphereVS } from '../lib/sphere-shader';

interface Visual3DProps {
  inputNode: AudioNode;
  outputNode: AudioNode;
}

export default function Visual3D({ inputNode, outputNode }: Visual3DProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !inputNode || !outputNode) return;

    const canvas = canvasRef.current;
    let animationFrameId: number;

    const inputAnalyser = new Analyser(inputNode);
    const outputAnalyser = new Analyser(outputNode);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x100c14);

    const backdrop = new THREE.Mesh(
      new THREE.IcosahedronGeometry(10, 5),
      new THREE.RawShaderMaterial({
        uniforms: {
          resolution: { value: new THREE.Vector2(1, 1) },
          rand: { value: 0 },
        },
        vertexShader: backdropVS,
        fragmentShader: backdropFS,
        glslVersion: THREE.GLSL3,
      }),
    );
    backdrop.material.side = THREE.BackSide;
    scene.add(backdrop);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(2, -2, 5);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);

    const geometry = new THREE.IcosahedronGeometry(1, 10);
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const sphereMaterial = new THREE.MeshStandardMaterial({
      color: 0x000010, metalness: 0.5, roughness: 0.1, emissive: 0x000010, emissiveIntensity: 1.5,
    });

    sphereMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.time = { value: 0 };
      shader.uniforms.inputData = { value: new THREE.Vector4() };
      shader.uniforms.outputData = { value: new THREE.Vector4() };
      (sphereMaterial as any).userData.shader = shader;
      shader.vertexShader = sphereVS;
    };

    const sphere = new THREE.Mesh(geometry, sphereMaterial);
    scene.add(sphere);
    sphere.visible = false;

    new EXRLoader().load('/piz_compressed.exr', (texture: THREE.Texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      const exrCubeRenderTarget = pmremGenerator.fromEquirectangular(texture);
      sphereMaterial.envMap = exrCubeRenderTarget.texture;
      sphere.visible = true;
    });

    const renderPass = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 5, 0.5, 0);
    const composer = new EffectComposer(renderer);
    composer.addPass(renderPass);
    composer.addPass(bloomPass);

    let prevTime = performance.now();
    const rotation = new THREE.Vector3(0, 0, 0);

    const getAudioFeatures = (data: Uint8Array) => {
      if (!data || data.length === 0) return { bass: 0, mid: 0, high: 0, volume: 0 };
      const bass = data.slice(0, 5).reduce((a, b) => a + b, 0) / data.slice(0, 5).length / 255;
      const mid = data.slice(5, 20).reduce((a, b) => a + b, 0) / data.slice(5, 20).length / 255;
      const high = data.slice(20, 50).reduce((a, b) => a + b, 0) / data.slice(20, 50).length / 255;
      const volume = data.reduce((a, b) => a + b, 0) / data.length / 255;
      return { bass, mid, high, volume };
    };

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      inputAnalyser.update();
      outputAnalyser.update();

      const t = performance.now();
      const dt = (t - prevTime) / (1000 / 60);
      prevTime = t;

      (backdrop.material as THREE.RawShaderMaterial).uniforms.rand.value = Math.random() * 10000;
      
      const inputFeatures = getAudioFeatures(inputAnalyser.data);
      const outputFeatures = getAudioFeatures(outputAnalyser.data);
      const totalVolume = (inputFeatures.volume + outputFeatures.volume) / 2;
      const totalBass = (inputFeatures.bass + outputFeatures.bass) / 2;
      
      bloomPass.strength = 0.8 + totalVolume * 4.0;
      bloomPass.radius = 0.2 + totalBass * 0.8;

      if ((sphereMaterial as any).userData.shader) {
        sphere.scale.setScalar(1 + 0.2 * outputFeatures.volume);
        const f = 0.002;
        rotation.x += dt * f * outputFeatures.mid;
        rotation.z += dt * f * inputFeatures.mid;
        rotation.y += dt * f * (inputFeatures.high + outputFeatures.high);
        const euler = new THREE.Euler(rotation.x, rotation.y, rotation.z);
        const quaternion = new THREE.Quaternion().setFromEuler(euler);
        const vector = new THREE.Vector3(0, 0, 5);
        vector.applyQuaternion(quaternion);
        camera.position.copy(vector);
        camera.lookAt(sphere.position);
        sphereMaterial.emissive.setHSL(0.55 + totalBass * 0.2, 0.8, 0.2 + totalVolume * 0.4);

        const shader = (sphereMaterial as any).userData.shader;
        shader.uniforms.time.value += dt * 0.01 + dt * 0.1 * outputFeatures.volume;
        shader.uniforms.inputData.value.set(inputFeatures.bass * 2, inputFeatures.mid * 0.5, inputFeatures.high * 10, 0);
        shader.uniforms.outputData.value.set(outputFeatures.bass * 4, outputFeatures.mid, outputFeatures.high * 10, 0);
      }
      composer.render();
    };

    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      const dPR = renderer.getPixelRatio();
      const w = window.innerWidth;
      const h = window.innerHeight;
      (backdrop.material as THREE.RawShaderMaterial).uniforms.resolution.value.set(w * dPR, h * dPR);
      renderer.setSize(w, h);
      composer.setSize(w, h);
    };

    window.addEventListener('resize', onWindowResize);
    onWindowResize();
    animate();

    return () => {
      window.removeEventListener('resize', onWindowResize);
      cancelAnimationFrame(animationFrameId);
      renderer.dispose();
      pmremGenerator.dispose();
    };
  }, [inputNode, outputNode]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', position: 'absolute', inset: 0, imageRendering: 'pixelated' }} />;
}

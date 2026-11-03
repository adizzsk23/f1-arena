import * as THREE from 'three';
import { BloomEffect, EffectComposer, EffectPass, RenderPass, SMAAEffect } from 'postprocessing';
import type { TrackModel } from '@gx/track';
import type { CameraInputs, CameraMode } from './cameras';
import { CameraRig } from './cameras';
import type { CarMesh } from './carMesh';
import { buildCarMesh } from './carMesh';
import type { GraphicsPreset } from './presets';
import { PRESETS } from './presets';
import { buildTrackScene } from './trackMesh';
import type { BrandAssets } from './brand';

/** Interpolated car pose for one rendered frame (physics frame → three mapping inside). */
export interface CarRenderPose {
  x: number;
  y: number;
  yaw: number;
  /** Road-wheel steer angles FL, FR (rad, + = left). */
  steerFL: number;
  steerFR: number;
  /** Accumulated wheel spin angles (rad). */
  spin: [number, number, number, number];
  /** Visual pitch/roll (rad) from load transfer. */
  pitch: number;
  roll: number;
}

export interface WorldOptions {
  canvas: HTMLCanvasElement;
  track: TrackModel;
  preset: GraphicsPreset;
  /** Owner logos (assets/brand); text placeholders when absent. */
  brand?: BrandAssets;
  car: {
    a: number;
    b: number;
    halfTrack: number;
    tyreRadius: number;
    livery: THREE.ColorRepresentation;
  };
}

const SKY_TOP = new THREE.Color(0x07102e);
const SKY_MID = new THREE.Color(0x1d2f6b);
const SKY_HORIZON = new THREE.Color(0xf08a4b);

/** Dusk scene: gradient sky, warm low sun + floodlight fill, optional bloom. */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly car: CarMesh;
  private composer: EffectComposer | null = null;
  private sun: THREE.DirectionalLight;
  private preset: GraphicsPreset;

  constructor(opts: WorldOptions) {
    this.preset = opts.preset;
    const ps = PRESETS[opts.preset];
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: ps.antialias && !ps.bloom,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, ps.pixelRatioCap));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = ps.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene.fog = new THREE.Fog(0x2a2f5a, 300, ps.fogFar);
    this.scene.add(skyDome());

    // Lighting: cool sky/hemisphere + warm low sun + "floodlight" key from above
    this.scene.add(new THREE.HemisphereLight(0x6f86d6, 0x1c1a24, 0.9));
    this.sun = new THREE.DirectionalLight(0xffb27a, 1.2);
    this.sun.position.set(-600, 180, 300);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const flood = new THREE.DirectionalLight(0xfff1dc, 1.4);
    flood.position.set(200, 600, -100);
    this.scene.add(flood);
    if (ps.shadows) {
      flood.castShadow = true;
      flood.shadow.mapSize.set(2048, 2048);
      const c = flood.shadow.camera;
      c.left = c.bottom = -40;
      c.right = c.top = 40;
      c.near = 1;
      c.far = 1500;
      this.sun = flood;
    }

    const ts = buildTrackScene(opts.track, opts.preset, opts.brand);
    this.scene.add(ts.group);

    this.car = buildCarMesh({ ...opts.car, lowDetail: opts.preset === 'low' });
    this.scene.add(this.car.root);

    const w = opts.canvas.clientWidth || window.innerWidth;
    const h = opts.canvas.clientHeight || window.innerHeight;
    this.rig = new CameraRig(w / h);
    this.resize(w, h);

    if (ps.bloom) {
      this.composer = new EffectComposer(this.renderer, { frameBufferType: THREE.HalfFloatType });
      this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
      const bloom = new BloomEffect({
        intensity: 1.1,
        luminanceThreshold: 0.72,
        luminanceSmoothing: 0.2,
        mipmapBlur: true,
      });
      const effects = opts.preset === 'high' ? [bloom, new SMAAEffect()] : [bloom];
      this.composer.addPass(new EffectPass(this.rig.camera, ...effects));
    }
  }

  get cameraMode(): CameraMode {
    return this.rig.mode;
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / h;
    this.rig.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
  }

  render(pose: CarRenderPose, cam: CameraInputs, dt: number): void {
    const car = this.car;
    car.root.position.set(pose.x, 0, -pose.y);
    car.root.rotation.set(0, pose.yaw, 0);
    car.body.rotation.set(pose.roll, 0, pose.pitch);
    car.wheelPivots[0]!.rotation.y = pose.steerFL;
    car.wheelPivots[1]!.rotation.y = pose.steerFR;
    for (let i = 0; i < 4; i++) car.wheelSpins[i]!.rotation.z = -pose.spin[i]!;
    // Car hidden parts in cockpit? keep all visible: halo/cockpit frame is part of the view.
    this.rig.update(car, cam, dt);
    if (this.preset === 'high') {
      // keep the shadow frustum around the car
      this.sun.position.set(pose.x + 200, 600, -pose.y - 100);
      this.sun.target.position.set(pose.x, 0, -pose.y);
    }
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.rig.camera);
  }

  dispose(): void {
    this.composer?.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

function skyDome(): THREE.Mesh {
  const geo = new THREE.SphereGeometry(5000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: SKY_TOP },
      mid: { value: SKY_MID },
      horizon: { value: SKY_HORIZON },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
      varying vec3 vDir;
      void main() {
        float h = clamp(vDir.y, -0.2, 1.0);
        // warm glow strongest toward the setting sun (−x, +z)
        float sunward = max(dot(normalize(vec3(vDir.x, 0.0, vDir.z)), normalize(vec3(-1.0, 0.0, 0.5))), 0.0);
        vec3 low = mix(mid, horizon, pow(sunward, 2.0) * 0.85);
        vec3 c = h < 0.12 ? mix(low, mid, smoothstep(-0.05, 0.12, h)) : mix(mid, top, smoothstep(0.12, 0.7, h));
        if (h < 0.0) c = mix(low, vec3(0.05, 0.06, 0.1), smoothstep(0.0, -0.2, h));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

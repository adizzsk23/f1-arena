import * as THREE from 'three';
import type { CarMesh } from './carMesh';

export type CameraMode = 'cockpit' | 'chase' | 'tcam';
export const CAMERA_MODES: CameraMode[] = ['cockpit', 'chase', 'tcam'];

export interface CameraInputs {
  /** Body-frame accelerations (m/s²), x forward, y left. */
  ax: number;
  ay: number;
  speedMps: number;
  /** −1 look left … +1 look right. */
  look: number;
}

const LOOK_ANGLE = (75 * Math.PI) / 180;

/**
 * Driver cameras. Cockpit: eye in the helmet with g-force head sway, halo in view.
 * Chase: critically-damped spring follow. T-cam: above the airbox, forward.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';
  private chasePos = new THREE.Vector3();
  private chaseVel = new THREE.Vector3();
  private headOffset = new THREE.Vector2();
  private lookSmoothed = 0;
  private initialised = false;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(70, aspect, 0.05, 6000);
  }

  cycle(): CameraMode {
    this.mode = CAMERA_MODES[(CAMERA_MODES.indexOf(this.mode) + 1) % CAMERA_MODES.length]!;
    this.initialised = false;
    return this.mode;
  }

  update(car: CarMesh, inp: CameraInputs, dt: number): void {
    const cam = this.camera;
    const root = car.root;
    this.lookSmoothed += (inp.look - this.lookSmoothed) * Math.min(1, dt * 10);
    const lookYaw = -this.lookSmoothed * LOOK_ANGLE;
    if (this.mode === 'chase') {
      cam.fov = 62;
      // desired position: behind and above, in world
      const back = 7.5 + Math.min(inp.speedMps, 90) * 0.012;
      // look right ⇒ camera swings to the car's left (−Z) and looks across to the right
      const local = new THREE.Vector3(-back * Math.cos(lookYaw), 2.3, back * Math.sin(lookYaw));
      const desired = root.localToWorld(local);
      if (!this.initialised) {
        this.chasePos.copy(desired);
        this.chaseVel.set(0, 0, 0);
        this.initialised = true;
      }
      // critically damped spring: a = ω²(x* − x) − 2ω·v
      const w = 9;
      const acc = this.tmp
        .copy(desired)
        .sub(this.chasePos)
        .multiplyScalar(w * w)
        .addScaledVector(this.chaseVel, -2 * w);
      this.chaseVel.addScaledVector(acc, dt);
      this.chasePos.addScaledVector(this.chaseVel, dt);
      cam.position.copy(this.chasePos);
      const target = root.localToWorld(this.tmp2.set(2.5, 0.8, 0));
      cam.up.set(0, 1, 0);
      cam.lookAt(target);
    } else {
      const cockpit = this.mode === 'cockpit';
      cam.fov = cockpit ? 78 : 72;
      // head sway: lean against acceleration (smoothed)
      const k = cockpit ? 0.0045 : 0.0015;
      const tx = -inp.ax * k;
      const ty = -inp.ay * k;
      this.headOffset.x += (tx - this.headOffset.x) * Math.min(1, dt * 6);
      this.headOffset.y += (ty - this.headOffset.y) * Math.min(1, dt * 6);
      const eye = (cockpit ? car.cockpitEye : car.tcamEye).clone();
      eye.x += this.headOffset.x;
      eye.z -= this.headOffset.y; // physics left = −Z
      car.body.localToWorld(eye);
      cam.position.copy(eye);
      const fwd = new THREE.Vector3(
        Math.cos(lookYaw) * 20,
        cockpit ? -1.1 : -1.6,
        -Math.sin(lookYaw) * 20,
      );
      const target = car.body.localToWorld(fwd.add(cockpit ? car.cockpitEye : car.tcamEye));
      cam.up.set(0, 1, 0);
      cam.lookAt(target);
    }
    cam.updateProjectionMatrix();
  }
}

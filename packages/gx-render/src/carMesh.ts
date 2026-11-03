import * as THREE from 'three';

/**
 * Placeholder F1 car from primitives. Local frame: +X forward, +Y up, +Z = right
 * (physics left = −Z). Origin = centre of gravity at ground level.
 */
export interface CarMesh {
  root: THREE.Group;
  /** Visual body (pitch/roll applied here). */
  body: THREE.Group;
  /** Per wheel: steer pivot (rotation.y) and spinning tyre (rotation.z). FL, FR, RL, RR. */
  wheelPivots: THREE.Group[];
  wheelSpins: THREE.Object3D[];
  setLivery(color: THREE.ColorRepresentation): void;
  /** Eye points in body frame for cameras. */
  cockpitEye: THREE.Vector3;
  tcamEye: THREE.Vector3;
}

export function buildCarMesh(opts: {
  a: number;
  b: number;
  halfTrack: number;
  tyreRadius: number;
  livery?: THREE.ColorRepresentation;
  lowDetail?: boolean;
}): CarMesh {
  const { a, b, halfTrack, tyreRadius: r } = opts;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const livery = new THREE.MeshStandardMaterial({
    color: opts.livery ?? 0x2f6bff,
    metalness: 0.35,
    roughness: 0.35,
  });
  const carbon = new THREE.MeshStandardMaterial({
    color: 0x111317,
    metalness: 0.2,
    roughness: 0.6,
  });
  const accent = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    metalness: 0.1,
    roughness: 0.4,
  });
  const add = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    parent: THREE.Object3D = body,
  ) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  // Floor / plank
  add(new THREE.BoxGeometry(a + b + 0.4, 0.05, 1.4), carbon, (a - b) / 2 - 0.2, 0.06, 0);
  // Monocoque / survival cell
  add(new THREE.BoxGeometry(2.4, 0.5, 0.78), livery, 0.35, 0.42, 0);
  // Nose: tapered box
  const nose = new THREE.CylinderGeometry(0.12, 0.34, 1.9, 4, 1);
  nose.rotateZ(Math.PI / 2);
  nose.rotateX(Math.PI / 4);
  nose.scale(1, 0.8, 1);
  add(nose, livery, a + 0.35, 0.33, 0);
  // Front wing (main plane + flap + endplates)
  add(new THREE.BoxGeometry(0.45, 0.04, 1.85), carbon, a + 1.0, 0.1, 0);
  add(new THREE.BoxGeometry(0.25, 0.04, 1.7), livery, a + 0.95, 0.17, 0).rotation.z = -0.25;
  for (const s of [-1, 1])
    add(new THREE.BoxGeometry(0.55, 0.25, 0.03), carbon, a + 0.98, 0.18, s * 0.93);
  // Sidepods
  for (const s of [-1, 1]) {
    const pod = add(new THREE.BoxGeometry(1.7, 0.42, 0.42), livery, -0.35, 0.36, s * 0.55);
    pod.scale.set(1, 1, 1);
    add(new THREE.BoxGeometry(0.1, 0.36, 0.38), carbon, 0.5, 0.36, s * 0.55); // inlet
  }
  // Engine cover + airbox
  const cover = new THREE.CylinderGeometry(0.18, 0.36, 2.0, 8);
  cover.rotateZ(Math.PI / 2);
  add(cover, livery, -0.95, 0.62, 0);
  add(new THREE.BoxGeometry(0.4, 0.42, 0.34), livery, -0.55, 0.95, 0);
  add(new THREE.BoxGeometry(0.06, 0.2, 0.22), carbon, -0.34, 1.0, 0); // airbox mouth
  // Rear wing
  add(new THREE.BoxGeometry(0.42, 0.05, 1.0), carbon, -b - 0.55, 0.92, 0);
  add(new THREE.BoxGeometry(0.22, 0.05, 1.0), livery, -b - 0.42, 1.02, 0).rotation.z = -0.4;
  for (const s of [-1, 1])
    add(new THREE.BoxGeometry(0.75, 0.62, 0.03), carbon, -b - 0.5, 0.72, s * 0.51);
  add(new THREE.BoxGeometry(0.1, 0.5, 0.06), carbon, -b - 0.35, 0.62, 0); // pylon
  // Diffuser
  add(new THREE.BoxGeometry(0.5, 0.18, 1.0), carbon, -b - 0.35, 0.16, 0).rotation.z = 0.3;
  // Cockpit opening + driver helmet
  add(new THREE.BoxGeometry(0.85, 0.05, 0.5), carbon, 0.15, 0.68, 0);
  add(
    new THREE.SphereGeometry(0.14, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.3 }),
    -0.05,
    0.8,
    0,
  );
  // Halo: arc over the cockpit + centre pillar
  const halo = new THREE.TorusGeometry(0.42, 0.035, 8, 24, Math.PI);
  halo.rotateX(-Math.PI / 2);
  halo.rotateY(Math.PI / 2);
  const haloMesh = add(halo, carbon, -0.1, 0.92, 0);
  haloMesh.scale.set(1.25, 1, 1);
  add(new THREE.CylinderGeometry(0.03, 0.04, 0.32, 6), carbon, 0.42, 0.78, 0).rotation.z = 0.7;
  // Number panel
  add(new THREE.BoxGeometry(0.3, 0.02, 0.3), accent, 0.95, 0.53, 0);

  // Wheels
  const wheelPivots: THREE.Group[] = [];
  const wheelSpins: THREE.Object3D[] = [];
  const tyreMat = new THREE.MeshStandardMaterial({ color: 0x18191c, roughness: 0.85 });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x9aa3b0,
    metalness: 0.7,
    roughness: 0.35,
  });
  const markMat = new THREE.MeshBasicMaterial({ color: 0xffd23f }); // Medium compound band
  const seg = opts.lowDetail ? 14 : 24;
  const pos: [number, number, number][] = [
    [a, r, -halfTrack],
    [a, r, halfTrack],
    [-b, r, -halfTrack],
    [-b, r, halfTrack],
  ];
  pos.forEach(([x, y, z], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const spin = new THREE.Group();
    const w = i < 2 ? 0.32 : 0.4;
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, seg), tyreMat);
    tyre.rotation.x = Math.PI / 2;
    tyre.castShadow = true;
    spin.add(tyre);
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.01, seg),
      rimMat,
    );
    rim.rotation.x = Math.PI / 2;
    spin.add(rim);
    // spoke bar so rotation is visible
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(r * 1.1, 0.06, w + 0.02), carbon);
    spin.add(spoke);
    const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.8, 0.012, 4, seg), markMat);
    band.position.z = (z > 0 ? 1 : -1) * (w / 2 + 0.006);
    spin.add(band);
    pivot.add(spin);
    root.add(pivot);
    wheelPivots.push(pivot);
    wheelSpins.push(spin);
  });
  // Suspension arms (visual)
  for (const [x, , z] of pos) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, Math.abs(z) - 0.3), carbon);
    arm.position.set(x, 0.4, z / 2 + Math.sign(z) * 0.1);
    body.add(arm);
  }

  return {
    root,
    body,
    wheelPivots,
    wheelSpins,
    setLivery: (c) => livery.color.set(c),
    cockpitEye: new THREE.Vector3(-0.08, 0.88, 0),
    tcamEye: new THREE.Vector3(-0.55, 1.3, 0),
  };
}

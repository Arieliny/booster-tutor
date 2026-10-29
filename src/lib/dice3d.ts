/**
 * Real 3D dice for the life counter (three.js), loaded only when someone
 * rolls. Each die is built face by face with its number on the face; it
 * tumbles, slows, and settles with the rolled face toward the viewer, upright.
 *
 * The roll is decided before the animation (the result is passed in), and the
 * tumble comes from a seed, so the two copies on the table (one facing each
 * side) move identically.
 */
import * as THREE from "three";

export interface DieRoll {
  sides: number;
  result: number;
  seed: number;
}

/** Small seeded random numbers, so both copies of a roll tumble the same way. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Face {
  verts: THREE.Vector3[];
  center: THREE.Vector3;
  normal: THREE.Vector3;
  /** Which way is "up" for the number on this face. */
  up: THREE.Vector3;
  /** Rough size of the face, for the number. */
  size: number;
}

/** The faces of a convex solid given as triangles: coplanar triangles merge into one face. */
function facesFromGeometry(geo: THREE.BufferGeometry): THREE.Vector3[][] {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.getAttribute("position");
  const groups: { normal: THREE.Vector3; verts: THREE.Vector3[] }[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i);
    const b = new THREE.Vector3().fromBufferAttribute(pos, i + 1);
    const c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    let grp = groups.find((x) => x.normal.dot(n) > 0.999);
    if (!grp) groups.push((grp = { normal: n, verts: [] }));
    for (const v of [a, b, c]) if (!grp.verts.some((w) => w.distanceTo(v) < 1e-4)) grp.verts.push(v);
  }
  return groups.map((x) => x.verts);
}

/** A d10: a pentagonal trapezohedron (ten kites). Ring height keeps each kite flat. */
function d10Faces(): THREE.Vector3[][] {
  const h = 1.05;
  const e = (h * (1 - Math.cos(Math.PI / 5))) / (1 + Math.cos(Math.PI / 5));
  const top = new THREE.Vector3(0, 0, h);
  const bottom = new THREE.Vector3(0, 0, -h);
  const up = (k: number) => new THREE.Vector3(Math.cos((2 * Math.PI * k) / 5), Math.sin((2 * Math.PI * k) / 5), e);
  const low = (k: number) => new THREE.Vector3(Math.cos((2 * Math.PI * k) / 5 + Math.PI / 5), Math.sin((2 * Math.PI * k) / 5 + Math.PI / 5), -e);
  const faces: THREE.Vector3[][] = [];
  for (let k = 0; k < 5; k++) {
    faces.push([top, up(k), low(k), up(k + 1)]);
    faces.push([bottom, low(k), up(k + 1), low(k + 1)]);
  }
  return faces;
}

function rawFaces(sides: number): THREE.Vector3[][] {
  switch (sides) {
    case 4:
      return facesFromGeometry(new THREE.TetrahedronGeometry(1.25));
    case 6:
      return facesFromGeometry(new THREE.BoxGeometry(1.35, 1.35, 1.35));
    case 8:
      return facesFromGeometry(new THREE.OctahedronGeometry(1.15));
    case 10:
      return d10Faces();
    case 12:
      return facesFromGeometry(new THREE.DodecahedronGeometry(1.05));
    default:
      return facesFromGeometry(new THREE.IcosahedronGeometry(1.05));
  }
}

/** Center, outward normal, number direction and size for each face; vertices put in order around the face. */
function describeFaces(raw: THREE.Vector3[][]): Face[] {
  return raw.map((vs) => {
    const center = vs.reduce((acc, v) => acc.add(v), new THREE.Vector3()).divideScalar(vs.length);
    const normal = new THREE.Vector3().subVectors(vs[1], vs[0]).cross(new THREE.Vector3().subVectors(vs[2], vs[0])).normalize();
    if (normal.dot(center) < 0) normal.negate();
    // Order the corners around the center, so the face triangulates as a fan.
    const ax = new THREE.Vector3().subVectors(vs[0], center).normalize();
    const ay = new THREE.Vector3().crossVectors(normal, ax);
    const verts = [...vs].sort((p, q) => {
      const dp = new THREE.Vector3().subVectors(p, center);
      const dq = new THREE.Vector3().subVectors(q, center);
      return Math.atan2(dp.dot(ay), dp.dot(ax)) - Math.atan2(dq.dot(ay), dq.dot(ax));
    });
    const dists = verts.map((v) => v.distanceTo(center));
    const square = verts.length === 4 && Math.max(...dists) - Math.min(...dists) < 1e-3;
    // Numbers read toward a corner (toward an edge's middle on the d6's squares).
    const target = square ? new THREE.Vector3().addVectors(verts[0], verts[1]).multiplyScalar(0.5) : verts[dists.indexOf(Math.max(...dists))];
    const up = new THREE.Vector3().subVectors(target, center);
    up.sub(normal.clone().multiplyScalar(up.dot(normal))).normalize();
    // Inradius-ish: the nearest edge to the center.
    let size = Infinity;
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % verts.length];
      const ab = new THREE.Vector3().subVectors(b, a);
      const t = Math.max(0, Math.min(1, new THREE.Vector3().subVectors(center, a).dot(ab) / ab.lengthSq()));
      size = Math.min(size, center.distanceTo(a.clone().add(ab.multiplyScalar(t))));
    }
    return { verts, center, normal, up, size };
  });
}

function numberTexture(n: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#14161c";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${n >= 10 ? 66 : 84}px Nunito, ui-rounded, system-ui, sans-serif`;
  ctx.fillText(String(n), 64, 68);
  // 6 and 9 get a line underneath so they can't be confused.
  if (n === 6 || n === 9) ctx.fillRect(40, 108, 48, 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** The rotation that turns `face` toward the viewer with its number upright, tipped back a little so it looks solid. */
function restingRotation(face: Face): THREE.Quaternion {
  const right = new THREE.Vector3().crossVectors(face.up, face.normal);
  const toLocal = new THREE.Matrix4().makeBasis(right, face.up, face.normal).transpose();
  const tilt = new THREE.Matrix4().makeRotationX(-0.38);
  return new THREE.Quaternion().setFromRotationMatrix(tilt.multiply(toLocal));
}

/**
 * Roll a die into `canvas`. Returns a cleanup function (stops the animation
 * and frees the WebGL context). Throws if WebGL isn't available.
 */
export async function rollDie(canvas: HTMLCanvasElement, roll: DieRoll): Promise<() => void> {
  // The numbers are drawn in Nunito Black; make sure it's loaded before drawing them.
  try {
    await document.fonts.load("900 64px Nunito");
  } catch {
    // Falls back to the system font.
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const cssSize = canvas.clientWidth || 96;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(cssSize, cssSize, false);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  camera.position.set(0, 0, 6.4);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(2.5, 4, 5);
  scene.add(sun);

  const faces = describeFaces(rawFaces(roll.sides));
  const die = new THREE.Group();
  scene.add(die);

  // The body, built from the faces so every die (the d10 included) goes the same way.
  const positions: number[] = [];
  for (const f of faces) for (let i = 1; i < f.verts.length - 1; i++) for (const v of [f.verts[0], f.verts[i], f.verts[i + 1]]) positions.push(v.x, v.y, v.z);
  const body = new THREE.BufferGeometry();
  body.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  body.computeVertexNormals();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0, flatShading: true, side: THREE.DoubleSide });
  die.add(new THREE.Mesh(body, bodyMat));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(body, 10), new THREE.LineBasicMaterial({ color: 0x14161c, transparent: true, opacity: 0.18 }));
  die.add(edges);

  // A number on every face, slightly above it, reading toward that face's "up".
  const disposables: { dispose(): void }[] = [body, bodyMat, edges.geometry, edges.material as THREE.Material];
  const rolled = Math.max(0, Math.min(faces.length, roll.result) - 1);
  const labels: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
  faces.forEach((f, i) => {
    const tex = numberTexture(i + 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const s = f.size * (roll.sides === 4 ? 1.45 : roll.sides === 10 ? 1.25 : 1.5);
    const geo = new THREE.PlaneGeometry(s, s);
    const label = new THREE.Mesh(geo, mat);
    label.position.copy(f.center).addScaledVector(f.normal, 0.004);
    const right = new THREE.Vector3().crossVectors(f.up, f.normal);
    label.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, f.up, f.normal));
    die.add(label);
    labels.push({ mesh: label, mat });
    disposables.push(tex, mat, geo);
  });
  // As it lands, every number but the rolled one fades and the rolled one grows a little, so the face
  // tipped toward you (or the far copy's, upside down) can't be read as the result.
  const settleLabels = (k: number) =>
    labels.forEach(({ mesh, mat }, i) => {
      if (i === rolled) mesh.scale.setScalar(1 + 0.15 * k);
      else mat.opacity = 1 - 0.82 * k;
    });

  // Tumble around a seeded axis, slowing down, then ease onto the rolled face.
  const rand = mulberry32(roll.seed);
  const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
  die.quaternion.setFromAxisAngle(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(), rand() * Math.PI * 2);
  const startQ = die.quaternion.clone();
  const endQ = restingRotation(faces[rolled]);
  const SPIN = 0.7;
  const SETTLE = 0.5;
  const speed = 16 + rand() * 6; // radians per second at the start

  let raf = 0;
  let t0 = 0;
  let settleFrom: THREE.Quaternion | null = null;
  const frame = (now: number) => {
    if (!t0) t0 = now;
    const t = (now - t0) / 1000;
    if (t < SPIN) {
      // Angle so far with the speed falling off linearly to a quarter.
      const angle = speed * (t - (0.75 * t * t) / (2 * SPIN));
      die.quaternion.copy(startQ).premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
    } else {
      settleFrom ??= die.quaternion.clone();
      const k = Math.min(1, (t - SPIN) / SETTLE);
      const ease = 1 - Math.pow(1 - k, 3);
      die.quaternion.slerpQuaternions(settleFrom, endQ, ease);
      settleLabels(ease);
    }
    renderer.render(scene, camera);
    if (t < SPIN + SETTLE) raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    cancelAnimationFrame(raf);
    for (const d of disposables) d.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };
}

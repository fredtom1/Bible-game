import * as THREE from 'three';
import { MAT } from './geo';

export interface TerrainOpts {
  size: number;
  segments: number;
  height: (x: number, z: number) => number;
  /** Colour for a face given its centre and slope (0 = flat, 1 = cliff). */
  color: (x: number, z: number, y: number, slope: number) => THREE.ColorRepresentation;
  centerX?: number;
  centerZ?: number;
}

/** Faceted heightfield terrain with per-face colours. */
export function makeTerrain(o: TerrainOpts): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(o.size, o.size, o.segments, o.segments).toNonIndexed();
  geo.rotateX(-Math.PI / 2);
  geo.translate(o.centerX ?? 0, 0, o.centerZ ?? 0);
  geo.deleteAttribute('uv');
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) pos.setY(i, o.height(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const d = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    d.fromBufferAttribute(pos, i + 2);
    n.crossVectors(b.clone().sub(a), d.clone().sub(a)).normalize();
    const slope = 1 - Math.abs(n.y);
    const cx = (a.x + b.x + d.x) / 3;
    const cy = (a.y + b.y + d.y) / 3;
    const cz = (a.z + b.z + d.z) / 3;
    c.set(o.color(cx, cz, cy, slope));
    // subtle per-face variation for the low-poly look
    const v = ((Math.sin(cx * 12.9898 + cz * 78.233) * 43758.5453) % 1) * 0.04;
    c.offsetHSL(0, 0, v);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, MAT.std);
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  return mesh;
}

export const lerpColor = (a: string, b: string, t: number): THREE.Color =>
  new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));

import * as THREE from 'three';

/**
 * Stylised animated water: vertex waves along the surface normal, fresnel
 * tint, sun glints and foam streaks. Works on flat lakes and on the standing
 * walls of the Red Sea.
 */
const vert = /* glsl */ `
uniform float time;
uniform float amp;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  float w = sin(wp.x * 0.35 + time * 1.4) * 0.6 + sin(wp.z * 0.27 - time * 1.1) * 0.5 + sin((wp.x + wp.z) * 0.9 + time * 2.3) * 0.18;
  vec3 n = normalize(mat3(modelMatrix) * normal);
  wp.xyz += n * w * amp;
  vWorld = wp.xyz;
  vNormalW = n;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const frag = /* glsl */ `
uniform float time;
uniform vec3 deep;
uniform vec3 shallow;
uniform vec3 sunColor;
uniform vec3 sunDir;
uniform float opacity;
uniform float foam;
uniform float light;
varying vec3 vWorld;
varying vec3 vNormalW;
#include <fog_pars_fragment>
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec3 n = normalize(vNormalW);
  // ripple normal perturbation
  vec2 uv = abs(n.y) > 0.5 ? vWorld.xz : vec2(vWorld.x + vWorld.z, vWorld.y);
  float r1 = n2(uv * 0.6 + vec2(time * 0.3, time * 0.2));
  float r2 = n2(uv * 1.7 - vec2(time * 0.4, -time * 0.25));
  vec3 pn = normalize(n + vec3(r1 - 0.5, 0.0, r2 - 0.5) * 0.35);
  vec3 viewDir = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(dot(pn, viewDir), 0.0), 3.0);
  vec3 col = mix(deep, shallow, 0.25 + fres * 0.6);
  vec3 refl = reflect(-normalize(sunDir), pn);
  float spec = pow(max(dot(refl, viewDir), 0.0), 80.0);
  col += sunColor * spec * 1.4;
  float streak = smoothstep(0.82, 0.95, n2(uv * 0.25 + vec2(time * 0.05, 0.0)) * 0.6 + r2 * 0.5);
  col = mix(col, vec3(0.92, 0.97, 1.0), streak * foam);
  col *= light;
  gl_FragColor = vec4(col, opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

export function makeWaterMaterial(opts: {
  deep?: string;
  shallow?: string;
  opacity?: number;
  amp?: number;
  foam?: number;
} = {}): THREE.ShaderMaterial {
  const mat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        amp: { value: opts.amp ?? 0.25 },
        deep: { value: new THREE.Color(opts.deep ?? '#0e4f6e') },
        shallow: { value: new THREE.Color(opts.shallow ?? '#3fb3c4') },
        sunColor: { value: new THREE.Color('#fff4d6') },
        sunDir: { value: new THREE.Vector3(0.4, 0.7, 0.3) },
        opacity: { value: opts.opacity ?? 0.92 },
        foam: { value: opts.foam ?? 0.35 },
        light: { value: 1 },
      },
    ]),
    vertexShader: vert,
    fragmentShader: frag,
    transparent: (opts.opacity ?? 0.92) < 1,
    fog: true,
    side: THREE.DoubleSide,
  });
  return mat;
}

export function makeWaterPlane(w: number, d: number, seg: number, mat: THREE.ShaderMaterial): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(w, d, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = false;
  return mesh;
}

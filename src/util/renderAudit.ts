import * as THREE from 'three';
import { TEXTURE_PROBES } from './textureProbes';

// Render audit: proves what the player actually sees, not just that
// image files resolved.
//
// 1. Scene audit - every mesh built by the texture-backed factories
//    carries a tag on its material (tagAuditMaterial) saying which
//    group it belongs to (player, guards, vehicles, dogs, props,
//    ground). The audit walks the live scene and counts, per group,
//    meshes drawn with their texture vs. with the flat-colour fallback
//    material, and textures three.js never uploaded.
// 2. GPU check - for every texture those meshes use, the texels at the
//    coordinates in textureProbes.ts are read back from the GPU
//    (framebuffer attachment + readPixels) and compared with the RGBA
//    the source PNG holds there. That distinguishes a real upload from
//    an empty, black or single-colour texture, and reports orientation.
//
// Results show in Settings > Build / Update Info and are logged as one
// `[render-audit]` line (logcat on Android, checked by CI).

export type AuditGroup = 'player' | 'guards' | 'vehicles' | 'dogs' | 'props' | 'ground';
export const AUDIT_GROUPS: AuditGroup[] = ['player', 'guards', 'vehicles', 'dogs', 'props', 'ground'];

type MaterialTag = { group: AuditGroup; label: string; expectsTexture: boolean };

// Called where materials are created. `expectsTexture` is false for
// materials that are solid colour by design (e.g. tree bark).
export function tagAuditMaterial(mat: THREE.Material, group: AuditGroup, label: string, expectsTexture = true) {
  mat.userData.audit = { group, label, expectsTexture } satisfies MaterialTag;
}

// Figures share materials between players and guards of the same
// model, so the role is tagged on the figure's root object instead.
export function tagAuditRole(obj: THREE.Object3D, group: AuditGroup) {
  obj.userData.auditRole = group;
}

export type GroupAudit = { meshes: number; textured: number; flat: number; notUploaded: number };
export type GpuStatus = 'ok' | 'upside-down' | 'mismatch' | 'blank' | 'not-uploaded' | 'incomplete' | 'no-probe';
export type GpuCheck = { key: string; status: GpuStatus; detail?: string };
export type RenderAudit = {
  groups: Record<AuditGroup, GroupAudit>;
  gpu: GpuCheck[];
  // Human-readable problems; empty when everything is textured and verified.
  problems: string[];
};

let LAST: RenderAudit | null = null;
export function getRenderAudit(): RenderAudit | null {
  return LAST;
}

function emptyGroups(): Record<AuditGroup, GroupAudit> {
  const g = {} as Record<AuditGroup, GroupAudit>;
  for (const k of AUDIT_GROUPS) g[k] = { meshes: 0, textured: 0, flat: 0, notUploaded: 0 };
  return g;
}

function roleOf(obj: THREE.Object3D): AuditGroup | null {
  let o: THREE.Object3D | null = obj;
  while (o) {
    const r = o.userData?.auditRole as AuditGroup | undefined;
    if (r) return r;
    o = o.parent;
  }
  return null;
}

// Minimal view of three's renderer internals the audit needs.
type RendererLike = {
  getContext(): WebGLRenderingContext | WebGL2RenderingContext;
  properties: { get(o: object): { __webglTexture?: WebGLTexture } };
};

export type TexelReader = (tex: WebGLTexture, points: Array<[number, number]>) => Uint8Array[] | 'incomplete';

// Reads texels of a GPU texture through a temporary framebuffer. It runs
// after a frame has been drawn to the screen, when three.js has the
// default framebuffer bound, and rebinds it (null) afterwards, so three's
// cached GL state stays true. (Do not call renderer.resetState() here:
// it reads gl.canvas, which expo-gl's context does not have.)
export function glTexelReader(gl: WebGLRenderingContext | WebGL2RenderingContext): TexelReader {
  return (tex, points) => {
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    try {
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return 'incomplete';
      return points.map(([x, y]) => {
        const px = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return px;
      });
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fbo);
    }
  };
}

function close(a: ArrayLike<number>, r: number, g: number, b: number, al: number): boolean {
  const t = 3;
  return Math.abs(a[0] - r) <= t && Math.abs(a[1] - g) <= t && Math.abs(a[2] - b) <= t && Math.abs(a[3] - al) <= t;
}

// Compares GPU texels with the PNG's. With three's default flipY the
// top image row lands in the last GL row, so image (x, y) is read at
// GL row height-1-y.
export function checkTexture(key: string, flipY: boolean, read: (pts: Array<[number, number]>) => Uint8Array[] | 'incomplete'): GpuCheck {
  const probe = TEXTURE_PROBES[key];
  if (!probe) return { key, status: 'no-probe' };
  const expectRows = probe.points.map(([x, y]) => [x, flipY ? probe.height - 1 - y : y] as [number, number]);
  const otherRows = probe.points.map(([x, y]) => [x, flipY ? y : probe.height - 1 - y] as [number, number]);
  const want = probe.points;
  const matches = (px: Uint8Array[]) => want.every((p, i) => close(px[i], p[2], p[3], p[4], p[5]));
  // Read the expected orientation first; the flipped read (to report
  // "upside-down") only happens when that fails. Each texel is a
  // blocking GPU round trip on expo-gl, so the common path stays small.
  const got = read(expectRows);
  if (got === 'incomplete') return { key, status: 'incomplete' };
  if (matches(got)) return { key, status: 'ok' };
  const flipped = read(otherRows);
  if (flipped !== 'incomplete' && matches(flipped)) return { key, status: 'upside-down' };
  const n = want.length;
  const blank = got.slice(0, n).every((px) => px[0] === 0 && px[1] === 0 && px[2] === 0 && px[3] === 0);
  if (blank) return { key, status: 'blank' };
  const first = got[0];
  return {
    key,
    status: 'mismatch',
    detail: `texel ${want[0][0]},${want[0][1]} is ${first[0]},${first[1]},${first[2]},${first[3]} expected ${want[0].slice(2).join(',')}`,
  };
}

export function auditScene(
  scene: THREE.Object3D,
  isUploaded: (tex: THREE.Texture) => WebGLTexture | null,
  readTexels: TexelReader | null,
): RenderAudit {
  const groups = emptyGroups();
  const textures = new Map<string, THREE.Texture>();
  const problems: string[] = [];
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      const tag = m?.userData?.audit as MaterialTag | undefined;
      if (!tag || !tag.expectsTexture) continue;
      const group = roleOf(mesh) ?? tag.group;
      const g = groups[group];
      g.meshes++;
      const map = (m as THREE.MeshLambertMaterial).map ?? null;
      if (!map) {
        g.flat++;
        continue;
      }
      if (!isUploaded(map)) {
        g.notUploaded++;
        continue;
      }
      g.textured++;
      const key = map.userData?.textureKey as string | undefined;
      if (key && !textures.has(key)) textures.set(key, map);
    }
  });
  for (const k of AUDIT_GROUPS) {
    const g = groups[k];
    if (g.flat > 0) problems.push(`${k}: ${g.flat}/${g.meshes} meshes flat colour (texture missing)`);
    if (g.notUploaded > 0) problems.push(`${k}: ${g.notUploaded}/${g.meshes} meshes' textures not on the GPU`);
  }
  const gpu: GpuCheck[] = [];
  for (const [key, tex] of textures) {
    const glTex = isUploaded(tex);
    if (!glTex) {
      gpu.push({ key, status: 'not-uploaded' });
    } else if (!readTexels) {
      continue;
    } else {
      gpu.push(checkTexture(key, tex.flipY, (pts) => readTexels(glTex, pts)));
    }
  }
  for (const c of gpu) {
    if (c.status !== 'ok') problems.push(`${c.key}: GPU texture ${c.status}${c.detail ? ` (${c.detail})` : ''}`);
  }
  return { groups, gpu, problems };
}

// Runs the audit against the live renderer (after at least one frame,
// so three.js has uploaded the textures), stores and logs the result.
export function runRenderAudit(renderer: RendererLike, scene: THREE.Object3D): RenderAudit {
  const gl = renderer.getContext();
  const isUploaded = (tex: THREE.Texture) => renderer.properties.get(tex).__webglTexture ?? null;
  let audit: RenderAudit;
  try {
    audit = auditScene(scene, isUploaded, glTexelReader(gl));
  } catch (e) {
    audit = { groups: emptyGroups(), gpu: [], problems: [`audit failed: ${e instanceof Error ? e.message : String(e)}`] };
  }
  LAST = audit;
  console.log(`[render-audit] ${JSON.stringify(audit)}`);
  return audit;
}

// Build / Update Info rows.
export function formatAuditRows(audit: RenderAudit | null): Array<{ label: string; value: string; full?: string }> {
  if (!audit) return [{ label: 'Rendering', value: 'Not checked yet (start a stage)' }];
  const parts: string[] = [];
  for (const k of AUDIT_GROUPS) {
    const g = audit.groups[k];
    if (g.meshes === 0) continue;
    parts.push(`${k} ${g.textured === g.meshes ? 'textured' : `${g.textured}/${g.meshes} textured`}`);
  }
  const verified = audit.gpu.filter((c) => c.status === 'ok').length;
  const full = [
    ...AUDIT_GROUPS.filter((k) => audit.groups[k].meshes > 0).map((k) => {
      const g = audit.groups[k];
      return `${k}: ${g.meshes} meshes, ${g.textured} textured, ${g.flat} flat, ${g.notUploaded} not uploaded`;
    }),
    ...audit.gpu.map((c) => `${c.key}: ${c.status}${c.detail ? ` (${c.detail})` : ''}`),
    ...audit.problems.map((p) => `PROBLEM ${p}`),
  ].join('\n');
  return [
    {
      label: 'Rendering',
      value: audit.problems.length === 0 ? `OK - ${parts.join(', ')}` : `PROBLEM - ${audit.problems[0]}`,
      full,
    },
    {
      label: 'GPU textures',
      value: `${verified}/${audit.gpu.length} match the source images`,
      full,
    },
  ];
}

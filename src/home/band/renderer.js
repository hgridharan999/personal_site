import { canvasSize } from './iceberg.js';
import { VS, buildFragmentShader } from './shader/index.js';
import { SPLASH } from './water/constants.js';
import { restBytes } from './water/pack.js';
import { dropCandidates } from './water/splash.js';

/** Every uniform the shaders declare (uDrop and uDropBox are absent when the drops are compiled out). */
const UNIFORMS = ['uRes', 'uT', 'uSim', 'uSurf', 'uField', 'uDropBox', 'uDrop'];
const CONTEXT = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' };
const POLL_MS = 8;

/** Submit the compile and link without reading any status: reading one blocks until the driver is done. */
function startLink(gl, dropN) {
  const make = (type, src) => {
    const shader = gl.createShader(type);
    if (shader) {
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
    }
    return shader;
  };
  const vs = make(gl.VERTEX_SHADER, VS);
  const fs = make(gl.FRAGMENT_SHADER, buildFragmentShader(dropN));
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.bindAttribLocation(prog, 0, 'aPos'); // the one attribute lives at 0, whatever the driver would pick
  gl.linkProgram(prog);
  return { prog, vs, fs };
}

/**
 * Resolve once the driver has finished linking. With KHR_parallel_shader_compile the work runs off
 * the main thread and we poll the (non-blocking) completion flag on a short timer; without it the
 * status read afterwards blocks, exactly as it always has.
 */
function whenLinked(gl, ext, prog, signal) {
  return new Promise((resolve) => {
    let timer = 0;
    const stop = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      resolve();
    };
    const poll = () => {
      if (!ext || signal.aborted || gl.isContextLost() || gl.getProgramParameter(prog, ext.COMPLETION_STATUS_KHR)) return stop();
      timer = setTimeout(poll, POLL_MS);
      return undefined;
    };
    signal.addEventListener('abort', stop);
    poll();
  });
}

/** Compile and link the program for a pool of dropN drops, or null if this GPU refuses it (or we were aborted). */
async function link(gl, ext, dropN, signal) {
  const job = startLink(gl, dropN);
  if (!job) return null;
  const { prog, vs, fs } = job;
  await whenLinked(gl, ext, prog, signal);
  const ok = !signal.aborted && gl.getProgramParameter(prog, gl.LINK_STATUS);
  if (!ok && !signal.aborted && !gl.isContextLost()) {
    console.warn(gl.getShaderInfoLog(fs) || gl.getShaderInfoLog(vs) || gl.getProgramInfoLog(prog));
  }
  gl.deleteShader(vs); // flagged for deletion now; they go with the program
  gl.deleteShader(fs);
  if (ok) return prog;
  gl.deleteProgram(prog);
  return null;
}

/**
 * A texture for the water's data, bound to its own unit for good. Non-power-of-two textures only
 * sample in WebGL1 with LINEAR (no mipmaps) and CLAMP_TO_EDGE; anything else reads as black.
 */
function createTexture(gl, unit) {
  const tex = { obj: gl.createTexture(), unit, w: 0, h: 0, version: -1 };
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex.obj);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** (Re)allocate at w x h, at rest. The version resets so the next frame uploads real data. */
function allocate(gl, tex, w, h) {
  if (tex.w === w && tex.h === h) return;
  gl.activeTexture(gl.TEXTURE0 + tex.unit);
  gl.bindTexture(gl.TEXTURE_2D, tex.obj);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, restBytes(w, h));
  Object.assign(tex, { w, h, version: -1 });
}

/** Upload only when the simulation has changed the data since the last upload. */
function upload(gl, tex, bytes, version) {
  if (tex.version === version || !bytes || bytes.length !== tex.w * tex.h * 4) return;
  gl.activeTexture(gl.TEXTURE0 + tex.unit);
  gl.bindTexture(gl.TEXTURE_2D, tex.obj);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, tex.w, tex.h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  tex.version = version;
}

/**
 * One canvas, one full-screen triangle, one fragment shader, two data textures.
 * Resolves to null when WebGL or the shader is unavailable (so the SVG fallback simply stays), or
 * when `signal` aborts while the shader is still compiling.
 * @param {HTMLCanvasElement} canvas
 * @param {{ signal?: AbortSignal }} [opts]
 */
export async function createRenderer(canvas, { signal = new AbortController().signal } = {}) {
  let gl = null;
  try {
    gl = canvas.getContext('webgl', CONTEXT) || canvas.getContext('experimental-webgl');
  } catch {
    gl = null;
  }
  if (!gl) return null;

  // hand the context back so the browser can reclaim it (a second call on a lost context only logs a GL error)
  const lose = () => {
    if (!gl.isContextLost()) gl.getExtension('WEBGL_lose_context')?.loseContext();
  };

  // Try the drop pool this GPU's uniform budget suggests, then 8, then none, moving on only once a
  // candidate has finished compiling and failed.
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  let prog = null;
  let dropN = 0;
  for (const n of dropCandidates(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS))) {
    prog = await link(gl, ext, n, signal);
    if (signal.aborted) break;
    if (prog) { dropN = n; break; }
  }
  if (!prog || signal.aborted) {
    if (prog) gl.deleteProgram(prog);
    lose();
    return null;
  }

  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const loc = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(prog, name)]));
  const surf = createTexture(gl, 0);
  const field = createTexture(gl, 1);
  allocate(gl, surf, 1, 1);
  allocate(gl, field, 1, 1);
  gl.uniform1i(loc.uSurf, 0);
  gl.uniform1i(loc.uField, 1);

  return {
    /** Size of the drop pool this GPU accepted (0 = drops are compiled out). */
    dropN,
    /** The GPU's largest texture side, which caps the water grids. */
    maxTexture: gl.getParameter(gl.MAX_TEXTURE_SIZE),

    /**
     * Size the backing store for the band's CSS size (the governor's quality scales it) and make
     * the water textures match the simulation's grids.
     * @param {{ cols: number, nx: number, ny: number } | null} dims
     */
    resize(cssW, cssH, quality, dims) {
      const { w, h } = canvasSize(cssW, cssH, window.devicePixelRatio, quality);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      if (dims) {
        allocate(gl, surf, dims.cols, 1);
        allocate(gl, field, dims.nx, dims.ny);
      }
    },

    /**
     * @param {number} t seconds
     * @param {object} view what water.view() returned
     */
    draw(t, view) {
      gl.uniform2f(loc.uRes, canvas.width, canvas.height);
      gl.uniform1f(loc.uT, t);
      gl.uniform4f(loc.uSim, canvas.width / canvas.height / 2, view.on ? 1 : 0, SPLASH.streak, 0);
      if (view.on) {
        upload(gl, surf, view.surf, view.surfVersion);
        upload(gl, field, view.field, view.fieldVersion);
        if (dropN > 0) {
          gl.uniform4fv(loc.uDrop, view.drops);
          gl.uniform4f(loc.uDropBox, view.dropBox[0], view.dropBox[1], view.dropBox[2], view.dropBox[3]);
        }
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    /** Delete every GL object, then lose the context. */
    dispose() {
      if (!gl.isContextLost()) {
        gl.deleteTexture(surf.obj);
        gl.deleteTexture(field.obj);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
      }
      lose();
    },
  };
}

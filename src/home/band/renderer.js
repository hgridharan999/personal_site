import { canvasSize } from './iceberg.js';
import { trailCandidates } from './wake.js';
import { VS, buildFragmentShader } from './shader/index.js';

/** Every uniform the shaders declare (uTrail and uTrailBox are absent when the wake is compiled out). */
const UNIFORMS = ['uRes', 'uT', 'uTap', 'uTrailBox', 'uTrail'];
const CONTEXT = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power' };
const POLL_MS = 8;

/** Submit the compile and link without reading any status: reading one blocks until the driver is done. */
function startLink(gl, trailN) {
  const make = (type, src) => {
    const shader = gl.createShader(type);
    if (shader) {
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
    }
    return shader;
  };
  const vs = make(gl.VERTEX_SHADER, VS);
  const fs = make(gl.FRAGMENT_SHADER, buildFragmentShader(trailN));
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
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

/** Compile and link the program for a trail of n entries, or null if this GPU refuses it (or we were aborted). */
async function link(gl, ext, trailN, signal) {
  const job = startLink(gl, trailN);
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
 * One canvas, one full-screen triangle, one fragment shader.
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

  // Try the trail size this GPU's uniform budget suggests, then 8, then no wake at all, moving on
  // only once a candidate has finished compiling and failed.
  const ext = gl.getExtension('KHR_parallel_shader_compile');
  let prog = null;
  let trailN = 0;
  for (const n of trailCandidates(gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS))) {
    prog = await link(gl, ext, n, signal);
    if (signal.aborted) break;
    if (prog) { trailN = n; break; }
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
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const loc = Object.fromEntries(UNIFORMS.map((name) => [name, gl.getUniformLocation(prog, name)]));

  return {
    /** Entries in the trail uniform this GPU accepted (0 = the wake is compiled out). */
    trailN,

    /** Size the backing store for the band's CSS size; the governor's quality scales it. */
    resize(cssW, cssH, quality) {
      const { w, h } = canvasSize(cssW, cssH, window.devicePixelRatio, quality);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
    },

    /**
     * @param {number} t seconds
     * @param {ArrayLike<number>} tap x, y, age, strength
     * @param {Float32Array} trail trailN * 4 floats
     * @param {ArrayLike<number>} box minX, minY, maxX, maxY
     */
    draw(t, tap, trail, box) {
      gl.uniform2f(loc.uRes, canvas.width, canvas.height);
      gl.uniform1f(loc.uT, t);
      gl.uniform4f(loc.uTap, tap[0], tap[1], tap[2], tap[3]);
      if (trailN > 0) {
        gl.uniform4fv(loc.uTrail, trail);
        gl.uniform4f(loc.uTrailBox, box[0], box[1], box[2], box[3]);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    /** Delete every GL object, then lose the context. */
    dispose() {
      if (!gl.isContextLost()) {
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
      }
      lose();
    },
  };
}

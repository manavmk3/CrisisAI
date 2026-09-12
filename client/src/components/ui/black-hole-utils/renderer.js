const VERTEX_SHADER = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform float uTime;
uniform vec2 uResolution;
uniform float uScroll;

#define PI 3.14159265359

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 rot = mat2(0.87, 0.48, -0.48, 0.87);
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = rot * p * 2.0 + vec2(100.0);
    a *= 0.5;
  }
  return v;
}

float stars(vec3 rd) {
  vec2 uv = vec2(atan(rd.z, rd.x), asin(clamp(rd.y, -1.0, 1.0)));
  uv = uv * vec2(1.0 / PI, 2.0 / PI) * 0.5 + 0.5;
  vec2 id = floor(uv * 600.0);
  float h = hash(id);
  float star = step(0.997, h);
  float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + h * 100.0);
  return star * h * twinkle;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution) / min(uResolution.x, uResolution.y);

  float autoRotate = uTime * 0.03;
  float scrollRotate = uScroll * 2.5;
  float azimuth = autoRotate + scrollRotate;

  float baseElev = 0.12;
  float scrollElev = uScroll * 0.35;
  float elev = baseElev + scrollElev;

  float camDist = 28.0;
  vec3 eye = vec3(
    sin(azimuth) * cos(elev) * camDist,
    sin(elev) * camDist,
    cos(azimuth) * cos(elev) * camDist
  );

  vec3 target = vec3(0.0);
  vec3 fwd = normalize(target - eye);
  vec3 worldUp = vec3(0.0, 1.0, 0.0);
  vec3 rgt = normalize(cross(worldUp, fwd));
  vec3 up  = cross(fwd, rgt);

  vec3 rd = normalize(uv.x * rgt + uv.y * up + 2.5 * fwd);
  vec3 pos = eye;
  vec3 vel = rd;

  vec3 col = vec3(0.0);
  float acc = 0.0;

  for (int i = 0; i < 100; i++) {
    float r = length(pos);

    if (r < 1.0) break;

    vec3 angMom = cross(pos, vel);
    float h2 = dot(angMom, angMom);
    float r5 = r * r * r * r * r;
    vec3 grav = -1.5 * h2 / r5 * pos;

    float dt = max(0.01, min(0.5, 0.08 * (r - 1.0)));

    vel += grav * dt;
    vec3 np = pos + vel * dt;

    if (pos.y * np.y < 0.0) {
      float t = -pos.y / (np.y - pos.y + 1e-9);
      vec3 hp = pos + t * (np - pos);
      float hr = length(vec2(hp.x, hp.z));

      float innerR = 1.5;
      float outerR = 10.0;

      if (hr > innerR && hr < outerR) {
        float ang = atan(hp.z, hp.x) + uTime * 0.4;
        float nr = (hr - innerR) / (outerR - innerR);

        float T = (1.0 - pow(nr, 0.45)) * 4.0;

        float tex = 0.3 + 0.7 * fbm(vec2(hr * 2.5, ang * 3.0 / PI));
        float streaks = 0.5 + 0.5 * noise(vec2(ang * 8.0 / PI - uTime * 0.15, hr * 3.0));

        float dop = 1.0 + 0.3 * cos(ang);

        vec3 dc;
        dc.r = T * 1.1 * dop;
        dc.g = max(0.0, T * 0.55 - 0.1) * dop;
        dc.b = max(0.0, T * 0.15 - 0.2) * dop;

        dc *= tex * streaks;
        dc *= smoothstep(outerR, 2.5, hr);
        dc *= smoothstep(innerR - 0.2, innerR + 1.0, hr);

        dc += vec3(1.5, 1.4, 1.1) * exp(-nr * 6.0);

        float alpha = 0.9 * (1.0 - nr * 0.4);
        col += dc * (1.0 - acc) * alpha;
        acc = min(1.0, acc + alpha * 0.65);
      }
    }

    pos = np;

    if (r > 50.0) {
      float s = stars(normalize(vel));
      col += vec3(s * 0.6, s * 0.65, s * 0.9) * (1.0 - acc);
      break;
    }
  }

  float d = length(uv);
  col += vec3(1.0, 0.6, 0.2) * 0.003 / (d * d + 0.005) * 0.08;

  col = col / (1.0 + col);
  col = pow(col, vec3(0.87));

  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader compile error: ' + info);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    throw new Error('Program link error: ' + info);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export function createRenderer({ canvas }) {
  const gl =
    canvas.getContext('webgl', { antialias: false, alpha: false }) ||
    canvas.getContext('experimental-webgl', { antialias: false, alpha: false });

  if (!gl) {
    return { ready: Promise.resolve(), setScroll() {}, dispose() {} };
  }

  const program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);

  const posLoc = gl.getAttribLocation(program, 'position');
  const uTimeLoc = gl.getUniformLocation(program, 'uTime');
  const uResLoc = gl.getUniformLocation(program, 'uResolution');
  const uScrollLoc = gl.getUniformLocation(program, 'uScroll');

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW
  );

  gl.useProgram(program);
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  let raf = null;
  let dead = false;
  let scrollValue = 0;
  let smoothScroll = 0;
  const t0 = performance.now();

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = (canvas.clientWidth * dpr) | 0;
    const h = (canvas.clientHeight * dpr) | 0;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function frame() {
    if (dead) return;
    resize();

    smoothScroll += (scrollValue - smoothScroll) * 0.08;

    gl.uniform1f(uTimeLoc, (performance.now() - t0) / 1000);
    gl.uniform2f(uResLoc, canvas.width, canvas.height);
    gl.uniform1f(uScrollLoc, smoothScroll);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return {
    ready: Promise.resolve(),
    setScroll(v) {
      scrollValue = v;
    },
    dispose() {
      dead = true;
      if (raf !== null) cancelAnimationFrame(raf);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    },
  };
}

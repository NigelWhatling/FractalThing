import {
  GPU_VERTEX_SHADER,
  buildFragmentShaderSource,
} from '../../util/gpuShaders';
import { DOUBLE_SINGLE_MANTISSA_BITS } from '../precisionLimits';
import {
  WEBGL_FIXED_PALETTE_ITERATIONS,
  WEBGL_LIMB_PROFILE_DEFINITIONS,
  WEBGL_MAX_ITERATIONS,
  type WebGLBounds,
  type WebGLFragmentPrecision,
  type WebGLLimbProfileId,
  type WebGLRenderRequest,
  type WebGLRendererCapabilities,
  type WebGLRendererOptions,
  type WebGLRenderState,
  type WebGLRenderSubmission,
  type WebGLRenderTiming,
} from './types';
import {
  buildDecimalLimbVectors,
  buildLimbVectors,
  LIMB_BASE,
  LIMB_COUNT,
  type LimbVectors,
} from './limbMath';
import {
  probeShaderDoubleBits,
  resolveShaderDoubleBits,
} from './precisionProbe';

const DEFAULT_JULIA = { real: -0.8, imag: 0.156 } as const;

/**
 * Timer queries differ between WebGL versions: WebGL1's
 * `EXT_disjoint_timer_query` carries the whole API (`createQueryEXT` and
 * friends), whereas in WebGL2 queries are core (`gl.createQuery`) and the
 * extension supplies only the two timer constants. This is the WebGL2 shape,
 * adapted to the call sites.
 */
type GpuTimerExtension = {
  TIME_ELAPSED_EXT: number;
  QUERY_RESULT_AVAILABLE_EXT: number;
  QUERY_RESULT_EXT: number;
  GPU_DISJOINT_EXT: number;
  createQueryEXT: () => unknown;
  beginQueryEXT: (target: number, query: unknown) => void;
  endQueryEXT: (target: number) => void;
  getQueryObjectEXT: (query: unknown, pname: number) => number | boolean;
  deleteQueryEXT: (query: unknown) => void;
};

type TimerConstants = {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
};

const createGpuTimer = (
  gl: WebGL2RenderingContext,
): GpuTimerExtension | null => {
  const constants = gl.getExtension(
    'EXT_disjoint_timer_query_webgl2',
  ) as TimerConstants | null;
  if (!constants) {
    return null;
  }
  return {
    TIME_ELAPSED_EXT: constants.TIME_ELAPSED_EXT,
    GPU_DISJOINT_EXT: constants.GPU_DISJOINT_EXT,
    QUERY_RESULT_AVAILABLE_EXT: gl.QUERY_RESULT_AVAILABLE,
    QUERY_RESULT_EXT: gl.QUERY_RESULT,
    createQueryEXT: () => gl.createQuery(),
    beginQueryEXT: (target, query) =>
      gl.beginQuery(target, query as WebGLQuery),
    endQueryEXT: (target) => gl.endQuery(target),
    getQueryObjectEXT: (query, pname) =>
      gl.getQueryParameter(query as WebGLQuery, pname) as number | boolean,
    deleteQueryEXT: (query) => gl.deleteQuery(query as WebGLQuery),
  };
};

type UniformLocations = {
  resolution: WebGLUniformLocation | null;
  x0: WebGLUniformLocation | null;
  y0: WebGLUniformLocation | null;
  xScale: WebGLUniformLocation | null;
  yScale: WebGLUniformLocation | null;
  x0LimbLo: WebGLUniformLocation | null;
  x0LimbMid: WebGLUniformLocation | null;
  x0LimbHi: WebGLUniformLocation | null;
  y0LimbLo: WebGLUniformLocation | null;
  y0LimbMid: WebGLUniformLocation | null;
  y0LimbHi: WebGLUniformLocation | null;
  xScaleLimbLo: WebGLUniformLocation | null;
  xScaleLimbMid: WebGLUniformLocation | null;
  xScaleLimbHi: WebGLUniformLocation | null;
  yScaleLimbLo: WebGLUniformLocation | null;
  yScaleLimbMid: WebGLUniformLocation | null;
  yScaleLimbHi: WebGLUniformLocation | null;
  x0Hi: WebGLUniformLocation | null;
  x0Lo: WebGLUniformLocation | null;
  y0Hi: WebGLUniformLocation | null;
  y0Lo: WebGLUniformLocation | null;
  xScaleHi: WebGLUniformLocation | null;
  xScaleLo: WebGLUniformLocation | null;
  yScaleHi: WebGLUniformLocation | null;
  yScaleLo: WebGLUniformLocation | null;
  max: WebGLUniformLocation | null;
  pscale: WebGLUniformLocation | null;
  paletteSize: WebGLUniformLocation | null;
  colourMode: WebGLUniformLocation | null;
  smooth: WebGLUniformLocation | null;
  ditherStrength: WebGLUniformLocation | null;
  algorithm: WebGLUniformLocation | null;
  useDouble: WebGLUniformLocation | null;
  one: WebGLUniformLocation | null;
  useLimb: WebGLUniformLocation | null;
  julia: WebGLUniformLocation | null;
  palette: WebGLUniformLocation | null;
};

type ProgramBundle = {
  program: WebGLProgram;
  uniforms: UniformLocations;
  positionLocation: number;
};

type PendingTimerQuery = {
  query: unknown;
  renderId: number;
  iterationCap: number;
  cpuSubmitMs: number;
};

const initialCapabilities = (): WebGLRendererCapabilities => ({
  available: false,
  contextLost: false,
  webglVersion: 2,
  fragmentPrecision: null,
  supportsSinglePrecision: false,
  supportsDoubleDoublePrecision: false,
  supportedLimbProfiles: [],
  supportsTimerQuery: false,
  maxIterations: WEBGL_MAX_ITERATIONS,
  unsupportedColourModes: ['distribution'],
  failureReason: null,
});

const initialState = (): WebGLRenderState => ({
  renderId: null,
  status: 'idle',
  passIndex: 0,
  passCount: 0,
  iterationCap: null,
  message: null,
});

const cloneCapabilities = (
  capabilities: WebGLRendererCapabilities,
): WebGLRendererCapabilities => ({
  ...capabilities,
  supportedLimbProfiles: [...capabilities.supportedLimbProfiles],
  unsupportedColourModes: [...capabilities.unsupportedColourModes],
});

const cloneState = (state: WebGLRenderState): WebGLRenderState => ({
  ...state,
});

const getProfile = (profileId: WebGLLimbProfileId | undefined) =>
  WEBGL_LIMB_PROFILE_DEFINITIONS.find((profile) => profile.id === profileId) ??
  WEBGL_LIMB_PROFILE_DEFINITIONS[0];

const splitFloat = (value: number) => {
  const hi = Math.fround(value);
  return { hi, lo: value - hi };
};

const resolveAlgorithmIndex = (algorithm: WebGLRenderRequest['algorithm']) => {
  switch (algorithm) {
    case 'julia':
      return 1;
    case 'burning-ship':
      return 2;
    case 'tricorn':
      return 3;
    case 'multibrot-3':
      return 4;
    case 'mandelbrot':
    default:
      return 0;
  }
};

const normaliseIterationSteps = (request: WebGLRenderRequest) => {
  const finalCap = Math.min(
    WEBGL_MAX_ITERATIONS,
    Math.max(1, Math.round(request.maxIterations)),
  );
  const requestedSteps =
    request.iterationSteps && request.iterationSteps.length > 0
      ? request.iterationSteps
      : [finalCap];
  const steps: number[] = [];

  for (const requestedStep of requestedSteps) {
    if (!Number.isFinite(requestedStep)) {
      continue;
    }
    const step = Math.min(finalCap, Math.max(1, Math.round(requestedStep)));
    if (steps[steps.length - 1] !== step) {
      steps.push(step);
    }
  }

  if (steps[steps.length - 1] !== finalCap) {
    steps.push(finalCap);
  }
  return steps;
};

const isFiniteBounds = (bounds: WebGLBounds) =>
  Number.isFinite(bounds.x0) &&
  Number.isFinite(bounds.y0) &&
  Number.isFinite(bounds.xScale) &&
  Number.isFinite(bounds.yScale) &&
  bounds.xScale > 0 &&
  bounds.yScale > 0;

export class WebGLRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly options: WebGLRendererOptions;
  private readonly requestFrame: (callback: FrameRequestCallback) => number;
  private readonly cancelFrame: (handle: number) => void;

  private gl: WebGL2RenderingContext | null = null;
  private baseProgram: ProgramBundle | null = null;
  private readonly limbPrograms = new Map<WebGLLimbProfileId, ProgramBundle>();
  private buffer: WebGLBuffer | null = null;
  private paletteTexture: WebGLTexture | null = null;
  private timerExtension: GpuTimerExtension | null = null;
  private pendingTimerQuery: PendingTimerQuery | null = null;
  private timerFrame: number | null = null;
  private progressiveFrame: number | null = null;
  private renderSequence = 0;
  private activeRenderId: number | null = null;
  private lastAcceptedRequest: WebGLRenderRequest | null = null;
  private capabilities = initialCapabilities();
  private state = initialState();
  private lastTiming: WebGLRenderTiming | null = null;
  private disposed = false;

  public constructor(
    canvas: HTMLCanvasElement,
    options: WebGLRendererOptions = {},
  ) {
    this.canvas = canvas;
    this.options = options;
    this.requestFrame =
      options.requestAnimationFrame ??
      ((callback) => globalThis.requestAnimationFrame(callback));
    this.cancelFrame =
      options.cancelAnimationFrame ??
      ((handle) => globalThis.cancelAnimationFrame(handle));

    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );
    this.initialise();
  }

  public getCapabilities(): WebGLRendererCapabilities {
    return cloneCapabilities(this.capabilities);
  }

  public getState(): WebGLRenderState {
    return cloneState(this.state);
  }

  public getLastTiming(): WebGLRenderTiming | null {
    return this.lastTiming ? { ...this.lastTiming } : null;
  }

  public resize(width: number, height: number): boolean {
    if (this.disposed) {
      return false;
    }
    const nextWidth = Math.max(0, Math.round(width));
    const nextHeight = Math.max(0, Math.round(height));
    const changed =
      this.canvas.width !== nextWidth || this.canvas.height !== nextHeight;
    if (changed) {
      this.canvas.width = nextWidth;
      this.canvas.height = nextHeight;
    }
    if (this.gl && !this.capabilities.contextLost) {
      this.gl.viewport(0, 0, nextWidth, nextHeight);
    }
    return changed;
  }

  public render(request: WebGLRenderRequest): WebGLRenderSubmission {
    const renderId = this.renderSequence + 1;
    this.renderSequence = renderId;
    this.cancelCurrentRender('Superseded by a newer render', true);

    const validationError = this.validateRequest(request);
    if (validationError) {
      const status = this.capabilities.contextLost ? 'context-lost' : 'error';
      this.setState({
        renderId,
        status,
        passIndex: 0,
        passCount: 0,
        iterationCap: null,
        message: validationError,
      });
      if (this.gl && !this.capabilities.contextLost) {
        this.clear();
      }
      return {
        renderId,
        accepted: false,
        passCount: 0,
        reason: validationError,
      };
    }

    const steps = normaliseIterationSteps(request);
    this.lastAcceptedRequest = request;
    this.activeRenderId = renderId;
    this.uploadPalette(request.palette);
    this.setState({
      renderId,
      status: 'rendering',
      passIndex: 0,
      passCount: steps.length,
      iterationCap: steps[0],
      message: null,
    });

    this.drawPass(request, renderId, steps, 0);
    return {
      renderId,
      accepted: true,
      passCount: steps.length,
      reason: null,
    };
  }

  public cancel(reason = 'Render cancelled'): void {
    this.cancelCurrentRender(reason, true);
  }

  public clear(): void {
    const gl = this.gl;
    if (!gl || this.capabilities.contextLost || this.disposed) {
      return;
    }
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.cancelCurrentRender('Renderer disposed', false);
    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener(
      'webglcontextrestored',
      this.handleContextRestored,
    );
    this.releaseResources(!this.capabilities.contextLost);
    this.capabilities = {
      ...initialCapabilities(),
      failureReason: 'Renderer disposed',
    };
    this.emitCapabilities();
    this.setState({
      renderId: null,
      status: 'disposed',
      passIndex: 0,
      passCount: 0,
      iterationCap: null,
      message: 'Renderer disposed',
    });
  }

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    if (this.disposed) {
      return;
    }
    const lostRenderId = this.activeRenderId;
    this.cancelCurrentRender('WebGL context lost', false, false);
    this.releaseResources(false);
    this.capabilities = {
      ...initialCapabilities(),
      contextLost: true,
      failureReason: 'WebGL context lost',
    };
    this.emitCapabilities();
    this.setState({
      renderId: lostRenderId,
      status: 'context-lost',
      passIndex: 0,
      passCount: 0,
      iterationCap: null,
      message: 'WebGL context lost',
    });
  };

  private readonly handleContextRestored = () => {
    if (this.disposed) {
      return;
    }
    this.capabilities = initialCapabilities();
    this.initialise();
    if (
      this.capabilities.available &&
      this.lastAcceptedRequest &&
      this.options.restoreLastRender !== false
    ) {
      this.render(this.lastAcceptedRequest);
    }
  };

  private initialise(): void {
    // WebGL2 specifically: the double-single path needs GLSL ES 3.00 bit
    // operations for an exact mantissa split. Without it the GPU backend
    // reports unavailable and the app falls back to the CPU renderer.
    const gl = this.canvas.getContext('webgl2', {
      preserveDrawingBuffer: true,
      antialias: false,
    });
    if (!gl) {
      this.failInitialisation('WebGL2 unavailable');
      return;
    }

    const fragmentPrecision: WebGLFragmentPrecision =
      (gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)
        ?.precision ?? 0) > 0
        ? 'highp'
        : 'mediump';
    const doubleDoubleMantissaBits =
      fragmentPrecision === 'highp'
        ? resolveShaderDoubleBits(probeShaderDoubleBits(gl))
        : null;
    const baseProgram = this.createProgram(gl, fragmentPrecision, false);
    if (!baseProgram) {
      this.failInitialisation('Base WebGL shader failed to compile or link');
      return;
    }

    const limbPrograms = new Map<WebGLLimbProfileId, ProgramBundle>();
    if (fragmentPrecision === 'highp') {
      for (const profile of WEBGL_LIMB_PROFILE_DEFINITIONS) {
        const program = this.createProgram(
          gl,
          fragmentPrecision,
          true,
          profile.fractionalLimbs,
        );
        if (program) {
          limbPrograms.set(profile.id, program);
        }
      }
    }

    const buffer = gl.createBuffer();
    if (!buffer) {
      gl.deleteProgram(baseProgram.program);
      limbPrograms.forEach((bundle) => gl.deleteProgram(bundle.program));
      this.failInitialisation('Unable to allocate the WebGL vertex buffer');
      return;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW,
    );

    const paletteTexture = gl.createTexture();
    if (!paletteTexture) {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(baseProgram.program);
      limbPrograms.forEach((bundle) => gl.deleteProgram(bundle.program));
      this.failInitialisation('Unable to allocate the WebGL palette texture');
      return;
    }
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );

    this.gl = gl;
    this.baseProgram = baseProgram;
    this.buffer = buffer;
    this.paletteTexture = paletteTexture;
    this.limbPrograms.clear();
    limbPrograms.forEach((bundle, profileId) => {
      this.limbPrograms.set(profileId, bundle);
    });
    this.timerExtension = createGpuTimer(gl);

    this.bindPaletteSampler(baseProgram);
    this.limbPrograms.forEach((bundle) => this.bindPaletteSampler(bundle));
    this.resize(this.canvas.width, this.canvas.height);

    const supportedLimbProfiles = WEBGL_LIMB_PROFILE_DEFINITIONS.filter(
      (profile) => this.limbPrograms.has(profile.id),
    ).map((profile) => profile.id);
    this.capabilities = {
      available: true,
      contextLost: false,
      webglVersion: 2,
      fragmentPrecision,
      supportsSinglePrecision: true,
      supportsDoubleDoublePrecision:
        doubleDoubleMantissaBits === DOUBLE_SINGLE_MANTISSA_BITS,
      supportedLimbProfiles,
      supportsTimerQuery: Boolean(this.timerExtension),
      maxIterations: WEBGL_MAX_ITERATIONS,
      unsupportedColourModes: ['distribution'],
      failureReason: null,
    };
    this.emitCapabilities();
    this.setState(initialState());
  }

  private failInitialisation(message: string): void {
    this.capabilities = {
      ...initialCapabilities(),
      failureReason: message,
    };
    this.emitCapabilities();
    this.setState({
      renderId: null,
      status: 'unavailable',
      passIndex: 0,
      passCount: 0,
      iterationCap: null,
      message,
    });
    this.options.onError?.(message);
  }

  private createProgram(
    gl: WebGL2RenderingContext,
    precision: WebGLFragmentPrecision,
    includeLimb: boolean,
    limbFractional = 4,
  ): ProgramBundle | null {
    const vertexShader = this.createShader(
      gl,
      gl.VERTEX_SHADER,
      GPU_VERTEX_SHADER,
    );
    const fragmentShader = this.createShader(
      gl,
      gl.FRAGMENT_SHADER,
      buildFragmentShaderSource(
        WEBGL_MAX_ITERATIONS,
        precision,
        includeLimb,
        limbFractional,
        LIMB_COUNT,
      ),
    );
    if (!vertexShader || !fragmentShader) {
      if (vertexShader) {
        gl.deleteShader(vertexShader);
      }
      if (fragmentShader) {
        gl.deleteShader(fragmentShader);
      }
      return null;
    }

    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return null;
    }
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const detail = gl.getProgramInfoLog(program);
      this.options.onError?.('WebGL program link failed', detail);
      gl.deleteProgram(program);
      return null;
    }

    return {
      program,
      uniforms: this.buildUniforms(gl, program),
      positionLocation: gl.getAttribLocation(program, 'a_position'),
    };
  }

  private createShader(
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
  ): WebGLShader | null {
    const shader = gl.createShader(type);
    if (!shader) {
      return null;
    }
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const detail = gl.getShaderInfoLog(shader);
      this.options.onError?.('WebGL shader compile failed', detail);
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  private buildUniforms(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
  ): UniformLocations {
    return {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      x0: gl.getUniformLocation(program, 'u_x0'),
      y0: gl.getUniformLocation(program, 'u_y0'),
      xScale: gl.getUniformLocation(program, 'u_xScale'),
      yScale: gl.getUniformLocation(program, 'u_yScale'),
      x0LimbLo: gl.getUniformLocation(program, 'u_x0_limb_lo'),
      x0LimbMid: gl.getUniformLocation(program, 'u_x0_limb_mid'),
      x0LimbHi: gl.getUniformLocation(program, 'u_x0_limb_hi'),
      y0LimbLo: gl.getUniformLocation(program, 'u_y0_limb_lo'),
      y0LimbMid: gl.getUniformLocation(program, 'u_y0_limb_mid'),
      y0LimbHi: gl.getUniformLocation(program, 'u_y0_limb_hi'),
      xScaleLimbLo: gl.getUniformLocation(program, 'u_xScale_limb_lo'),
      xScaleLimbMid: gl.getUniformLocation(program, 'u_xScale_limb_mid'),
      xScaleLimbHi: gl.getUniformLocation(program, 'u_xScale_limb_hi'),
      yScaleLimbLo: gl.getUniformLocation(program, 'u_yScale_limb_lo'),
      yScaleLimbMid: gl.getUniformLocation(program, 'u_yScale_limb_mid'),
      yScaleLimbHi: gl.getUniformLocation(program, 'u_yScale_limb_hi'),
      x0Hi: gl.getUniformLocation(program, 'u_x0_hi'),
      x0Lo: gl.getUniformLocation(program, 'u_x0_lo'),
      y0Hi: gl.getUniformLocation(program, 'u_y0_hi'),
      y0Lo: gl.getUniformLocation(program, 'u_y0_lo'),
      xScaleHi: gl.getUniformLocation(program, 'u_xScale_hi'),
      xScaleLo: gl.getUniformLocation(program, 'u_xScale_lo'),
      yScaleHi: gl.getUniformLocation(program, 'u_yScale_hi'),
      yScaleLo: gl.getUniformLocation(program, 'u_yScale_lo'),
      max: gl.getUniformLocation(program, 'u_max'),
      pscale: gl.getUniformLocation(program, 'u_pscale'),
      paletteSize: gl.getUniformLocation(program, 'u_paletteSize'),
      colourMode: gl.getUniformLocation(program, 'u_colourMode'),
      smooth: gl.getUniformLocation(program, 'u_smooth'),
      ditherStrength: gl.getUniformLocation(program, 'u_ditherStrength'),
      algorithm: gl.getUniformLocation(program, 'u_algorithm'),
      useDouble: gl.getUniformLocation(program, 'u_useDouble'),
      one: gl.getUniformLocation(program, 'u_one'),
      useLimb: gl.getUniformLocation(program, 'u_useLimb'),
      julia: gl.getUniformLocation(program, 'u_julia'),
      palette: gl.getUniformLocation(program, 'u_palette'),
    };
  }

  private bindPaletteSampler(bundle: ProgramBundle): void {
    const gl = this.gl;
    if (!gl || bundle.uniforms.palette === null) {
      return;
    }
    gl.useProgram(bundle.program);
    gl.uniform1i(bundle.uniforms.palette, 0);
  }

  private validateRequest(request: WebGLRenderRequest): string | null {
    if (this.disposed) {
      return 'Renderer disposed';
    }
    if (this.capabilities.contextLost) {
      return 'WebGL context lost';
    }
    if (
      !this.capabilities.available ||
      !this.gl ||
      !this.baseProgram ||
      !this.buffer ||
      !this.paletteTexture
    ) {
      return this.capabilities.failureReason ?? 'WebGL unavailable';
    }
    if (this.canvas.width <= 0 || this.canvas.height <= 0) {
      return 'Canvas dimensions must be greater than zero';
    }
    if (!isFiniteBounds(request.bounds)) {
      return 'Render bounds must be finite with positive pixel scales';
    }
    if (!Number.isFinite(request.maxIterations) || request.maxIterations <= 0) {
      return 'Maximum iterations must be greater than zero';
    }
    if (request.palette.length < 2) {
      return 'A palette requires at least two colours';
    }
    if (request.palette.some((colour) => colour.length < 3)) {
      return 'Every palette colour requires red, green, and blue channels';
    }
    if (request.colourMode === 'distribution') {
      return 'GPU rendering does not support distribution colouring';
    }
    if (
      request.precision === 'double' &&
      !this.capabilities.supportsDoubleDoublePrecision
    ) {
      return 'GPU double-double precision is unavailable on this WebGL implementation';
    }
    if (request.precision === 'limb') {
      const profile = getProfile(request.limbProfile);
      if (!this.limbPrograms.has(profile.id)) {
        return `GPU limb profile ${profile.id} is unavailable`;
      }
      if (!this.isLimbRangeValid(request.bounds, profile.fractionalLimbs)) {
        return `GPU limb profile ${profile.id} is too fine for this view`;
      }
    }
    return null;
  }

  private isLimbRangeValid(bounds: WebGLBounds, fractional: number): boolean {
    const maxValue =
      ((LIMB_BASE / 2) * (LIMB_BASE ** LIMB_COUNT - 1)) /
      (LIMB_BASE - 1) /
      LIMB_BASE ** fractional;
    const x1 = bounds.x0 + bounds.xScale * this.canvas.width;
    const y1 = bounds.y0 + bounds.yScale * this.canvas.height;
    const maxAbs = Math.max(
      Math.abs(bounds.x0),
      Math.abs(x1),
      Math.abs(bounds.y0),
      Math.abs(y1),
    );
    return maxAbs <= maxValue;
  }

  private uploadPalette(palette: WebGLRenderRequest['palette']): void {
    const gl = this.gl;
    if (!gl || !this.paletteTexture) {
      return;
    }
    const paletteData = new Uint8Array(palette.length * 4);
    palette.forEach((colour, index) => {
      const offset = index * 4;
      paletteData[offset] = Math.min(255, Math.max(0, Math.round(colour[0])));
      paletteData[offset + 1] = Math.min(
        255,
        Math.max(0, Math.round(colour[1])),
      );
      paletteData[offset + 2] = Math.min(
        255,
        Math.max(0, Math.round(colour[2])),
      );
      paletteData[offset + 3] = 255;
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.paletteTexture);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      palette.length,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      paletteData,
    );
  }

  private drawPass(
    request: WebGLRenderRequest,
    renderId: number,
    steps: readonly number[],
    passIndex: number,
  ): void {
    if (
      this.activeRenderId !== renderId ||
      this.disposed ||
      this.capabilities.contextLost
    ) {
      return;
    }

    const gl = this.gl;
    const profile = getProfile(request.limbProfile);
    const useLimb = request.precision === 'limb';
    const bundle = useLimb
      ? (this.limbPrograms.get(profile.id) ?? null)
      : this.baseProgram;
    const paletteTexture = this.paletteTexture;
    const buffer = this.buffer;
    if (!gl || !bundle || !paletteTexture || !buffer) {
      this.failActiveRender(renderId, 'WebGL resources are unavailable');
      return;
    }

    const iterationCap = steps[passIndex];
    const finalPass = passIndex === steps.length - 1;
    const colourMax = Math.min(
      WEBGL_MAX_ITERATIONS,
      Math.max(1, Math.round(request.maxIterations)),
    );
    const paletteSize = request.palette.length;
    const pscale =
      request.colourMode === 'normalize'
        ? (paletteSize - 1) / colourMax
        : request.colourMode === 'cycle'
          ? (paletteSize - 1) / Math.max(1, request.colourPeriod)
          : (paletteSize - 1) / WEBGL_FIXED_PALETTE_ITERATIONS;
    const colourModeIndex =
      request.colourMode === 'cycle'
        ? 1
        : request.colourMode === 'fixed'
          ? 2
          : 0;
    const julia = request.julia ?? DEFAULT_JULIA;
    const { x0, y0, xScale, yScale } = request.bounds;
    const x0Split = splitFloat(x0);
    const y0Split = splitFloat(y0);
    const xScaleSplit = splitFloat(xScale);
    const yScaleSplit = splitFloat(yScale);
    const x0Limb = useLimb
      ? request.bounds.preciseX0
        ? buildDecimalLimbVectors(
            request.bounds.preciseX0,
            profile.fractionalLimbs,
          )
        : buildLimbVectors(x0, profile.fractionalLimbs)
      : null;
    const y0Limb = useLimb
      ? request.bounds.preciseY0
        ? buildDecimalLimbVectors(
            request.bounds.preciseY0,
            profile.fractionalLimbs,
          )
        : buildLimbVectors(y0, profile.fractionalLimbs)
      : null;
    const xScaleLimb = useLimb
      ? buildLimbVectors(xScale, profile.fractionalLimbs)
      : null;
    const yScaleLimb = useLimb
      ? buildLimbVectors(yScale, profile.fractionalLimbs)
      : null;

    gl.useProgram(bundle.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    if (bundle.positionLocation !== -1) {
      gl.enableVertexAttribArray(bundle.positionLocation);
      gl.vertexAttribPointer(bundle.positionLocation, 2, gl.FLOAT, false, 0, 0);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, paletteTexture);

    const uniforms = bundle.uniforms;
    this.setUniform2f(
      uniforms.resolution,
      this.canvas.width,
      this.canvas.height,
    );
    this.setUniform1f(uniforms.x0, x0);
    this.setUniform1f(uniforms.y0, y0);
    this.setUniform1f(uniforms.xScale, xScale);
    this.setUniform1f(uniforms.yScale, yScale);
    this.setLimbUniforms(uniforms, x0Limb, y0Limb, xScaleLimb, yScaleLimb);
    this.setUniform1f(uniforms.x0Hi, x0Split.hi);
    this.setUniform1f(uniforms.x0Lo, x0Split.lo);
    this.setUniform1f(uniforms.y0Hi, y0Split.hi);
    this.setUniform1f(uniforms.y0Lo, y0Split.lo);
    this.setUniform1f(uniforms.xScaleHi, xScaleSplit.hi);
    this.setUniform1f(uniforms.xScaleLo, xScaleSplit.lo);
    this.setUniform1f(uniforms.yScaleHi, yScaleSplit.hi);
    this.setUniform1f(uniforms.yScaleLo, yScaleSplit.lo);
    this.setUniform1f(uniforms.max, iterationCap);
    this.setUniform1f(uniforms.pscale, pscale);
    this.setUniform1f(uniforms.paletteSize, paletteSize);
    this.setUniform1f(uniforms.colourMode, colourModeIndex);
    if (uniforms.smooth !== null) {
      gl.uniform1i(uniforms.smooth, request.smooth ? 1 : 0);
    }
    this.setUniform1f(
      uniforms.ditherStrength,
      Math.max(0, request.ditherStrength),
    );
    this.setUniform1f(
      uniforms.algorithm,
      resolveAlgorithmIndex(request.algorithm),
    );
    this.setUniform1f(
      uniforms.useDouble,
      request.precision === 'double' ? 1 : 0,
    );
    this.setUniform1f(uniforms.useLimb, useLimb ? 1 : 0);
    // Exactly 1.0 — see the ddTwoSum comment in the shader.
    this.setUniform1f(uniforms.one, 1);
    this.setUniform2f(uniforms.julia, julia.real, julia.imag);

    let timerStarted = false;
    let query: unknown | null = null;
    if (finalPass && this.timerExtension && !this.pendingTimerQuery) {
      query = this.timerExtension.createQueryEXT();
      if (query) {
        this.timerExtension.beginQueryEXT(
          this.timerExtension.TIME_ELAPSED_EXT,
          query,
        );
        timerStarted = true;
      }
    }

    const cpuStart = performance.now();
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    const cpuSubmitMs = Math.max(0, performance.now() - cpuStart);

    if (timerStarted && query && this.timerExtension) {
      this.timerExtension.endQueryEXT(this.timerExtension.TIME_ELAPSED_EXT);
      this.pendingTimerQuery = {
        query,
        renderId,
        iterationCap,
        cpuSubmitMs,
      };
      this.scheduleTimerPoll();
    }

    if (finalPass) {
      this.emitTiming({
        renderId,
        iterationCap,
        source: 'cpu-submit',
        cpuSubmitMs,
        gpuElapsedMs: null,
      });
      this.activeRenderId = null;
      this.progressiveFrame = null;
      this.setState({
        renderId,
        status: 'complete',
        passIndex,
        passCount: steps.length,
        iterationCap,
        message: null,
      });
      return;
    }

    this.setState({
      renderId,
      status: 'rendering',
      passIndex,
      passCount: steps.length,
      iterationCap,
      message: null,
    });
    this.progressiveFrame = this.requestFrame(() => {
      this.progressiveFrame = null;
      if (this.activeRenderId !== renderId) {
        return;
      }
      this.drawPass(request, renderId, steps, passIndex + 1);
    });
  }

  private setLimbUniforms(
    uniforms: UniformLocations,
    x0: LimbVectors | null,
    y0: LimbVectors | null,
    xScale: LimbVectors | null,
    yScale: LimbVectors | null,
  ): void {
    if (!x0 || !y0 || !xScale || !yScale) {
      return;
    }
    this.setUniform4f(uniforms.x0LimbLo, x0.lo);
    this.setUniform4f(uniforms.x0LimbMid, x0.mid);
    this.setUniform4f(uniforms.x0LimbHi, x0.hi);
    this.setUniform4f(uniforms.y0LimbLo, y0.lo);
    this.setUniform4f(uniforms.y0LimbMid, y0.mid);
    this.setUniform4f(uniforms.y0LimbHi, y0.hi);
    this.setUniform4f(uniforms.xScaleLimbLo, xScale.lo);
    this.setUniform4f(uniforms.xScaleLimbMid, xScale.mid);
    this.setUniform4f(uniforms.xScaleLimbHi, xScale.hi);
    this.setUniform4f(uniforms.yScaleLimbLo, yScale.lo);
    this.setUniform4f(uniforms.yScaleLimbMid, yScale.mid);
    this.setUniform4f(uniforms.yScaleLimbHi, yScale.hi);
  }

  private setUniform1f(
    location: WebGLUniformLocation | null,
    value: number,
  ): void {
    if (this.gl && location !== null) {
      this.gl.uniform1f(location, value);
    }
  }

  private setUniform2f(
    location: WebGLUniformLocation | null,
    x: number,
    y: number,
  ): void {
    if (this.gl && location !== null) {
      this.gl.uniform2f(location, x, y);
    }
  }

  private setUniform4f(
    location: WebGLUniformLocation | null,
    values: readonly [number, number, number, number],
  ): void {
    if (this.gl && location !== null) {
      this.gl.uniform4f(location, ...values);
    }
  }

  private scheduleTimerPoll(): void {
    if (this.timerFrame !== null || !this.pendingTimerQuery) {
      return;
    }
    this.timerFrame = this.requestFrame(this.pollTimerQuery);
  }

  private readonly pollTimerQuery = () => {
    this.timerFrame = null;
    const pending = this.pendingTimerQuery;
    const extension = this.timerExtension;
    const gl = this.gl;
    if (!pending || !extension || !gl || this.capabilities.contextLost) {
      return;
    }

    const available = extension.getQueryObjectEXT(
      pending.query,
      extension.QUERY_RESULT_AVAILABLE_EXT,
    );
    const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
    if (available && !disjoint) {
      const result = extension.getQueryObjectEXT(
        pending.query,
        extension.QUERY_RESULT_EXT,
      );
      if (typeof result === 'number' && Number.isFinite(result)) {
        this.emitTiming({
          renderId: pending.renderId,
          iterationCap: pending.iterationCap,
          source: 'gpu-query',
          cpuSubmitMs: pending.cpuSubmitMs,
          gpuElapsedMs: Math.max(0, result / 1e6),
        });
      }
    }

    if (available || disjoint) {
      extension.deleteQueryEXT(pending.query);
      this.pendingTimerQuery = null;
      return;
    }
    this.scheduleTimerPoll();
  };

  private cancelCurrentRender(
    reason: string,
    emitState: boolean,
    deleteTimerQuery = true,
  ): void {
    const cancelledRenderId = this.activeRenderId;
    if (this.progressiveFrame !== null) {
      this.cancelFrame(this.progressiveFrame);
      this.progressiveFrame = null;
    }
    this.activeRenderId = null;
    this.cancelTimerQuery(deleteTimerQuery);

    if (emitState && cancelledRenderId !== null) {
      this.setState({
        renderId: cancelledRenderId,
        status: 'cancelled',
        passIndex: this.state.passIndex,
        passCount: this.state.passCount,
        iterationCap: this.state.iterationCap,
        message: reason,
      });
    }
  }

  private cancelTimerQuery(deleteQuery: boolean): void {
    if (this.timerFrame !== null) {
      this.cancelFrame(this.timerFrame);
      this.timerFrame = null;
    }
    if (
      deleteQuery &&
      this.pendingTimerQuery &&
      this.timerExtension &&
      !this.capabilities.contextLost
    ) {
      this.timerExtension.deleteQueryEXT(this.pendingTimerQuery.query);
    }
    this.pendingTimerQuery = null;
  }

  private failActiveRender(renderId: number, message: string): void {
    this.activeRenderId = null;
    this.setState({
      renderId,
      status: 'error',
      passIndex: this.state.passIndex,
      passCount: this.state.passCount,
      iterationCap: this.state.iterationCap,
      message,
    });
    this.options.onError?.(message);
  }

  private releaseResources(deleteResources: boolean): void {
    const gl = this.gl;
    this.cancelTimerQuery(deleteResources);
    if (deleteResources && gl) {
      if (this.paletteTexture) {
        gl.deleteTexture(this.paletteTexture);
      }
      if (this.buffer) {
        gl.deleteBuffer(this.buffer);
      }
      if (this.baseProgram) {
        gl.deleteProgram(this.baseProgram.program);
      }
      this.limbPrograms.forEach((bundle) => {
        gl.deleteProgram(bundle.program);
      });
    }
    this.paletteTexture = null;
    this.buffer = null;
    this.baseProgram = null;
    this.limbPrograms.clear();
    this.timerExtension = null;
    this.gl = null;
  }

  private emitCapabilities(): void {
    this.options.onCapabilitiesChange?.(this.getCapabilities());
  }

  private setState(state: WebGLRenderState): void {
    this.state = state;
    this.options.onStateChange?.(this.getState());
  }

  private emitTiming(timing: WebGLRenderTiming): void {
    this.lastTiming = timing;
    this.options.onTiming?.({ ...timing });
  }
}

import type { WebGLRendererCapabilities } from './gpu/types';
import type { RenderSettings } from '../state/settings';

export const resolveActiveRenderBackend = (
  requestedBackend: RenderSettings['renderBackend'],
  capabilities: Pick<WebGLRendererCapabilities, 'available'> | null,
): RenderSettings['renderBackend'] =>
  requestedBackend === 'gpu' && capabilities?.available === false
    ? 'cpu'
    : requestedBackend;

import { describe, expect, it } from 'vitest';

import { buildFragmentShaderSource } from './gpuShaders';

const bailoutStatements = (source: string) =>
  source.match(/float bailoutSquared = .*;/g) ?? [];

describe('buildFragmentShaderSource', () => {
  it('uses the extended smooth bailout for highp shaders', () => {
    const statements = bailoutStatements(
      buildFragmentShaderSource(128, 'highp'),
    );

    expect(statements).toHaveLength(3);
    expect(statements).toEqual(
      Array(3).fill('float bailoutSquared = u_smooth ? 65536.0 : 4.0;'),
    );
  });

  it('keeps bailout values within guaranteed mediump range', () => {
    const source = buildFragmentShaderSource(128, 'mediump');
    const statements = bailoutStatements(source);

    expect(statements).toHaveLength(3);
    expect(statements).toEqual(
      Array(3).fill('float bailoutSquared = u_smooth ? 4.0 : 4.0;'),
    );
    expect(source).not.toContain('65536.0');
  });
});

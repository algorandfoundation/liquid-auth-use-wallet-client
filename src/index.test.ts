import { describe, it, expect } from 'vitest';
import { LiquidAuthClient, ICON } from './index';
import type { LiquidOptions } from './index';

describe('index.ts exports', () => {
  it('should export LiquidAuthClient', () => {
    expect(LiquidAuthClient).toBeDefined();
  });

  it('should export ICON', () => {
    expect(ICON).toBeDefined();
  });

  it('should export LiquidOptions type', () => {
    const options: LiquidOptions = {
      RTC_config_username: 'test-username',
      RTC_config_credential: 'test-credential',
    };
    expect(options).toBeDefined();
  });
});
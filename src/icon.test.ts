import { describe, it, expect } from 'vitest';
import { ICON } from './icon';

describe('ICON', () => {
  it('should be defined', () => {
    expect(ICON).toBeDefined();
  });

  it('should contain valid SVG content', () => {
    expect(ICON).toContain('<?xml version="1.0" encoding="UTF-8" standalone="no" ?>');
    expect(ICON).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(ICON).toContain('<circle');
    expect(ICON).toContain('<path');
  });

  it('should have the correct dimensions', () => {
    expect(ICON).toContain('width="249"');
    expect(ICON).toContain('height="249"');
  });

  it('should have the correct colors', () => {
    expect(ICON).toContain('stroke: rgb(0,0,0);');
    expect(ICON).toContain('fill: rgb(170,0,255);');
    expect(ICON).toContain('stroke: rgb(255,4,233);');
  });
});
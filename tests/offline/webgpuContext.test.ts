import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isWebGpuSupported,
  initWebGpuContext,
  WebGpuContext
} from '../../src/engine/offline/gpu/webgpuContext';

describe('WebGPU Context & Capability Management', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true
    });
  });

  it('detects when WebGPU is not supported in the environment', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true
    });

    expect(isWebGpuSupported()).toBe(false);
    const ctx = await initWebGpuContext();
    expect(ctx).toBeNull();
  });

  it('initializes WebGpuContext when GPU adapter and device are successfully acquired', async () => {
    const mockDeviceLost = new Promise<GPUDeviceLostInfo>(() => {});
    const mockDevice = {
      lost: mockDeviceLost,
      features: new Set(['float32-filterable', 'timestamp-query']),
      limits: {
        maxStorageBufferBindingSize: 134217728,
        maxComputeWorkgroupSizeX: 256,
        maxComputeInvocationsPerWorkgroup: 256
      },
      destroy: vi.fn(),
      queue: {
        writeBuffer: vi.fn(),
        submit: vi.fn()
      }
    };

    const mockAdapter = {
      features: new Set(['float32-filterable']),
      limits: mockDevice.limits,
      requestDevice: vi.fn().mockResolvedValue(mockDevice)
    };

    const mockGpu = {
      requestAdapter: vi.fn().mockResolvedValue(mockAdapter)
    };

    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: mockGpu },
      configurable: true,
      writable: true
    });

    expect(isWebGpuSupported()).toBe(true);

    const ctx = await initWebGpuContext();
    expect(ctx).not.toBeNull();
    expect(ctx?.device).toBe(mockDevice);
    expect(ctx?.adapter).toBe(mockAdapter);
    expect(ctx?.isLost).toBe(false);
    expect(ctx?.capabilities.maxStorageBufferSize).toBe(134217728);
  });

  it('handles adapter request failure gracefully by returning null', async () => {
    const mockGpu = {
      requestAdapter: vi.fn().mockResolvedValue(null)
    };

    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: mockGpu },
      configurable: true,
      writable: true
    });

    const ctx = await initWebGpuContext();
    expect(ctx).toBeNull();
  });

  it('handles device acquisition error by returning null', async () => {
    const mockAdapter = {
      requestDevice: vi.fn().mockRejectedValue(new Error('GPU Out of Memory'))
    };

    const mockGpu = {
      requestAdapter: vi.fn().mockResolvedValue(mockAdapter)
    };

    Object.defineProperty(globalThis, 'navigator', {
      value: { gpu: mockGpu },
      configurable: true,
      writable: true
    });

    const ctx = await initWebGpuContext();
    expect(ctx).toBeNull();
  });

  it('notifies onDeviceLost callbacks when device is lost', async () => {
    let triggerLost: (info: GPUDeviceLostInfo) => void = () => {};
    const mockDeviceLost = new Promise<GPUDeviceLostInfo>((resolve) => {
      triggerLost = resolve;
    });

    const mockDevice = {
      lost: mockDeviceLost,
      features: new Set([]),
      limits: { maxStorageBufferBindingSize: 65536 },
      destroy: vi.fn()
    };

    const mockAdapter = {
      features: new Set([]),
      limits: mockDevice.limits,
      requestDevice: vi.fn().mockResolvedValue(mockDevice)
    };

    const ctx = new WebGpuContext(mockAdapter as unknown as GPUAdapter, mockDevice as unknown as GPUDevice);
    expect(ctx.isLost).toBe(false);

    const lostCallback = vi.fn();
    ctx.onDeviceLost(lostCallback);

    triggerLost({ reason: 'destroyed', message: 'Context destroyed' } as GPUDeviceLostInfo);
    await mockDeviceLost;
    // Allow microtasks to settle
    await new Promise(r => setTimeout(r, 10));

    expect(ctx.isLost).toBe(true);
    expect(lostCallback).toHaveBeenCalledWith(expect.objectContaining({ reason: 'destroyed' }));
  });

  it('destroys underlying GPU device cleanly', () => {
    const mockDestroy = vi.fn();
    const mockDevice = {
      lost: new Promise<GPUDeviceLostInfo>(() => {}),
      features: new Set([]),
      limits: { maxStorageBufferBindingSize: 65536 },
      destroy: mockDestroy
    };

    const mockAdapter = {
      features: new Set([]),
      limits: mockDevice.limits,
      requestDevice: vi.fn()
    };

    const ctx = new WebGpuContext(mockAdapter as unknown as GPUAdapter, mockDevice as unknown as GPUDevice);
    ctx.destroy();
    expect(mockDestroy).toHaveBeenCalledOnce();
  });
});

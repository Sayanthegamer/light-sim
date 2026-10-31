/**
 * WebGPU Context & Device Lifecycle Manager
 *
 * Handles WebGPU device acquisition, feature capability detection,
 * context loss monitoring, and graceful fallback detection.
 */

export interface IWebGpuCapabilities {
  maxStorageBufferSize: number;
  maxComputeWorkgroupSizeX: number;
  maxComputeInvocationsPerWorkgroup: number;
  hasFloat32Filterable: boolean;
  hasTimestampQuery: boolean;
}

export type DeviceLostCallback = (info: GPUDeviceLostInfo) => void;

export class WebGpuContext {
  readonly adapter: GPUAdapter;
  readonly device: GPUDevice;
  readonly capabilities: IWebGpuCapabilities;
  private _isLost = false;
  private lostCallbacks: DeviceLostCallback[] = [];

  constructor(adapter: GPUAdapter, device: GPUDevice) {
    this.adapter = adapter;
    this.device = device;

    const limits = device.limits;
    this.capabilities = {
      maxStorageBufferSize: limits?.maxStorageBufferBindingSize ?? 134217728,
      maxComputeWorkgroupSizeX: limits?.maxComputeWorkgroupSizeX ?? 256,
      maxComputeInvocationsPerWorkgroup: limits?.maxComputeInvocationsPerWorkgroup ?? 256,
      hasFloat32Filterable: device.features?.has('float32-filterable') ?? false,
      hasTimestampQuery: device.features?.has('timestamp-query') ?? false
    };

    this.monitorDeviceLoss();
  }

  get isLost(): boolean {
    return this._isLost;
  }

  private monitorDeviceLoss(): void {
    if (this.device?.lost) {
      this.device.lost.then((info) => {
        this._isLost = true;
        for (let i = 0; i < this.lostCallbacks.length; i++) {
          try {
            this.lostCallbacks[i](info);
          } catch (e) {
            console.error('Error in onDeviceLost callback:', e);
          }
        }
      }).catch(() => {
        this._isLost = true;
      });
    }
  }

  /**
   * Registers a callback invoked if the underlying GPU device is lost.
   */
  onDeviceLost(callback: DeviceLostCallback): void {
    this.lostCallbacks.push(callback);
    if (this._isLost) {
      callback({ reason: 'destroyed', message: 'Device was already lost' } as GPUDeviceLostInfo);
    }
  }

  /**
   * Destroys the WebGPU device and releases hardware resources.
   */
  destroy(): void {
    try {
      this.device.destroy();
    } catch {}
    this._isLost = true;
    this.lostCallbacks = [];
  }
}

/**
 * Checks if the WebGPU API is available in the current browser runtime.
 */
export function isWebGpuSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu;
}

/**
 * Attempts to initialize a WebGPU context, acquiring adapter and device.
 * Returns null if WebGPU is unsupported or hardware initialization fails.
 */
export async function initWebGpuContext(
  options?: GPURequestAdapterOptions
): Promise<WebGpuContext | null> {
  if (!isWebGpuSupported()) {
    return null;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter(options ?? {
      powerPreference: 'high-performance'
    });

    if (!adapter) {
      return null;
    }

    // Determine optional supported features
    const requiredFeatures: GPUFeatureName[] = [];
    if (adapter.features?.has('float32-filterable')) {
      requiredFeatures.push('float32-filterable');
    }

    const device = await adapter.requestDevice({
      requiredFeatures
    });

    return new WebGpuContext(adapter, device);
  } catch (err) {
    console.warn('Failed to initialize WebGPU context:', err);
    return null;
  }
}

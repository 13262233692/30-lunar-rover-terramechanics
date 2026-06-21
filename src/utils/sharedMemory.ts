import { TERRAIN_RESOLUTION } from '../utils/soilPresets';

export const SAB_RUT_BUFFER_BYTE_OFFSET = 0;
export const SAB_RUT_DIRTY_FLAG_OFFSET = TERRAIN_RESOLUTION * TERRAIN_RESOLUTION * 4;
export const SAB_DIRTY_MIN_X_OFFSET = SAB_RUT_DIRTY_FLAG_OFFSET + 4;
export const SAB_DIRTY_MAX_X_OFFSET = SAB_DIRTY_MIN_X_OFFSET + 4;
export const SAB_DIRTY_MIN_Z_OFFSET = SAB_DIRTY_MAX_X_OFFSET + 4;
export const SAB_DIRTY_MAX_Z_OFFSET = SAB_DIRTY_MIN_Z_OFFSET + 4;
export const SAB_DIRTY_COUNTER_OFFSET = SAB_DIRTY_MAX_Z_OFFSET + 4;
export const SAB_TOTAL_BYTES = SAB_DIRTY_COUNTER_OFFSET + 4;

export const FLAG_IDLE = 0;
export const FLAG_WORKER_WRITING = 1;
export const FLAG_MAIN_PENDING = 2;

export function createSharedRutBuffer(resolution: number = TERRAIN_RESOLUTION): SharedArrayBuffer {
  const bytes = SAB_RUT_BUFFER_BYTE_OFFSET + resolution * resolution * 4 + 32;
  const sab = new SharedArrayBuffer(bytes);
  const i32 = new Int32Array(sab);
  Atomics.store(i32, SAB_RUT_DIRTY_FLAG_OFFSET / 4, FLAG_IDLE);
  Atomics.store(i32, SAB_DIRTY_MIN_X_OFFSET / 4, resolution);
  Atomics.store(i32, SAB_DIRTY_MAX_X_OFFSET / 4, 0);
  Atomics.store(i32, SAB_DIRTY_MIN_Z_OFFSET / 4, resolution);
  Atomics.store(i32, SAB_DIRTY_MAX_Z_OFFSET / 4, 0);
  Atomics.store(i32, SAB_DIRTY_COUNTER_OFFSET / 4, 0);
  return sab;
}

export function getSharedRutView(sab: SharedArrayBuffer): Float32Array {
  return new Float32Array(sab, SAB_RUT_BUFFER_BYTE_OFFSET, TERRAIN_RESOLUTION * TERRAIN_RESOLUTION);
}

export function getSharedMetaView(sab: SharedArrayBuffer): Int32Array {
  return new Int32Array(sab, SAB_RUT_DIRTY_FLAG_OFFSET, 8);
}

export function workerBeginWrite(sab: SharedArrayBuffer, meta: Int32Array): void {
  Atomics.store(meta, 0, FLAG_WORKER_WRITING);
  Atomics.store(meta, 1, TERRAIN_RESOLUTION);
  Atomics.store(meta, 2, 0);
  Atomics.store(meta, 3, TERRAIN_RESOLUTION);
  Atomics.store(meta, 4, 0);
}

export function workerMarkDirty(sab: SharedArrayBuffer, meta: Int32Array, ix: number, iz: number): void {
  const minX = Atomics.load(meta, 1);
  if (ix < minX) Atomics.store(meta, 1, ix);
  const maxX = Atomics.load(meta, 2);
  if (ix > maxX) Atomics.store(meta, 2, ix);
  const minZ = Atomics.load(meta, 3);
  if (iz < minZ) Atomics.store(meta, 3, iz);
  const maxZ = Atomics.load(meta, 4);
  if (iz > maxZ) Atomics.store(meta, 4, iz);
}

export function workerCommitWrite(sab: SharedArrayBuffer, meta: Int32Array): void {
  const counter = Atomics.load(meta, 6);
  Atomics.store(meta, 6, counter + 1);
  Atomics.store(meta, 0, FLAG_MAIN_PENDING);
}

export function mainTryConsume(
  sab: SharedArrayBuffer,
  meta: Int32Array,
  rutView: Float32Array
): { consumed: boolean; dirtyMinX: number; dirtyMaxX: number; dirtyMinZ: number; dirtyMaxZ: number } {
  const flag = Atomics.load(meta, 0);
  if (flag !== FLAG_MAIN_PENDING) {
    return { consumed: false, dirtyMinX: 0, dirtyMaxX: 0, dirtyMinZ: 0, dirtyMaxZ: 0 };
  }
  const minX = Atomics.load(meta, 1);
  const maxX = Atomics.load(meta, 2);
  const minZ = Atomics.load(meta, 3);
  const maxZ = Atomics.load(meta, 4);

  Atomics.store(meta, 0, FLAG_IDLE);
  return { consumed: true, dirtyMinX: minX, dirtyMaxX: maxX, dirtyMinZ: minZ, dirtyMaxZ: maxZ };
}

export function isSharedArrayBufferSupported(): boolean {
  return (
    typeof SharedArrayBuffer !== 'undefined' &&
    typeof Atomics !== 'undefined' &&
    typeof Atomics.store === 'function'
  );
}

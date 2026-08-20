/* lazy proxy to the shared deterministic physics (pool-physics.js loads as a
   classic script before this module runs; proxy defers resolution to use-time) */
export const P: any = new Proxy({}, {
  get(_t, key) {
    const phys = (window as any).PoolPhysics || (globalThis as any).PoolPhysics;
    return phys ? phys[key] : undefined;
  }
});

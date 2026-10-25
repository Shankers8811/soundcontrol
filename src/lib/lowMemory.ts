/**
 * Low-memory mode detection and utilities.
 * 
 * When LOW_MEMORY=1 is set (via environment variable or auto-detected on
 * systems with < 2GB RAM), the app applies various optimizations:
 * - Disables WebGL
 * - Reduces animation complexity
 * - Limits cache sizes
 * - Disables non-essential visual effects
 */

function getEnvLowMemory(): boolean {
  // Check environment variable first (set by Electron main process)
  // In browser context, process.env is not available, so we check import.meta.env
  if (typeof import.meta !== 'undefined' && import.meta.env?.LOW_MEMORY === '1') {
    return true;
  }
  return false;
}

export function isLowMemoryMode(): boolean {
  // Check environment variable first (set by Electron main process)
  if (getEnvLowMemory()) {
    return true;
  }
  
  // Check if Electron API exposed the flag
  if (typeof window !== 'undefined' && window.electronAPI?.isLowMemory) {
    return true;
  }
  
  // Auto-detect: check device memory if available (Chrome/Edge)
  if (typeof navigator !== 'undefined' && 'deviceMemory' in navigator) {
    // deviceMemory is in GB, approximate
    if ((navigator as any).deviceMemory < 2) {
      return true;
    }
  }
  
  return false;
}

/**
 * Get optimized animation settings based on memory mode.
 */
export function getAnimationConfig() {
  const lowMem = isLowMemoryMode();
  return {
    enableComplexAnimations: !lowMem,
    enableGlowEffects: !lowMem,
    enablePulseAnimations: !lowMem,
    reducedMotion: lowMem,
    transitionDuration: lowMem ? 0 : 200,
  };
}

/**
 * Get rendering optimizations for low-memory systems.
 */
export function getRenderOptimizations() {
  const lowMem = isLowMemoryMode();
  return {
    // Canvas/WebGL
    disableWebGL: lowMem,
    // Image loading
    lazyLoadImages: lowMem,
    // Caching
    maxCacheSize: lowMem ? 10 : 50, // MB
    // Animations
    ...getAnimationConfig(),
  };
}

/**
 * React hook for low-memory aware rendering.
 */
export function useLowMemory() {
  return {
    isLowMemory: isLowMemoryMode(),
    animationConfig: getAnimationConfig(),
    renderOptimizations: getRenderOptimizations(),
  };
}

// Export for non-React contexts
export const lowMemoryConfig = getRenderOptimizations();
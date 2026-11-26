// three-shim.js — the one place that touches the vendored three.js global.
// three.min.js is loaded as a classic script in index.html and sets window.THREE.
export const THREE = window.THREE;
if (!THREE) throw new Error('three.js failed to load');

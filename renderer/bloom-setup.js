// ═══════════════════════════════════════════════════════════
// BLOOM POST-PROCESSING SETUP — Bridge Module
// Constellation Journal: Loads EffectComposer + UnrealBloomPass
// from Three.js ESM addons and exposes them globally since
// the app uses script-tag loading.
// ═══════════════════════════════════════════════════════════

import { EffectComposer } from '../node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';

/**
 * Initialize the bloom post-processing composer.
 * Called from app.js after renderer, scene, and camera are created.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene} scene
 * @param {THREE.PerspectiveCamera} camera
 * @returns {EffectComposer} The composer — call composer.render() instead of renderer.render()
 */
function createBloomComposer(renderer, scene, camera) {
  const renderPass = new RenderPass(scene, camera);
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.9,    // strength — bright objects bleed light
    0.5,    // radius — how far bloom spreads
    0.6     // threshold — brightness cutoff (lower = more things bloom)
  );

  const composer = new EffectComposer(renderer);
  composer.addPass(renderPass);
  composer.addPass(bloomPass);

  return composer;
}

// Expose globally so app.js (non-module) can use it
window.createBloomComposer = createBloomComposer;

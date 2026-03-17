// ═══════════════════════════════════════════════════════════
// SKY LAYER MANAGER — Layer Orchestration Engine
// Constellation Journal: Phase 2 Architecture
// ═══════════════════════════════════════════════════════════
// Registers, toggles, queries, and renders layers.
// Provides unified hitTest pipeline for all sky objects.
// ═══════════════════════════════════════════════════════════

const SkyLayerManager = (() => {
  'use strict';

  // ── State ──
  const layers = new Map();    // id → LayerEntry
  let scene = null;
  let camera = null;
  let raycaster = null;
  let initialized = false;

  // ── Render order (lower = drawn first = behind) ──
  const CLASS_ORDER = {
    reference: 0,
    celestial: 1,
    personal:  2,
    signal:    3
  };

  // ═══════════════════════════════════════════════════════════
  // LAYER ENTRY
  // ═══════════════════════════════════════════════════════════

  function createLayerEntry(config) {
    return {
      id:        config.id,
      name:      config.name || config.id,
      class:     config.class || 'reference',
      visible:   config.visible !== false,
      group:     config.group || new THREE.Group(),
      objects:   new Map(),          // id → SkyObject
      update:    config.update || null,     // fn(dt)
      refresh:   config.refresh || null,    // fn()
      hitTest:   config.hitTest || null,    // fn(raycaster) → { type, data }
      renderOrder: CLASS_ORDER[config.class] || 0
    };
  }

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function init(threeScene, threeCamera) {
    scene = threeScene;
    camera = threeCamera;
    raycaster = new THREE.Raycaster();
    raycaster.params.Points.threshold = 1.5;
    initialized = true;
  }

  // ═══════════════════════════════════════════════════════════
  // LAYER REGISTRATION
  // ═══════════════════════════════════════════════════════════

  function registerLayer(config) {
    if (!initialized) {
      console.error('SkyLayerManager: not initialized. Call init(scene, camera) first.');
      return null;
    }
    if (layers.has(config.id)) {
      console.warn(`SkyLayerManager: layer '${config.id}' already registered. Skipping.`);
      return layers.get(config.id);
    }

    const entry = createLayerEntry(config);
    entry.group.name = `skyLayer_${config.id}`;
    entry.group.renderOrder = entry.renderOrder;
    entry.group.visible = entry.visible;
    scene.add(entry.group);

    layers.set(config.id, entry);
    return entry;
  }

  function unregisterLayer(id) {
    const entry = layers.get(id);
    if (!entry) return;

    if (scene) scene.remove(entry.group);
    // Dispose geometries and materials
    entry.group.traverse(child => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
    layers.delete(id);
  }

  // ═══════════════════════════════════════════════════════════
  // OBJECT MANAGEMENT
  // ═══════════════════════════════════════════════════════════

  function addObject(layerId, skyObject) {
    const layer = layers.get(layerId);
    if (!layer) {
      console.warn(`SkyLayerManager: layer '${layerId}' not found.`);
      return;
    }
    skyObject._layerId = layerId;
    layer.objects.set(skyObject.id, skyObject);
  }

  function removeObject(layerId, objectId) {
    const layer = layers.get(layerId);
    if (!layer) return;

    const obj = layer.objects.get(objectId);
    if (obj && obj._threeObject) {
      layer.group.remove(obj._threeObject);
      if (obj._threeObject.geometry) obj._threeObject.geometry.dispose();
      if (obj._threeObject.material) {
        if (obj._threeObject.material.map) obj._threeObject.material.map.dispose();
        obj._threeObject.material.dispose();
      }
    }
    layer.objects.delete(objectId);
  }

  function getObject(layerId, objectId) {
    const layer = layers.get(layerId);
    return layer ? layer.objects.get(objectId) : null;
  }

  // ═══════════════════════════════════════════════════════════
  // VISIBILITY
  // ═══════════════════════════════════════════════════════════

  function setLayerVisible(id, visible) {
    const layer = layers.get(id);
    if (!layer) return;
    layer.visible = visible;
    layer.group.visible = visible;
  }

  function toggleLayer(id) {
    const layer = layers.get(id);
    if (!layer) return false;
    layer.visible = !layer.visible;
    layer.group.visible = layer.visible;
    return layer.visible;
  }

  function setClassVisible(layerClass, visible) {
    for (const [, layer] of layers) {
      if (layer.class === layerClass) {
        layer.visible = visible;
        layer.group.visible = visible;
      }
    }
  }

  function isLayerVisible(id) {
    const layer = layers.get(id);
    return layer ? layer.visible : false;
  }

  // ═══════════════════════════════════════════════════════════
  // QUERY
  // ═══════════════════════════════════════════════════════════

  function getLayer(id) {
    return layers.get(id) || null;
  }

  function getLayers() {
    return Array.from(layers.values());
  }

  function getLayersByClass(layerClass) {
    return Array.from(layers.values()).filter(l => l.class === layerClass);
  }

  function getVisibleLayers() {
    return Array.from(layers.values()).filter(l => l.visible);
  }

  function getAllObjects(layerClass) {
    const result = [];
    for (const [, layer] of layers) {
      if (layerClass && layer.class !== layerClass) continue;
      for (const [, obj] of layer.objects) {
        result.push(obj);
      }
    }
    return result;
  }

  // ═══════════════════════════════════════════════════════════
  // UNIFIED HIT TEST
  // ═══════════════════════════════════════════════════════════

  function hitTest(mouse, cam) {
    if (!initialized) return null;

    const rc = raycaster;
    rc.setFromCamera(mouse, cam || camera);

    // Test layers in reverse render order (signal → personal → celestial → reference)
    // This means top layers get priority for interaction
    const sorted = getVisibleLayers().sort((a, b) => b.renderOrder - a.renderOrder);

    for (const layer of sorted) {
      // Use layer's custom hitTest if provided
      if (layer.hitTest) {
        const hit = layer.hitTest(rc);
        if (hit) {
          return {
            layer: layer.id,
            layerClass: layer.class,
            ...hit
          };
        }
      }

      // Default: test sprites in the group
      const sprites = [];
      layer.group.traverse(child => {
        if (child.isSprite && child.visible) sprites.push(child);
      });
      if (sprites.length > 0) {
        const hits = rc.intersectObjects(sprites);
        if (hits.length > 0) {
          const hitObj = hits[0].object;
          const skyObj = layer.objects.get(hitObj.userData?.skyObjectId);
          return {
            layer: layer.id,
            layerClass: layer.class,
            type: hitObj.userData?.type || 'unknown',
            data: hitObj.userData,
            skyObject: skyObj || null,
            threeObject: hitObj
          };
        }
      }
    }

    return null;
  }

  // ═══════════════════════════════════════════════════════════
  // TOOLTIP FORMATTING (uses SkyObject.tooltipFn)
  // ═══════════════════════════════════════════════════════════

  function formatTooltip(hitResult) {
    if (!hitResult) return null;

    // If the SkyObject has a tooltipFn, use it
    if (hitResult.skyObject && hitResult.skyObject.interaction.tooltipFn) {
      return hitResult.skyObject.interaction.tooltipFn(hitResult.skyObject);
    }

    // Fallback: use userData directly
    const d = hitResult.data || {};
    return {
      name: d.label || d.name || d.type || 'Unknown',
      detail: '',
      sub: ''
    };
  }

  // ═══════════════════════════════════════════════════════════
  // PER-FRAME UPDATE
  // ═══════════════════════════════════════════════════════════

  function update(dt) {
    for (const [, layer] of layers) {
      if (layer.visible && layer.update) {
        layer.update(dt);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // REFRESH ALL
  // ═══════════════════════════════════════════════════════════

  function refreshAll() {
    for (const [, layer] of layers) {
      if (layer.refresh) {
        layer.refresh();
      }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // STATS (for info panel)
  // ═══════════════════════════════════════════════════════════

  function getStats() {
    const stats = {
      totalLayers: layers.size,
      visibleLayers: 0,
      totalObjects: 0,
      byClass: {}
    };

    for (const [, layer] of layers) {
      if (layer.visible) stats.visibleLayers++;
      const count = layer.objects.size;
      stats.totalObjects += count;
      if (!stats.byClass[layer.class]) stats.byClass[layer.class] = 0;
      stats.byClass[layer.class] += count;
    }

    return stats;
  }

  // ═══════════════════════════════════════════════════════════
  // DESTROY
  // ═══════════════════════════════════════════════════════════

  function destroy() {
    for (const [id] of layers) {
      unregisterLayer(id);
    }
    initialized = false;
    scene = null;
    camera = null;
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return Object.freeze({
    init,
    destroy,

    // Layers
    registerLayer,
    unregisterLayer,
    getLayer,
    getLayers,
    getLayersByClass,
    getVisibleLayers,

    // Objects
    addObject,
    removeObject,
    getObject,
    getAllObjects,

    // Visibility
    setLayerVisible,
    toggleLayer,
    setClassVisible,
    isLayerVisible,

    // Interaction
    hitTest,
    formatTooltip,

    // Update
    update,
    refreshAll,

    // Info
    getStats
  });
})();

if (typeof window !== 'undefined') window.SkyLayerManager = SkyLayerManager;

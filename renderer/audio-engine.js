// ═══════════════════════════════════════════════════════════
// AUDIO ENGINE — Web Audio API Sound System
// Constellation Journal
// ═══════════════════════════════════════════════════════════
// Extracted from app.js monolith. Handles all procedural
// audio: star tones, typewriter clicks, constellation chimes,
// and ambient drone. Zero rendering dependencies.
// ═══════════════════════════════════════════════════════════

const AudioEngine = (() => {
  'use strict';

  let audioCtx = null;
  let soundEnabled = true;
  let ambientOscs = [];

  // ═══════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════

  function init() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }

  function setEnabled(enabled) {
    soundEnabled = enabled;
    if (!enabled) stopAmbient();
  }

  function isEnabled() {
    return soundEnabled;
  }

  // ═══════════════════════════════════════════════════════════
  // STAR TONE — Temperature → Frequency mapping
  // ═══════════════════════════════════════════════════════════

  function playStarTone(temperatureK) {
    if (!soundEnabled || !audioCtx) return;

    // Map temperature to frequency: 3000K → 110Hz, 30000K → 880Hz (logarithmic)
    const minTemp = 3000;
    const maxTemp = 30000;
    const minFreq = 110;
    const maxFreq = 880;
    const t = Math.log(temperatureK / minTemp) / Math.log(maxTemp / minTemp);
    const freq = minFreq * Math.pow(maxFreq / minFreq, Math.max(0, Math.min(1, t)));

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.0);

    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 2.0);
  }

  // ═══════════════════════════════════════════════════════════
  // TYPEWRITER CLICK — Short percussive hit
  // ═══════════════════════════════════════════════════════════

  function playTypewriterClick() {
    if (!soundEnabled || !audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800 + Math.random() * 400, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.05);
  }

  // ═══════════════════════════════════════════════════════════
  // CONSTELLATION CHIME — Major triad arpeggio
  // ═══════════════════════════════════════════════════════════

  function playConstellationChime() {
    if (!soundEnabled || !audioCtx) return;
    const fundamental = 440;
    [1, 5/4, 3/2].forEach((ratio, i) => {
      setTimeout(() => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(fundamental * ratio, audioCtx.currentTime);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.05, audioCtx.currentTime + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 3.0);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start(audioCtx.currentTime);
        osc.stop(audioCtx.currentTime + 3.0);
      }, i * 300);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // AMBIENT DRONE — Low-frequency sine cluster
  // ═══════════════════════════════════════════════════════════

  function startAmbient() {
    if (!audioCtx) return;
    const freqs = [55, 82.5, 110];
    freqs.forEach(freq => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.015, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      ambientOscs.push({ osc, gain });
    });
  }

  function stopAmbient() {
    if (!audioCtx) return;
    ambientOscs.forEach(({ osc, gain }) => {
      gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 1);
      osc.stop(audioCtx.currentTime + 1);
    });
    ambientOscs = [];
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return Object.freeze({
    init,
    setEnabled,
    isEnabled,
    playStarTone,
    playTypewriterClick,
    playConstellationChime,
    startAmbient,
    stopAmbient,
    getContext: () => audioCtx
  });
})();

if (typeof window !== 'undefined') window.AudioEngine = AudioEngine;

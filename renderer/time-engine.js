// ═══════════════════════════════════════════════════════════
// TIME ENGINE — Temporal State Manager
// Constellation Journal: Phase 5
// ═══════════════════════════════════════════════════════════
// Controls the displayed time for the entire sky.
// Supports: live mode, seek to date, playback at variable speed.
// All layers subscribe to time changes via callbacks.
// ═══════════════════════════════════════════════════════════

const TimeEngine = (() => {
  'use strict';

  // ── State ──
  let currentTime = Date.now();
  let currentYear = new Date().getFullYear();
  let yearStart = new Date(currentYear, 0, 1).getTime();
  let yearEnd = new Date(currentYear, 11, 31, 23, 59, 59).getTime();

  let isLive = true;        // true = follow real time
  let isPlaying = false;
  let playbackSpeed = 1;    // 1x, 10x, 100x, 1000x
  let lastRealTime = 0;

  const SPEED_OPTIONS = [1, 10, 100, 1000];
  let speedIndex = 0;

  // Subscribers
  const listeners = [];

  // ═══════════════════════════════════════════════════════════
  // CORE
  // ═══════════════════════════════════════════════════════════

  function getTime() {
    return currentTime;
  }

  function getDate() {
    return new Date(currentTime);
  }

  function getDayOfYear() {
    const d = new Date(currentTime);
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d - start) / 86400000);
  }

  function setTime(timestamp) {
    isLive = false;
    currentTime = Math.max(yearStart, Math.min(yearEnd, timestamp));
    notifyListeners();
  }

  function setDayOfYear(doy) {
    const d = new Date(currentYear, 0);
    d.setDate(doy);
    setTime(d.getTime());
  }

  function goLive() {
    isLive = true;
    isPlaying = false;
    currentTime = Date.now();
    notifyListeners();
  }

  // ═══════════════════════════════════════════════════════════
  // PLAYBACK
  // ═══════════════════════════════════════════════════════════

  function play() {
    isLive = false;
    isPlaying = true;
    lastRealTime = performance.now();
  }

  function pause() {
    isPlaying = false;
  }

  function togglePlayPause() {
    if (isPlaying) {
      pause();
    } else {
      if (isLive) {
        // Start from beginning of year
        currentTime = yearStart;
        isLive = false;
      }
      play();
    }
    return isPlaying;
  }

  function cycleSpeed() {
    speedIndex = (speedIndex + 1) % SPEED_OPTIONS.length;
    playbackSpeed = SPEED_OPTIONS[speedIndex];
    return playbackSpeed;
  }

  function getSpeed() {
    return playbackSpeed;
  }

  function getSpeedLabel() {
    return `${playbackSpeed}x`;
  }

  // ═══════════════════════════════════════════════════════════
  // PER-FRAME TICK
  // ═══════════════════════════════════════════════════════════

  function tick(dtReal) {
    if (isLive) {
      currentTime = Date.now();
      return;
    }

    if (isPlaying) {
      // Advance simulated time by speed * real dt
      // dtReal is in seconds, convert to milliseconds
      const advance = dtReal * 1000 * playbackSpeed;
      currentTime += advance;

      // Wrap at year end
      if (currentTime > yearEnd) {
        currentTime = yearStart;
      }

      notifyListeners();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LISTENERS
  // ═══════════════════════════════════════════════════════════

  function onTimeChange(fn) {
    listeners.push(fn);
  }

  function removeListener(fn) {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  }

  function notifyListeners() {
    const d = new Date(currentTime);
    for (const fn of listeners) {
      try { fn(currentTime, d); } catch (e) { console.warn('TimeEngine listener error:', e.message); }
    }
  }

  // ═══════════════════════════════════════════════════════════
  // SLIDER HELPERS
  // ═══════════════════════════════════════════════════════════

  function getSliderValue() {
    // Returns 0-365 representing position in current year
    return getDayOfYear();
  }

  function getLabel() {
    const d = new Date(currentTime);
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }

  function getState() {
    return {
      time: currentTime,
      doy: getDayOfYear(),
      label: getLabel(),
      isLive,
      isPlaying,
      speed: playbackSpeed,
      speedLabel: getSpeedLabel()
    };
  }

  // ═══════════════════════════════════════════════════════════
  // EXPORTS
  // ═══════════════════════════════════════════════════════════

  return Object.freeze({
    getTime,
    getDate,
    getDayOfYear,
    setTime,
    setDayOfYear,
    goLive,

    play,
    pause,
    togglePlayPause,
    cycleSpeed,
    getSpeed,
    getSpeedLabel,

    tick,

    onTimeChange,
    removeListener,

    getSliderValue,
    getLabel,
    getState
  });
})();

if (typeof window !== 'undefined') window.TimeEngine = TimeEngine;

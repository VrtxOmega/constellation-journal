// ═══════════════════════════════════════════════════════════
// RECORDER PANEL — Built-in App Window Recorder
// Records ONLY this Constellation Journal window.
// One-click Record/Stop. Ctrl+Shift+R global hotkey.
// VP9 @ 8 Mbps, saves to WebM via save dialog.
// ═══════════════════════════════════════════════════════════

const RecorderPanel = (() => {
  'use strict';

  let mediaRecorder = null;
  let recordedChunks = [];
  let stream = null;
  let timerInterval = null;
  let startTime = 0;
  let indicatorEl = null;

  // ── Recording indicator (top-right corner, always visible while recording) ──
  function showIndicator() {
    if (indicatorEl) return;
    indicatorEl = document.createElement('div');
    indicatorEl.id = 'rec-indicator';
    indicatorEl.style.cssText = `
      position:fixed;top:42px;right:12px;z-index:10001;
      display:flex;align-items:center;gap:8px;
      padding:6px 14px;border-radius:20px;
      background:rgba(220,40,40,0.15);border:1px solid rgba(220,40,40,0.3);
      backdrop-filter:blur(8px);pointer-events:none;
    `;
    indicatorEl.innerHTML = `
      <span style="width:8px;height:8px;border-radius:50%;background:#ee4455;
        animation:recPulse 1s ease-in-out infinite;display:inline-block;"></span>
      <span id="rec-timer" style="font-family:monospace;color:#ee4455;font-size:12px;letter-spacing:1px;">00:00</span>
    `;
    document.body.appendChild(indicatorEl);

    if (!document.getElementById('rec-pulse-style')) {
      const s = document.createElement('style');
      s.id = 'rec-pulse-style';
      s.textContent = `@keyframes recPulse { 0%,100%{opacity:0.4} 50%{opacity:1} }`;
      document.head.appendChild(s);
    }
  }

  function hideIndicator() {
    if (indicatorEl) { indicatorEl.remove(); indicatorEl = null; }
  }

  function updateTimer() {
    const el = document.getElementById('rec-timer');
    if (!el) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const s = String(elapsed % 60).padStart(2, '0');
    el.textContent = `${m}:${s}`;
  }

  // ── Find this app's window via desktopCapturer ──
  async function getOwnWindowSource() {
    const sources = await window.recorder.getSources();
    // Look for "Constellation Journal" window
    let src = sources.find(s =>
      s.name.includes('Constellation Journal') && !s.isScreen
    );
    // Fallback: first window source, or first screen
    if (!src) src = sources.find(s => !s.isScreen) || sources[0];
    return src;
  }

  // ── Start recording the app window ──
  async function startRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') return;

    try {
      const source = await getOwnWindowSource();
      if (!source) {
        console.error('[Recorder] No capture source found');
        return;
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: source.id,
            maxWidth: 1920,
            maxHeight: 1080,
            maxFrameRate: 30
          }
        }
      });

      recordedChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm;codecs=vp8';

      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 8_000_000
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        hideIndicator();
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

        const blob = new Blob(recordedChunks, { type: mimeType });
        const arrayBuffer = await blob.arrayBuffer();
        const result = await window.recorder.save(Array.from(new Uint8Array(arrayBuffer)));

        if (result.saved) {
          showToast(`✓ Recording saved: ${result.path.split('\\').pop()}`);
        }

        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        updateRecorderButton(false);
      };

      mediaRecorder.start(1000);

      // UI
      startTime = Date.now();
      showIndicator();
      timerInterval = setInterval(updateTimer, 500);
      updateRecorderButton(true);

      console.log('[Recorder] Started — capturing app window');
    } catch (err) {
      console.error('[Recorder] Failed:', err.message);
      showToast(`Recording failed: ${err.message}`);
    }
  }

  // ── Stop recording ──
  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
      console.log('[Recorder] Stopped');
    }
  }

  // ── Toggle ──
  function toggle() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      stopRecording();
    } else {
      startRecording();
    }
  }

  // ── Update toolbar button appearance ──
  function updateRecorderButton(isRecording) {
    const btn = document.getElementById('btn-recorder');
    if (!btn) return;
    if (isRecording) {
      btn.textContent = '■';
      btn.style.color = '#ee4455';
      btn.style.animation = 'recPulse 1s ease-in-out infinite';
      btn.title = 'Stop Recording (Ctrl+Shift+R)';
    } else {
      btn.textContent = '⏺';
      btn.style.color = '#ee4455';
      btn.style.animation = 'none';
      btn.title = 'Screen Recorder (Ctrl+Shift+R)';
    }
  }

  // ── Toast notification ──
  function showToast(message) {
    let toast = document.getElementById('rec-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'rec-toast';
      toast.style.cssText = `
        position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
        padding:10px 24px;border-radius:8px;z-index:10002;
        background:rgba(10,10,20,0.9);border:1px solid rgba(212,175,55,0.2);
        color:#e0e0f0;font-size:13px;letter-spacing:0.5px;
        backdrop-filter:blur(8px);opacity:0;transition:opacity 0.4s ease;
        pointer-events:none;
      `;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
  }

  // ── Init ──
  function init() {
    // Wire toolbar button
    const btn = document.getElementById('btn-recorder');
    if (btn) btn.addEventListener('click', toggle);

    // Wire global hotkey via IPC
    if (window.recorder && window.recorder.onToggle) {
      window.recorder.onToggle(toggle);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return Object.freeze({
    toggle,
    isRecording: () => mediaRecorder && mediaRecorder.state === 'recording'
  });
})();

if (typeof window !== 'undefined') window.RecorderPanel = RecorderPanel;

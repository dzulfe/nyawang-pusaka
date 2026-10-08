(function () {
  const sceneEl = document.querySelector("a-scene");
  const panel = document.getElementById("info-panel");
  const audioEl = document.getElementById("panel-audio");
  const frameGuide = document.getElementById("ar-frame-guide");

  const detailBtn = document.getElementById("detail-btn");
  const detailBackdrop = document.getElementById("detail-backdrop");
  const detailCard = document.getElementById("detail-overlay");
  const detailCloseBtn = document.getElementById("detail-close-btn");

  const topbarAudioBtn = document.getElementById("topbar-audio-btn");
  const audioBtn = document.getElementById("audio-btn");
  const audioBtnLabel = document.getElementById("audio-btn-label");
  const audioPlayer = document.getElementById("audio-player");
  const audioSeek = document.getElementById("audio-seek");
  const audioCurrent = document.getElementById("audio-current");
  const audioDuration = document.getElementById("audio-duration");

  let currentAudioSrc = null;
  let currentData = null;
  let isArReady = false;

  // Gesture state (1 jari: putar Y / geser Y; 2 jari: pinch zoom)
  const originalTransforms = new WeakMap();
  let currentModelEl = null;
  let baseScale = 1;
  let baseRotX = 0;
  let baseRotY = 0;
  let baseRotZ = 0;
  let basePosX = 0;
  let basePosY = 0;
  let basePosZ = 0.1;
  let userYaw = 0;
  let userZoom = 1;
  let userPanY = 0;
  let hintTimer = null;

  const MIN_ZOOM = 0.35;
  const MAX_ZOOM = 3.6;
  const MAX_PAN_Y = 1.6;
  const ROTATE_DEG_PER_PX = 0.42;
  const PAN_PER_PX = 0.0028;
  const AXIS_LOCK_PX = 14;

  function setHint(text, isError) {
    // Hint removed - do nothing
  }

  function hideHint() {
    // Hint removed - do nothing
  }

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  function parseVec3(el, attr, fallback) {
    const v = el.getAttribute(attr);
    if (v && typeof v === "object" && Number.isFinite(v.x)) {
      return { x: v.x, y: v.y, z: v.z };
    }
    if (typeof v === "string") {
      const p = v.trim().split(/\s+/).map(Number);
      return {
        x: Number.isFinite(p[0]) ? p[0] : fallback.x,
        y: Number.isFinite(p[1]) ? p[1] : fallback.y,
        z: Number.isFinite(p[2]) ? p[2] : fallback.z,
      };
    }
    return { x: fallback.x, y: fallback.y, z: fallback.z };
  }

  function captureOriginal(modelEl) {
    let stored = originalTransforms.get(modelEl);
    if (stored) return stored;
    const scale = parseVec3(modelEl, "scale", { x: 1, y: 1, z: 1 });
    const rot = parseVec3(modelEl, "rotation", { x: 0, y: 0, z: 0 });
    const pos = parseVec3(modelEl, "position", { x: 0, y: 0, z: 0.1 });
    stored = { scale: scale.x, rot, pos };
    originalTransforms.set(modelEl, stored);
    return stored;
  }

  function applyTransform() {
    if (!currentModelEl) return;
    const s = baseScale * userZoom;
    const yaw = baseRotY + userYaw;
    const py = basePosY + userPanY;

    const obj = currentModelEl.object3D;
    if (obj) {
      const degToRad = Math.PI / 180;
      obj.scale.set(s, s, s);
      obj.rotation.set(baseRotX * degToRad, yaw * degToRad, baseRotZ * degToRad);
      obj.position.set(basePosX, py, basePosZ);
      obj.updateMatrix();
    }

    syncVecComponent(currentModelEl, "scale", s, s, s);
    syncVecComponent(currentModelEl, "rotation", baseRotX, yaw, baseRotZ);
    syncVecComponent(currentModelEl, "position", basePosX, py, basePosZ);
  }

  function syncVecComponent(el, name, x, y, z) {
    const comp = el.components && el.components[name];
    if (comp && comp.data) {
      comp.data.x = x;
      comp.data.y = y;
      comp.data.z = z;
    }
  }

  function resetUserTransform() {
    userYaw = 0;
    userZoom = 1;
    userPanY = 0;
    applyTransform();
  }

  function showGestureHint() {
    const hintEl = document.getElementById("ar-gesture-hint");
    if (!hintEl) return;
    hintEl.classList.add("visible");
    if (hintTimer) clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.remove("visible"), 4500);
  }

  function hideGestureHint() {
    const hintEl = document.getElementById("ar-gesture-hint");
    if (hintEl) hintEl.classList.remove("visible");
    if (hintTimer) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
  }

  function setActiveModel(modelEl) {
    currentModelEl = modelEl;
    userYaw = 0;
    userZoom = 1;
    userPanY = 0;

    if (!modelEl) {
      hideGestureHint();
      return;
    }

    const orig = captureOriginal(modelEl);
    baseScale = orig.scale;
    baseRotX = orig.rot.x;
    baseRotY = orig.rot.y;
    baseRotZ = orig.rot.z;
    basePosX = orig.pos.x;
    basePosY = orig.pos.y;
    basePosZ = orig.pos.z;
    applyTransform();
    showGestureHint();
    console.log("Active model set:", modelEl);
  }

  function setAudioButtonState(isPlaying) {
    if (topbarAudioBtn) topbarAudioBtn.classList.toggle("playing", isPlaying);
    if (audioBtn) audioBtn.classList.toggle("playing", isPlaying);
    if (audioBtnLabel) {
      audioBtnLabel.textContent = isPlaying ? "Jeda Narasi" : "Putar Narasi";
    }
  }

  function formatAudioTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  function updateAudioTimeline() {
    if (!audioEl) return;
    const duration = Number.isFinite(audioEl.duration) ? audioEl.duration : 0;
    const currentTime = Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0;

    if (audioCurrent) audioCurrent.textContent = formatAudioTime(currentTime);
    if (audioDuration) audioDuration.textContent = formatAudioTime(duration);
    if (audioSeek) {
      const progress = duration ? (currentTime / duration) * 1000 : 0;
      audioSeek.value = String(progress);
      audioSeek.style.setProperty("--audio-progress", `${(progress / 10).toFixed(2)}%`);
    }
  }

function setPanelVisible(show) {
  if (!panel) return;
  if (show) {
    panel.classList.add("visible");
    panel.style.display = "block";
    panel.style.transform = "translateY(0)";
    panel.style.opacity = "1";
    panel.style.visibility = "visible";
  } else {
    panel.classList.remove("visible");
    panel.style.display = "none";
    panel.style.opacity = "0";
    panel.style.visibility = "hidden";
  }
}

  function showPanel(data, targetEl) {
    currentData = data;

    if (panel) {
      panel.querySelector(".cat").textContent = data.kategori || "Koleksi Pusaka";
      panel.querySelector("h2").textContent = data.nama || "Pusaka Tak Bernama";
      const descEl = document.getElementById("desc-short");
      if (descEl) descEl.textContent = data.deskripsi || "Informasi detail mengenai koleksi ini akan segera menyusul.";
    }

    const srcRaw = data.audioSrc ? String(data.audioSrc).trim() : "";
    const effectiveSrc = srcRaw;

    if (currentAudioSrc !== effectiveSrc) {
      audioEl.pause();
      try { audioEl.currentTime = 0; } catch(_){}
      audioEl.src = effectiveSrc || "";
      currentAudioSrc = effectiveSrc;
      setAudioButtonState(false);
    }
    if (audioPlayer) audioPlayer.hidden = !effectiveSrc;
    updateAudioTimeline();
setPanelVisible(true);

    if (frameGuide) frameGuide.classList.add("locked");
    if (topbarAudioBtn) {
      topbarAudioBtn.disabled = false;
      topbarAudioBtn.removeAttribute("disabled");
    }

    // Set active model for gestures
    const modelEl = targetEl.querySelector("a-gltf-model");
    setActiveModel(modelEl);
  }

  function hidePanel() {
    setPanelVisible(false);
    if (detailBackdrop) detailBackdrop.classList.remove("visible");
    audioEl.pause();
    setAudioButtonState(false);
    currentData = null;
    setActiveModel(null);
    if (topbarAudioBtn) topbarAudioBtn.disabled = true;
    if (frameGuide) frameGuide.classList.remove("locked");
  }

function lockGestureLayer(lock) {
  const layer = document.getElementById("ar-gesture-layer");
  if (layer) layer.style.pointerEvents = lock ? "none" : "";
}

function pauseAR(pause) {
  const sys = sceneEl && sceneEl.systems && sceneEl.systems["mindar-image-system"];
  if (!sys) return;
  try {
    if (pause) sys.pause(true);   // true = kamera tetap tampil
    else sys.unpause();
  } catch (_) {}

}
  function openDetail() {
    if (!currentData) return;
    const catEl = document.getElementById("detail-cat");
    const namaEl = document.getElementById("detail-nama");
    const eraEl = document.getElementById("detail-era");
    const descEl = document.getElementById("detail-desc");
    const thumbImg = document.getElementById("detail-thumb-img");

    if (catEl) catEl.textContent = currentData.kategori;
    if (namaEl) namaEl.textContent = currentData.nama;
    if (eraEl) eraEl.textContent = currentData.era;
    if (descEl) {
      const text = currentData.deskripsiLengkap && currentData.deskripsiLengkap.trim()
        ? currentData.deskripsiLengkap
        : currentData.deskripsi;
      descEl.textContent = text;
    }

    if (thumbImg) {
      thumbImg.classList.remove("is-placeholder");
      thumbImg.src = currentData.thumb;
    }

    if (detailBackdrop) {
      detailBackdrop.classList.add("visible");
      detailBackdrop.setAttribute("aria-hidden", "false");
    }
    setPanelVisible(false);
    lockGestureLayer(true);
    pauseAR(true);
    if (detailCloseBtn) detailCloseBtn.focus({ preventScroll: true });
  }

  function closeDetail() {
    if (detailBackdrop) {
      detailBackdrop.classList.remove("visible");
      detailBackdrop.setAttribute("aria-hidden", "true");
    }
    lockGestureLayer(false);
    pauseAR(false);
    if (currentData) {
      setPanelVisible(true);
      if (detailBtn) detailBtn.focus({ preventScroll: true });
    }
  }

  function toggleAudio() {
    if (!currentAudioSrc) {
      alert("Narasi audio untuk koleksi ini sedang dalam proses perekaman.");
      return;
    }
    if (!audioEl) return;

    console.log("Toggle audio - currentAudioSrc:", currentAudioSrc);
    console.log("Audio element src:", audioEl.src);
    console.log("Audio paused:", audioEl.paused);

    if (audioEl.paused) {
      audioEl.muted = false;
      audioEl.volume = 1;

      // Set src if not set
      if (!audioEl.src || audioEl.src === window.location.href) {
        audioEl.src = currentAudioSrc;
      }

      const playPromise = audioEl.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          console.log("Audio playing successfully");
          setAudioButtonState(true);
        }).catch((err) => {
          console.error("Audio play error:", err);
          alert("Gagal memutar audio: " + err.message);
          setAudioButtonState(false);
        });
      }
    } else {
      audioEl.pause();
      console.log("Audio paused");
      setAudioButtonState(false);
    }
  }

  if (detailBtn) detailBtn.addEventListener("click", openDetail);
  if (detailCloseBtn) detailCloseBtn.addEventListener("click", closeDetail);

  if (detailBackdrop) {
    detailBackdrop.addEventListener("click", (e) => {
      if (e.target === detailBackdrop) closeDetail();
    });
  }

  if (detailCard) {
    let touchStart = null;
    detailCard.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1 || detailCard.scrollTop > 0) {
        touchStart = null;
        return;
      }
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }, { passive: true });
    detailCard.addEventListener("touchend", (e) => {
      if (!touchStart || !e.changedTouches.length) return;
      const deltaX = e.changedTouches[0].clientX - touchStart.x;
      const deltaY = e.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (deltaY > 90 && deltaY > Math.abs(deltaX) * 1.2 && detailCard.scrollTop <= 0) {
        closeDetail();
      }
    }, { passive: true });
    detailCard.addEventListener("touchcancel", () => { touchStart = null; }, { passive: true });
  }

  if (topbarAudioBtn) topbarAudioBtn.addEventListener("click", toggleAudio);
  if (audioBtn) audioBtn.addEventListener("click", toggleAudio);
  if (audioSeek) {
    audioSeek.addEventListener("input", () => {
      if (!audioEl || !Number.isFinite(audioEl.duration)) return;
      audioEl.currentTime = (Number(audioSeek.value) / 1000) * audioEl.duration;
      updateAudioTimeline();
    });
  }
  if (audioEl) {
    ["loadedmetadata", "durationchange", "timeupdate", "seeked"].forEach((eventName) => {
      audioEl.addEventListener(eventName, updateAudioTimeline);
    });
    audioEl.addEventListener("play", () => setAudioButtonState(true));
    audioEl.addEventListener("pause", () => setAudioButtonState(false));
    audioEl.addEventListener("ended", () => {
      setAudioButtonState(false);
      updateAudioTimeline();
    });
  }

  function bindTargetEvents() {
    const DATA = typeof PUSAKA_DATA !== "undefined" ? PUSAKA_DATA : (window && window.PUSAKA_DATA);
    const dataList = Array.isArray(DATA) ? DATA : [];

    const getDataForTarget = (targetIdx) => {
      let data = dataList.find(d => d.targetIndex === targetIdx);
      if (data) return data;
      const fallback = dataList[targetIdx];
      if (fallback) return Object.assign({}, fallback, { targetIndex: targetIdx });
      return {
        id: `marker-${targetIdx}`,
        nama: `Pusaka Marker ${targetIdx + 1}`,
        kategori: "Koleksi Museum",
        era: "",
        deskripsi: "Koleksi ini merupakan bagian dari peninggalan bersejarah yang dipamerkan di Museum Galunggung.",
        deskripsiLengkap: "Koleksi pusaka ini menjadi saksi bisu perjalanan sejarah Tatar Galunggung.",
        audioSrc: null,
        thumb: null,
        targetIndex: targetIdx,
      };
    };

    const allTargets = Array.from(document.querySelectorAll("[mindar-image-target]"));

     allTargets.forEach((targetEl) => {
      const attr = targetEl.getAttribute("mindar-image-target");
      let targetIdx = null;

      if (attr && typeof attr === "object" && Number.isFinite(attr.targetIndex)) {
        // A-Frame mengembalikan objek data komponen yang sudah di-parse,
        // bukan string mentah -- ini kasus yang paling sering terjadi
        targetIdx = attr.targetIndex;
      } else if (typeof attr === "string") {
        const idxMatch = attr.match(/targetIndex\s*:\s*(\d+)/);
        if (idxMatch) targetIdx = Number(idxMatch[1]);
      }

      if (!Number.isFinite(targetIdx) && targetEl.dataset && targetEl.dataset.targetIndex !== undefined) {
        targetIdx = Number(targetEl.dataset.targetIndex);
      }

      if (!Number.isFinite(targetIdx)) return;

      const data = getDataForTarget(targetIdx);
      if (!targetEl.dataset.eventsBound) {
        targetEl.addEventListener("targetFound", () => {
          console.log("Target found:", targetIdx);
          showPanel(data, targetEl);
        });
        targetEl.addEventListener("targetLost", () => {
          console.log("Target lost:", targetIdx);
          hidePanel();
        });
        targetEl.dataset.eventsBound = "1";
      }
    });
  }

  function setupGestures() {
    const surface = document.getElementById("ar-gesture-layer");
    if (!surface) {
      console.warn("Gesture layer not found, using scene as fallback");
      const sceneEl = document.querySelector("a-scene");
      if (!sceneEl) return;
      if (sceneEl.dataset.gesturesBound) return;
      sceneEl.dataset.gesturesBound = "1";
      setupSceneGestures(sceneEl);
      return;
    }
    if (surface.dataset.gesturesBound) return;
    surface.dataset.gesturesBound = "1";
    console.log("Setting up gestures on gesture layer");
    setupSurfaceGestures(surface);

    // Also setup on scene canvas as fallback for better mobile support
    setTimeout(() => {
      const canvas = document.querySelector("a-scene canvas");
      if (canvas && !canvas.dataset.gesturesBound) {
        canvas.dataset.gesturesBound = "1";
        console.log("Setting up gestures on scene canvas as fallback");
        setupSurfaceGestures(canvas);
      }
    }, 1000);
  }

  function setupSurfaceGestures(surface) {

    let lastX = null;
    let lastY = null;
    let lastPinchDist = null;
    let axisLock = null;
    let lockAccX = 0;
    let lockAccY = 0;
    let isDragging = false;
    let lastTapAt = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let fingerMoved = false;

    function gesturesBlocked() {
      return !currentModelEl || (detailBackdrop && detailBackdrop.classList.contains("visible"));
    }

    function pinchDistance(touches) {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    }

    function clampPan() {
      userPanY = clamp(userPanY, -MAX_PAN_Y, MAX_PAN_Y);
    }

    function applyOneFinger(dx, dy) {
      if (axisLock === null) {
        lockAccX += dx;
        lockAccY += dy;
        const adx = Math.abs(lockAccX);
        const ady = Math.abs(lockAccY);
        if (adx < AXIS_LOCK_PX && ady < AXIS_LOCK_PX) return;
        axisLock = adx >= ady ? "rotate" : "pan";
        dx = lockAccX;
        dy = lockAccY;
      }

      if (axisLock === "rotate") {
        userYaw += dx * ROTATE_DEG_PER_PX;
      } else {
        userPanY -= dy * PAN_PER_PX;
        clampPan();
      }
      fingerMoved = true;
      applyTransform();
    }

    function applyPinch(dist) {
      if (!lastPinchDist || lastPinchDist < 8) {
        lastPinchDist = dist;
        return;
      }
      userZoom = clamp(userZoom * (dist / lastPinchDist), MIN_ZOOM, MAX_ZOOM);
      lastPinchDist = dist;
      fingerMoved = true;
      clampPan();
      applyTransform();
    }

    function maybeDoubleTap(x, y) {
      const now = Date.now();
      const dt = now - lastTapAt;
      const dist = Math.hypot(x - lastTapX, y - lastTapY);
      if (dt < 280 && dist < 28) {
        resetUserTransform();
        lastTapAt = 0;
        return;
      }
      lastTapAt = now;
      lastTapX = x;
      lastTapY = y;
    }

    surface.addEventListener(
      "touchstart",
      (e) => {
        console.log("Touchstart on gesture layer, touches:", e.touches.length, "blocked:", gesturesBlocked());
        if (gesturesBlocked()) return;
        hideGestureHint();
        if (e.touches.length === 1) {
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;
          lastPinchDist = null;
          axisLock = null;
          lockAccX = 0;
          lockAccY = 0;
          fingerMoved = false;
          isDragging = true;
        } else if (e.touches.length >= 2) {
          lastPinchDist = pinchDistance(e.touches);
          lastX = null;
          lastY = null;
          axisLock = null;
          lockAccX = 0;
          lockAccY = 0;
          isDragging = false;
        }
        if (e.cancelable) e.preventDefault();
      },
      { passive: false }
    );

    surface.addEventListener(
      "touchmove",
      (e) => {
        if (gesturesBlocked()) return;
        if (e.touches.length === 1 && lastX !== null) {
          const x = e.touches[0].clientX;
          const y = e.touches[0].clientY;
          applyOneFinger(x - lastX, y - lastY);
          lastX = x;
          lastY = y;
        } else if (e.touches.length >= 2) {
          applyPinch(pinchDistance(e.touches));
        }
        if (e.cancelable) e.preventDefault();
      },
      { passive: false }
    );

    surface.addEventListener(
      "touchend",
      (e) => {
        if (e.touches.length === 0) {
          if (isDragging && !fingerMoved && lastX !== null) maybeDoubleTap(lastX, lastY);
          lastX = null;
          lastY = null;
          lastPinchDist = null;
          axisLock = null;
          lockAccX = 0;
          lockAccY = 0;
          isDragging = false;
        } else if (e.touches.length === 1) {
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;
          lastPinchDist = null;
          axisLock = null;
          lockAccX = 0;
          lockAccY = 0;
          isDragging = true;
        }
      },
      { passive: true }
    );

    surface.addEventListener("mousedown", (e) => {
      if (gesturesBlocked() || e.button !== 0) return;
      hideGestureHint();
      lastX = e.clientX;
      lastY = e.clientY;
      axisLock = null;
      lockAccX = 0;
      lockAccY = 0;
      fingerMoved = false;
      isDragging = true;
    });

    window.addEventListener("mousemove", (e) => {
      if (!isDragging || gesturesBlocked() || lastX === null) return;
      applyOneFinger(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    });

    window.addEventListener("mouseup", (e) => {
      if (isDragging && !fingerMoved && lastX !== null) maybeDoubleTap(e.clientX, e.clientY);
      isDragging = false;
      lastX = null;
      lastY = null;
      axisLock = null;
      lockAccX = 0;
      lockAccY = 0;
    });

    surface.addEventListener(
      "wheel",
      (e) => {
        if (gesturesBlocked()) return;
        e.preventDefault();
        hideGestureHint();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        userZoom = clamp(userZoom * factor, MIN_ZOOM, MAX_ZOOM);
        clampPan();
        applyTransform();
      },
      { passive: false }
    );
  }

  function setupSceneGestures(sceneEl) {
    setupSurfaceGestures(sceneEl);
  }

  function onArReady() {
    if (isArReady) return;
    isArReady = true;
    bindTargetEvents();
    setupGestures();
  }

  function onArError(msg) {
    isArReady = false;
    const extra = msg ? `\n\nDetail: ${msg}` : "";
    alert(`Gagal memulai AR. Pastikan browser mendukung WebRTC, izinkan akses kamera, dan gunakan koneksi HTTPS / localhost.${extra}`);
  }

  function isSecureOrLocal() {
    if (!window.location) return false;
    const host = window.location.hostname;
    const proto = window.location.protocol;
    return (
      proto === "https:" ||
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "[::1]" ||
      /\.local$/.test(host) ||
      /^192\.168\./.test(host) ||
      /^10\./.test(host)
    );
  }

  function waitForScene() {
    if (!sceneEl) {
      onArError("Scene A-Frame tidak ditemukan.");
      return;
    }

    if (sceneEl.hasLoaded) {
      setTimeout(onSceneReady, 50);
    } else {
      const onLoadedOnce = () => { setTimeout(onSceneReady, 50); };
      sceneEl.addEventListener("loaded", onLoadedOnce, { once: true });
      sceneEl.addEventListener("error", (e) => {
        onArError(e && e.detail ? String(e.detail) : "Scene error.");
      });
    }
  }

  function onSceneReady() {
    if (isArReady) return;

    if (!isSecureOrLocal()) {
      setHint(
        "AR memerlukan HTTPS atau localhost. Akses via https:// atau http://localhost",
        true
      );
      return;
    }

    setHint("Memuat model dan inisialisasi AR...");

    sceneEl.addEventListener("arReady", onArReady, { once: true });
    sceneEl.addEventListener("arError", (e) => {
      const detail = e && e.detail ? (typeof e.detail === "object" ? e.detail.message || JSON.stringify(e.detail) : String(e.detail)) : "";
      console.warn("arError event:", detail);
      onArReady();
    }, { once: true });

    sceneEl.addEventListener("renderstart", () => setTimeout(onArReady, 600), { once: true });

    if (sceneEl.renderStarted || sceneEl.hasLoaded) {
      setTimeout(() => {
        const comp = sceneEl.components && sceneEl.components["mindar-image"];
        if (comp && (comp._started || comp.initialized)) {
          onArReady();
        }
      }, 500);
    }
  }

  function init() {
    if (typeof window.AFRAME === "undefined") {
      alert("Gagal memuat A-Frame. Periksa koneksi internet.");
      return;
    }
    if (typeof window.MINDAR === "undefined" && !document.querySelector('script[src*="mind-ar"]')) {
      alert("Gagal memuat MindAR. Periksa koneksi internet.");
      return;
    }

    window.addEventListener("error", (e) => {
      const msg = e && e.message ? String(e.message) : "";
      if (/aframe|mindar/i.test(msg)) {
        console.error("AR lib error:", e);
      }
    });

    if (document.readyState === "complete" || document.readyState === "interactive") {
      waitForScene();
    } else {
      document.addEventListener("DOMContentLoaded", waitForScene, { once: true });
    }
  }

  init();
})();

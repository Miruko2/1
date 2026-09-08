// Load and dispose water effects with the desktop layout, including live resizing.
(() => {
  "use strict";

  const media = window.HanakoMobile?.media || window.matchMedia("(max-width: 860px), (max-width: 1024px) and (pointer: coarse)");
  let app = null;
  let pending = null;
  let generation = 0;

  function stopLiquidBackground() {
    generation++;
    pending = null;
    app?.dispose();
    app = null;
    document.getElementById("liquid-background-canvas")?.remove();
    document.getElementById("liquid-bg-iframe")?.removeAttribute("src");
    window.__liquidApp = null;
    window.liquidBackgroundApp = null;
  }

  async function initLiquidBackground() {
    if (media.matches) return null;
    if (app) return app;
    if (pending) return pending;
    const requestGeneration = ++generation;

    const task = (async () => {
      const { default: LiquidBackground } = await import(
        "https://cdn.jsdelivr.net/npm/threejs-components@0.0.30/build/backgrounds/liquid1.min.js"
      );
      // An in-flight import may finish after the user switches to the mobile layout.
      if (media.matches || requestGeneration !== generation) return null;
      const canvas = document.createElement("canvas");
      canvas.id = "liquid-background-canvas";
      Object.assign(canvas.style, {
        position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
        zIndex: "-1", pointerEvents: "none"
      });
      document.body.style.position = "relative";
      document.body.prepend(canvas);
      try {
        app = LiquidBackground(canvas);
        if (app.liquidPlane) {
          app.liquidPlane.material.metalness = 0.35;
          app.liquidPlane.material.roughness = 0.45;
          app.liquidPlane.uniforms.displacementScale.value = 2;
          app.setRain(false);
        }
        window.__liquidApp = app;
        window.liquidBackgroundApp = app;
        return app;
      } catch (error) {
        app?.dispose();
        app = null;
        canvas.remove();
        throw error;
      }
    })();
    pending = task;
    try { return await task; }
    finally { if (pending === task) pending = null; }
  }

  function syncBackground() {
    if (media.matches) { stopLiquidBackground(); return; }
    const iframe = document.getElementById("liquid-bg-iframe");
    if (iframe && !iframe.hasAttribute("src")) iframe.src = iframe.dataset.src;
    initLiquidBackground().catch(error => console.warn("Failed to initialize liquid background:", error));
  }

  media.addEventListener("change", syncBackground);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", syncBackground, { once: true });
  else syncBackground();
  window.initLiquidBackground = initLiquidBackground;
})();

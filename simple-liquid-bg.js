// Simplified Liquid Background Integration
// Based on the original liquid-refraction-lab approach but adapted for vanilla HTML

function initLiquidBackground() {
  // Create canvas element for the liquid effect
  const canvas = document.createElement('canvas');
  canvas.id = 'liquid-background-canvas';
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.zIndex = '-1'; // Behind content
  canvas.style.pointerEvents = 'none';

  // Add canvas to body
  document.body.style.position = 'relative'; // Ensure proper positioning context
  document.body.insertBefore(canvas, document.body.firstChild);

  // Load the liquid background module and initialize it
  return new Promise((resolve, reject) => {
    // Create script to load the liquid background module
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import LiquidBackground from 'https://cdn.jsdelivr.net/npm/threejs-components@0.0.30/build/backgrounds/liquid1.min.js';

      // Initialize once the script loads
      window.addEventListener('load', () => {
        try {
          const canvas = document.getElementById('liquid-background-canvas');
          if (canvas) {
            const app = LiquidBackground(canvas);

            // Configure for water ripple effect
            if (app.liquidPlane) {
              app.liquidPlane.material.metalness = 0.35;
              app.liquidPlane.material.roughness = 0.45;
              app.liquidPlane.uniforms.displacementScale.value = 2;
              app.setRain(false);
            }

            // Expose for potential cleanup
            window.__liquidApp = app;
            resolve(app);
          } else {
            reject(new Error('Canvas element not found'));
          }
        } catch (error) {
          reject(error);
        }
      });
    `;

    script.onerror = () => reject(new Error('Failed to load liquid background module'));

    // Add script to document
    document.body.appendChild(script);

    // Cleanup script after a delay
    setTimeout(() => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }, 5000);
  });
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initLiquidBackground()
    .then(app => {
      console.log('Liquid background initialized successfully');
      // Store reference for potential cleanup
      window.liquidBackgroundApp = app;
    })
    .catch(error => {
      console.warn('Failed to initialize liquid background:', error);
      // Hide canvas if initialization fails
      const canvas = document.getElementById('liquid-background-canvas');
      if (canvas) {
        canvas.style.display = 'none';
      }
    });
});

// Export function for manual initialization if needed
window.initLiquidBackground = initLiquidBackground;
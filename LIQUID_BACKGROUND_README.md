# Liquid Background Effect Integration

This integration adds a beautiful water ripple/liquid refraction effect as a background to your existing webpage.

## Files Added

1. `simple-liquid-bg.js` - Contains the liquid background initialization code
2. Updated `index.html` - Includes the liquid background script and CSS modifications

## How It Works

The effect uses the `threejs-components` library from a CDN to create a realistic liquid simulation that responds to user interaction. The effect is rendered on a canvas element that sits behind your existing content.

## Customization Options

You can modify the liquid effect properties in `simple-liquid-bg.js`:

- `metalness`: Controls how metallic the liquid appears (0.0 - 1.0, default: 0.35)
- `roughness`: Controls surface smoothness (0.0 - 1.0, default: 0.45) 
- `displacementScale`: Controls the strength of the ripple distortion (default: 2)
- `rainEnabled`: Whether to enable rain effect (true/false, default: false)

To customize, edit the values in the `initLiquidBackground()` function in `simple-liquid-bg.js`:

```javascript
const app = LiquidBackground(canvas);

// Configure for water ripple effect
if (app.liquidPlane) {
  app.liquidPlane.material.metalness = 0.35;     // Change this value
  app.liquidPlane.material.roughness = 0.45;     // Change this value  
  app.liquidPlane.uniforms.displacementScale.value = 2; // Change this value
  app.setRain(false);                            // Change to true for rain effect
}
```

## Performance Considerations

- The effect uses WebGL and should perform well on modern devices
- On very low-end devices, you may want to disable the effect
- The canvas is set to `pointer-events: none` so it won't interfere with your existing interactions
- The effect automatically handles window resizing

## Troubleshooting

If you don't see the liquid effect:

1. Check the browser console for any error messages
2. Ensure you have an internet connection to load the CDN resources
3. Verify that the canvas element is being created (inspect element in dev tools)
4. Check that the canvas has `z-index: -1` and is positioned correctly

## Dependencies

- threejs-components@0.0.30 (loaded from CDN)
- Three.js (included as part of threejs-components)

No additional installation is required - all dependencies are loaded from CDN.

## Browser Support

Works in modern browsers that support:
- WebGL 2.0
- ES6 Modules
- requestAnimationFrame

Fallback: If the effect fails to load, it will gracefully degrade and your existing content will remain fully functional.
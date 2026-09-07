"use client"

import { useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

function DemoContent() {
  const searchParams = useSearchParams()
  const img = searchParams.get("img") || "/flower.png"

  useEffect(() => {
    const script = document.createElement("script")
    script.type = "module"
    script.textContent = `
      import LiquidBackground from 'https://cdn.jsdelivr.net/npm/threejs-components@0.0.30/build/backgrounds/liquid1.min.js';
      const canvas = document.getElementById('refraction-canvas');
      if (canvas) {
        const app = LiquidBackground(canvas);
        app.loadImage('${img}');
        app.liquidPlane.material.metalness = 0.35;
        app.liquidPlane.material.roughness = 0.45;
        app.liquidPlane.uniforms.displacementScale.value = 2;
        app.setRain(false);
        window.__refractionDemoApp = app;
      }
    `
    document.body.appendChild(script)

    let prevX = 0, prevY = 0, intensity = 1.5
    const onMouseMove = (e: MouseEvent) => {
      const speed = Math.sqrt((e.clientX - prevX) ** 2 + (e.clientY - prevY) ** 2)
      intensity = Math.min(1.5 + speed * 0.15, 8)
      prevX = e.clientX
      prevY = e.clientY
    }
    window.addEventListener("mousemove", onMouseMove)

    let animId: number
    const tick = () => {
      intensity = intensity > 1.5 ? intensity * 0.92 : 1.5
      const r = document.getElementById("ca-r")
      const b = document.getElementById("ca-b")
      if (r) r.setAttribute("dx", String(-intensity))
      if (b) b.setAttribute("dx", String(intensity))
      animId = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      if (window.__refractionDemoApp?.dispose) window.__refractionDemoApp.dispose()
      script.parentNode?.removeChild(script)
      window.removeEventListener("mousemove", onMouseMove)
      cancelAnimationFrame(animId)
    }
  }, [img])

  return (
    <div className="fixed inset-0 w-full h-full touch-none overflow-hidden">
      <svg style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <filter id="ca" x="-5%" y="-5%" width="110%" height="110%">
            <feColorMatrix in="SourceGraphic" type="matrix"
              values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />
            <feOffset id="ca-r" dx="-1.5" dy="0" in="red" result="red-out" />
            <feColorMatrix in="SourceGraphic" type="matrix"
              values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />
            <feColorMatrix in="SourceGraphic" type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
            <feOffset id="ca-b" dx="1.5" dy="0" in="blue" result="blue-out" />
            <feBlend in="red-out" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue-out" mode="screen" />
          </filter>
        </defs>
      </svg>
      <canvas
        id="refraction-canvas"
        className="fixed inset-0 w-full h-full"
        style={{ filter: "url(#ca)" }}
      />
    </div>
  )
}

export default function DemoPage() {
  return (
    <Suspense>
      <DemoContent />
    </Suspense>
  )
}

declare global {
  interface Window {
    __refractionDemoApp?: { dispose?: () => void }
  }
}

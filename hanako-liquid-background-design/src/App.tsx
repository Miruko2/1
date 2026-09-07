import { useEffect } from "react";
import { initHanako } from "./lib/hanako";
import "./styles/hanako.css";

export default function App() {
  useEffect(() => {
    const cleanup = initHanako();
    return cleanup;
  }, []);

  return (
    <>
      {/* 液态背景（外链，加载失败时 body 的渐变兜底） */}
      <iframe
        id="liquid-bg-iframe"
        className="liquid-bg-iframe"
        src="https://bg.hanakos.cc/"
        title="background"
      />

      {/* 全局 SVG 水面扭曲滤镜 */}
      <svg style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }} aria-hidden="true">
        <defs>
          <filter id="water-ripple" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence
              id="ripple-turb"
              type="fractalNoise"
              baseFrequency="0.014 0.020"
              numOctaves="2"
              seed="2"
              result="noise"
            />
            <feDisplacementMap
              id="ripple-disp"
              in="SourceGraphic"
              in2="noise"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
      </svg>

      {/* 旋转提示 */}
      <div className="rotate-prompt">
        <div className="rotate-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M16.48 2.52c3.27 1.55 5.61 4.72 5.97 8.48h1.5C23.44 4.84 18.29 0 12 0l-.66.03 3.81 3.81 1.33-1.32zm-6.25-.77c-.59-.59-1.54-.59-2.12 0L1.75 8.11c-.59.59-.59 1.54 0 2.12l12.02 12.02c.59.59 1.54.59 2.12 0l6.36-6.36c.59-.59.59-1.54 0-2.12L10.23 1.75zm4.6 19.44L2.81 9.17l6.36-6.36 12.02 12.02-6.36 6.36zm-7.31.29C4.25 19.94 1.91 16.76 1.55 13H.05C.56 19.16 5.71 24 12 24l.66-.03-3.81-3.81-1.33 1.32z" />
          </svg>
        </div>
        <h2>请旋转设备</h2>
        <p>为了获得最佳体验，请将设备横向放置</p>
      </div>

      <main className="page">
        <header className="topbar">
          <div>
            <h1 className="title">HANAKO</h1>
            <p className="subtitle">花子的涩涩日记</p>
          </div>
          <p className="hint">Scroll → Explore</p>
        </header>

        <section className="timeline-viewport" id="timelineViewport">
          <div className="timeline-track" id="timelineTrack" />
        </section>
      </main>

      {/* 底部时间轴导航 + 跳转胶囊 */}
      <div className="timeline-bottom" id="timelineBottom">
        <nav className="timeline-nav" id="timelineNav" aria-label="项目导航">
          <div className="timeline-nav-track">
            <div className="timeline-nav-fill" id="timelineNavFill" />
            <div className="timeline-nav-nodes" id="timelineNavNodes" />
          </div>
        </nav>
        <div className="timeline-nav-jump" id="timelineNavJump" aria-label="跳转到指定卡片">
          <div className="timeline-nav-count" id="timelineNavCount">
            <b>
              <span className="num-cell">1</span>
            </b>
          </div>
        </div>
      </div>

      <div className="overlay" id="overlay" />
      <div className="focus-aura" id="focusAura" />

      {/* 图片查看器 */}
      <div className="image-viewer" id="imageViewer">
        <div className="image-viewer-backdrop" id="imageViewerBackdrop" />
        <div className="image-viewer-content">
          <div className="image-viewer-close" id="imageViewerClose" />
          <img id="imageViewerImg" src="" alt="" />
        </div>
      </div>

      {/* 跳转弹窗 */}
      <div className="jump-modal" id="jumpModal" aria-hidden="true">
        <div className="jump-modal-backdrop" id="jumpModalBackdrop" />
        <div className="jump-modal-panel" role="dialog" aria-modal="true" aria-labelledby="jumpModalTitle">
          <h3 className="jump-modal-title" id="jumpModalTitle">跳转到帖子</h3>
          <p className="jump-modal-hint">输入帖子编号，自动跳转</p>
          <input type="number" className="jump-modal-input" id="jumpModalInput" min={1} inputMode="numeric" />
          <p className="jump-modal-hint-bottom">Enter 确认 · Esc 关闭</p>
        </div>
      </div>
    </>
  );
}

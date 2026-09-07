import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { PROJECTS } from "../data/projects";

gsap.registerPlugin(ScrollTrigger);

const NAV_WINDOW = 5;

const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;

/**
 * 初始化整站交互（横向时间线 / 卡片聚焦 / 内容面板 / 文章目录 / 底部导航）。
 * 返回清理函数。
 */
export function initHanako(): () => void {
  const track = $("timelineTrack");
  const navNodesEl = $("timelineNavNodes");
  const navFillEl = $("timelineNavFill");
  const navCountEl = $("timelineNavCount");
  const viewport = $("timelineViewport");
  const overlay = $("overlay");
  const focusAura = $("focusAura");
  const imageViewer = $("imageViewer");
  const imageViewerImg = $<HTMLImageElement>("imageViewerImg");
  const imageViewerBackdrop = $("imageViewerBackdrop");
  const imageViewerClose = $("imageViewerClose");
  const jumpModal = $("jumpModal");
  const jumpModalBackdrop = $("jumpModalBackdrop");
  const jumpModalInput = $<HTMLInputElement>("jumpModalInput");
  const jumpModalPanel = jumpModal.querySelector(".jump-modal-panel") as HTMLElement;

  if (!track || !navNodesEl || !viewport) return () => {};

  const cleanups: Array<() => void> = [];
  const on = <K extends keyof WindowEventMap>(
    target: Window,
    type: K,
    fn: (e: WindowEventMap[K]) => void,
    opts?: AddEventListenerOptions | boolean
  ) => {
    target.addEventListener(type, fn as EventListener, opts);
    cleanups.push(() => target.removeEventListener(type, fn as EventListener, opts));
  };

  // ── 渲染卡片 & 底部节点 ──
  track.innerHTML = "";
  navNodesEl.innerHTML = "";
  PROJECTS.forEach((p, i) => {
    const thumbInner = p.image
      ? `<img src="${p.image}" alt="${p.title}" style="width:100%;height:100%;object-fit:cover;">`
      : `<div class="noise"></div>`;
    track.insertAdjacentHTML(
      "beforeend",
      `<article class="project-card" data-depth="${p.depth}" data-index="${i}">
        <div class="project-thumb">${thumbInner}</div>
        <div class="project-meta">
          <p class="project-year">${p.year} · ${p.tag}</p>
          <h2 class="project-title">${p.title}</h2>
          <p class="project-desc">${p.desc}</p>
        </div>
      </article>`
    );
    const node = document.createElement("button");
    node.type = "button";
    node.className = "timeline-nav-node";
    node.dataset.index = String(i);
    node.dataset.label = p.title || `#${i + 1}`;
    node.setAttribute("aria-label", `跳转到 ${p.title || "项目 " + (i + 1)}`);
    navNodesEl.appendChild(node);
  });

  const navNodes = Array.from(navNodesEl.querySelectorAll<HTMLElement>(".timeline-nav-node"));
  navCountEl.innerHTML = `<b><span class="num-cell">1</span></b>`;
  const cards = gsap.utils.toArray<HTMLElement>(".project-card");

  // ── 卡片 hover 水面扭曲 ──
  (function setupWaterRipple() {
    const turb = document.getElementById("ripple-turb");
    const disp = document.getElementById("ripple-disp");
    if (!turb || !disp) return;
    const TARGET_SCALE = 18;
    let hoverCount = 0;
    let rafId: number | null = null;
    let t = 0;
    function flowTick() {
      if (hoverCount === 0) { rafId = null; return; }
      t += 0.012;
      const fx = (0.014 + Math.sin(t) * 0.005).toFixed(4);
      const fy = (0.020 + Math.cos(t * 0.8) * 0.005).toFixed(4);
      turb!.setAttribute("baseFrequency", fx + " " + fy);
      rafId = requestAnimationFrame(flowTick);
    }
    cards.forEach(cardEl => {
      cardEl.addEventListener("mouseenter", () => {
        hoverCount++;
        if (!rafId) rafId = requestAnimationFrame(flowTick);
        gsap.to(disp, { attr: { scale: TARGET_SCALE }, duration: 0.4, ease: "power2.in", overwrite: true });
      });
      cardEl.addEventListener("mouseleave", () => {
        hoverCount = Math.max(0, hoverCount - 1);
        gsap.to(disp, { attr: { scale: 0 }, duration: 0.3, ease: "power2.out", overwrite: true });
      });
    });
    cleanups.push(() => { hoverCount = 0; if (rafId) cancelAnimationFrame(rafId); });
  })();

  let activeCard: HTMLElement | null = null;
  let activeFocusCard: HTMLElement | null = null;
  let activeContentPanel: HTMLElement | null = null;
  let activeTocRail: HTMLElement | null = null;
  let canParallax = true;
  let pointerX = window.innerWidth * 0.5;
  let pointerY = window.innerHeight * 0.5;
  let smoothX = pointerX;
  let smoothY = pointerY;
  let scrollTween: gsap.core.Timeline | null = null;
  let activeSnapshot: Record<string, number | string> | null = null;

  const cardStates = cards.map((card, i) => ({
    card,
    baseY: i % 2 ? -18 - i * 2 : 14 + i * 2,
    baseRotate: i % 2 ? 2.2 : -2.2,
    depth: Number(card.dataset.depth) || 1
  }));
  const parallaxSetters = cardStates.map(state => ({
    x: gsap.quickTo(state.card, "xPercent", { duration: 0.85, ease: "power3.out" }),
    y: gsap.quickTo(state.card, "yPercent", { duration: 0.85, ease: "power3.out" })
  }));

  // ── 图片查看器 ──
  function openImageViewer(src: string) {
    imageViewerImg.src = src;
    imageViewer.classList.add("active");
    document.body.style.overflow = "hidden";
  }
  function closeImageViewer() {
    imageViewer.classList.remove("active");
    document.body.style.overflow = activeCard ? "hidden" : "";
    setTimeout(() => { imageViewerImg.src = ""; }, 400);
  }
  imageViewerBackdrop.addEventListener("click", closeImageViewer);
  imageViewerClose.addEventListener("click", closeImageViewer);
  cleanups.push(() => {
    imageViewerBackdrop.removeEventListener("click", closeImageViewer);
    imageViewerClose.removeEventListener("click", closeImageViewer);
  });

  function layoutCards() {
    cardStates.forEach((state, i) => {
      gsap.set(state.card, { y: state.baseY, rotation: state.baseRotate, zIndex: cards.length - i });
    });
  }

  // ── 底部时间轴导航 ──
  let currentNavIndex = 0;
  let navWindowStart = -1;

  function updateNavWindow(activeIdx: number) {
    const N = navNodes.length;
    if (!N) return;
    const W = Math.min(NAV_WINDOW, N);
    let start = activeIdx - Math.floor((W - 1) / 2);
    start = Math.max(0, Math.min(N - W, start));
    if (start === navWindowStart) return;
    navWindowStart = start;
    navNodes.forEach((node, i) => {
      node.style.display = i >= start && i < start + W ? "" : "none";
    });
  }

  function updateTimelineNav(progress: number) {
    const N = navNodes.length;
    if (!N) return;
    const p = Math.max(0, Math.min(1, progress));
    const idx = N === 1 ? 0 : Math.round(p * (N - 1));
    const clamped = Math.max(0, Math.min(N - 1, idx));
    updateNavWindow(clamped);
    navNodes.forEach((node, i) => {
      node.classList.toggle("is-active", i === clamped);
      node.classList.toggle("is-passed", i < clamped);
    });
    const visibleFirst = navNodes.find(n => n.style.display !== "none");
    const activeNode = navNodes[clamped];
    if (visibleFirst && activeNode) {
      const startX = visibleFirst.offsetLeft + visibleFirst.offsetWidth / 2;
      const activeX = activeNode.offsetLeft + activeNode.offsetWidth / 2;
      navFillEl.style.left = startX + "px";
      navFillEl.style.width = Math.max(0, activeX - startX) + "px";
    } else {
      navFillEl.style.width = "0px";
    }
    if (clamped !== currentNavIndex) {
      currentNavIndex = clamped;
      pulseNavCountTo(clamped + 1);
    }
  }

  const prefersReducedMotion =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function pulseNavCountTo(newNum: number) {
    const b = navCountEl.querySelector("b");
    if (!b) {
      navCountEl.innerHTML = `<b><span class="num-cell">${newNum}</span></b>`;
      return;
    }
    const liveCells = b.querySelectorAll<HTMLElement>(".num-cell:not(.popping-out)");
    const lastCell = liveCells[liveCells.length - 1];
    if (!lastCell) {
      b.innerHTML = `<span class="num-cell">${newNum}</span>`;
      return;
    }
    if (lastCell.textContent === String(newNum)) return;
    if (prefersReducedMotion) {
      lastCell.textContent = String(newNum);
      return;
    }
    lastCell.classList.add("popping-out");
    lastCell.addEventListener("animationend", () => lastCell.remove(), { once: true });
    const newCell = document.createElement("span");
    newCell.className = "num-cell popping-in";
    newCell.textContent = String(newNum);
    b.appendChild(newCell);
    newCell.addEventListener("animationend", () => newCell.classList.remove("popping-in"), { once: true });
  }

  updateNavWindow(0);

  function jumpToIndex(i: number) {
    if (!scrollTween || !scrollTween.scrollTrigger) return;
    const N = navNodes.length;
    if (N <= 1) return;
    const clamped = Math.max(0, Math.min(N - 1, i));
    const targetProgress = clamped / (N - 1);
    const st = scrollTween.scrollTrigger;
    const targetScroll = st.start + targetProgress * (st.end - st.start);
    window.scrollTo({ top: targetScroll, behavior: "smooth" });
  }

  navNodes.forEach(node => {
    node.addEventListener("click", e => {
      e.stopPropagation();
      if (activeCard) closeCard();
      jumpToIndex(parseInt(node.dataset.index || "0", 10));
    });
  });

  // ── 跳转弹窗 ──
  navCountEl.title = "点击跳转到指定帖子";
  const isJumpModalOpen = () => jumpModal.classList.contains("is-open");
  function openJumpModal() {
    const N = navNodes.length;
    if (N <= 1) return;
    jumpModalInput.max = String(N);
    jumpModalInput.value = "";
    jumpModalInput.placeholder = String(currentNavIndex + 1);
    jumpModal.classList.add("is-open");
    jumpModal.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => requestAnimationFrame(() => jumpModalInput.focus()));
  }
  function closeJumpModal() {
    if (!isJumpModalOpen()) return;
    jumpModal.classList.remove("is-open");
    jumpModal.setAttribute("aria-hidden", "true");
    jumpModalInput.blur();
  }
  function commitJumpModal() {
    const N = navNodes.length;
    const val = parseInt(jumpModalInput.value, 10);
    const valid = !isNaN(val) && val >= 1 && val <= N;
    closeJumpModal();
    if (valid) {
      if (activeCard) closeCard();
      jumpToIndex(val - 1);
    }
  }
  const onInputKey = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); commitJumpModal(); }
    else if (e.key === "Escape") { e.preventDefault(); closeJumpModal(); }
  };
  const stopProp = (e: Event) => e.stopPropagation();
  navCountEl.addEventListener("click", openJumpModal);
  jumpModalBackdrop.addEventListener("click", closeJumpModal);
  jumpModalInput.addEventListener("keydown", onInputKey);
  jumpModalPanel?.addEventListener("click", stopProp);
  cleanups.push(() => {
    navCountEl.removeEventListener("click", openJumpModal);
    jumpModalBackdrop.removeEventListener("click", closeJumpModal);
    jumpModalInput.removeEventListener("keydown", onInputKey);
    jumpModalPanel?.removeEventListener("click", stopProp);
  });

  // ── 纵向滚动 → 横向时间线 ──
  function buildScroll() {
    if (scrollTween) {
      scrollTween.scrollTrigger?.kill();
      scrollTween.kill();
    }
    const totalMove = Math.max(track.scrollWidth - viewport.clientWidth + window.innerWidth * 0.08, 0);
    const totalScroll = Math.max(totalMove + window.innerHeight * 0.9, window.innerHeight);
    const segment = 0.9;
    const timelineDuration = (cards.length - 1) * segment + segment * 2;
    const hasTouchScreen = "ontouchstart" in window;

    scrollTween = gsap.timeline({
      scrollTrigger: {
        trigger: viewport,
        start: "top top",
        end: () => "+=" + totalScroll,
        scrub: hasTouchScreen ? 0.6 : 1,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: self => updateTimelineNav(self.progress)
      }
    });
    if (hasTouchScreen) {
      ScrollTrigger.normalizeScroll({ allowNestedScroll: true, type: "touch" });
    }

    scrollTween.to(track, { x: -totalMove, duration: timelineDuration, ease: "none" }, 0);

    cards.forEach((card, i) => {
      const enterAt = i * segment;
      const leaveAt = enterAt + segment;
      scrollTween!.fromTo(
        card,
        {
          opacity: i === 0 ? 1 : 0.12,
          scale: i === 0 ? 1 : 0.92,
          x: i === 0 ? 0 : 90,
          filter: i === 0 ? "blur(0px)" : "blur(8px)"
        },
        { opacity: 1, scale: 1, x: 0, filter: "blur(0px)", duration: segment, ease: "power3.out", immediateRender: false },
        enterAt
      );
      scrollTween!.to(card, { opacity: 0.35, scale: 0.93, x: -60, duration: segment, ease: "power4.out" }, leaveAt);
    });
  }

  function pointerMove(e: PointerEvent) {
    pointerX = e.clientX;
    pointerY = e.clientY;
  }

  let parallaxRaf = 0;
  function renderParallax() {
    smoothX += (pointerX - smoothX) * 0.08;
    smoothY += (pointerY - smoothY) * 0.08;
    if (canParallax) {
      const cx = window.innerWidth * 0.5;
      const cy = window.innerHeight * 0.5;
      const nx = (smoothX - cx) / cx;
      const ny = (smoothY - cy) / cy;
      cardStates.forEach((state, i) => {
        parallaxSetters[i].x(nx * 15 * state.depth);
        parallaxSetters[i].y(ny * 10 * state.depth);
      });
    }
    parallaxRaf = requestAnimationFrame(renderParallax);
  }

  // ── 关闭卡片：圆球化 → 果冻弹跳 → 樱花爆散 ──
  function closeCard() {
    if (!activeCard || !activeFocusCard) return;

    const card = activeCard;
    const focusCardEl = activeFocusCard;
    const contentPanel = activeContentPanel;
    const tocRail = activeTocRail;
    const saved = activeSnapshot;
    activeCard = null;
    activeFocusCard = null;
    activeContentPanel = null;
    activeTocRail = null;
    activeSnapshot = null;
    canParallax = true;
    document.body.style.overflow = "";

    if (tocRail && tocRail.parentNode === document.body) {
      gsap.to(tocRail, { opacity: 0, x: -10, duration: 0.25, ease: "power2.in", onComplete: () => tocRail.remove() });
    }

    gsap.to(overlay, {
      opacity: 0, duration: 0.45, ease: "power3.out",
      onComplete: () => { overlay.style.pointerEvents = "none"; }
    });
    gsap.to(focusAura, { opacity: 0, scale: 0.9, duration: 0.45, ease: "power3.out" });

    if (contentPanel) {
      contentPanel.querySelectorAll("video").forEach(v => v.pause());
      gsap.to(contentPanel, {
        scale: 0.7, opacity: 0, x: "+=20", duration: 0.35, ease: "power2.in",
        onComplete: () => contentPanel.remove()
      });
    }

    const focusRect = focusCardEl.getBoundingClientRect();
    const focusW = focusRect.width;
    const focusH = focusRect.height;
    const targetSize = Math.min(focusW, focusH) * 0.4;
    const compensateX = (focusW - targetSize) / 2;
    const compensateY = (focusH - targetSize) / 2;

    gsap.set(focusCardEl, { overflow: "hidden", transformOrigin: "50% 50%" });

    const nonThumbParts = focusCardEl.querySelectorAll(".project-year, .project-title, .project-meta, .project-desc");
    if (nonThumbParts.length > 0) {
      gsap.to(nonThumbParts, { opacity: 0, duration: 0.15, ease: "power2.in" });
    }

    const tl = gsap.timeline({
      onComplete: () => {
        focusCardEl.remove();
        gsap.set(card, {
          x: saved ? saved.x : 0,
          y: saved ? saved.y : 0,
          scale: saved ? saved.scale : 1,
          rotation: saved ? saved.rotation : 0,
          xPercent: saved ? saved.xPercent : 0,
          yPercent: saved ? saved.yPercent : 0,
          filter: saved ? saved.filter : "blur(0px)",
          opacity: 1
        });
        card.classList.remove("is-active");
      }
    });

    tl.to(focusCardEl, {
      width: targetSize, height: targetSize, borderRadius: "50%",
      x: `+=${compensateX}`, y: `+=${compensateY}`,
      duration: 0.26, ease: "power3.out"
    }, 0);
    tl.to(focusCardEl, { scaleX: 1.22, scaleY: 0.82, duration: 0.09, ease: "power2.out" }, 0.24);
    tl.to(focusCardEl, { scaleX: 0.85, scaleY: 1.15, duration: 0.09, ease: "power2.inOut" }, 0.33);
    tl.to(focusCardEl, { scaleX: 1, scaleY: 1, duration: 0.06, ease: "power2.out" }, 0.42);
    tl.to(focusCardEl, {
      scaleX: 0.4, scaleY: 0.4, opacity: 0, duration: 0.18, ease: "power2.in",
      onStart: () => {
        const r = focusCardEl.getBoundingClientRect();
        spawnSakuraBurst(r.left + r.width / 2, r.top + r.height / 2);
      }
    }, 0.48);

    gsap.set(card, { opacity: 0 });
    card.classList.remove("is-active");
    tl.to(card, { opacity: 1, duration: 0.38, ease: "power2.out" }, 0.18);
  }

  // ── 樱花爆散 ──
  function spawnSakuraBurst(cx: number, cy: number) {
    const burst = document.createElement("div");
    burst.className = "sakura-burst";
    burst.style.left = cx + "px";
    burst.style.top = cy + "px";
    document.body.appendChild(burst);
    gsap.fromTo(burst, { scale: 0.3, opacity: 0.9 },
      { scale: 3.2, opacity: 0, duration: 0.7, ease: "power2.out", onComplete: () => burst.remove() });

    const NUM_PETALS = 18;
    const tones = ["", "tone-2", "tone-3"];
    for (let i = 0; i < NUM_PETALS; i++) {
      const petal = document.createElement("div");
      petal.className = "sakura-petal";
      const tone = tones[Math.floor(Math.random() * tones.length)];
      if (tone) petal.classList.add(tone);
      const size = 14 + Math.random() * 10;
      petal.style.width = size + "px";
      petal.style.height = size * 1.22 + "px";
      petal.style.left = cx - size / 2 + "px";
      petal.style.top = cy - size * 0.6 + "px";
      const initRot = Math.random() * 360;
      document.body.appendChild(petal);

      const angle = (i / NUM_PETALS) * Math.PI * 2 + (Math.random() - 0.5) * 0.7;
      const burstDist = 60 + Math.random() * 70;
      const drift = (Math.random() < 0.5 ? -1 : 1) * (40 + Math.random() * 90);
      const fall = window.innerHeight * 0.55 + Math.random() * 280;
      const totalRot = initRot + (Math.random() < 0.5 ? -1 : 1) * (180 + Math.random() * 540);
      const burstDur = 0.28 + Math.random() * 0.12;
      const fallDur = 0.95 + Math.random() * 0.55;
      const finalScale = 0.45 + Math.random() * 0.25;
      const burstX = Math.cos(angle) * burstDist;
      const burstY = Math.sin(angle) * burstDist * 0.55 - 12;

      const petalTl = gsap.timeline({ onComplete: () => petal.remove() });
      gsap.set(petal, { rotation: initRot });
      petalTl.to(petal, { x: burstX, y: burstY, rotation: initRot + (Math.random() - 0.5) * 90, duration: burstDur, ease: "power2.out" });
      petalTl.to(petal, { x: `+=${drift}`, y: `+=${fall}`, rotation: totalRot, scale: finalScale, opacity: 0, duration: fallDur, ease: "power1.in" });
    }
  }

  // ── 迷你花瓣：目录跳转抵达标题时 ──
  function spawnMiniPetals(cx: number, cy: number) {
    const tones = ["", "tone-2", "tone-3"];
    const NUM = 7;
    for (let i = 0; i < NUM; i++) {
      const p = document.createElement("div");
      p.className = "sakura-petal " + tones[i % tones.length];
      const size = 6 + Math.random() * 5;
      p.style.width = size + "px";
      p.style.height = size * 1.22 + "px";
      p.style.left = cx + "px";
      p.style.top = cy + "px";
      p.style.zIndex = "1300";
      document.body.appendChild(p);
      const ang = -Math.PI * 0.12 - Math.random() * Math.PI * 0.76;
      const dist = 26 + Math.random() * 42;
      const tl = gsap.timeline({ onComplete: () => p.remove() });
      gsap.set(p, { scale: 0, rotation: Math.random() * 360, opacity: 1 });
      tl.to(p, {
        x: Math.cos(ang) * dist, y: Math.sin(ang) * dist, scale: 1,
        rotation: "+=" + (Math.random() * 200 - 100),
        duration: 0.42 + Math.random() * 0.15, ease: "power2.out"
      });
      tl.to(p, {
        y: "+=18", x: "+=" + (Math.random() * 16 - 8),
        rotation: "+=" + (Math.random() * 120 - 60), opacity: 0,
        duration: 0.5 + Math.random() * 0.3, ease: "power1.in"
      });
    }
  }

  // ── 聚焦卡片 ──
  function focusCard(card: HTMLElement) {
    if (activeCard === card) { closeCard(); return; }
    if (activeCard && activeCard !== card) closeCard();

    canParallax = false;
    activeCard = card;
    card.classList.add("is-active");
    document.body.style.overflow = "hidden";

    overlay.style.pointerEvents = "auto";
    gsap.to(overlay, { opacity: 1, duration: 0.5, ease: "power4.out" });

    const rect = card.getBoundingClientRect();
    const cardCenterX = rect.left + rect.width * 0.5;
    const centerY = window.innerHeight * 0.5;

    const proj = PROJECTS[parseInt(card.dataset.index || "0", 10)];
    const hasTwoPanel = !!(proj && proj.content);
    const isMobile = "ontouchstart" in window && window.innerWidth <= 860;
    const gap = isMobile ? 12 : 28;

    const scaleFactor = isMobile ? 1 : 1.35;
    const focusW = rect.width * scaleFactor;
    const focusH = rect.height * scaleFactor;

    const mobileLeftOffset = isMobile && hasTwoPanel ? window.innerWidth * 0.06 : 0;
    const panelGap = hasTwoPanel ? 0 : gap;
    const targetCenterX = hasTwoPanel
      ? window.innerWidth * 0.5 - focusW * 0.5 - panelGap * 0.5 - mobileLeftOffset
      : window.innerWidth * 0.5;
    const offsetX = targetCenterX - cardCenterX;
    const auraWidth = focusW * 1.36;
    const auraHeight = focusH * 1.42;

    let finalImageWidth: number, finalPanelWidth: number, imageX: number, panelX: number;
    if (hasTwoPanel) {
      const totalWidth = focusW * 2;
      const availableWidth = window.innerWidth * 0.85;
      const scale = Math.min(1, availableWidth / totalWidth);
      finalImageWidth = focusW * scale;
      finalPanelWidth = focusW * scale;
      const layoutStartX = (window.innerWidth - (finalImageWidth + finalPanelWidth)) / 2;
      imageX = layoutStartX;
      panelX = layoutStartX + finalImageWidth;
    } else {
      finalImageWidth = focusW;
      finalPanelWidth = focusW;
      imageX = targetCenterX;
      panelX = 0;
    }

    let focusCardEl: HTMLElement;
    if (hasTwoPanel && proj.image) {
      focusCardEl = document.createElement("div");
      focusCardEl.className = "focus-card focus-image-only";
      focusCardEl.innerHTML = `<img src="${proj.image}" alt="${proj.title}" style="width:100%;height:100%;object-fit:cover;">`;
      document.body.appendChild(focusCardEl);
    } else {
      focusCardEl = card.cloneNode(true) as HTMLElement;
      focusCardEl.classList.remove("is-active");
      focusCardEl.classList.add("focus-card");
      if (hasTwoPanel && !proj.image) {
        const descEl = focusCardEl.querySelector(".project-desc");
        if (descEl) descEl.innerHTML = proj.content!;
      }
      document.body.appendChild(focusCardEl);
    }

    activeFocusCard = focusCardEl;
    focusCardEl.addEventListener("click", e => { e.stopPropagation(); closeCard(); });

    gsap.set(focusCardEl, {
      left: rect.left, top: rect.top, width: rect.width, height: rect.height,
      x: 0, y: 0, scale: 1, rotation: 0, xPercent: 0, yPercent: 0,
      opacity: 1, filter: "blur(0px)", zIndex: 1200
    });

    activeSnapshot = {
      x: Number(gsap.getProperty(card, "x")) || 0,
      y: Number(gsap.getProperty(card, "y")) || 0,
      scale: Number(gsap.getProperty(card, "scale")) || 1,
      rotation: Number(gsap.getProperty(card, "rotation")) || 0,
      xPercent: Number(gsap.getProperty(card, "xPercent")) || 0,
      yPercent: Number(gsap.getProperty(card, "yPercent")) || 0,
      filter: String(gsap.getProperty(card, "filter") || "blur(0px)")
    };

    gsap.set(focusAura, { width: auraWidth, height: auraHeight, x: 0, y: 0 });
    gsap.to(focusAura, { opacity: 0.92, scale: 1.08, duration: 0.7, ease: "power4.out" });

    const focusCardYOffset = centerY - focusH * 0.5 - rect.top;
    const useTwoPanel = hasTwoPanel && !!proj.image;
    const finalImageX = useTwoPanel ? imageX - rect.left : offsetX;

    gsap.to(focusCardEl, {
      x: finalImageX, y: focusCardYOffset,
      width: useTwoPanel ? finalImageWidth : focusW, height: focusH,
      scale: 1, filter: "blur(0px)", duration: 0.8, ease: "expo.out"
    });

    if (useTwoPanel) {
      const panel = document.createElement("div");
      panel.className = "content-panel";
      const scrollWrapper = document.createElement("div");
      scrollWrapper.className = "content-scroll-wrapper";
      scrollWrapper.innerHTML = proj.content!
        .split(/\n/)
        .filter(s => s.trim())
        .map(s => (/^<[a-z]/i.test(s.trim()) ? s.trim() : `<p>${s.trim()}</p>`))
        .join("");
      panel.appendChild(scrollWrapper);
      document.body.appendChild(panel);
      activeContentPanel = panel;

      const FADE = 110;
      const MAX_BLUR = 25;
      let updateToc: () => void = () => {};

      function updateBlur() {
        const wrapRect = scrollWrapper.getBoundingClientRect();
        const H = wrapRect.height;
        const scrolled = scrollWrapper.scrollTop > 5;
        scrollWrapper
          .querySelectorAll<HTMLElement>(".article-toc, p, h1, h2, h3, h4, ul, ol, hr, img, video")
          .forEach(el => {
            const r = el.getBoundingClientRect();
            const top = r.top - wrapRect.top;
            const bot = r.bottom - wrapRect.top;
            let t = 1;
            if (bot < 0 || top > H) t = 0;
            else if (top > H - FADE) t = Math.max(0, (H - top) / FADE);
            else if (scrolled && bot < FADE) t = Math.max(0, bot / FADE);
            el.style.filter = t < 0.99 ? `blur(${(MAX_BLUR * (1 - t)).toFixed(2)}px)` : "";
            el.style.opacity = t < 0.99 ? (0.15 + 0.85 * t).toFixed(3) : "";
          });
      }

      function updateVideoPlayback() {
        const wrapRect = scrollWrapper.getBoundingClientRect();
        scrollWrapper.querySelectorAll("video").forEach(vid => {
          const r = vid.getBoundingClientRect();
          const top = r.top - wrapRect.top;
          const bot = r.bottom - wrapRect.top;
          const H = wrapRect.height;
          const visibleFraction = bot > top ? (Math.min(bot, H) - Math.max(top, 0)) / (bot - top) : 0;
          if (visibleFraction > 0.3) { if (vid.paused) vid.play().catch(() => {}); }
          else if (!vid.paused) vid.pause();
        });
      }

      let rafId: number | null = null;
      scrollWrapper.addEventListener("scroll", () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => { updateBlur(); updateVideoPlayback(); updateToc(); rafId = null; });
      });
      requestAnimationFrame(() => { updateBlur(); updateVideoPlayback(); updateToc(); });
      scrollWrapper.querySelectorAll("img").forEach(img => {
        img.addEventListener("load", () => { updateBlur(); updateToc(); }, { once: true });
      });

      const panelLeft = panelX;
      const panelW = isMobile
        ? Math.min(window.innerWidth - panelLeft - 8, focusW * 1.4)
        : finalPanelWidth;

      gsap.set(panel, {
        left: panelLeft, top: centerY - focusH * 0.5, width: panelW, height: focusH,
        scale: 0.82, opacity: 0, y: 32, zIndex: 1200
      });
      gsap.to(panel, {
        scale: 1, opacity: 1, y: 0, duration: 0.72, delay: 0.18, ease: "back.out(1.9)",
        onUpdate: () => { updateBlur(); updateVideoPlayback(); },
        onComplete: () => { updateBlur(); updateVideoPlayback(); }
      });

      panel.addEventListener("click", e => {
        e.stopPropagation();
        const t = e.target as HTMLElement;
        if (t.tagName === "IMG" && t.closest(".content-scroll-wrapper")) {
          openImageViewer((t as HTMLImageElement).src);
        }
      });

      let targetScroll = 0;
      panel.addEventListener("wheel", e => {
        e.preventDefault();
        e.stopPropagation();
        const maxScroll = scrollWrapper.scrollHeight - scrollWrapper.clientHeight;
        targetScroll = Math.max(0, Math.min(maxScroll, targetScroll + e.deltaY * 0.4));
        gsap.to(scrollWrapper, {
          scrollTop: targetScroll, duration: 0.75, ease: "power3.out", overwrite: "auto",
          onUpdate: () => { updateBlur(); updateVideoPlayback(); updateToc(); }
        });
      }, { passive: false });

      // ══════════════════════════════════════════════════════════
      // 文章目录 TOC
      //   ① 开头目录卡（逐条吹入，点击跳转）
      //   ② 面板右侧竖向导航轨（节点 + 连续进度线，hover 展开标签）
      //   ③ 跳转：GSAP 平滑滚动 → 抵达后标题下划线扫过 + 柔光 + 迷你花瓣
      //   ④ scroll-spy：滚动时两处同步高亮
      // ══════════════════════════════════════════════════════════
      const headings = Array.from(scrollWrapper.querySelectorAll<HTMLElement>("h1, h2, h3, h4"));
      if (headings.length >= 2) {
        const minLv = Math.min(...headings.map(h => parseInt(h.tagName[1], 10)));
        const lvOf = (h: HTMLElement) => Math.min(3, parseInt(h.tagName[1], 10) - minLv + 1);
        headings.forEach((h, i) => {
          h.classList.add("toc-target");
          h.dataset.tocIndex = String(i);
        });

        // ① 目录卡
        const toc = document.createElement("nav");
        toc.className = "article-toc";
        toc.setAttribute("aria-label", "文章目录");
        toc.innerHTML = `
          <div class="article-toc-head">
            <span class="article-toc-kicker">Contents</span>
            <span class="article-toc-count">${headings.length} 节</span>
          </div>
          <ol>${headings.map((h, i) => `
            <li class="article-toc-item lv-${lvOf(h)}" data-toc="${i}">
              <span class="article-toc-num">${String(i + 1).padStart(2, "0")}</span>
              <span class="article-toc-text">${(h.textContent || "").trim()}</span>
              <span class="article-toc-arrow">→</span>
            </li>`).join("")}
          </ol>`;
        scrollWrapper.prepend(toc);

        // ② 竖向导航轨（第 0 个节点 = 回到目录）
        const rail = document.createElement("div");
        rail.className = "toc-rail";
        const railTrack = document.createElement("div");
        railTrack.className = "toc-rail-track";
        const railNodes = document.createElement("div");
        railNodes.className = "toc-rail-nodes";
        const railFill = document.createElement("div");
        railFill.className = "toc-rail-fill";

        const nodeDefs = [{ label: "目录", idx: -1, lv: 1 }].concat(
          headings.map((h, i) => ({ label: (h.textContent || "").trim(), idx: i, lv: lvOf(h) }))
        );
        nodeDefs.forEach(d => {
          const n = document.createElement("button");
          n.type = "button";
          n.className = `toc-node lv-${d.lv}`;
          n.dataset.label = d.label;
          n.dataset.toc = String(d.idx);
          n.setAttribute("aria-label", "跳转到 " + d.label);
          railNodes.appendChild(n);
        });
        railNodes.style.height = Math.min(focusH * 0.78, nodeDefs.length * 34) + "px";
        railNodes.appendChild(railFill);
        railTrack.appendChild(railNodes);
        rail.appendChild(railTrack);

        const spaceRight = window.innerWidth - (panelLeft + panelW);
        const railInside = isMobile || spaceRight < 150;
        if (railInside) {
          rail.classList.add("is-inside");
          panel.appendChild(rail);
          scrollWrapper.style.paddingRight = "2.8rem";
        } else {
          gsap.set(rail, { left: panelLeft + panelW + 14, top: centerY - focusH * 0.5, height: focusH, width: 44 });
          document.body.appendChild(rail);
        }
        activeTocRail = rail;

        const nodeEls = Array.from(railNodes.querySelectorAll<HTMLElement>(".toc-node"));
        const itemEls = Array.from(toc.querySelectorAll<HTMLElement>(".article-toc-item"));
        const HEAD_OFFSET = 26;
        const maxScrollOf = () => scrollWrapper.scrollHeight - scrollWrapper.clientHeight;
        const targetTopOf = (i: number) =>
          i < 0 ? 0 : Math.max(0, Math.min(maxScrollOf(), headings[i].offsetTop - HEAD_OFFSET));

        // ③ 抵达标题
        function hitHeading(h: HTMLElement) {
          h.classList.remove("is-hit");
          void h.offsetWidth;
          h.classList.add("is-hit");
          const r = h.getBoundingClientRect();
          spawnMiniPetals(r.left + Math.min(r.width * 0.5, 36), r.top + r.height * 0.45);
          const onEnd = (e: AnimationEvent) => {
            if (e.animationName !== "toc-glow") return;
            h.classList.remove("is-hit");
            h.removeEventListener("animationend", onEnd);
          };
          h.addEventListener("animationend", onEnd);
        }

        function scrollToHeading(i: number) {
          const dest = targetTopOf(i);
          targetScroll = dest;
          const dist = Math.abs(dest - scrollWrapper.scrollTop);
          const dur = gsap.utils.clamp(0.5, 1.2, 0.45 + dist / 1400);
          gsap.to(scrollWrapper, {
            scrollTop: dest, duration: dur, ease: "power3.inOut", overwrite: "auto",
            onUpdate: () => { updateBlur(); updateVideoPlayback(); updateToc(); },
            onComplete: () => {
              updateBlur(); updateToc();
              if (i >= 0) hitHeading(headings[i]);
            }
          });
        }

        // ④ scroll-spy
        updateToc = function () {
          const st = scrollWrapper.scrollTop;
          const H = scrollWrapper.clientHeight;
          const maxS = maxScrollOf();
          const probe = st + H * 0.3;
          let active = -1;
          headings.forEach((h, i) => { if (h.offsetTop - HEAD_OFFSET <= probe) active = i; });
          if (maxS > 0 && st >= maxS - 2) active = headings.length - 1;
          const a = active + 1;

          nodeEls.forEach((n, i) => {
            n.classList.toggle("is-active", i === a);
            n.classList.toggle("is-passed", i < a);
          });
          itemEls.forEach((el, i) => el.classList.toggle("is-active", i === active));

          const center = (n: HTMLElement) => n.offsetTop + n.offsetHeight / 2;
          const from = targetTopOf(active);
          const to = active + 1 < headings.length ? targetTopOf(active + 1) : maxS;
          const frac = to > from ? gsap.utils.clamp(0, 1, (st - from) / (to - from)) : 1;
          const y0 = center(nodeEls[0]);
          const ya = center(nodeEls[a]);
          const yn = nodeEls[a + 1] ? center(nodeEls[a + 1]) : ya;
          railFill.style.top = y0 + "px";
          railFill.style.height = Math.max(0, ya + (yn - ya) * frac - y0) + "px";
        };

        toc.addEventListener("click", e => {
          const li = (e.target as HTMLElement).closest<HTMLElement>(".article-toc-item");
          if (!li) return;
          e.stopPropagation();
          scrollToHeading(parseInt(li.dataset.toc || "0", 10));
        });
        rail.addEventListener("click", e => {
          e.stopPropagation();
          const n = (e.target as HTMLElement).closest<HTMLElement>(".toc-node");
          if (!n) return;
          scrollToHeading(parseInt(n.dataset.toc || "0", 10));
        });
        rail.addEventListener("wheel", e => {
          e.preventDefault();
          e.stopPropagation();
          panel.dispatchEvent(new WheelEvent("wheel", { deltaY: e.deltaY, cancelable: true }));
        }, { passive: false });

        // 入场
        gsap.fromTo(itemEls,
          { x: -14, opacity: 0, filter: "blur(6px)" },
          { x: 0, opacity: 1, filter: "blur(0px)", duration: 0.55, stagger: 0.06, delay: 0.5, ease: "power3.out", clearProps: "filter" }
        );
        gsap.fromTo(rail,
          { opacity: 0, x: railInside ? 10 : -12 },
          { opacity: 1, x: 0, duration: 0.6, delay: 0.55, ease: "power3.out" }
        );
        gsap.fromTo(nodeEls,
          { scale: 0 },
          { scale: 1, duration: 0.5, stagger: 0.05, delay: 0.6, ease: "back.out(2.2)", clearProps: "transform" }
        );
        requestAnimationFrame(updateToc);
      }
    } else {
      focusCardEl.addEventListener("wheel", e => {
        const meta = focusCardEl.querySelector<HTMLElement>(".project-meta");
        if (meta) { e.preventDefault(); e.stopPropagation(); meta.scrollTop += e.deltaY; }
      }, { passive: false });
    }
  }

  cards.forEach(card => {
    card.addEventListener("click", e => { e.stopPropagation(); focusCard(card); });
  });
  overlay.addEventListener("click", closeCard);
  cleanups.push(() => overlay.removeEventListener("click", closeCard));

  on(window, "pointermove", pointerMove, { passive: true });
  on(window, "resize", () => {
    layoutCards();
    ScrollTrigger.refresh();
    if (scrollTween && scrollTween.scrollTrigger) updateTimelineNav(scrollTween.scrollTrigger.progress);
  });

  // ── 移动端触摸：左右滑动驱动时间线 ──
  (function initTouchSwipe() {
    if (!("ontouchstart" in window)) return;
    let touchStartX = 0, touchStartY = 0, locked: "h" | "v" | null = null;
    let velocity = 0, rafTick: number | null = null, lastMoveTime = 0;

    viewport.addEventListener("touchstart", e => {
      if (activeCard) return;
      const t = e.touches[0];
      touchStartX = t.clientX;
      touchStartY = t.clientY;
      locked = null;
      velocity = 0;
      if (rafTick) { cancelAnimationFrame(rafTick); rafTick = null; }
    }, { passive: true });

    viewport.addEventListener("touchmove", e => {
      if (activeCard) return;
      const t = e.touches[0];
      const dx = t.clientX - touchStartX;
      const dy = t.clientY - touchStartY;
      if (locked === null) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        locked = Math.abs(dx) >= Math.abs(dy) ? "h" : "v";
      }
      if (locked !== "h") return;
      e.preventDefault();
      const now = Date.now();
      const delta = -(t.clientX - touchStartX);
      velocity = delta / Math.max(now - lastMoveTime, 8);
      lastMoveTime = now;
      window.scrollBy(0, delta * 2.5);
      touchStartX = t.clientX;
      touchStartY = t.clientY;
    }, { passive: false });

    viewport.addEventListener("touchend", () => {
      if (locked !== "h") return;
      let v = velocity * 12;
      function inertia() {
        if (Math.abs(v) < 0.3) return;
        window.scrollBy(0, v);
        v *= 0.92;
        rafTick = requestAnimationFrame(inertia);
      }
      rafTick = requestAnimationFrame(inertia);
    }, { passive: true });
  })();

  layoutCards();
  buildScroll();
  updateTimelineNav(0);
  parallaxRaf = requestAnimationFrame(renderParallax);

  const onLoad = () => ScrollTrigger.refresh();
  on(window, "load", onLoad);
  // 图片加载完也刷新一次（React 挂载时 load 可能已触发）
  const imgs = Array.from(track.querySelectorAll("img"));
  let pending = imgs.filter(i => !i.complete).length;
  imgs.forEach(img => {
    if (img.complete) return;
    img.addEventListener("load", () => { if (--pending === 0) ScrollTrigger.refresh(); }, { once: true });
    img.addEventListener("error", () => { if (--pending === 0) ScrollTrigger.refresh(); }, { once: true });
  });
  const refreshTimer = window.setTimeout(() => ScrollTrigger.refresh(), 300);
  cleanups.push(() => clearTimeout(refreshTimer));

  // ── 键盘：Esc 关闭，←/→ 切换，Home/End 首尾 ──
  on(window, "keydown", e => {
    if (e.key === "Escape") {
      if (isJumpModalOpen()) closeJumpModal();
      else if (imageViewer.classList.contains("active")) closeImageViewer();
      else closeCard();
      return;
    }
    if (isJumpModalOpen()) return;
    if (imageViewer.classList.contains("active")) return;
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

    if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
      e.preventDefault();
      if (activeCard) closeCard();
      let nextIdx = currentNavIndex;
      if (e.key === "ArrowLeft") nextIdx = currentNavIndex - 1;
      if (e.key === "ArrowRight") nextIdx = currentNavIndex + 1;
      if (e.key === "Home") nextIdx = 0;
      if (e.key === "End") nextIdx = navNodes.length - 1;
      jumpToIndex(nextIdx);
    }
  });

  // ── 清理 ──
  return () => {
    cleanups.forEach(fn => fn());
    cancelAnimationFrame(parallaxRaf);
    if (scrollTween) {
      scrollTween.scrollTrigger?.kill();
      scrollTween.kill();
      scrollTween = null;
    }
    ScrollTrigger.getAll().forEach(st => st.kill());
    document
      .querySelectorAll(".focus-card, .content-panel, .toc-rail, .sakura-petal, .sakura-burst")
      .forEach(el => el.remove());
    document.body.style.overflow = "";
    gsap.set(overlay, { opacity: 0 });
    overlay.style.pointerEvents = "none";
    gsap.set(focusAura, { opacity: 0 });
    track.innerHTML = "";
    navNodesEl.innerHTML = "";
  };
}

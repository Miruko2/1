(() => {
  "use strict";

  // Keep touch phones in the same layout after rotating to landscape.
  const media = window.matchMedia("(max-width: 860px), (max-width: 1024px) and (pointer: coarse)");
  document.documentElement.classList.toggle("is-mobile", media.matches);

  const icons = {
    back: '<path d="m14 6-6 6 6 6"/>',
    up: '<path d="m6 11 6-6 6 6M12 5v14"/>',
    down: '<path d="m7 10 5 5 5-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
  const number = value => String(value).padStart(2, "0");
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  function mount(projects) {
    const events = new AbortController();
    const listen = (target, type, handler, options = {}) =>
      target.addEventListener(type, handler, { ...options, signal: events.signal });
    const cards = Array.from(document.querySelectorAll("#timelineTrack .project-card"));
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scrollBehavior = () => reducedMotion.matches ? "instant" : "smooth";

    const activeAnimations = new Set();
    const closingDialogs = new Set();
    const easeOut = "cubic-bezier(.22,1,.36,1)";

    // Content stays visible unless the observer is ready to reveal it.
    const reveal = !reducedMotion.matches && typeof window.IntersectionObserver === "function"
      ? new IntersectionObserver(entries => {
          entries.forEach((entry, index) => {
            if (!entry.isIntersecting) return;
            entry.target.style.setProperty("--reveal-delay", `${Math.min(index, 2) * 55}ms`);
            entry.target.classList.remove("is-reveal-pending");
            entry.target.classList.add("is-visible");
            reveal.unobserve(entry.target);
          });
        }, { rootMargin: "0px 0px 20px 0px", threshold: 0.05 })
      : null;
    cards.forEach(card => {
      card.classList.remove("is-visible");
      if (reveal) { card.classList.add("is-reveal-pending"); reveal.observe(card); }
      else card.classList.add("is-visible");
    });

    function animate(target, frames, options = {}) {
      if (destroyed || reducedMotion.matches || typeof target.animate !== "function") return null;
      const animation = target.animate(frames, { duration: 420, easing: easeOut, ...options });
      activeAnimations.add(animation);
      animation.finished.then(() => activeAnimations.delete(animation), () => activeAnimations.delete(animation));
      return animation;
    }

    // Finish through the animation lifecycle so repeated taps and teardown are safe.
    function closeDialogAnimated(dialog, after) {
      if (destroyed || !dialog.open || closingDialogs.has(dialog)) return;
      closingDialogs.add(dialog);
      const start = { transform: getComputedStyle(dialog).transform, opacity: getComputedStyle(dialog).opacity };
      dialog.getAnimations().forEach(animation => animation.cancel());
      dialog.classList.add("is-closing");
      const isSheet = dialog === directory;
      const motion = animate(dialog, [start, {
        transform: isSheet ? "translateY(calc(100% + 24px))" : "translateY(12px)",
        opacity: isSheet ? 0.85 : 0
      }], { duration: isSheet ? 280 : 160, easing: "cubic-bezier(.4,0,.7,.2)", fill: "forwards" });
      const complete = () => {
        if (destroyed) return;
        dialog.classList.remove("is-closing");
        dialog.close();
        dialog.style.transform = "";
        motion?.cancel();
        closingDialogs.delete(dialog);
        after?.();
      };
      if (motion) motion.finished.then(complete, complete);
      else complete();
    }
    let currentIndex = -1;
    let scrollFrame = 0;
    let readerFrame = 0;
    let measureFrame = 0;
    let jumpFrame = 0;
    let music = null;
    let lockedScroll = null;
    let savedBodyStyles = null;
    let activeSource = null;
    let destroyed = false;
    let readerHeadings = [];
    let headingOffsets = [];
    let outlineButtons = [];
    let currentHeading = -1;
    let readerRange = 0;
    let readerHeaderBottom = 72;
    let headingJump = null;

    const dock = element("nav", "mobile-dock");
    dock.setAttribute("aria-label", "日记浏览导航");
    dock.innerHTML = `<button type="button" class="mobile-dock-current" aria-label="打开日记目录"><span class="mobile-dock-count"></span><span class="mobile-dock-title"></span><span class="mobile-dock-label">目录</span></button><button type="button" class="mobile-icon-button" aria-label="回到顶部">${icon("up")}</button><div class="mobile-dock-progress" aria-hidden="true"><span class="mobile-progress-fill"></span></div>`;

    const directory = element("dialog", "mobile-directory");
    directory.setAttribute("aria-labelledby", "mobileDirectoryTitle");
    directory.innerHTML = `<div class="mobile-sheet-handle" aria-hidden="true"></div><header><div><h2 id="mobileDirectoryTitle">日记目录</h2><p class="mobile-directory-caption">共 ${projects.length} 篇 · 记录日常的片刻</p></div><button type="button" class="mobile-icon-button" aria-label="关闭目录">${icon("close")}</button></header><div class="mobile-directory-list"></div>`;

    const reader = element("dialog", "mobile-reader");
    reader.setAttribute("aria-labelledby", "mobileReaderTitle");
    reader.innerHTML = `<header class="mobile-reader-header">
      <button type="button" class="mobile-reader-back" aria-label="返回日记">${icon("back")}</button>
      <button type="button" class="mobile-reader-nav" aria-label="打开文章目录" aria-describedby="mobileReaderLocation" aria-haspopup="dialog" aria-controls="mobileOutline" aria-expanded="false">
        <span class="mobile-reader-location"><span class="mobile-reader-hint">轻触展开章节</span><span class="mobile-reader-chapter" id="mobileReaderLocation"></span></span>
        <span class="mobile-reader-position" aria-hidden="true"></span>${icon("down")}
      </button>
      <div class="mobile-reader-progress" aria-hidden="true"><span class="mobile-progress-fill"></span></div>
    </header><div class="mobile-reader-scroll" tabindex="0" aria-label="文章正文"><article class="mobile-reader-article"></article></div>`;

    const outline = element("dialog", "mobile-outline");
    outline.id = "mobileOutline";
    outline.setAttribute("aria-labelledby", "mobileOutlineTitle");
    outline.innerHTML = `<header><div><h2 id="mobileOutlineTitle">文章目录</h2><p class="mobile-outline-caption"></p></div><button type="button" class="mobile-icon-button" aria-label="关闭文章目录">${icon("close")}</button></header><nav class="mobile-outline-list" aria-label="文章标题"></nav>`;

    const photo = element("dialog", "mobile-photo");
    photo.setAttribute("aria-label", "查看大图");
    photo.innerHTML = `<button type="button" class="mobile-icon-button" aria-label="关闭大图">${icon("close")}</button><img alt="">`;
    document.body.append(dock, directory, reader, outline, photo);

    const count = dock.querySelector(".mobile-dock-count");
    const dockTitle = dock.querySelector(".mobile-dock-title");
    const dockProgress = dock.querySelector(".mobile-progress-fill");
    const directoryList = directory.querySelector(".mobile-directory-list");
    const readerScroll = reader.querySelector(".mobile-reader-scroll");
    const article = reader.querySelector(".mobile-reader-article");
    const readerProgress = reader.querySelector(".mobile-progress-fill");
    const readerHeader = reader.querySelector(".mobile-reader-header");
    const outlineToggle = reader.querySelector(".mobile-reader-nav");
    const readerChapter = reader.querySelector(".mobile-reader-chapter");
    const readerPosition = reader.querySelector(".mobile-reader-position");
    const outlineList = outline.querySelector(".mobile-outline-list");

    // Cache heading positions after layout changes, never during each scroll frame.
    function measureReader() {
      measureFrame = 0;
      if (destroyed || !reader.open) return;
      const scrollTop = readerScroll.scrollTop;
      const viewportTop = readerScroll.getBoundingClientRect().top;
      readerHeaderBottom = readerHeader.getBoundingClientRect().bottom - viewportTop;
      readerRange = Math.max(0, readerScroll.scrollHeight - readerScroll.clientHeight);
      headingOffsets = readerHeadings.map(heading => heading.getBoundingClientRect().top - viewportTop + scrollTop);
      // Late-loading images above a selected heading must not displace the destination.
      // Manual touch, wheel and keyboard input release this temporary anchor.
      if (headingJump) {
        const top = headingScrollTop(headingJump.index);
        if (Math.abs(top - headingJump.top) > 1) {
          headingJump.top = top;
          readerScroll.scrollTo({ top, behavior: "instant" });
        }
      }
      updateReaderProgress();
    }

    function scheduleReaderMeasure() {
      if (!measureFrame && reader.open) measureFrame = requestAnimationFrame(measureReader);
    }

    const readerResize = typeof window.ResizeObserver === "function" ? new ResizeObserver(scheduleReaderMeasure) : null;
    readerResize?.observe(article);
    readerResize?.observe(readerHeader);

    function lockPage() {
      if (lockedScroll !== null) return;
      lockedScroll = window.scrollY;
      savedBodyStyles = Object.fromEntries(["position", "top", "width", "overflow"].map(key => [key, document.body.style[key]]));
      Object.assign(document.body.style, { position: "fixed", top: `-${lockedScroll}px`, width: "100%", overflow: "hidden" });
      document.documentElement.classList.add("mobile-effects-paused");
    }

    function unlockPage() {
      if (lockedScroll === null) return;
      const top = lockedScroll;
      Object.assign(document.body.style, savedBodyStyles);
      lockedScroll = null;
      window.scrollTo({ top, behavior: "instant" });
      document.documentElement.classList.toggle("mobile-effects-paused", document.hidden);
    }

    function refreshProgress() {
      scrollFrame = 0;
      if (destroyed || lockedScroll !== null || !cards.length) return;
      const target = window.innerHeight * 0.4;
      let nearest = 0;
      let nearestDistance = Infinity;
      cards.forEach((card, index) => {
        const rect = card.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height * 0.5 - target);
        if (distance < nearestDistance) { nearestDistance = distance; nearest = index; }
      });
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      if (maxScroll > 0 && window.scrollY >= maxScroll - 3) nearest = cards.length - 1;
      dockProgress.style.transform = `scaleX(${maxScroll ? Math.min(1, window.scrollY / maxScroll) : 1})`;
      if (nearest === currentIndex) return;
      const firstSet = currentIndex === -1;
      currentIndex = nearest;
      count.replaceChildren(document.createTextNode(number(nearest + 1)), element("small", "", `/ ${number(cards.length)}`));
      dockTitle.textContent = projects[nearest].title;
      if (!firstSet && !reducedMotion.matches) {
        count.getAnimations().forEach(animation => animation.cancel());
        dockTitle.getAnimations().forEach(animation => animation.cancel());
        animate(count,
          [{ opacity: 0, transform: "translateY(7px)" }, { opacity: 1, transform: "none" }],
          { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" }
        );
        animate(dockTitle, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: "ease-out" });
      }
      directoryList.querySelectorAll("button").forEach((button, index) => button.setAttribute("aria-current", String(index === nearest)));
    }

    function scheduleProgress() {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(refreshProgress);
    }

    function updateReaderProgress() {
      readerFrame = 0;
      if (!reader.open) return;
      const top = readerScroll.scrollTop;
      readerProgress.style.transform = `scaleX(${readerRange > 0 ? Math.max(0, Math.min(1, top / readerRange)) : 1})`;
      reader.classList.toggle("is-scrolled", top > 12);
      updateReaderBlur();
      let nearest = 0;
      for (let index = 1; index < headingOffsets.length; index++) {
        if (headingOffsets[index] > top + readerHeaderBottom + 24) break;
        nearest = index;
      }
      if (readerRange > 0 && top >= readerRange - 3) nearest = Math.max(0, readerHeadings.length - 1);
      if (currentHeading === nearest) return;
      outlineButtons[currentHeading]?.removeAttribute("aria-current");
      outlineButtons[nearest]?.setAttribute("aria-current", "location");
      currentHeading = nearest;
      readerChapter.textContent = readerHeadings[nearest]?.textContent.trim() || "";
      const sections = readerHeadings.length - 1;
      readerPosition.textContent = nearest ? `${number(nearest)} / ${number(sections)}` : sections ? `${number(sections)} 小节` : "全文";
    }

    // 与桌面端一致：阅读器内块级内容在上下边缘高斯模糊渐入/渐出
    const READER_BLUR_SELECTOR = "p, h1, h2, h3, h4, h5, h6, ul, ol, hr, img, video, pre, blockquote, table";
    function updateReaderBlur() {
      const blocks = article.querySelectorAll(READER_BLUR_SELECTOR);
      if (reducedMotion.matches) {
        blocks.forEach(el => { el.style.filter = ""; el.style.opacity = ""; });
        return;
      }
      const wrapRect = readerScroll.getBoundingClientRect();
      const height = wrapRect.height;
      const fade = Math.min(64, height * 0.2);
      const scrolled = readerScroll.scrollTop > 5; // 滚动超过5px才启用顶部模糊
      blocks.forEach(el => {
        if (el.closest(".article-music")) return;
        const rect = el.getBoundingClientRect();
        const top = rect.top - wrapRect.top;
        const bottom = rect.bottom - wrapRect.top;
        let t = 1; // 0=完全模糊, 1=完全清晰
        if (bottom < 0 || top > height) t = 0;
        else if (top > height - fade) t = Math.max(0, (height - top) / fade);
        else if (scrolled && bottom < fade) t = Math.max(0, bottom / fade);
        el.style.filter = t < 0.99 ? `blur(${(25 * (1 - t)).toFixed(2)}px)` : "";
        el.style.opacity = t < 0.99 ? (0.15 + 0.85 * t).toFixed(3) : "";
      });
    }

    function stopMedia() {
      music?.destroy();
      music = null;
      article.querySelectorAll("video, audio").forEach(mediaElement => mediaElement.pause());
    }

    function closeReader() {
      if (closingDialogs.has(reader)) return;
      headingJump = null;
      if (outline.open) closeOutline();
      const audioOnlyCover = article.querySelector(".mobile-reader-cover.is-audio-only");
      if (audioOnlyCover) audioOnlyCover.style.minHeight = `${audioOnlyCover.offsetHeight}px`;
      stopMedia();
      closeDialogAnimated(reader, () => {
        unlockPage();
        activeSource?.focus({ preventScroll: true });
      });
    }

    function buildOutline(title, headings) {
      readerHeadings = [title, ...headings];
      headingJump = null;
      currentHeading = -1;
      headingOffsets = [];
      outlineList.replaceChildren();
      outline.querySelector(".mobile-outline-caption").textContent = headings.length
        ? `${headings.length} 个小节 · ${title.textContent}`
        : "这篇文章没有分节标题，可以回到文章开头。";
      const baseLevel = headings.length ? Math.min(...headings.map(heading => Number(heading.tagName[1]))) : 1;
      outlineButtons = readerHeadings.map((heading, index) => {
        heading.tabIndex = -1;
        const button = element("button", "mobile-outline-item");
        button.type = "button";
        button.dataset.heading = String(index);
        button.style.setProperty("--heading-depth", index ? Math.max(0, Math.min(3, Number(heading.tagName[1]) - baseLevel)) : 0);
        button.append(
          element("span", "mobile-outline-number", index ? number(index) : "↑"),
          element("span", "mobile-outline-text", index ? heading.textContent.trim() : "文章开头"),
          element("span", "mobile-outline-current", "当前")
        );
        outlineList.appendChild(button);
        return button;
      });
    }

    function openOutline() {
      if (!reader.open || outline.open || closingDialogs.has(reader)) return;
      reader.getAnimations().forEach(animation => { if (activeAnimations.has(animation)) animation.finish(); });
      measureReader();
      outlineToggle.setAttribute("aria-expanded", "true");
      outline.showModal();
      const selected = outlineButtons[currentHeading] || outlineButtons[0];
      selected?.focus({ preventScroll: true });
      selected?.scrollIntoView({ block: "nearest", behavior: "instant" });
      animate(outline, [{ transform: "translateY(18px)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 180 });
    }

    function closeOutline(after) {
      closeDialogAnimated(outline, () => {
        outlineToggle.setAttribute("aria-expanded", "false");
        if (!reader.open || closingDialogs.has(reader)) return;
        if (after) after();
        else outlineToggle.focus({ preventScroll: true });
      });
    }

    function jumpToHeading(index) {
      const heading = readerHeadings[index];
      if (!heading) return;
      closeOutline(() => {
        headingJump = null;
        measureReader();
        const top = headingScrollTop(index);
        headingJump = { index, top };
        readerScroll.scrollTo({ top, behavior: scrollBehavior() });
        heading.focus({ preventScroll: true });
      });
    }

    function headingScrollTop(index) {
      return index ? Math.max(0, Math.min(readerRange, headingOffsets[index] - readerHeaderBottom - 18)) : 0;
    }

    function openReader(index) {
      const post = projects[index];
      if (!post || reader.open) return;
      activeSource = cards[index];
      article.replaceChildren();
      const cover = element("div", "mobile-reader-cover");
      cover.classList.toggle("is-audio-only", !post.image);
      if (post.image) {
        const image = element("img");
        image.src = post.image;
        image.alt = post.title;
        image.decoding = "async";
        cover.appendChild(image);
      }
      if (post.image || post.music) article.appendChild(cover);
      article.appendChild(element("p", "mobile-reader-meta", `${post.year} · ${post.tag}`));
      const title = element("h1", "mobile-reader-title", post.title);
      title.id = "mobileReaderTitle";
      article.appendChild(title);
      const body = element("div", "mobile-reader-body");
      if (post.content) {
        // Use the same trusted local article markup as the desktop reader.
        body.innerHTML = post.content.split(/\n/).filter(line => line.trim())
          .map(line => /^<[a-z]/i.test(line.trim()) ? line.trim() : `<p>${line.trim()}</p>`).join("");
      } else {
        body.appendChild(element("p", "", post.desc || ""));
      }
      body.querySelectorAll("video").forEach(video => {
        video.removeAttribute("autoplay");
        video.controls = true;
        video.playsInline = true;
        video.preload = "none";
      });
      body.querySelectorAll("img").forEach(image => { image.loading = "lazy"; image.decoding = "async"; });
      const headings = Array.from(body.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter(heading => heading.textContent.trim());
      buildOutline(title, headings);
      article.appendChild(body);
      const ending = element("footer", "mobile-reader-end");
      ending.appendChild(element("p", "", "· 读到这里，谢谢你 ·"));
      const backButton = element("button", "", "返回日记");
      backButton.type = "button";
      backButton.dataset.closeReader = "";
      ending.appendChild(backButton);
      article.appendChild(ending);
      lockPage();
      reader.classList.add("is-opening");
      reader.showModal();
      readerScroll.scrollTop = 0;
      // One short compositor transition avoids full-screen clipping and duplicate cover layers.
      const entrance = animate(reader, [
        { transform: "translateY(12px)", opacity: 0 },
        { transform: "none", opacity: 1 }
      ], { duration: 200 });
      const finishEntrance = () => reader.classList.remove("is-opening");
      if (entrance) entrance.finished.then(finishEntrance, finishEntrance);
      else finishEntrance();
      music = window.HanakoMusic?.createPlayer({ host: cover, post }) || null;
      measureReader();
    }

    projects.forEach((post, index) => {
      const button = element("button", "mobile-directory-item");
      button.type = "button";
      button.dataset.index = String(index);
      button.appendChild(element("span", "mobile-directory-number", number(index + 1)));
      if (post.image) {
        const thumbnail = element("img", "mobile-directory-thumb");
        thumbnail.src = post.image;
        thumbnail.alt = "";
        thumbnail.loading = "lazy";
        thumbnail.decoding = "async";
        button.appendChild(thumbnail);
      }
      const text = element("span", "mobile-directory-copy");
      text.append(element("strong", "", post.title), element("small", "", post.year));
      button.appendChild(text);
      button.appendChild(element("span", "mobile-directory-current", "当前"));
      directoryList.appendChild(button);
    });

    cards.forEach((card, index) => {
      listen(card, "click", () => openReader(index));
      listen(card, "keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openReader(index); }
      });
    });
    listen(window, "scroll", scheduleProgress, { passive: true });
    listen(window, "resize", () => {
      if (reader.open && !closingDialogs.has(reader)) reader.getAnimations().forEach(animation => { if (activeAnimations.has(animation)) animation.finish(); });
      scheduleProgress();
      scheduleReaderMeasure();
    });
    listen(document.getElementById("timelineTrack"), "load", scheduleProgress, { capture: true });
    listen(dock.querySelector(".mobile-dock-current"), "click", () => {
      if (directory.open) return;
      lockPage();
      directory.showModal();
      animate(directory, [{ transform: "translateY(100%)" }, { transform: "translateY(-3px)", offset: .84 }, { transform: "none" }], { duration: 470 });
      directoryList.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
    listen(dock.querySelector(".mobile-icon-button"), "click", () => window.scrollTo({ top: 0, behavior: scrollBehavior() }));
    // Navigation starts only after the sheet has released the document scroll lock.
    const closeDirectory = after => closeDialogAnimated(directory, () => { unlockPage(); after?.(); });
    listen(directory.querySelector(".mobile-icon-button"), "click", () => closeDirectory());
    listen(directory, "cancel", event => { event.preventDefault(); closeDirectory(); });
    listen(directory, "click", event => {
      if (closingDialogs.has(directory)) return;
      if (event.target === directory) {
        const rect = directory.getBoundingClientRect();
        if (event.clientY < rect.top) closeDirectory();
      }
      const button = event.target.closest("[data-index]");
      if (!button) return;
      const card = cards[Number(button.dataset.index)];
      closeDirectory(() => {
        jumpFrame = requestAnimationFrame(() => {
          card.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
          card.focus({ preventScroll: true });
        });
      });
    });

    let sheetDrag = null;
    listen(directory, "pointerdown", event => {
      if (closingDialogs.has(directory) || event.button !== 0 || event.target.closest("button") || !event.target.closest(".mobile-sheet-handle, .mobile-directory header")) return;
      directory.getAnimations().forEach(animation => { if (activeAnimations.has(animation)) animation.finish(); });
      sheetDrag = { id: event.pointerId, start: event.clientY, time: performance.now(), distance: 0 };
      directory.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    listen(directory, "pointermove", event => {
      if (!sheetDrag || event.pointerId !== sheetDrag.id) return;
      sheetDrag.distance = Math.max(0, event.clientY - sheetDrag.start);
      directory.style.transform = `translate3d(0, ${sheetDrag.distance * .88}px, 0)`;
    });
    function endSheetDrag(cancelled) {
      if (!sheetDrag) return;
      const drag = sheetDrag;
      sheetDrag = null;
      if (directory.hasPointerCapture(drag.id)) directory.releasePointerCapture(drag.id);
      const speed = drag.distance / Math.max(1, performance.now() - drag.time);
      if (!cancelled && (drag.distance > 72 || (drag.distance > 20 && speed > .65))) {
        closeDirectory();
      } else {
        const transform = getComputedStyle(directory).transform;
        directory.style.transform = "";
        animate(directory, [{ transform }, { transform: "none" }], { duration: 420, easing: "cubic-bezier(.18,1.3,.3,1)" });
      }
    }
    listen(directory, "pointerup", () => endSheetDrag(false));
    listen(directory, "pointercancel", () => endSheetDrag(true));
    listen(reader.querySelector(".mobile-reader-back"), "click", closeReader);
    listen(reader, "cancel", event => { event.preventDefault(); closeReader(); });
    listen(outlineToggle, "click", openOutline);
    listen(outline.querySelector(".mobile-icon-button"), "click", () => closeOutline());
    listen(outline, "cancel", event => { event.preventDefault(); closeOutline(); });
    listen(outlineList, "click", event => {
      const button = event.target.closest("button[data-heading]");
      if (button) jumpToHeading(Number(button.dataset.heading));
    });
    listen(outline, "click", event => {
      if (event.target !== outline) return;
      const rect = outline.getBoundingClientRect();
      if (event.clientY < rect.top || event.clientY > rect.bottom || event.clientX < rect.left || event.clientX > rect.right) closeOutline();
    });
    listen(readerScroll, "scroll", () => {
      if (!readerFrame) readerFrame = requestAnimationFrame(updateReaderProgress);
    }, { passive: true });
    listen(readerScroll, "pointerdown", () => { headingJump = null; }, { passive: true });
    listen(readerScroll, "wheel", () => { headingJump = null; }, { passive: true });
    listen(readerScroll, "keydown", event => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) headingJump = null;
    });
    listen(article, "load", scheduleReaderMeasure, { capture: true });
    listen(article, "click", event => {
      if (closingDialogs.has(reader)) return;
      if (event.target.closest("[data-close-reader]")) { closeReader(); return; }
      if (event.target.tagName === "IMG") {
        const image = photo.querySelector("img");
        image.src = event.target.currentSrc || event.target.src;
        image.alt = event.target.alt || "文章图片";
        photo.showModal();
        animate(photo, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
        animate(image, [{ transform: "scale(.94)" }, { transform: "none" }], { duration: 420 });
      }
    });
    listen(photo.querySelector("button"), "click", () => closeDialogAnimated(photo));
    listen(photo, "click", event => {
      if (event.target === photo || event.target.tagName === "IMG") closeDialogAnimated(photo);
    });
    listen(photo, "cancel", event => { event.preventDefault(); closeDialogAnimated(photo); });
    listen(photo, "close", () => photo.querySelector("img").removeAttribute("src"));
    listen(document, "visibilitychange", () => {
      document.documentElement.classList.toggle("mobile-effects-paused", document.hidden || lockedScroll !== null);
      if (document.hidden) article.querySelectorAll("video").forEach(video => video.pause());
    });
    listen(reducedMotion, "change", () => {
      if (!reducedMotion.matches) return;
      reveal?.disconnect();
      cards.forEach(card => { card.classList.remove("is-reveal-pending"); card.classList.add("is-visible"); });
      activeAnimations.forEach(animation => animation.finish());
      if (reader.open) updateReaderBlur();
    });
    refreshProgress();

    return () => {
      destroyed = true;
      events.abort();
      reveal?.disconnect();
      readerResize?.disconnect();
      activeAnimations.forEach(animation => animation.cancel());
      activeAnimations.clear();
      closingDialogs.clear();
      cards.forEach(card => { card.classList.remove("is-reveal-pending", "is-visible"); card.style.removeProperty("--reveal-delay"); });
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(readerFrame);
      cancelAnimationFrame(measureFrame);
      cancelAnimationFrame(jumpFrame);
      stopMedia();
      [photo, outline, reader, directory].forEach(dialog => { if (dialog.open) dialog.close(); });
      unlockPage();
      document.documentElement.classList.remove("mobile-effects-paused");
      [dock, directory, reader, outline, photo].forEach(node => node.remove());
    };
  }

  window.HanakoMobile = { media, mount };
})();

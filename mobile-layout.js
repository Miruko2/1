(() => {
  "use strict";

  // Keep touch phones in the same layout after rotating to landscape.
  const media = window.matchMedia("(max-width: 860px), (max-width: 1024px) and (pointer: coarse)");
  document.documentElement.classList.toggle("is-mobile", media.matches);

  const icons = {
    back: '<path d="m14 6-6 6 6 6"/>',
    up: '<path d="m6 11 6-6 6 6M12 5v14"/>',
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
    let coverTransition = null;

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
        transform: isSheet ? "translateY(calc(100% + 24px))" : "translateY(24px) scale(.985)",
        opacity: isSheet ? 0.85 : 0
      }], { duration: isSheet ? 280 : 240, easing: "cubic-bezier(.4,0,.7,.2)", fill: "forwards" });
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
    let jumpFrame = 0;
    let music = null;
    let lockedScroll = null;
    let savedBodyStyles = null;
    let activeSource = null;
    let destroyed = false;

    const dock = element("nav", "mobile-dock");
    dock.setAttribute("aria-label", "日记浏览导航");
    dock.innerHTML = `<button type="button" class="mobile-dock-current" aria-label="打开日记目录"><span class="mobile-dock-count"></span><span class="mobile-dock-title"></span><span class="mobile-dock-label">目录</span></button><button type="button" class="mobile-icon-button" aria-label="回到顶部">${icon("up")}</button><div class="mobile-dock-progress" aria-hidden="true"><span class="mobile-progress-fill"></span></div>`;

    const directory = element("dialog", "mobile-directory");
    directory.setAttribute("aria-labelledby", "mobileDirectoryTitle");
    directory.innerHTML = `<div class="mobile-sheet-handle" aria-hidden="true"></div><header><div><h2 id="mobileDirectoryTitle">日记目录</h2><p class="mobile-directory-caption">共 ${projects.length} 篇 · 记录日常的片刻</p></div><button type="button" class="mobile-icon-button" aria-label="关闭目录">${icon("close")}</button></header><div class="mobile-directory-list"></div>`;

    const reader = element("dialog", "mobile-reader");
    reader.setAttribute("aria-labelledby", "mobileReaderTitle");
    reader.innerHTML = `<header class="mobile-reader-header"><button type="button" class="mobile-reader-back">${icon("back")}返回日记</button><span class="mobile-reader-position"></span><div class="mobile-reader-progress" aria-hidden="true"><span class="mobile-progress-fill"></span></div></header><div class="mobile-reader-scroll" tabindex="0" aria-label="文章正文"><article class="mobile-reader-article"></article></div>`;

    const photo = element("dialog", "mobile-photo");
    photo.setAttribute("aria-label", "查看大图");
    photo.innerHTML = `<button type="button" class="mobile-icon-button" aria-label="关闭大图">${icon("close")}</button><img alt="">`;
    document.body.append(dock, directory, reader, photo);

    const count = dock.querySelector(".mobile-dock-count");
    const dockTitle = dock.querySelector(".mobile-dock-title");
    const dockProgress = dock.querySelector(".mobile-progress-fill");
    const directoryList = directory.querySelector(".mobile-directory-list");
    const readerScroll = reader.querySelector(".mobile-reader-scroll");
    const article = reader.querySelector(".mobile-reader-article");
    const readerProgress = reader.querySelector(".mobile-progress-fill");

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
      const range = readerScroll.scrollHeight - readerScroll.clientHeight;
      readerProgress.style.transform = `scaleX(${range > 0 ? Math.min(1, readerScroll.scrollTop / range) : 1})`;
      reader.classList.toggle("is-scrolled", readerScroll.scrollTop > 12);
    }

    function stopMedia() {
      music?.destroy();
      music = null;
      article.querySelectorAll("video, audio").forEach(mediaElement => mediaElement.pause());
    }

    function closeReader() {
      if (closingDialogs.has(reader)) return;
      coverTransition?.();
      const audioOnlyCover = article.querySelector(".mobile-reader-cover.is-audio-only");
      if (audioOnlyCover) audioOnlyCover.style.minHeight = `${audioOnlyCover.offsetHeight}px`;
      stopMedia();
      closeDialogAnimated(reader, () => {
        unlockPage();
        activeSource?.focus({ preventScroll: true });
      });
    }

    function connectCover(sourceImage, sourceRect, destinationImage) {
      if (!sourceImage?.naturalWidth || !sourceRect?.width || !destinationImage || reducedMotion.matches) return;
      const target = destinationImage.getBoundingClientRect();
      if (!target.width || !target.height) return;
      coverTransition?.();
      const bridge = element("div", "mobile-cover-transition");
      bridge.setAttribute("aria-hidden", "true");
      const image = element("img");
      image.src = sourceImage.currentSrc || sourceImage.src;
      image.alt = "";
      bridge.appendChild(image);
      Object.assign(bridge.style, { left: `${target.left}px`, top: `${target.top}px`, width: `${target.width}px`, height: `${target.height}px`, borderRadius: "22px" });
      const previousVisibility = destinationImage.style.visibility;
      destinationImage.style.visibility = "hidden";
      reader.appendChild(bridge);
      const motion = animate(bridge, [
        { transform: `translate(${sourceRect.left - target.left}px, ${sourceRect.top - target.top}px) scale(${sourceRect.width / target.width}, ${sourceRect.height / target.height})`, borderRadius: "18px" },
        { transform: "none", borderRadius: "22px" }
      ], { duration: 480 });
      let removed = false;
      const remove = () => {
        if (removed) return;
        removed = true;
        destinationImage.style.visibility = previousVisibility;
        bridge.remove();
        motion?.cancel();
        if (coverTransition === remove) coverTransition = null;
      };
      coverTransition = remove;
      if (motion) motion.finished.then(remove, remove);
      else remove();
    }

    function openReader(index) {
      const post = projects[index];
      if (!post || reader.open) return;
      activeSource = cards[index];
      const sourceRect = activeSource.getBoundingClientRect();
      const sourceImage = activeSource.querySelector(".project-thumb img");
      const sourceImageRect = sourceImage?.getBoundingClientRect();
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
      if (headings.length) {
        const toc = element("details", "mobile-reader-toc");
        toc.appendChild(element("summary", "", `文章目录 · ${headings.length} 节`));
        headings.forEach((heading, headingIndex) => {
          heading.dataset.mobileHeading = String(headingIndex);
          const button = element("button", "", heading.textContent);
          button.type = "button";
          button.dataset.heading = String(headingIndex);
          toc.appendChild(button);
        });
        article.appendChild(toc);
      }
      article.appendChild(body);
      const ending = element("footer", "mobile-reader-end");
      ending.appendChild(element("p", "", "· 读到这里，谢谢你 ·"));
      const backButton = element("button", "", "返回日记");
      backButton.type = "button";
      backButton.dataset.closeReader = "";
      ending.appendChild(backButton);
      article.appendChild(ending);
      reader.querySelector(".mobile-reader-position").textContent = `${number(index + 1)} / ${number(projects.length)}`;
      lockPage();
      reader.showModal();
      readerScroll.scrollTop = 0;
      const clamp = (value, max) => Math.max(0, Math.min(max, value));
      animate(reader, [
        { clipPath: `inset(${clamp(sourceRect.top, innerHeight)}px ${clamp(innerWidth - sourceRect.right, innerWidth)}px ${clamp(innerHeight - sourceRect.bottom, innerHeight)}px ${clamp(sourceRect.left, innerWidth)}px round 27px)` },
        { clipPath: "inset(0px 0px 0px 0px round 0px)" }
      ], { duration: 480 });
      connectCover(sourceImage, sourceImageRect, cover.querySelector("img"));
      animate(reader.querySelector(".mobile-reader-header"), [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 110, fill: "backwards" });
      Array.from(article.children).filter(child => child !== cover).forEach((child, childIndex) => {
        animate(child, [{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 390, delay: 100 + Math.min(childIndex, 3) * 45, fill: "backwards" });
      });
      music = window.HanakoMusic?.createPlayer({ host: cover, post }) || null;
      updateReaderProgress();
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
      coverTransition?.();
      if (reader.open && !closingDialogs.has(reader)) reader.getAnimations().forEach(animation => { if (activeAnimations.has(animation)) animation.finish(); });
      scheduleProgress();
      updateReaderProgress();
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
    listen(readerScroll, "scroll", () => {
      if (!readerFrame) readerFrame = requestAnimationFrame(updateReaderProgress);
    }, { passive: true });
    listen(article, "load", updateReaderProgress, { capture: true });
    listen(article, "click", event => {
      if (closingDialogs.has(reader)) return;
      if (event.target.closest("[data-close-reader]")) { closeReader(); return; }
      const tocButton = event.target.closest("button[data-heading]");
      if (tocButton) {
        const heading = bodyHeading(tocButton.dataset.heading);
        tocButton.closest("details").open = false;
        heading?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
      }
      if (event.target.tagName === "IMG") {
        const image = photo.querySelector("img");
        image.src = event.target.currentSrc || event.target.src;
        image.alt = event.target.alt || "文章图片";
        photo.showModal();
        animate(photo, [{ opacity: 0 }, { opacity: 1 }], { duration: 240 });
        animate(image, [{ transform: "scale(.94)" }, { transform: "none" }], { duration: 420 });
      }
    });
    const bodyHeading = index => article.querySelector(`[data-mobile-heading="${index}"]`);
    listen(photo.querySelector("button"), "click", () => closeDialogAnimated(photo));
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
    });
    refreshProgress();

    return () => {
      destroyed = true;
      events.abort();
      reveal?.disconnect();
      coverTransition?.();
      activeAnimations.forEach(animation => animation.cancel());
      activeAnimations.clear();
      closingDialogs.clear();
      cards.forEach(card => { card.classList.remove("is-reveal-pending", "is-visible"); card.style.removeProperty("--reveal-delay"); });
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(readerFrame);
      cancelAnimationFrame(jumpFrame);
      stopMedia();
      [photo, reader, directory].forEach(dialog => { if (dialog.open) dialog.close(); });
      unlockPage();
      document.documentElement.classList.remove("mobile-effects-paused");
      [dock, directory, reader, photo].forEach(node => node.remove());
    };
  }

  window.HanakoMobile = { media, mount };
})();

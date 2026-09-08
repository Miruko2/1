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
    directory.innerHTML = `<header><h2 id="mobileDirectoryTitle">日记目录</h2><button type="button" class="mobile-icon-button" aria-label="关闭目录">${icon("close")}</button></header><div class="mobile-directory-list"></div>`;

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
    }

    function unlockPage() {
      if (lockedScroll === null) return;
      const top = lockedScroll;
      Object.assign(document.body.style, savedBodyStyles);
      lockedScroll = null;
      window.scrollTo({ top, behavior: "instant" });
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
      currentIndex = nearest;
      count.replaceChildren(document.createTextNode(number(nearest + 1)), element("small", "", `/ ${number(cards.length)}`));
      dockTitle.textContent = projects[nearest].title;
      directoryList.querySelectorAll("button").forEach((button, index) => button.setAttribute("aria-current", String(index === nearest)));
    }

    function scheduleProgress() {
      if (!scrollFrame) scrollFrame = requestAnimationFrame(refreshProgress);
    }

    function updateReaderProgress() {
      readerFrame = 0;
      const range = readerScroll.scrollHeight - readerScroll.clientHeight;
      readerProgress.style.transform = `scaleX(${range > 0 ? Math.min(1, readerScroll.scrollTop / range) : 1})`;
    }

    function stopMedia() {
      music?.destroy();
      music = null;
      article.querySelectorAll("video, audio").forEach(mediaElement => mediaElement.pause());
    }

    function closeReader() {
      stopMedia();
      reader.close();
      unlockPage();
      activeSource?.focus({ preventScroll: true });
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
      music = window.HanakoMusic?.createPlayer({ host: cover, post }) || null;
      updateReaderProgress();
    }

    projects.forEach((post, index) => {
      const button = element("button", "mobile-directory-item");
      button.type = "button";
      button.dataset.index = String(index);
      button.appendChild(element("span", "mobile-directory-number", number(index + 1)));
      const text = element("span");
      text.append(element("strong", "", post.title), element("small", "", post.year));
      button.appendChild(text);
      directoryList.appendChild(button);
    });

    cards.forEach((card, index) => {
      listen(card, "click", () => openReader(index));
      listen(card, "keydown", event => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); openReader(index); }
      });
    });
    listen(window, "scroll", scheduleProgress, { passive: true });
    listen(window, "resize", () => { scheduleProgress(); updateReaderProgress(); });
    listen(document.getElementById("timelineTrack"), "load", scheduleProgress, { capture: true });
    listen(dock.querySelector(".mobile-dock-current"), "click", () => {
      lockPage();
      directory.showModal();
      directoryList.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", behavior: "instant" });
    });
    listen(dock.querySelector(".mobile-icon-button"), "click", () => window.scrollTo({ top: 0, behavior: scrollBehavior() }));
    const closeDirectory = () => { directory.close(); unlockPage(); };
    listen(directory.querySelector(".mobile-icon-button"), "click", closeDirectory);
    listen(directory, "cancel", event => { event.preventDefault(); closeDirectory(); });
    listen(directory, "click", event => {
      if (event.target === directory) {
        const rect = directory.getBoundingClientRect();
        if (event.clientY < rect.top) closeDirectory();
      }
      const button = event.target.closest("[data-index]");
      if (!button) return;
      const card = cards[Number(button.dataset.index)];
      closeDirectory();
      jumpFrame = requestAnimationFrame(() => {
        card.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
        card.focus({ preventScroll: true });
      });
    });
    listen(reader.querySelector(".mobile-reader-back"), "click", closeReader);
    listen(reader, "cancel", event => { event.preventDefault(); closeReader(); });
    listen(readerScroll, "scroll", () => {
      if (!readerFrame) readerFrame = requestAnimationFrame(updateReaderProgress);
    }, { passive: true });
    listen(article, "load", updateReaderProgress, { capture: true });
    listen(article, "click", event => {
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
      }
    });
    const bodyHeading = index => article.querySelector(`[data-mobile-heading="${index}"]`);
    listen(photo.querySelector("button"), "click", () => photo.close());
    listen(photo, "close", () => photo.querySelector("img").removeAttribute("src"));
    listen(document, "visibilitychange", () => { if (document.hidden) article.querySelectorAll("video").forEach(video => video.pause()); });
    refreshProgress();

    return () => {
      destroyed = true;
      events.abort();
      cancelAnimationFrame(scrollFrame);
      cancelAnimationFrame(readerFrame);
      cancelAnimationFrame(jumpFrame);
      stopMedia();
      [photo, reader, directory].forEach(dialog => { if (dialog.open) dialog.close(); });
      unlockPage();
      [dock, directory, reader, photo].forEach(node => node.remove());
    };
  }

  window.HanakoMobile = { media, mount };
})();

(() => {
  "use strict";

  window.createArticleNavigation = function ({ panel, scrollWrapper, onUpdate }) {
    const gsap = window.gsap;
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const events = new AbortController();
    const animations = [];
    const petals = new Map();
    const headings = Array.from(scrollWrapper.querySelectorAll("h1, h2, h3, h4, h5, h6"))
      .filter(heading => heading.textContent.trim());
    const HEAD_OFFSET = 28;
    let destroyed = false;
    let frame = 0;
    let scrollMotion = null;
    let motionKind = null;
    let targetScroll = scrollWrapper.scrollTop;
    let hitTimer = 0;
    let hitTarget = null;
    let toc = null;
    let rail = null;
    let railViewport = null;
    let railNodes = null;
    let railFill = null;
    let items = [];
    let nodes = [];
    let labels = [];
    let activeIndex = -2;

    const listen = (target, type, handler, options = {}) =>
      target.addEventListener(type, handler, { ...options, signal: events.signal });
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const maxScroll = () => Math.max(0, scrollWrapper.scrollHeight - scrollWrapper.clientHeight);
    const element = (tag, className, text) => {
      const node = document.createElement(tag);
      node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    };

    // Offset coordinates stay stable while the panel's entrance animation scales it.
    function headingTop(heading) {
      let top = 0;
      for (let node = heading; node && node !== scrollWrapper; node = node.offsetParent) {
        top += node.offsetTop;
      }
      return top;
    }

    function destination(index) {
      return index < 0 ? 0 : clamp(headingTop(headings[index]) - HEAD_OFFSET, 0, maxScroll());
    }

    function cancelScroll() {
      if (scrollMotion) scrollMotion.kill();
      scrollMotion = null;
      motionKind = null;
      targetScroll = scrollWrapper.scrollTop;
    }

    function animateScroll(destinationTop, kind, onComplete) {
      cancelScroll();
      targetScroll = clamp(destinationTop, 0, maxScroll());
      const distance = Math.abs(targetScroll - scrollWrapper.scrollTop);
      if (motionPreference.matches || distance < 1) {
        scrollWrapper.scrollTop = targetScroll;
        refresh();
        if (onComplete) onComplete();
        return;
      }
      motionKind = kind;
      scrollMotion = gsap.to(scrollWrapper, {
        scrollTop: targetScroll,
        duration: kind === "jump" ? clamp(0.45 + distance / 1400, 0.5, 1.2) : 0.75,
        ease: kind === "jump" ? "power3.inOut" : "power3.out",
        overwrite: "auto",
        onUpdate: refresh,
        onComplete: () => {
          scrollMotion = null;
          motionKind = null;
          targetScroll = scrollWrapper.scrollTop;
          refresh();
          if (onComplete) onComplete();
        }
      });
    }

    function onWheel(event) {
      if (event.ctrlKey || !event.deltaY) return;
      event.stopPropagation();
      if (railViewport && railViewport.contains(event.target) &&
          railViewport.scrollHeight > railViewport.clientHeight + 1) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? scrollWrapper.clientHeight : 1;
      // A wheel gesture continues a wheel tween, but interrupts a jump at its current position.
      const origin = motionKind === "wheel" ? targetScroll : scrollWrapper.scrollTop;
      animateScroll(origin + event.deltaY * unit * 0.4, "wheel");
    }

    function spawnMiniPetals(heading) {
      if (motionPreference.matches) return;
      const rect = heading.getBoundingClientRect();
      for (let index = 0; index < 7; index++) {
        const petal = element("div", `sakura-petal toc-petal tone-${index % 3 + 1}`);
        const size = 6 + Math.random() * 5;
        Object.assign(petal.style, {
          width: `${size}px`, height: `${size * 1.22}px`,
          left: `${rect.left + Math.min(rect.width / 2, 36)}px`,
          top: `${rect.top + rect.height * 0.45}px`
        });
        petal.setAttribute("aria-hidden", "true");
        document.body.appendChild(petal);
        const angle = -Math.PI * 0.12 - Math.random() * Math.PI * 0.76;
        const distance = 26 + Math.random() * 42;
        const animation = gsap.timeline({ onComplete: () => { petal.remove(); petals.delete(petal); } });
        petals.set(petal, animation);
        animation.fromTo(petal, { scale: 0, rotation: Math.random() * 360, opacity: 1 }, {
          x: Math.cos(angle) * distance, y: Math.sin(angle) * distance,
          scale: 1, rotation: "+=" + (Math.random() * 200 - 100),
          duration: 0.42 + Math.random() * 0.15, ease: "power2.out"
        }).to(petal, {
          y: "+=18", x: "+=" + (Math.random() * 16 - 8),
          rotation: "+=" + (Math.random() * 120 - 60), opacity: 0,
          duration: 0.5 + Math.random() * 0.3, ease: "power1.in"
        });
      }
    }

    function hitHeading(heading) {
      if (destroyed) return;
      clearTimeout(hitTimer);
      if (hitTarget) hitTarget.classList.remove("is-hit");
      hitTarget = heading;
      void heading.offsetWidth;
      heading.classList.add("is-hit");
      spawnMiniPetals(heading);
      hitTimer = window.setTimeout(() => heading.classList.remove("is-hit"), 1400);
    }

    function jumpTo(index) {
      const finish = () => {
        if (destroyed) return;
        // Media can change the article height while the scroll tween is running.
        const corrected = destination(index);
        if (Math.abs(corrected - scrollWrapper.scrollTop) > 1) {
          animateScroll(corrected, "jump", finish);
          return;
        }
        if (rail) updateToc();
        onUpdate();
        if (index >= 0) hitHeading(headings[index]);
      };
      animateScroll(destination(index), "jump", finish);
    }

    function layoutRail() {
      const rect = panel.getBoundingClientRect();
      const spaceRight = window.innerWidth - (panel.offsetLeft + panel.offsetWidth);
      const inside = window.innerWidth <= 860 || spaceRight < 220;
      rail.classList.toggle("is-inside", inside);
      panel.classList.toggle("has-toc-rail-inside", inside);
      const parent = inside ? panel : document.body;
      if (rail.parentNode !== parent) parent.appendChild(rail);
      if (inside) {
        rail.style.left = "";
        rail.style.top = "";
        rail.style.height = "";
      } else {
        rail.style.left = `${rect.right + 14}px`;
        rail.style.top = `${rect.top}px`;
        rail.style.height = `${rect.height}px`;
      }
      const height = Math.max(28, Math.min(panel.clientHeight * 0.78, nodes.length * 34));
      railViewport.style.height = `${height}px`;
      railNodes.style.height = `${Math.max(height, nodes.length * 28)}px`;
      rail.style.setProperty("--toc-label-width", `${Math.max(60, Math.min(200,
        inside ? panel.clientWidth - 54 : spaceRight - 70))}px`);
    }

    function updateToc() {
      layoutRail();
      const scrollTop = scrollWrapper.scrollTop;
      const maximum = maxScroll();
      const anchors = [0, ...headings.map((heading, index) => destination(index))];
      let active = 0;
      if (maximum > 0) {
        // Use the same anchors for highlighting and interpolation to avoid progress jumps.
        for (let index = 1; index < anchors.length; index++) {
          if (scrollTop >= anchors[index]) active = index;
        }
        if (scrollTop >= maximum - 1) active = nodes.length - 1;
      }
      nodes.forEach((node, index) => {
        const current = index === active;
        node.classList.toggle("is-active", current);
        node.classList.toggle("is-passed", index < active);
        labels[index].classList.toggle("is-active", current);
        if (current) node.setAttribute("aria-current", "location");
        else node.removeAttribute("aria-current");
      });
      items.forEach((item, index) => {
        const current = index === active - 1;
        item.classList.toggle("is-active", current);
        const button = item.firstElementChild;
        if (current) button.setAttribute("aria-current", "location");
        else button.removeAttribute("aria-current");
      });

      if (activeIndex !== active) {
        const node = nodes[active];
        if (node.offsetTop < railViewport.scrollTop) railViewport.scrollTop = node.offsetTop;
        if (node.offsetTop + node.offsetHeight > railViewport.scrollTop + railViewport.clientHeight) {
          railViewport.scrollTop = node.offsetTop + node.offsetHeight - railViewport.clientHeight;
        }
        activeIndex = active;
      }
      const center = node => node.offsetTop + node.offsetHeight / 2;
      const from = anchors[active];
      const to = anchors[active + 1] ?? maximum;
      const fraction = to > from ? clamp((scrollTop - from) / (to - from), 0, 1) : 0;
      const start = center(nodes[0]);
      const end = center(nodes[active]) + (nodes[active + 1]
        ? (center(nodes[active + 1]) - center(nodes[active])) * fraction : 0);
      railFill.style.top = `${start}px`;
      railFill.style.height = `${Math.max(0, end - start)}px`;
      nodes.forEach((node, index) => {
        const position = center(node) - railViewport.scrollTop;
        labels[index].style.top = `${railViewport.offsetTop + position}px`;
        labels[index].hidden = position < 0 || position > railViewport.clientHeight;
      });
    }

    function refresh() {
      if (destroyed || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (destroyed) return;
        if (rail) updateToc();
        onUpdate();
      });
    }

    if (headings.length >= 2) {
      const minLevel = Math.min(...headings.map(heading => Number(heading.tagName[1])));
      const levelOf = heading => Math.min(3, Number(heading.tagName[1]) - minLevel + 1);
      toc = element("nav", "article-toc");
      toc.setAttribute("aria-label", "文章目录");
      const header = element("div", "article-toc-head");
      header.append(element("span", "article-toc-kicker", "Contents"),
        element("span", "article-toc-count", `${headings.length} 节`));
      const list = element("ol", "article-toc-list");
      items = headings.map((heading, index) => {
        heading.classList.add("toc-target");
        const item = element("li", `article-toc-item lv-${levelOf(heading)}`);
        const button = element("button", "article-toc-link");
        button.type = "button";
        button.title = heading.textContent.trim();
        button.dataset.toc = String(index);
        const arrow = element("span", "article-toc-arrow", "→");
        arrow.setAttribute("aria-hidden", "true");
        button.append(element("span", "article-toc-num", String(index + 1).padStart(2, "0")),
          element("span", "article-toc-text", heading.textContent.trim()), arrow);
        item.appendChild(button);
        list.appendChild(item);
        return item;
      });
      toc.append(header, list);
      scrollWrapper.prepend(toc);

      rail = element("nav", "toc-rail");
      rail.setAttribute("aria-label", "章节导航");
      const railTrack = element("div", "toc-rail-track");
      railViewport = element("div", "toc-rail-viewport");
      railNodes = element("div", "toc-rail-nodes");
      railFill = element("div", "toc-rail-fill");
      const labelLayer = element("div", "toc-rail-labels");
      labelLayer.setAttribute("aria-hidden", "true");
      const definitions = [{ label: "目录", level: 1 }, ...headings.map(heading => ({
        label: heading.textContent.trim(), level: levelOf(heading)
      }))];
      nodes = definitions.map((definition, index) => {
        const button = element("button", `toc-node lv-${definition.level}`);
        button.type = "button";
        button.dataset.toc = String(index - 1);
        button.setAttribute("aria-label", `跳转到 ${definition.label}`);
        button.appendChild(element("span", "toc-node-dot"));
        railNodes.appendChild(button);
        const label = element("span", "toc-node-label", definition.label);
        labelLayer.appendChild(label);
        labels.push(label);
        return button;
      });
      railNodes.appendChild(railFill);
      railViewport.appendChild(railNodes);
      railTrack.append(railViewport, labelLayer);
      rail.appendChild(railTrack);
      layoutRail();

      const onNavigationClick = event => {
        const button = event.target.closest("button[data-toc]");
        if (!button) return;
        event.stopPropagation();
        jumpTo(Number(button.dataset.toc));
      };
      listen(toc, "click", onNavigationClick);
      listen(rail, "click", onNavigationClick);
      listen(rail, "wheel", onWheel, { passive: false });
      listen(railViewport, "scroll", refresh, { passive: true });
      listen(rail, "keydown", event => {
        const index = nodes.indexOf(event.target);
        if (index < 0 || !["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const next = event.key === "Home" ? 0 : event.key === "End" ? nodes.length - 1 :
          clamp(index + (event.key === "ArrowDown" ? 1 : -1), 0, nodes.length - 1);
        nodes[next].focus({ preventScroll: true });
        railViewport.scrollTop = nodes[next].offsetTop - railViewport.clientHeight / 2;
        refresh();
      });

      if (!motionPreference.matches) {
        animations.push(gsap.fromTo(items, { x: -14, opacity: 0, filter: "blur(6px)" }, {
          x: 0, opacity: 1, filter: "blur(0px)", duration: 0.55,
          stagger: Math.min(0.06, 0.7 / items.length), delay: 0.5, ease: "power3.out",
          clearProps: "transform,filter,opacity"
        }));
        animations.push(gsap.fromTo(rail, { opacity: 0, x: -10 }, {
          opacity: 1, x: 0, duration: 0.6, delay: 0.55, ease: "power3.out", clearProps: "transform,opacity"
        }));
        animations.push(gsap.fromTo(nodes.map(node => node.firstElementChild), { scale: 0 }, {
          scale: 1, duration: 0.5, stagger: Math.min(0.05, 0.7 / nodes.length),
          delay: 0.6, ease: "back.out(2.2)", clearProps: "transform"
        }));
      }
    }

    scrollWrapper.tabIndex = 0;
    scrollWrapper.setAttribute("role", "region");
    scrollWrapper.setAttribute("aria-label", "文章正文");
    listen(panel, "wheel", onWheel, { passive: false });
    listen(scrollWrapper, "scroll", () => {
      if (!scrollMotion) targetScroll = scrollWrapper.scrollTop;
      refresh();
    }, { passive: true });
    listen(panel, "pointerdown", cancelScroll, { passive: true });
    listen(panel, "touchstart", cancelScroll, { passive: true });
    listen(panel, "keydown", event => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) {
        event.stopPropagation();
        cancelScroll();
      }
    });
    listen(window, "resize", refresh, { passive: true });
    listen(motionPreference, "change", () => { cancelScroll(); refresh(); });
    scrollWrapper.querySelectorAll("img, video").forEach(media => {
      listen(media, "load", refresh);
      listen(media, "loadedmetadata", refresh);
    });
    const observer = new ResizeObserver(refresh);
    observer.observe(scrollWrapper);
    Array.from(scrollWrapper.children).forEach(child => observer.observe(child));
    refresh();

    return {
      refresh,
      destroy() {
        if (destroyed) return;
        destroyed = true;
        cancelScroll();
        events.abort();
        observer.disconnect();
        cancelAnimationFrame(frame);
        clearTimeout(hitTimer);
        if (hitTarget) hitTarget.classList.remove("is-hit");
        animations.forEach(animation => animation.kill());
        petals.forEach((animation, petal) => { animation.kill(); petal.remove(); });
        petals.clear();
        if (rail) rail.remove();
      }
    };
  };
})();

(() => {
  "use strict";

  const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i;
  const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
  const NETEASE_PROVIDERS = Object.freeze([
    Object.freeze({ name: "主接口", baseUrl: "https://api.qijieya.cn/meting/" }),
    Object.freeze({ name: "备用接口", baseUrl: "https://api.injahow.cn/meting/" })
  ]);

  function validNeteaseId(value) {
    const id = String(value || "").trim();
    return /^\d{1,20}$/.test(id) ? id : "";
  }

  function extractNeteaseId(value) {
    const source = String(value || "").trim();
    if (!source) return "";
    const canonical = source.match(/^netease:(\d{1,20})$/i);
    if (canonical) return canonical[1];
    if (/^\d{1,20}$/.test(source)) return source;

    const looksLikeNetease = /(?:music\.163\.com|api\.qijieya\.cn\/meting|api\.injahow\.cn\/meting|网易云|netease)/i.test(source);
    const looksLikeSong = /(?:^|[\/#])song(?:[\/?#]|$)|(?:[?&#]|&amp;)type=(?:song|url)(?:[&#]|&amp;|$)/i.test(source);
    if (!looksLikeNetease || !looksLikeSong) return "";
    const match = source.match(/(?:[?&#]|&amp;)id=(\d{1,20})(?:\D|$)/i)
      || source.match(/\/song\/(\d{1,20})(?:\D|$)/i);
    return match ? validNeteaseId(match[1]) : "";
  }

  function metingUrl(provider, type, id) {
    const query = new URLSearchParams({ server: "netease", type, id });
    return `${provider.baseUrl}?${query}`;
  }

  function parseSource(value) {
    const source = String(value || "").trim();
    if (!source) return { kind: "empty", source: "", playbackSources: [] };

    const neteaseId = extractNeteaseId(source);
    if (neteaseId) {
      return {
        kind: "netease",
        id: neteaseId,
        source: `netease:${neteaseId}`,
        playbackSources: NETEASE_PROVIDERS.map(provider => metingUrl(provider, "url", neteaseId))
      };
    }

    if (/163cn\.tv/i.test(source)) {
      throw new Error("网易云短链接不含歌曲 ID，请粘贴歌曲页面链接或直接输入歌曲 ID");
    }

    if (/(?:music\.163\.com|api\.qijieya\.cn\/meting|api\.injahow\.cn\/meting|网易云|netease)/i.test(source)) {
      throw new Error("只支持网易云单曲，请粘贴单曲页面链接或直接输入歌曲 ID");
    }

    if (/^https:\/\//i.test(source)) {
      const url = new URL(source);
      if (!url.hostname || url.username || url.password) throw new Error("请使用不含账号密码的 HTTPS 音乐直链");
      return { kind: "direct", source, playbackSources: [source] };
    }

    if (!/^audio\/[^/\\<>:"|?*\x00-\x1f]+$/i.test(source) || !AUDIO_EXTENSIONS.test(source)) {
      throw new Error("请选择本地音频，或填写网易云歌曲链接、歌曲 ID、HTTPS 音乐直链");
    }
    return { kind: "local", source, playbackSources: [source] };
  }

  function validateSource(value) {
    return parseSource(value).source;
  }

  async function fetchNeteaseMetadata(id, { signal } = {}) {
    const songId = validNeteaseId(id);
    if (!songId) throw new Error("网易云歌曲 ID 无效");
    const failures = [];
    for (let index = 0; index < NETEASE_PROVIDERS.length; index++) {
      const provider = NETEASE_PROVIDERS[index];
      try {
        const response = await fetch(metingUrl(provider, "song", songId), {
          signal,
          cache: "no-store",
          headers: { Accept: "application/json" }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const song = Array.isArray(data) ? data[0] : data;
        const name = String(song?.name || song?.title || "").trim().slice(0, 160);
        const artist = String(song?.artist || song?.author || "").trim().slice(0, 160);
        if (!name) throw new Error("接口没有返回曲名");
        return {
          id: songId,
          name,
          artist,
          title: artist ? `${name} · ${artist}` : name,
          provider: provider.name,
          providerIndex: index
        };
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        failures.push(`${provider.name}：${error?.message || error}`);
      }
    }
    throw new Error(`两个网易云解析服务都不可用（${failures.join("；")}）`);
  }

  function settings(post = {}) {
    const value = post.musicVolume;
    const volume = value == null || value === "" ? 0.6 : Number(value);
    return {
      source: String(post.music || "").trim(),
      title: String(post.musicTitle || "").trim() || "文章配乐",
      volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0.6,
      loop: post.musicLoop !== false
    };
  }

  function createPlayer({ host, post }) {
    const config = settings(post);
    if (!config.source || !host) return null;
    let sourceInfo;
    try {
      sourceInfo = parseSource(config.source);
    } catch (error) {
      console.warn("音乐地址无效", error);
      return null;
    }

    const audio = document.createElement("audio");
    audio.preload = "metadata";
    audio.volume = config.volume;
    audio.loop = config.loop;
    const layer = document.createElement("div");
    layer.className = "article-music";
    layer.dataset.state = "loading";
    layer.innerHTML = `
      <div class="article-music-wave" aria-hidden="true"></div>
      <div class="article-music-controls">
        <button type="button" class="article-music-toggle" aria-label="播放音乐" title="播放 / 暂停音乐">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path class="music-play-icon" d="m9 5 11 7-11 7Z"/><g class="music-pause-icon"><path d="M7 5h4v14H7zM15 5h4v14h-4z"/></g></svg>
        </button>
        <div class="article-music-info"><span class="article-music-title"></span><span class="article-music-status" role="status" aria-live="polite">正在加载音乐…</span></div>
        <span class="article-music-time">0:00</span>
      </div>
      <input class="article-music-progress" type="range" min="0" max="1000" value="0" aria-label="音乐播放进度" disabled>
    `;
    const wave = layer.querySelector(".article-music-wave");
    const bars = Array.from({ length: 37 }, () => {
      const bar = document.createElement("span");
      wave.appendChild(bar);
      return bar;
    });
    const toggle = layer.querySelector(".article-music-toggle");
    const status = layer.querySelector(".article-music-status");
    const progress = layer.querySelector(".article-music-progress");
    const time = layer.querySelector(".article-music-time");
    layer.querySelector(".article-music-title").textContent = config.title;
    layer.appendChild(audio);
    host.appendChild(layer);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const events = new AbortController();
    let context = null;
    let analyser = null;
    let mediaSource = null;
    let samples = null;
    let frame = 0;
    let disposed = false;
    let playing = false;
    let playAttempt = 0;
    let sourceIndex = 0;
    let switchingProvider = false;

    function setState(state, message) {
      if (disposed) return;
      playing = state === "playing";
      layer.dataset.state = state;
      status.textContent = message;
      toggle.setAttribute("aria-label", playing ? "暂停音乐" : "播放音乐");
      toggle.setAttribute("aria-pressed", String(playing));
      cancelAnimationFrame(frame);
      frame = 0;
      draw();
    }

    function draw() {
      if (disposed) return;
      const animate = playing && !document.hidden && !reducedMotion.matches;
      if (animate && analyser) analyser.getByteFrequencyData(samples);
      const t = audio.currentTime;
      bars.forEach((bar, index) => {
        const x = index / (bars.length - 1);
        const envelope = 0.24 + 0.76 * Math.pow(Math.sin((x * 1.65 + 0.1) * Math.PI), 2);
        let height = 0.07;
        if (animate) {
          if (samples) {
            const bin = Math.round(Math.pow(index / bars.length, 1.8) * (samples.length * 0.7 - 1));
            height = 0.06 + (samples[bin] / 255) * envelope * 0.94;
          } else {
            // Cross-origin media keeps native playback; these bars are decorative.
            height = 0.08 + envelope * (0.25 + 0.65 * Math.pow(Math.sin(t * 3.4 + index * 0.42), 2));
          }
        } else if (playing && reducedMotion.matches) {
          height = envelope * 0.55;
        }
        bar.style.transform = `scaleY(${height.toFixed(3)})`;
      });
      if (animate) frame = requestAnimationFrame(draw);
    }

    function prepareAnalyser() {
      if (context) return;
      const url = new URL(audio.src, location.href);
      // Do not route opaque media through Web Audio: browsers would mute it.
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      try {
        context = new AudioContext();
        analyser = context.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.78;
        mediaSource = context.createMediaElementSource(audio);
        mediaSource.connect(analyser);
        analyser.connect(context.destination);
        samples = new Uint8Array(analyser.frequencyBinCount);
      } catch (error) {
        console.warn("音乐频谱不可用", error);
        if (mediaSource && context) mediaSource.connect(context.destination);
        analyser = null;
        samples = null;
      }
    }

    function setAudioSource(index) {
      sourceIndex = Math.max(0, Math.min(sourceInfo.playbackSources.length - 1, index));
      audio.src = sourceInfo.playbackSources[sourceIndex];
    }

    function play({ restartProviders = false } = {}) {
      if (disposed) return;
      const attempt = ++playAttempt;
      try {
        if (restartProviders && sourceInfo.kind === "netease") {
          switchingProvider = false;
          setAudioSource(0);
          audio.load();
        } else if (!audio.getAttribute("src")) {
          setAudioSource(sourceIndex);
        } else if (audio.error) {
          audio.load();
        }
        prepareAnalyser();
        // Keep both calls inside the article click's user activation.
        if (context?.state === "suspended") context.resume().catch(() => {});
        setState("loading", "正在加载音乐…");
        audio.play().catch(error => {
          if (disposed || attempt !== playAttempt || error.name === "AbortError") return;
          setState(error.name === "NotAllowedError" ? "paused" : "error",
            error.name === "NotAllowedError" ? "点击播放，开启配乐" : "音乐暂时无法播放，点击重试");
        });
      } catch (error) {
        setState("error", "音乐地址无效");
      }
    }

    function tryFallbackProvider() {
      if (disposed || sourceInfo.kind !== "netease" || sourceIndex + 1 >= sourceInfo.playbackSources.length) return false;
      switchingProvider = true;
      playAttempt++;
      setState("loading", "主接口不可用，正在切换备用接口…");
      setAudioSource(sourceIndex + 1);
      audio.load();
      const attempt = ++playAttempt;
      audio.play().catch(error => {
        if (disposed || attempt !== playAttempt || error.name === "AbortError") return;
        switchingProvider = false;
        setState(error.name === "NotAllowedError" ? "paused" : "error",
          error.name === "NotAllowedError" ? "点击播放，开启配乐" : "两个音乐接口均无法播放，点击重试");
      });
      return true;
    }

    function formatTime(value) {
      const seconds = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    }

    function updateTime() {
      const seekable = Number.isFinite(audio.duration) && audio.duration > 0;
      progress.disabled = !seekable;
      progress.value = seekable ? Math.round(audio.currentTime / audio.duration * 1000) : 0;
      progress.setAttribute("aria-valuetext", `${formatTime(audio.currentTime)} / ${formatTime(audio.duration)}`);
      progress.style.setProperty("--music-progress", `${Number(progress.value) / 10}%`);
      time.textContent = formatTime(audio.currentTime);
    }

    function listen(target, type, callback) {
      target.addEventListener(type, callback, { signal: events.signal });
    }
    listen(layer, "click", event => event.stopPropagation());
    listen(layer, "pointerdown", event => event.stopPropagation());
    listen(layer, "keydown", event => { if (event.key !== "Escape") event.stopPropagation(); });
    listen(toggle, "click", () => {
      if (!audio.paused) { playAttempt++; audio.pause(); }
      else play({ restartProviders: !!audio.error });
    });
    listen(progress, "input", () => {
      if (Number.isFinite(audio.duration)) audio.currentTime = Number(progress.value) / 1000 * audio.duration;
      updateTime();
    });
    listen(audio, "playing", () => {
      switchingProvider = false;
      setState("playing", sourceInfo.kind === "netease" && sourceIndex > 0 ? "正在播放 · 备用接口" : "正在播放");
    });
    listen(audio, "pause", () => {
      if (switchingProvider) return;
      if (audio.error) setState("error", "音乐加载失败，点击重试");
      else if (audio.ended) setState("ended", "播放完毕 · 点击重播");
      else setState("paused", "已暂停");
    });
    listen(audio, "waiting", () => { if (!audio.error) setState("loading", "正在缓冲…"); });
    listen(audio, "ended", () => setState("ended", "播放完毕 · 点击重播"));
    listen(audio, "error", () => {
      if (!tryFallbackProvider()) {
        switchingProvider = false;
        setState("error", sourceInfo.kind === "netease" ? "两个音乐接口均无法播放，点击重试" : "音乐加载失败，点击重试");
      }
    });
    listen(audio, "timeupdate", updateTime);
    listen(audio, "durationchange", updateTime);
    const redraw = () => { cancelAnimationFrame(frame); frame = 0; draw(); };
    listen(document, "visibilitychange", redraw);
    listen(reducedMotion, "change", redraw);

    function destroy() {
      if (disposed) return;
      disposed = true;
      playAttempt++;
      events.abort();
      cancelAnimationFrame(frame);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      mediaSource?.disconnect();
      analyser?.disconnect();
      if (context && context.state !== "closed") context.close().catch(() => {});
      layer.remove();
    }
    listen(window, "pagehide", destroy);
    play();
    return { destroy };
  }

  window.HanakoMusic = {
    AUDIO_EXTENSIONS,
    MAX_AUDIO_BYTES,
    NETEASE_PROVIDERS,
    createPlayer,
    extractNeteaseId,
    fetchNeteaseMetadata,
    parseSource,
    settings,
    validateSource
  };
})();

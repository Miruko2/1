(() => {
  "use strict";

  const invoke = window.__TAURI__?.core?.invoke;
  if (typeof invoke !== "function") return;

  const imageCache = new Map();

  function createWritable(commit) {
    let value = null;
    let aborted = false;
    return {
      async write(nextValue) {
        if (aborted) throw new Error("写入已取消");
        value = nextValue;
      },
      async close() {
        if (aborted) return;
        await commit(value);
      },
      async abort() {
        aborted = true;
        value = null;
      }
    };
  }

  async function blobToBytes(value) {
    if (value instanceof Blob) {
      return Array.from(new Uint8Array(await value.arrayBuffer()));
    }
    if (value instanceof Uint8Array) return Array.from(value);
    if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
    if (Array.isArray(value)) return value;
    throw new Error("不支持的图片数据格式");
  }

  const projectsHandle = {
    kind: "file",
    name: "projects.js",
    async getFile() {
      const result = await invoke("read_projects");
      return {
        name: "projects.js",
        size: result.size,
        lastModified: result.lastModified,
        async text() { return result.content; }
      };
    },
    async createWritable() {
      return createWritable(async value => {
        if (typeof value !== "string") throw new Error("projects.js 必须以文本写入");
        await invoke("write_projects", { content: value });
      });
    }
  };

  const imageDirectoryHandle = {
    kind: "directory",
    name: "img",
    async getFileHandle(filename) {
      return {
        kind: "file",
        name: filename,
        async createWritable() {
          return createWritable(async value => {
            const data = await blobToBytes(value);
            const result = await invoke("save_image", { filename, data });
            imageCache.delete(result.relativePath);
          });
        }
      };
    }
  };

  async function createDirectoryHandle() {
    const status = await invoke("project_status");
    if (!status.ready) throw new Error(status.message || "软件旁边没有找到 projects.js");
    return {
      kind: "directory",
      name: status.directoryName,
      async queryPermission() { return "granted"; },
      async requestPermission() { return "granted"; },
      async getFileHandle(filename) {
        if (filename !== "projects.js") throw new Error(`不允许访问文件：${filename}`);
        return projectsHandle;
      },
      async getDirectoryHandle(dirname) {
        if (dirname !== "img") throw new Error(`不允许访问目录：${dirname}`);
        return imageDirectoryHandle;
      }
    };
  }

  window.__HANAKO_DESKTOP__ = {
    async saveAudio(filename, file) {
      const encodedName = btoa(Array.from(new TextEncoder().encode(filename), byte => String.fromCharCode(byte)).join(""));
      return invoke("save_audio", await file.arrayBuffer(), {
        headers: { "x-audio-filename": encodedName }
      });
    },
    async readAudio(relativePath) {
      const data = await invoke("read_audio", { relativePath });
      const extension = relativePath.split(".").pop().toLowerCase();
      const types = { mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac", flac: "audio/flac", opus: "audio/ogg", webm: "audio/webm" };
      return new Blob([new Uint8Array(data)], { type: types[extension] || "application/octet-stream" });
    },
    async resolveImage(relativePath) {
      if (!relativePath || /^(https?:|data:|blob:)/i.test(relativePath)) return relativePath;
      if (!imageCache.has(relativePath)) {
        imageCache.set(relativePath, invoke("read_image_data_url", { relativePath })
          .catch(error => {
            imageCache.delete(relativePath);
            throw error;
          }));
      }
      return imageCache.get(relativePath);
    }
  };

  window.showDirectoryPicker = async () => createDirectoryHandle();
})();

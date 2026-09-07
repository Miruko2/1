# HANAKO Editor Desktop

Windows desktop wrapper for the existing `admin.html` editor.

## Development

```powershell
npm install
npm run dev
```

## Portable build

```powershell
npm run build
npm run copy-portable
```

The resulting `HanakoEditor.exe` and `HanakoEditor-Sakura.exe` are copied to the project root.
They must stay next to `projects.js`; the editor reads or writes that file, images inside
`img/`, and audio inside `audio/`.
Every successful post save keeps the previous version as `projects.js.bak`.

## Article music

Select an article, then use **文章音乐 → 选择音频** to import a local track, or enter
an HTTPS link to an audio file. A NetEase song page link or numeric song ID is also
accepted. NetEase sources are normalized to `netease:<song-id>`; the editor fills the
display title from the song name and artist. Click **保存到 projects.js** to apply changes.
Imports use unique filenames and never overwrite existing tracks. Removing a track
from an article does not delete its file, which may still be used by another article.

The optional fields are `music` (for example `audio/song.mp3`), `musicTitle`,
`musicVolume` (0–1, default 0.6) and `musicLoop` (default true). Existing articles
without `music` keep their original appearance. Opening an article starts its track;
closing the article stops playback and releases its audio resources. If autoplay is
blocked, the cover's play button starts playback manually.

NetEase playback uses `https://api.qijieya.cn/meting/` first and automatically falls
back to `https://api.injahow.cn/meting/`. Only the stable song ID is stored, so expiring
`music.126.net` URLs are resolved again for each playback. These are public third-party
services and require no API key. NetEase short links without a visible song ID are not
accepted; paste the song page URL or the numeric ID instead.

Local tracks served over HTTP(S) use a real audio spectrum. Cross-origin links and
file:// previews use a decorative waveform to preserve playback when the media host
does not allow Web Audio access. Publish `audio/`, `article-music.js` and
`article-music.css` alongside the website. No additional runtime dependencies are used.

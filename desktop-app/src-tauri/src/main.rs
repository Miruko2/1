#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use std::{
    fs::{self, OpenOptions},
    io::Write,
    path::{Component, Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::State;

const MAX_PROJECTS_BYTES: usize = 8 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;
const MAX_AUDIO_BYTES: usize = 64 * 1024 * 1024;

struct AppState {
    project_root: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectStatus {
    ready: bool,
    directory_name: String,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectFile {
    content: String,
    size: u64,
    last_modified: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedImage {
    relative_path: String,
    last_modified: u64,
}

fn modified_millis(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .unwrap_or(SystemTime::UNIX_EPOCH)
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn discover_project_root() -> PathBuf {
    let executable_dir = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf));

    if let Some(path) = executable_dir.as_ref() {
        if path.join("projects.js").is_file() {
            return path.clone();
        }
    }

    #[cfg(debug_assertions)]
    {
        let development_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
        if development_root.join("projects.js").is_file() {
            return development_root.canonicalize().unwrap_or(development_root);
        }
    }

    if let Ok(path) = std::env::current_dir() {
        if path.join("projects.js").is_file() {
            return path;
        }
    }

    executable_dir.unwrap_or_else(|| PathBuf::from("."))
}

fn projects_path(state: &State<'_, AppState>) -> PathBuf {
    state.project_root.join("projects.js")
}

fn ensure_project_ready(state: &State<'_, AppState>) -> Result<PathBuf, String> {
    let path = projects_path(state);
    if !path.is_file() {
        return Err("软件旁边没有找到 projects.js。请把 HanakoEditor.exe 放回项目目录。".into());
    }
    Ok(path)
}

fn write_temp_file(path: &Path, data: &[u8]) -> Result<(), String> {
    let mut file = OpenOptions::new()
        .create(true)
        .truncate(true)
        .write(true)
        .open(path)
        .map_err(|error| format!("无法创建临时文件：{error}"))?;
    file.write_all(data)
        .and_then(|_| file.sync_all())
        .map_err(|error| format!("无法写入临时文件：{error}"))
}

fn atomic_replace(
    target: &Path,
    data: &[u8],
    persistent_backup: Option<&Path>,
) -> Result<(), String> {
    let filename = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "目标文件名无效".to_string())?;
    let parent = target.parent().ok_or_else(|| "目标目录无效".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("无法创建目标目录：{error}"))?;

    let temp = parent.join(format!(".{filename}.{}.tmp", std::process::id()));
    let transient_backup = parent.join(format!(".{filename}.{}.old", std::process::id()));
    let backup = persistent_backup.unwrap_or(&transient_backup);

    if temp.exists() {
        fs::remove_file(&temp).map_err(|error| format!("无法清理旧临时文件：{error}"))?;
    }
    write_temp_file(&temp, data)?;

    if backup.exists() {
        fs::remove_file(backup).map_err(|error| format!("无法更新备份文件：{error}"))?;
    }
    if target.exists() {
        fs::rename(target, backup).map_err(|error| format!("无法备份原文件：{error}"))?;
    }

    if let Err(error) = fs::rename(&temp, target) {
        if backup.exists() && !target.exists() {
            let _ = fs::rename(backup, target);
        }
        let _ = fs::remove_file(&temp);
        return Err(format!("无法替换目标文件：{error}"));
    }

    if persistent_backup.is_none() && backup.exists() {
        fs::remove_file(backup).map_err(|error| format!("无法清理图片临时备份：{error}"))?;
    }
    Ok(())
}

fn validate_image_filename(filename: &str) -> Result<(), String> {
    let path = Path::new(filename);
    let mut components = path.components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => {}
        _ => return Err("图片文件名不能包含目录或上级路径".into()),
    }

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    if !matches!(
        extension.as_str(),
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "svg"
    ) {
        return Err("只允许保存 png、jpg、jpeg、gif、webp 或 svg 图片".into());
    }
    Ok(())
}

fn resolve_image_path(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let relative = Path::new(relative_path);
    let mut components = relative.components();
    match components.next() {
        Some(Component::Normal(first)) if first == "img" => {}
        _ => return Err("只允许读取 img/ 目录中的图片".into()),
    }
    if components.any(|component| !matches!(component, Component::Normal(_))) {
        return Err("图片路径包含不允许的部分".into());
    }

    let image_root = root
        .join("img")
        .canonicalize()
        .map_err(|error| format!("无法读取 img 目录：{error}"))?;
    let path = root
        .join(relative)
        .canonicalize()
        .map_err(|error| format!("找不到图片 {relative_path}：{error}"))?;
    if !path.starts_with(&image_root) || !path.is_file() {
        return Err("图片路径超出允许的 img/ 目录".into());
    }
    Ok(path)
}

fn image_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase()
        .as_str()
    {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
fn project_status(state: State<'_, AppState>) -> ProjectStatus {
    let ready = state.project_root.join("projects.js").is_file();
    let directory_name = state
        .project_root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("当前项目目录")
        .to_string();
    ProjectStatus {
        ready,
        directory_name,
        message: if ready {
            "已连接软件所在项目目录".into()
        } else {
            "软件旁边没有找到 projects.js。请把 HanakoEditor.exe 放回项目目录。".into()
        },
    }
}

#[tauri::command]
fn read_projects(state: State<'_, AppState>) -> Result<ProjectFile, String> {
    let path = ensure_project_ready(&state)?;
    let content =
        fs::read_to_string(&path).map_err(|error| format!("读取 projects.js 失败：{error}"))?;
    let metadata = fs::metadata(&path).map_err(|error| format!("读取文件信息失败：{error}"))?;
    Ok(ProjectFile {
        content,
        size: metadata.len(),
        last_modified: modified_millis(&metadata),
    })
}

#[tauri::command]
fn write_projects(content: String, state: State<'_, AppState>) -> Result<ProjectFile, String> {
    if content.len() > MAX_PROJECTS_BYTES {
        return Err("projects.js 超过 8 MB，已拒绝写入".into());
    }
    if !content.contains("const PROJECTS") {
        return Err("内容中没有找到 const PROJECTS，已拒绝写入".into());
    }

    let path = ensure_project_ready(&state)?;
    let backup = state.project_root.join("projects.js.bak");
    atomic_replace(&path, content.as_bytes(), Some(&backup))?;

    let persisted =
        fs::read_to_string(&path).map_err(|error| format!("写入后复核失败：{error}"))?;
    if persisted != content {
        return Err("写入后复核发现内容不一致；原文件已保存在 projects.js.bak".into());
    }
    let metadata = fs::metadata(&path).map_err(|error| format!("读取文件信息失败：{error}"))?;
    Ok(ProjectFile {
        content: persisted,
        size: metadata.len(),
        last_modified: modified_millis(&metadata),
    })
}

#[tauri::command]
fn save_image(
    filename: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<SavedImage, String> {
    ensure_project_ready(&state)?;
    validate_image_filename(&filename)?;
    if data.len() > MAX_IMAGE_BYTES {
        return Err("图片超过 32 MB，已拒绝保存".into());
    }

    let image_dir = state.project_root.join("img");
    fs::create_dir_all(&image_dir).map_err(|error| format!("无法创建 img 目录：{error}"))?;
    let path = image_dir.join(&filename);
    atomic_replace(&path, &data, None)?;
    let metadata = fs::metadata(&path).map_err(|error| format!("读取图片信息失败：{error}"))?;
    Ok(SavedImage {
        relative_path: format!("img/{filename}"),
        last_modified: modified_millis(&metadata),
    })
}

#[tauri::command]
fn read_image_data_url(
    relative_path: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    ensure_project_ready(&state)?;
    let path = resolve_image_path(&state.project_root, &relative_path)?;
    let metadata = fs::metadata(&path).map_err(|error| format!("读取图片信息失败：{error}"))?;
    if metadata.len() as usize > MAX_IMAGE_BYTES {
        return Err("图片超过 32 MB，无法在编辑器中预览".into());
    }
    let data = fs::read(&path).map_err(|error| format!("读取图片失败：{error}"))?;
    Ok(format!(
        "data:{};base64,{}",
        image_mime(&path),
        STANDARD.encode(data)
    ))
}

fn validate_audio_filename(filename: &str) -> Result<(), String> {
    if filename.is_empty()
        || filename.chars().any(|c| c.is_control() || "<>:\"/\\|?*".contains(c))
        || filename.ends_with(['.', ' '])
    {
        return Err("音频文件名不能包含目录或特殊字符".into());
    }
    let path = Path::new(filename);
    let stem = path.file_stem().and_then(|value| value.to_str()).unwrap_or("");
    let device = stem.split('.').next().unwrap_or("").to_ascii_uppercase();
    if matches!(device.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || (device.len() == 4
            && (device.starts_with("COM") || device.starts_with("LPT"))
            && matches!(device.as_bytes()[3], b'1'..=b'9'))
    {
        return Err("音频文件名不能使用系统保留名称".into());
    }
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if !matches!(extension.as_str(), "mp3" | "wav" | "ogg" | "m4a" | "aac" | "flac" | "opus" | "webm") {
        return Err("不支持此音频格式".into());
    }
    Ok(())
}

fn audio_directory(root: &Path, create: bool) -> Result<PathBuf, String> {
    let root = root.canonicalize().map_err(|error| format!("无法读取项目目录：{error}"))?;
    let directory = root.join("audio");
    if create {
        fs::create_dir_all(&directory).map_err(|error| format!("无法创建 audio 目录：{error}"))?;
    }
    let directory = directory.canonicalize().map_err(|error| format!("无法读取 audio 目录：{error}"))?;
    if !directory.starts_with(&root) || directory == root || !directory.is_dir() {
        return Err("音频目录超出项目范围".into());
    }
    Ok(directory)
}

fn save_audio_file(root: &Path, filename: &str, data: &[u8]) -> Result<SavedImage, String> {
    validate_audio_filename(filename)?;
    if data.is_empty() || data.len() > MAX_AUDIO_BYTES {
        return Err("音频必须非空且不超过 64 MB".into());
    }
    let directory = audio_directory(root, true)?;
    let path = directory.join(filename);
    // Exclusive creation protects tracks that are shared by existing articles.
    let mut file = OpenOptions::new().create_new(true).write(true).open(&path)
        .map_err(|error| format!("无法创建音频文件（不会覆盖同名文件）：{error}"))?;
    if let Err(error) = file.write_all(data).and_then(|_| file.sync_all()) {
        drop(file);
        let _ = fs::remove_file(&path);
        return Err(format!("保存音频失败：{error}"));
    }
    let metadata = file.metadata().map_err(|error| format!("无法核验音频：{error}"))?;
    if metadata.len() != data.len() as u64 {
        return Err("音频保存后的大小不一致".into());
    }
    Ok(SavedImage { relative_path: format!("audio/{filename}"), last_modified: modified_millis(&metadata) })
}

fn read_audio_file(root: &Path, relative_path: &str) -> Result<Vec<u8>, String> {
    let filename = relative_path.strip_prefix("audio/").ok_or("只允许读取 audio/ 目录中的音频")?;
    validate_audio_filename(filename)?;
    let directory = audio_directory(root, false)?;
    let path = directory.join(filename).canonicalize().map_err(|error| format!("找不到音频：{error}"))?;
    if !path.starts_with(&directory) || !path.is_file() {
        return Err("音频路径超出允许的 audio/ 目录".into());
    }
    let metadata = fs::metadata(&path).map_err(|error| format!("无法读取音频信息：{error}"))?;
    if metadata.len() == 0 || metadata.len() > MAX_AUDIO_BYTES as u64 {
        return Err("音频必须非空且不超过 64 MB".into());
    }
    fs::read(path).map_err(|error| format!("读取音频失败：{error}"))
}

#[tauri::command]
fn save_audio(request: tauri::ipc::Request<'_>, state: State<'_, AppState>) -> Result<SavedImage, String> {
    ensure_project_ready(&state)?;
    let tauri::ipc::InvokeBody::Raw(data) = request.body() else {
        return Err("音频数据格式不正确".into());
    };
    let encoded = request.headers().get("x-audio-filename").and_then(|value| value.to_str().ok())
        .ok_or("缺少音频文件名")?;
    let filename = String::from_utf8(STANDARD.decode(encoded).map_err(|_| "音频文件名编码无效")?)
        .map_err(|_| "音频文件名编码无效")?;
    save_audio_file(&state.project_root, &filename, data)
}

#[tauri::command]
fn read_audio(relative_path: String, state: State<'_, AppState>) -> Result<tauri::ipc::Response, String> {
    ensure_project_ready(&state)?;
    read_audio_file(&state.project_root, &relative_path).map(tauri::ipc::Response::new)
}

fn main() {
    let project_root = discover_project_root();
    tauri::Builder::default()
        .manage(AppState { project_root })
        .invoke_handler(tauri::generate_handler![
            project_status,
            read_projects,
            write_projects,
            save_image,
            read_image_data_url,
            save_audio,
            read_audio
        ])
        .run(tauri::generate_context!())
        .expect("failed to run HANAKO editor");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_directory() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!(
            "hanako-editor-test-{}-{unique}",
            std::process::id()
        ))
    }

    #[test]
    fn project_write_keeps_previous_version_as_backup() {
        let directory = test_directory();
        fs::create_dir(&directory).unwrap();
        let target = directory.join("projects.js");
        let backup = directory.join("projects.js.bak");
        fs::write(&target, b"const PROJECTS = ['old'];\n").unwrap();

        atomic_replace(&target, b"const PROJECTS = ['new'];\n", Some(&backup)).unwrap();

        assert_eq!(
            fs::read_to_string(&target).unwrap(),
            "const PROJECTS = ['new'];\n"
        );
        assert_eq!(
            fs::read_to_string(&backup).unwrap(),
            "const PROJECTS = ['old'];\n"
        );

        fs::remove_file(target).unwrap();
        fs::remove_file(backup).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn image_filename_rejects_path_traversal() {
        assert!(validate_image_filename("cover.png").is_ok());
        assert!(validate_image_filename("../projects.js").is_err());
        assert!(validate_image_filename("nested/cover.png").is_err());
        assert!(validate_image_filename("script.exe").is_err());
    }

    #[test]
    fn audio_import_round_trips_without_overwriting_existing_tracks() {
        let directory = test_directory();
        fs::create_dir(&directory).unwrap();
        let data = b"RIFF-test-audio";
        let saved = save_audio_file(&directory, "春日配乐.wav", data).unwrap();
        assert_eq!(saved.relative_path, "audio/春日配乐.wav");
        assert_eq!(read_audio_file(&directory, &saved.relative_path).unwrap(), data);
        assert!(save_audio_file(&directory, "春日配乐.wav", b"replacement").is_err());
        assert_eq!(read_audio_file(&directory, &saved.relative_path).unwrap(), data);
        assert!(save_audio_file(&directory, "empty.mp3", b"").is_err());
        assert!(read_audio_file(&directory, "audio/../projects.js").is_err());
        assert!(read_audio_file(&directory, "img/cover.mp3").is_err());
        fs::remove_file(directory.join(saved.relative_path)).unwrap();
        fs::remove_dir(directory.join("audio")).unwrap();
        fs::remove_dir(directory).unwrap();
    }

    #[test]
    fn audio_filename_rejects_traversal_and_windows_special_paths() {
        for filename in ["../song.mp3", "nested/song.mp3", "..\\song.mp3", "song:stream.mp3", "CON.mp3", "com1.mp3", "song.exe", "song.mp3 "] {
            assert!(validate_audio_filename(filename).is_err(), "accepted {filename}");
        }
        for filename in ["song.mp3", "春日 配乐.M4A", "rain.ogg", "music.flac"] {
            assert!(validate_audio_filename(filename).is_ok(), "rejected {filename}");
        }
    }
}

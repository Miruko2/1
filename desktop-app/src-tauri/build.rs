fn main() {
    // Re-run the resource compiler whenever generated app icons change.
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build();
}

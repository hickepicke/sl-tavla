use std::{fs, path::PathBuf};

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_window_state::StateFlags;

const DEFAULT_CONFIG: &str = include_str!("../default-config.json");

/// Path to config.json in the OS config dir, created with defaults on first run.
fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("config.json");
    if !path.exists() {
        fs::write(&path, DEFAULT_CONFIG).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<String, String> {
    fs::read_to_string(config_path(&app)?).map_err(|e| e.to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // Remember where the board was dragged to; size is driven by config.
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION)
                .build(),
        )
        .invoke_handler(tauri::generate_handler![load_config])
        .setup(|app| {
            let settings = MenuItem::with_id(app, "settings", "Öppna inställningar", true, None::<&str>)?;
            let reload = MenuItem::with_id(app, "reload", "Ladda om", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Avsluta", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings, &reload, &quit])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("SL-tavla")
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "settings" => {
                        if let Ok(path) = config_path(app) {
                            let _ = app.opener().open_path(path.to_string_lossy(), None::<&str>);
                        }
                    }
                    "reload" => {
                        let _ = app.emit("reload-config", ());
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .build(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running SL-tavla");
}

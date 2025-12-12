/// 공통 테스트 헬퍼 함수들
/// Common test helper functions
use std::path::PathBuf;

/// Helper function to find test HWP files directory
pub fn find_fixtures_dir() -> Option<PathBuf> {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| std::path::PathBuf::from("."));
    let fixtures_path = manifest_dir.join("tests").join("fixtures");

    if fixtures_path.exists() && fixtures_path.is_dir() {
        return Some(fixtures_path);
    }

    // Fallback for backward compatibility
    let possible_paths = ["tests/fixtures", "./tests/fixtures"];

    for path_str in &possible_paths {
        let path = std::path::Path::new(path_str);
        if path.exists() && path.is_dir() {
            return Some(path.to_path_buf());
        }
    }
    None
}

/// Helper function to find test HWP file (for snapshot tests, uses noori.hwp)
pub fn find_test_file() -> Option<String> {
    if let Some(dir) = find_fixtures_dir() {
        let file_path = dir.join("noori.hwp");
        if file_path.exists() {
            return Some(file_path.to_string_lossy().to_string());
        }
    }
    None
}

/// Helper function to find headerfooter.hwp file
pub fn find_headerfooter_file() -> Option<String> {
    if let Some(dir) = find_fixtures_dir() {
        let file_path = dir.join("headerfooter.hwp");
        if file_path.exists() {
            return Some(file_path.to_string_lossy().to_string());
        }
    }
    None
}

/// Helper function to get all HWP files in fixtures directory
pub fn find_all_hwp_files() -> Vec<String> {
    if let Some(dir) = find_fixtures_dir() {
        let mut files = Vec::new();
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() && path.extension().and_then(|s| s.to_str()) == Some("hwp") {
                    if let Some(path_str) = path.to_str() {
                        files.push(path_str.to_string());
                    }
                }
            }
        }
        files.sort();
        return files;
    }
    Vec::new()
}

/// Helper function to find a specific HWP file in fixtures directory
pub fn find_fixture_file(filename: &str) -> Option<String> {
    if let Some(dir) = find_fixtures_dir() {
        let file_path = dir.join(filename);
        if file_path.exists() {
            return Some(file_path.to_string_lossy().to_string());
        }
    }
    None
}

/// 공통 테스트 헬퍼 함수들
/// Common test helper functions
use std::path::{Path, PathBuf};

/// Tests 디렉터리 기준 경로 (manifest/tests). 경로 계산 중복 제거용.
fn tests_base_dir() -> PathBuf {
    std::env::var("CARGO_MANIFEST_DIR")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join("tests")
}

/// Helper function to find test HWP files directory
#[allow(dead_code)]
pub fn find_fixtures_dir() -> Option<PathBuf> {
    let fixtures_path = tests_base_dir().join("fixtures");

    if fixtures_path.exists() && fixtures_path.is_dir() {
        return Some(fixtures_path);
    }

    // Fallback for backward compatibility
    let possible_paths = ["tests/fixtures", "./tests/fixtures"];

    for path_str in &possible_paths {
        let path = Path::new(path_str);
        if path.exists() && path.is_dir() {
            return Some(path.to_path_buf());
        }
    }
    None
}

/// Helper function to find test HWP file (for snapshot tests, uses noori.hwp)
#[allow(dead_code)]
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
#[allow(dead_code)]
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
#[allow(dead_code)]
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

/// PDF 테스트용 폰트 디렉터리. `tests/fixtures/fonts`에 LiberationSans-*.ttf를 두면 사용됨.
#[allow(dead_code)]
pub fn find_font_dir() -> Option<PathBuf> {
    let font_path = tests_base_dir().join("fixtures").join("fonts");
    if font_path.is_dir() && font_path.join("LiberationSans-Regular.ttf").exists() {
        return Some(font_path);
    }
    None
}

/// Helper function to find a specific HWP file in fixtures directory.
/// `filename`에 `..`가 포함되거나 fixtures 디렉터리 밖으로 나가는 경로는 거부됨.
pub fn find_fixture_file(filename: &str) -> Option<String> {
    if filename.contains("..") {
        return None;
    }
    if let Some(dir) = find_fixtures_dir() {
        let file_path = dir.join(filename);
        if file_path.exists() {
            // 경로가 fixtures 하위인지 검증 (심볼릭 링크 등 대비)
            if let (Ok(canon_file), Ok(canon_dir)) =
                (file_path.canonicalize(), dir.canonicalize())
            {
                if !canon_file.starts_with(canon_dir) {
                    return None;
                }
            }
            return Some(file_path.to_string_lossy().to_string());
        }
    }
    None
}

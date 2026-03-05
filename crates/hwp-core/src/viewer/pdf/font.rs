use printpdf::{IndirectFontRef, PdfDocumentReference};
use std::io::Cursor;
use std::path::{Path, PathBuf};

/// 폰트 4벌 (Regular/Bold/Italic/BoldItalic)
pub struct PdfFonts {
    pub regular: IndirectFontRef,
    pub bold: IndirectFontRef,
    pub italic: IndirectFontRef,
    pub bold_italic: IndirectFontRef,
    /// rusttype 메트릭스용 (텍스트 너비 계산)
    #[allow(dead_code)]
    pub rt_regular: Option<rusttype::Font<'static>>,
}

/// 폰트 탐색 순서
const FONT_FAMILIES: &[(&str, &str, &str, &str)] = &[
    (
        "NotoSansKR-Regular.ttf",
        "NotoSansKR-Bold.ttf",
        "NotoSansKR-Regular.ttf",
        "NotoSansKR-Bold.ttf",
    ),
    (
        "LiberationSans-Regular.ttf",
        "LiberationSans-Bold.ttf",
        "LiberationSans-Italic.ttf",
        "LiberationSans-BoldItalic.ttf",
    ),
];

/// macOS 시스템 폰트 경로에서 한글 지원 폰트 탐색
fn find_system_korean_font() -> Option<PathBuf> {
    let candidates = [
        // macOS 시스템 폰트 (한글 지원)
        "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
        "/Library/Fonts/AppleGothic.ttf",
        // Linux
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
    ];
    for path in &candidates {
        let p = Path::new(path);
        if p.exists() {
            return Some(p.to_path_buf());
        }
    }
    None
}

impl PdfFonts {
    /// font_dir에서 폰트 로딩. font_dir이 None이면 시스템 폰트 자동 탐색.
    /// 한글 지원 폰트를 우선으로 탐색한다 (NotoSansKR → 시스템 한글 폰트 → LiberationSans).
    pub fn load(doc: &PdfDocumentReference, font_dir: Option<&Path>) -> Self {
        // 1. font_dir에서 NotoSansKR (한글 지원) 우선 탐색
        if let Some(dir) = font_dir {
            if let Some(fonts) = Self::try_load_family(doc, dir, &FONT_FAMILIES[0]) {
                return fonts;
            }
        }

        // 2. 시스템 한글 폰트 탐색 (AppleGothic, NanumGothic 등)
        if let Some(system_font) = find_system_korean_font() {
            if let Some(fonts) = Self::try_load_single_font(doc, &system_font) {
                return fonts;
            }
        }

        // 3. font_dir에서 나머지 폰트 패밀리 (LiberationSans 등)
        if let Some(dir) = font_dir {
            for family in &FONT_FAMILIES[1..] {
                if let Some(fonts) = Self::try_load_family(doc, dir, family) {
                    return fonts;
                }
            }
            if let Some(fonts) = Self::try_load_any_ttf(doc, dir) {
                return fonts;
            }
        }

        panic!(
            "font: set font_dir to a path containing NotoSansKR or LiberationSans TTF files, \
             or install AppleGothic (macOS) / NanumGothic (Linux)"
        );
    }

    fn try_load_family(
        doc: &PdfDocumentReference,
        dir: &Path,
        family: &(&str, &str, &str, &str),
    ) -> Option<Self> {
        let regular_path = dir.join(family.0);
        if !regular_path.exists() {
            return None;
        }

        let regular_bytes = std::fs::read(&regular_path).ok()?;
        let bold_bytes =
            std::fs::read(dir.join(family.1)).unwrap_or_else(|_| regular_bytes.clone());
        let italic_bytes =
            std::fs::read(dir.join(family.2)).unwrap_or_else(|_| regular_bytes.clone());
        let bold_italic_bytes =
            std::fs::read(dir.join(family.3)).unwrap_or_else(|_| bold_bytes.clone());

        let regular = doc.add_external_font(Cursor::new(&regular_bytes)).ok()?;
        let bold = doc.add_external_font(Cursor::new(&bold_bytes)).ok()?;
        let italic = doc.add_external_font(Cursor::new(&italic_bytes)).ok()?;
        let bold_italic = doc
            .add_external_font(Cursor::new(&bold_italic_bytes))
            .ok()?;

        let rt_regular = rusttype::Font::try_from_vec(regular_bytes);

        Some(Self {
            regular,
            bold,
            italic,
            bold_italic,
            rt_regular,
        })
    }

    /// 단일 TTF 파일로 모든 스타일 로딩 (시스템 폰트용)
    fn try_load_single_font(doc: &PdfDocumentReference, path: &Path) -> Option<Self> {
        let bytes = std::fs::read(path).ok()?;
        let regular = doc.add_external_font(Cursor::new(&bytes)).ok()?;
        let bold = doc.add_external_font(Cursor::new(&bytes)).ok()?;
        let italic = doc.add_external_font(Cursor::new(&bytes)).ok()?;
        let bold_italic = doc.add_external_font(Cursor::new(&bytes)).ok()?;
        let rt_regular = rusttype::Font::try_from_vec(bytes);
        Some(Self {
            regular,
            bold,
            italic,
            bold_italic,
            rt_regular,
        })
    }

    fn try_load_any_ttf(doc: &PdfDocumentReference, dir: &Path) -> Option<Self> {
        let entries = std::fs::read_dir(dir).ok()?;
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) == Some("ttf") {
                let bytes = std::fs::read(&path).ok()?;
                let regular = doc.add_external_font(Cursor::new(&bytes)).ok()?;
                let bold = doc.add_external_font(Cursor::new(&bytes)).ok()?;
                let italic = doc.add_external_font(Cursor::new(&bytes)).ok()?;
                let bold_italic = doc.add_external_font(Cursor::new(&bytes)).ok()?;
                let rt_regular = rusttype::Font::try_from_vec(bytes);
                return Some(Self {
                    regular,
                    bold,
                    italic,
                    bold_italic,
                    rt_regular,
                });
            }
        }
        None
    }

    /// bold/italic에 따른 폰트 참조 반환
    pub fn select(&self, bold: bool, italic: bool) -> &IndirectFontRef {
        match (bold, italic) {
            (true, true) => &self.bold_italic,
            (true, false) => &self.bold,
            (false, true) => &self.italic,
            (false, false) => &self.regular,
        }
    }

    /// 텍스트 너비 계산 (mm 단위). rusttype 폰트가 없으면 근사값 사용.
    #[allow(dead_code)]
    pub fn text_width_mm(&self, text: &str, font_size_pt: f64) -> f64 {
        if let Some(ref rt_font) = self.rt_regular {
            let scale = rusttype::Scale::uniform(font_size_pt as f32);
            let width: f32 = rt_font
                .layout(text, scale, rusttype::point(0.0, 0.0))
                .map(|g| g.unpositioned().h_metrics().advance_width)
                .sum();
            // pt → mm: 1pt = 0.3528mm
            width as f64 * 0.3528
        } else {
            // 근사값: 평균 글리프 폭 ≈ 0.5 * font_size
            text.chars().count() as f64 * font_size_pt * 0.5 * 0.3528
        }
    }
}

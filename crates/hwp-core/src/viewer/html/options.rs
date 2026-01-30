/// HTML 변환 옵션 / HTML conversion options
#[derive(Debug, Clone)]
pub struct HtmlOptions {
    /// 이미지를 파일로 저장할 디렉토리 경로 (None이면 base64 데이터 URI로 임베드)
    /// Optional directory path to save images as files. If None, images are embedded as base64 data URIs.
    pub image_output_dir: Option<String>,

    /// HTML 파일이 저장되는 디렉토리 경로 (이미지 상대 경로 계산에 사용)
    /// Directory path where HTML file is saved (used for calculating relative image paths)
    pub html_output_dir: Option<String>,

    /// 버전 정보 포함 여부 / Whether to include version information
    pub include_version: Option<bool>,

    /// 페이지 정보 포함 여부 / Whether to include page information
    pub include_page_info: Option<bool>,

    /// CSS 클래스 접두사 (기본값: "" - noori.html 스타일)
    /// CSS class prefix (default: "" - noori.html style)
    pub css_class_prefix: String,
}

impl Default for HtmlOptions {
    fn default() -> Self {
        Self {
            image_output_dir: None,
            html_output_dir: None,
            include_version: Some(true),
            include_page_info: Some(false),
            css_class_prefix: String::new(), // noori.html 스타일은 접두사 없음
        }
    }
}

impl HtmlOptions {
    /// 이미지 출력 디렉토리 설정 / Set image output directory
    pub fn with_image_output_dir(mut self, dir: Option<&str>) -> Self {
        self.image_output_dir = dir.map(|s| s.to_string());
        self
    }

    /// 버전 정보 포함 설정 / Set version information inclusion
    pub fn with_include_version(mut self, include: Option<bool>) -> Self {
        self.include_version = include;
        self
    }

    /// 페이지 정보 포함 설정 / Set page information inclusion
    pub fn with_include_page_info(mut self, include: Option<bool>) -> Self {
        self.include_page_info = include;
        self
    }

    /// CSS 클래스 접두사 설정 / Set CSS class prefix
    pub fn with_css_class_prefix(mut self, prefix: &str) -> Self {
        self.css_class_prefix = prefix.to_string();
        self
    }
}

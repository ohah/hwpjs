/// Document flag constants
///
/// 스펙 문서 매핑: 표 3 - 속성 (첫 번째 DWORD)
pub mod document_flags {
    /// Bit 0: 압축 여부
    pub const COMPRESSED: &str = "compressed";
    /// Bit 1: 암호 설정 여부
    pub const ENCRYPTED: &str = "encrypted";
    /// Bit 2: 배포용 문서 여부
    pub const DISTRIBUTION: &str = "distribution";
    /// Bit 3: 스크립트 저장 여부
    pub const SCRIPT: &str = "script";
    /// Bit 4: DRM 보안 문서 여부
    pub const DRM: &str = "drm";
    /// Bit 5: XMLTemplate 스토리지 존재 여부
    pub const XML_TEMPLATE: &str = "xml_template";
    /// Bit 6: 문서 이력 관리 존재 여부
    pub const HISTORY: &str = "history";
    /// Bit 7: 전자 서명 정보 존재 여부
    pub const ELECTRONIC_SIGNATURE: &str = "electronic_signature";
    /// Bit 8: 공인 인증서 암호화 여부
    pub const CERTIFICATE_ENCRYPTION: &str = "certificate_encryption";
    /// Bit 9: 전자 서명 예비 저장 여부
    pub const SIGNATURE_PREVIEW: &str = "signature_preview";
    /// Bit 10: 공인 인증서 DRM 보안 문서 여부
    pub const CERTIFICATE_DRM: &str = "certificate_drm";
    /// Bit 11: CCL 문서 여부
    pub const CCL: &str = "ccl";
    /// Bit 12: 모바일 최적화 여부
    pub const MOBILE_OPTIMIZED: &str = "mobile_optimized";
    /// Bit 13: 개인 정보 보안 문서 여부
    pub const PRIVACY_SECURITY: &str = "privacy_security";
    /// Bit 14: 변경 추적 문서 여부
    pub const TRACK_CHANGE: &str = "track_change";
    /// Bit 15: 공공누리(KOGL) 저작권 문서
    pub const KOGL: &str = "kogl";
    /// Bit 16: 비디오 컨트롤 포함 여부
    pub const VIDEO_CONTROL: &str = "video_control";
    /// Bit 17: 차례 필드 컨트롤 포함 여부
    pub const TABLE_OF_CONTENTS: &str = "table_of_contents";
}

/// License flag constants
///
/// 스펙 문서 매핑: 표 3 - 속성 (두 번째 DWORD)
pub mod license_flags {
    /// Bit 0: CCL, 공공누리 라이선스 정보
    pub const CCL_KOGL: &str = "ccl_kogl";
    /// Bit 1: 복제 제한 여부
    pub const COPY_RESTRICTED: &str = "copy_restricted";
    /// Bit 2: 동일 조건 하에 복제 허가 여부 (복제 제한인 경우 무시)
    pub const COPY_ALLOWED_SAME_CONDITION: &str = "copy_allowed_same_condition";
}

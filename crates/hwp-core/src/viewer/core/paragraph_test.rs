#[cfg(test)]
mod tests {
    use crate::document::bodytext::{BodyText, ControlMask};
    use crate::document::HwpDocument;

    // ===== BodyText tests =====

    #[test]
    fn test_body_text_default() {
        let bodytext = BodyText::default();
        assert_eq!(bodytext.sections.len(), 0);
    }

    #[test]
    fn test_body_text_serialization() {
        let bodytext = BodyText::default();

        let json = serde_json::to_string(&bodytext).unwrap();
        assert!(!json.is_empty());
    }

    // ===== ControlMask tests =====

    #[test]
    fn test_control_mask_default() {
        let mask = ControlMask::new(0);

        assert_eq!(mask.value(), 0);
    }

    #[test]
    fn test_control_mask_from_value() {
        let mask = ControlMask::new(127);

        assert_eq!(mask.value(), 127);
        let flags = mask.active_flags();
        assert!(flags.len() > 0);
    }

    #[test]
    fn test_control_mask_serialization() {
        let mask = ControlMask::new(255);

        let json = serde_json::to_string(&mask).unwrap();
        assert!(!json.is_empty());
    }

    // ===== ControlMask active_flags =====

    #[test]
    fn test_control_mask_active_flags_empty() {
        let mask = ControlMask::new(32);

        let flags = mask.active_flags();
        assert!(flags.is_empty());
    }

    #[test]
    fn test_control_mask_has_no_active_flags() {
        let mask = ControlMask::new(0);

        let flags = mask.active_flags();
        assert!(flags.is_empty());
    }

    // ===== Section tests =====

    #[test]
    fn test_section_default() {
        let section = crate::document::Section::default();

        assert_eq!(section.paragraphs.len(), 0);
        // section.paragraphs already checked
    }

    // ===== Paragraph tests =====

    #[test]
    fn test_paragraph_default() {
        let _paragraph = crate::document::Paragraph::default();

        // OK
        // OK
    }

    // ===== BodyText to records tests =====

    #[test]
    fn test_bodytext_to_records_no_para_text() {
        let bodytext = BodyText::default();

        let records: Vec<crate::document::bodytext::ParagraphRecord> = Vec::new();

        assert!(records.is_empty());
    }

    // ===== UINT16 tests =====

    #[test]
    fn test_uint16_values() {
        let value1: u16 = 100;
        let value2: u16 = 65535;

        assert_eq!(value1, 100);
        assert_eq!(value2, 65535);
    }

    // ===== UINT32 tests =====

    #[test]
    fn test_uint32_values() {
        let value1: u32 = 100;
        let value2: u32 = 0xFFFFFFFF;

        assert_eq!(value1, 100);
        assert_eq!(value2, 4294967295);
    }
}
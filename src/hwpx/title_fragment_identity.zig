//! Stable identity for emitted fragments; source sites remain the sole text owner.
const Span = @import("character_style_paint.zig").Span;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn assign(paragraph: *const Paragraph, spans: []Span) !void {
    if (paragraph.title_fragment_owners == null) return;
    for (spans) |span| {
        if (span.tab_element != null or span.anchor_element != null) {
            for (spans) |item| if (item.canonical_fragment != null) return error.SourceBindingMismatch;
            return;
        }
    }
    for (spans, 0..) |*span, index| span.canonical_fragment = index;
}

/// 일반 run과 title run이 같은 all-or-none/순서/typed 검사를 사용합니다.
/// 반환값은 fragment 보존 표시일 뿐 source binding이나 편집 허가가 아닙니다.
pub fn validateRun(spans: []const Span) !bool {
    if (spans.len == 0) return false;
    if (spans[0].canonical_fragment == null) {
        for (spans) |span| if (span.canonical_fragment != null) return error.SourceBindingMismatch;
        return false;
    }
    var previous: ?usize = null;
    for (spans) |span| {
        if (span.tab_element != null or span.anchor_element != null) return error.SourceBindingMismatch;
        const id = span.canonical_fragment orelse return error.SourceBindingMismatch;
        if (previous) |before| if (id <= before) return error.SourceBindingMismatch;
        previous = id;
    }
    return true;
}

/// title 경로의 기존 문단 소유 조건도 그대로 유지합니다.
pub fn validate(paragraph: *const Paragraph, spans: []const Span) !void {
    if (try validateRun(spans)) {
        if (paragraph.title_fragment_owners == null) return error.SourceBindingMismatch;
    }
}

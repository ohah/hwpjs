//! 원본 순서의 텍스트 좌표 검증과 폭 없는 선언의 위치 계산입니다.
const Tree = @import("xml_part_tree.zig").Tree;
const Segment = @import("paragraph_text_positions.zig").Segment;

pub fn validate(tree: *const Tree, paragraph: usize, segments: []const Segment) !void {
    const uri = @import("document_xml.zig").paragraph_uri;
    if (paragraph >= tree.elements.len or !tree.elements[paragraph].is(uri, "p")) return error.InvalidParagraphElement;
    const owner = tree.elements[paragraph];
    var previous_end: usize = 0;
    var previous_source: usize = 0;
    for (segments, 0..) |segment, index| {
        if (segment.source_start < owner.start_tag.end or segment.source_start >= owner.end) return error.SourceBindingMismatch;
        if (segment.start_unit != previous_end or segment.end_unit < segment.start_unit or (index != 0 and segment.source_start < previous_source)) return error.InvalidTextPosition;
        previous_end = segment.end_unit;
        previous_source = segment.source_start;
    }
}

pub fn before(segments: []const Segment, source_start: usize) usize {
    var unit: usize = 0;
    for (segments) |segment| {
        if (segment.source_start >= source_start) break;
        unit = segment.end_unit;
    }
    return unit;
}

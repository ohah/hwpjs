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

/// Use after validate when callers visit declarations in actual source order.
/// Equal source positions are allowed (for example header/footer in one ctrl).
pub const Cursor = struct {
    segments: []const Segment,
    index: usize = 0,
    unit: usize = 0,
    previous_source: usize = 0,
    pub fn before(self: *Cursor, source_start: usize) !usize {
        if (source_start < self.previous_source) return error.InvalidTextPosition;
        while (self.index < self.segments.len and self.segments[self.index].source_start < source_start) : (self.index += 1)
            self.unit = self.segments[self.index].end_unit;
        self.previous_source = source_start;
        return self.unit;
    }
};

test "document text HX source metadata cursor preserves equal positions and sparse source gaps" {
    const testing = @import("std").testing;
    const segments = [_]Segment{
        .{ .kind = .text, .index = 0, .source_start = 10, .start_unit = 0, .end_unit = 3 },
        .{ .kind = .text, .index = 1, .source_start = 1000000, .start_unit = 3, .end_unit = 5 },
    };
    var cursor: Cursor = .{ .segments = &segments };
    for ([_]usize{ 0, 10, 11, 11, 999999, 1000000, 1000001, 0xfffffffe }) |source|
        try testing.expectEqual(before(&segments, source), try cursor.before(source));
    try testing.expectEqual(segments.len, cursor.index);
    try testing.expectError(error.InvalidTextPosition, cursor.before(10));
}

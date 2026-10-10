//! Preflight for source cold anchors retained on the left of a future split.
const std = @import("std");
const model = @import("../../model/document.zig");
pub fn validateTemplate(tree: @import("../body/tree.zig").Tree, source: usize) !void {
    if (source >= tree.nodes.len or tree.nodes[source].record.value != .header) return error.SourceBindingMismatch;
    var count: usize = 0;
    var index = source + 1;
    while (index < tree.nodes[source].subtree_end) {
        const node = tree.nodes[index];
        if (node.parent != source) return error.UnsupportedStructuralControl;
        if (node.record.framing.tag == 71) {
            const header = try @import("../body/control_header.zig").Header.parse(node.record.framing.payload);
            if (header.id != @import("../body/column_def.zig").control_id or node.subtree_end != index + 1) return error.UnsupportedStructuralControl;
            _ = try @import("../body/column_def.zig").Definition.parse(header.properties);
            count += 1;
        }
        index = node.subtree_end;
    }
    if (count != 1) return error.UnsupportedStructuralControl;
}
pub fn validate(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version, p: model.Paragraph, at: u32, char_count: usize) !void {
    const source = try p.originalNode();
    if (p.field_attributes != null or p.formula_results != null) return error.UnsupportedStructuralControl;
    if (p.range_tags) |ranges| if (ranges.len != 0) return error.UnsupportedRangeSemantics;
    _ = try @import("plain_text_source.zig").validate(a, raw, version, p, char_count);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, raw, version, .{});
    defer tree.deinit(a);
    if (source >= tree.nodes.len) return error.SourceBindingMismatch;
    try validateTemplate(tree, source);
    var anchors: usize = 0;
    for (p.tokens) |token| {
        if (token.kind != .control) continue;
        if (token.raw.len < 2) return error.UnsupportedStructuralControl;
        const code = std.mem.readInt(u16, token.raw[0..2], .little);
        if (token.raw.len == 2 and (code == 10 or code == 13)) continue;
        if (token.raw.len != 16 or code != 2 or std.mem.readInt(u32, token.raw[2..6], .little) != @import("../body/column_def.zig").control_id) return error.UnsupportedStructuralControl;
        const end = std.math.add(u32, token.start_unit, 8) catch return error.InvalidTextPosition;
        if (at < end) return error.UnsupportedColumnAnchorRelocation;
        anchors += 1;
    }
    if (anchors != 1) return error.SourceBindingMismatch;
    const text = try @import("plain_text_content.zig").editableTextBytes(a, p);
    defer a.free(text);
    try @import("control_boundaries.zig").validate(text, at, at);
    if (at >= text.len / 2) return error.InvalidTextPosition;
}

test "HWP5 column split scope actual declaration safe boundary and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-widths.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    const p = document.sections[0].paragraphs[1];
    try validate(a, raw, source.header.version(), p, 8, 1000);
    try std.testing.expectError(error.UnsupportedColumnAnchorRelocation, validate(a, raw, source.header.version(), p, 7, 1000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, version: @import("../version.zig").Version, paragraph: model.Paragraph) !void {
            try validate(allocator, bytes, version, paragraph, 8, 1000);
        }
    }.run, .{ raw, source.header.version(), p });
}

//! Current semantic emptiness with immutable source-shell validation.
const std = @import("std");
const model = @import("../../model/document.zig");
const Tree = @import("../body/tree.zig").Tree;

pub fn eligible(tree: Tree, template: usize, paragraph: model.Paragraph) bool {
    if (paragraph.parent_node != null or paragraph.restart_control_source != null or template >= tree.nodes.len or (paragraph.source_node orelse paragraph.header_template orelse return false) != template) return false;
    inline for (.{ "field_attributes", "formula_results", "range_tags" }) |field| {
        if (@field(paragraph, field)) |items| if (items.len != 0) return false;
    }
    if (paragraph.tokens.len != 1) return false;
    const token = paragraph.tokens[0];
    if (token.kind != .control or token.encoding != .utf16le or token.start_unit != 0 or !std.mem.eql(u8, token.raw, &.{ 13, 0 })) return false;
    const node = tree.nodes[template];
    if (node.parent != null or node.record.value != .header or node.subtree_end <= template or node.subtree_end > tree.nodes.len) return false;
    const header = node.record.value.header;
    if (header.extra.len != 0 or (header.merge_tracking orelse 0) != 0 or header.range_tag_count != 0) return false;
    var child = template + 1;
    while (child < node.subtree_end) {
        const entry = tree.nodes[child];
        if (entry.parent != template or entry.subtree_end != child + 1) return false;
        // Character runs and stale line caches do not create visible content.
        if (entry.record.framing.tag != 67 and entry.record.framing.tag != 68 and entry.record.framing.tag != 69) return false;
        child = entry.subtree_end;
    }
    return true;
}

test "HWP5 empty paragraph proof uses current tokens and rejects unknown source shells" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    var tree = try Tree.parseTextPreview(a, decoded, source.header.version(), .{});
    defer tree.deinit(a);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{decoded});
    defer document.deinit(a);
    var paragraph = document.sections[0].paragraphs[1];
    const template = paragraph.source_node.?;
    try std.testing.expect(!eligible(tree, template, paragraph));
    var end = [_]u8{ 13, 0 };
    var tokens = [_]model.Token{.{ .kind = .control, .encoding = .utf16le, .start_unit = 0, .raw = &end }};
    paragraph.tokens = &tokens;
    try std.testing.expect(eligible(tree, template, paragraph));
    end[0] = 10;
    try std.testing.expect(!eligible(tree, template, paragraph));
    end[0] = 13;
    paragraph.tokens = &.{};
    try std.testing.expect(!eligible(tree, template, paragraph));
    paragraph.tokens = &tokens;
    paragraph.restart_control_source = 0;
    try std.testing.expect(!eligible(tree, template, paragraph));
    paragraph.restart_control_source = null;
    paragraph.parent_node = 0;
    try std.testing.expect(!eligible(tree, template, paragraph));
    paragraph.parent_node = null;
    const nodes = try a.dupe(@import("../body/tree.zig").Node, tree.nodes);
    defer a.free(nodes);
    nodes[template + 1].record.framing.tag = 999;
    var unknown = tree;
    unknown.nodes = nodes;
    try std.testing.expect(!eligible(unknown, template, paragraph));
}

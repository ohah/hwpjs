const std = @import("std");
const retention = @import("click_field_retention.zig");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;

fn tamperedMarkers(a: std.mem.Allocator, bytes: []const u8, version: Version, section: *model.Section) !void {
    const paragraph = &section.paragraphs[52];
    var selected: ?usize = null;
    for (paragraph.tokens, 0..) |token, index| {
        if (token.kind == .control and token.raw.len == 16 and std.mem.readInt(u16, token.raw[0..2], .little) == 3) {
            selected = index;
            break;
        }
    }
    const index = selected orelse return error.MissingTestMarker;
    for (0..3) |mutation| {
        const original = paragraph.tokens[index].raw;
        const changed = try a.dupe(u8, original);
        defer a.free(changed);
        paragraph.tokens[index].raw = changed;
        defer paragraph.tokens[index].raw = original;
        if (mutation == 0) {
            std.mem.writeInt(u32, changed[2..6], @import("../body/control_rules.zig").id("%bmk"), .little);
        } else if (mutation == 1) {
            std.mem.writeInt(u16, changed[0..2], 4, .little);
            std.mem.writeInt(u16, changed[14..16], 4, .little);
        } else {
            std.mem.writeInt(u32, changed[2..6], @import("../body/control_rules.zig").id("zzzz"), .little);
        }
        const expected = if (mutation == 2) error.UnsupportedSectionControl else error.UnsupportedCrossParagraphField;
        try std.testing.expectError(expected, retention.read(a, bytes, version, section.*));
    }
}

fn allocationCase(a: std.mem.Allocator, bytes: []const u8, version: Version, section: model.Section) !void {
    var plan = try retention.read(a, bytes, version, section);
    defer plan.deinit(a);
    try std.testing.expectEqual(@as(usize, 29), plan.bound_headers);
    try std.testing.expect(!plan.protected_paragraphs[0]);
    try std.testing.expect(plan.protected_paragraphs[52]);
}

test "click retention scope validates actual unclosed headers and every partial allocation" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue1921/59043_regulatory_analysis.hwp", a, .limited(64 * 1024 * 1024));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer document.deinit(a);
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{ bytes, source.header.version(), document.sections[0] });
    const paragraph = &document.sections[0].paragraphs[52];
    const original_parent = paragraph.parent_node;
    paragraph.parent_node = null;
    try std.testing.expectError(error.SourceBindingMismatch, retention.read(a, bytes, source.header.version(), document.sections[0]));
    paragraph.parent_node = original_parent;
    try tamperedMarkers(a, bytes, source.header.version(), &document.sections[0]);
    try allocationCase(a, bytes, source.header.version(), document.sections[0]);
}

test "field header source lookup keeps bounds ordinal and marker identity strict" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/issue144-fields-crossing-lineseg-boundary.hwp", a, .limited(2_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    const headers = @import("field_header_source.zig");
    try std.testing.expectError(error.SourceBindingMismatch, headers.count(tree, tree.nodes.len));
    try std.testing.expectError(error.SourceBindingMismatch, headers.read(tree, tree.nodes.len, 0, 0, false));
    var checked: usize = 0;
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .header or try headers.count(tree, index) == 0) continue;
        const id = @import("../body/control_rules.zig").id("%hlk");
        const bound = try headers.read(tree, index, 0, id, false);
        try std.testing.expectEqual(@as(u10, 71), tree.nodes[bound.source_node].record.framing.tag);
        try std.testing.expect(bound.properties.command.len > 0);
        try std.testing.expectError(error.SourceBindingMismatch, headers.count(tree, bound.source_node));
        try std.testing.expectError(error.SourceBindingMismatch, headers.read(tree, index, std.math.maxInt(usize), id, false));
        try std.testing.expectError(error.FieldMarkerMismatch, headers.read(tree, index, 0, @import("../body/control_rules.zig").id("%clk"), false));
        checked += 1;
    }
    try std.testing.expect(checked > 0);
}

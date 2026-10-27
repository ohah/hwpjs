const std = @import("std");
const body = @import("../body/reader.zig");
const field = @import("../body/field_start.zig");
const tree_module = @import("../body/tree.zig");

fn wire(comptime text: []const u8) [text.len * 2]u8 {
    var bytes: [text.len * 2]u8 = @splat(0);
    for (text, 0..) |c, i| bytes[2 * i] = c;
    return bytes;
}

test "formula definition fixture AVG model survives clone recalculation save and fresh source reopen" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwp", a, .limited(32_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer source.deinit();
    const bytes = try source.decodeSection(a, 0);
    defer a.free(bytes);
    const immutable = try a.dupe(u8, bytes);
    defer a.free(immutable);
    var tree = try tree_module.Tree.parse(a, bytes, source.header.version(), .{});
    defer tree.deinit(a);
    const original = try body.ControlHeader.parse(tree.nodes[118].record.framing.payload);
    try std.testing.expectEqual(@import("../body/control_rules.zig").id("%fmu"), original.id);
    const properties = try field.Properties.parse(original.properties);
    try std.testing.expectEqualSlices(u8, &wire("=SUM(B?:E?)??%g,;;67.5"), properties.command);
    var document = try @import("../model_projection.zig").fromDecodedSections(a, source.header.version(), &.{bytes});
    defer document.deinit(a);
    const parent = tree.nodes[118].parent orelse return error.SourceBindingMismatch;
    const paragraph = for (document.sections[0].paragraphs) |*p| {
        if ((p.source_node orelse continue) == parent) break p;
    } else return error.SourceBindingMismatch;
    var expression = wire("AVG(B?:E?)");
    paragraph.formula_results = try @import("../../model/formula_result_values.zig").upsert(a, paragraph.formula_results, .{ .source_node = 118, .value = 0, .grouping = .none, .expression = &expression });
    expression[0] = 'X';
    var draft = try @import("../../model/clone.zig").section(a, document.sections[0]);
    defer draft.deinit(a);
    try std.testing.expectEqual(@as(usize, 13), try @import("formula_recalculate.zig").applyDraft(a, bytes, source.header.version(), &draft, 65536, .{}));
    const current = for (draft.paragraphs) |p| {
        if ((p.source_node orelse continue) == parent) break (try @import("../../model/formula_result_values.zig").find(p.formula_results orelse &.{}, 118)) orelse return error.SourceBindingMismatch;
    } else return error.SourceBindingMismatch;
    try std.testing.expectEqual(@as(f64, 16.875), current.value);
    try std.testing.expectEqualSlices(u8, &wire("AVG(B?:E?)"), current.expression.?);
    const saved = try @import("text_section_writer.zig").write(a, bytes, draft, source.header.version(), 32 * 1024 * 1024);
    defer a.free(saved);
    var reopened = try tree_module.Tree.parse(a, saved, source.header.version(), .{});
    defer reopened.deinit(a);
    var matches: usize = 0;
    for (reopened.nodes) |node| {
        if (node.record.framing.tag != @backingInt(body.Tag.control_header)) continue;
        const header = try body.ControlHeader.parse(node.record.framing.payload);
        if (header.id != original.id) continue;
        const actual = try field.Properties.parse(header.properties);
        if (actual.instance_id != properties.instance_id) continue;
        matches += 1;
        try std.testing.expectEqualSlices(u8, &wire("=AVG(B?:E?)??%g,;;16.875"), actual.command);
        try std.testing.expectEqual(properties.other, actual.other);
        try std.testing.expectEqual(properties.attributes | field.modified_mask, actual.attributes);
        try std.testing.expectEqualSlices(u8, properties.extra, actual.extra);
    }
    try std.testing.expectEqual(@as(usize, 1), matches);
    try std.testing.expectEqualSlices(u8, immutable, bytes);
}

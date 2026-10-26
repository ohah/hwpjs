const std = @import("std");
const policy = @import("hwp5/edit/structure_source_policy.zig");

test "field disjoint structure never treats unknown controls as immutable named fields" {
    const a = std.testing.allocator;
    var bytes: [8]u8 = @splat(0);
    std.mem.writeInt(u32, bytes[0..4], 71 | (@as(u32, 4) << 20), .little);
    std.mem.writeInt(u32, bytes[4..8], @import("hwp5/body/control_rules.zig").id("zzzz"), .little);
    try std.testing.expectError(error.UnsupportedSectionControl, policy.inspect(a, &bytes, .{ .raw = 0x05010100 }));
}

test "field disjoint structure retains bookmark source and rejects field paragraphs and allocation failures" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("hwp5/text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 1);
    defer a.free(raw);
    var document = try @import("hwp5/model_projection.zig").fromDecodedSections(a, source.header.version(), &.{raw});
    defer document.deinit(a);
    var tree = try @import("hwp5/body/tree.zig").Tree.parseTextPreview(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    try std.testing.expect(!try policy.inspect(a, raw, source.header.version()));
    try policy.validateParagraph(a, raw, source.header.version(), document.sections[0].paragraphs[1], tree);
    const spans = try @import("hwp5/edit/local_field_spans.zig").collectReadableBound(a, raw, source.header.version(), document.sections[0]);
    defer a.free(spans);
    try std.testing.expect(spans.len > 0);
    for (spans) |span| try std.testing.expectError(error.UnsupportedStructuralControl, policy.validateParagraph(a, raw, source.header.version(), document.sections[0].paragraphs[span.begin.paragraph], tree));
    for (0..16) |index| {
        var failure = std.testing.FailingAllocator.init(a, .{ .fail_index = index });
        try std.testing.expectError(error.OutOfMemory, policy.validateParagraph(failure.allocator(), raw, source.header.version(), document.sections[0].paragraphs[1], tree));
    }
}

test "field disjoint structure splits types and merges in bookmark section with atomic history" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/aift.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const session = try @import("hwp5/edit/style_preservation.zig").Session.open(a, input);
    defer session.close();
    var history = try @import("hwp5/edit/editor_history.zig").History.init(a, session, 4, 8_000_000);
    defer history.deinit();
    try std.testing.expect(try history.apply(session, .{ .split_paragraph = .{ .section = 1, .paragraph = 2, .at_unit = 1 } }));
    try std.testing.expect(try history.apply(session, .{ .splice_text = .{ .section = 1, .paragraph = 3, .start_unit = 0, .end_unit = 0, .utf8 = "구조" } }));
    try std.testing.expect(try history.apply(session, .{ .merge_paragraph = .{ .section = 1, .paragraph = 2 } }));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    for (0..3) |_| try std.testing.expect(try history.undo(session));
    const undone = try session.save(a, .{});
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, input, undone.bytes);
    for (0..3) |_| try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

const std = @import("std");
const Version = @import("../version.zig").Version;

fn allocationCase(a: std.mem.Allocator, source: []const u8, version: Version) !void {
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{source});
    defer doc.deinit(a);
    const stable = std.testing.allocator;
    const before = try @import("text_section_writer.zig").write(stable, source, doc.sections[0], version, 1024 * 1024);
    defer stable.free(before);
    @import("field_splice.zig").apply(a, source, version, &doc.sections[0], .{ .section = 0, .paragraph = 0, .start_unit = 0, .end_unit = 0, .utf8 = "보존😀" }, 65536) catch |err| {
        const after = try @import("text_section_writer.zig").write(stable, source, doc.sections[0], version, 1024 * 1024);
        defer stable.free(after);
        try std.testing.expectEqualSlices(u8, before, after);
        return err;
    };
    const saved = try @import("text_section_writer.zig").write(a, source, doc.sections[0], version, 1024 * 1024);
    defer a.free(saved);
    var reopened = try @import("../model_projection.zig").fromDecodedSections(a, version, &.{saved});
    defer reopened.deinit(a);
    const rows = try @import("revision_sign_text_retention.zig").collect(a, saved, version, reopened.sections[0]);
    defer a.free(rows);
    try std.testing.expectEqual(@as(usize, 1), rows.len);
    try std.testing.expectEqual(rows[0].span.begin, rows[0].span.end);
    try std.testing.expectEqual(@as(u32, 145), rows[0].span.begin.unit);
}

test "revision sign text retention releases every partial allocation and preserves failed drafts" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/task2070/1130000-201900011_D0150004-1-002_2017년기준 시장구조조사.hwp", a, .limited(16_000_000));
    defer a.free(input);
    var original = try @import("../text_source.zig").Source.openReadOnly(a, input);
    defer original.deinit();
    const bytes = try original.decodeSection(a, 0);
    defer a.free(bytes);
    const version = original.header.version();
    var tree = try @import("../body/tree.zig").Tree.parseTextPreview(a, bytes, version, .{});
    defer tree.deinit(a);
    var small: std.ArrayList(u8) = .empty;
    defer small.deinit(a);
    var paragraph: usize = 0;
    for (tree.nodes, 0..) |node, index| {
        if (node.record.framing.tag != 66) continue;
        defer paragraph += 1;
        if (paragraph != 8980) continue;
        const level = node.record.framing.level;
        for (tree.nodes[index..node.subtree_end]) |child| {
            const record = child.record.framing;
            try @import("../record_writer.zig").append(a, &small, record.tag, record.level - level, record.payload, 1024 * 1024);
        }
        break;
    }
    try std.testing.expect(small.items.len > 0);
    try @import("../../testing/allocation_failures.zig").check(allocationCase, .{ @as([]const u8, small.items), version });
    try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateFieldTransaction(a, small.items, version));
    try std.testing.expectError(error.UnsupportedSectionControl, @import("source_policy.zig").validateCharacterFormat(a, small.items, version));
}

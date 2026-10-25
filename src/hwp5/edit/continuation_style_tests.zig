const std = @import("std");
const t = std.testing;
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
fn draft(a: std.mem.Allocator, raw: []const u8, version: Version, original: model.Paragraph, count: usize) !void {
    var prepared = try @import("paragraph_split.zig").prepare(a, raw, version, original, 6, 0xfffffffe, count);
    defer prepared.deinit(a);
    try t.expectEqual(@as(usize, 1), prepared.right.character_runs.len);
    try t.expectEqual(@as(u32, 3), prepared.right.character_runs[0].char_shape_id);
    try t.expectEqual(original.source_node, prepared.right.header_template);
    try t.expect(prepared.right.source_node == null);
    try t.expectEqual(@as(u32, 3), original.character_runs[1].char_shape_id);
}
test "continuation HWP owned end draft full OOM preserves source and style" {
    const a = t.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(t.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    const count = session.characterShapeCount();
    var file = try @import("../text_source.zig").Source.open(a, bytes);
    defer file.deinit();
    const raw = try file.decodeSection(a, 0);
    defer a.free(raw);
    var doc = try @import("../model_projection.zig").fromDecodedSections(a, file.header.version(), &.{raw});
    defer doc.deinit(a);
    const p = &doc.sections[0].paragraphs[1];
    try @import("character_format.zig").apply(a, raw, file.header.version(), p, .{ .section = 0, .paragraph = 1, .start_unit = 3, .end_unit = 6, .char_shape_id = 3 }, count);
    var counter = t.FailingAllocator.init(a, .{});
    var no_resize: @import("../../testing/no_resize_allocator.zig").NoResize = .{ .backing = counter.allocator() };
    try draft(no_resize.allocator(), raw, file.header.version(), p.*, count);
    if (counter.alloc_index > 6000) return error.TestAllocationSweepBudgetExceeded;
    try @import("../../testing/allocation_failures.zig").check(draft, .{ raw, file.header.version(), p.*, count });
    var forged = p.*;
    forged.header_template = p.source_node;
    try t.expectError(error.SourceBindingMismatch, @import("paragraph_split.zig").prepare(a, raw, file.header.version(), forged, 6, 0xfffffffe, count));
}
test "continuation HWP CR and scalar boundaries require validated current runs" {
    const rows = [_]model.CharacterRun{ .{ .start_unit = 0, .char_shape_id = 3 }, .{ .start_unit = 3, .char_shape_id = 5 } };
    const bytes = [_]u8{ 'A', 0, 0x3d, 0xd8, 0, 0xde, 13, 0 };
    const runs = @import("character_runs.zig");
    try t.expectEqual(@as(u32, 3), try runs.continuationStyle(&rows, &bytes, 3, 6));
    try t.expectError(error.SplitSurrogatePair, runs.continuationStyle(&rows, &bytes, 2, 6));
    try t.expectError(error.InvalidTextPosition, runs.continuationStyle(&rows, &bytes, 4, 6));
    try t.expectError(error.InvalidResourceReference, runs.continuationStyle(&rows, &bytes, 3, 5));
}

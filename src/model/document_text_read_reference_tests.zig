const std = @import("std");
const refs = @import("document_text_read_reference.zig");
test "document text read generation ref rejects old ref paired with a newly fetched stamp" {
    const a = std.testing.allocator;
    var state: @import("formatting_binding.zig").State = .{};
    try state.open();
    const owner: @import("formatting_patch.zig").Owner = .{ .section = 3, .paragraph = 0xfffffffe };
    const ref = try refs.reference(a, state, null, owner, 0);
    defer a.free(ref);
    try std.testing.expectEqualDeep(owner, try refs.resolve(state, null, 0, ref));
    try std.testing.expectError(error.StaleDocumentTextReadBinding, refs.resolve(state, null, 2, ref));
    const legacy = try @import("document_text_binding.zig").reference(a, state, null, owner);
    defer a.free(legacy);
    try std.testing.expectError(error.InvalidDocumentTextReference, refs.resolve(state, null, 2, legacy));
}
test "document text read generation ref keeps lifetime History and canonical decimal checks" {
    const a = std.testing.allocator;
    var state: @import("formatting_binding.zig").State = .{};
    try state.open();
    const ref = try refs.reference(a, state, 7, .{ .section = 0, .paragraph = 0 }, std.math.maxInt(u64));
    defer a.free(ref);
    try std.testing.expectError(error.StaleDocumentTextReference, refs.resolve(state, 8, std.math.maxInt(u64), ref));
    try state.open();
    try std.testing.expectError(error.StaleDocumentTextReference, refs.resolve(state, 7, std.math.maxInt(u64), ref));
    try std.testing.expectError(error.InvalidFormattingReference, refs.resolve(state, null, 0, "d2-p2:0:0:rn:g00"));
}
fn ownedCase(a: std.mem.Allocator) !void {
    var state: @import("formatting_binding.zig").State = .{};
    try state.open();
    const ref = try refs.reference(a, state, null, .{ .section = 0, .paragraph = 9001 }, 9);
    defer a.free(ref);
    _ = try refs.resolve(state, null, 9, ref);
}
test "document text read generation ref owns intermediate allocation through OOM" {
    try @import("../testing/allocation_failures.zig").check(ownedCase, .{});
}
fn snapshotCase(a: std.mem.Allocator) !void {
    var state: @import("formatting_binding.zig").State = .{};
    try state.open();
    var snapshot = try @import("document_text_snapshot.zig").Snapshot.init(a, .hwpx, state, null, .{
        .sections = &.{.{ .section = 0, .paragraphs = 1 }},
        .paragraphs = 1,
        .created_cell_paragraphs = 0,
    });
    defer snapshot.deinit();
    try snapshot.append(0, .{ .paragraph = 0xfffffffe }, "readonly");
    const legacy = try a.dupe(u8, snapshot.rows.items[0].ref);
    defer a.free(legacy);
    try snapshot.bindReadStamp(.{ .epoch = state.epoch, .serial = 0 });
    try std.testing.expectError(error.InvalidDocumentTextReference, snapshot.rowFor(legacy));
    try std.testing.expect((try snapshot.rowFor(snapshot.rows.items[0].ref)) == &snapshot.rows.items[0]);
    try std.testing.expectError(error.StaleDocumentTextReadBinding, snapshot.bindReadStamp(.{ .epoch = state.epoch, .serial = 1 }));
}
test "document text read generation snapshot owns issued refs through OOM and refuses re-tagging" {
    try @import("../testing/allocation_failures.zig").check(snapshotCase, .{});
}

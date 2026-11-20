//! Response ownership and cleanup, independent of format adapters or I/O.
const std = @import("std");
const selection = @import("document_text_selection.zig");
const Snapshot = @import("document_text_snapshot.zig").Snapshot;
const State = @import("formatting_binding.zig").State;
fn snapshot(a: std.mem.Allocator, cell: bool) !Snapshot {
    var state: State = .{};
    try state.open();
    var result = try Snapshot.init(a, .hwpx, state, 7, .{
        .sections = &.{.{ .section = 0, .paragraphs = 1 }},
        .paragraphs = 1,
        .created_cell_paragraphs = if (cell) 1 else 0,
    });
    errdefer result.deinit();
    try result.append(0, if (cell) .{ .created_cell = .{ .identity = std.math.maxInt(u64), .row = 17, .column = 31 } } else .{ .paragraph = 999 }, "a😀z");
    return result;
}
fn request(value: *const Snapshot) selection.Request {
    return .{ .binding = value.binding, .ref = value.rows.items[0].ref, .start = 1, .end = 3, .expected = "😀" };
}
fn paragraphCase(a: std.mem.Allocator, value: *const Snapshot) !void {
    var response = try selection.paragraph(a, value, request(value), 77, "a😀z", 1, 3);
    defer response.deinit();
    // An escaped nonempty response must carry its arena allocation lists.
    try std.testing.expect(response.arena.queryCapacity() > 0);
    const encoded = try response.encode(a);
    defer a.free(encoded);
    try std.testing.expectEqualStrings("a😀z", response.before_text);
}
fn cellCase(a: std.mem.Allocator, value: *const Snapshot) !void {
    var response = try selection.cell(a, value, request(value), "a😀z");
    defer response.deinit();
    try std.testing.expectEqualStrings("18446744073709551615", response.target.created_cell.identity);
    const encoded = try response.encode(a);
    defer a.free(encoded);
    try std.testing.expectEqualStrings("a😀z", response.before_text);
}
// Diagnostic success controls retain allocation call stacks without changing
// the shared no-resize OOM sweep or any production allocator configuration.
fn traceCase(comptime callback: anytype, value: *const Snapshot) !void {
    var debug: std.heap.DebugAllocator(.{ .stack_trace_frames = 8, .safety = true }) = .{};
    const result = callback(debug.allocator(), value);
    const status = debug.deinit();
    if (status != .ok) return error.TestAllocatorLeak;
    try result;
}
test "document text selection ownership paragraph retains arena and owned strings after snapshot release" {
    const a = std.testing.allocator;
    var value = try snapshot(a, false);
    var active = true;
    defer if (active) value.deinit();
    try traceCase(paragraphCase, &value);
    const expected_ref = try a.dupe(u8, value.rows.items[0].ref);
    defer a.free(expected_ref);
    var response = try selection.paragraph(a, &value, request(&value), 77, "a😀z", 1, 3);
    defer response.deinit();
    try std.testing.expect(response.arena.queryCapacity() > 0);
    value.deinit();
    active = false;
    try std.testing.expectEqualStrings(expected_ref, response.ref);
    try std.testing.expectEqualStrings("s1", response.binding.session);
    try std.testing.expectEqualStrings("😀", response.expected);
    try std.testing.expectEqualStrings("a😀z", response.before_text);
    const bytes = try response.encode(a);
    defer a.free(bytes);
}
test "document text selection ownership cell frees both response strings and formatted identity" {
    const a = std.testing.allocator;
    var value = try snapshot(a, true);
    defer value.deinit();
    try traceCase(cellCase, &value);
}
test "document text selection ownership both result kinds retain full allocation failure sweep" {
    const a = std.testing.allocator;
    var paragraph = try snapshot(a, false);
    defer paragraph.deinit();
    var cell = try snapshot(a, true);
    defer cell.deinit();
    try @import("../testing/allocation_failures.zig").check(paragraphCase, .{@as(*const Snapshot, &paragraph)});
    try @import("../testing/allocation_failures.zig").check(cellCase, .{@as(*const Snapshot, &cell)});
}
test "document text selection ownership invalid kinds and scalar requests refuse before response allocation" {
    const a = std.testing.allocator;
    var value = try snapshot(a, false);
    defer value.deinit();
    var failing: std.testing.FailingAllocator = .init(a, .{ .fail_index = 0 });
    try std.testing.expectError(error.InvalidDocumentTextSelectionKind, selection.cell(failing.allocator(), &value, request(&value), "a😀z"));
    var split = request(&value);
    split.start = 2;
    split.expected = "x";
    try std.testing.expectError(error.SplitSurrogatePair, selection.paragraph(failing.allocator(), &value, split, 77, "a😀z", 2, 3));
    try std.testing.expect(!failing.has_induced_failure);
}

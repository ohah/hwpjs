const std = @import("std");
const a = std.testing.allocator;
const selection = @import("document_text_selection.zig");
const Snapshot = @import("document_text_snapshot.zig").Snapshot;
const State = @import("formatting_binding.zig").State;
fn ownCase(allocator: std.mem.Allocator, snapshot: *const Snapshot, request: selection.Request) !void {
    var response = try selection.paragraph(allocator, snapshot, request, 77, "a😀z", 1, 3);
    defer response.deinit();
    try std.testing.expectEqual(@as(u32, 77), response.target.paragraph.paragraph);
    const bytes = try response.encode(allocator);
    defer allocator.free(bytes);
    var parsed = try std.json.parseFromSlice(std.json.Value, allocator, bytes, .{});
    defer parsed.deinit();
    try std.testing.expectEqual(false, parsed.value.object.get("executionAuthority").?.bool);
    try std.testing.expectEqualStrings("native-current-text-observation", parsed.value.object.get("coordinateSpace").?.string);
    try std.testing.expect(parsed.value.object.get("source") == null);
}
test "document text selection owns read response and keeps observed ordinal separate from actual paragraph" {
    var state: State = .{};
    try state.open();
    var snapshot = try Snapshot.init(a, .hwpx, state, null, .{
        .sections = &.{.{ .section = 0, .paragraphs = 1 }},
        .paragraphs = 1,
        .created_cell_paragraphs = 0,
    });
    defer snapshot.deinit();
    try snapshot.append(0, .{ .paragraph = 999 }, "a😀z");
    const request: selection.Request = .{ .binding = snapshot.binding, .ref = snapshot.rows.items[0].ref, .start = 1, .end = 3, .expected = "😀" };
    try ownCase(a, &snapshot, request);
    try @import("../testing/allocation_failures.zig").check(ownCase, .{ @as(*const Snapshot, &snapshot), request });
    try std.testing.expectError(error.StaleDocumentTextReference, @import("document_replace_all.zig").prepare(a, &snapshot, .{
        .binding = snapshot.binding,
        .query = "😀",
        .replacement = "x",
    }));
}
test "document text selection rejects stale read refs expected text split scalars and sparse endpoints" {
    var state: State = .{};
    try state.open();
    var snapshot = try Snapshot.init(a, .hwp5, state, 7, .{
        .sections = &.{.{ .section = 0, .paragraphs = 1 }},
        .paragraphs = 1,
        .created_cell_paragraphs = 0,
    });
    defer snapshot.deinit();
    try snapshot.append(0, .{ .paragraph = 9 }, "a😀z");
    var request: selection.Request = .{ .binding = snapshot.binding, .ref = snapshot.rows.items[0].ref, .start = 1, .end = 3, .expected = "😀" };
    request.binding.revision = 8;
    try std.testing.expectError(error.StaleDocumentTextReference, selection.resolve(&snapshot, request));
    request.binding = snapshot.binding;
    request.expected = "ab";
    try std.testing.expectError(error.ExpectedTextMismatch, selection.resolve(&snapshot, request));
    request.start = 2;
    request.end = 3;
    request.expected = "x";
    try std.testing.expectError(error.SplitSurrogatePair, selection.resolve(&snapshot, request));
    request.start = std.math.maxInt(u32) - 1;
    request.end = std.math.maxInt(u32);
    try std.testing.expectError(error.InvalidTextPosition, selection.resolve(&snapshot, request));
    request.start = 1;
    request.end = 3;
    request.expected = "😀";
    var next = state;
    try next.open();
    const foreign = try @import("document_text_binding.zig").reference(a, next, 7, .{ .section = 0, .paragraph = 0 });
    defer a.free(foreign);
    request.ref = foreign;
    try std.testing.expectError(error.StaleDocumentTextReference, selection.resolve(&snapshot, request));
}
test "document text selection cell identity remains lossless and cannot become a paragraph target" {
    var state: State = .{};
    try state.open();
    var snapshot = try Snapshot.init(a, .hwpx, state, 7, .{
        .sections = &.{.{ .section = 0, .paragraphs = 1 }},
        .paragraphs = 1,
        .created_cell_paragraphs = 1,
    });
    defer snapshot.deinit();
    try snapshot.append(0, .{ .created_cell = .{ .identity = std.math.maxInt(u64), .row = 17, .column = 31 } }, "needle");
    const request: selection.Request = .{ .binding = snapshot.binding, .ref = snapshot.rows.items[0].ref, .start = 0, .end = 6, .expected = "needle" };
    var response = try selection.cell(a, &snapshot, request, "needle");
    defer response.deinit();
    try std.testing.expectEqualStrings("18446744073709551615", response.target.created_cell.identity);
    try std.testing.expectError(error.InvalidDocumentTextSelectionKind, selection.paragraph(a, &snapshot, request, 0, "needle", 0, 6));
    try std.testing.expectError(error.SourceBindingMismatch, selection.cell(a, &snapshot, request, "other"));
}

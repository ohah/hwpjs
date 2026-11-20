const std = @import("std");
const anchor = @import("document_text_anchor.zig");
const Snapshot = @import("document_text_snapshot.zig").Snapshot;
fn make(a: std.mem.Allocator) !Snapshot {
    var lifetime: @import("formatting_binding.zig").State = .{};
    try lifetime.open();
    var value = try Snapshot.init(a, .hwpx, lifetime, null, .{
        .sections = &.{.{ .section = 0, .paragraphs = 2 }},
        .paragraphs = 2,
        .created_cell_paragraphs = 1,
    });
    errdefer value.deinit();
    try value.append(0, .{ .paragraph = 0xfffffffe }, "a😀z");
    try value.append(0, .{ .created_cell = .{ .identity = std.math.maxInt(u64), .row = 17, .column = 31 } }, "cell");
    return value;
}
fn request(value: *const Snapshot) anchor.Request {
    return .{ .binding = value.binding, .section = 0, .target = .{ .paragraph = .{ .paragraph = 41 } }, .unit = 3, .before_text = "a😀z" };
}
test "document text anchor sparse source and typed pending owners resolve without paragraph zero inference" {
    const a = std.testing.allocator;
    var value = try make(a);
    defer value.deinit();
    try value.validateComplete();
    const row = try value.rowForSource(0, .{ .paragraph = 0xfffffffe });
    try std.testing.expectEqual(@as(u32, 0), row.ordinal);
    const cell = try value.rowForSource(0, .{ .created_cell = .{ .identity = std.math.maxInt(u64), .row = 17, .column = 31 } });
    try std.testing.expectEqual(@as(u32, 1), cell.ordinal);
    var response = try anchor.respond(a, &value, request(&value), row, "a😀z", 3);
    defer response.deinit();
    try std.testing.expectEqualStrings(row.ref, response.ref);
    try std.testing.expectEqual(@as(u32, 3), response.unit);
    try std.testing.expect(response.binding.revision == null);
}
test "document text anchor rejects foreign snapshot row and scalar or full source mismatches" {
    const a = std.testing.allocator;
    var value = try make(a);
    defer value.deinit();
    var other = try make(a);
    defer other.deinit();
    try std.testing.expectError(error.SourceBindingMismatch, anchor.respond(a, &value, request(&value), &other.rows.items[0], "a😀z", 3));
    try std.testing.expectError(error.SourceBindingMismatch, anchor.respond(a, &value, request(&value), &value.rows.items[0], "stale", 3));
    var bad = request(&value);
    bad.unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, anchor.validate(&value, bad));
}
fn ownershipCase(a: std.mem.Allocator) !void {
    var value = try make(a);
    var active = true;
    defer if (active) value.deinit();
    var response = try anchor.respond(a, &value, request(&value), &value.rows.items[0], "a😀z", 3);
    defer response.deinit();
    value.deinit();
    active = false;
    try std.testing.expect(response.arena.queryCapacity() > 0);
    const encoded = try response.encode(a);
    defer a.free(encoded);
    try std.testing.expectEqualStrings("s1", response.binding.session);
}
test "document text anchor escaped response owns its arena through every allocation failure" {
    try @import("../testing/allocation_failures.zig").check(ownershipCase, .{});
}

const std = @import("std");
const t = std.testing;
const namespaces = @import("namespaces.zig");
const tags = @import("tags.zig");
fn readTag(source: []const u8) !tags.Tag {
    var input = try @import("input.zig").Input.init(source, .utf8, .{});
    return tags.parse(t.allocator, &input, .{});
}
fn wideSource(comptime duplicate: bool) []const u8 {
    comptime {
        @setEvalBranchQuota(100000);
        var source: []const u8 = if (duplicate) "<r xmlns:p='urn:a' xmlns:q='urn:a'" else "<r";
        for (0..64) |index| source = source ++ std.fmt.comptimePrint(" a{d}='v'", .{index});
        return source ++ (if (duplicate) " p:duplicate='1' q:duplicate='2'/>" else "/>");
    }
}
test "XML namespace transient duplicate set needs no backing allocation for small attributes" {
    var tag = try readTag("<r a='1' b='2' c='3' d='4' e='5' f='6' g='7' h='8'/>");
    defer tag.deinit(t.allocator);
    var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    var scope: namespaces.State = .{};
    defer scope.deinit(failing.allocator());
    try t.expectEqual(@as(usize, 0), try scope.enter(failing.allocator(), tag, .{}));
    try t.expectEqual(@as(usize, 0), failing.allocations);
    try t.expect(!failing.has_induced_failure);
}

fn wideCase(a: std.mem.Allocator, tag: tags.Tag, duplicate: bool) !void {
    var scope: namespaces.State = .{};
    defer scope.deinit(a);
    _ = scope.enter(a, tag, .{}) catch |err| {
        try t.expectEqual(@as(usize, 0), scope.bindings.items.len);
        try t.expectEqual(@as(usize, 0), scope.current.count());
        try t.expectEqual(@as(usize, 0), scope.uri_bytes);
        if (duplicate and err == error.DuplicateXmlExpandedAttribute) return;
        return err;
    };
    if (duplicate) return error.ExpectedDuplicateRejection;
}
test "XML namespace transient duplicate set falls back and rolls back after late errors" {
    var wide = try readTag(comptime wideSource(false));
    defer wide.deinit(t.allocator);
    var duplicate = try readTag(comptime wideSource(true));
    defer duplicate.deinit(t.allocator);
    var counted = t.FailingAllocator.init(t.allocator, .{});
    try wideCase(counted.allocator(), wide, false);
    try t.expect(counted.allocations > 0);
    try t.expectEqual(counted.allocated_bytes, counted.freed_bytes);
    try t.checkAllAllocationFailures(t.allocator, wideCase, .{ wide, false });
    try t.checkAllAllocationFailures(t.allocator, wideCase, .{ duplicate, true });
}
test "XML namespace transient duplicate set resets between sibling elements" {
    const doc = @import("document.zig");
    const options: doc.Options = .{ .validate_namespaces = true };
    var baseline = t.FailingAllocator.init(t.allocator, .{});
    _ = try doc.inspect(baseline.allocator(), "<r></r>", options);
    var counted = t.FailingAllocator.init(t.allocator, .{});
    const report = try doc.inspect(counted.allocator(), "<r>" ++ @import("../testing/repeated_bytes.zig").repeat("<e a='1' b='2' c='3' d='4' e='5' f='6' g='7' h='8'/>", 512) ++ "</r>", options);
    try t.expectEqual(@as(usize, 4096), report.attributes);
    try t.expectEqual(baseline.allocations, counted.allocations);
    try t.expectEqual(counted.allocated_bytes, counted.freed_bytes);
}

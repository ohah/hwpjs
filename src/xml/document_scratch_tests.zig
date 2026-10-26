const std = @import("std");
const t = std.testing;
const doc = @import("document.zig");
const tags = @import("tags.zig");
const namespaces = @import("namespaces.zig");

fn wideSource() []const u8 {
    comptime {
        @setEvalBranchQuota(100000);
        var source: []const u8 = "<r";
        for (0..64) |i| source = source ++ std.fmt.comptimePrint(" a{d}='v'", .{i});
        return source ++ "/>";
    }
}

test "XML document transient small attributes require no backing allocation" {
    var failing = t.FailingAllocator.init(t.allocator, .{ .fail_index = 0 });
    const report = try doc.inspect(failing.allocator(), "<r a='1' b='2' c='3' d='4' e='5' f='6' g='7' h='8'/>", .{});
    try t.expectEqual(@as(usize, 8), report.attributes);
    try t.expectEqual(@as(usize, 0), failing.allocations);
    try t.expect(!failing.has_induced_failure);
}

fn wideCase(a: std.mem.Allocator, late_error: bool) !void {
    const source = comptime wideSource();
    if (late_error) {
        _ = doc.inspect(a, source ++ "<other/>", .{}) catch |err| {
            if (err == error.MultipleXmlRoots) return;
            return err;
        };
        return error.ExpectedRejection;
    } else {
        const report = try doc.inspect(a, source, .{});
        try t.expectEqual(@as(usize, 64), report.attributes);
    }
}

test "XML document transient wide attributes retain heap fallback and cleanup" {
    var counting = t.FailingAllocator.init(t.allocator, .{});
    try wideCase(counting.allocator(), false);
    try t.expect(counting.allocations > 0);
    try t.expectEqual(counting.allocated_bytes, counting.freed_bytes);
    try @import("../testing/allocation_failures.zig").check(wideCase, .{false});
    try @import("../testing/allocation_failures.zig").check(wideCase, .{true});
}

test "XML document transient scratch resets between sibling events" {
    var baseline = t.FailingAllocator.init(t.allocator, .{});
    _ = try doc.inspect(baseline.allocator(), "<r></r>", .{});
    var counting = t.FailingAllocator.init(t.allocator, .{});
    const report = try doc.inspect(counting.allocator(), "<r>" ++ @import("../testing/repeated_bytes.zig").repeat("<e a='v'/>", 512) ++ "</r>", .{});
    try t.expectEqual(@as(usize, 512), report.attributes);
    try t.expectEqual(baseline.allocations, counting.allocations);
    try t.expectEqual(counting.allocated_bytes, counting.freed_bytes);
}

fn callbackFailure(a: std.mem.Allocator) !void {
    const Visitor = struct {
        fn onTag(context: *anyopaque, tag: tags.Tag, _: *const namespaces.State, depth: usize) !void {
            const count: *usize = @ptrCast(@alignCast(context));
            count.* += 1;
            try t.expectEqual(@as(usize, 1), depth);
            try t.expectEqual(@as(usize, 64), tag.attributes.len);
            try t.expectEqualStrings("a63", tag.attributes[63].name.raw);
            return error.InjectedVisitorFailure;
        }
    };
    var count: usize = 0;
    _ = doc.visit(a, comptime wideSource(), .{}, .{ .context = &count, .on_tag = Visitor.onTag }) catch |err| {
        if (err == error.InjectedVisitorFailure) {
            try t.expectEqual(@as(usize, 1), count);
            return;
        }
        return err;
    };
    return error.ExpectedRejection;
}

test "XML document transient heap fallback releases on visitor failure" {
    try t.checkAllAllocationFailures(t.allocator, callbackFailure, .{});
}

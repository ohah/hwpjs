//! Actual formula snapshot ownership and allocator-failure regressions.
const std = @import("std");
const editor = @import("editor_session.zig");
const snapshot = @import("character_style_snapshot.zig");

test "HWPX unchanged formula snapshot retains table anchor styles after reopen" {
    const a = std.testing.allocator;
    const fixture = @import("test_formula_fixture.zig");
    const nested = "<p:tbl rowCnt='1' colCnt='1'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:subList><p:p><p:run><p:t/></p:run></p:p></p:subList></p:tc></p:tr></p:tbl>";
    const xml = try std.mem.replaceOwned(u8, a, fixture.section, "<p:ctrl><p:fieldBegin", nested ++ "<p:ctrl><p:fieldBegin");
    defer a.free(xml);
    const bytes = try fixture.zipWithSection(a, xml);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const ranges = try snapshot.read(&session, 0, 2);
    defer a.free(ranges);
    try std.testing.expectEqual(@as(usize, 2), ranges[ranges.len - 1].end_unit);
    try std.testing.expectEqual(@as(usize, 0), ranges[0].start_unit);
    var anchor_range = false;
    for (ranges) |range| {
        if (range.start_unit == 0 and range.end_unit == 1) anchor_range = true;
    }
    try std.testing.expect(anchor_range);
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const again = try snapshot.read(&reopened, 0, 2);
    defer a.free(again);
    try std.testing.expectEqualDeep(ranges, again);
    try @import("../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, original: *const editor.Session, expected: []const @import("character_style_display_ranges.zig").Range) !void {
            // Borrow the immutable session; only the detached query allocates.
            var view = original.*;
            view.allocator = allocator;
            const current = try snapshot.read(&view, 0, 2);
            defer allocator.free(current);
            try std.testing.expectEqualDeep(expected, current);
        }
    }.run, .{ &reopened, ranges });
    const unchanged = try reopened.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
}

test "HWPX formula snapshot allocation failures preserve current split styles and ZIP" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const ids = try @import("character_style_resources.zig").ids(&session);
    defer a.free(ids);
    try std.testing.expect(try session.setCharacterFormat(0, 24, 0, 2, ids[ids.len - 1]));
    try std.testing.expect(try session.splice(0, 20, 0, 4, "100"));
    const saved = try session.save();
    defer a.free(saved);
    const before = try snapshot.read(&session, 0, 24);
    defer a.free(before);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session, expected: []const @import("character_style_display_ranges.zig").Range) !void {
            var borrowed = source.*;
            borrowed.allocator = allocator;
            const ranges = try snapshot.read(&borrowed, 0, 24);
            defer allocator.free(ranges);
            try std.testing.expectEqualDeep(expected, ranges);
        }
    };
    // Keep exhaustive failure injection and DebugAllocator ownership/leak
    // checks, but avoid collecting ten stack frames for every repeated
    // short-lived allocation. Use page_allocator rather than an allocator
    // that retains released aligned buckets across failure-injection runs.
    var verification_allocator: std.heap.DebugAllocator(.{
        .stack_trace_frames = 0,
        .resize_stack_traces = false,
        .backing_allocator_zeroes = false,
    }) = .{ .backing_allocator = std.heap.page_allocator };
    defer std.testing.expect(verification_allocator.deinit() == .ok) catch @panic("snapshot verification leaked memory");
    try std.testing.checkAllAllocationFailures(verification_allocator.allocator(), Probe.run, .{ &session, before });
    const after = try snapshot.read(&session, 0, 24);
    defer a.free(after);
    try std.testing.expectEqualDeep(before, after);
    try std.testing.expectEqual(@as(usize, 5), after[after.len - 1].end_unit);
    const unchanged = try session.save();
    defer a.free(unchanged);
    try std.testing.expectEqualSlices(u8, saved, unchanged);
}

const std = @import("std");
const t = std.testing;
const p = @import("profile_inspection.zig");
const f = @import("profile_fixture.zig");
const icc = @import("../icc/tag_fixture.zig");
fn successful(a: std.mem.Allocator) !void {
    const data = try icc.make(a, 156, &.{.{ .signature = "text".*, .offset = 144, .size = 12 }});
    defer a.free(data);
    const raw = try f.make(a, 0x4d424544, data, 3, 5);
    defer a.free(raw);
    var result = (try p.inspect(a, raw, .{ .layout = .icc_2022 })).?;
    defer result.deinit(a);
    try t.expectEqualSlices(u8, data, result.transport.data);
    try t.expectEqualSlices(u8, "data", result.table.tags[0].data[0..4]);
    try t.expectEqual(.not_calculated, result.id_status);
    try t.expect(result.required == null and result.payloads == null and result.semantics_deferred);
    try t.expectEqual(@intFromPtr(raw.ptr) + 157, @intFromPtr(result.transport.data.ptr));
}
test "BMP profile ICC uses existing table and ID with borrowed input and owned descriptors" {
    try successful(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, successful, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try successful(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}
test "BMP profile ICC distinguishes inactive linked empty and extent mismatch" {
    const plain = @import("test_fixture.zig").plain;
    try t.expect((try p.inspect(t.allocator, &plain, .{ .layout = .bounded })) == null);
    const link = try f.make(t.allocator, 0x4c494e4b, "C:\\colour.icc\x00", 0, 0);
    defer t.allocator.free(link);
    try t.expectError(error.UnsupportedBmpLinkedProfile, p.inspect(t.allocator, link, .{ .layout = .bounded }));
    const empty = try f.make(t.allocator, 0x4d424544, &.{}, 0, 0);
    defer t.allocator.free(empty);
    try t.expectError(error.InvalidIccProfileSize, p.inspect(t.allocator, empty, .{ .layout = .bounded }));
    const data = try icc.make(t.allocator, 156, &.{.{ .signature = "text".*, .offset = 144, .size = 12 }});
    defer t.allocator.free(data);
    const raw = try f.make(t.allocator, 0x4d424544, data, 0, 1);
    defer t.allocator.free(raw);
    f.put(raw, 130, u32, 157);
    try t.expectError(error.InvalidIccProfileSize, p.inspect(t.allocator, raw, .{ .layout = .bounded }));
    f.put(raw, 130, u32, 156);
    try t.expectError(error.LimitExceeded, p.inspect(t.allocator, raw, .{ .layout = .bounded, .max_tags = 0 }));
}
fn invalidId(a: std.mem.Allocator) !void {
    const data = try icc.make(a, 156, &.{.{ .signature = "text".*, .offset = 144, .size = 12 }});
    defer a.free(data);
    data[84] = 1;
    const raw = try f.make(a, 0x4d424544, data, 0, 0);
    defer a.free(raw);
    var result = p.inspect(a, raw, .{ .layout = .icc_2022 }) catch |err| switch (err) {
        error.InvalidIccProfileId => return,
        else => return err,
    };
    if (result) |*value| value.deinit(a);
    return error.UnexpectedProfileSuccess;
}
test "BMP profile ICC ID failure releases descriptors also in ReleaseFast" {
    try invalidId(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, invalidId, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try invalidId(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "BMP profile ICC keeps layout selection and verified v4 ID independent" {
    const data = try icc.make(t.allocator, 160, &.{.{ .signature = "text".*, .offset = 148, .size = 12 }});
    defer t.allocator.free(data);
    data[84..100].* = try @import("../icc/profile_id.zig").calculate(data, data.len);
    const raw = try f.make(t.allocator, 0x4d424544, data, 0, 0);
    defer t.allocator.free(raw);
    var bounded = (try p.inspect(t.allocator, raw, .{ .layout = .bounded })).?;
    defer bounded.deinit(t.allocator);
    try t.expectEqual(.verified, bounded.id_status);
    try t.expectEqual(@as(usize, 4), bounded.table.storage.unreferenced_bytes);
    try t.expect(!bounded.table.storage.layout_validated);
    try t.expectError(error.InvalidIccTagGap, p.inspect(t.allocator, raw, .{ .layout = .icc_2022 }));
}

fn selected(a: std.mem.Allocator) !void {
    const data = try icc.make(a, 156, &.{.{ .signature = "text".*, .offset = 144, .size = 12 }});
    defer a.free(data);
    data[12..16].* = "mntr".*;
    data[16..20].* = "RGB ".*;
    data[20..24].* = "XYZ ".*;
    const raw = try f.make(a, 0x4d424544, data, 0, 0);
    defer a.free(raw);
    var options: p.Options = .{ .layout = .icc_2022, .required = .{ .edition = .v4_2022, .model = .matrix, .measurement_white = .unknown }, .payloads = .{ .edition = .v4_2022 } };
    var result = (try p.inspect(a, raw, options)).?;
    defer result.deinit(a);
    try t.expect(result.required != null);
    try t.expectEqual(@as(usize, 9), result.required.?.missing.count());
    try t.expect(result.required.?.adaptation_condition_deferred);
    try t.expectEqual(@as(usize, 1), result.payloads.?.tags);
    try t.expectEqual(@as(usize, 1), result.payloads.?.unhandled);
    try t.expectEqual(@as(usize, 12), result.payloads.?.payload_bytes);
    options.payloads.?.max_payload_bytes = 11;
    var unexpected = p.inspect(a, raw, options) catch |err| switch (err) {
        error.LimitExceeded => return,
        else => return err,
    };
    if (unexpected) |*value| value.deinit(a);
    return error.UnexpectedProfileSuccess;
}
test "BMP profile ICC forwards required and payload inspection without certifying semantics" {
    try selected(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, selected, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try selected(checked.allocator());
    try t.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

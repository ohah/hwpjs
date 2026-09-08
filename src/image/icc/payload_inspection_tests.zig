const std = @import("std");
const t = std.testing;
const api = @import("payload_inspection.zig");
const tables = @import("tag_table.zig");

fn sharedStrings(a: std.mem.Allocator) ![]u8 {
    const bytes = try @import("tag_fixture.zig").make(a, 188, &.{
        .{ .signature = "desc".*, .offset = 156, .size = 30 },
        .{ .signature = "cprt".*, .offset = 156, .size = 30 },
    });
    bytes[12..16].* = "mntr".*;
    bytes[16..20].* = "RGB ".*;
    bytes[20..24].* = "XYZ ".*;
    const data = bytes[156..186];
    data[0..4].* = "mluc".*;
    std.mem.writeInt(u32, data[8..12], 1, .big);
    std.mem.writeInt(u32, data[12..16], 12, .big);
    data[16..20].* = "enUS".*;
    std.mem.writeInt(u32, data[20..24], 2, .big);
    std.mem.writeInt(u32, data[24..28], 28, .big);
    std.mem.writeInt(u16, data[28..30], 'A', .big);
    return bytes;
}

fn inspectShared(a: std.mem.Allocator) !void {
    const bytes = try sharedStrings(a);
    defer a.free(bytes);
    var table = try tables.parse(a, bytes, .{ .policy = .bounded });
    defer table.deinit(a);
    const report = try api.inspect(a, &table, .{ .edition = .v4_2022, .max_payload_bytes = 60, .max_localized_records = 2, .max_unicode_bytes = 4 });
    try t.expectEqual(@as(usize, 2), report.tags);
    try t.expectEqual(@as(usize, 2), report.localized);
    try t.expectEqual(@as(usize, 2), report.localized_records);
    try t.expectEqual(@as(usize, 4), report.unicode_bytes);
    try t.expectEqual(@as(usize, 60), report.payload_bytes);
    try t.expect(report.semantics_deferred);
}

test "ICC aggregate shared payload work budgets and allocation failures" {
    try inspectShared(t.allocator);
    try t.checkAllAllocationFailures(t.allocator, inspectShared, .{});
    const bytes = try sharedStrings(t.allocator);
    defer t.allocator.free(bytes);
    var table = try tables.parse(t.allocator, bytes, .{ .policy = .bounded });
    defer table.deinit(t.allocator);
    for ([_]api.Options{
        .{ .edition = .v4_2022, .max_payload_bytes = 59 },
        .{ .edition = .v4_2022, .max_localized_records = 1 },
        .{ .edition = .v4_2022, .max_unicode_bytes = 3 },
    }) |options| try t.expectError(error.LimitExceeded, api.inspect(t.allocator, &table, options));
    table.header.version.major = 2;
    try t.expectError(error.IccEditionMismatch, api.inspect(t.allocator, &table, .{ .edition = .v4_2022 }));
    try t.expectError(error.InvalidIccDescriptionType, api.inspect(t.allocator, &table, .{ .edition = .v2_2001 }));
}

test "ICC aggregate propagates malformed Unicode and known payload errors" {
    const bytes = try sharedStrings(t.allocator);
    defer t.allocator.free(bytes);
    var table = try tables.parse(t.allocator, bytes, .{ .policy = .bounded });
    defer table.deinit(t.allocator);
    std.mem.writeInt(u16, bytes[184..186], 0xdc00, .big);
    try t.expectError(error.InvalidUnicodeEncoding, api.inspect(t.allocator, &table, .{ .edition = .v4_2022 }));
    bytes[156..160].* = "data".*;
    try t.expectError(error.InvalidIccMlucType, api.inspect(t.allocator, &table, .{ .edition = .v4_2022 }));
}

test "ICC aggregate applies XYZ context and distinguishes unhandled tags" {
    const bytes = try @import("tag_fixture.zig").make(t.allocator, 188, &.{
        .{ .signature = "wtpt".*, .offset = 156, .size = 20 },
        .{ .signature = "rTRC".*, .offset = 176, .size = 12 },
    });
    defer t.allocator.free(bytes);
    bytes[12..16].* = "mntr".*;
    bytes[16..20].* = "RGB ".*;
    bytes[20..24].* = "XYZ ".*;
    bytes[156..160].* = "XYZ ".*;
    for ([_]i32{ 63190, 65536, 54061 }, 0..) |value, i| std.mem.writeInt(i32, bytes[164 + i * 4 ..][0..4], value, .big);
    bytes[176..180].* = "curv".*;
    var table = try tables.parse(t.allocator, bytes, .{ .policy = .bounded });
    defer table.deinit(t.allocator);
    const report = try api.inspect(t.allocator, &table, .{ .edition = .v4_2022 });
    try t.expectEqual(@as(usize, 1), report.xyz);
    try t.expectEqual(@as(usize, 1), report.trc);
    try t.expectEqual(@as(usize, 0), report.xyz_context_deferred);
    std.mem.writeInt(i32, bytes[164..168], -65536, .big);
    try t.expectError(error.InvalidIccIlluminant, api.inspect(t.allocator, &table, .{ .edition = .v4_2022 }));
    table.tags[0].signature = "rXYZ".*;
    table.tags[1].signature = "A2B0".*;
    const deferred = try api.inspect(t.allocator, &table, .{ .edition = .v4_2022 });
    try t.expectEqual(@as(usize, 1), deferred.xyz_context_deferred);
    try t.expectEqual(@as(usize, 1), deferred.unhandled);
    try t.expectEqual(@as(usize, 0), deferred.trc);
    try t.expect(deferred.semantics_deferred);
}

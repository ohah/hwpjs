const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const container = @import("validation.zig");
const fixture = @import("image_fixture.zig");

const document_options: container.Options = .{ .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };

fn image() [130]u8 {
    var bytes = [_]u8{0} ** 130;
    bytes[0] = 10;
    bytes[1] = 5;
    bytes[2] = 1;
    bytes[3] = 1;
    std.mem.writeInt(u16, bytes[8..10], 8, .little);
    bytes[65] = 1;
    std.mem.writeInt(u16, bytes[66..68], 2, .little);
    bytes[128] = 0xc2;
    bytes[129] = 0xff;
    return bytes;
}

test "HWP PCX image budget selects signature or declared extension atomically" {
    const bytes = image();
    var budget: images.Budget = .{ .options = .{ .pcx = .{}, .max_total_pcx_decoded_bytes = 4 } };
    try budget.consume(t.allocator, &bytes, &.{ 'P', 0, 'C', 0, 'X', 0 });
    try budget.consume(t.allocator, &bytes, &.{ 'd', 0, 'a', 0, 't', 0 });
    try t.expectEqual(@as(usize, 2), budget.report.pcx.images);
    try t.expectEqual(@as(usize, 4), budget.report.pcx.decoded_bytes);
    try t.expectEqual(@as(usize, 4), budget.report.pcx.encoded_bytes);
    try t.expectEqual(@as(usize, 1), budget.report.pcx.extension_disagreements);
    try t.expectEqual(@as(usize, 0), budget.report.unhandled_binaries);
    const before = budget.report;
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, &bytes, &.{ 'p', 0, 'c', 0, 'x', 0 }));
    try t.expectEqualDeep(before, budget.report);
    var damaged = bytes;
    damaged[128] = 0xc3;
    var malformed: images.Budget = .{ .options = .{ .pcx = .{} } };
    try t.expectError(error.PcxRunOverrun, malformed.consume(t.allocator, &damaged, &.{ 'p', 0, 'c', 0, 'x', 0 }));
    try t.expectEqual(@as(usize, 0), malformed.report.binaries);
    damaged = bytes;
    damaged[1] = 6;
    try t.expectError(error.UnsupportedPcxVersion, malformed.consume(t.allocator, &damaged, &.{ 'd', 0, 'a', 0, 't', 0 }));
    try t.expectEqual(@as(usize, 0), malformed.report.binaries);
    var disabled: images.Budget = .{ .options = .{} };
    try disabled.consume(t.allocator, &bytes, &.{ 'p', 0, 'c', 0, 'x', 0 });
    try t.expectEqual(@as(usize, 1), disabled.report.unhandled_binaries);
    try t.expectEqual(@as(usize, 0), disabled.report.pcx.images);
}

test "HWP PCX hint does not override existing PNG byte signature" {
    const png = try @import("../../image/png/pixels_fixture.zig").image(t.allocator, 0);
    defer t.allocator.free(png);
    var budget: images.Budget = .{ .options = .{ .pcx = .{} } };
    try budget.consume(t.allocator, png, &.{ 'P', 0, 'C', 0, 'X', 0 });
    try t.expectEqual(@as(usize, 1), budget.report.png_images);
    try t.expectEqual(@as(usize, 0), budget.report.pcx.images);
    try t.expectEqual(@as(usize, 1), budget.report.png_extension_disagreements);
}

test "HWP PCX image budget enforces exact per-item and aggregate limits" {
    const bytes = image();
    var per_item: images.Budget = .{ .options = .{ .pcx = .{ .max_decoded_bytes = 1 } } };
    try t.expectError(error.LimitExceeded, per_item.consume(t.allocator, &bytes, &.{ 'p', 0, 'c', 0, 'x', 0 }));
    try t.expectEqual(@as(usize, 0), per_item.report.binaries);
    var aggregate: images.Budget = .{ .options = .{ .pcx = .{}, .max_total_pcx_decoded_bytes = 3 } };
    try aggregate.consume(t.allocator, &bytes, null);
    const before = aggregate.report;
    try t.expectError(error.LimitExceeded, aggregate.consume(t.allocator, &bytes, null));
    try t.expectEqualDeep(before, aggregate.report);
    var rejected: images.Budget = .{ .options = .{ .pcx = .{} } };
    try t.expectError(error.TruncatedPcxHeader, rejected.consume(t.allocator, "bad", &.{ 'p', 0, 'c', 0, 'x', 0 }));
    try t.expectEqual(@as(usize, 0), rejected.report.binaries);
}

fn inspectContainer(a: std.mem.Allocator, bytes: []const u8, enabled: bool) !void {
    var options = document_options;
    if (enabled) options.images = .{ .pcx = .{}, .max_total_pcx_decoded_bytes = 4 } else options.images = .{};
    var report = try container.inspect(a, bytes, options);
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.binary_data.decoded);
    try t.expectEqual(@as(usize, 2), report.images.?.binaries);
    try t.expectEqual(@as(usize, if (enabled) 2 else 0), report.images.?.pcx.images);
    try t.expectEqual(@as(usize, if (enabled) 4 else 0), report.images.?.pcx.decoded_bytes);
    try t.expectEqual(@as(usize, if (enabled) 0 else 2), report.images.?.unhandled_binaries);
    try t.expect(report.images.?.semantics_deferred);
}

test "HWP container PCX inspection follows DocInfo and repeated BinData references" {
    const pcx = image();
    const bytes = try fixture.withExtension(t.allocator, &pcx, 2, "pcx");
    defer t.allocator.free(bytes);
    try inspectContainer(t.allocator, bytes, false);
    try inspectContainer(t.allocator, bytes, true);
    try t.checkAllAllocationFailures(t.allocator, inspectContainer, .{ bytes, true });
    var options = document_options;
    options.images = .{ .pcx = .{}, .max_total_pcx_decoded_bytes = 3 };
    try t.expectError(error.LimitExceeded, container.inspect(t.allocator, bytes, options));
    options.images = .{ .pcx = .{ .max_decoded_bytes = 1 } };
    try t.expectError(error.LimitExceeded, container.inspect(t.allocator, bytes, options));
}

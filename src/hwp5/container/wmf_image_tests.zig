const std = @import("std");
const t = std.testing;
const images = @import("images.zig");
const container = @import("validation.zig");
const fixture = @import("image_fixture.zig");
const header = @import("../../image/wmf/header.zig");

const document_options: container.Options = .{ .document = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .parameters = .{ .header_layout = .observed6, .null_layout = .observed_empty } } };

fn standard() [24]u8 {
    var bytes = [_]u8{0} ** 24;
    std.mem.writeInt(u16, bytes[0..2], 1, .little);
    std.mem.writeInt(u16, bytes[2..4], 9, .little);
    std.mem.writeInt(u16, bytes[4..6], 0x0300, .little);
    std.mem.writeInt(u32, bytes[6..10], 12, .little);
    std.mem.writeInt(u32, bytes[12..16], 3, .little);
    std.mem.writeInt(u32, bytes[18..22], 3, .little);
    return bytes;
}

fn placeable() [46]u8 {
    var bytes = [_]u8{0} ** 46;
    std.mem.writeInt(u32, bytes[0..4], 0x9ac6cdd7, .little);
    std.mem.writeInt(u16, bytes[14..16], 1440, .little);
    var checksum: u16 = 0;
    for (0..10) |i| checksum ^= std.mem.readInt(u16, bytes[i * 2 ..][0..2], .little);
    std.mem.writeInt(u16, bytes[20..22], checksum, .little);
    const meta = standard();
    @memcpy(bytes[22..], &meta);
    return bytes;
}

test "HWP WMF shared candidate clue does not claim neighboring bytes" {
    const std_wmf = standard();
    const placed = placeable();
    try t.expect(header.looksLike(&std_wmf));
    try t.expect(header.looksLike(&placed));
    try t.expect(!header.looksLike(std_wmf[0..3]));
    var near = std_wmf;
    near[2] = 8;
    try t.expect(!header.looksLike(&near));
    var wrong_placeable = placed;
    wrong_placeable[3] = 0x9b;
    try t.expect(!header.looksLike(&wrong_placeable));
}

test "HWP WMF image selection preserves strict framing and atomic budgets" {
    const bytes = standard();
    var budget: images.Budget = .{ .options = .{ .wmf = .{}, .max_total_wmf_bytes = 48 } };
    try budget.consume(t.allocator, &bytes, &.{ 'W', 0, 'M', 0, 'F', 0 });
    try budget.consume(t.allocator, &bytes, &.{ 'd', 0, 'a', 0, 't', 0 });
    try t.expectEqual(@as(usize, 2), budget.report.wmf.images);
    try t.expectEqual(@as(usize, 48), budget.report.wmf.bytes);
    try t.expectEqual(@as(usize, 2), budget.report.wmf.records);
    try t.expectEqual(@as(usize, 1), budget.report.wmf.extension_disagreements);
    const before = budget.report;
    try t.expectError(error.LimitExceeded, budget.consume(t.allocator, &bytes, null));
    try t.expectEqualDeep(before, budget.report);

    budget.options.max_total_wmf_bytes = 72;
    var wrong_size = bytes;
    std.mem.writeInt(u32, wrong_size[6..10], 11, .little);
    try t.expectError(error.InvalidWmfSize, budget.consume(t.allocator, &wrong_size, &.{ 'w', 0, 'm', 0, 'f', 0 }));
    try t.expectEqualDeep(before, budget.report);

    var disabled: images.Budget = .{ .options = .{} };
    try disabled.consume(t.allocator, &bytes, &.{ 'w', 0, 'm', 0, 'f', 0 });
    try t.expectEqual(@as(usize, 1), disabled.report.unhandled_binaries);
}

test "HWP WMF declared corruption does not fall back and placeable policy stays explicit" {
    const bytes = placeable();
    var budget: images.Budget = .{ .options = .{ .wmf = .{} } };
    try budget.consume(t.allocator, &bytes, &.{ 'w', 0, 'm', 0, 'f', 0 });
    try t.expectEqual(@as(usize, 1), budget.report.wmf.placeable_images);
    try t.expectEqual(@as(usize, 1), budget.report.wmf.records);
    const before = budget.report;
    var damaged = bytes;
    damaged[20] ^= 1;
    try t.expectError(error.InvalidWmfPlaceableChecksum, budget.consume(t.allocator, &damaged, null));
    try t.expectEqualDeep(before, budget.report);
    damaged = bytes;
    std.mem.writeInt(u32, damaged[28..32], 3, .little);
    try t.expectError(error.InvalidWmfSize, budget.consume(t.allocator, &damaged, null));
    try t.expectEqualDeep(before, budget.report);
    var observed: images.Budget = .{ .options = .{ .wmf = .{ .placeable_size_layout = .observed_payload_words } } };
    try observed.consume(t.allocator, &damaged, null);
    try t.expectEqual(@as(usize, 1), observed.report.wmf.placeable_images);
    var wrong_record = standard();
    std.mem.writeInt(u16, wrong_record[22..24], 0x0100, .little);
    try t.expectError(error.MissingWmfEof, budget.consume(t.allocator, &wrong_record, &.{ 'w', 0, 'm', 0, 'f', 0 }));
    try t.expectEqualDeep(before, budget.report);
    var extra = [_]u8{0} ** 26;
    const valid = standard();
    @memcpy(extra[0..24], &valid);
    extra[24] = 1;
    try t.expectError(error.InvalidWmfSize, budget.consume(t.allocator, &extra, &.{ 'w', 0, 'm', 0, 'f', 0 }));
    try t.expectEqualDeep(before, budget.report);
    std.mem.writeInt(u32, extra[6..10], 13, .little);
    try t.expectError(error.DataAfterWmfEof, budget.consume(t.allocator, &extra, &.{ 'w', 0, 'm', 0, 'f', 0 }));
    try t.expectEqualDeep(before, budget.report);
    extra[24] = 0;
    var trailing: images.Budget = .{ .options = .{ .wmf = .{ .records = .{ .trailing_zero_words = 1 } } } };
    try trailing.consume(t.allocator, &extra, &.{ 'w', 0, 'm', 0, 'f', 0 });
    try t.expectEqual(@as(usize, 1), trailing.report.wmf.trailing_zero_words);
    const short = standard();
    try t.expectError(error.UnexpectedEnd, budget.consume(t.allocator, short[0..4], &.{ 'w', 0, 'm', 0, 'f', 0 }));
    try t.expectEqualDeep(before, budget.report);
}

fn inspectContainer(a: std.mem.Allocator, bytes: []const u8, enabled: bool) !void {
    var options = document_options;
    options.images = if (enabled) .{ .wmf = .{}, .max_total_wmf_bytes = 48 } else .{};
    var report = try container.inspect(a, bytes, options);
    defer report.deinit(a);
    try t.expectEqual(@as(usize, 2), report.binary_data.decoded);
    try t.expectEqual(@as(usize, if (enabled) 2 else 0), report.images.?.wmf.images);
    try t.expectEqual(@as(usize, if (enabled) 48 else 0), report.images.?.wmf.bytes);
    try t.expectEqual(@as(usize, if (enabled) 0 else 2), report.images.?.unhandled_binaries);
    try t.expect(report.images.?.semantics_deferred);
}

test "HWP container WMF follows DocInfo and repeated BinData references" {
    const wmf = standard();
    const bytes = try fixture.withExtension(t.allocator, &wmf, 2, "wmf");
    defer t.allocator.free(bytes);
    try inspectContainer(t.allocator, bytes, false);
    try inspectContainer(t.allocator, bytes, true);
    try t.checkAllAllocationFailures(t.allocator, inspectContainer, .{ bytes, true });
    var options = document_options;
    options.images = .{ .wmf = .{}, .max_total_wmf_bytes = 47 };
    try t.expectError(error.LimitExceeded, container.inspect(t.allocator, bytes, options));
    options.images = .{ .wmf = .{ .max_bytes = 23 } };
    try t.expectError(error.LimitExceeded, container.inspect(t.allocator, bytes, options));
}

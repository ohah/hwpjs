const std = @import("std");
const a = std.testing.allocator;
const fixture = @import("create_test_fixture.zig");
const ids = @import("create_resource_ids.zig");
const info = @import("create_docinfo.zig");
const resources = @import("create_resources.zig");
const BinData = @import("../docinfo/bin_data.zig").BinData;

fn expectOwnedError(expected: anyerror, result: anytype) !void {
    if (result) |value| {
        var owned = value;
        defer owned.deinit(a);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(expected, @as(anyerror, err));
}

test "H5 chart create foundation ordinals differ from physical IDs including CFB Unicode aliases and orphans" {
    const records = [_]BinData{
        .{ .attributes = 0x22, .data = .{ .storage = 1 }, .extra = &.{} },
        .{ .attributes = 0x22, .data = .{ .storage = 9 }, .extra = &.{} },
    };
    const actual = try ids.plan(&records, fixture.names);
    try std.testing.expectEqual(ids.Pair{ .ole = 3, .fallback = 4 }, actual.ordinals);
    try std.testing.expectEqual(ids.Pair{ .ole = 4, .fallback = 5 }, actual.physical);
    const names = @import("../../cfb/name_order.zig");
    try std.testing.expect(names.order(try names.Name.init(fixture.names[0]), try names.Name.init("BIN0002.ole")) == .eq);
}

test "H5 chart create foundation ordinal exact boundary plus one and unknown inputs refuse" {
    try std.testing.expectEqual(ids.Pair{ .ole = 65534, .fallback = 65535 }, try ids.nextOrdinals(65533));
    try std.testing.expectError(error.LimitExceeded, ids.nextOrdinals(65534));
    const unknown = [_]BinData{.{ .attributes = 15, .data = .{ .unknown = &.{} }, .extra = &.{} }};
    try std.testing.expectError(error.UnsupportedBinDataType, ids.plan(&unknown, &.{}));
    try std.testing.expectError(error.InvalidName, ids.plan(&.{}, &.{"BIN0001/alias"}));
}

test "H5 chart create foundation links consume ordinals without inventing internal storage" {
    const link = [_]BinData{.{ .attributes = 0, .data = .{ .link = .{ .absolute_utf16 = &.{}, .relative_utf16 = &.{} } }, .extra = &.{} }};
    const plan = try ids.plan(&link, &.{});
    try std.testing.expectEqual(ids.Pair{ .ole = 2, .fallback = 3 }, plan.ordinals);
    try std.testing.expectEqual(ids.Pair{ .ole = 1, .fallback = 2 }, plan.physical);
}

test "H5 chart create foundation DocInfo preserves opaque children and exact storage image attributes" {
    const original = try fixture.docinfo(a);
    defer a.free(original);
    const before = try a.dupe(u8, original);
    defer a.free(before);
    var prepared = try info.prepare(a, original, fixture.version, fixture.names, .png, 4096);
    defer prepared.deinit(a);
    try std.testing.expectEqualSlices(u8, before, original);
    var it = @import("../record.zig").Iterator.init(prepared.bytes, .{});
    const tags = [_]u10{ 17, 18, 18, 1023, 18, 18, 1000 };
    var index: usize = 0;
    var ordinal: usize = 0;
    while (try it.next()) |record| : (index += 1) {
        try std.testing.expect(index < tags.len);
        try std.testing.expectEqual(tags[index], record.tag);
        if (index == 0) try std.testing.expectEqual(@as(i32, 4), std.mem.readInt(i32, record.payload[0..4], .little));
        if (record.tag == 1023) {
            try std.testing.expectEqual(@as(u10, 2), record.level);
            try std.testing.expectEqualStrings("CHILD-OWN", record.payload);
        }
        if (record.tag == 1000) try std.testing.expectEqualStrings("TAIL-OWN", record.payload);
        if (record.tag != 18) continue;
        ordinal += 1;
        const parsed = try BinData.parse(record.payload);
        if (ordinal <= 2) {
            try std.testing.expectEqual(@as(u16, 0x22), parsed.attributes);
            try std.testing.expectEqual(@as(u16, if (ordinal == 1) 1 else 9), parsed.data.storage);
        } else if (ordinal == 3) {
            try std.testing.expectEqual(@as(u16, 0x22), parsed.attributes);
            try std.testing.expectEqual(@as(u16, 4), parsed.data.storage);
            try std.testing.expectEqual(@as(usize, 0), parsed.extra.len);
        } else if (ordinal == 4) {
            try std.testing.expectEqual(@as(u16, 0x21), parsed.attributes);
            try std.testing.expectEqual(@as(u16, 5), parsed.data.embedding.id);
            try std.testing.expectEqualSlices(u8, info.extension(.png), parsed.data.embedding.extension_utf16);
        }
        try std.testing.expect(!try parsed.isCompressed(true));
    }
    try std.testing.expectEqual(tags.len, index);
}

test "H5 chart create foundation mismatched DocInfo count refuses without mutation" {
    const input = try fixture.docinfo(a);
    defer a.free(input);
    std.mem.writeInt(i32, input[4..8], 1, .little);
    const original = try a.dupe(u8, input);
    defer a.free(original);
    try expectOwnedError(error.ResourceCountMismatch, info.prepare(a, input, fixture.version, fixture.names, .png, 4096));
    try std.testing.expectEqualSlices(u8, original, input);
}

test "H5 chart create foundation strict fresh OLE reopens with exact XML and fallback bytes" {
    const input = try fixture.docinfo(a);
    defer a.free(input);
    var prepared = try resources.prepare(a, input, fixture.version, fixture.names, fixture.data, fixture.fallback, .{});
    defer prepared.deinit(a);
    try std.testing.expectEqualStrings("/BinData/BIN0004", prepared.ole_path);
    try std.testing.expectEqualStrings("/BinData/BIN0005.png", prepared.fallback_path);
    try std.testing.expectEqualSlices(u8, fixture.fallback, prepared.fallback);
    var file = try @import("../../ole/container.zig").open(a, prepared.ole, .observed_size_prefix, .{ .strict = true });
    defer file.deinit();
    const index = try file.findExact("/OOXMLChartContents") orelse return error.MissingChart;
    const expected = try @import("../../hwpx/chart_create_xml.zig").create(a, fixture.data);
    defer a.free(expected);
    try std.testing.expectEqualSlices(u8, expected, file.entries[index].content);
    // Independent authored literal expectations, separate from transport equality.
    for ([_][]const u8{ "<c:v>10</c:v>", "<c:v>20</c:v>", "<c:v>30</c:v>", "<c:v>One</c:v>", "<c:v>Two</c:v>", "<c:v>Three</c:v>" }) |literal|
        try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, file.entries[index].content, literal));
    try std.testing.expectEqual(@as(?usize, null), try file.findExact("/Contents"));
}

test "H5 chart create foundation retained byte cap exact and one below and empty fallback refuse" {
    const input = try fixture.docinfo(a);
    defer a.free(input);
    var base = try resources.prepare(a, input, fixture.version, fixture.names, fixture.data, fixture.fallback, .{});
    defer base.deinit(a);
    const total = base.docinfo.bytes.len + base.ole.len + base.fallback.len;
    var exact_info = try info.prepare(a, input, fixture.version, fixture.names, .png, base.docinfo.bytes.len);
    defer exact_info.deinit(a);
    try expectOwnedError(error.LimitExceeded, info.prepare(a, input, fixture.version, fixture.names, .png, base.docinfo.bytes.len - 1));
    var exact = try resources.prepare(a, input, fixture.version, fixture.names, fixture.data, fixture.fallback, .{ .max_result_bytes = total });
    defer exact.deinit(a);
    try expectOwnedError(error.LimitExceeded, resources.prepare(a, input, fixture.version, fixture.names, fixture.data, fixture.fallback, .{ .max_result_bytes = total - 1 }));
    try expectOwnedError(error.ImageByteLimitExceeded, resources.prepare(a, input, fixture.version, fixture.names, fixture.data, &.{}, .{}));
}

test "H5 chart create foundation allocation failures release every detached candidate" {
    const input = try fixture.docinfo(a);
    defer a.free(input);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var prepared = try resources.prepare(allocator, bytes, fixture.version, fixture.names, fixture.data, fixture.fallback, .{});
            defer prepared.deinit(allocator);
            try std.testing.expectEqualSlices(u8, fixture.fallback, prepared.fallback);
        }
    }.run, .{input});
}

test "H5 chart create foundation corrupt fallback CRC refuses before any candidate publication" {
    const input = try fixture.docinfo(a);
    defer a.free(input);
    const corrupt = try a.dupe(u8, fixture.fallback);
    defer a.free(corrupt);
    corrupt[29] ^= 1; // IHDR CRC, without changing the owned pixels/header.
    try expectOwnedError(error.InvalidChecksum, resources.prepare(a, input, fixture.version, fixture.names, fixture.data, corrupt, .{}));
}

const std = @import("std");
const t = std.testing;
const replace = @import("bin_data_replace.zig");
const cfb = @import("../../cfb/reader.zig");
const writer = @import("../../cfb/writer.zig");
const Header = @import("../file_header.zig").Header;
const BinData = @import("../docinfo/bin_data.zig").BinData;
const Compression = @import("../docinfo/bin_data.zig").Compression;
const fixture = @import("../document/test_fixture.zig");

fn item(compression: Compression, id: u16) BinData {
    return .{ .attributes = @as(u16, @intFromEnum(compression)) << 4, .data = .{ .storage = id }, .extra = &.{} };
}

fn make(a: std.mem.Allocator, version: u16, default_compressed: bool) ![]u8 {
    var header = fixture.header();
    fixture.put(&header, 36, u32, @intFromBool(default_compressed));
    return writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "BinData", .kind = 1, .parent = 0, .state = 23 },
        .{ .name = "BIN0001", .parent = 2, .content = "old" },
        .{ .name = "Sibling", .parent = 0, .content = "preserved" },
    }, .{ .version = version });
}

fn makeBound(a: std.mem.Allocator, compressed: bool, declared_bins: i32, declared_borders: i32) ![]u8 {
    var header = fixture.header();
    fixture.put(&header, 36, u32, @intFromBool(compressed));
    var doc: std.ArrayList(u8) = .empty;
    defer doc.deinit(a);
    var mappings = [_]u8{0} ** 60;
    fixture.put(&mappings, 0, i32, declared_bins);
    fixture.put(&mappings, 32, i32, declared_borders);
    try fixture.frame(a, &doc, 17, 0, &mappings);
    var first = [_]u8{ 0x22, 0, 7, 0 };
    var second = [_]u8{ 0x22, 0, 9, 0 };
    try fixture.frame(a, &doc, 18, 1, &first);
    try fixture.frame(a, &doc, 18, 1, &second);
    const stored_doc = if (compressed)
        try @import("../../compression/raw_deflate.zig").encodeStored(a, doc.items, 1024)
    else
        try a.dupe(u8, doc.items);
    defer a.free(stored_doc);
    return writer.write(a, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "DocInfo", .parent = 0, .content = stored_doc },
        .{ .name = "BinData", .kind = 1, .parent = 0 },
        .{ .name = "BIN0007", .parent = 3, .content = "first" },
        .{ .name = "BIN0009", .parent = 3, .content = "second" },
    }, .{ .version = 4 });
}

fn exerciseBound(a: std.mem.Allocator, compressed: bool) !void {
    const input = try makeBound(a, compressed, 2, 0);
    defer a.free(input);
    const saved = try replace.replaceDecodedAt(a, input, 2, .specified, "selected", .{ .max_doc_info_bytes = 128, .max_encoded_bytes = 64, .max_output_bytes = 64 * 1024 });
    defer a.free(saved);
    var file = try cfb.File.open(a, saved, .{ .strict = true });
    defer file.deinit();
    try t.expectEqualStrings("first", file.entries[(try file.findExact("/BinData/BIN0007")).?].content);
    try t.expectEqualStrings("selected", file.entries[(try file.findExact("/BinData/BIN0009")).?].content);
}

fn exercise(a: std.mem.Allocator, version: u16, default_compressed: bool, compression: Compression) !void {
    const input = try make(a, version, default_compressed);
    defer a.free(input);
    const decoded = [_]u8{ 0, 1, 2, 3, 255, 0, 128 };
    const saved = try replace.replaceDecoded(a, input, item(compression, 1), .specified, &decoded, .{ .max_encoded_bytes = 64, .max_output_bytes = 64 * 1024 });
    defer a.free(saved);
    var file = try cfb.File.open(a, saved, .{ .strict = true });
    defer file.deinit();
    try t.expectEqual(version, file.header.major);
    try t.expectEqualStrings("preserved", file.entries[(try file.findExact("/Sibling")).?].content);
    try t.expectEqual(@as(u32, 23), file.entries[(try file.findExact("/BinData")).?].state);
    const header = try Header.parse(file.entries[(try file.findExact("/FileHeader")).?].content);
    const stored = file.entries[(try file.findExact("/BinData/BIN0001")).?].content;
    const restored = try @import("../bin_data_stream.zig").decode(a, &header, item(compression, 1), stored, decoded.len);
    defer a.free(restored);
    try t.expectEqualSlices(u8, &decoded, restored);
}

test "outer HWP BinData replacement preserves versions and six compression policies" {
    for ([_]u16{ 3, 4 }) |version| for ([_]bool{ false, true }) |default_compressed| for ([_]Compression{ .default, .compressed, .uncompressed }) |compression| {
        try exercise(t.allocator, version, default_compressed, compression);
        try t.checkAllAllocationFailures(t.allocator, exercise, .{ version, default_compressed, compression });
    };
}

test "outer HWP BinData replacement rejects exact selection and limits" {
    const input = try make(t.allocator, 3, false);
    defer t.allocator.free(input);
    try t.expectError(error.MissingHwpEntry, replace.replaceDecoded(t.allocator, input, item(.uncompressed, 2), .specified, "x", .{}));
    try t.expectError(error.UnsupportedCompression, replace.replaceDecoded(t.allocator, input, item(.reserved, 1), .specified, "x", .{}));
    try t.expectError(error.LimitExceeded, replace.replaceDecoded(t.allocator, input, item(.compressed, 1), .specified, "x", .{ .max_encoded_bytes = 5 }));
    try t.expectError(error.LimitExceeded, replace.replaceDecoded(t.allocator, input, item(.uncompressed, 1), .specified, "x", .{ .max_output_bytes = input.len - 1 }));
    const invalid = try t.allocator.dupe(u8, input);
    defer t.allocator.free(invalid);
    invalid[8] = 1;
    try t.expectError(error.InvalidHeader, replace.replaceDecoded(t.allocator, invalid, item(.uncompressed, 1), .specified, "x", .{}));
}

test "outer HWP BinData replacement uses explicit embedding and storage extension layouts" {
    const header = fixture.header();
    const input = try writer.write(t.allocator, &.{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "FileHeader", .parent = 0, .content = &header },
        .{ .name = "BinData", .kind = 1, .parent = 0 },
        .{ .name = "BIN0001.OLE", .parent = 2, .content = "old" },
    }, .{});
    defer t.allocator.free(input);
    const extension: []const u8 = &.{ 'O', 0, 'L', 0, 'E', 0 };
    const storage: BinData = .{ .attributes = @as(u16, @intFromEnum(Compression.uncompressed)) << 4 | 2, .data = .{ .storage = 1 }, .extra = &.{ 3, 0, 'O', 0, 'L', 0, 'E', 0 } };
    const embedding: BinData = .{ .attributes = @as(u16, @intFromEnum(Compression.uncompressed)) << 4 | 1, .data = .{ .embedding = .{ .id = 1, .extension_utf16 = extension } }, .extra = &.{} };
    for ([_]struct { value: BinData, layout: @import("../docinfo/bin_data.zig").StorageLayout }{ .{ .value = storage, .layout = .observed_optional_extension }, .{ .value = embedding, .layout = .specified } }) |case| {
        const saved = try replace.replaceDecoded(t.allocator, input, case.value, case.layout, "new", .{ .max_output_bytes = 16 * 1024 });
        defer t.allocator.free(saved);
        var file = try cfb.File.open(t.allocator, saved, .{ .strict = true });
        defer file.deinit();
        try t.expectEqualStrings("new", file.entries[(try file.findExact("/BinData/BIN0001.OLE")).?].content);
    }
    try t.expectError(error.MissingHwpEntry, replace.replaceDecoded(t.allocator, input, storage, .specified, "new", .{}));
}

test "outer HWP replacement resolves the actual one-based DocInfo BinData record" {
    for ([_]bool{ false, true }) |compressed| {
        try exerciseBound(t.allocator, compressed);
        try t.checkAllAllocationFailures(t.allocator, exerciseBound, .{compressed});
    }
}

test "DocInfo-bound replacement rejects ordinal bounds budgets and hidden trailing failures" {
    const input = try makeBound(t.allocator, false, 2, 0);
    defer t.allocator.free(input);
    try t.expectError(error.InvalidBinDataOrdinal, replace.replaceDecodedAt(t.allocator, input, 0, .specified, "x", .{}));
    try t.expectError(error.BinDataNotFound, replace.replaceDecodedAt(t.allocator, input, 3, .specified, "x", .{}));
    try t.expectError(error.LimitExceeded, replace.replaceDecodedAt(t.allocator, input, 1, .specified, "x", .{ .max_doc_info_bytes = 79 }));
    try t.expectError(error.LimitExceeded, replace.replaceDecodedAt(t.allocator, input, 1, .specified, "x", .{ .framing = .{ .max_records = 2 } }));
}

test "DocInfo-bound replacement requires all declared known resource counts" {
    for ([_]struct { bins: i32, borders: i32, expected: anyerror }{
        .{ .bins = 1, .borders = 0, .expected = error.ResourceCountMismatch },
        .{ .bins = -1, .borders = 0, .expected = error.NegativeMappingCount },
        .{ .bins = 2, .borders = 1, .expected = error.ResourceCountMismatch },
    }) |case| {
        const input = try makeBound(t.allocator, false, case.bins, case.borders);
        defer t.allocator.free(input);
        try t.expectError(case.expected, replace.replaceDecodedAt(t.allocator, input, 1, .specified, "x", .{}));
    }
}

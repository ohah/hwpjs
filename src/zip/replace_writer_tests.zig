const std = @import("std");
const zip = @import("archive.zig");
const writer = @import("replace_writer.zig");
const fixture = @import("../hwpx/test_package_fixture.zig");

test "ZIP replacement writer preserves all unchanged local records and no-op source" {
    const a = std.testing.allocator;
    const input = try fixture.storedZip(a, &.{ .{ .name = "first", .data = "A" }, .{ .name = "second", .data = "unchanged" } });
    defer a.free(input);
    var before = try zip.open(a, input, .{});
    defer before.deinit();
    const output = try writer.write(a, input, &.{.{ .entry_index = 0, .bytes = "한😀 replacement" }}, .{});
    defer a.free(output);
    var after = try zip.open(a, output, .{});
    defer after.deinit();
    const value = try after.decode(after.entries[0], 1000);
    defer a.free(value);
    try std.testing.expectEqualStrings("한😀 replacement", value);
    const old = before.entries[1];
    const current = after.entries[1];
    try std.testing.expectEqualSlices(u8, input[old.local_offset..old.local_end], output[current.local_offset..current.local_end]);
    const noop = try writer.write(a, input, &.{.{ .entry_index = 0, .bytes = "A" }}, .{});
    defer a.free(noop);
    try std.testing.expectEqualSlices(u8, input, noop);
    try std.testing.expectError(error.DuplicateReplacement, writer.write(a, input, &.{ .{ .entry_index = 0, .bytes = "A" }, .{ .entry_index = 0, .bytes = "B" } }, .{}));
    try std.testing.expectError(error.InvalidEntryIndex, writer.write(a, input, &.{.{ .entry_index = 2, .bytes = "B" }}, .{}));
    try std.testing.expectError(error.LimitExceeded, writer.write(a, input, &.{.{ .entry_index = 0, .bytes = "B" }}, .{ .max_output_bytes = 1 }));
}

test "ZIP replacement writer changes actual deflated section and preserves other encoded entries" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx", a, .limited(2_000_000));
    defer a.free(input);
    var before = try zip.open(a, input, .{});
    defer before.deinit();
    var selected: ?usize = null;
    for (before.entries, 0..) |entry, i| if (std.mem.eql(u8, entry.name, "Contents/section0.xml")) {
        selected = i;
    };
    const index = selected orelse return error.MissingSection;
    try std.testing.expectEqual(@as(u16, 8), before.entries[index].method);
    const original_xml = try before.decode(before.entries[index], 2_000_000);
    defer a.free(original_xml);
    const replacement = try std.mem.concat(a, u8, &.{ original_xml, "<!--ZIP replacement 한😀-->" });
    defer a.free(replacement);
    const output = try writer.write(a, input, &.{.{ .entry_index = index, .bytes = replacement }}, .{});
    defer a.free(output);
    var after = try zip.open(a, output, .{});
    defer after.deinit();
    for (before.entries, after.entries, 0..) |old, current, i| {
        try std.testing.expectEqualStrings(old.name, current.name);
        const decoded = try after.decode(current, 2_000_000);
        defer a.free(decoded);
        if (i == index) try std.testing.expectEqualStrings(replacement, decoded) else {
            try std.testing.expectEqualSlices(u8, old.compressed, current.compressed);
            try std.testing.expectEqualSlices(u8, input[old.local_offset..old.local_end], output[current.local_offset..current.local_end]);
        }
    }
    var document = try @import("../hwpx/package.zig").inspectDocument(a, output, .{});
    defer document.deinit(a);
    var text = try document.readSectionTextSnapshot(a, .{});
    defer text.deinit();
    try std.testing.expectEqual(@as(usize, 7), text.report.paragraphs);
}

test "ZIP replacement writer updates both descriptor forms and preserves archive comment" {
    const a = std.testing.allocator;
    for ([_]usize{ 12, 16 }) |length| {
        const base = try fixture.storedZip(a, &.{ .{ .name = "first", .data = "A" }, .{ .name = "second", .data = "unchanged" } });
        defer a.free(base);
        var original = try zip.open(a, base, .{});
        defer original.deinit();
        const first_end = original.entries[0].local_end;
        const input = try a.alloc(u8, base.len + length + 3);
        defer a.free(input);
        @memcpy(input[0..first_end], base[0..first_end]);
        @memcpy(input[first_end + length ..][0 .. base.len - first_end], base[first_end..]);
        std.mem.writeInt(u16, input[6..8], 8, .little);
        @memset(input[14..26], 0);
        const prefix: usize = if (length == 16) 4 else 0;
        if (prefix != 0) std.mem.writeInt(u32, input[first_end..][0..4], 0x08074b50, .little);
        std.mem.writeInt(u32, input[first_end + prefix ..][0..4], original.entries[0].crc32, .little);
        std.mem.writeInt(u32, input[first_end + prefix + 4 ..][0..4], 1, .little);
        std.mem.writeInt(u32, input[first_end + prefix + 8 ..][0..4], 1, .little);
        std.mem.writeInt(u16, input[original.entries[0].central_offset + length + 8 ..][0..2], 8, .little);
        std.mem.writeInt(u32, input[original.entries[1].central_offset + length + 42 ..][0..4], @intCast(original.entries[1].local_offset + length), .little);
        const end_at = original.end_record_offset + length;
        std.mem.writeInt(u32, input[end_at + 16 ..][0..4], @intCast(original.central_start + length), .little);
        std.mem.writeInt(u16, input[end_at + 20 ..][0..2], 3, .little);
        @memcpy(input[input.len - 3 ..], "xyz");
        const output = try writer.write(a, input, &.{.{ .entry_index = 0, .bytes = &.{ 255, 255, 255, 255 } }}, .{});
        defer a.free(output);
        var result = try zip.open(a, output, .{});
        defer result.deinit();
        const decoded = try result.decode(result.entries[0], 100);
        defer a.free(decoded);
        try std.testing.expectEqualSlices(u8, &.{ 255, 255, 255, 255 }, decoded);
        // Independently confirmed with Node zlib.crc32: all-ones is a legal CRC,
        // not a ZIP64 size sentinel.
        try std.testing.expectEqual(@as(u32, 0xffffffff), result.entries[0].crc32);
        try std.testing.expectEqualStrings("xyz", output[output.len - 3 ..]);
        const after_data = @intFromPtr(result.entries[0].compressed.ptr) - @intFromPtr(output.ptr) + result.entries[0].compressed.len;
        try std.testing.expectEqual(length, result.entries[0].local_end - after_data);
    }
}

test "ZIP replacement writer respects central order independent of physical order" {
    const a = std.testing.allocator;
    const input = try fixture.storedZip(a, &.{ .{ .name = "first", .data = "A" }, .{ .name = "second", .data = "B" } });
    defer a.free(input);
    var original = try zip.open(a, input, .{});
    defer original.deinit();
    const central = try a.dupe(u8, input[original.central_start..original.end_record_offset]);
    defer a.free(central);
    const first_length = original.entries[0].central_end - original.entries[0].central_offset;
    const second_length = central.len - first_length;
    @memcpy(input[original.central_start..][0..second_length], central[first_length..]);
    @memcpy(input[original.central_start + second_length ..][0..first_length], central[0..first_length]);
    const output = try writer.write(a, input, &.{ .{ .entry_index = 0, .bytes = "" }, .{ .entry_index = 1, .bytes = "longer 한😀" } }, .{});
    defer a.free(output);
    var result = try zip.open(a, output, .{});
    defer result.deinit();
    try std.testing.expectEqualStrings("second", result.entries[0].name);
    try std.testing.expectEqualStrings("first", result.entries[1].name);
    try std.testing.expect(result.entries[1].local_offset < result.entries[0].local_offset);
    const empty = try result.decode(result.entries[0], 100);
    defer a.free(empty);
    try std.testing.expectEqual(@as(usize, 0), empty.len);
    const grown = try result.decode(result.entries[1], 100);
    defer a.free(grown);
    try std.testing.expectEqualStrings("longer 한😀", grown);
    const exact = try writer.write(a, input, &.{ .{ .entry_index = 0, .bytes = "" }, .{ .entry_index = 1, .bytes = "longer 한😀" } }, .{ .max_output_bytes = output.len });
    defer a.free(exact);
    try std.testing.expectEqualSlices(u8, output, exact);
    try std.testing.expectError(error.LimitExceeded, writer.write(a, input, &.{ .{ .entry_index = 0, .bytes = "" }, .{ .entry_index = 1, .bytes = "longer 한😀" } }, .{ .max_output_bytes = output.len - 1 }));
}

test "ZIP replacement writer refuses corrupt selected payload without repairing source" {
    const a = std.testing.allocator;
    const input = try fixture.storedZip(a, &.{.{ .name = "first", .data = "A" }});
    defer a.free(input);
    var archive = try zip.open(a, input, .{});
    defer archive.deinit();
    const at = @intFromPtr(archive.entries[0].compressed.ptr) - @intFromPtr(input.ptr);
    input[at] = 'B';
    const before = try a.dupe(u8, input);
    defer a.free(before);
    try std.testing.expectError(error.InvalidCrc, writer.write(a, input, &.{.{ .entry_index = 0, .bytes = "replacement" }}, .{}));
    try std.testing.expectError(error.InvalidCrc, writer.write(a, input, &.{.{ .entry_index = 0, .bytes = "B" }}, .{}));
    try std.testing.expectEqualSlices(u8, before, input);
}

test "ZIP replacement writer releases every partial output allocation" {
    const a = std.testing.allocator;
    const input = try fixture.storedZip(a, &.{ .{ .name = "first", .data = "A" }, .{ .name = "second", .data = "B" } });
    defer a.free(input);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            const output = try writer.write(allocator, bytes, &.{.{ .entry_index = 0, .bytes = "longer 한😀" }}, .{});
            defer allocator.free(output);
        }
    }.run, .{input});
}

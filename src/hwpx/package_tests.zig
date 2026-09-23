const std = @import("std");
const zip = @import("../zip/archive.zig");
const package = @import("package.zig");

fn loadFixture(a: std.mem.Allocator, name: []const u8) ![]u8 {
    const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
    defer a.free(path);
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(1_000_000));
}

fn read16(bytes: []const u8, at: usize) u16 {
    return std.mem.readInt(u16, bytes[at..][0..2], .little);
}

fn read32(bytes: []const u8, at: usize) u32 {
    return std.mem.readInt(u32, bytes[at..][0..4], .little);
}

fn write16(bytes: []u8, at: usize, value: u16) void {
    std.mem.writeInt(u16, bytes[at..][0..2], value, .little);
}

fn write32(bytes: []u8, at: usize, value: u32) void {
    std.mem.writeInt(u32, bytes[at..][0..4], value, .little);
}

test "HWPX example and noori: central index, stored and deflated XML" {
    const example = try loadFixture(std.testing.allocator, "example");
    defer std.testing.allocator.free(example);
    const noori = try loadFixture(std.testing.allocator, "noori");
    defer std.testing.allocator.free(noori);
    for ([_][]const u8{ example, noori }, [_]usize{ 11, 15 }, [_]usize{ 65_346, 825_216 }) |bytes, expected_count, expected_total| {
        var archive = try package.open(std.testing.allocator, bytes, .{});
        defer archive.deinit();
        try std.testing.expectEqual(expected_count, archive.entries.len);
        var total: usize = 0;
        for (archive.entries) |entry| {
            const decoded = try archive.decode(entry, 1_000_000);
            defer std.testing.allocator.free(decoded);
            total += decoded.len;
        }
        try std.testing.expectEqual(expected_total, total);
        const header = archive.find("Contents/header.xml") orelse return error.MissingHeader;
        const section = archive.find("Contents/section0.xml") orelse return error.MissingSection;
        try std.testing.expectEqual(@as(u16, 8), header.method);
        for ([_]zip.Entry{ header, section }) |entry| {
            const xml = try archive.decode(entry, 1_000_000);
            defer std.testing.allocator.free(xml);
            try std.testing.expectEqual(entry.uncompressed_size, xml.len);
            try std.testing.expect(std.mem.indexOf(u8, xml, "<?xml") != null);
        }
        const mime_entry = archive.find("mimetype") orelse return error.MissingMimeType;
        try std.testing.expectEqual(@as(u16, 0), mime_entry.method);
        try std.testing.expectEqualStrings(package.mime, mime_entry.compressed);
    }
}

test "HWPX envelope rejects central and local corruption" {
    const a = std.testing.allocator;
    const example = try loadFixture(a, "example");
    defer a.free(example);
    const eocd = std.mem.lastIndexOf(u8, example, "PK\x05\x06") orelse unreachable;
    const cd: usize = read32(example, eocd + 16);
    const local: usize = read32(example, cd + 42);
    const name_len: usize = read16(example, cd + 28);
    const local_data = local + 30 + read16(example, local + 26) + read16(example, local + 28);
    const mutations = [_]struct { offset: usize, value: u8, expected: anyerror }{
        .{ .offset = eocd + 4, .value = 1, .expected = error.UnsupportedMultiDisk },
        .{ .offset = eocd + 16, .value = 0xff, .expected = error.InvalidCentralDirectory },
        .{ .offset = cd, .value = 0, .expected = error.InvalidCentralDirectory },
        .{ .offset = cd + 8, .value = 1, .expected = error.UnsupportedEncryption },
        .{ .offset = cd + 10, .value = 99, .expected = error.UnsupportedCompression },
        .{ .offset = cd + 46, .value = 0, .expected = error.InvalidEntryName },
        .{ .offset = local, .value = 0, .expected = error.InvalidLocalHeader },
        .{ .offset = local + 30, .value = 0, .expected = error.LocalNameMismatch },
        .{ .offset = local_data, .value = example[local_data] ^ 1, .expected = error.InvalidCrc },
    };
    try std.testing.expect(name_len > 0);
    for (mutations) |mutation| {
        const copy = try a.dupe(u8, example);
        defer a.free(copy);
        copy[mutation.offset] = mutation.value;
        try std.testing.expectError(mutation.expected, package.open(a, copy, .{}));
        var original = try package.open(a, example, .{});
        original.deinit();
    }
}

test "HWPX limits, ZIP64 sentinel, exact EOCD and output corruption" {
    const a = std.testing.allocator;
    const example = try loadFixture(a, "example");
    defer a.free(example);
    const eocd = std.mem.lastIndexOf(u8, example, "PK\x05\x06") orelse unreachable;
    const cd: usize = read32(example, eocd + 16);
    try std.testing.expectError(error.LimitExceeded, package.open(a, example, .{ .max_entries = 10 }));
    try std.testing.expectError(error.LimitExceeded, package.open(a, example, .{ .max_entry_bytes = 1000 }));
    try std.testing.expectError(error.MissingEndRecord, package.open(a, example[0 .. example.len - 1], .{}));

    const copy = try a.dupe(u8, example);
    defer a.free(copy);
    write16(copy, eocd + 10, 0xffff);
    try std.testing.expectError(error.UnsupportedZip64, package.open(a, copy, .{}));
    write16(copy, eocd + 10, read16(example, eocd + 10));
    const local: usize = read32(example, cd + 42);
    const local_data = local + 30 + read16(example, local + 26) + read16(example, local + 28);
    copy[local_data] ^= 1;
    var archive = try zip.open(a, copy, .{});
    defer archive.deinit();
    const entry = archive.find("mimetype") orelse unreachable;
    try std.testing.expectError(error.InvalidCrc, archive.decode(entry, 100));
    const header = archive.find("Contents/header.xml") orelse unreachable;
    try std.testing.expectError(error.LimitExceeded, archive.decode(header, 10));
}

test "HWPX entry index allocation failure" {
    const example = try loadFixture(std.testing.allocator, "example");
    defer std.testing.allocator.free(example);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, bytes: []const u8) !void {
            var archive = try package.open(a, bytes, .{});
            archive.deinit();
        }
    }.run, .{example});
}

test "HWPX central, path, mimetype and CRC adversarial edits" {
    const a = std.testing.allocator;
    const example = try loadFixture(a, "example");
    defer a.free(example);
    const eocd = std.mem.lastIndexOf(u8, example, "PK\x05\x06") orelse unreachable;
    const cd: usize = read32(example, eocd + 16);
    const local: usize = read32(example, cd + 42);
    const data = local + 30 + read16(example, local + 26) + read16(example, local + 28);
    const copy = try a.dupe(u8, example);
    defer a.free(copy);

    write16(copy, eocd + 10, read16(example, eocd + 10) + 1);
    try std.testing.expectError(error.UnsupportedMultiDisk, package.open(a, copy, .{}));
    write16(copy, eocd + 10, read16(example, eocd + 10));
    write16(copy, eocd + 8, read16(example, eocd + 8) + 1);
    try std.testing.expectError(error.UnsupportedMultiDisk, package.open(a, copy, .{}));
    write16(copy, eocd + 8, read16(example, eocd + 8));

    // The local name is unchanged: central names must not authorize traversal.
    copy[cd + 46] = '.';
    copy[cd + 47] = '.';
    copy[cd + 48] = '/';
    try std.testing.expectError(error.InvalidEntryName, package.open(a, copy, .{}));
    @memcpy(copy[cd + 46 ..][0..3], example[cd + 46 ..][0..3]);

    // Coordinated central and local CRC tampering survives metadata checks,
    // but not entry decode (including on the HWPX identity entry).
    copy[cd + 16] ^= 1;
    copy[local + 14] ^= 1;
    try std.testing.expectError(error.InvalidCrc, package.open(a, copy, .{}));
    copy[cd + 16] ^= 1;
    copy[local + 14] ^= 1;

    // A valid checksum alone does not turn another media type into HWPX.
    copy[data] = 'X';
    const crc = std.hash.Crc32.hash(copy[data .. data + package.mime.len]);
    std.mem.writeInt(u32, copy[cd + 16 ..][0..4], crc, .little);
    std.mem.writeInt(u32, copy[local + 14 ..][0..4], crc, .little);
    try std.testing.expectError(error.InvalidMimeType, package.open(a, copy, .{}));
}

fn descriptorZip(a: std.mem.Allocator, signed: bool) ![]u8 {
    const name = "mimetype";
    const payload = package.mime;
    const descriptor_len: usize = if (signed) 16 else 12;
    const data = 30 + name.len;
    const descriptor = data + payload.len;
    const central = descriptor + descriptor_len;
    const end = central + 46 + name.len;
    const out = try a.alloc(u8, end + 22);
    @memset(out, 0);
    const crc = std.hash.Crc32.hash(payload);
    write32(out, 0, 0x04034b50);
    write16(out, 4, 20);
    write16(out, 6, 8);
    write16(out, 26, @intCast(name.len));
    @memcpy(out[30..data], name);
    @memcpy(out[data..descriptor], payload);
    const data_descriptor = descriptor + @as(usize, if (signed) 4 else 0);
    if (signed) write32(out, descriptor, 0x08074b50);
    write32(out, data_descriptor, crc);
    write32(out, data_descriptor + 4, @intCast(payload.len));
    write32(out, data_descriptor + 8, @intCast(payload.len));
    write32(out, central, 0x02014b50);
    write16(out, central + 4, 20);
    write16(out, central + 6, 20);
    write16(out, central + 8, 8);
    write32(out, central + 16, crc);
    write32(out, central + 20, @intCast(payload.len));
    write32(out, central + 24, @intCast(payload.len));
    write16(out, central + 28, @intCast(name.len));
    @memcpy(out[central + 46 .. end], name);
    write32(out, end, 0x06054b50);
    write16(out, end + 8, 1);
    write16(out, end + 10, 1);
    write32(out, end + 12, @intCast(end - central));
    write32(out, end + 16, @intCast(central));
    return out;
}

test "HWPX data descriptors with and without signature" {
    const a = std.testing.allocator;
    for ([_]bool{ false, true }) |signed| {
        const bytes = try descriptorZip(a, signed);
        defer a.free(bytes);
        var archive = try package.open(a, bytes, .{});
        archive.deinit();
        const descriptor = 30 + "mimetype".len + package.mime.len;
        bytes[descriptor + @as(usize, if (signed) 4 else 0)] ^= 1;
        try std.testing.expectError(error.InvalidDataDescriptor, package.open(a, bytes, .{}));
    }
}

test "HWPX unsigned descriptor CRC equal to signature is not reclassified" {
    const a = std.testing.allocator;
    for ([_]bool{ false, true }) |signed| {
        const bytes = try descriptorZip(a, signed);
        defer a.free(bytes);
        const descriptor = 30 + "mimetype".len + package.mime.len;
        const central = descriptor + @as(usize, if (signed) 16 else 12);
        write32(bytes, descriptor + @as(usize, if (signed) 4 else 0), 0x08074b50);
        write32(bytes, central + 16, 0x08074b50);
        var archive = try zip.open(a, bytes, .{});
        try std.testing.expectEqual(@as(u32, 0x08074b50), archive.entries[0].crc32);
        archive.deinit();
        try std.testing.expectError(error.InvalidCrc, package.open(a, bytes, .{}));
    }
}

test "empty ZIP has no invalid slice but is not HWPX" {
    const bytes = [_]u8{ 'P', 'K', 5, 6 } ++ [_]u8{0} ** 18;
    var archive = try zip.open(std.testing.allocator, &bytes, .{});
    try std.testing.expectEqual(@as(usize, 0), archive.entries.len);
    archive.deinit();
    try std.testing.expectError(error.MissingMimeType, package.open(std.testing.allocator, &bytes, .{}));
}

test "HWPX rejects overlapping local payloads" {
    const a = std.testing.allocator;
    const example = try loadFixture(a, "example");
    defer a.free(example);
    const copy = try a.dupe(u8, example);
    defer a.free(copy);
    const eocd = std.mem.lastIndexOf(u8, example, "PK\x05\x06") orelse unreachable;
    const central: usize = read32(example, eocd + 16);
    const local: usize = read32(example, central + 42);
    const compressed_size = read32(example, central + 20);
    try std.testing.expectEqual(@as(u32, package.mime.len), compressed_size);
    write32(copy, central + 20, compressed_size + 1);
    write32(copy, central + 24, compressed_size + 1);
    write32(copy, local + 18, compressed_size + 1);
    write32(copy, local + 22, compressed_size + 1);
    try std.testing.expectError(error.OverlappingLocalEntries, package.open(a, copy, .{}));
}

test "HWPX deflated XML has independent CRC validation" {
    const a = std.testing.allocator;
    const example = try loadFixture(a, "example");
    defer a.free(example);
    const copy = try a.dupe(u8, example);
    defer a.free(copy);
    const eocd = std.mem.lastIndexOf(u8, example, "PK\x05\x06") orelse unreachable;
    const central_start: usize = read32(example, eocd + 16);
    const name_pos = std.mem.indexOf(u8, example[central_start..eocd], "Contents/header.xml") orelse unreachable;
    const central = central_start + name_pos - 46;
    const local: usize = read32(example, central + 42);
    copy[central + 16] ^= 1;
    copy[local + 14] ^= 1;
    var archive = try package.open(a, copy, .{});
    defer archive.deinit();
    const header = archive.find("Contents/header.xml") orelse unreachable;
    try std.testing.expectError(error.InvalidCrc, archive.decode(header, 1_000_000));
}

test "HWPX EOCD signature inside archive comment is not selected" {
    const a = std.testing.allocator;
    const base = try descriptorZip(a, false);
    defer a.free(base);
    const bytes = try a.alloc(u8, base.len + 22);
    defer a.free(bytes);
    @memcpy(bytes[0..base.len], base);
    @memset(bytes[base.len..], 0);
    write16(bytes, base.len - 2, 22);
    write32(bytes, base.len, 0x06054b50);
    var archive = try package.open(a, bytes, .{});
    try std.testing.expectEqual(@as(usize, 1), archive.entries.len);
    archive.deinit();
}

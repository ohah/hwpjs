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

test "HWPX package relationships from real documents" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "example", "noori" }) |name| {
        const bytes = try loadFixture(a, name);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try std.testing.expectEqualStrings("Contents/content.hpf", document.container.path);
        try std.testing.expect(document.manifest.items.len >= 3);
        try std.testing.expect(document.manifest.spine.len >= 2);
        try std.testing.expectEqualStrings("Contents/header.xml", document.manifest.items[document.manifest.spine[0].item_index].href);
        try std.testing.expectEqualStrings("Contents/section0.xml", document.manifest.items[document.manifest.spine[1].item_index].href);
        try std.testing.expect(document.decoded_xml_bytes > 0);
    }
}

test "HWPX external BinData link remains an unvisited reference" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue1891_external_bindata_link.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var external: usize = 0;
    for (document.manifest.items) |item| {
        if (item.embedded == false) {
            try std.testing.expectEqual(@as(?usize, null), item.entry_index);
            external += 1;
        }
    }
    try std.testing.expect(external > 0);
}

test "HWPX real DEFLATE mimetype keeps exact decoded identity" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/task2169/empty_ladder.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const mime_entry = document.archive.find("mimetype") orelse unreachable;
    try std.testing.expectEqual(@as(u16, 8), mime_entry.method);
    const decoded = try document.archive.decode(mime_entry, package.mime.len);
    defer a.free(decoded);
    try std.testing.expectEqualStrings(package.mime, decoded);
}

test "HWPX package relationships cover converted and incomplete preview samples" {
    const a = std.testing.allocator;
    const cases = [_]struct { path: []const u8, missing_optional: usize }{
        .{ .path = "reference/rhwp/samples/hwp3-sample10-hwpx.hwpx", .missing_optional = 0 },
        .{ .path = "reference/rhwp/samples/rowbreak-problem-pages.hwpx", .missing_optional = 1 },
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns.hwpx", .missing_optional = 0 },
        .{ .path = "reference/rhwp/samples/issue2006/1790387_prep_final_report.hwpx", .missing_optional = 0 },
    };
    for (cases) |case| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case.path, a, .limited(25_000_000));
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try std.testing.expectEqual(case.missing_optional, document.container.missing_optional_roots);
        try std.testing.expect(document.manifest.items.len > 0);
        try std.testing.expect(document.manifest.spine.len > 0);
    }
}

const Source = struct { name: []const u8, data: []const u8 };

fn storedZip(a: std.mem.Allocator, sources: []const Source) ![]u8 {
    var locals_size: usize = 0;
    var central_size: usize = 0;
    for (sources) |source| {
        locals_size += 30 + source.name.len + source.data.len;
        central_size += 46 + source.name.len;
    }
    const bytes = try a.alloc(u8, locals_size + central_size + 22);
    @memset(bytes, 0);
    var local_offset: usize = 0;
    var central_offset: usize = locals_size;
    for (sources) |source| {
        const crc = std.hash.Crc32.hash(source.data);
        write32(bytes, local_offset, 0x04034b50);
        write16(bytes, local_offset + 4, 20);
        write32(bytes, local_offset + 14, crc);
        write32(bytes, local_offset + 18, @intCast(source.data.len));
        write32(bytes, local_offset + 22, @intCast(source.data.len));
        write16(bytes, local_offset + 26, @intCast(source.name.len));
        @memcpy(bytes[local_offset + 30 ..][0..source.name.len], source.name);
        @memcpy(bytes[local_offset + 30 + source.name.len ..][0..source.data.len], source.data);
        write32(bytes, central_offset, 0x02014b50);
        write16(bytes, central_offset + 4, 20);
        write16(bytes, central_offset + 6, 20);
        write32(bytes, central_offset + 16, crc);
        write32(bytes, central_offset + 20, @intCast(source.data.len));
        write32(bytes, central_offset + 24, @intCast(source.data.len));
        write16(bytes, central_offset + 28, @intCast(source.name.len));
        write32(bytes, central_offset + 42, @intCast(local_offset));
        @memcpy(bytes[central_offset + 46 ..][0..source.name.len], source.name);
        local_offset += 30 + source.name.len + source.data.len;
        central_offset += 46 + source.name.len;
    }
    const end = locals_size + central_size;
    write32(bytes, end, 0x06054b50);
    write16(bytes, end + 8, @intCast(sources.len));
    write16(bytes, end + 10, @intCast(sources.len));
    write32(bytes, end + 12, @intCast(central_size));
    write32(bytes, end + 16, @intCast(locals_size));
    return bytes;
}

const package_container = "<c:container xmlns:c=\"urn:oasis:names:tc:opendocument:xmlns:container\"><c:rootfiles><c:rootfile media-type=\"application/hwpml-package+xml\" full-path=\"Contents/content.hpf\"/><c:rootfile full-path=\"Preview/PrvText.txt\" media-type=\"text/plain\"/></c:rootfiles></c:container>";
const opf_prefix = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>";
const opf_suffix = "</p:manifest><p:spine><p:itemref idref=\"s0\" linear=\"no\"/></p:spine></p:package>";
const simple_item = "<p:item id=\"s0\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>";
const simple_hpf = opf_prefix ++ simple_item ++ opf_suffix;

fn syntheticPackage(a: std.mem.Allocator, container_xml: []const u8, hpf_xml: []const u8, include_section: bool) ![]u8 {
    var sources = [_]Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = container_xml },
        .{ .name = "Contents/content.hpf", .data = hpf_xml },
        .{ .name = "Contents/section0.xml", .data = "<section/>" },
    };
    return storedZip(a, sources[0..if (include_section) 4 else 3]);
}

test "HWPX synthetic package resolves renamed prefixes and reports optional missing roots" {
    const a = std.testing.allocator;
    const hpf = opf_prefix ++ "<p:item media-type=\"application/xml\" href=\"Contents/section0.xml\" id=\"s0\"/><p:item id=\"ext\" href=\"D:\\images\\a.gif\" media-type=\"image/gif\" isEmbeded=\"0\"/>" ++ opf_suffix;
    const bytes = try syntheticPackage(a, package_container, hpf, true);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), document.container.optional_roots);
    try std.testing.expectEqual(@as(usize, 1), document.container.missing_optional_roots);
    try std.testing.expectEqual(@as(usize, 2), document.manifest.items.len);
    try std.testing.expectEqual(@as(usize, 1), document.manifest.spine.len);
    try std.testing.expectEqual(@as(?bool, false), document.manifest.spine[0].linear);
    try std.testing.expectEqual(@as(?bool, false), document.manifest.items[1].embedded);
    try std.testing.expectEqual(@as(?usize, null), document.manifest.items[1].entry_index);
}

test "HWPX manifest rejects missing embedded target and broken spine" {
    const a = std.testing.allocator;
    const hpf = opf_prefix ++ "<p:item id=\"s0\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>" ++ opf_suffix;
    const missing_target = try syntheticPackage(a, package_container, hpf, false);
    defer a.free(missing_target);
    try expectDocumentError(a, missing_target, error.MissingEmbeddedEntry);
    const broken_hpf = opf_prefix ++ "<p:item id=\"different\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>" ++ opf_suffix;
    const broken_spine = try syntheticPackage(a, package_container, broken_hpf, true);
    defer a.free(broken_spine);
    try expectDocumentError(a, broken_spine, error.MissingSpineItem);
}

fn expectDocumentError(a: std.mem.Allocator, bytes: []const u8, expected: anyerror) !void {
    return expectDocumentErrorWithOptions(a, bytes, .{}, expected);
}

fn expectDocumentErrorWithOptions(a: std.mem.Allocator, bytes: []const u8, options: package.DocumentOptions, expected: anyerror) !void {
    if (package.inspectDocument(a, bytes, options)) |value| {
        var document = value;
        document.deinit(a);
        return error.TestExpectedError;
    } else |actual| try std.testing.expectEqual(expected, actual);
}

test "HWPX XML package relationship adversarial cases" {
    const a = std.testing.allocator;
    const cases = [_]struct { container_xml: []const u8 = package_container, hpf_xml: []const u8 = simple_hpf, expected: anyerror }{
        .{ .hpf_xml = opf_prefix ++ simple_item ++ simple_item ++ opf_suffix, .expected = error.DuplicateManifestId },
        .{ .hpf_xml = opf_prefix ++ "<p:item id=\"s0\" href=\"../outside.xml\" media-type=\"application/xml\"/>" ++ opf_suffix, .expected = error.InvalidItemHref },
        .{ .hpf_xml = opf_prefix ++ "<p:item id=\"s0\" href=\"&#46;&#46;/outside.xml\" media-type=\"application/xml\"/>" ++ opf_suffix, .expected = error.InvalidItemHref },
        .{ .hpf_xml = opf_prefix ++ "<p:item id=\"s0\" href=\"Contents/section0.xml\" media-type=\"application/xml\" isEmbeded=\"maybe\"/>" ++ opf_suffix, .expected = error.InvalidEmbeddedValue },
        .{ .hpf_xml = "<p:package><p:manifest>" ++ simple_item ++ opf_suffix, .expected = error.UnboundXmlPrefix },
        .{ .hpf_xml = "<q:package xmlns:q=\"urn:wrong\"><q:manifest/><q:spine/></q:package>", .expected = error.InvalidPackageRoot },
        .{ .hpf_xml = "<!DOCTYPE x><p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"/>", .expected = error.UnsupportedXmlDtd },
        .{ .hpf_xml = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:spine/></p:package>", .expected = error.MissingManifest },
        .{ .hpf_xml = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest/></p:package>", .expected = error.MissingSpine },
        .{ .hpf_xml = opf_prefix ++ simple_item ++ "</p:manifest><p:spine><p:itemref idref=\"s0\" linear=\"sometimes\"/></p:spine></p:package>", .expected = error.InvalidSpineLinear },
        .{ .container_xml = "<c:container xmlns:c=\"urn:wrong\"><c:rootfiles/></c:container>", .expected = error.InvalidContainerRoot },
        .{ .container_xml = "<c:container xmlns:c=\"urn:oasis:names:tc:opendocument:xmlns:container\"><c:rootfiles><c:rootfile full-path=\"Contents/content.hpf\" media-type=\"application/hwpml-package+xml\"/><c:rootfile full-path=\"Contents/content.hpf\" media-type=\"application/hwpml-package+xml\"/></c:rootfiles></c:container>", .expected = error.DuplicatePackageRoot },
        .{ .container_xml = "<c:container xmlns:c=\"urn:oasis:names:tc:opendocument:xmlns:container\"><c:rootfiles><c:rootfile full-path=\"Contents/content.hpf\"/></c:rootfiles></c:container>", .expected = error.MissingRootMediaType },
    };
    for (cases) |case| {
        const bytes = try syntheticPackage(a, case.container_xml, case.hpf_xml, true);
        defer a.free(bytes);
        try expectDocumentError(a, bytes, case.expected);
        const original = try syntheticPackage(a, package_container, simple_hpf, true);
        defer a.free(original);
        var valid = try package.inspectDocument(a, original, .{});
        valid.deinit(a);
    }
}

test "HWPX XML manifest uses expanded names and decoded attribute values" {
    const a = std.testing.allocator;
    const hpf = opf_prefix ++ "<!-- <p:item id=\"fake\" href=\"missing.xml\" media-type=\"application/xml\"/> --><![CDATA[<p:item id=\"fake2\"/>]]><q:item xmlns:q=\"urn:other\" id=\"other\" href=\"missing.xml\"/><p:item media-type=\"application/xml\" href=\"Contents/section0&#x2e;xml\" id=\"s0\"/>" ++ opf_suffix;
    const bytes = try syntheticPackage(a, package_container, hpf, true);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), document.manifest.items.len);
    try std.testing.expectEqualStrings("Contents/section0.xml", document.manifest.items[0].href);
}

fn asciiUtf16le(a: std.mem.Allocator, ascii: []const u8) ![]u8 {
    const out = try a.alloc(u8, 2 + ascii.len * 2);
    out[0] = 0xff;
    out[1] = 0xfe;
    for (ascii, 0..) |c, i| {
        out[2 + i * 2] = c;
        out[3 + i * 2] = 0;
    }
    return out;
}

test "HWPX package XML UTF16LE keeps namespace and attribute identity" {
    const a = std.testing.allocator;
    const container_xml = try asciiUtf16le(a, package_container);
    defer a.free(container_xml);
    const hpf_xml = try asciiUtf16le(a, simple_hpf);
    defer a.free(hpf_xml);
    const bytes = try syntheticPackage(a, container_xml, hpf_xml, true);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectEqualStrings("Contents/content.hpf", document.container.path);
    try std.testing.expectEqualStrings("Contents/section0.xml", document.manifest.items[0].href);
}

test "HWPX two XML files share exact byte and item budgets" {
    const a = std.testing.allocator;
    const bytes = try syntheticPackage(a, package_container, simple_hpf, true);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    const exact = document.decoded_xml_bytes;
    const manifest_bytes = document.manifest.xml_bytes;
    document.deinit(a);
    var at_limit = try package.inspectDocument(a, bytes, .{ .max_total_xml_bytes = exact });
    at_limit.deinit(a);
    try expectDocumentErrorWithOptions(a, bytes, .{ .max_total_xml_bytes = exact - 1 }, error.LimitExceeded);
    try expectDocumentErrorWithOptions(a, bytes, .{ .manifest = .{ .max_xml_bytes = manifest_bytes - 1 } }, error.LimitExceeded);
    try expectDocumentErrorWithOptions(a, bytes, .{ .manifest = .{ .max_items = 0 } }, error.LimitExceeded);
    try expectDocumentErrorWithOptions(a, bytes, .{ .manifest = .{ .max_spine = 0 } }, error.LimitExceeded);
}

test "HWPX package assembly allocation failures and explicit cleanup" {
    const a = std.testing.allocator;
    const valid = try syntheticPackage(a, package_container, simple_hpf, true);
    defer a.free(valid);
    const missing = try syntheticPackage(a, package_container, simple_hpf, false);
    defer a.free(missing);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            var document = try package.inspectDocument(allocator, bytes, .{});
            document.deinit(allocator);
        }
    }.run, .{valid});
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8) !void {
            if (package.inspectDocument(allocator, bytes, .{})) |value| {
                var document = value;
                document.deinit(allocator);
                return error.TestExpectedError;
            } else |err| {
                if (err == error.OutOfMemory) return err;
                try std.testing.expectEqual(error.MissingEmbeddedEntry, err);
            }
        }
    }.run, .{missing});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), valid, .{});
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    if (package.inspectDocument(checked.allocator(), missing, .{})) |value| {
        var unexpected = value;
        unexpected.deinit(checked.allocator());
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(error.MissingEmbeddedEntry, err);
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX corpus package relationships read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var total: usize = 0;
    var accepted: usize = 0;
    var errors: std.StringHashMapUnmanaged(usize) = .empty;
    defer errors.deinit(a);
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            total += 1;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            if (package.inspectDocument(a, bytes, .{})) |value| {
                var document = value;
                document.deinit(a);
                accepted += 1;
            } else |err| {
                const slot = try errors.getOrPut(a, @errorName(err));
                if (!slot.found_existing) slot.value_ptr.* = 0;
                slot.value_ptr.* += 1;
            }
        }
    }
    std.debug.print("HWPX package corpus: total={d} accepted={d}\n", .{ total, accepted });
    var it = errors.iterator();
    while (it.next()) |item| std.debug.print("  {s}: {d}\n", .{ item.key_ptr.*, item.value_ptr.* });
    try std.testing.expectEqual(@as(usize, 484), total);
    try std.testing.expectEqual(@as(usize, 478), accepted);
    try std.testing.expectEqual(@as(usize, 1), errors.count());
    try std.testing.expectEqual(@as(?usize, 6), errors.get("MissingEndRecord"));
}

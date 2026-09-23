const std = @import("std");
const zip = @import("../zip/archive.zig");
const package = @import("package.zig");
const version_xml = @import("version_xml.zig");
const encryption_manifest = @import("encryption_manifest.zig");

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

fn versionOnlyZip(a: std.mem.Allocator, version_bytes: []const u8) ![]u8 {
    const sources = [_]Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "version.xml", .data = version_bytes },
    };
    return storedZip(a, &sources);
}

test "HWPX version XML preserves observed numeric field variants" {
    const a = std.testing.allocator;
    const cases = [_]struct { path: []const u8, minor: u32, micro: ?u32, build_number: ?u32, patch: ?u32, revision: ?u32 }{
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/example.hwpx", .minor = 1, .micro = 0, .build_number = 1, .patch = null, .revision = null },
        .{ .path = "reference/rhwp/samples/hwpx/issue2019_floating_form_74312.hwpx", .minor = 0, .micro = null, .build_number = null, .patch = 0, .revision = 0 },
    };
    for (cases) |case| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case.path, a, .limited(1_000_000));
        defer a.free(bytes);
        var archive = try package.open(a, bytes, .{});
        defer archive.deinit();
        var version = try version_xml.read(a, archive, 1024 * 1024, 4096);
        defer version.deinit(a);
        try std.testing.expectEqual(@as(u32, 5), version.major);
        try std.testing.expectEqual(case.minor, version.minor);
        try std.testing.expectEqual(case.micro, version.micro);
        try std.testing.expectEqual(case.build_number, version.build_number);
        try std.testing.expectEqual(case.patch, version.patch);
        try std.testing.expectEqual(case.revision, version.revision);
        try std.testing.expectEqualStrings("WORDPROCESSOR", version.target_application.?);
        try std.testing.expectEqualStrings("Hancom Office Hangul", version.application.?);
        try std.testing.expect(version.app_version.?.len > 0);
    }
}

test "HWPX version XML rejects wrong root and invalid number without leaks" {
    const a = std.testing.allocator;
    const cases = [_]struct { xml: []const u8, expected: anyerror }{
        .{ .xml = "<v:HCFVersion xmlns:v=\"urn:wrong\" major=\"5\" minor=\"1\"/>", .expected = error.InvalidVersionRoot },
        .{ .xml = "<v:HCFVersion xmlns:v=\"http://www.hancom.co.kr/hwpml/2011/version\" minor=\"1\"/>", .expected = error.MissingVersionMajor },
        .{ .xml = "<v:HCFVersion xmlns:v=\"http://www.hancom.co.kr/hwpml/2011/version\" major=\"-1\" minor=\"1\"/>", .expected = error.InvalidVersionNumber },
        .{ .xml = "<v:HCFVersion xmlns:v=\"http://www.hancom.co.kr/hwpml/2011/version\" major=\"5\" minor=\"1\" micro=\"4294967296\"/>", .expected = error.InvalidVersionNumber },
    };
    for (cases) |case| {
        const bytes = try versionOnlyZip(a, case.xml);
        defer a.free(bytes);
        var archive = try package.open(a, bytes, .{});
        defer archive.deinit();
        if (version_xml.read(a, archive, 4096, 4096)) |value| {
            var unexpected = value;
            unexpected.deinit(a);
            return error.TestExpectedError;
        } else |err| try std.testing.expectEqual(case.expected, err);
    }
}

test "HWPX version XML exact budget and allocation ownership" {
    const a = std.testing.allocator;
    const version_text = "<v:HCFVersion xmlns:v=\"http://www.hancom.co.kr/hwpml/2011/version\" major=\"5\" minor=\"1\" xmlVersion=\"1&#46;5\" tagetApplication=\"WORDPROCESSOR\" application=\"Hancom Office Hangul\" appVersion=\"12.0\"/>";
    const bytes = try versionOnlyZip(a, version_text);
    defer a.free(bytes);
    var archive = try package.open(a, bytes, .{});
    defer archive.deinit();
    var version = try version_xml.read(a, archive, version_text.len, 4096);
    defer version.deinit(a);
    try std.testing.expectEqualStrings("1.5", version.xml_version.?);
    try std.testing.expectEqual(@as(?u32, null), version.micro);
    try std.testing.expectEqualStrings("Hancom Office Hangul", version.application.?);
    try std.testing.expectEqualStrings("12.0", version.app_version.?);
    const minimal = try versionOnlyZip(a, "<v:HCFVersion xmlns:v=\"http://www.hancom.co.kr/hwpml/2011/version\" major=\"5\" minor=\"1\"/>");
    defer a.free(minimal);
    var minimal_archive = try package.open(a, minimal, .{});
    defer minimal_archive.deinit();
    var minimal_version = try version_xml.read(a, minimal_archive, 4096, 4096);
    defer minimal_version.deinit(a);
    try std.testing.expectEqual(@as(?[]u8, null), minimal_version.application);
    try std.testing.expectEqual(@as(?[]u8, null), minimal_version.app_version);
    try std.testing.expectEqual(@as(?[]u8, null), minimal_version.xml_version);
    if (version_xml.read(a, archive, version_text.len - 1, 4096)) |value| {
        var unexpected = value;
        unexpected.deinit(a);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(error.LimitExceeded, err);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var opened = try package.open(allocator, source, .{});
            defer opened.deinit();
            var parsed = try version_xml.read(allocator, opened, 4096, 4096);
            parsed.deinit(allocator);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var opened = try package.open(checked.allocator(), bytes, .{});
    var parsed = try version_xml.read(checked.allocator(), opened, 4096, 4096);
    parsed.deinit(checked.allocator());
    opened.deinit();
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX corpus version XML read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var old_minor: usize = 0;
    var patch_variant: usize = 0;
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                try std.testing.expectEqual(error.MissingEndRecord, err);
                rejected_zip += 1;
                continue;
            };
            defer document.deinit(a);
            var version = try document.inspectVersion(a, .{});
            defer version.deinit(a);
            try std.testing.expectEqual(@as(u32, 5), version.major);
            try std.testing.expect(version.xml_version != null);
            try std.testing.expectEqualStrings("WORDPROCESSOR", version.target_application.?);
            try std.testing.expect(version.application != null);
            try std.testing.expect(version.app_version != null);
            try std.testing.expect(version.os != null);
            if (version.minor == 0) old_minor += 1;
            if (version.patch != null) {
                patch_variant += 1;
                try std.testing.expectEqual(@as(?u32, null), version.micro);
                try std.testing.expectEqual(@as(?u32, null), version.build_number);
            }
            accepted += 1;
        }
    }
    std.debug.print("HWPX version corpus: accepted={d} rejected_zip={d} minor0={d} patch_variant={d}\n", .{ accepted, rejected_zip, old_minor, patch_variant });
    try std.testing.expectEqual(@as(usize, 478), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 6), old_minor);
    try std.testing.expectEqual(@as(usize, 1), patch_variant);
}

fn syntheticProtectionZip(a: std.mem.Allocator, manifest_xml: []const u8) ![]u8 {
    const sources = [_]Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = package_container },
        .{ .name = "Contents/content.hpf", .data = simple_hpf },
        .{ .name = "Contents/section0.xml", .data = "<section/>" },
        .{ .name = "META-INF/manifest.xml", .data = manifest_xml },
    };
    return storedZip(a, &sources);
}

const protection_xml = "<m:manifest xmlns:m=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"><m:file-entry full-path=\"Contents/header.xml\"><m:encryption-data/></m:file-entry><m:file-entry full-path=\"Contents/section0.xml\"/></m:manifest>";

test "HWPX protection manifest reports exact encrypted paths" {
    const a = std.testing.allocator;
    const bytes = try syntheticProtectionZip(a, protection_xml);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectProtection(a, .{});
    defer report.deinit(a);
    try std.testing.expect(report.manifest_present);
    try std.testing.expectEqual(@as(usize, 1), report.encrypted_paths.len);
    try std.testing.expect(report.hasEncryptedPath("Contents/header.xml"));
    try std.testing.expect(!report.hasEncryptedPath("Contents/section0.xml"));
    try std.testing.expect(!report.hasEncryptedPath("header.xml"));
}

test "HWPX protection manifest ignores spoofed namespace and resolves XML path references" {
    const a = std.testing.allocator;
    const spoof = "<m:manifest xmlns:m=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"><!-- <m:encryption-data/> --><m:file-entry full-path=\"Contents/header.xml\"><![CDATA[<m:encryption-data/>]]><x:encryption-data xmlns:x=\"urn:wrong\"/></m:file-entry></m:manifest>";
    const spoof_bytes = try syntheticProtectionZip(a, spoof);
    defer a.free(spoof_bytes);
    var spoof_document = try package.inspectDocument(a, spoof_bytes, .{});
    defer spoof_document.deinit(a);
    var spoof_report = try spoof_document.inspectProtection(a, .{});
    defer spoof_report.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), spoof_report.encrypted_paths.len);

    const encoded = "<m:manifest xmlns:m=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"><m:file-entry full-path=\"Contents/header&#46;xml\"><m:encryption-data/></m:file-entry></m:manifest>";
    const encoded_bytes = try syntheticProtectionZip(a, encoded);
    defer a.free(encoded_bytes);
    var encoded_document = try package.inspectDocument(a, encoded_bytes, .{});
    defer encoded_document.deinit(a);
    var encoded_report = try encoded_document.inspectProtection(a, .{});
    defer encoded_report.deinit(a);
    try std.testing.expect(encoded_report.hasEncryptedPath("Contents/header.xml"));
}

test "HWPX protection manifest rejects namespace spoofing and broken entries" {
    const a = std.testing.allocator;
    const cases = [_]struct { xml: []const u8, expected: anyerror }{
        .{ .xml = "<m:manifest xmlns:m=\"urn:wrong\"><m:file-entry full-path=\"Contents/header.xml\"><m:encryption-data/></m:file-entry></m:manifest>", .expected = error.InvalidEncryptionManifestRoot },
        .{ .xml = "<m:manifest xmlns:m=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"><m:file-entry><m:encryption-data/></m:file-entry></m:manifest>", .expected = error.MissingEncryptionManifestPath },
        .{ .xml = "<m:manifest xmlns:m=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"><m:file-entry full-path=\"Contents/header.xml\"><m:encryption-data/><m:encryption-data/></m:file-entry></m:manifest>", .expected = error.DuplicateEncryptionData },
        .{ .xml = "<m:manifest xmlns:m=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"><m:encryption-data/></m:manifest>", .expected = error.OrphanEncryptionData },
        .{ .xml = "<!DOCTYPE x><m:manifest xmlns:m=\"urn:oasis:names:tc:opendocument:xmlns:manifest:1.0\"/>", .expected = error.UnsupportedXmlDtd },
    };
    for (cases) |case| {
        const bytes = try syntheticProtectionZip(a, case.xml);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        if (document.inspectProtection(a, .{})) |value| {
            var unexpected = value;
            unexpected.deinit(a);
            return error.TestExpectedError;
        } else |err| try std.testing.expectEqual(case.expected, err);
    }
}

test "HWPX protection manifest exact byte and entry budgets with allocation cleanup" {
    const a = std.testing.allocator;
    const bytes = try syntheticProtectionZip(a, protection_xml);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectProtection(a, .{ .max_xml_bytes = protection_xml.len });
    report.deinit(a);
    for ([_]package.ProtectionOptions{ .{ .max_xml_bytes = protection_xml.len - 1 }, .{ .max_encrypted_entries = 0 } }) |options| {
        if (document.inspectProtection(a, options)) |value| {
            var unexpected = value;
            unexpected.deinit(a);
            return error.TestExpectedError;
        } else |err| try std.testing.expectEqual(error.LimitExceeded, err);
    }
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var archive = try package.open(allocator, source, .{});
            defer archive.deinit();
            var parsed = try encryption_manifest.read(allocator, archive, .{});
            parsed.deinit(allocator);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var archive = try package.open(checked.allocator(), bytes, .{});
    var parsed = try encryption_manifest.read(checked.allocator(), archive, .{});
    parsed.deinit(checked.allocator());
    archive.deinit();
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX corpus protection manifest read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var with_manifest: usize = 0;
    var without_manifest: usize = 0;
    var encrypted: usize = 0;
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                try std.testing.expectEqual(error.MissingEndRecord, err);
                continue;
            };
            defer document.deinit(a);
            var report = try document.inspectProtection(a, .{});
            defer report.deinit(a);
            if (report.manifest_present) with_manifest += 1 else without_manifest += 1;
            if (report.encrypted_paths.len != 0) {
                encrypted += 1;
                try std.testing.expect(report.hasEncryptedPath("Contents/header.xml"));
                try std.testing.expect(report.hasEncryptedPath("Contents/section0.xml"));
            }
        }
    }
    std.debug.print("HWPX protection corpus: manifest={d} absent={d} encrypted={d}\n", .{ with_manifest, without_manifest, encrypted });
    try std.testing.expectEqual(@as(usize, 473), with_manifest);
    try std.testing.expectEqual(@as(usize, 5), without_manifest);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

test "HWPX real header and section structure keeps spine order" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "example", "noori" }) |name| {
        const bytes = try loadFixture(a, name);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        var structure = try document.inspectStructure(a, .{});
        defer structure.deinit(a);
        try std.testing.expect(structure.header_in_spine);
        try std.testing.expect(structure.sections.len > 0);
        try std.testing.expectEqual(@as(?bool, true), structure.declared_count_matches);
        try std.testing.expectEqual(@as(?bool, true), structure.numeric_path_order_matches);
        try std.testing.expectEqualStrings("Contents/section0.xml", document.manifest.items[structure.sections[0].item_index].href);
        try std.testing.expect(structure.sections[0].direct_paragraphs > 0);
    }
}

fn expectStructureError(a: std.mem.Allocator, document: *const package.Document, options: package.StructureOptions, expected: anyerror) !void {
    if (document.inspectStructure(a, options)) |value| {
        var unexpected = value;
        unexpected.deinit(a);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(expected, err);
}

test "HWPX encrypted documents stop before ciphertext XML parsing" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx",
        "reference/rhwp/samples/HWP5-password-123456.hwpx",
    }) |path| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(1_000_000));
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try expectStructureError(a, &document, .{}, error.EncryptedDocument);
    }
}

test "HWPX header section count disagreement is explicit, not silently repaired" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/hwpx/hwpx-02.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var structure = try document.inspectStructure(a, .{});
    defer structure.deinit(a);
    try std.testing.expectEqual(@as(?u32, 1), structure.declared_section_count);
    try std.testing.expectEqual(@as(usize, 2), structure.sections.len);
    try std.testing.expectEqual(@as(?bool, false), structure.declared_count_matches);
    try std.testing.expectEqualStrings("Contents/section0.xml", document.manifest.items[structure.sections[0].item_index].href);
    try std.testing.expectEqualStrings("Contents/section1.xml", document.manifest.items[structure.sections[1].item_index].href);
}

const structure_header = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\" version=\"1.5\" secCnt=\"2\"/>";
const structure_section = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\"><p:p/></s:sec>";
const structure_hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
    "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"a\" href=\"Contents/chapter-A.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"b\" href=\"Contents/chapter-B.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"extra\" href=\"Contents/extra.xml\" media-type=\"application/xml\"/>" ++
    "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"b\"/><p:itemref idref=\"extra\"/><p:itemref idref=\"a\"/></p:spine></p:package>";

fn syntheticStructureZip(a: std.mem.Allocator, header_xml: []const u8, section_xml: []const u8) ![]u8 {
    return syntheticStructureZipWithHpf(a, structure_hpf, header_xml, section_xml);
}

fn syntheticStructureZipWithHpf(a: std.mem.Allocator, hpf_xml: []const u8, header_xml: []const u8, section_xml: []const u8) ![]u8 {
    const sources = [_]Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = package_container },
        .{ .name = "Contents/content.hpf", .data = hpf_xml },
        .{ .name = "Contents/header.xml", .data = header_xml },
        .{ .name = "Contents/chapter-A.xml", .data = section_xml },
        .{ .name = "Contents/chapter-B.xml", .data = section_xml },
        .{ .name = "Contents/extra.xml", .data = "<misc/>" },
        .{ .name = "Contents/section1.xml", .data = section_xml },
        .{ .name = "Contents/section2.xml", .data = section_xml },
    };
    return storedZip(a, &sources);
}

test "HWPX structure rejects duplicate section spine references and absent header manifest item" {
    const a = std.testing.allocator;
    const manifest_prefix = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
        "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
        "<p:item id=\"a\" href=\"Contents/chapter-A.xml\" media-type=\"application/xml\"/>";
    const duplicate = manifest_prefix ++ "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"a\"/><p:itemref idref=\"a\"/></p:spine></p:package>";
    const duplicate_bytes = try syntheticStructureZipWithHpf(a, duplicate, structure_header, structure_section);
    defer a.free(duplicate_bytes);
    var duplicate_document = try package.inspectDocument(a, duplicate_bytes, .{});
    defer duplicate_document.deinit(a);
    try expectStructureError(a, &duplicate_document, .{}, error.DuplicateSectionSpineReference);

    const no_header = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest><p:item id=\"a\" href=\"Contents/chapter-A.xml\" media-type=\"application/xml\"/></p:manifest><p:spine><p:itemref idref=\"a\"/></p:spine></p:package>";
    const no_header_bytes = try syntheticStructureZipWithHpf(a, no_header, structure_header, structure_section);
    defer a.free(no_header_bytes);
    var no_header_document = try package.inspectDocument(a, no_header_bytes, .{});
    defer no_header_document.deinit(a);
    try expectStructureError(a, &no_header_document, .{}, error.MissingHeaderManifestItem);
}

test "HWPX structure reports header absent from spine without inserting it" {
    const a = std.testing.allocator;
    const hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
        "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
        "<p:item id=\"a\" href=\"Contents/chapter-A.xml\" media-type=\"application/xml\"/>" ++
        "</p:manifest><p:spine><p:itemref idref=\"a\"/></p:spine></p:package>";
    const bytes = try syntheticStructureZipWithHpf(a, hpf, structure_header, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var structure = try document.inspectStructure(a, .{});
    defer structure.deinit(a);
    try std.testing.expect(!structure.header_in_spine);
    try std.testing.expectEqual(@as(usize, 1), structure.sections.len);
    try std.testing.expectEqual(@as(?bool, false), structure.declared_count_matches);
}

test "HWPX structure classifies XML roots in spine order without filename heuristic" {
    const a = std.testing.allocator;
    const bytes = try syntheticStructureZip(a, structure_header, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var structure = try document.inspectStructure(a, .{});
    defer structure.deinit(a);
    try std.testing.expect(structure.header_in_spine);
    try std.testing.expectEqual(@as(usize, 2), structure.sections.len);
    try std.testing.expectEqualStrings("Contents/chapter-B.xml", document.manifest.items[structure.sections[0].item_index].href);
    try std.testing.expectEqualStrings("Contents/chapter-A.xml", document.manifest.items[structure.sections[1].item_index].href);
    try std.testing.expectEqual(@as(?bool, true), structure.declared_count_matches);
    try std.testing.expectEqual(@as(?bool, null), structure.numeric_path_order_matches);
    try std.testing.expectEqual(@as(usize, 1), structure.unclassified_spine_xml);
    try std.testing.expectEqual(@as(usize, 1), structure.sections[0].direct_paragraphs);
}

test "HWPX structure mixed section path diagnostic stays unknown" {
    const a = std.testing.allocator;
    const hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
        "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
        "<p:item id=\"a\" href=\"Contents/chapter-A.xml\" media-type=\"application/xml\"/>" ++
        "<p:item id=\"one\" href=\"Contents/section1.xml\" media-type=\"application/xml\"/>" ++
        "<p:item id=\"two\" href=\"Contents/section2.xml\" media-type=\"application/xml\"/>" ++
        "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"a\"/><p:itemref idref=\"two\"/><p:itemref idref=\"one\"/></p:spine></p:package>";
    const bytes = try syntheticStructureZipWithHpf(a, hpf, structure_header, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var structure = try document.inspectStructure(a, .{});
    defer structure.deinit(a);
    try std.testing.expectEqual(@as(usize, 3), structure.sections.len);
    try std.testing.expectEqual(@as(?bool, null), structure.numeric_path_order_matches);

    const numeric_hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
        "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
        "<p:item id=\"one\" href=\"Contents/section1.xml\" media-type=\"application/xml\"/>" ++
        "<p:item id=\"two\" href=\"Contents/section2.xml\" media-type=\"application/xml\"/>" ++
        "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"two\"/><p:itemref idref=\"one\"/></p:spine></p:package>";
    const numeric_bytes = try syntheticStructureZipWithHpf(a, numeric_hpf, structure_header, structure_section);
    defer a.free(numeric_bytes);
    var numeric_document = try package.inspectDocument(a, numeric_bytes, .{});
    defer numeric_document.deinit(a);
    var numeric_structure = try numeric_document.inspectStructure(a, .{});
    defer numeric_structure.deinit(a);
    try std.testing.expectEqual(@as(?bool, false), numeric_structure.numeric_path_order_matches);
}

test "HWPX structure rejects bad header root and enforces shared XML budgets" {
    const a = std.testing.allocator;
    const bad = try syntheticStructureZip(a, "<nothead/>", structure_section);
    defer a.free(bad);
    var bad_document = try package.inspectDocument(a, bad, .{});
    defer bad_document.deinit(a);
    try expectStructureError(a, &bad_document, .{}, error.InvalidHeaderRoot);

    const wrong_header_namespace = try syntheticStructureZip(a, "<h:head xmlns:h=\"urn:wrong\" secCnt=\"2\"/>", structure_section);
    defer a.free(wrong_header_namespace);
    var wrong_header_document = try package.inspectDocument(a, wrong_header_namespace, .{});
    defer wrong_header_document.deinit(a);
    try expectStructureError(a, &wrong_header_document, .{}, error.InvalidHeaderRoot);

    const invalid_count = try syntheticStructureZip(a, "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\" secCnt=\"many\"/>", structure_section);
    defer a.free(invalid_count);
    var invalid_count_document = try package.inspectDocument(a, invalid_count, .{});
    defer invalid_count_document.deinit(a);
    try expectStructureError(a, &invalid_count_document, .{}, error.InvalidSectionCount);

    const wrong_sections = try syntheticStructureZip(a, structure_header, "<notsection/>");
    defer a.free(wrong_sections);
    var wrong_sections_document = try package.inspectDocument(a, wrong_sections, .{});
    defer wrong_sections_document.deinit(a);
    try expectStructureError(a, &wrong_sections_document, .{}, error.MissingDocumentSection);

    const wrong_section_namespace = try syntheticStructureZip(a, structure_header, "<s:sec xmlns:s=\"urn:wrong\"/>");
    defer a.free(wrong_section_namespace);
    var wrong_section_document = try package.inspectDocument(a, wrong_section_namespace, .{});
    defer wrong_section_document.deinit(a);
    try expectStructureError(a, &wrong_section_document, .{}, error.MissingDocumentSection);

    const missing_count = try syntheticStructureZip(a, "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\"/>", structure_section);
    defer a.free(missing_count);
    var missing_count_document = try package.inspectDocument(a, missing_count, .{});
    defer missing_count_document.deinit(a);
    var missing_count_structure = try missing_count_document.inspectStructure(a, .{});
    defer missing_count_structure.deinit(a);
    try std.testing.expectEqual(@as(?u32, null), missing_count_structure.declared_section_count);
    try std.testing.expectEqual(@as(?bool, null), missing_count_structure.declared_count_matches);

    const bytes = try syntheticStructureZip(a, structure_header, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var structure = try document.inspectStructure(a, .{});
    const exact = structure.decoded_xml_bytes;
    structure.deinit(a);
    var at_limit = try document.inspectStructure(a, .{ .max_total_xml_bytes = exact });
    at_limit.deinit(a);
    try expectStructureError(a, &document, .{ .max_total_xml_bytes = exact - 1 }, error.LimitExceeded);
    try expectStructureError(a, &document, .{ .max_header_xml_bytes = structure_header.len - 1 }, error.LimitExceeded);
    try expectStructureError(a, &document, .{ .max_spine_xml_bytes = structure_section.len - 1 }, error.LimitExceeded);
    try expectStructureError(a, &document, .{ .max_sections = 1 }, error.LimitExceeded);
}

test "HWPX structure allocation failures and ReleaseFast cleanup accounting" {
    const a = std.testing.allocator;
    const bytes = try syntheticStructureZip(a, structure_header, structure_section);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(allocator, source, .{});
            defer document.deinit(allocator);
            var structure = try document.inspectStructure(allocator, .{});
            structure.deinit(allocator);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    var structure = try document.inspectStructure(checked.allocator(), .{});
    structure.deinit(checked.allocator());
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

const resource_prefix = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\"><h:refList>";
const resource_suffix = "</h:refList></h:head>";
const sparse_resources = resource_prefix ++
    "<h:charProperties itemCnt=\"2\"><h:charPr id=\"7\"/><x:charPr xmlns:x=\"urn:wrong\" id=\"99\"/><h:charPr id=\"2\"/></h:charProperties>" ++
    "<h:paraProperties itemCnt=\"1\"><h:paraPr id=\"20\"/></h:paraProperties>" ++
    "<h:styles><h:style id=\"0\"/></h:styles>" ++ resource_suffix;

fn expectResourceError(a: std.mem.Allocator, header_xml: []const u8, options: package.HeaderResourceOptions, expected: anyerror) !void {
    const bytes = try syntheticStructureZip(a, header_xml, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    if (document.inspectHeaderResources(a, options)) |value| {
        var unexpected = value;
        unexpected.deinit(a);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(expected, err);
}

test "HWPX header resources use explicit sparse IDs and preserve missing declarations" {
    const a = std.testing.allocator;
    const bytes = try syntheticStructureZip(a, sparse_resources, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    const chars = resources.table(.char_shape);
    try std.testing.expect(chars.present);
    try std.testing.expectEqual(@as(?u32, 2), chars.declared_count);
    try std.testing.expectEqual(@as(?bool, true), chars.countMatches());
    try std.testing.expectEqualSlices(u32, &.{ 2, 7 }, chars.ids.items);
    try std.testing.expect(chars.hasId(7));
    try std.testing.expect(!chars.hasId(0));
    try std.testing.expect(!chars.hasId(99));
    try std.testing.expectEqual(@as(?bool, null), resources.table(.style).countMatches());
    try std.testing.expect(!resources.table(.bullet).present);
    try std.testing.expectEqual(@as(?bool, null), resources.table(.bullet).countMatches());

    const mismatched = resource_prefix ++ "<h:styles itemCnt=\"2\"><h:style id=\"7\"/></h:styles>" ++ resource_suffix;
    const mismatch_bytes = try syntheticStructureZip(a, mismatched, structure_section);
    defer a.free(mismatch_bytes);
    var mismatch_document = try package.inspectDocument(a, mismatch_bytes, .{});
    defer mismatch_document.deinit(a);
    var mismatch_resources = try mismatch_document.inspectHeaderResources(a, .{});
    defer mismatch_resources.deinit(a);
    try std.testing.expectEqual(@as(?bool, false), mismatch_resources.table(.style).countMatches());
    try std.testing.expect(mismatch_resources.table(.style).hasId(7));

    const decoded_id = resource_prefix ++ "<h:styles itemCnt=\"1\"><h:style id=\"&#50;\"/></h:styles>" ++ resource_suffix;
    const decoded_bytes = try syntheticStructureZip(a, decoded_id, structure_section);
    defer a.free(decoded_bytes);
    var decoded_document = try package.inspectDocument(a, decoded_bytes, .{});
    defer decoded_document.deinit(a);
    var decoded_resources = try decoded_document.inspectHeaderResources(a, .{});
    defer decoded_resources.deinit(a);
    try std.testing.expect(decoded_resources.table(.style).hasId(2));
}

test "HWPX header resources reject real encrypted documents before XML parsing" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx",
        "reference/rhwp/samples/HWP5-password-123456.hwpx",
    }) |path| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(1_000_000));
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        if (document.inspectHeaderResources(a, .{})) |value| {
            var unexpected = value;
            unexpected.deinit(a);
            return error.TestExpectedError;
        } else |err| try std.testing.expectEqual(error.EncryptedDocument, err);
    }
}

test "HWPX real header inventories preserve seven group identities" {
    const a = std.testing.allocator;
    const bytes = try loadFixture(a, "example");
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var resources = try document.inspectHeaderResources(a, .{});
    defer resources.deinit(a);
    try std.testing.expectEqual(@as(usize, 12), resources.table(.char_shape).ids.items.len);
    try std.testing.expectEqual(@as(usize, 16), resources.table(.para_shape).ids.items.len);
    try std.testing.expectEqual(@as(usize, 18), resources.table(.style).ids.items.len);
    try std.testing.expect(resources.table(.border_fill).hasId(1));
    try std.testing.expect(!resources.table(.border_fill).hasId(0));
    try std.testing.expect(resources.table(.numbering).hasId(1));
    try std.testing.expect(!resources.table(.bullet).present);
    for ([_]package.HeaderResourceKind{ .border_fill, .char_shape, .tab, .numbering, .para_shape, .style }) |kind| {
        try std.testing.expectEqual(@as(?bool, true), resources.table(kind).countMatches());
    }

    const noori = try loadFixture(a, "noori");
    defer a.free(noori);
    var second_document = try package.inspectDocument(a, noori, .{});
    defer second_document.deinit(a);
    var second_resources = try second_document.inspectHeaderResources(a, .{});
    defer second_resources.deinit(a);
    try std.testing.expect(second_resources.table(.bullet).present);
    try std.testing.expect(second_resources.table(.bullet).hasId(1));
    try std.testing.expectEqual(@as(?bool, true), second_resources.table(.bullet).countMatches());
}

test "HWPX header resources reject wrong roots, duplicate groups and IDs" {
    const a = std.testing.allocator;
    const cases = [_]struct { xml: []const u8, expected: anyerror }{
        .{ .xml = "<x:head xmlns:x=\"urn:wrong\"><x:refList/></x:head>", .expected = error.InvalidHeaderRoot },
        .{ .xml = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\"/>", .expected = error.MissingReferenceList },
        .{ .xml = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\"><x:refList xmlns:x=\"urn:wrong\"/></h:head>", .expected = error.MissingReferenceList },
        .{ .xml = resource_prefix ++ "<h:styles/><h:styles/>" ++ resource_suffix, .expected = error.DuplicateResourceTable },
        .{ .xml = resource_prefix ++ "<h:styles itemCnt=\"two\"/>" ++ resource_suffix, .expected = error.InvalidResourceCount },
        .{ .xml = resource_prefix ++ "<h:styles itemCnt=\"4294967296\"/>" ++ resource_suffix, .expected = error.InvalidResourceCount },
        .{ .xml = resource_prefix ++ "<h:styles><h:style/></h:styles>" ++ resource_suffix, .expected = error.MissingResourceId },
        .{ .xml = resource_prefix ++ "<h:styles><h:style id=\"-1\"/></h:styles>" ++ resource_suffix, .expected = error.InvalidResourceId },
        .{ .xml = resource_prefix ++ "<h:styles><h:style id=\"4294967296\"/></h:styles>" ++ resource_suffix, .expected = error.InvalidResourceId },
        .{ .xml = resource_prefix ++ "<h:styles><h:style id=\"03\"/><h:style id=\"3\"/></h:styles>" ++ resource_suffix, .expected = error.DuplicateResourceId },
    };
    for (cases) |case| try expectResourceError(a, case.xml, .{}, case.expected);
}

test "HWPX header resource limits, allocation failures and ReleaseFast ownership" {
    const a = std.testing.allocator;
    const bytes = try syntheticStructureZip(a, sparse_resources, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var at_limit = try document.inspectHeaderResources(a, .{ .resources = .{ .max_xml_bytes = sparse_resources.len } });
    at_limit.deinit(a);
    var exact_ids = try document.inspectHeaderResources(a, .{ .resources = .{ .max_resource_ids = 4 } });
    exact_ids.deinit(a);
    try expectResourceError(a, sparse_resources, .{ .resources = .{ .max_xml_bytes = sparse_resources.len - 1 } }, error.LimitExceeded);
    try expectResourceError(a, sparse_resources, .{ .resources = .{ .max_resource_ids = 1 } }, error.LimitExceeded);
    try expectResourceError(a, sparse_resources, .{ .resources = .{ .max_attribute_bytes = 0 } }, error.LimitExceeded);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var parsed = try package.inspectDocument(allocator, source, .{});
            defer parsed.deinit(allocator);
            var resources = try parsed.inspectHeaderResources(allocator, .{});
            resources.deinit(allocator);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var parsed = try package.inspectDocument(checked.allocator(), bytes, .{});
    var resources = try parsed.inspectHeaderResources(checked.allocator(), .{});
    resources.deinit(checked.allocator());
    parsed.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

const reference_hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
    "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"a\" href=\"Contents/chapter-A.xml\" media-type=\"application/xml\"/>" ++
    "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"a\"/></p:spine></p:package>";
const reference_header = resource_prefix ++
    "<h:charProperties itemCnt=\"2\"><h:charPr id=\"7\"/><h:charPr id=\"5\"/></h:charProperties>" ++
    "<h:paraProperties itemCnt=\"2\"><h:paraPr id=\"21\"/><h:paraPr id=\"20\"/></h:paraProperties>" ++
    "<h:styles itemCnt=\"1\"><h:style id=\"7\"/></h:styles>" ++ resource_suffix;
const reference_section = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\">" ++
    "<p:p paraPrIDRef=\"20\" styleIDRef=\"7\"><p:run charPrIDRef=\"5\"/><p:tbl><p:cell>" ++
    "<p:p paraPrIDRef=\"21\"><p:run charPrIDRef=\"7\"/></p:p>" ++
    "</p:cell></p:tbl><p:run charPrIDRef=\"5\"/></p:p><p:run charPrIDRef=\"7\"/>" ++
    "<x:p xmlns:x=\"urn:wrong\" paraPrIDRef=\"999\"/></s:sec>";

fn referenceZip(a: std.mem.Allocator, header: []const u8, section: []const u8) ![]u8 {
    return syntheticStructureZipWithHpf(a, reference_hpf, header, section);
}

test "HWPX section references resolve sparse IDs through nested paragraphs" {
    const a = std.testing.allocator;
    const bytes = try referenceZip(a, reference_header, reference_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 2), report.paragraphs);
    try std.testing.expectEqual(@as(usize, 1), report.non_direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 4), report.runs);
    try std.testing.expectEqual(@as(usize, 1), report.non_direct_runs);
    try std.testing.expectEqual(@as(usize, 2), report.counts(.paragraph_shape).resolved);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style).resolved);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style).absent);
    try std.testing.expectEqual(@as(usize, 4), report.counts(.character_shape).resolved);
    try std.testing.expect(report.counts(.paragraph_shape).allPresentResolved());
    try std.testing.expect(report.counts(.character_shape).allPresentResolved());
}

test "HWPX real section references traverse example and noori" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "example", "noori" }) |name| {
        const bytes = try loadFixture(a, name);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        const report = try document.inspectReferences(a, .{});
        try std.testing.expect(report.sections > 0);
        try std.testing.expect(report.paragraphs > 0);
        try std.testing.expect(report.runs > 0);
        try std.testing.expect(report.counts(.paragraph_shape).present > 0);
        try std.testing.expect(report.counts(.character_shape).present > 0);
    }
}

fn expectReferenceError(a: std.mem.Allocator, header: []const u8, section: []const u8, options: package.ReferenceOptions, expected: anyerror) !void {
    const bytes = try referenceZip(a, header, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try expectReferenceDocumentError(a, &document, options, expected);
}

fn expectReferenceDocumentError(a: std.mem.Allocator, document: *const package.Document, options: package.ReferenceOptions, expected: anyerror) !void {
    if (document.inspectReferences(a, options)) |_| {
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(expected, err);
}

test "HWPX section references distinguish absent attributes from missing ID zero" {
    const a = std.testing.allocator;
    const section = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\">" ++
        "<p:p paraPrIDRef=\"0\" styleIDRef=\"7\"><p:run charPrIDRef=\"0\"/></p:p><p:p><p:run/></p:p></s:sec>";
    const bytes = try referenceZip(a, reference_header, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 1), report.counts(.paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.paragraph_shape).absent);
    try std.testing.expectEqual(@as(?u32, 0), report.counts(.paragraph_shape).first_unresolved_id);
    try std.testing.expectEqualStrings("Contents/chapter-A.xml", document.manifest.items[report.counts(.paragraph_shape).first_unresolved_item_index.?].href);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style).resolved);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style).absent);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.character_shape).missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.character_shape).absent);
    try std.testing.expect(!report.counts(.character_shape).allPresentResolved());

    const no_styles = resource_prefix ++
        "<h:charProperties><h:charPr id=\"0\"/></h:charProperties>" ++
        "<h:paraProperties><h:paraPr id=\"0\"/></h:paraProperties>" ++ resource_suffix;
    const absent_table_bytes = try referenceZip(a, no_styles, section);
    defer a.free(absent_table_bytes);
    var absent_table_document = try package.inspectDocument(a, absent_table_bytes, .{});
    defer absent_table_document.deinit(a);
    const absent_table_report = try absent_table_document.inspectReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 1), absent_table_report.counts(.style).absent_table);
    try std.testing.expectEqual(@as(usize, 0), absent_table_report.counts(.style).missing_target);
}

test "HWPX section references reject invalid numeric attributes and exact budgets" {
    const a = std.testing.allocator;
    const invalid = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\"><p:p paraPrIDRef=\"no\"/></s:sec>";
    try expectReferenceError(a, reference_header, invalid, .{}, error.InvalidResourceReferenceId);
    const overflow = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\"><p:p><p:run charPrIDRef=\"4294967296\"/></p:p></s:sec>";
    try expectReferenceError(a, reference_header, overflow, .{}, error.InvalidResourceReferenceId);
    const bytes = try referenceZip(a, reference_header, reference_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectReferences(a, .{});
    const at_total = try document.inspectReferences(a, .{ .sections = .{ .max_total_section_xml_bytes = report.decoded_xml_bytes } });
    try std.testing.expectEqual(report.decoded_xml_bytes, at_total.decoded_xml_bytes);
    try expectReferenceError(a, reference_header, reference_section, .{ .sections = .{ .max_total_section_xml_bytes = report.decoded_xml_bytes - 1 } }, error.LimitExceeded);
    try expectReferenceError(a, reference_header, reference_section, .{ .sections = .{ .max_section_xml_bytes = reference_section.len - 1 } }, error.LimitExceeded);
    try expectReferenceError(a, reference_header, reference_section, .{ .sections = .{ .max_paragraphs = 1 } }, error.LimitExceeded);
    try expectReferenceError(a, reference_header, reference_section, .{ .sections = .{ .max_runs = 3 } }, error.LimitExceeded);
    try expectReferenceError(a, reference_header, reference_section, .{ .sections = .{ .max_attribute_bytes = 0 } }, error.LimitExceeded);

    const two_bytes = try syntheticStructureZip(a, reference_header, reference_section);
    defer a.free(two_bytes);
    var two_document = try package.inspectDocument(a, two_bytes, .{});
    defer two_document.deinit(a);
    const both = try two_document.inspectReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 2), both.sections);
    try std.testing.expectEqual(reference_section.len * 2, both.decoded_xml_bytes);
    const both_at_limit = try two_document.inspectReferences(a, .{ .sections = .{ .max_total_section_xml_bytes = both.decoded_xml_bytes } });
    try std.testing.expectEqual(both.decoded_xml_bytes, both_at_limit.decoded_xml_bytes);
    try expectReferenceDocumentError(a, &two_document, .{ .sections = .{ .max_total_section_xml_bytes = both.decoded_xml_bytes - 1 } }, error.LimitExceeded);
}

test "HWPX section references allocation failures and ReleaseFast cleanup" {
    const a = std.testing.allocator;
    const bytes = try referenceZip(a, reference_header, reference_section);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(allocator, source, .{});
            defer document.deinit(allocator);
            _ = try document.inspectReferences(allocator, .{});
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    _ = try document.inspectReferences(checked.allocator(), .{});
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

const header_links = resource_prefix ++
    "<h:borderFills><h:borderFill id=\"9\"/><h:borderFill id=\"2\"/></h:borderFills>" ++
    "<h:charProperties><h:charPr id=\"7\"/><h:charPr id=\"5\" borderFillIDRef=\"9\"/></h:charProperties>" ++
    "<h:tabProperties><h:tabPr id=\"3\"/></h:tabProperties>" ++
    "<h:paraProperties><h:paraPr id=\"22\"/><h:paraPr id=\"21\"><h:border/></h:paraPr><h:paraPr id=\"20\" tabPrIDRef=\"3\"><h:border borderFillIDRef=\"2\"/></h:paraPr></h:paraProperties>" ++
    "<h:styles><h:style id=\"10\" type=\"PARA\" paraPrIDRef=\"20\" charPrIDRef=\"5\" nextStyleIDRef=\"11\"/>" ++
    "<h:style id=\"11\" type=\"CHAR\" paraPrIDRef=\"21\" charPrIDRef=\"7\" nextStyleIDRef=\"11\"/>" ++
    "<h:style id=\"12\"/></h:styles>" ++ resource_suffix;

fn expectHeaderReferenceError(a: std.mem.Allocator, header: []const u8, options: package.HeaderReferenceOptions, expected: anyerror) !void {
    const bytes = try syntheticStructureZip(a, header, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    if (document.inspectHeaderReferences(a, options)) |_| {
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(expected, err);
}

test "HWPX header links use sparse exact IDs and distinct absent fields" {
    const a = std.testing.allocator;
    const bytes = try syntheticStructureZip(a, header_links, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectHeaderReferences(a, .{});
    try std.testing.expectEqual(header_links.len, report.xml_bytes);
    try std.testing.expectEqual(@as(usize, 3), report.styles);
    try std.testing.expectEqual(@as(usize, 1), report.character_styles);
    try std.testing.expectEqual(@as(usize, 0), report.character_style_missing_paragraph_shape);
    try std.testing.expectEqual(@as(usize, 0), report.character_style_missing_next_style);
    try std.testing.expectEqual(@as(usize, 3), report.paragraph_shapes);
    try std.testing.expectEqual(@as(usize, 2), report.character_shapes);
    try std.testing.expectEqual(@as(usize, 2), report.paragraph_border_elements);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs_without_border_element);
    for ([_]package.HeaderReferenceKind{ .style_paragraph_shape, .style_character_shape, .style_next_style }) |kind| {
        try std.testing.expectEqual(@as(usize, 2), report.counts(kind).resolved);
        try std.testing.expectEqual(@as(usize, 1), report.counts(kind).absent);
    }
    try std.testing.expectEqual(@as(usize, 1), report.counts(.paragraph_tab).resolved);
    try std.testing.expectEqual(@as(usize, 2), report.counts(.paragraph_tab).absent);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.character_border_fill).resolved);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.character_border_fill).absent);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.paragraph_border_fill).resolved);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.paragraph_border_fill).absent);
    try std.testing.expect(report.counts(.style_next_style).allPresentResolved());
}

test "HWPX header links distinguish missing ID, absent table and namespace spoofing" {
    const a = std.testing.allocator;
    const missing = resource_prefix ++
        "<h:charProperties><h:charPr id=\"5\"/></h:charProperties>" ++
        "<h:paraProperties><h:paraPr id=\"20\" tabPrIDRef=\"0\"/></h:paraProperties>" ++
        "<h:styles><h:style id=\"10\" type=\"CHAR\" paraPrIDRef=\"0\" charPrIDRef=\"5\" nextStyleIDRef=\"42\"/></h:styles>" ++ resource_suffix;
    const bytes = try syntheticStructureZip(a, missing, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const report = try document.inspectHeaderReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style_paragraph_shape).missing_target);
    try std.testing.expectEqual(@as(?u32, 0), report.counts(.style_paragraph_shape).first_unresolved_id);
    try std.testing.expect(report.counts(.style_paragraph_shape).first_unresolved_item_index != null);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.style_next_style).missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.paragraph_tab).absent_table);
    try std.testing.expectEqual(@as(usize, 0), report.counts(.paragraph_tab).missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.character_styles);
    try std.testing.expectEqual(@as(usize, 1), report.character_style_missing_paragraph_shape);
    try std.testing.expectEqual(@as(usize, 1), report.character_style_missing_next_style);

    const spoofed = resource_prefix ++
        "<h:styles xmlns:x=\"urn:wrong\"><h:style id=\"10\" x:paraPrIDRef=\"999\"/><x:style id=\"999\" paraPrIDRef=\"999\"/></h:styles>" ++
        "</h:refList><h:other><h:styles><h:style id=\"77\" paraPrIDRef=\"999\"/></h:styles></h:other></h:head>";
    const spoofed_bytes = try syntheticStructureZip(a, spoofed, structure_section);
    defer a.free(spoofed_bytes);
    var spoofed_document = try package.inspectDocument(a, spoofed_bytes, .{});
    defer spoofed_document.deinit(a);
    const spoofed_report = try spoofed_document.inspectHeaderReferences(a, .{});
    try std.testing.expectEqual(@as(usize, 1), spoofed_report.styles);
    try std.testing.expectEqual(@as(usize, 1), spoofed_report.counts(.style_paragraph_shape).absent);
    try std.testing.expectEqual(@as(usize, 0), spoofed_report.counts(.style_paragraph_shape).missing_target);
}

test "HWPX header links reject invalid IDs and exact byte limits" {
    const a = std.testing.allocator;
    const invalid = resource_prefix ++ "<h:styles><h:style id=\"10\" nextStyleIDRef=\"bad\"/></h:styles>" ++ resource_suffix;
    try expectHeaderReferenceError(a, invalid, .{}, error.InvalidResourceReferenceId);
    const overflow = resource_prefix ++ "<h:styles><h:style id=\"10\" nextStyleIDRef=\"4294967296\"/></h:styles>" ++ resource_suffix;
    try expectHeaderReferenceError(a, overflow, .{}, error.InvalidResourceReferenceId);
    const at_limit = try syntheticStructureZip(a, header_links, structure_section);
    defer a.free(at_limit);
    var document = try package.inspectDocument(a, at_limit, .{});
    defer document.deinit(a);
    _ = try document.inspectHeaderReferences(a, .{ .references = .{ .max_xml_bytes = header_links.len } });
    try expectHeaderReferenceError(a, header_links, .{ .references = .{ .max_xml_bytes = header_links.len - 1 } }, error.LimitExceeded);
    try expectHeaderReferenceError(a, header_links, .{ .references = .{ .max_attribute_bytes = 0 } }, error.LimitExceeded);
    try expectHeaderReferenceError(a, header_links, .{ .resources = .{ .max_resource_ids = 1 } }, error.LimitExceeded);
}

test "HWPX real header links traverse example and noori and reject encryption" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "example", "noori" }) |name| {
        const bytes = try loadFixture(a, name);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        const report = try document.inspectHeaderReferences(a, .{});
        try std.testing.expect(report.styles > 0);
        try std.testing.expect(report.paragraph_shapes > 0);
        try std.testing.expect(report.character_shapes > 0);
        try std.testing.expect(report.counts(.style_next_style).present > 0);
        try std.testing.expect(report.counts(.paragraph_border_fill).present > 0);
    }
    const encrypted = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx", a, .limited(1_000_000));
    defer a.free(encrypted);
    var encrypted_document = try package.inspectDocument(a, encrypted, .{});
    defer encrypted_document.deinit(a);
    if (encrypted_document.inspectHeaderReferences(a, .{})) |_| return error.TestExpectedError else |err| try std.testing.expectEqual(error.EncryptedDocument, err);
}

test "HWPX header links allocation failures and ReleaseFast cleanup" {
    const a = std.testing.allocator;
    const bytes = try syntheticStructureZip(a, header_links, structure_section);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(allocator, source, .{});
            defer document.deinit(allocator);
            _ = try document.inspectHeaderReferences(allocator, .{});
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    _ = try document.inspectHeaderReferences(checked.allocator(), .{});
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

const font_header = resource_prefix ++
    "<h:fontfaces itemCnt=\"7\">" ++
    "<h:fontface lang=\"HANGUL\" fontCnt=\"2\"><h:font id=\"&#55;\"/><h:font id=\"3\"/></h:fontface>" ++
    "<h:fontface lang=\"LATIN\" fontCnt=\"1\"><h:font id=\"9\"/></h:fontface>" ++
    "<h:fontface lang=\"HANJA\" fontCnt=\"1\"><h:font id=\"0\"/></h:fontface>" ++
    "<h:fontface lang=\"JAPANESE\" fontCnt=\"1\"><h:font id=\"0\"/></h:fontface>" ++
    "<h:fontface lang=\"OTHER\" fontCnt=\"1\"><h:font id=\"0\"/></h:fontface>" ++
    "<h:fontface lang=\"SYMBOL\" fontCnt=\"1\"><h:font id=\"0\"/></h:fontface>" ++
    "<h:fontface lang=\"USER\" fontCnt=\"1\"><h:font id=\"0\"/></h:fontface>" ++
    "</h:fontfaces><h:charProperties><h:charPr id=\"5\"><h:fontRef latin=\"9\" hangul=\"7\" hanja=\"0\" japanese=\"0\" other=\"0\" symbol=\"0\" user=\"0\"/></h:charPr><h:charPr id=\"6\"/></h:charProperties>" ++ resource_suffix;

fn expectFontReferenceError(a: std.mem.Allocator, header: []const u8, options: package.FontReferenceOptions, expected: anyerror) !void {
    const bytes = try syntheticStructureZip(a, header, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    if (document.inspectFontReferences(a, options)) |value| {
        var unexpected = value;
        unexpected.deinit(a);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(expected, err);
}

test "HWPX font references resolve sparse IDs within their own language" {
    const a = std.testing.allocator;
    const bytes = try syntheticStructureZip(a, font_header, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectFontReferences(a, .{});
    defer report.deinit(a);
    try std.testing.expect(report.faces.fontfaces_present);
    try std.testing.expectEqual(@as(?bool, true), report.faces.languageCountMatches());
    try std.testing.expect(report.faces.table(.hangul).hasId(7));
    try std.testing.expect(!report.faces.table(.hangul).hasId(9));
    try std.testing.expect(report.faces.table(.latin).hasId(9));
    try std.testing.expect(!report.faces.table(.latin).hasId(7));
    try std.testing.expectEqual(@as(usize, 2), report.references.character_shapes);
    try std.testing.expectEqual(@as(usize, 1), report.references.font_ref_elements);
    try std.testing.expectEqual(@as(usize, 1), report.references.character_shapes_without_font_ref);
    try std.testing.expectEqual(@as(usize, 0), report.references.extra_font_ref_elements);
    for ([_]package.FontLanguage{ .hangul, .latin, .hanja, .japanese, .other, .symbol, .user }) |language| {
        try std.testing.expectEqual(@as(?bool, true), report.faces.table(language).countMatches());
        try std.testing.expectEqual(@as(usize, 1), report.references.counts(language).resolved);
        try std.testing.expectEqual(@as(usize, 0), report.references.counts(language).missing_target);
        try std.testing.expectEqual(@as(usize, 0), report.references.counts(language).absent_table);
    }
}

test "HWPX font references distinguish absent language, ID and attribute" {
    const a = std.testing.allocator;
    const header = resource_prefix ++
        "<h:fontfaces itemCnt=\"1\"><h:fontface lang=\"HANGUL\" fontCnt=\"1\"><h:font id=\"5\"/></h:fontface></h:fontfaces>" ++
        "<h:charProperties><h:charPr id=\"0\"><h:fontRef hangul=\"0\" latin=\"0\"/></h:charPr></h:charProperties>" ++ resource_suffix;
    const bytes = try syntheticStructureZip(a, header, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectFontReferences(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.references.counts(.hangul).missing_target);
    try std.testing.expectEqual(@as(?u32, 0), report.references.counts(.hangul).first_unresolved_id);
    try std.testing.expect(report.references.counts(.hangul).first_unresolved_item_index != null);
    try std.testing.expectEqual(@as(usize, 1), report.references.counts(.latin).absent_table);
    try std.testing.expectEqual(@as(usize, 0), report.references.counts(.latin).missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.references.counts(.user).absent);

    const spoofed = resource_prefix ++
        "<h:fontfaces><h:fontface lang=\"HANGUL\"><h:font id=\"0\"/></h:fontface></h:fontfaces>" ++
        "<h:charProperties xmlns:x=\"urn:wrong\"><h:charPr id=\"0\"><x:fontRef hangul=\"999\"/><h:fontRef x:hangul=\"999\"/></h:charPr></h:charProperties>" ++ resource_suffix;
    const spoofed_bytes = try syntheticStructureZip(a, spoofed, structure_section);
    defer a.free(spoofed_bytes);
    var spoofed_document = try package.inspectDocument(a, spoofed_bytes, .{});
    defer spoofed_document.deinit(a);
    var spoofed_report = try spoofed_document.inspectFontReferences(a, .{});
    defer spoofed_report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), spoofed_report.references.font_ref_elements);
    try std.testing.expectEqual(@as(usize, 1), spoofed_report.references.counts(.hangul).absent);
    try std.testing.expectEqual(@as(usize, 0), spoofed_report.references.counts(.hangul).missing_target);
}

test "HWPX font count disagreements, absent group and repeated fontRef stay explicit" {
    const a = std.testing.allocator;
    const mismatch = resource_prefix ++
        "<h:fontfaces itemCnt=\"2\"><h:fontface lang=\"HANGUL\" fontCnt=\"2\"><h:font id=\"5\"/></h:fontface></h:fontfaces>" ++
        "<h:charProperties><h:charPr id=\"0\"><h:fontRef hangul=\"5\"/><h:fontRef hangul=\"5\"/></h:charPr></h:charProperties>" ++ resource_suffix;
    const bytes = try syntheticStructureZip(a, mismatch, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectFontReferences(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(?bool, false), report.faces.languageCountMatches());
    try std.testing.expectEqual(@as(?bool, false), report.faces.table(.hangul).countMatches());
    try std.testing.expectEqual(@as(usize, 2), report.references.font_ref_elements);
    try std.testing.expectEqual(@as(usize, 1), report.references.extra_font_ref_elements);
    try std.testing.expectEqual(@as(usize, 2), report.references.counts(.hangul).resolved);

    const absent_group = resource_prefix ++
        "<h:charProperties><h:charPr id=\"0\"><h:fontRef hangul=\"0\"/></h:charPr></h:charProperties>" ++ resource_suffix;
    const absent_bytes = try syntheticStructureZip(a, absent_group, structure_section);
    defer a.free(absent_bytes);
    var absent_document = try package.inspectDocument(a, absent_bytes, .{});
    defer absent_document.deinit(a);
    var absent_report = try absent_document.inspectFontReferences(a, .{});
    defer absent_report.deinit(a);
    try std.testing.expect(!absent_report.faces.fontfaces_present);
    try std.testing.expectEqual(@as(?bool, null), absent_report.faces.languageCountMatches());
    try std.testing.expectEqual(@as(usize, 1), absent_report.references.counts(.hangul).absent_table);
    try std.testing.expectEqual(@as(?u32, 0), absent_report.references.counts(.hangul).first_unresolved_id);

    const outside = resource_prefix ++
        "<h:charProperties><h:charPr id=\"0\"><h:fontRef hangul=\"7\"/></h:charPr></h:charProperties>" ++
        "</h:refList><h:other><h:fontfaces><h:fontface lang=\"HANGUL\"><h:font id=\"7\"/></h:fontface></h:fontfaces></h:other></h:head>";
    const outside_bytes = try syntheticStructureZip(a, outside, structure_section);
    defer a.free(outside_bytes);
    var outside_document = try package.inspectDocument(a, outside_bytes, .{});
    defer outside_document.deinit(a);
    var outside_report = try outside_document.inspectFontReferences(a, .{});
    defer outside_report.deinit(a);
    try std.testing.expect(!outside_report.faces.fontfaces_present);
    try std.testing.expectEqual(@as(usize, 1), outside_report.references.counts(.hangul).absent_table);

    const undeclared = resource_prefix ++
        "<h:fontfaces><h:fontface lang=\"HANGUL\"><h:font id=\"0\"/></h:fontface></h:fontfaces>" ++ resource_suffix;
    const undeclared_bytes = try syntheticStructureZip(a, undeclared, structure_section);
    defer a.free(undeclared_bytes);
    var undeclared_document = try package.inspectDocument(a, undeclared_bytes, .{});
    defer undeclared_document.deinit(a);
    var undeclared_report = try undeclared_document.inspectFontReferences(a, .{});
    defer undeclared_report.deinit(a);
    try std.testing.expect(undeclared_report.faces.fontfaces_present);
    try std.testing.expectEqual(@as(?bool, null), undeclared_report.faces.languageCountMatches());
    try std.testing.expect(undeclared_report.faces.table(.hangul).present);
    try std.testing.expectEqual(@as(?bool, null), undeclared_report.faces.table(.hangul).countMatches());
    try std.testing.expect(undeclared_report.faces.table(.hangul).hasId(0));
}

test "HWPX font face inventory rejects bad language, IDs and duplicates" {
    const a = std.testing.allocator;
    const cases = [_]struct { xml: []const u8, expected: anyerror }{
        .{ .xml = resource_prefix ++ "<h:fontfaces><h:fontface><h:font id=\"0\"/></h:fontface></h:fontfaces>" ++ resource_suffix, .expected = error.MissingFontLanguage },
        .{ .xml = resource_prefix ++ "<h:fontfaces><h:fontface lang=\"KOREAN\"/></h:fontfaces>" ++ resource_suffix, .expected = error.InvalidFontLanguage },
        .{ .xml = resource_prefix ++ "<h:fontfaces><h:fontface lang=\"HANGUL\"/><h:fontface lang=\"HANGUL\"/></h:fontfaces>" ++ resource_suffix, .expected = error.DuplicateFontLanguage },
        .{ .xml = resource_prefix ++ "<h:fontfaces><h:fontface lang=\"HANGUL\"><h:font/></h:fontface></h:fontfaces>" ++ resource_suffix, .expected = error.MissingFontId },
        .{ .xml = resource_prefix ++ "<h:fontfaces><h:fontface lang=\"HANGUL\"><h:font id=\"4294967296\"/></h:fontface></h:fontfaces>" ++ resource_suffix, .expected = error.InvalidFontId },
        .{ .xml = resource_prefix ++ "<h:fontfaces><h:fontface lang=\"HANGUL\"><h:font id=\"03\"/><h:font id=\"3\"/></h:fontface></h:fontfaces>" ++ resource_suffix, .expected = error.DuplicateFontId },
        .{ .xml = resource_prefix ++ "<h:fontfaces itemCnt=\"bad\"/>" ++ resource_suffix, .expected = error.InvalidFontCount },
        .{ .xml = resource_prefix ++ "<h:fontfaces><h:fontface lang=\"HANGUL\" fontCnt=\"4294967296\"/></h:fontfaces>" ++ resource_suffix, .expected = error.InvalidFontCount },
        .{ .xml = resource_prefix ++ "<h:fontfaces/><h:fontfaces/>" ++ resource_suffix, .expected = error.DuplicateFontfaces },
    };
    for (cases) |case| try expectFontReferenceError(a, case.xml, .{}, case.expected);
}

test "HWPX font references reject bad numbers and honor exact budgets" {
    const a = std.testing.allocator;
    const invalid = resource_prefix ++ "<h:charProperties><h:charPr id=\"0\"><h:fontRef hangul=\"bad\"/></h:charPr></h:charProperties>" ++ resource_suffix;
    try expectFontReferenceError(a, invalid, .{}, error.InvalidResourceReferenceId);
    const overflow = resource_prefix ++ "<h:charProperties><h:charPr id=\"0\"><h:fontRef hangul=\"4294967296\"/></h:charPr></h:charProperties>" ++ resource_suffix;
    try expectFontReferenceError(a, overflow, .{}, error.InvalidResourceReferenceId);
    const bytes = try syntheticStructureZip(a, font_header, structure_section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectFontReferences(a, .{ .faces = .{ .max_xml_bytes = font_header.len }, .references = .{ .max_xml_bytes = font_header.len } });
    report.deinit(a);
    try expectFontReferenceError(a, font_header, .{ .faces = .{ .max_xml_bytes = font_header.len - 1 } }, error.LimitExceeded);
    try expectFontReferenceError(a, font_header, .{ .references = .{ .max_xml_bytes = font_header.len - 1 } }, error.LimitExceeded);
    try expectFontReferenceError(a, font_header, .{ .faces = .{ .max_font_ids = 1 } }, error.LimitExceeded);
    try expectFontReferenceError(a, font_header, .{ .faces = .{ .max_attribute_bytes = 0 } }, error.LimitExceeded);
    try expectFontReferenceError(a, font_header, .{ .references = .{ .max_attribute_bytes = 0 } }, error.LimitExceeded);
}

test "HWPX real font references traverse example and noori and reject encryption" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "example", "noori" }) |name| {
        const bytes = try loadFixture(a, name);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        var report = try document.inspectFontReferences(a, .{});
        defer report.deinit(a);
        try std.testing.expect(report.faces.fontfaces_present);
        try std.testing.expectEqual(@as(?bool, true), report.faces.languageCountMatches());
        try std.testing.expect(report.references.character_shapes > 0);
        try std.testing.expect(report.references.font_ref_elements > 0);
        try std.testing.expectEqual(@as(usize, 0), report.references.character_shapes_without_font_ref);
    }
    const encrypted = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx", a, .limited(1_000_000));
    defer a.free(encrypted);
    var encrypted_document = try package.inspectDocument(a, encrypted, .{});
    defer encrypted_document.deinit(a);
    if (encrypted_document.inspectFontReferences(a, .{})) |value| {
        var unexpected = value;
        unexpected.deinit(a);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(error.EncryptedDocument, err);
}

test "HWPX font references allocation failures and ReleaseFast cleanup" {
    const a = std.testing.allocator;
    const bytes = try syntheticStructureZip(a, font_header, structure_section);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(allocator, source, .{});
            defer document.deinit(allocator);
            var report = try document.inspectFontReferences(allocator, .{});
            report.deinit(allocator);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    var report = try document.inspectFontReferences(checked.allocator(), .{});
    report.deinit(checked.allocator());
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

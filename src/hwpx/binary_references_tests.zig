const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
    "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"s0\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"image1\" href=\"BinData/image1.png\" media-type=\"image/png\" isEmbeded=\"1\"/>" ++
    "<p:item id=\"font1\" href=\"BinData/font1.ttf\" media-type=\"font/ttf\" isEmbeded=\"1\"/>" ++
    "<p:item id=\"ole1\" href=\"BinData/ole1.bin\" media-type=\"application/octet-stream\" isEmbeded=\"1\"/>" ++
    "<p:item id=\"external1\" href=\"https://example.invalid/image.png\" media-type=\"image/png\" isEmbeded=\"0\"/>" ++
    "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"s0\"/></p:spine></p:package>";
const header_prefix = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\" xmlns:c=\"http://www.hancom.co.kr/hwpml/2011/core\" secCnt=\"1\"><h:refList>";
const header_suffix = "</h:refList></h:head>";
const section_prefix = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\" xmlns:c=\"http://www.hancom.co.kr/hwpml/2011/core\"><p:p><p:run>";
const section_suffix = "</p:run></p:p></s:sec>";
const complete_header = header_prefix ++
    "<h:fontfaces><h:fontface lang=\"HANGUL\"><h:font id=\"0\" binaryItemIDRef=\"font1\"><h:substFont binaryItemIDRef=\"font1\"/></h:font></h:fontface></h:fontfaces>" ++
    "<h:borderFills><h:borderFill id=\"1\"><c:fillBrush><c:imgBrush><c:img binaryItemIDRef=\"image1\"/></c:imgBrush></c:fillBrush></h:borderFill></h:borderFills>" ++ header_suffix;
const complete_section = section_prefix ++
    "<p:pic><c:img binaryItemIDRef=\"image&#49;\"/></p:pic>" ++
    "<p:pic><c:img binaryItemIDRef=\"external1\"/></p:pic>" ++
    "<p:ole binaryItemIDRef=\"ole1\"/>" ++
    "<p:rect><c:fillBrush><c:imgBrush><c:img binaryItemIDRef=\"image1\"/></c:imgBrush></c:fillBrush></p:rect>" ++ section_suffix;

fn zipFor(a: std.mem.Allocator, header: []const u8, section: []const u8) ![]u8 {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = section },
        .{ .name = "BinData/image1.png", .data = "PNG" },
        .{ .name = "BinData/font1.ttf", .data = "FONT" },
        .{ .name = "BinData/ole1.bin", .data = "OLE" },
    };
    return fixture.storedZip(a, &sources);
}

fn inspect(a: std.mem.Allocator, header: []const u8, section: []const u8, options: package.BinaryReferenceOptions) !package.BinaryReferenceReport {
    const bytes = try zipFor(a, header, section);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectBinaryReferences(a, options);
}

fn expectError(a: std.mem.Allocator, header: []const u8, section: []const u8, options: package.BinaryReferenceOptions, expected: anyerror) !void {
    if (inspect(a, header, section, options)) |value| {
        var unexpected = value;
        unexpected.deinit(a);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(expected, err);
}

test "HWPX binary links resolve six source roles through exact manifest IDs" {
    var report = try inspect(std.testing.allocator, complete_header, complete_section, .{});
    defer report.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 7), report.observed_sites);
    for ([_]package.BinaryReferenceKind{ .header_font, .header_substitute_font, .header_brush_image, .section_brush_image, .section_ole }) |kind| {
        try std.testing.expectEqual(@as(usize, 1), report.counts(kind).resolved_embedded);
    }
    try std.testing.expectEqual(@as(usize, 1), report.counts(.section_picture).resolved_embedded);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.section_picture).resolved_external);
    try std.testing.expectEqual(@as(usize, 0), report.unclassified_attribute_sites);
    try std.testing.expectEqual(@as(?[]u8, null), report.first_missing_id);
}

test "HWPX binary links distinguish absent, empty, missing and unclassified sites" {
    const header = header_prefix ++
        "<h:fontfaces><h:fontface lang=\"HANGUL\"><h:font id=\"0\"><h:substFont binaryItemIDRef=\"\"/></h:font></h:fontface></h:fontfaces>" ++
        "<h:other><c:img binaryItemIDRef=\"image1\"/></h:other>" ++ header_suffix;
    const section = section_prefix ++
        "<p:pic><c:img binaryItemIDRef=\"missing\"/></p:pic>" ++
        "<p:pic><c:img xmlns:x=\"urn:wrong\" x:binaryItemIDRef=\"image1\"/></p:pic>" ++
        "<p:other><c:img binaryItemIDRef=\"image1\"/></p:other>" ++ section_suffix;
    var report = try inspect(std.testing.allocator, header, section, .{});
    defer report.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.header_font).absent);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.header_substitute_font).empty);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.section_picture).missing_target);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.section_picture).absent);
    try std.testing.expectEqualStrings("missing", report.first_missing_id.?);
    try std.testing.expectEqual(@as(?usize, 1), report.first_missing_item_index);
    try std.testing.expectEqual(@as(usize, 2), report.unclassified_attribute_sites);
    try std.testing.expectEqualStrings("image1", report.first_unclassified_id.?);
    try std.testing.expectEqual(@as(?usize, 0), report.first_unclassified_item_index);
}

test "HWPX binary links retain both conditional OLE branches without choosing one" {
    const section = section_prefix ++
        "<p:switch><p:case p:required-namespace=\"urn:example\"><p:ole binaryItemIDRef=\"external1\"/></p:case>" ++
        "<p:default><p:ole binaryItemIDRef=\"ole1\"/></p:default></p:switch>" ++ section_suffix;
    var report = try inspect(std.testing.allocator, header_prefix ++ header_suffix, section, .{});
    defer report.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 2), report.counts(.section_ole).sites);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.section_ole).resolved_external);
    try std.testing.expectEqual(@as(usize, 1), report.counts(.section_ole).resolved_embedded);
    try std.testing.expectEqual(@as(usize, 0), report.unclassified_attribute_sites);
}

test "HWPX binary links enforce exact XML, site and attribute limits" {
    const a = std.testing.allocator;
    var report = try inspect(a, complete_header, complete_section, .{ .references = .{ .max_header_xml_bytes = complete_header.len, .max_section_xml_bytes = complete_section.len, .max_total_xml_bytes = complete_header.len + complete_section.len, .max_sites = 7 } });
    report.deinit(a);
    try expectError(a, complete_header, complete_section, .{ .references = .{ .max_header_xml_bytes = complete_header.len - 1 } }, error.LimitExceeded);
    try expectError(a, complete_header, complete_section, .{ .references = .{ .max_section_xml_bytes = complete_section.len - 1 } }, error.LimitExceeded);
    try expectError(a, complete_header, complete_section, .{ .references = .{ .max_total_xml_bytes = complete_header.len + complete_section.len - 1 } }, error.LimitExceeded);
    try expectError(a, complete_header, complete_section, .{ .references = .{ .max_sites = 6 } }, error.LimitExceeded);
    try expectError(a, complete_header, complete_section, .{ .references = .{ .max_attribute_bytes = 0 } }, error.LimitExceeded);
}

test "HWPX binary links reject encrypted inputs before scanning content" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.EncryptedDocument, document.inspectBinaryReferences(a, .{}));
}

test "HWPX real picture and header brush links" {
    const a = std.testing.allocator;
    const cases = [_]struct { path: []const u8, kind: package.BinaryReferenceKind }{
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", .kind = .section_picture },
        .{ .path = "legacy/rust/crates/hwp-core/tests/fixtures/borderfill.hwpx", .kind = .header_brush_image },
    };
    for (cases) |case| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case.path, a, .limited(1_000_000));
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        var report = try document.inspectBinaryReferences(a, .{});
        defer report.deinit(a);
        try std.testing.expect(report.counts(case.kind).resolved_embedded + report.counts(case.kind).resolved_external > 0);
        try std.testing.expectEqual(@as(usize, 0), report.unclassified_attribute_sites);
        try std.testing.expectEqual(@as(?[]u8, null), report.first_missing_id);
    }
}

test "HWPX binary links cover allocation failures and ReleaseFast owned diagnostics" {
    const a = std.testing.allocator;
    const header = header_prefix ++ "<h:fontfaces><h:fontface lang=\"HANGUL\"><h:font id=\"0\" binaryItemIDRef=\"missing\"/></h:fontface></h:fontfaces><h:other><c:img binaryItemIDRef=\"image1\"/></h:other>" ++ header_suffix;
    const bytes = try zipFor(a, header, complete_section);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(allocator, source, .{});
            defer document.deinit(allocator);
            var report = try document.inspectBinaryReferences(allocator, .{});
            report.deinit(allocator);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    var report = try document.inspectBinaryReferences(checked.allocator(), .{});
    try std.testing.expect(report.first_missing_id != null);
    try std.testing.expect(report.first_unclassified_id != null);
    report.deinit(checked.allocator());
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

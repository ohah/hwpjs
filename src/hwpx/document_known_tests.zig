const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const synthetic_version = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>";
const synthetic_header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList/></h:head>";
const synthetic_section = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0' styleIDRef='0'><p:run><p:t>A</p:t></p:run></p:p></s:sec>";
const synthetic_hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/><o:item id='setting' href='settings.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const synthetic_sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = synthetic_hpf },
    .{ .name = "version.xml", .data = synthetic_version },
    .{ .name = "Contents/header.xml", .data = synthetic_header },
    .{ .name = "Contents/section0.xml", .data = synthetic_section },
    .{ .name = "settings.xml", .data = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app'><app:CaretPosition listIDRef='2' paraIDRef='0' pos='16'/></app:HWPApplicationSetting>" },
};
const encrypted_sources = synthetic_sources ++ [_]fixture.Source{.{ .name = "META-INF/manifest.xml", .data = "<m:manifest xmlns:m='urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'><m:file-entry full-path='Contents/header.xml'><m:encryption-data/></m:file-entry></m:manifest>" }};
const orphan_sources = synthetic_sources ++ [_]fixture.Source{.{ .name = "Unlisted/data.bin", .data = "hidden" }};

fn load(a: std.mem.Allocator, name: []const u8) ![]u8 {
    const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
    defer a.free(path);
    return std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(2_000_000));
}

test "HWPX known inspections compose every currently exposed document report" {
    const a = std.testing.allocator;
    const bytes = try load(a, "example");
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectKnown(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.structure.sections.len);
    try std.testing.expectEqual(document.archive.entries.len, report.payload_integrity.validated_entries);
    try std.testing.expectEqual(report.structure.sections.len, report.section_references.sections);
    try std.testing.expectEqual(report.structure.sections.len, report.binary_references.sections);
    try std.testing.expectEqual(report.structure.sections.len, report.chart_references.sections);
    try std.testing.expectEqual(report.structure.sections.len, report.section_text.sections);
    try std.testing.expectEqual(report.structure.sections.len, report.paragraph_metadata.sections);
    try std.testing.expectEqual(report.structure.sections.len, report.table_geometry.sections);
    try std.testing.expect(report.paragraph_metadata.paragraphs > 0);
}

test "HWPX known inspections include table geometry diagnostics and limits" {
    const a = std.testing.allocator;
    var sources = synthetic_sources;
    sources[5].data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0' styleIDRef='0'><p:run><p:tbl rowCnt='1' colCnt='2'><p:tr><p:tc><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/></p:tc></p:tr></p:tbl></p:run></p:p></s:sec>";
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectKnown(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.tables);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.cells);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.uncovered_slots);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .table_geometry = .{ .max_grid_slots = 1 } }));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var parsed = try package.inspectDocument(allocator, source, .{});
            defer parsed.deinit(allocator);
            var known = try parsed.inspectKnown(allocator, .{});
            defer known.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), known.table_geometry.uncovered_slots);
        }
    }.run, .{bytes});
}

test "HWPX known inspections keep separate phase limits and release on late failure" {
    const a = std.testing.allocator;
    const bytes = try load(a, "example");
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .trees = .{ .max_total_elements = 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .begin_numbers = .{ .max_attribute_bytes = 0 } }));
    var retry = try document.inspectKnown(a, .{});
    retry.deinit(a);
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(checked.allocator(), .{ .trees = .{ .max_total_elements = 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(checked.allocator(), .{ .begin_numbers = .{ .max_attribute_bytes = 0 } }));
    var checked_success = try document.inspectKnown(checked.allocator(), .{});
    checked_success.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX known report owns values after source document release" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &synthetic_sources);
    var document = try package.inspectDocument(a, bytes, .{});
    var report = try document.inspectKnown(a, .{});
    document.deinit(a);
    a.free(bytes);
    defer report.deinit(a);
    try std.testing.expectEqualStrings("1", report.begin_numbers.value(.page).?);
    try std.testing.expectEqual(@as(usize, 1), report.structure.sections.len);
    try std.testing.expectEqual(@as(usize, 1), report.paragraph_metadata.paragraphs);
    try std.testing.expectEqualStrings("16", report.settings.carets[0].pos.?);
    try std.testing.expectEqual(synthetic_sources.len, report.payload_integrity.validated_entries);
    try std.testing.expectEqual(@as(usize, 1), report.section_references.counts(.style).absent_table);
}

test "HWPX known inspections own all phases across every allocation failure" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &synthetic_sources);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(allocator, source, .{});
            defer document.deinit(allocator);
            var report = try document.inspectKnown(allocator, .{});
            defer report.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), report.structure.sections.len);
            try std.testing.expectEqual(@as(usize, 1), report.paragraph_metadata.paragraphs);
            try std.testing.expectEqualStrings("16", report.settings.carets[0].pos.?);
            try std.testing.expectEqual(@as(usize, 1), report.section_references.counts(.style).absent_table);
            try std.testing.expectEqualStrings("1", report.begin_numbers.value(.page).?);
        }
    }.run, .{bytes});
}

test "HWPX known inspections reject encrypted packages before semantic phases without leaks" {
    var sources = encrypted_sources;
    sources[3].data = "<wrong/>";
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    try std.testing.expectError(error.EncryptedDocument, document.inspectKnown(checked.allocator(), .{}));
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX known inspections check unlisted payload bytes before XML phases" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &orphan_sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const orphan = document.archive.find("Unlisted/data.bin") orelse return error.MissingEntry;
    bytes[@intFromPtr(orphan.compressed.ptr) - @intFromPtr(bytes.ptr)] ^= 1;
    try std.testing.expectError(error.InvalidCrc, document.inspectKnown(a, .{}));
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .payload_integrity = .{ .max_total_decoded_bytes = 0 } }));
}

test "HWPX known inspections reject malformed manifest XML outside the spine" {
    const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/><o:item id='settings' href='settings.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    var sources = synthetic_sources;
    sources[2].data = hpf;
    sources[6].data = "<settings>";
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.UnclosedXmlElement, document.inspectKnown(a, .{}));
}

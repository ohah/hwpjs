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
    try std.testing.expectEqual(report.paragraph_metadata.paragraphs, report.paragraph_children.paragraphs);
    try std.testing.expectEqual(report.section_text.paragraphs_without_direct_run, report.paragraph_children.paragraphs_without_run);
    try std.testing.expectEqual(report.paragraph_children.line_seg_arrays, report.line_segments.arrays);
    try std.testing.expectEqual(report.structure.sections.len, report.line_segments.sections);
    try std.testing.expectEqual(report.structure.sections.len, report.table_geometry.sections);
    try std.testing.expectEqual(report.structure.sections.len, report.page_geometry.sections);
    try std.testing.expectEqual(@as(usize, 1), report.page_geometry.pages.len);
    try std.testing.expectEqual(package.PageGeometryPage{ .section_ordinal = 0, .element_index = report.page_geometry.pages[0].element_index, .orientation = .narrowly, .width = 59528, .height = 84188, .gutter_type = .left_only, .margin = .{ .header = 4252, .footer = 4252, .gutter = 0, .left = 8504, .right = 8504, .top = 5668, .bottom = 4252 } }, report.page_geometry.pages[0]);
    try std.testing.expect(report.paragraph_metadata.paragraphs > 0);
}

test "HWPX known inspections expose page geometry and independent file values" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "noori", "page" }, [_]u32{ 5669, 8504 }, [_]u32{ 4251, 4252 }, [_]u32{ 2834, 5668 }, [_]u32{ 2834, 4252 }) |name, expected_left, expected_header, expected_top, expected_bottom| {
        const bytes = try load(a, name);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        var report = try document.inspectKnown(a, .{});
        defer report.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), report.page_geometry.pages.len);
        const page = report.page_geometry.pages[0];
        try std.testing.expectEqual(package.PageGeometryPage{ .section_ordinal = 0, .element_index = page.element_index, .orientation = .widely, .width = 59528, .height = 84188, .gutter_type = .left_only, .margin = .{ .header = expected_header, .footer = expected_header, .gutter = 0, .left = expected_left, .right = expected_left, .top = expected_top, .bottom = expected_bottom } }, page);
        try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .page_geometry = .{ .max_pages = 0 } }));
    }
}

test "HWPX known inspections release page geometry after later failure" {
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    const a = checked.allocator();
    var sources = synthetic_sources;
    sources[5].data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0' styleIDRef='0'><p:run><p:secPr><p:pagePr width='10' height='20'><p:margin left='1'/></p:pagePr></p:secPr><p:t>A</p:t></p:run></p:p></s:sec>";
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const baseline = checked.total_requested_bytes;
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .paragraph_metadata = .{ .max_paragraphs = 0 } }));
    try std.testing.expectEqual(baseline, checked.total_requested_bytes);
}

test "HWPX known inspections include line segment raw values and limits" {
    const a = std.testing.allocator;
    var sources = synthetic_sources;
    sources[5].data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0' styleIDRef='0'><p:run><p:t>A</p:t></p:run><p:linesegarray><p:lineseg textpos='0' vertpos='-1' vertsize='2' textheight='3' baseline='4' spacing='-5' horzpos='-6' horzsize='7' flags='4294967295'/></p:linesegarray></p:p></s:sec>";
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectKnown(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.line_segments.arrays);
    try std.testing.expectEqual(@as(usize, 1), report.line_segments.segments);
    try std.testing.expectEqual(@as(usize, 1), report.line_segments.field_negative[1]);
    try std.testing.expectEqual(@as(usize, 1), report.line_segments.field_highbit[8]);
    try std.testing.expectEqual(@as(i64, 4294967295), report.line_segments.field_sum[8]);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .line_segments = .{ .max_segments = 0 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .line_segments = .{ .max_attribute_bytes = 1 } }));
}

test "HWPX known inspections include table geometry diagnostics and limits" {
    const a = std.testing.allocator;
    var sources = synthetic_sources;
    sources[4].data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:beginNum page='1' footnote='1' endnote='1' pic='1' tbl='1' equation='1'/><h:refList><h:borderFills itemCnt='1'><h:borderFill id='7'/></h:borderFills></h:refList></h:head>";
    sources[5].data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0' styleIDRef='0'><p:run><p:tbl rowCnt='1' colCnt='2' id='4294967295' textWrap='THROUGH' pageBreak='CELL' repeatHeader='1' noAdjust='false' cellSpacing='12' borderFillIDRef='7'><p:sz width='10' height='0'/><p:pos vertOffset='-2' horzOffset='4294967295'/><p:outMargin left='-3' right='4294967295'/><p:caption side='BOTTOM' fullSz='false' width='-1'><p:subList textDirection='HORIZONTAL'><p:p id='2'/></p:subList></p:caption><p:inMargin left='1' right='2' top='3' bottom='4'/><p:cellzoneList><p:cellzone startRowAddr='0' startColAddr='0' endRowAddr='0' endColAddr='1' borderFillIDRef='7'/></p:cellzoneList><p:tr><p:tc hasMargin='false' borderFillIDRef='7'><p:cellAddr rowAddr='0' colAddr='0'/><p:cellSpan rowSpan='1' colSpan='1'/><p:cellSz width='10' height='0'/><p:cellMargin left='-2' right='4294967295' top='0' bottom='1'/><p:subList textDirection='HORIZONTAL' textWidth='12'><p:p id='1'/></p:subList></p:tc></p:tr></p:tbl></p:run></p:p></s:sec>";
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectKnown(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.tables);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.cells);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_child_topology.rows);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_child_topology.cells);
    try std.testing.expectEqual(@as(usize, 5), report.table_geometry.table_child_topology.cell_known_direct);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_attributes.page_break.cell);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_attributes.repeat_header.true_value);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_attributes.border_fill_references.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_children.in_margins);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_children.zones);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_children.border_references.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_shape.tables);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_shape.table_fields[3].extension_enum);
    try std.testing.expectEqual(@as(i64, -2), report.table_geometry.table_shape.position.fields[9].sum);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_shape.position.fields[10].highbit);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_shape.caption_sub_lists);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.table_shape.caption_direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.uncovered_slots);
    try std.testing.expectEqual(@as(u64, 10), report.table_geometry.cell_fields.size_sum[0]);
    try std.testing.expectEqual(@as(i64, -2), report.table_geometry.cell_fields.margin_sum[0]);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.cell_fields.false_with_margin);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.cell_fields.border_fill_references.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.cell_sub_lists.sub_lists);
    try std.testing.expectEqual(@as(usize, 1), report.table_geometry.cell_sub_lists.direct_paragraphs);
    try std.testing.expect(report.paragraph_children.paragraphs >= 2);
    try std.testing.expectEqual(@as(usize, 2), report.paragraph_children.paragraphs_without_run);
    try std.testing.expectEqual(@as(u64, 12), report.table_geometry.cell_sub_lists.text_width_sum);
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .table_geometry = .{ .max_grid_slots = 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .paragraph_children = .{ .max_paragraphs = 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .table_geometry = .{ .max_attribute_bytes = 1 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(a, .{ .table_geometry = .{ .table_shape = .{ .max_shape_children = 3 } } }));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var parsed = try package.inspectDocument(allocator, source, .{});
            defer parsed.deinit(allocator);
            var known = try parsed.inspectKnown(allocator, .{});
            defer known.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 1), known.table_geometry.uncovered_slots);
            try std.testing.expectEqual(@as(usize, 1), known.table_geometry.table_attributes.border_fill_references.resolved);
            try std.testing.expectEqual(@as(usize, 1), known.table_geometry.table_children.border_references.resolved);
            try std.testing.expectEqual(@as(usize, 1), known.table_geometry.table_child_topology.cells);
            try std.testing.expectEqual(@as(usize, 1), known.table_geometry.table_shape.caption_sub_lists);
            try std.testing.expectEqual(@as(i64, 4294967295), known.table_geometry.cell_fields.margin_sum[1]);
            try std.testing.expectEqual(@as(usize, 1), known.table_geometry.cell_fields.border_fill_references.resolved);
            try std.testing.expectEqual(@as(u64, 12), known.table_geometry.cell_sub_lists.text_width_sum);
        }
    }.run, .{bytes});
}

test "HWPX known inspections distinguish missing border target from absent header table" {
    const a = std.testing.allocator;
    var sources = synthetic_sources;
    sources[5].data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='0' styleIDRef='0'><p:run><p:tbl rowCnt='1' colCnt='1' borderFillIDRef='0'><p:cellzoneList><p:cellzone borderFillIDRef='0'/></p:cellzoneList><p:tr><p:tc borderFillIDRef='7'/></p:tr></p:tbl></p:run></p:p></s:sec>";
    sources[4].data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList><h:borderFills itemCnt='1'><h:borderFill id='8'/></h:borderFills></h:refList></h:head>";
    const missing_bytes = try fixture.storedZip(a, &sources);
    defer a.free(missing_bytes);
    var missing_document = try package.inspectDocument(a, missing_bytes, .{});
    defer missing_document.deinit(a);
    var missing = try missing_document.inspectKnown(a, .{});
    defer missing.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), missing.table_geometry.cell_fields.border_fill_references.missing_target);
    try std.testing.expectEqual(@as(?u32, 7), missing.table_geometry.cell_fields.border_fill_references.first_unresolved_id);
    try std.testing.expectEqual(@as(?usize, 1), missing.table_geometry.cell_fields.border_fill_references.first_unresolved_item_index);
    try std.testing.expectEqual(@as(usize, 1), missing.table_geometry.table_attributes.border_fill_references.missing_target);
    try std.testing.expectEqual(@as(?u32, 0), missing.table_geometry.table_attributes.border_fill_references.first_unresolved_id);
    try std.testing.expectEqual(@as(?usize, 1), missing.table_geometry.table_attributes.border_fill_references.first_unresolved_item_index);
    try std.testing.expectEqual(@as(usize, 1), missing.table_geometry.table_children.border_references.missing_target);
    try std.testing.expectEqual(@as(?u32, 0), missing.table_geometry.table_children.border_references.first_unresolved_id);
    sources[4].data = synthetic_header;
    const absent_bytes = try fixture.storedZip(a, &sources);
    defer a.free(absent_bytes);
    var absent_document = try package.inspectDocument(a, absent_bytes, .{});
    defer absent_document.deinit(a);
    var absent = try absent_document.inspectKnown(a, .{});
    defer absent.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), absent.table_geometry.cell_fields.border_fill_references.absent_table);
    try std.testing.expectEqual(@as(usize, 0), absent.table_geometry.cell_fields.border_fill_references.missing_target);
    try std.testing.expectEqual(@as(usize, 1), absent.table_geometry.table_attributes.border_fill_references.absent_table);
    try std.testing.expectEqual(@as(usize, 1), absent.table_geometry.table_children.border_references.absent_table);
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

const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
    "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"section\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>" ++
    "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"section\"/></p:spine></p:package>";
const hpf_two = "<p:package xmlns:p=\"http://www.idpf.org/2007/opf/\"><p:manifest>" ++
    "<p:item id=\"header\" href=\"Contents/header.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"s0\" href=\"Contents/section0.xml\" media-type=\"application/xml\"/>" ++
    "<p:item id=\"s1\" href=\"Contents/section1.xml\" media-type=\"application/xml\"/>" ++
    "</p:manifest><p:spine><p:itemref idref=\"header\"/><p:itemref idref=\"s0\"/><p:itemref idref=\"s1\"/></p:spine></p:package>";
const header = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\" secCnt=\"1\"/>";
const section_prefix = "<s:sec xmlns:s=\"http://www.hancom.co.kr/hwpml/2011/section\" xmlns:p=\"http://www.hancom.co.kr/hwpml/2011/paragraph\"><p:p><p:run>";
const section_suffix = "</p:run></p:p></s:sec>";
const chart = "<c:chartSpace xmlns:c=\"http://schemas.openxmlformats.org/drawingml/2006/chart\"><c:chart/></c:chartSpace>";
const two_refs = section_prefix ++ "<p:chart chartIDRef=\"Chart/chart&#49;.xml\"/><p:chart chartIDRef=\"Chart/chart1.xml\"/>" ++ section_suffix;

fn zipFor(a: std.mem.Allocator, section: []const u8, chart_xml: []const u8) ![]u8 {
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = section },
        .{ .name = "Chart/chart1.xml", .data = chart_xml },
        .{ .name = "Chart/chart2.xml", .data = chart_xml },
    };
    return fixture.storedZip(a, &sources);
}

fn inspect(a: std.mem.Allocator, section: []const u8, chart_xml: []const u8, options: package.ChartReferenceOptions) !package.ChartReferenceReport {
    const bytes = try zipFor(a, section, chart_xml);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    return document.inspectChartReferences(a, options);
}

fn expectError(a: std.mem.Allocator, section: []const u8, chart_xml: []const u8, options: package.ChartReferenceOptions, expected: anyerror) !void {
    if (inspect(a, section, chart_xml, options)) |value| {
        var unexpected = value;
        unexpected.deinit(a);
        return error.TestExpectedError;
    } else |err| try std.testing.expectEqual(expected, err);
}

test "HWPX chart links use exact ZIP paths outside OPF manifest and validate unique XML" {
    var report = try inspect(std.testing.allocator, two_refs, chart, .{});
    defer report.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 1), report.sections);
    try std.testing.expectEqual(@as(usize, 2), report.chart_sites);
    try std.testing.expectEqual(@as(usize, 2), report.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.chart_parts);
    try std.testing.expectEqual(chart.len, report.chart_xml_bytes);
    try std.testing.expectEqual(@as(usize, 0), report.unclassified_attribute_sites);
}

test "HWPX chart links retain missing, invalid, empty, absent and unclassified paths" {
    const section = section_prefix ++
        "<p:chart/><p:chart chartIDRef=\"\"/><p:chart chartIDRef=\"Chart/missing.xml\"/>" ++
        "<p:chart chartIDRef=\"../Chart/chart1.xml\"/>" ++
        "<p:other chartIDRef=\"Chart/chart1.xml\"/>" ++
        "<p:chart xmlns:x=\"urn:wrong\" x:chartIDRef=\"Chart/chart1.xml\"/>" ++ section_suffix;
    var report = try inspect(std.testing.allocator, section, chart, .{});
    defer report.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 6), report.observed_sites);
    try std.testing.expectEqual(@as(usize, 5), report.chart_sites);
    try std.testing.expectEqual(report.chart_sites, report.absent + report.empty + report.missing_entry + report.invalid_path + report.resolved);
    try std.testing.expectEqual(@as(usize, 2), report.absent);
    try std.testing.expectEqual(@as(usize, 1), report.empty);
    try std.testing.expectEqual(@as(usize, 1), report.missing_entry);
    try std.testing.expectEqual(@as(usize, 1), report.invalid_path);
    try std.testing.expectEqualStrings("Chart/missing.xml", report.first_problem_ref.?);
    try std.testing.expectEqual(package.ChartProblemKind.missing_entry, report.first_problem_kind.?);
    try std.testing.expectEqual(@as(?usize, 1), report.first_problem_item_index);
    try std.testing.expectEqual(@as(usize, 1), report.unclassified_attribute_sites);
    try std.testing.expectEqualStrings("Chart/chart1.xml", report.first_unclassified_ref.?);
}

test "HWPX chart links label an invalid first problem without path fallback" {
    const section = section_prefix ++ "<p:chart chartIDRef=\"../Chart/chart1.xml\"/>" ++ section_suffix;
    var report = try inspect(std.testing.allocator, section, chart, .{});
    defer report.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 1), report.invalid_path);
    try std.testing.expectEqual(@as(usize, 0), report.resolved);
    try std.testing.expectEqualStrings("../Chart/chart1.xml", report.first_problem_ref.?);
    try std.testing.expectEqual(package.ChartProblemKind.invalid_path, report.first_problem_kind.?);
}

test "HWPX chart links scan both conditional branches" {
    const section = section_prefix ++ "<p:switch><p:case><p:chart chartIDRef=\"Chart/chart1.xml\"/></p:case><p:default><p:chart chartIDRef=\"Chart/chart1.xml\"/></p:default></p:switch>" ++ section_suffix;
    var report = try inspect(std.testing.allocator, section, chart, .{});
    defer report.deinit(std.testing.allocator);
    try std.testing.expectEqual(@as(usize, 2), report.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.chart_parts);
}

test "HWPX chart links share XML budgets and validated parts across spine sections" {
    const a = std.testing.allocator;
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf_two },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h=\"http://www.hancom.co.kr/hwpml/2011/head\" secCnt=\"2\"/>" },
        .{ .name = "Contents/section0.xml", .data = two_refs },
        .{ .name = "Contents/section1.xml", .data = two_refs },
        .{ .name = "Chart/chart1.xml", .data = chart },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectChartReferences(a, .{ .references = .{ .sections = .{ .max_total_section_xml_bytes = 2 * two_refs.len } } });
    try std.testing.expectEqual(@as(usize, 2), report.sections);
    try std.testing.expectEqual(@as(usize, 4), report.resolved);
    try std.testing.expectEqual(@as(usize, 1), report.chart_parts);
    try std.testing.expectEqual(2 * two_refs.len, report.section_xml_bytes);
    report.deinit(a);
    try std.testing.expectError(error.LimitExceeded, document.inspectChartReferences(a, .{ .references = .{ .sections = .{ .max_total_section_xml_bytes = 2 * two_refs.len - 1 } } }));
}

test "HWPX chart links reject malformed chart XML and wrong chart root" {
    try expectError(std.testing.allocator, two_refs, "<c:chartSpace", .{}, error.UnexpectedEnd);
    try expectError(std.testing.allocator, two_refs, "<x:chartSpace xmlns:x=\"urn:wrong\"/>", .{}, error.InvalidChartRoot);
}

test "HWPX chart links reject a corrupt referenced chart member CRC" {
    const a = std.testing.allocator;
    const bytes = try zipFor(a, two_refs, chart);
    defer a.free(bytes);
    const payload = std.mem.indexOf(u8, bytes, chart) orelse return error.TestExpectedEqual;
    bytes[payload] ^= 1;
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.InvalidCrc, document.inspectChartReferences(a, .{}));
}

test "HWPX chart links enforce exact section, chart, site and attribute budgets" {
    const a = std.testing.allocator;
    var report = try inspect(a, two_refs, chart, .{ .references = .{ .sections = .{ .max_section_xml_bytes = two_refs.len, .max_total_section_xml_bytes = two_refs.len, .max_sites = 2 }, .charts = .{ .max_chart_xml_bytes = chart.len, .max_total_chart_xml_bytes = chart.len, .max_chart_parts = 1 } } });
    report.deinit(a);
    try expectError(a, two_refs, chart, .{ .references = .{ .sections = .{ .max_section_xml_bytes = two_refs.len - 1 } } }, error.LimitExceeded);
    try expectError(a, two_refs, chart, .{ .references = .{ .sections = .{ .max_total_section_xml_bytes = two_refs.len - 1 } } }, error.LimitExceeded);
    try expectError(a, two_refs, chart, .{ .references = .{ .sections = .{ .max_sites = 1 } } }, error.LimitExceeded);
    try expectError(a, two_refs, chart, .{ .references = .{ .sections = .{ .max_attribute_bytes = 0 } } }, error.LimitExceeded);
    try expectError(a, two_refs, chart, .{ .references = .{ .charts = .{ .max_chart_xml_bytes = chart.len - 1 } } }, error.LimitExceeded);
    try expectError(a, two_refs, chart, .{ .references = .{ .charts = .{ .max_total_chart_xml_bytes = chart.len - 1 } } }, error.LimitExceeded);
    try expectError(a, two_refs, chart, .{ .references = .{ .charts = .{ .max_chart_parts = 0 } } }, error.LimitExceeded);
    const distinct = section_prefix ++ "<p:chart chartIDRef=\"Chart/chart1.xml\"/><p:chart chartIDRef=\"Chart/chart2.xml\"/>" ++ section_suffix;
    var both = try inspect(a, distinct, chart, .{ .references = .{ .charts = .{ .max_total_chart_xml_bytes = 2 * chart.len, .max_chart_parts = 2 } } });
    try std.testing.expectEqual(@as(usize, 2), both.chart_parts);
    try std.testing.expectEqual(2 * chart.len, both.chart_xml_bytes);
    both.deinit(a);
    try expectError(a, distinct, chart, .{ .references = .{ .charts = .{ .max_total_chart_xml_bytes = 2 * chart.len - 1 } } }, error.LimitExceeded);
    try expectError(a, distinct, chart, .{ .references = .{ .charts = .{ .max_chart_parts = 1 } } }, error.LimitExceeded);
}

test "HWPX chart links reject encryption before reading section XML" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.EncryptedDocument, document.inspectChartReferences(a, .{}));
}

test "HWPX chart links cover allocation failures and ReleaseFast owned diagnostics" {
    const a = std.testing.allocator;
    const section = section_prefix ++ "<p:chart chartIDRef=\"Chart/missing.xml\"/><p:other chartIDRef=\"Chart/chart1.xml\"/><p:chart chartIDRef=\"Chart/chart1.xml\"/>" ++ section_suffix;
    const bytes = try zipFor(a, section, chart);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8) !void {
            var document = try package.inspectDocument(allocator, source, .{});
            defer document.deinit(allocator);
            var report = try document.inspectChartReferences(allocator, .{});
            report.deinit(allocator);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    var report = try document.inspectChartReferences(checked.allocator(), .{});
    try std.testing.expect(report.first_problem_ref != null);
    try std.testing.expect(report.first_unclassified_ref != null);
    report.deinit(checked.allocator());
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

test "HWPX chart links keep archive and report allocators distinct" {
    const bytes = try zipFor(std.testing.allocator, two_refs, chart);
    defer std.testing.allocator.free(bytes);
    var archive_alloc: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = archive_alloc.deinit();
    var report_alloc: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = report_alloc.deinit();
    var document = try package.inspectDocument(archive_alloc.allocator(), bytes, .{});
    var report = try document.inspectChartReferences(report_alloc.allocator(), .{});
    report.deinit(report_alloc.allocator());
    document.deinit(archive_alloc.allocator());
    try std.testing.expectEqual(@as(usize, 0), archive_alloc.total_requested_bytes);
    try std.testing.expectEqual(@as(usize, 0), report_alloc.total_requested_bytes);
}

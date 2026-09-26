const std = @import("std");
const section_tree = @import("section_tree.zig");
const header_tree = @import("header_tree.zig");
const equation = @import("equation.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";
const suffix = "</s:sec>";

fn inspect(a: std.mem.Allocator, source: []const u8, options: equation.Options) !equation.Report {
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return equation.inspect(a, &.{tree}, options);
}

test "HWPX equation owns raw XML, fields, and mixed script content after tree release" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:p><p:run><p:equation id='9' zOrder='-1' numberingType='EQUATION' textWrap='SQUARE' textFlow='BOTH_SIDES' lock='0' dropcapstyle='None' version='Equation Version 60' baseLine='0' textColor='#A0b1C2' baseUnit='4294967295' lineMode='CHAR' font='F&amp;F' extra='kept'><p:sz width='20'/><p:script><![CDATA[a < b]]>&amp;c</p:script></p:equation></p:run></p:p>" ++ suffix;
    var report = try inspect(a, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 1), report.equations.len);
    try std.testing.expectEqual(@as(usize, 1), report.scripts.len);
    try std.testing.expectEqualStrings("a < b&c", report.scripts[0].value);
    try std.testing.expectEqual(@as(usize, 7), report.script_bytes);
    const begin = std.mem.indexOf(u8, source, "<p:equation").?;
    const end = std.mem.indexOfPos(u8, source, begin, "</p:equation>").? + "</p:equation>".len;
    try std.testing.expectEqualStrings(source[begin..end], report.equations[0].raw_xml);
    try std.testing.expectEqual(@as(usize, 0), report.equations[0].first_script);
    try std.testing.expectEqual(@as(usize, 0), report.scripts[0].equation_index);
    try std.testing.expectEqualStrings("Equation Version 60", report.equations[0].attributes.get(.version).?);
    try std.testing.expectEqualStrings("4294967295", report.equations[0].attributes.get(.base_unit).?);
    try std.testing.expectEqualStrings("F&F", report.equations[0].attributes.get(.font).?);
    try std.testing.expectEqual(@as(usize, 1), report.equations[0].other_children);
    try std.testing.expectEqual(@as(usize, 1), report.other_attributes);
    try std.testing.expectEqual(@as(usize, 1), report.inherited_shape[0].present);
    try std.testing.expectEqual(@as(usize, 1), report.inherited_shape[5].false_value);
    try std.testing.expectEqual(@as(usize, 0), report.unknown_line_modes);
}

test "HWPX equation keeps absent, empty, duplicate, and foreign boundary distinct" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:p><x:run><p:equation/></x:run><p:run>" ++
        "<x:equation><p:script>ignored</p:script></x:equation>" ++
        "<p:equation version=''><p:script/><p:script>A</p:script><x:script>foreign</x:script></p:equation>" ++
        "<p:equation lineMode='FUTURE' textColor='red'/></p:run></p:p><p:equation/>" ++ suffix;
    var report = try inspect(a, source, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.equations.len);
    try std.testing.expectEqual(@as(usize, 2), report.scripts.len);
    try std.testing.expectEqual(@as(usize, 2), report.out_of_scope_equations);
    try std.testing.expectEqual(@as(usize, 1), report.multiple_scripts);
    try std.testing.expectEqual(@as(usize, 1), report.without_script);
    try std.testing.expectEqualStrings("", report.equations[0].attributes.get(.version).?);
    try std.testing.expectEqual(@as(?[]const u8, null), report.equations[1].attributes.get(.version));
    try std.testing.expectEqualStrings("", report.scripts[0].value);
    try std.testing.expectEqualStrings("A", report.scripts[1].value);
    try std.testing.expectEqual(@as(usize, 1), report.equations[0].other_children);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_line_modes);
    try std.testing.expectEqual(@as(usize, 1), report.non_six_hex_colors);
}

test "HWPX equation reads default namespace and both UTF16 byte orders" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns='http://www.hancom.co.kr/hwpml/2011/paragraph'><p><run><equation font='A&amp;B'><script>X&#xAC00;<![CDATA[<]]></script></equation></run></p></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var report = try inspect(a, raw, .{});
        defer report.deinit();
        try std.testing.expectEqual(@as(usize, 1), report.equations.len);
        try std.testing.expectEqualStrings("A&B", report.equations[0].attributes.get(.font).?);
        try std.testing.expectEqualStrings("X가<", report.scripts[0].value);
        try std.testing.expectEqual(@as(usize, 2 * "<equation font='A&amp;B'><script>X&#xAC00;<![CDATA[<]]></script></equation>".len), report.equations[0].raw_xml.len);
    }
}

test "HWPX equation rejects invalid scalar, nested script, and wrong part order" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidUnsigned32, inspect(a, prefix ++ "<p:p><p:run><p:equation baseUnit='4294967296'/></p:run></p:p>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidNonNegativeInteger, inspect(a, prefix ++ "<p:p><p:run><p:equation baseLine='-1'/></p:run></p:p>" ++ suffix, .{}));
    try std.testing.expectError(error.InvalidEquationScriptChild, inspect(a, prefix ++ "<p:p><p:run><p:equation><p:script><p:t>x</p:t></p:script></p:equation></p:run></p:p>" ++ suffix, .{}));
    var header = try header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>", 0, .{});
    defer header.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, equation.inspect(a, &.{header}, .{}));
    var later = try section_tree.parse(a, prefix ++ suffix, 1, 1, .{});
    defer later.deinit(a);
    try std.testing.expectError(error.InvalidPartKind, equation.inspect(a, &.{later}, .{}));
}

test "HWPX equation enforces exact site, script, attribute, source, and content limits" {
    const a = std.testing.allocator;
    const source = prefix ++ "<p:p><p:run><p:equation font='ab'><p:script>xyz</p:script></p:equation></p:run></p:p>" ++ suffix;
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_equations = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_scripts = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_attribute_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_script_bytes = 2 }));
    var normal = try inspect(a, source, .{});
    const owned = normal.owned_bytes;
    normal.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_equations = 1, .max_scripts = 1, .max_attribute_bytes = 2, .max_script_bytes = 3, .max_owned_bytes = owned });
    exact.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, prefix ++ "<p:p><p:run><p:equation><p:sz/></p:equation></p:run></p:p>" ++ suffix, .{ .max_other_children = 0 }));
}

test "HWPX equation releases every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, prefix ++ "<p:p><p:run><p:equation font='f'><p:script><![CDATA[a < b]]>&amp;c</p:script></p:equation></p:run></p:p>" ++ suffix, .{});
            defer report.deinit();
            try std.testing.expectEqualStrings("a < b&c", report.scripts[0].value);
        }
    }.run, .{});
}

test "HWPX equation package and known inspections own independent results" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:p id='0' styleIDRef='0'><p:run><p:equation version='v'><p:sz width='123'/><p:script>x+y</p:script></p:equation></p:run></p:p>" ++ suffix;
    const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "version.xml", .data = "<v:HCFVersion xmlns:v='http://www.hancom.co.kr/hwpml/2011/version' major='5' minor='1'/>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'><h:refList/></h:head>" },
        .{ .name = "Contents/section0.xml", .data = section },
    };
    const bytes = try fixture.storedZip(a, &sources);
    var document = try package.inspectDocument(a, bytes, .{});
    var standalone = try document.inspectEquations(a, .{});
    var known = try document.inspectKnown(a, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(checked.allocator(), .{ .equations = .{ .max_equations = 0 } }));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    document.deinit(a);
    a.free(bytes);
    defer standalone.deinit();
    defer known.deinit(a);
    try std.testing.expectEqualStrings("x+y", standalone.scripts[0].value);
    try std.testing.expectEqualStrings("x+y", known.equations.scripts[0].value);
    try std.testing.expectEqualStrings("123", standalone.shape_children[0].get("width").?);
    try std.testing.expectEqualStrings("123", known.equations.shape_children[0].get("width").?);
    try std.testing.expectError(error.LimitExceeded, inspect(a, section, .{ .max_equations = 0 }));

    var with_table = sources;
    with_table[5].data = prefix ++ "<p:p id='0' styleIDRef='0'><p:run><p:equation><p:sz width='123'/><p:script>x</p:script></p:equation><p:tbl rowCnt='0' colCnt='0'/></p:run></p:p>" ++ suffix;
    const later_bytes = try fixture.storedZip(a, &with_table);
    defer a.free(later_bytes);
    var later_document = try package.inspectDocument(a, later_bytes, .{});
    defer later_document.deinit(a);
    var later_checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = later_checked.deinit();
    try std.testing.expectError(error.LimitExceeded, later_document.inspectKnown(later_checked.allocator(), .{ .table_geometry = .{ .max_tables = 0 } }));
    try std.testing.expectEqual(@as(usize, 0), later_checked.total_requested_bytes);
}

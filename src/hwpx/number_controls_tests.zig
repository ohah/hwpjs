const std = @import("std");
const section_tree = @import("section_tree.zig");
const numbers = @import("number_controls.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'><p:p><p:run>";
const suffix = "</p:run></p:p></s:sec>";

fn inspect(a: std.mem.Allocator, inner: []const u8, options: numbers.Options) !numbers.Report {
    const source = try std.mem.concat(a, u8, &.{ prefix, inner, suffix });
    defer a.free(source);
    var tree = try section_tree.parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    return numbers.inspect(a, &.{tree}, options);
}

test "HWPX number controls preserve lexical attributes and direct format order" {
    var report = try inspect(std.testing.allocator, "<p:ctrl><p:autoNum num='0' numType='PAGE' future='v'><p:autoNumFormat type='USER_CHAR' userChar='*' prefixChar='' suffixChar=')' supscript='0'/><x:autoNumFormat/><p:autoNumFormat type='DIGIT' supscript='true'><p:future/></p:autoNumFormat></p:autoNum>" ++
        "<p:newNum num='-1' numType='ENDNOTE'/>" ++
        "<p:pageNum pos='BOTTOM_CENTER' formatType='ROMAN_SMALL' sideChar='-' /></p:ctrl>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 3), report.controls.len);
    try std.testing.expectEqual(@as(usize, 2), report.formats.len);
    try std.testing.expectEqual(@as(usize, 1), report.auto_nums);
    try std.testing.expectEqual(@as(usize, 1), report.new_nums);
    try std.testing.expectEqual(@as(usize, 1), report.page_nums);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_children);
    try std.testing.expectEqual(@as(usize, 1), report.other_attributes);
    try std.testing.expectEqual(@as(usize, 1), report.leaf_children);
    try std.testing.expectEqualStrings("ctrl", report.controls[0].parent_local_name);
    try std.testing.expectEqualStrings("0", report.controls[0].auto.?.get(.num).?);
    try std.testing.expectEqual(@as(?i32, 0), report.controls[0].auto.?.num);
    try std.testing.expectEqual(@as(?i32, -1), report.controls[1].auto.?.num);
    try std.testing.expectEqual(@as(usize, 2), report.controls[0].format_count);
    try std.testing.expectEqualStrings("", report.formats[0].attributes.get(.prefix_char).?);
    try std.testing.expectEqual(@as(?bool, false), report.formats[0].attributes.supscript);
    try std.testing.expectEqual(@as(?bool, true), report.formats[1].attributes.supscript);
    try std.testing.expectEqualStrings("-", report.controls[2].page.?.get(.side_char).?);
}

test "HWPX number controls distinguish missing, empty and unknown" {
    var report = try inspect(std.testing.allocator, "<x:autoNum num='7'/><p:autoNum/><p:newNum numType='FUTURE'/><p:pageNum pos='' formatType='FUTURE' sideChar=''/>", .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 3), report.controls.len);
    try std.testing.expectEqual(@as(usize, 1), report.auto_missing_format);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_types);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_positions);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_formats);
    try std.testing.expect(report.controls[0].auto.?.get(.num) == null);
    try std.testing.expectEqualStrings("", report.controls[2].page.?.get(.side_char).?);
    try std.testing.expectError(error.InvalidXmlSigned32, inspect(std.testing.allocator, "<p:newNum num='' />", .{}));
    try std.testing.expectError(error.InvalidXmlSigned32, inspect(std.testing.allocator, "<p:autoNum num='2147483648' />", .{}));
    try std.testing.expectError(error.InvalidXmlBoolean, inspect(std.testing.allocator, "<p:autoNum><p:autoNumFormat supscript='yes'/></p:autoNum>", .{}));
}

test "HWPX number controls preserve unexpected children and parents" {
    var report = try inspect(std.testing.allocator, "<x:wrap><p:pageNum><p:autoNumFormat type='DIGIT'/><p:other/></p:pageNum></x:wrap>", .{});
    defer report.deinit();
    try std.testing.expectEqualStrings("urn:foreign", report.controls[0].parent_uri);
    try std.testing.expectEqual(@as(usize, 1), report.unexpected_format);
    try std.testing.expectEqual(@as(usize, 1), report.unknown_children);
}

test "HWPX number controls preserve section order and newNum format" {
    const a = std.testing.allocator;
    var first = try section_tree.parse(a, prefix ++ "<p:newNum num='+2' numType='PAGE'><p:autoNumFormat type='DIGIT' supscript='1'/></p:newNum>" ++ suffix, 0, 0, .{});
    defer first.deinit(a);
    var second = try section_tree.parse(a, prefix ++ "<p:pageNum pos='NONE'/>" ++ suffix, 1, 1, .{});
    defer second.deinit(a);
    var report = try numbers.inspect(a, &.{ first, second }, .{});
    defer report.deinit();
    try std.testing.expectEqual(@as(usize, 2), report.controls.len);
    try std.testing.expectEqual(@as(usize, 0), report.controls[0].section_ordinal);
    try std.testing.expectEqual(@as(usize, 1), report.controls[1].section_ordinal);
    try std.testing.expectEqual(@as(?i32, 2), report.controls[0].auto.?.num);
    try std.testing.expectEqual(@as(usize, 1), report.controls[0].format_count);
    try std.testing.expectEqualStrings("DIGIT", report.formats[0].attributes.get(.type).?);
    try std.testing.expect(std.mem.indexOf(u8, report.controls[0].raw_xml, "num='+2'") != null);
    try std.testing.expect(std.mem.indexOf(u8, report.formats[0].raw_xml, "supscript='1'") != null);
    try std.testing.expectEqual(@as(usize, 0), report.unexpected_format);
}

test "HWPX number controls decode UTF16 attribute values and parent names" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const encoding = if (order == .little) "UTF-16LE" else "UTF-16BE";
        const ascii = "<?xml version='1.0' encoding='" ++ encoding ++ "'?><s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run><p:autoNum num='0' numType='PAGE'><p:autoNumFormat type='USER_CHAR' userChar='&#xAC00;' supscript='0'/></p:autoNum></p:run></p:p></s:sec>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var tree = try section_tree.parse(a, raw, 0, 0, .{});
        defer tree.deinit(a);
        var report = try numbers.inspect(a, &.{tree}, .{});
        defer report.deinit();
        try std.testing.expectEqualStrings("run", report.controls[0].parent_local_name);
        try std.testing.expectEqualStrings("가", report.formats[0].attributes.get(.user_char).?);
    }
}

test "HWPX number controls enforce count and byte budgets" {
    const a = std.testing.allocator;
    const source = "<p:autoNum num='0' numType='PAGE'><p:autoNumFormat type='DIGIT' supscript='0'><p:future/></p:autoNumFormat></p:autoNum>";
    var report = try inspect(a, source, .{});
    const owned = report.owned_bytes;
    report.deinit();
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_controls = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_formats = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_direct_children = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_leaf_children = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_name_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_attribute_bytes = 0 }));
    try std.testing.expectError(error.LimitExceeded, inspect(a, source, .{ .max_owned_bytes = owned - 1 }));
    var exact = try inspect(a, source, .{ .max_owned_bytes = owned });
    exact.deinit();
}

test "HWPX number controls release all allocation failures" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try inspect(a, "<p:autoNum num='0' numType='PAGE'><p:autoNumFormat type='DIGIT' supscript='0'/></p:autoNum><p:pageNum pos='NONE' formatType='DIGIT' sideChar=''/>", .{});
            report.deinit();
        }
    }.run, .{});
}

test "HWPX number controls release invalid lexical paths in optimized builds" {
    for ([_][]const u8{
        "<p:autoNum num='2147483648'/>",
        "<p:autoNum num='0'><p:autoNumFormat supscript='yes'/></p:autoNum>",
    }) |source| {
        var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        defer _ = checked.deinit();
        const a = checked.allocator();
        if (inspect(a, source, .{})) |report| {
            var unexpected = report;
            unexpected.deinit();
            return error.ExpectedInvalidLexical;
        } else |err| {
            try std.testing.expect(err == error.InvalidXmlSigned32 or err == error.InvalidXmlBoolean);
        }
        try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    }
}

test "HWPX number controls survive package and source tree release" {
    const a = std.testing.allocator;
    const section = prefix ++ "<p:ctrl><p:autoNum num='0' numType='PAGE'><p:autoNumFormat type='DIGIT'/></p:autoNum></p:ctrl>" ++ suffix;
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
    var trees = try document.readXmlTrees(a, .{});
    var tree_report = try trees.inspectNumberControls(a, .{});
    trees.deinit(a);
    var direct = try document.inspectNumberControls(a, .{});
    var known = try document.inspectKnown(a, .{});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    try std.testing.expectError(error.LimitExceeded, document.inspectKnown(checked.allocator(), .{ .number_controls = .{ .max_controls = 0 } }));
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
    document.deinit(a);
    a.free(bytes);
    defer tree_report.deinit();
    defer direct.deinit();
    defer known.deinit(a);
    try std.testing.expectEqual(@as(?i32, 0), tree_report.controls[0].auto.?.num);
    try std.testing.expectEqual(@as(usize, 1), direct.formats.len);
    try std.testing.expectEqual(@as(usize, 1), known.number_controls.auto_nums);
}

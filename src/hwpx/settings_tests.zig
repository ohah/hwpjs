const std = @import("std");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const hpf = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
    "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
    "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
    "<o:item id='setting' href='settings.xml' media-type='application/xml'/>" ++
    "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
const setting = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app' " ++
    "xmlns:config='urn:oasis:names:tc:opendocument:xmlns:config:1.0'>" ++
    "<app:CaretPosition listIDRef='2' paraIDRef='0' pos='16'/>" ++
    "<config:config-item-set name='PrintInfo'>" ++
    "<config:config-item name='PrintMethod' type='short'>4</config:config-item>" ++
    "<config:config-item config:name='PrintAutoFootNote' config:type='boolean'>fa<![CDATA[ls]]>e</config:config-item>" ++
    "</config:config-item-set><app:Future/></app:HWPApplicationSetting>";
const sources = [_]fixture.Source{
    .{ .name = "mimetype", .data = package.mime },
    .{ .name = "META-INF/container.xml", .data = fixture.package_container },
    .{ .name = "Contents/content.hpf", .data = hpf },
    .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'/>" },
    .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>" },
    .{ .name = "settings.xml", .data = setting },
};

test "HWPX settings preserves raw caret and config values with extension diagnostics" {
    const a = std.testing.allocator;
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectSettings(a, .{});
    defer report.deinit(a);
    try std.testing.expect(report.present);
    try std.testing.expectEqual(@as(usize, 5), report.entry_index.?);
    try std.testing.expectEqual(@as(usize, 1), report.carets.len);
    try std.testing.expectEqualStrings("2", report.carets[0].list_id_ref.?);
    try std.testing.expectEqualStrings("16", report.carets[0].pos.?);
    try std.testing.expectEqual(@as(usize, 1), report.sets.len);
    try std.testing.expectEqualStrings("PrintInfo", report.sets[0].name.?);
    try std.testing.expectEqual(@as(usize, 2), report.sets[0].item_count);
    try std.testing.expectEqualStrings("4", report.items[0].value.items);
    try std.testing.expectEqualStrings("false", report.items[1].value.items);
    try std.testing.expectEqual(@as(usize, 1), report.other_elements);
    try std.testing.expectEqual(@as(usize, 0), report.unsupported_types);
}

test "HWPX settings absence stays absent" {
    const a = std.testing.allocator;
    var changed = sources;
    changed[2].data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
        "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
        "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectSettings(a, .{});
    defer report.deinit(a);
    try std.testing.expect(!report.present);
    try std.testing.expectEqual(@as(usize, 0), report.carets.len);
    try std.testing.expectEqual(@as(usize, 0), report.items.len);
}

test "HWPX settings keeps missing fields and unknown typed values distinct" {
    const a = std.testing.allocator;
    var changed = sources;
    changed[5].data = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app' xmlns:c='urn:oasis:names:tc:opendocument:xmlns:config:1.0'>" ++
        "<app:CaretPosition pos='0'/><c:config-item-set><c:config-item name='Future' type='opaque'>A&amp;B</c:config-item></c:config-item-set></app:HWPApplicationSetting>";
    const bytes = try fixture.storedZip(a, &changed);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectSettings(a, .{});
    defer report.deinit(a);
    try std.testing.expect(report.carets[0].list_id_ref == null);
    try std.testing.expect(report.carets[0].para_id_ref == null);
    try std.testing.expectEqualStrings("0", report.carets[0].pos.?);
    try std.testing.expect(report.sets[0].name == null);
    try std.testing.expectEqualStrings("opaque", report.items[0].type_name.?);
    try std.testing.expectEqualStrings("A&B", report.items[0].value.items);
    try std.testing.expectEqual(@as(usize, 1), report.unsupported_types);
}

test "HWPX settings rejects invalid roots, scalar values and tight limits" {
    const a = std.testing.allocator;
    for ([_]struct { xml: []const u8, expected: anyerror }{
        .{ .xml = "<wrong/>", .expected = error.InvalidSettingsRoot },
        .{ .xml = "<app:HWPApplicationSetting xmlns:app='http://www.owpml.org/owpml/2023/app'/>", .expected = error.UnsupportedHwpxNamespaceProfile },
        .{ .xml = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app'><app:CaretPosition pos='-1'/></app:HWPApplicationSetting>", .expected = error.InvalidNonNegativeInteger },
        .{ .xml = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app'><app:CaretPosition pos='4294967296'/></app:HWPApplicationSetting>", .expected = error.InvalidUnsigned32 },
        .{ .xml = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app' xmlns:c='urn:oasis:names:tc:opendocument:xmlns:config:1.0'><c:config-item-set><c:config-item type='short'>32768</c:config-item></c:config-item-set></app:HWPApplicationSetting>", .expected = error.InvalidXmlShort },
        .{ .xml = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app' xmlns:c='urn:oasis:names:tc:opendocument:xmlns:config:1.0'><c:config-item-set name='plain' c:name='qualified'/></app:HWPApplicationSetting>", .expected = error.AmbiguousConfigAttribute },
        .{ .xml = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app'><app:CaretPosition><app:Future/></app:CaretPosition></app:HWPApplicationSetting>", .expected = error.InvalidCaretChild },
        .{ .xml = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app'><app:CaretPosition>lost</app:CaretPosition></app:HWPApplicationSetting>", .expected = error.InvalidCaretContent },
        .{ .xml = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app' xmlns:c='urn:oasis:names:tc:opendocument:xmlns:config:1.0'><c:config-item-set><c:config-item type='boolean'><app:Future/></c:config-item></c:config-item-set></app:HWPApplicationSetting>", .expected = error.InvalidConfigItemChild },
        .{ .xml = "<app:HWPApplicationSetting xmlns:app='http://www.hancom.co.kr/hwpml/2011/app' xmlns:c='urn:oasis:names:tc:opendocument:xmlns:config:1.0'><c:config-item-set>lost</c:config-item-set></app:HWPApplicationSetting>", .expected = error.InvalidConfigSetContent },
    }) |mutation| {
        var changed = sources;
        changed[5].data = mutation.xml;
        const bytes = try fixture.storedZip(a, &changed);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try std.testing.expectError(mutation.expected, document.inspectSettings(a, .{}));
    }
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.LimitExceeded, document.inspectSettings(a, .{ .values = .{ .max_value_bytes = 4 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectSettings(a, .{ .values = .{ .max_carets = 0 } }));
    try std.testing.expectError(error.LimitExceeded, document.inspectSettings(a, .{ .values = .{ .max_items = 1 } }));
}

test "HWPX settings selection rejects duplicate, external and wrong media bindings" {
    const a = std.testing.allocator;
    for ([_]struct { item: []const u8, expected: anyerror }{
        .{ .item = "<o:item id='setting' href='settings.xml' media-type='application/octet-stream'/>", .expected = error.InvalidSettingsMediaType },
        .{ .item = "<o:item id='setting' href='settings.xml' media-type='application/xml' isEmbeded='0'/>", .expected = error.UnsupportedExternalSettings },
        .{ .item = "<o:item id='setting' href='settings.xml' media-type='application/xml'/><o:item id='alias' href='settings.xml' media-type='application/xml'/>", .expected = error.DuplicateSettingsItem },
    }) |mutation| {
        const prefix = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest>" ++
            "<o:item id='h' href='Contents/header.xml' media-type='application/xml'/>" ++
            "<o:item id='s' href='Contents/section0.xml' media-type='application/xml'/>";
        const suffix = "</o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>";
        const altered_hpf = try std.mem.concat(a, u8, &.{ prefix, mutation.item, suffix });
        defer a.free(altered_hpf);
        var changed = sources;
        changed[2].data = altered_hpf;
        const bytes = try fixture.storedZip(a, &changed);
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        try std.testing.expectError(mutation.expected, document.inspectSettings(a, .{}));
    }
}

test "HWPX settings standalone inspection refuses protected documents" {
    const a = std.testing.allocator;
    const protected = sources ++ [_]fixture.Source{.{ .name = "META-INF/manifest.xml", .data = "<m:manifest xmlns:m='urn:oasis:names:tc:opendocument:xmlns:manifest:1.0'><m:file-entry full-path='settings.xml'><m:encryption-data/></m:file-entry></m:manifest>" }};
    const bytes = try fixture.storedZip(a, &protected);
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    try std.testing.expectError(error.EncryptedDocument, document.inspectSettings(a, .{}));
}

test "HWPX settings releases every allocation failure" {
    const bytes = try fixture.storedZip(std.testing.allocator, &sources);
    defer std.testing.allocator.free(bytes);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator, input: []const u8) !void {
            var document = try package.inspectDocument(a, input, .{});
            defer document.deinit(a);
            var report = try document.inspectSettings(a, .{});
            report.deinit(a);
        }
    }.run, .{bytes});
}

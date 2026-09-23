const std = @import("std");
const header_tree = @import("header_tree.zig");
const part_tree = @import("xml_part_tree.zig");
const package = @import("package.zig");
const fixture = @import("test_package_fixture.zig");

const header = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:x='urn:extension' secCnt='1'>" ++
    "A<x:unknown x:ref='&#49;&amp;'>B<![CDATA[C]]><x:empty/></x:unknown>D</h:head>";

test "HWPX header tree owns raw unknown elements attributes and ordered content" {
    const a = std.testing.allocator;
    const input = try a.dupe(u8, header);
    var parsed = try header_tree.parse(a, input, 3, .{});
    a.free(input);
    defer parsed.deinit(a);
    try std.testing.expectEqual(@as(@TypeOf(parsed.part_kind), .header), parsed.part_kind);
    try std.testing.expectEqual(@as(?usize, null), parsed.section_ordinal);
    try std.testing.expectEqual(@as(usize, 3), parsed.item_index);
    try std.testing.expectEqualStrings(header, parsed.source);
    try std.testing.expectEqual(@as(usize, 3), parsed.elements.len);
    try std.testing.expect(parsed.elements[0].is("http://www.hancom.co.kr/hwpml/2011/head", "head"));
    try std.testing.expect(parsed.elements[1].is("urn:extension", "unknown"));
    try std.testing.expect(parsed.elements[2].is("urn:extension", "empty"));
    try std.testing.expectEqual(@as(?usize, 0), parsed.elements[1].parent);
    try std.testing.expectEqual(@as(?usize, 1), parsed.elements[2].parent);
    try std.testing.expectEqualStrings("<x:empty/>", parsed.sourceOf(2));
    const ref = (try parsed.attributeValue(a, 1, "urn:extension", "ref")).?;
    const value = try ref.toUtf8(a, 16);
    defer a.free(value);
    try std.testing.expectEqualStrings("1&", value);
    const C = struct {
        count: usize = 0,
        content: std.ArrayList(u8) = .empty,
        allocator: std.mem.Allocator,
        fn onEvent(raw: *anyopaque, event: header_tree.Tree.OrderedEvent) !void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            self.count += 1;
            if (event == .content) {
                const bytes = try event.content.value.toUtf8(self.allocator, 16);
                defer self.allocator.free(bytes);
                try self.content.appendSlice(self.allocator, bytes);
            }
        }
    };
    var collector: C = .{ .allocator = a };
    defer collector.content.deinit(a);
    try parsed.visitOrdered(a, .{ .context = &collector, .on_event = C.onEvent });
    try std.testing.expectEqual(@as(usize, 9), collector.count);
    try std.testing.expectEqualStrings("ABCD", collector.content.items);
}

test "HWPX header tree root profile and limits reject without partial success" {
    const a = std.testing.allocator;
    try std.testing.expectError(error.InvalidPartOrdinal, part_tree.parse(a, header, .header, 0, 0, .{}));
    try std.testing.expectError(error.InvalidPartOrdinal, part_tree.parse(a, header, .section, null, 0, .{}));
    try std.testing.expectError(error.InvalidHeaderRoot, header_tree.parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>", 0, .{}));
    try std.testing.expectError(error.UnsupportedHwpxNamespaceProfile, header_tree.parse(a, "<h:head xmlns:h='http://www.owpml.org/owpml/2021/head'/>", 0, .{}));
    try std.testing.expectError(error.InvalidHeaderRoot, header_tree.parse(a, "<h:head xmlns:h='http://www.owpml.org/owpml/2021/head/extra'/>", 0, .{}));
    try std.testing.expectError(error.LimitExceeded, header_tree.parse(a, header, 0, .{ .max_xml_bytes = header.len - 1 }));
    try std.testing.expectError(error.LimitExceeded, header_tree.parse(a, header, 0, .{ .max_nodes = 2 }));
    try std.testing.expectError(error.XmlElementNameMismatch, header_tree.parse(a, "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head'></wrong>", 0, .{}));
}

test "HWPX header tree accepts default namespace and UTF16 byte orders" {
    const a = std.testing.allocator;
    inline for (.{ std.builtin.Endian.little, std.builtin.Endian.big }) |order| {
        const ascii = if (order == .little)
            "<?xml version='1.0' encoding='UTF-16LE'?><head xmlns='http://www.hancom.co.kr/hwpml/2011/head'><x xmlns=''/></head>"
        else
            "<?xml version='1.0' encoding='UTF-16BE'?><head xmlns='http://www.hancom.co.kr/hwpml/2011/head'><x xmlns=''/></head>";
        const raw = try a.alloc(u8, 2 + ascii.len * 2);
        defer a.free(raw);
        @memcpy(raw[0..2], if (order == .little) "\xff\xfe" else "\xfe\xff");
        for (ascii, 0..) |character, index| std.mem.writeInt(u16, raw[2 + index * 2 ..][0..2], character, order);
        var parsed = try header_tree.parse(a, raw, 0, .{});
        defer parsed.deinit(a);
        try std.testing.expectEqualSlices(u8, raw, parsed.source);
        try std.testing.expectEqual(@as(usize, 2), parsed.elements.len);
        try std.testing.expect(parsed.elements[0].is("http://www.hancom.co.kr/hwpml/2011/head", "head"));
        try std.testing.expect(parsed.elements[1].is("", "x"));
    }
}

test "HWPX header tree selects package header and survives archive release" {
    const a = std.testing.allocator;
    const hpf = "<p:package xmlns:p='http://www.idpf.org/2007/opf/'><p:manifest>" ++
        "<p:item id='section' href='Contents/section0.xml' media-type='application/xml'/>" ++
        "<p:item id='header' href='Contents/header.xml' media-type='application/xml'/>" ++
        "</p:manifest><p:spine><p:itemref idref='section'/></p:spine></p:package>";
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
        .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section'/>" },
    };
    const bytes = try fixture.storedZip(a, &sources);
    var document = try package.inspectDocument(a, bytes, .{});
    try std.testing.expectError(error.LimitExceeded, document.readHeaderTree(a, .{ .tree = .{ .max_xml_bytes = header.len - 1 } }));
    var parsed = try document.readHeaderTree(a, .{});
    document.deinit(a);
    a.free(bytes);
    defer parsed.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), parsed.item_index);
    try std.testing.expectEqualStrings(header, parsed.source);
}

test "HWPX header tree releases every allocation on failure" {
    const a = std.testing.allocator;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator) !void {
            var parsed = try header_tree.parse(allocator, header, 0, .{});
            defer parsed.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), parsed.elements.len);
        }
    }.run, .{});
}

test "HWPX header tree package path releases every allocation on failure" {
    const a = std.testing.allocator;
    const hpf = "<p:package xmlns:p='http://www.idpf.org/2007/opf/'><p:manifest>" ++
        "<p:item id='header' href='Contents/header.xml' media-type='application/xml'/>" ++
        "</p:manifest><p:spine><p:itemref idref='header'/></p:spine></p:package>";
    const sources = [_]fixture.Source{
        .{ .name = "mimetype", .data = package.mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = hpf },
        .{ .name = "Contents/header.xml", .data = header },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, package_bytes: []const u8) !void {
            var document = try package.inspectDocument(allocator, package_bytes, .{});
            defer document.deinit(allocator);
            var parsed = try document.readHeaderTree(allocator, .{});
            defer parsed.deinit(allocator);
            try std.testing.expectEqual(@as(usize, 3), parsed.elements.len);
        }
    }.run, .{bytes});
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    defer _ = checked.deinit();
    var document = try package.inspectDocument(checked.allocator(), bytes, .{});
    try std.testing.expectError(error.LimitExceeded, document.readHeaderTree(checked.allocator(), .{ .tree = .{ .max_nodes = 2 } }));
    var parsed = try document.readHeaderTree(checked.allocator(), .{});
    parsed.deinit(checked.allocator());
    document.deinit(checked.allocator());
    try std.testing.expectEqual(@as(usize, 0), checked.total_requested_bytes);
}

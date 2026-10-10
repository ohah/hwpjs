//! 공개 선택 삭제 거래의 모든 할당 실패와 게시 경계를 검사합니다.
const std = @import("std");
const editor = @import("editor_session.zig");

test "HWPX public field selection deletion keeps old dirty state on every allocation failure" {
    const a = std.testing.allocator;
    const fixture = @import("test_package_fixture.zig");
    const input = try fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/section0.xml", .data = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='10'><p:run><p:ctrl><p:fieldBegin id='7' type='HYPERLINK' dirty='0'/></p:ctrl><p:t>A😀B</p:t><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl></p:run></p:p></s:sec>" },
    });
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const labels = try session.fieldLabels(0, 1);
    defer a.free(labels);
    try session.sections[0].field_dirty.append(a, .{ .element_index = labels[0].begin_element, .dirty = false });
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const editor.Session) !void {
            var proxy = source.*;
            proxy.allocator = allocator;
            proxy.sections = try allocator.dupe(editor.Section, source.sections);
            defer allocator.free(proxy.sections);
            proxy.sections[0].sites = try source.sections[0].sites.clone(allocator);
            defer proxy.sections[0].sites.deinit(allocator);
            proxy.sections[0].structure_values = null;
            defer if (proxy.sections[0].structure_values) |*values| values.deinit(allocator);
            proxy.sections[0].field_dirty = .empty;
            defer proxy.sections[0].field_dirty.deinit(allocator);
            try proxy.sections[0].field_dirty.appendSlice(allocator, source.sections[0].field_dirty.items);
            const changed = proxy.splitParagraph(0, 1, 0, 1) catch |err| {
                try std.testing.expect(proxy.sections[0].structure_values == null);
                try std.testing.expectEqual(source.sections[0].last_paragraph, proxy.sections[0].last_paragraph);
                try std.testing.expectEqualSlices(@import("text_sites_save.zig").FieldDirty, source.sections[0].field_dirty.items, proxy.sections[0].field_dirty.items);
                for (source.sections[0].sites.items, proxy.sections[0].sites.items) |before, after| try std.testing.expectEqualStrings(before.text, after.text);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqual(@as(usize, 2), proxy.sections[0].last_paragraph);
            try std.testing.expectEqual(@as(usize, 1), proxy.sections[0].field_dirty.items.len);
            try std.testing.expect(proxy.sections[0].field_dirty.items[0].dirty);
        }
    }.run, .{&session});
    var limited = session;
    limited.options.max_output_bytes = 1;
    try std.testing.expectError(error.LimitExceeded, limited.splitParagraph(0, 1, 0, 1));
    try std.testing.expect(session.sections[0].structure_values == null);
    try std.testing.expectEqual(@as(usize, 1), session.sections[0].last_paragraph);
    try std.testing.expect(!session.sections[0].field_dirty.items[0].dirty);
    try std.testing.expectEqualStrings("A😀B", session.sections[0].sites.items[0].text);
}

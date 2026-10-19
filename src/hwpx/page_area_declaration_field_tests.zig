const std = @import("std");
const snapshot = @import("page_area_declaration_snapshot.zig");
const editor = @import("editor_session.zig");

fn package(a: std.mem.Allocator, extra: []const u8) ![]u8 {
    const xml = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>" ++
        "<p:p><p:run><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>A😀</p:t>" ++
        "<p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl>{s}" ++
        "<p:ctrl><p:header id='2' applyPageType='BOTH'><p:subList><p:p><p:run><p:t>H</p:t></p:run></p:p></p:subList></p:header></p:ctrl>" ++
        "<p:t>Z</p:t></p:run></p:p></s:sec>", .{extra});
    defer a.free(xml);
    const fixture = @import("test_package_fixture.zig");
    return fixture.storedZip(a, &.{
        .{ .name = "mimetype", .data = "application/hwp+zip" },
        .{ .name = "META-INF/container.xml", .data = fixture.package_container },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='1'/>" },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/></o:spine></o:package>" },
        .{ .name = "Contents/section0.xml", .data = xml },
    });
}

test "page area field declaration uses current label width and cleans every failed query" {
    const a = std.testing.allocator;
    const input = try package(a, "");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const initial = try snapshot.read(a, &session, 0);
    defer a.free(initial);
    try std.testing.expectEqual(@as(usize, 1), initial.len);
    try std.testing.expectEqual(@as(u32, 3), initial[0].unit);
    const Query = struct {
        fn run(allocator: std.mem.Allocator, live: *const editor.Session, unit: u32) !void {
            const rows = try snapshot.read(allocator, live, 0);
            defer allocator.free(rows);
            try std.testing.expectEqual(@as(usize, 1), rows.len);
            try std.testing.expectEqual(unit, rows[0].unit);
        }
    };
    try @import("../testing/allocation_failures.zig").check(Query.run, .{ &session, @as(u32, 3) });
    const labels = try session.fieldLabels(0, 1);
    defer a.free(labels);
    try std.testing.expect(try session.spliceFieldLabel(0, 1, labels[0].begin_element, 0, 0, "한😀"));
    try @import("../testing/allocation_failures.zig").check(Query.run, .{ &session, @as(u32, 6) });
    const saved = try session.save();
    defer a.free(saved);
    var reopened = try editor.open(a, saved, .{});
    defer reopened.deinit();
    const restored = try snapshot.read(a, &reopened, 0);
    defer a.free(restored);
    try std.testing.expectEqual(@as(u32, 6), restored[0].unit);
    try std.testing.expectEqualSlices(u8, input, session.source);
}

test "page area field declaration does not hide unsupported sibling controls" {
    const a = std.testing.allocator;
    const input = try package(a, "<p:ctrl><p:unknown/></p:ctrl>");
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    try std.testing.expectError(error.UnsupportedParagraphControl, snapshot.read(a, &session, 0));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, input, saved);
}

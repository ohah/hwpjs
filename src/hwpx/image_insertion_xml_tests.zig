const std = @import("std");
const t = std.testing;
const a = t.allocator;
const insertion = @import("image_insertion_xml.zig");

fn fragment(allocator: std.mem.Allocator) ![]u8 {
    return insertion.create(allocator, .{ .width = 2835, .height = 1417 }, .{ .object_id = 1234, .instance_id = 5678, .resource_id = "hwpjs-insertion-0" }, 4096);
}

test "image insertion HX 인라인 XML을 기존 Native geometry·resource reader로 읽음" {
    const xml = try fragment(a);
    defer a.free(xml);
    const source = try std.fmt.allocPrint(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:hp='urn:other'><p:p><p:run>{s}</p:run></p:p></s:sec>", .{xml});
    defer a.free(source);
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    try t.expect(tree.elements[3].is("http://www.hancom.co.kr/hwpml/2011/paragraph", "pic"));
    const geometry = try @import("picture_geometry_values.zig").read(a, &tree, 3);
    try t.expectEqual(@as(?u32, 2835), geometry.width);
    try t.expectEqual(@as(?u32, 1417), geometry.height);
    try t.expectEqual(@as(?bool, true), geometry.treat_as_character);
    const points = try @import("picture_rectangle_values.zig").read(a, &tree, 3);
    try t.expectEqualDeep([2]?i64{ 2835, 1417 }, points.points[2]);
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is("http://www.hancom.co.kr/hwpml/2011/core", "img")) continue;
        const value = (try tree.attributeValue(a, index, "", "binaryItemIDRef")).?;
        const id = try value.toUtf8(a, 128);
        defer a.free(id);
        try t.expectEqualStrings("hwpjs-insertion-0", id);
        count += 1;
    }
    try t.expectEqual(@as(usize, 1), count);
    const manifest = @import("content_manifest.zig");
    const item: manifest.Item = .{ .id = @constCast("hwpjs-insertion-0"), .href = @constCast("BinData/hwpjs-insertion-0.png"), .media_type = @constCast("image/png"), .embedded = true, .entry_index = 0 };
    const index: manifest.Manifest = .{ .items = @constCast(&[_]manifest.Item{item}), .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var inventory = try @import("picture_image_links.zig").inspectSections(a, index, &.{tree}, .{});
    defer inventory.deinit(a);
    try t.expectEqual(@as(usize, 1), inventory.sites.len);
    try t.expectEqual(@as(usize, 1), inventory.count(.embedded));
}

test "image insertion HX 기하·식별자·XML 삽입·예산 거부" {
    const size: @import("../image/image_insertion.zig").Size = .{ .width = 1, .height = 2 };
    for ([_][]const u8{ "", "a' x='bad", "a\"/><x>", "&evil;", "한글" }) |id| {
        try t.expectError(error.InvalidPictureInsertionIdentity, insertion.create(a, size, .{ .object_id = 1, .instance_id = 1, .resource_id = id }, 4096));
    }
    try t.expectError(error.InvalidPictureInsertionIdentity, insertion.create(a, size, .{ .object_id = 0, .instance_id = 1, .resource_id = "id" }, 4096));
    try t.expectError(error.InvalidPictureInsertionSize, insertion.create(a, .{ .width = 0, .height = 1 }, .{ .object_id = 1, .instance_id = 1, .resource_id = "id" }, 4096));
    try t.expectError(error.LimitExceeded, insertion.create(a, size, .{ .object_id = 1, .instance_id = 1, .resource_id = "id" }, 1));
}

fn allocationCase(allocator: std.mem.Allocator) !void {
    const xml = try fragment(allocator);
    defer allocator.free(xml);
}
test "image insertion HX 생성기 모든 할당 실패 소유권" {
    try t.checkAllAllocationFailures(a, allocationCase, .{});
}

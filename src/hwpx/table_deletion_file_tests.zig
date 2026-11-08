const std = @import("std");
const a = std.testing.allocator;
const transform = @import("table_deletion_file.zig").transform;
const parser = @import("section_tree.zig");
const fixture = @import("test_package_fixture.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const xml = prefix ++ "<p:p id='1'><p:run><p:t>KEPT</p:t><p:tbl id='10'/><p:pic id='99'/><p:tbl id='20'/></p:run></p:p></s:sec>";

test "파일표삭제 다중 선택은 입력 순서와 무관하고 다른 ZIP 파트를 보존한다" {
    const input = try fixture.syntheticStructureZip(a, fixture.structure_header, xml);
    defer a.free(input);
    const output = try transform(a, input, 0, &.{ 6, 4 }, .{});
    defer a.free(output);
    var before = try @import("package.zig").inspectDocument(a, input, .{});
    defer before.deinit(a);
    var after = try @import("package.zig").inspectDocument(a, output, .{});
    defer after.deinit(a);
    const expected = prefix ++ "<p:p id='1'><p:run><p:t>KEPT</p:t><p:pic id='99'/></p:run></p:p></s:sec>";
    const entry = after.archive.find("Contents/chapter-B.xml").?;
    const current = try after.archive.decode(entry, 10000);
    defer a.free(current);
    try std.testing.expectEqualStrings(expected, current);
    for (before.archive.entries) |original| {
        if (std.mem.eql(u8, original.name, "Contents/chapter-B.xml")) continue;
        const unchanged = after.archive.find(original.name).?;
        try std.testing.expectEqualSlices(u8, original.compressed, unchanged.compressed);
        try std.testing.expectEqual(original.crc32, unchanged.crc32);
    }
}

test "파일표삭제 잘못된 구역 노드 중복 중첩 선택은 원본을 바꾸지 않고 거부한다" {
    const input = try fixture.syntheticStructureZip(a, fixture.structure_header, xml);
    defer a.free(input);
    const snapshot = try a.dupe(u8, input);
    defer a.free(snapshot);
    try std.testing.expectError(error.InvalidSectionIndex, transform(a, input, 99, &.{4}, .{}));
    try std.testing.expectError(error.InvalidTableDeletionTarget, transform(a, input, 0, &.{0}, .{}));
    try std.testing.expectError(error.DuplicateTableDeletionTarget, transform(a, input, 0, &.{ 4, 4 }, .{}));
    try std.testing.expectError(error.InvalidTableDeletionTargets, transform(a, input, 0, &.{}, .{}));
    try std.testing.expectError(error.LimitExceeded, transform(a, input, 0, &.{4}, .{ .max_input_bytes = 1 }));
    try std.testing.expectError(error.LimitExceeded, transform(a, input, 0, &.{4}, .{ .max_output_bytes = 1 }));
    try std.testing.expectEqualSlices(u8, snapshot, input);
    var nested = try parser.parse(a, prefix ++ "<p:p><p:run><p:tbl><p:tr><p:tc><p:subList><p:p><p:run><p:tbl/></p:run></p:p></p:subList></p:tc></p:tr></p:tbl></p:run></p:p></s:sec>", 0, 0, .{});
    defer nested.deinit(a);
    try std.testing.expectError(error.OverlappingTableDeletionTargets, @import("table_deletion.zig").prepareMany(a, &nested, &.{ 3, 9 }, 10000));
}

test "파일표삭제 selector wire는 길이와 개수를 검증한다" {
    const wire = @import("../wasm/hwpx_table_delete_wire.zig");
    const nodes = try wire.decodeTargets(a, &.{ 2, 0, 0, 0, 4, 0, 0, 0, 6, 0, 0, 0 });
    defer a.free(nodes);
    try std.testing.expectEqualSlices(usize, &.{ 4, 6 }, nodes);
    try std.testing.expectError(error.InvalidTableDeletionTargets, wire.decodeTargets(a, &.{ 0, 0, 0, 0 }));
    try std.testing.expectError(error.InvalidTableDeletionTargets, wire.decodeTargets(a, &.{ 2, 0, 0, 0, 4, 0, 0, 0 }));
}

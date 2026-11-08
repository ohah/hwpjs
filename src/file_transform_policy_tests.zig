//! 공유 보호 정책의 부재·미완결 마커·할당 실패를 별도 검사한다.
const std = @import("std");
const a = std.testing.allocator;
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
const plain = prefix ++ "<p:p><p:run><p:t>본문</p:t><p:tbl/></p:run></p:p></s:sec>";

test "파일 변환 보호 H5 미완결 fieldEnd도 구역 거부" {
    var raw: std.ArrayList(u8) = .empty;
    defer raw.deinit(a);
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 9, .little);
    try @import("hwp5/record_writer.zig").append(a, &raw, 66, 0, &header, 1000);
    var text: [18]u8 = @splat(0);
    std.mem.writeInt(u16, text[0..2], 4, .little);
    std.mem.writeInt(u16, text[14..16], 4, .little);
    std.mem.writeInt(u16, text[16..18], 13, .little);
    try @import("hwp5/record_writer.zig").append(a, &raw, 67, 1, &text, 1000);
    var tree = try @import("hwp5/body/tree.zig").Tree.parseTextPreview(a, raw.items, .{ .raw = 0x05000300 }, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.ProtectedFieldRange, @import("hwp5/edit/field_free_section.zig").validate(tree));
}

test "파일 변환 보호 HX 미완결 fieldEnd도 구역 거부" {
    var tree = try @import("hwpx/section_tree.zig").parse(a, prefix ++ "<p:p><p:run><p:ctrl><p:fieldEnd beginIDRef='7'/></p:ctrl><p:t>본문</p:t></p:run></p:p></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.ProtectedFieldRange, @import("hwpx/field_free_section.zig").validate(a, &tree, 10000));
}

test "파일 변환 보호 HX 필드 없는 구역과 전체 할당 실패 정리" {
    var tree = try @import("hwpx/section_tree.zig").parse(a, plain, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("hwpx/xml_part_tree.zig").Tree) !void {
            try @import("hwpx/field_free_section.zig").validate(allocator, source, 10000);
        }
    }.run, .{&tree});
}

test "파일 변환 보호 HX 보안 검사 포함 저장의 전체 할당 실패 정리" {
    const fixture = @import("hwpx/test_package_fixture.zig");
    const input = try fixture.syntheticStructureZip(a, fixture.structure_header, plain);
    defer a.free(input);
    var document = try @import("hwpx/package.zig").inspectDocument(a, input, .{});
    defer document.deinit(a);
    var tree = try document.readSectionTree(a, 0, .{});
    defer tree.deinit(a);
    var target: ?usize = null;
    for (tree.elements, 0..) |_, i| if (@import("hwpx/table_xml_fields.zig").childIs(&tree, i, "tbl")) {
        target = i;
    };
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: []const u8, node: usize) !void {
            const output = try @import("hwpx/table_deletion_file.zig").transform(allocator, source, 0, &.{node}, .{});
            defer allocator.free(output);
        }
    }.run, .{ input, target.? });
}

//! 그림 자르기 원값과 기준 크기를 보존합니다. 픽셀 좌표로 추정하지 않습니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Values = struct {
    clip: [4]?i64 = @splat(null),
    image_dimensions: [2]?u32 = @splat(null),
};

fn child(tree: *const Tree, picture: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const result = fields.uniqueChild(tree, picture, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicatePictureCropChild;
    return result;
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, picture: usize) !Values {
    if (picture >= tree.elements.len or !fields.childIs(tree, picture, "pic")) return error.InvalidPictureDisplayNode;
    var result: Values = .{};
    if (try child(tree, picture, "imgClip")) |clip| {
        for (fields.margin_names, 0..) |name, index| {
            if (try tree.attributeValue(a, clip, "", name)) |raw| result.clip[index] = try fields.margin(a, raw, 4096);
        }
    }
    if (try child(tree, picture, "imgDim")) |dimensions| {
        result.image_dimensions = try fields.optionalUnsignedPair(a, tree, dimensions, .{ "dimwidth", "dimheight" }, 4096);
    }
    return result;
}

fn allocationCase(a: std.mem.Allocator) !void {
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:pic><p:imgClip left='-1' right='&#48;' bottom='4294967295'/><x:imgDim dimwidth='999'/><p:imgDim dimwidth='0'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, source, 0, 0, .{});
    defer tree.deinit(a);
    const result = try read(a, &tree, 1);
    try std.testing.expectEqualDeep([4]?i64{ -1, 0, null, 4294967295 }, result.clip);
    try std.testing.expectEqualDeep([2]?u32{ 0, null }, result.image_dimensions);
}

test "HWPX picture crop values preserve independent dimensions absence and signed values" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX picture crop values reject duplicate direct children without guessing defaults" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic>";
    inline for (.{ "<p:imgClip/><p:imgClip/>", "<p:imgDim/><p:imgDim/>" }) |inside| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ inside ++ "</p:pic></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.DuplicatePictureCropChild, read(a, &tree, 1));
    }
    var empty = try @import("section_tree.zig").parse(a, prefix ++ "</p:pic></s:sec>", 0, 0, .{});
    defer empty.deinit(a);
    try std.testing.expectEqualDeep(Values{}, try read(a, &empty, 1));
    try std.testing.expectError(error.InvalidPictureDisplayNode, read(a, &empty, empty.elements.len));
}

test "HWPX picture crop values preserve actual clip extent without invented image dimensions" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017-pics.hwpx", a, .limited(16_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const tree = &session.sections[0].tree;
    for (tree.elements, 0..) |_, index| {
        if (!fields.childIs(tree, index, "pic")) continue;
        const result = try read(a, tree, index);
        try std.testing.expectEqualDeep([4]?i64{ 0, 37500, 0, 22500 }, result.clip);
        try std.testing.expectEqualDeep([2]?u32{ null, null }, result.image_dimensions);
        return;
    }
    return error.MissingPictureImage;
}

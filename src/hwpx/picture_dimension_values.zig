//! Raw picture dimensions; zero and absence remain distinct.
//! Does not choose a display fallback or derive transformation matrices.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const fields = @import("table_xml_fields.zig");
pub const Values = struct {
    display: [2]?u32 = .{ null, null },
    original: [2]?u32 = .{ null, null },
    current: [2]?u32 = .{ null, null },
};

pub const names = [_][]const u8{ "sz", "orgSz", "curSz" };

pub fn child(tree: *const Tree, picture: usize, name: []const u8) !?usize {
    var missing: usize = 0;
    var duplicate: usize = 0;
    const node = fields.uniqueChild(tree, picture, name, &missing, &duplicate);
    if (duplicate != 0) return error.DuplicatePictureDimensionChild;
    return node;
}

fn pair(a: std.mem.Allocator, tree: *const Tree, picture: usize, name: []const u8) ![2]?u32 {
    const node = try child(tree, picture, name);
    return if (node) |index| try fields.optionalUnsignedPair(a, tree, index, .{ "width", "height" }, 4096) else .{ null, null };
}

pub fn read(a: std.mem.Allocator, tree: *const Tree, picture: usize) !Values {
    if (picture >= tree.elements.len or !fields.childIs(tree, picture, "pic")) return error.InvalidPictureDisplayNode;
    return .{
        .display = try pair(a, tree, picture, names[0]),
        .original = try pair(a, tree, picture, names[1]),
        .current = try pair(a, tree, picture, names[2]),
    };
}

pub fn protection(a: std.mem.Allocator, tree: *const Tree, picture: usize) !?bool {
    if (picture >= tree.elements.len or !fields.childIs(tree, picture, "pic")) return error.InvalidPictureDisplayNode;
    const size = (try child(tree, picture, names[0])) orelse return null;
    const value = (try tree.attributeValue(a, size, "", "protect")) orelse return null;
    return try fields.boolean(a, value, 4096);
}

fn allocationCase(a: std.mem.Allocator) !void {
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:other'><p:pic><p:sz width='12' height='8'/><x:orgSz width='99'/><p:orgSz width='&#48;'/><p:curSz width='0' height='4294967295'/><p:other><p:curSz width='99'/></p:other></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    const value = try read(a, &tree, 1);
    try std.testing.expectEqualDeep(Values{ .display = .{ 12, 8 }, .original = .{ 0, null }, .current = .{ 0, 4294967295 } }, value);
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX picture dimension values distinguish original current display zero and absent fields" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

test "HWPX picture dimension values reject duplicate children and preserve complete absence" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    inline for (.{ "<p:sz/><p:sz/>", "<p:orgSz/><p:orgSz/>", "<p:curSz/><p:curSz/>" }) |inside| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:pic>" ++ inside ++ "</p:pic></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.DuplicatePictureDimensionChild, read(a, &tree, 1));
    }
    var empty = try @import("section_tree.zig").parse(a, prefix ++ "<p:pic/></s:sec>", 0, 0, .{});
    defer empty.deinit(a);
    try std.testing.expectEqualDeep(Values{}, try read(a, &empty, 1));
    try std.testing.expectError(error.InvalidPictureDisplayNode, read(a, &empty, empty.elements.len));
    try std.testing.expectError(error.InvalidPictureDisplayNode, read(a, &empty, 0));
}

test "HWPX picture dimension values do not turn unrelated placement errors into missing dimensions" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic><p:sz width='12' height='8' widthRelTo='unknown'/><p:pos treatAsChar='invalid'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    const value = try read(a, &tree, 1);
    try std.testing.expectEqualDeep([2]?u32{ 12, 8 }, value.display);
    try std.testing.expectEqualDeep([2]?u32{ null, null }, value.current);
}

test "HWPX picture dimension values reject invalid integers rather than silently repairing them" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    inline for (.{
        .{ "<p:orgSz width='-1'/>", error.InvalidNonNegativeInteger },
        .{ "<p:curSz height='4294967296'/>", error.InvalidUnsigned32 },
        .{ "<p:sz width='NaN'/>", error.InvalidNonNegativeInteger },
    }) |case| {
        var tree = try @import("section_tree.zig").parse(a, prefix ++ "<p:pic>" ++ case[0] ++ "</p:pic></s:sec>", 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(case[1], read(a, &tree, 1));
    }
}

test "HWPX picture dimension values preserve all thirteen actual scaled and zero-current pictures" {
    const a = std.testing.allocator;
    var count: usize = 0;
    for ([_][]const u8{ "shapepict-scaled.hwpx", "sample-5017-pics.hwpx" }, 0..) |name, file| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(16_000_000));
        defer a.free(bytes);
        var package = try @import("package.zig").inspectDocument(a, bytes, .{});
        defer package.deinit(a);
        var tree = try package.readSectionTree(a, 0, .{});
        defer tree.deinit(a);
        var local: usize = 0;
        for (tree.elements, 0..) |_, node| {
            if (!fields.childIs(&tree, node, "pic")) continue;
            const value = try read(a, &tree, node);
            if (file == 0) {
                try std.testing.expectEqualDeep([2]?u32{ 5689, 3413 }, value.original);
                try std.testing.expectEqualDeep(value.display, value.current);
                try std.testing.expectEqualDeep(if (local == 0) [2]?u32{ 37500, 22500 } else [2]?u32{ 18750, 11250 }, value.display);
            } else {
                try std.testing.expectEqualDeep([2]?u32{ 0, 0 }, value.current);
                try std.testing.expectEqualDeep(value.display, value.original);
                try std.testing.expect(value.display[0].? > 0 and value.display[1].? > 0);
            }
            local += 1;
        }
        try std.testing.expectEqual(@as(usize, if (file == 0) 2 else 11), local);
        count += local;
    }
    try std.testing.expectEqual(@as(usize, 13), count);
}

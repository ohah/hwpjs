//! Explicit raw dimension updates, not an automatic visual resize command.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const dimensions = @import("picture_dimension_values.zig");
const writer = @import("xml_source_writer.zig");
pub const Update = struct {
    display: ?[2]u32 = null,
    original: ?[2]u32 = null,
    current: ?[2]u32 = null,
};

/// Returns a complete section XML copy. Null means leave that pair untouched.
/// No insertion, fallback, matrix regeneration or mutation of source is performed.
pub fn write(a: std.mem.Allocator, tree: *const Tree, picture: usize, update: Update, limit: usize) ![]u8 {
    _ = try dimensions.read(a, tree, picture);
    var changes: std.ArrayList(writer.Change) = .empty;
    defer {
        for (changes.items) |change| a.free(change.start_tag.?);
        changes.deinit(a);
    }
    for (dimensions.names, [_]?[2]u32{ update.display, update.original, update.current }) |name, requested| {
        const values = requested orelse continue;
        const node = (try dimensions.child(tree, picture, name)) orelse return error.MissingPictureDimensionElement;
        const tag = try @import("xml_unsigned_attributes_write.zig").write(a, tree, node, &.{ "width", "height" }, values, limit);
        const span = tree.elements[node].start_tag;
        changes.append(a, .{ .start = span.start, .end = span.end, .text = "", .start_tag = tag }) catch |err| {
            a.free(tag);
            return err;
        };
    }
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            return left.start < right.start;
        }
    }.less);
    return writer.write(a, tree.source, changes.items, limit);
}

test "HWPX picture dimension writer preserves placement matrices and unknown XML with allocation cleanup" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>";
    const input = prefix ++ "<p:pic><p:curSz width='0' height='0'/><!--keep--><p:orgSz width='12' height='8'/><p:sz opaque='keep' height = \"8\" width='12'/><p:pos allowOverlap='1'/><p:renderingInfo opaque='unchanged'/></p:pic></s:sec>";
    const expected = prefix ++ "<p:pic><p:curSz width='9' height='6'/><!--keep--><p:orgSz width='12' height='8'/><p:sz opaque='keep' height = \"6\" width='9'/><p:pos allowOverlap='1'/><p:renderingInfo opaque='unchanged'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, expected_xml: []const u8) !void {
            const result = try write(allocator, source, 1, .{ .display = .{ 9, 6 }, .current = .{ 9, 6 } }, 4096);
            defer allocator.free(result);
            try std.testing.expectEqualStrings(expected_xml, result);
        }
    }.run, .{ &tree, expected });
    const noop = try write(a, &tree, 1, .{ .display = .{ 12, 8 }, .current = .{ 0, 0 } }, 4096);
    defer a.free(noop);
    try std.testing.expectEqualStrings(input, noop);
    try std.testing.expectEqualStrings(input, tree.source);
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 1, .{}, 1));
}

test "HWPX picture dimension writer rejects missing requested pairs after earlier changes" {
    const a = std.testing.allocator;
    const input = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:pic><p:sz width='12' height='8'/></p:pic></s:sec>";
    var tree = try @import("section_tree.zig").parse(a, input, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectError(error.MissingPictureDimensionElement, write(a, &tree, 1, .{ .display = .{ 9, 6 }, .current = .{ 9, 6 } }, 4096));
    try std.testing.expectEqualStrings(input, tree.source);
}

test "HWPX picture dimension writer keeps all actual thirteen pictures no-op exact and isolates explicit updates" {
    const a = std.testing.allocator;
    var count: usize = 0;
    for ([_][]const u8{ "shapepict-scaled.hwpx", "sample-5017-pics.hwpx" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(16_000_000));
        defer a.free(bytes);
        var package = try @import("package.zig").inspectDocument(a, bytes, .{});
        defer package.deinit(a);
        var tree = try package.readSectionTree(a, 0, .{});
        defer tree.deinit(a);
        for (tree.elements, 0..) |_, picture| {
            if (!@import("table_xml_fields.zig").childIs(&tree, picture, "pic")) continue;
            const before = try dimensions.read(a, &tree, picture);
            const noop = try write(a, &tree, picture, .{
                .display = .{ before.display[0].?, before.display[1].? },
                .original = .{ before.original[0].?, before.original[1].? },
                .current = .{ before.current[0].?, before.current[1].? },
            }, 16_000_000);
            defer a.free(noop);
            try std.testing.expectEqualStrings(tree.source, noop);
            const output = try write(a, &tree, picture, .{ .display = .{ 12345, 6789 }, .current = .{ 12345, 6789 } }, 16_000_000);
            defer a.free(output);
            var reopened = try @import("section_tree.zig").parse(a, output, 0, 0, .{});
            defer reopened.deinit(a);
            const after = try dimensions.read(a, &reopened, picture);
            try std.testing.expectEqualDeep([2]?u32{ 12345, 6789 }, after.display);
            try std.testing.expectEqualDeep(after.display, after.current);
            try std.testing.expectEqualDeep(before.original, after.original);
            try std.testing.expectEqual(tree.elements.len, reopened.elements.len);
            const size = (try dimensions.child(&tree, picture, dimensions.names[0])).?;
            const current = (try dimensions.child(&tree, picture, dimensions.names[2])).?;
            for (tree.elements, reopened.elements, 0..) |old, new, node| {
                if (node == size or node == current) continue;
                try std.testing.expectEqualStrings(tree.source[old.start_tag.start..old.start_tag.end], reopened.source[new.start_tag.start..new.start_tag.end]);
            }
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 13), count);
}

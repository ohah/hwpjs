const std = @import("std");
const bindings = @import("picture_caption_bindings.zig");
const values = @import("table_caption_values.zig");
const tree_mod = @import("section_tree.zig");
const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:foreign'>";

test "HWPX picture caption source preserves exact direct owner and scalar values" {
    const a = std.testing.allocator;
    const xml = prefix ++ "<p:pic><p:caption side='BOTTOM' fullSz='0' width='8504' gap='850' lastWidth='14004'><p:subList textDirection='HORIZONTAL' lineWrap='BREAK' vertAlign='TOP'><p:p/></p:subList></p:caption></p:pic><p:tbl/></s:sec>";
    var tree = try tree_mod.parse(a, xml, 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.expectEqualDeep(@as(?bindings.Owner, .{ .picture_node = 1, .caption_node = 2, .list_node = 3 }), try bindings.resolve(&tree, 4));
    try std.testing.expectEqual(@as(?@import("table_caption_bindings.zig").Owner, null), try @import("table_caption_bindings.zig").resolve(&tree, 4));
    const source = (try values.readPicture(a, &tree, 1)).?;
    try std.testing.expectEqual(@as(?u32, 3), source.side);
    try std.testing.expectEqual(@as(?bool, false), source.full_size);
    try std.testing.expectEqual(@as(?i64, 8504), source.width);
    try std.testing.expectEqual(@as(?i64, 850), source.gap);
    try std.testing.expectEqual(@as(?u32, 14004), source.last_width);
    try std.testing.expectEqual(@as(?u32, 0), source.text_direction);
    try std.testing.expectError(error.InvalidPictureCaptionNode, values.readPicture(a, &tree, 5));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, allocation_input: []const u8) !void {
            var source_tree = try tree_mod.parse(allocator, allocation_input, 0, 0, .{});
            defer source_tree.deinit(allocator);
            _ = try values.readPicture(allocator, &source_tree, 1);
        }
    }.run, .{xml});
}

test "HWPX picture caption source rejects duplicate direct owners and foreign lookalikes" {
    const a = std.testing.allocator;
    for ([_][]const u8{
        "<p:pic><p:caption><p:subList><p:p/></p:subList></p:caption><p:caption/></p:pic>",
        "<p:pic><p:caption><p:subList><p:p/></p:subList><p:subList/></p:caption></p:pic>",
    }) |body| {
        const xml = try std.fmt.allocPrint(a, "{s}{s}</s:sec>", .{ prefix, body });
        defer a.free(xml);
        var tree = try tree_mod.parse(a, xml, 0, 0, .{});
        defer tree.deinit(a);
        try std.testing.expectError(error.AmbiguousPictureCaptionOwner, bindings.resolve(&tree, 4));
    }
    var foreign = try tree_mod.parse(a, prefix ++ "<p:pic><x:caption><p:subList><p:p/></p:subList></x:caption></p:pic><p:pic/></s:sec>", 0, 0, .{});
    defer foreign.deinit(a);
    try std.testing.expectEqual(@as(?bindings.Owner, null), try bindings.resolve(&foreign, 4));
    try std.testing.expectEqual(@as(?values.Values, null), try values.readPicture(a, &foreign, 1));
    try std.testing.expectEqual(@as(?values.Values, null), try values.readPicture(a, &foreign, 5));
    try std.testing.expectError(error.InvalidCaptionParagraphTemplate, bindings.resolve(&foreign, 1));
}

test "HWPX picture caption source actual reference current ownership and allocation failures" {
    const a = std.testing.allocator;
    const bytes = std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx", a, .limited(32_000_000)) catch |err| switch (err) {
        error.FileNotFound => return error.SkipZigTest,
        else => return err,
    };
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const rows = try bindings.read(a, &session, 0);
    defer a.free(rows);
    var found: usize = 0;
    for (rows) |row| if (row.owner.picture_node == 350) {
        found += 1;
        try std.testing.expectEqual(@as(usize, 32), row.paragraph);
        const source = (try values.readPicture(a, &session.sections[0].tree, row.owner.picture_node)).?;
        try std.testing.expectEqual(source.caption_node, row.owner.caption_node);
        try std.testing.expectEqual(source.list_node.?, row.owner.list_node);
        try std.testing.expectEqual(@as(?i64, 8504), source.width);
    };
    try std.testing.expectEqual(@as(usize, 1), found);
    var current = try @import("display_current_paragraphs.zig").read(a, &session.sections[0], session.options);
    defer current.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, section: *const @import("editor_session.zig").Section, paragraphs: []const @import("paragraph_structure_values.zig").Paragraph, expected: []const bindings.Binding) !void {
            const actual = try bindings.fromParagraphs(allocator, section, paragraphs);
            defer allocator.free(actual);
            try std.testing.expectEqualDeep(expected, actual);
        }
    }.run, .{ &session.sections[0], current.paragraphs, rows });
}

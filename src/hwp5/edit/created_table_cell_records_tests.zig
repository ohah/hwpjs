const std = @import("std");
const cells = @import("created_table_cell_records.zig");
const model = @import("../../model/created_table.zig");
const resources: cells.Resources = .{ .char_shapes = 8, .para_shapes = 4, .styles = 4 };
const options: cells.Options = .{ .layout = .observed8, .unknown = 0x1234, .attributes = 0x20, .margins = .{ 5, -6, 7, -8 } };

fn create(a: std.mem.Allocator) !model.Table {
    var table = try model.create(a, 11, 33, try @import("../../model/table_creation_plan.zig").create(2, 3, 101, 17, 6), &.{ 1, 2, 3, 4, 5, 6 }, .{ .paragraph = 2, .character = 7, .style = 3, .border_fill = 9 }, 6);
    errdefer table.deinit(a);
    _ = try table.replaceText(a, 1, 2, "셀😀\n끝", 100);
    return table;
}

test "HWP5 new cell records preserve Unicode counts explicit layouts and paragraph siblings" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    for ([_]u32{ 0x05000301, 0x05000302, 0x05010100 }) |raw| {
        for ([_]@import("../body/list_header.zig").Layout{ .spec6, .observed8 }) |layout| {
            var selected = options;
            selected.layout = layout;
            selected.unknown = if (layout == .observed8) options.unknown else null;
            var out: std.ArrayList(u8) = .empty;
            defer out.deinit(a);
            try @import("../record_writer.zig").append(a, &out, 999, 0, "", 4096);
            try cells.append(a, &out, &table, 1, 2, .{ .raw = raw }, selected, resources, 1, 4096);
            var tree = try @import("../body/tree.zig").Tree.parse(a, out.items, .{ .raw = raw }, .{});
            defer tree.deinit(a);
            try std.testing.expectEqual(@as(usize, 5), tree.nodes.len);
            try std.testing.expectEqual(@as(?usize, 0), tree.nodes[1].parent);
            try std.testing.expectEqual(@as(?usize, 0), tree.nodes[2].parent);
            try std.testing.expectEqual(@as(?usize, 2), tree.nodes[3].parent);
            const view = try tree.nodes[1].record.value.list_header.view(layout);
            try std.testing.expectEqual(@as(u32, 0x20), view.attributes);
            try std.testing.expectEqual(selected.unknown, view.unknown);
            const geometry = try @import("../body/table_cell.zig").Cell.parse(view.extra);
            try std.testing.expectEqual(@as(u16, 2), geometry.column);
            try std.testing.expectEqual(@as(u32, 33), geometry.width);
            const header = tree.nodes[2].record.value.header;
            try std.testing.expectEqual(@as(u32, 6), header.characterUnits());
            try std.testing.expect(header.countHighBit());
            try std.testing.expectEqual(@as(u32, 1 << 10), header.control_mask);
            try std.testing.expectEqual(@as(u32, 6), header.instance_id);
            try std.testing.expectEqual(@as(u16, 1), header.char_shape_count);
            try std.testing.expectEqual(@as(u16, 0), header.line_segment_count);
            try std.testing.expectEqual(@as(?u16, if (raw >= 0x05000302) 0 else null), header.merge_tracking);
            const expected = [_]u8{ 0x40, 0xc1, 0x3d, 0xd8, 0, 0xde, 10, 0, 0x5d, 0xb0, 13, 0 };
            try std.testing.expectEqualSlices(u8, &expected, tree.nodes[3].record.value.text.raw);
            const report = try @import("../body/paragraphs.zig").inspect(tree, resources);
            try std.testing.expectEqual(@as(usize, 1), report.paragraphs);
            try std.testing.expectEqual(@as(usize, 1), report.texts);
        }
    }
}

test "HWP5 new cell records reject truncation missing references controls and ambiguous list layout" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    try out.appendSlice(a, "prefix");
    var forged = table;
    forged.resources.style = 256;
    try std.testing.expectError(error.InvalidStyleReference, cells.append(a, &out, &forged, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1, 4096));
    forged = table;
    forged.resources.paragraph = 65536;
    try std.testing.expectError(error.InvalidParagraphShapeReference, cells.append(a, &out, &forged, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1, 4096));
    forged = table;
    forged.resources.character = 8;
    try std.testing.expectError(error.InvalidCharacterShapeReference, cells.append(a, &out, &forged, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1, 4096));
    var invalid = options;
    invalid.unknown = null;
    try std.testing.expectError(error.InvalidListHeaderLayout, cells.append(a, &out, &table, 1, 2, .{ .raw = 0x05000302 }, invalid, resources, 1, 4096));
    invalid = options;
    invalid.layout = .spec6;
    try std.testing.expectError(error.InvalidListHeaderLayout, cells.append(a, &out, &table, 1, 2, .{ .raw = 0x05000302 }, invalid, resources, 1, 4096));
    try std.testing.expectError(error.LimitExceeded, cells.append(a, &out, &table, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1023, 4096));
    try std.testing.expectError(error.LimitExceeded, cells.append(a, &out, &table, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1, 10));
    // Final run framing is the late budget failure, not the UTF-16 allocation.
    try std.testing.expectError(error.LimitExceeded, cells.append(a, &out, &table, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1, 99));
    try std.testing.expectEqualStrings("prefix", out.items);
    {
        var exact: std.ArrayList(u8) = .empty;
        defer exact.deinit(a);
        try exact.appendSlice(a, "prefix");
        try cells.append(a, &exact, &table, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1, 100);
        try std.testing.expectEqual(@as(usize, 100), exact.items.len);
    }
    {
        const original = table.cells[5].text[0];
        table.cells[5].text[0] = 0xff;
        defer table.cells[5].text[0] = original;
        try std.testing.expectError(error.InvalidTableCellText, cells.append(a, &out, &table, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1, 4096));
    }
    _ = try table.replaceText(a, 1, 2, "CR\r", 100);
    try std.testing.expectError(error.UnsupportedTextControl, cells.append(a, &out, &table, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1, 4096));
    try std.testing.expectEqualStrings("prefix", out.items);
}

test "HWP5 new cell records materialize an empty cell without inventing line segments" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    try cells.append(a, &out, &table, 0, 0, .{ .raw = 0x05000302 }, options, resources, 1, 4096);
    var records = @import("../record.zig").Iterator.init(out.items, .{});
    _ = (try records.next()).?;
    const header_record = (try records.next()).?;
    const header = try @import("../body/paragraph_header.zig").Header.parse(header_record.payload, .{ .raw = 0x05000302 });
    try std.testing.expectEqual(@as(u32, 1), header.characterUnits());
    try std.testing.expectEqual(@as(u32, 0), header.control_mask);
    try std.testing.expectEqual(@as(u16, 0), header.line_segment_count);
    try std.testing.expectEqualSlices(u8, &.{ 13, 0 }, (try records.next()).?.payload);
    try std.testing.expectEqual(@as(u10, 68), (try records.next()).?.tag);
    try std.testing.expect((try records.next()) == null);
}

test "HWP5 new cell records every failed allocation preserves caller bytes and owned model" {
    const a = std.testing.allocator;
    var table = try create(a);
    defer table.deinit(a);
    var before = try table.clone(a);
    defer before.deinit(a);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, source: *const model.Table) !void {
            var out: std.ArrayList(u8) = .empty;
            defer out.deinit(allocator);
            try out.appendSlice(allocator, "prefix");
            cells.append(allocator, &out, source, 1, 2, .{ .raw = 0x05000302 }, options, resources, 1, 4096) catch |err| {
                try std.testing.expectEqualStrings("prefix", out.items);
                return err;
            };
            try std.testing.expect(std.mem.startsWith(u8, out.items, "prefix"));
        }
    }.run, .{&table});
    try std.testing.expectEqualDeep(before, table);
}

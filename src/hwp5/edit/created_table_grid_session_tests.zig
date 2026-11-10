//! Independent synthetic transactions; no comparison implementation inputs.
const std = @import("std");
const tx = @import("created_table_grid_session.zig");
const grid = @import("../../model/created_table_grid.zig");
const model = @import("../../model/document.zig");
const created = @import("../../model/created_table.zig");
const values = @import("created_table_values.zig");
const records = @import("created_table_records.zig");
const version: @import("../version.zig").Version = .{ .raw = 0x05000300 };
const a = std.testing.allocator;
pub const options: records.Options = .{
    .common = .{ .flags = 0x6a2211, .offset_x = 0, .offset_y = 0, .z_order = 0, .margins = .{ 0, 0, 0, 0 }, .prevent_page_break = false, .description = "격자😀" },
    .table = .{ .page_break = 1, .repeat_header = false, .cell_spacing = 0, .margins = .{ 0, 0, 0, 0 } },
    .cell = .{ .layout = .observed8, .unknown = 0, .attributes = 0, .margins = .{ 0, 0, 0, 0 } },
};
const resources: records.Resources = .{ .paragraphs = .{ .char_shapes = 1, .para_shapes = 1, .styles = 1 }, .border_count = 1 };
const limits: records.Limits = .{ .max_cells = 64, .max_bytes = 4_000_000 };
pub const texts = [_][]const u8{ "A😀", "B한", "C<&", "D끝" };
pub fn table(allocator: std.mem.Allocator, identity: u64, instance: u32, ids: []const u32) !created.Table {
    var result = try created.create(allocator, identity, instance, try @import("../../model/table_creation_plan.zig").create(2, 2, 30000, 8000, 64), ids, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 64);
    errdefer result.deinit(allocator);
    for (texts, 0..) |text, i| _ = try result.replaceText(allocator, @intCast(i / 2), @intCast(i % 2), text, 1024);
    return result;
}
fn synthetic(allocator: std.mem.Allocator, id: u32) ![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(allocator);
    var header: [22]u8 = @splat(0);
    std.mem.writeInt(u32, header[0..4], 0x80000001, .little);
    std.mem.writeInt(u16, header[12..14], 1, .little);
    std.mem.writeInt(u32, header[18..22], id, .little);
    try @import("../record_writer.zig").append(allocator, &out, 66, 0, &header, limits.max_bytes);
    try @import("../record_writer.zig").append(allocator, &out, 67, 1, &.{ 13, 0 }, limits.max_bytes);
    try @import("../record_writer.zig").append(allocator, &out, 68, 1, &@as([8]u8, @splat(0)), limits.max_bytes);
    return out.toOwnedSlice(allocator);
}
const Fixture = struct {
    raw: [2][]u8,
    document: model.Document,
    pending: [2]values.Values,
    fn init(allocator: std.mem.Allocator) !Fixture {
        const raw0 = try synthetic(allocator, 1);
        errdefer allocator.free(raw0);
        const raw1 = try synthetic(allocator, 2);
        errdefer allocator.free(raw1);
        var document = try @import("../model_projection.zig").fromDecodedSections(allocator, version, &.{ raw0, raw1 });
        errdefer document.deinit(allocator);
        var pending: [2]values.Values = .{ .{}, .{} };
        errdefer for (&pending) |*p| p.deinit(allocator);
        for (0..2) |si| {
            // Another section reserves low IDs 3..6, independently of target.
            var t = try table(allocator, 10 + si, @intCast(50 + si), if (si == 0) &.{ 100, 101, 102, 103 } else &.{ 3, 4, 5, 6 });
            defer t.deinit(allocator);
            var value = try @import("created_table_value.zig").Value.initClone(allocator, &t, options, limits.max_bytes);
            defer value.deinit(allocator);
            try pending[si].append(allocator, .{ .host = .{ .original_node = 0 }, .unit = 0 }, &value, 64, limits.max_bytes);
        }
        return .{ .raw = .{ raw0, raw1 }, .document = document, .pending = pending };
    }
    fn deinit(self: *Fixture, allocator: std.mem.Allocator) void {
        for (&self.pending) |*p| p.deinit(allocator);
        self.document.deinit(allocator);
        for (self.raw) |raw| allocator.free(raw);
    }
    fn apply(self: *Fixture, allocator: std.mem.Allocator, command: grid.Command) !void {
        try tx.apply(allocator, &.{ self.raw[0], self.raw[1] }, &self.document, &self.pending, version, .{ .section = 0, .table = 10, .command = command }, resources, limits);
    }
};
fn allocationCase(allocator: std.mem.Allocator, command: grid.Command) !void {
    var f = try Fixture.init(allocator);
    defer f.deinit(allocator);
    var before0 = try f.pending[0].clone(a, limits.max_bytes);
    defer before0.deinit(a);
    var before1 = try f.pending[1].clone(a, limits.max_bytes);
    defer before1.deinit(a);
    const raw0 = try a.dupe(u8, f.raw[0]);
    defer a.free(raw0);
    f.apply(allocator, command) catch |err| {
        try std.testing.expect(f.pending[0].equals(&before0));
        try std.testing.expect(f.pending[1].equals(&before1));
        try std.testing.expectEqualSlices(u8, raw0, f.raw[0]);
        return err;
    };
    try std.testing.expect(f.pending[1].equals(&before1));
    try std.testing.expectEqualSlices(u8, raw0, f.raw[0]);
}
test "HWP5 created table grid private apply all allocation failures preserve original values" {
    for ([_]grid.Command{ .{ .insert_row = 1 }, .{ .insert_column = 1 }, .{ .delete_row = 0 }, .{ .delete_column = 1 } }) |command| {
        try @import("../../testing/allocation_failures.zig").check(allocationCase, .{command});
    }
}
test "HWP5 created table grid four commands beginning middle end mappings and cross section IDs" {
    for ([_]bool{ true, false }) |row_edit| for ([_]bool{ true, false }) |insert| {
        const end: u32 = if (insert) 3 else 2;
        for (0..end) |position| {
            var f = try Fixture.init(a);
            defer f.deinit(a);
            const index: u32 = @intCast(position);
            const command: grid.Command = if (row_edit) (if (insert) .{ .insert_row = index } else .{ .delete_row = index }) else (if (insert) .{ .insert_column = index } else .{ .delete_column = index });
            const before = f.pending[0].entries[0];
            try f.apply(a, command);
            const entry = f.pending[0].entries[0];
            const t = entry.value.table;
            try std.testing.expectEqual(@as(u64, 10), t.identity);
            try std.testing.expectEqual(@as(u32, 50), t.instance_id);
            try std.testing.expectEqualDeep(before.anchor, entry.anchor);
            try std.testing.expectEqualDeep(options, entry.value.options);
            try std.testing.expectEqualDeep(@as(created.Resources, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }), t.resources);
            try std.testing.expectEqual(@as(u32, if (row_edit) (if (insert) 3 else 1) else 2), t.plan.rows);
            try std.testing.expectEqual(@as(u32, if (!row_edit) (if (insert) 3 else 1) else 2), t.plan.columns);
            for (t.cells, 0..) |cell, offset| {
                const row = offset / t.plan.columns;
                const col = offset % t.plan.columns;
                const coordinate = if (row_edit) row else col;
                if (insert and coordinate == index) {
                    try std.testing.expectEqualStrings("", cell.text);
                    try std.testing.expect(cell.paragraph_id > 6 and (cell.paragraph_id < 100 or cell.paragraph_id > 103));
                    try std.testing.expect(cell.paragraph_id != 50 and cell.paragraph_id != 51);
                } else {
                    const prior = if (insert) coordinate - @intFromBool(coordinate > index) else coordinate + @intFromBool(coordinate >= index);
                    const old = if (row_edit) prior * 2 + col else row * 2 + prior;
                    try std.testing.expectEqual(@as(u32, @intCast(100 + old)), cell.paragraph_id);
                    try std.testing.expectEqualStrings(texts[old], cell.text);
                }
            }
        }
    };
}
test "HWP5 created table grid rejects bad identity index final row column and late writer failure" {
    var f = try Fixture.init(a);
    defer f.deinit(a);
    var before = try f.pending[0].clone(a, limits.max_bytes);
    defer before.deinit(a);
    try std.testing.expectError(error.InvalidTableGridEdit, f.apply(a, .{ .insert_row = 3 }));
    try std.testing.expectError(error.InvalidTableGridEdit, f.apply(a, .{ .delete_column = 2 }));
    const sources = &.{ f.raw[0], f.raw[1] };
    try std.testing.expectError(error.InvalidCreatedTableIdentity, tx.apply(a, sources, &f.document, &f.pending, version, .{ .section = 0, .table = 999, .command = .{ .delete_row = 0 } }, resources, limits));
    try std.testing.expectError(error.InvalidSection, tx.apply(a, sources, &f.document, &f.pending, version, .{ .section = 2, .table = 10, .command = .{ .delete_row = 0 } }, resources, limits));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, tx.apply(a, sources, &f.document, &f.pending, version, .{ .section = 0, .table = 11, .command = .{ .delete_row = 0 } }, resources, limits));
    var bad = resources;
    bad.border_count = 0;
    try std.testing.expectError(error.InvalidBorderFillReference, tx.apply(a, sources, &f.document, &f.pending, version, .{ .section = 0, .table = 10, .command = .{ .insert_row = 1 } }, bad, limits));
    try std.testing.expect(f.pending[0].equals(&before));
    f.pending[1].entries[0].value.table.identity = 10;
    try std.testing.expectError(error.InvalidCreatedTableIdentity, f.apply(a, .{ .delete_row = 0 }));
    f.pending[1].entries[0].value.table.identity = 11;
    try f.apply(a, .{ .delete_row = 0 });
    try f.apply(a, .{ .delete_column = 0 });
    var last = try f.pending[0].clone(a, limits.max_bytes);
    defer last.deinit(a);
    try std.testing.expectError(error.InvalidTableGridEdit, f.apply(a, .{ .delete_row = 0 }));
    try std.testing.expectError(error.InvalidTableGridEdit, f.apply(a, .{ .delete_column = 0 }));
    try std.testing.expect(f.pending[0].equals(&last));
}

test "HWP5 created table grid deletion never plans IDs and candidate budget fails atomically" {
    var f = try Fixture.init(a);
    defer f.deinit(a);
    var before = try f.pending[0].clone(a, limits.max_bytes);
    defer before.deinit(a);
    var tight = limits;
    tight.max_bytes = try before.byteSize(limits.max_bytes);
    try std.testing.expectError(error.LimitExceeded, tx.apply(a, &.{ f.raw[0], f.raw[1] }, &f.document, &f.pending, version, .{ .section = 0, .table = 10, .command = .{ .insert_row = 1 } }, resources, tight));
    try std.testing.expect(f.pending[0].equals(&before));
    // A foreign pending paragraph collision makes global planning fail. A
    // deletion needs no new IDs and still edits only the valid target section.
    f.pending[1].entries[0].value.table.cells[0].paragraph_id = 1;
    try std.testing.expectError(error.InvalidTableParagraphIds, f.apply(a, .{ .insert_column = 1 }));
    try std.testing.expect(f.pending[0].equals(&before));
    try f.apply(a, .{ .delete_row = 0 });
    try std.testing.expectEqual(@as(u32, 1), f.pending[0].entries[0].value.table.plan.rows);
}

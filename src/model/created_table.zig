//! Owned new-table values. No original node indices or serialized XML cache.
const std = @import("std");
const creation = @import("table_creation_plan.zig");
pub const Resources = struct { paragraph: u32, character: u32, style: u32, border_fill: u32 };
pub const Cell = @import("authored_paragraph.zig").Paragraph;
pub const Table = struct {
    identity: u64,
    instance_id: u32,
    plan: creation.Plan,
    resources: Resources,
    cells: []Cell,
    cell_properties: []@import("created_cell_property.zig").Property = &.{},

    pub fn deinit(self: *Table, a: std.mem.Allocator) void {
        for (self.cells) |*owned_cell| owned_cell.deinit(a);
        a.free(self.cells);
        a.free(self.cell_properties);
        self.* = undefined;
    }

    pub fn clone(self: *const Table, a: std.mem.Allocator) !Table {
        const cells = try a.alloc(Cell, self.cells.len);
        var initialized: usize = 0;
        errdefer {
            for (cells[0..initialized]) |*owned_cell| owned_cell.deinit(a);
            a.free(cells);
        }
        for (self.cells, cells) |source, *target| {
            target.* = try source.clone(a);
            initialized += 1;
        }
        var result = self.*;
        result.cells = cells;
        result.cell_properties = try a.dupe(@import("created_cell_property.zig").Property, self.cell_properties);
        return result;
    }

    pub fn cell(self: *const Table, row: u32, column: u32) !creation.Cell {
        const base = try self.plan.cell(row, column);
        if (self.cell_properties.len == 0) return base;
        if (self.cell_properties.len != self.cells.len) return error.InvalidTableCell;
        const value = self.cell_properties[@as(usize, row) * self.plan.columns + column].geometry;
        if (value.row != row or value.column != column or value.width == 0 or value.height == 0) return error.InvalidTableCell;
        return value;
    }
    pub fn extent(self: *const Table) !struct { width: u32, height: u32 } {
        if (self.cell_properties.len == 0) return .{ .width = self.plan.width, .height = try self.plan.height() };
        if (self.cell_properties.len != self.cells.len) return error.InvalidTableCell;
        var width: u32 = 0;
        var height: u32 = 0;
        for (self.cell_properties) |value| {
            width = @max(width, try std.math.add(u32, value.geometry.x, value.geometry.width));
            height = @max(height, try std.math.add(u32, value.geometry.y, value.geometry.height));
        }
        return .{ .width = width, .height = height };
    }
    /// Explicit per-cell geometry: x is the current row prefix, y uses row maxima.
    /// Does not rewrite peer cell dimensions or invent equal-column constraints.
    pub fn reflowProperties(self: *Table) !void {
        if (self.cell_properties.len == 0) return;
        if (self.cell_properties.len != try std.math.mul(usize, self.plan.rows, self.plan.columns)) return error.InvalidTableCell;
        var y: u32 = 0;
        for (0..self.plan.rows) |row| {
            var x: u32 = 0;
            var height: u32 = 0;
            for (0..self.plan.columns) |column| {
                const value = &self.cell_properties[row * self.plan.columns + column].geometry;
                if (value.width == 0 or value.height == 0) return error.InvalidTableCell;
                value.row = @intCast(row);
                value.column = @intCast(column);
                value.x = x;
                value.y = y;
                x = try std.math.add(u32, x, value.width);
                height = @max(height, value.height);
            }
            y = try std.math.add(u32, y, height);
        }
    }
    pub fn cellBorderFill(self: *const Table, row: u32, column: u32) !u32 {
        _ = try self.cell(row, column);
        if (self.cell_properties.len == 0) return self.resources.border_fill;
        const property = self.cell_properties[@as(usize, row) * self.plan.columns + column];
        if (!@import("border_fill_patch.zig").has(property.appearance)) return self.resources.border_fill;
        return property.materialized_border_fill orelse error.UnmaterializedCreatedCellAppearance;
    }
    pub fn replaceText(self: *Table, a: std.mem.Allocator, row: u32, column: u32, text: []const u8, max_bytes: usize) !bool {
        _ = try self.plan.cell(row, column);
        const index = try std.math.add(usize, try std.math.mul(usize, row, self.plan.columns), column);
        if (index >= self.cells.len) return error.InvalidTableCell;
        if (text.len > max_bytes) return error.LimitExceeded;
        if (!std.unicode.utf8ValidateSlice(text)) return error.InvalidTableCellText;
        return self.cells[index].replaceAll(a, self.resources.character, text, max_bytes);
    }
};

/// Caller owns document-wide ID/resource selection; this validates local IDs.
pub fn create(a: std.mem.Allocator, identity: u64, instance_id: u32, plan: creation.Plan, paragraph_ids: []const u32, resources: Resources, max_cells: usize) !Table {
    if (identity == 0 or instance_id == 0) return error.InvalidCreatedTableIdentity;
    _ = try creation.create(plan.rows, plan.columns, plan.width, plan.row_height, max_cells);
    const count = try std.math.mul(usize, plan.rows, plan.columns);
    if (paragraph_ids.len != count) return error.InvalidTableParagraphIds;
    var used: std.AutoHashMap(u32, void) = .init(a);
    defer used.deinit();
    for (paragraph_ids) |id| {
        if (id == 0) return error.InvalidTableParagraphIds;
        if ((try used.getOrPut(id)).found_existing) return error.InvalidTableParagraphIds;
    }
    const cells = try a.alloc(Cell, count);
    for (paragraph_ids, cells) |id, *cell| cell.* = .{ .paragraph_id = id, .text = &.{} };
    return .{ .identity = identity, .instance_id = instance_id, .plan = plan, .resources = resources, .cells = cells };
}

fn allocationCase(a: std.mem.Allocator) !void {
    const plan = try creation.create(2, 2, 101, 17, 4);
    var table = try create(a, 11, 19, plan, &.{ 7, 9, 13, 21 }, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 4);
    defer table.deinit(a);
    try std.testing.expect(try table.replaceText(a, 1, 1, "셀😀<&", 100));
    try std.testing.expect(!try table.replaceText(a, 1, 1, "셀😀<&", 100));
    var copy = try table.clone(a);
    defer copy.deinit(a);
    try std.testing.expectEqualDeep(table, copy);
    try std.testing.expect(try copy.replaceText(a, 1, 1, "다른 값", 100));
    try std.testing.expectEqualStrings("셀😀<&", table.cells[3].text);
    try std.testing.expectEqual(@as(u32, 21), copy.cells[3].paragraph_id);
    try std.testing.expectError(error.LimitExceeded, table.replaceText(a, 1, 1, "too long", 1));
    try std.testing.expectError(error.InvalidTableCellText, table.replaceText(a, 1, 1, &.{255}, 100));
    try std.testing.expectError(error.InvalidTableCell, table.replaceText(a, 2, 0, "x", 100));
    try std.testing.expectEqualStrings("셀😀<&", table.cells[3].text);
}

test "created table owns Unicode cells and clones with allocation cleanup" {
    try allocationCase(std.testing.allocator);
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationCase, .{});
}

test "created table refuses duplicate missing zero IDs and excessive grids" {
    const a = std.testing.allocator;
    const plan = try creation.create(1, 2, 10, 1, 2);
    const resources: Resources = .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 };
    try std.testing.expectError(error.InvalidCreatedTableIdentity, create(a, 0, 1, plan, &.{ 1, 2 }, resources, 2));
    try std.testing.expectError(error.InvalidCreatedTableIdentity, create(a, 1, 0, plan, &.{ 1, 2 }, resources, 2));
    try std.testing.expectError(error.InvalidTableParagraphIds, create(a, 1, 1, plan, &.{1}, resources, 2));
    try std.testing.expectError(error.InvalidTableParagraphIds, create(a, 1, 1, plan, &.{ 1, 1 }, resources, 2));
    try std.testing.expectError(error.InvalidTableParagraphIds, create(a, 1, 1, plan, &.{ 0, 2 }, resources, 2));
    try std.testing.expectError(error.LimitExceeded, create(a, 1, 1, plan, &.{ 1, 2 }, resources, 1));
}

test "created table failed replacement and clone preserve prior values and alias safely" {
    const a = std.testing.allocator;
    var table = try create(a, 1, 1, try creation.create(1, 1, 10, 2, 1), &.{3}, .{ .paragraph = 0, .character = 0, .style = 0, .border_fill = 1 }, 1);
    defer table.deinit(a);
    _ = try table.replaceText(a, 0, 0, "셀😀", 100);
    var replacement_failure = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    try std.testing.expectError(error.OutOfMemory, table.replaceText(replacement_failure.allocator(), 0, 0, "replacement", 100));
    try std.testing.expectEqualStrings("셀😀", table.cells[0].text);
    for (0..2) |failure_index| {
        var clone_failure = std.testing.FailingAllocator.init(a, .{ .fail_index = failure_index });
        try std.testing.expectError(error.OutOfMemory, table.clone(clone_failure.allocator()));
        try std.testing.expectEqualStrings("셀😀", table.cells[0].text);
        try std.testing.expectEqual(clone_failure.allocated_bytes, clone_failure.freed_bytes);
    }
    _ = try table.replaceText(a, 0, 0, table.cells[0].text[0..3], 100);
    try std.testing.expectEqualStrings("셀", table.cells[0].text);
}

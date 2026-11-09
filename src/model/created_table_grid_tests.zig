const std = @import("std");
const grid = @import("created_table_grid.zig");
const created = @import("created_table.zig");
const creation = @import("table_creation_plan.zig");
const testing = std.testing;
const a = testing.allocator;
const limits: grid.Limits = .{ .max_cells = 100, .max_text_bytes = 10000 };

fn fixture(rows: u32, columns: u32) !created.Table {
    var ids: [64]u32 = undefined;
    const count = rows * columns;
    for (ids[0..count], 0..) |*id, i| id.* = @intCast(10 + i * 7);
    var table = try created.create(a, 901, 77, try creation.create(rows, columns, 31, 9, 64), ids[0..count], .{ .paragraph = 17, .character = 23, .style = 29, .border_fill = 31 }, 64);
    errdefer table.deinit(a);
    for (table.cells, 0..) |*cell, i| cell.text = try std.fmt.allocPrint(a, "셀😀<&>\"'\n{d}", .{i});
    return table;
}

// Independent oracle: edit a fixed 2-D matrix by moving whole rows or shifting
// each row's slots. No production destination-to-source coordinate formula.
fn oracle(source: *const created.Table, command: grid.Command, new_ids: []const u32, candidate: *const created.Table) !void {
    var matrix: [8][8]u32 = @splat(@splat(0));
    var rows: usize = source.plan.rows;
    var columns: usize = source.plan.columns;
    var position: usize = 0;
    for (0..rows) |row| for (0..columns) |column| {
        matrix[row][column] = source.cells[position].paragraph_id;
        position += 1;
    };
    switch (command) {
        .insert_row => |index| {
            var row = rows;
            while (row > index) : (row -= 1) matrix[row] = matrix[row - 1];
            @memcpy(matrix[index][0..columns], new_ids);
            rows += 1;
        },
        .delete_row => |index| {
            for (index..rows - 1) |row| matrix[row] = matrix[row + 1];
            rows -= 1;
        },
        .insert_column => |index| {
            for (0..rows) |row| {
                var column = columns;
                while (column > index) : (column -= 1) matrix[row][column] = matrix[row][column - 1];
                matrix[row][index] = new_ids[row];
            }
            columns += 1;
        },
        .delete_column => |index| {
            for (0..rows) |row| for (index..columns - 1) |column| {
                matrix[row][column] = matrix[row][column + 1];
            };
            columns -= 1;
        },
    }
    try testing.expectEqual(source.identity, candidate.identity);
    try testing.expectEqual(source.instance_id, candidate.instance_id);
    try testing.expectEqualDeep(source.resources, candidate.resources);
    try testing.expectEqual(rows, candidate.plan.rows);
    try testing.expectEqual(columns, candidate.plan.columns);
    try testing.expectEqual(source.plan.width, candidate.plan.width);
    try testing.expectEqual(source.plan.row_height, candidate.plan.row_height);
    try testing.expectEqual(rows * columns, candidate.cells.len);
    try testing.expect(candidate.cells.ptr != source.cells.ptr);
    position = 0;
    for (0..rows) |row| for (0..columns) |column| {
        const cell = candidate.cells[position];
        position += 1;
        try testing.expectEqual(matrix[row][column], cell.paragraph_id);
        var survivor = false;
        for (source.cells) |prior| {
            if (prior.paragraph_id != cell.paragraph_id) continue;
            survivor = true;
            try testing.expectEqualStrings(prior.text, cell.text);
            if (cell.text.len != 0) try testing.expect(prior.text.ptr != cell.text.ptr);
            break;
        }
        if (!survivor) try testing.expectEqualStrings("", cell.text);
    };
    // Width oracle distributes one unit at a time instead of quotient/remainder.
    var widths: [8]u32 = @splat(0);
    for (0..source.plan.width) |unit| widths[unit % columns] += 1;
    var x: u32 = 0;
    for (0..columns) |column| {
        const cell = try candidate.plan.cell(@intCast(rows - 1), @intCast(column));
        try testing.expectEqual(widths[column], cell.width);
        try testing.expectEqual(x, cell.x);
        try testing.expectEqual(@as(u32, @intCast((rows - 1) * source.plan.row_height)), cell.y);
        x += cell.width;
    }
    try testing.expectEqual(source.plan.width, x);
}

test "created table grid randomized matrix oracle every insert delete edge and ownership" {
    var random = std.Random.DefaultPrng.init(0xc4ea7ed);
    var cases: usize = 0;
    for (0..32) |_| {
        const rows = random.random().uintLessThan(u32, 6) + 1;
        const columns = random.random().uintLessThan(u32, 6) + 1;
        var source = try fixture(rows, columns);
        defer source.deinit(a);
        var snapshot = try source.clone(a);
        defer snapshot.deinit(a);
        const ids = [_]u32{ 1001, 1003, 1009, 1013, 1019, 1021 };
        for (0..4) |kind| {
            const row_edit = kind < 2;
            const insertion = kind % 2 == 0;
            const dimension = if (row_edit) rows else columns;
            if (!insertion and dimension == 1) continue;
            const end = dimension + @as(u32, @intFromBool(insertion));
            for (0..end) |index| {
                const command: grid.Command = switch (kind) {
                    0 => .{ .insert_row = @intCast(index) },
                    1 => .{ .delete_row = @intCast(index) },
                    2 => .{ .insert_column = @intCast(index) },
                    else => .{ .delete_column = @intCast(index) },
                };
                const new_ids = ids[0..if (!insertion) 0 else if (row_edit) columns else rows];
                var candidate = try grid.edit(a, &source, command, new_ids, limits);
                defer candidate.deinit(a);
                try oracle(&source, command, new_ids, &candidate);
                try testing.expectEqualDeep(snapshot, source);
                if (candidate.cells[0].text.len != 0) candidate.cells[0].text[0] = 'X';
                try testing.expectEqualDeep(snapshot, source);
                cases += 1;
            }
        }
    }
    try testing.expect(cases > 400);
}

fn rejected(expected: anyerror, source: *const created.Table, command: grid.Command, ids: []const u32, budget: grid.Limits) !void {
    var snapshot = try source.clone(a);
    defer snapshot.deinit(a);
    const cells_ptr = source.cells.ptr;
    try testing.expectError(expected, grid.edit(a, source, command, ids, budget));
    try testing.expectEqualDeep(snapshot, source.*);
    try testing.expect(cells_ptr == source.cells.ptr);
}

test "created table grid rejects invalid requests IDs limits and all malformed source fields" {
    var source = try fixture(2, 2);
    defer source.deinit(a);
    for ([_]grid.Command{ .{ .insert_row = 3 }, .{ .insert_column = 3 }, .{ .delete_row = 2 }, .{ .delete_column = 2 }, .{ .insert_row = std.math.maxInt(u32) } }) |command|
        try rejected(error.InvalidTableGridEdit, &source, command, &.{}, limits);
    for ([_][]const u32{ &.{}, &.{1000}, &.{ 1000, 1001, 1002 }, &.{ 1000, 1000 }, &.{ 0, 1000 }, &.{ 10, 1000 }, &.{ 1000, 31 } }) |ids| {
        try rejected(error.InvalidTableParagraphIds, &source, .{ .insert_row = 0 }, ids, limits);
        try rejected(error.InvalidTableParagraphIds, &source, .{ .insert_column = 2 }, ids, limits);
    }
    try rejected(error.InvalidTableParagraphIds, &source, .{ .delete_row = 0 }, &.{1000}, limits);
    try rejected(error.InvalidTableParagraphIds, &source, .{ .delete_column = 0 }, &.{1000}, limits);
    try rejected(error.InvalidTableGridLimits, &source, .{ .delete_row = 0 }, &.{}, .{ .max_cells = 0, .max_text_bytes = 100 });
    try rejected(error.LimitExceeded, &source, .{ .delete_row = 0 }, &.{}, .{ .max_cells = 3, .max_text_bytes = 10000 });
    try rejected(error.LimitExceeded, &source, .{ .insert_row = 0 }, &.{ 1000, 1001 }, .{ .max_cells = 5, .max_text_bytes = 10000 });
    try rejected(error.LimitExceeded, &source, .{ .insert_column = 0 }, &.{ 1000, 1001 }, .{ .max_cells = 5, .max_text_bytes = 10000 });
    var bytes: usize = 0;
    for (source.cells) |cell| bytes += cell.text.len;
    try rejected(error.LimitExceeded, &source, .{ .delete_row = 0 }, &.{}, .{ .max_cells = 4, .max_text_bytes = bytes - 1 });
    var exact = try grid.edit(a, &source, .{ .delete_column = 1 }, &.{}, .{ .max_cells = 4, .max_text_bytes = bytes });
    exact.deinit(a);

    var bad = source;
    bad.identity = 0;
    try rejected(error.InvalidCreatedTableIdentity, &bad, .{ .delete_row = 0 }, &.{}, limits);
    bad = source;
    bad.instance_id = 0;
    try rejected(error.InvalidCreatedTableIdentity, &bad, .{ .delete_row = 0 }, &.{}, limits);
    for (0..5) |field| {
        bad = source;
        switch (field) {
            0 => bad.plan.rows = 0,
            1 => bad.plan.columns = 0,
            2 => bad.plan.width = 1,
            3 => bad.plan.row_height = 0,
            else => bad.plan.row_height = std.math.maxInt(u32),
        }
        try rejected(error.InvalidTableCreation, &bad, .{ .delete_row = 0 }, &.{}, limits);
    }
    bad = source;
    bad.cells = source.cells[0..3];
    try rejected(error.InvalidTableCell, &bad, .{ .delete_row = 0 }, &.{}, limits);
    bad = source;
    bad.plan.rows = 1;
    try rejected(error.InvalidTableCell, &bad, .{ .insert_row = 0 }, &.{ 1000, 1001 }, limits);
    const saved_id = source.cells[3].paragraph_id;
    source.cells[3].paragraph_id = 0;
    try rejected(error.InvalidTableParagraphIds, &source, .{ .delete_row = 1 }, &.{}, limits);
    source.cells[3].paragraph_id = source.cells[0].paragraph_id;
    try rejected(error.InvalidTableParagraphIds, &source, .{ .delete_column = 1 }, &.{}, limits);
    source.cells[3].paragraph_id = saved_id;
    // Even deleted text must be valid UTF-8: truncated astral, surrogate,
    // overlong, isolated continuation, and above U+10FFFF.
    const saved_text = source.cells[3].text;
    defer source.cells[3].text = saved_text;
    for ([_][]const u8{ "\xf0\x9f\x98", "\xed\xa0\x80", "\xc0\xaf", "\x80", "\xf4\x90\x80\x80" }) |invalid| {
        const text = try a.dupe(u8, invalid);
        defer a.free(text);
        source.cells[3].text = text;
        try rejected(error.InvalidTableCellText, &source, .{ .delete_row = 1 }, &.{}, limits);
        try rejected(error.InvalidTableCellText, &source, .{ .delete_column = 1 }, &.{}, limits);
    }
}

test "created table grid final dimension width policy max dimensions and overflow" {
    var source = try fixture(1, 1);
    defer source.deinit(a);
    try rejected(error.InvalidTableGridEdit, &source, .{ .delete_row = 0 }, &.{}, limits);
    try rejected(error.InvalidTableGridEdit, &source, .{ .delete_column = 0 }, &.{}, limits);
    source.plan.width = 1;
    try rejected(error.InvalidTableCreation, &source, .{ .insert_column = 1 }, &.{1000}, limits);
    source.plan.width = std.math.maxInt(u32);
    source.plan.row_height = std.math.maxInt(u32);
    try rejected(error.InvalidTableCreation, &source, .{ .insert_row = 1 }, &.{1000}, limits);
    var maximum = try grid.edit(a, &source, .{ .insert_column = 1 }, &.{std.math.maxInt(u32)}, limits);
    defer maximum.deinit(a);
    const left = try maximum.plan.cell(0, 0);
    const right = try maximum.plan.cell(0, 1);
    try testing.expectEqual(std.math.maxInt(u32), left.width + right.width);
    try testing.expectEqual(std.math.maxInt(u32), try maximum.plan.height());
    // Forged huge inventories are rejected without iterating a fictitious
    // slice or allocating enormous buffers. Format-neutral model uses u32.
    var bad = source;
    bad.plan.rows = std.math.maxInt(u32);
    bad.plan.columns = std.math.maxInt(u32);
    bad.plan.row_height = 1;
    try rejected(error.LimitExceeded, &bad, .{ .insert_row = 0 }, &.{}, limits);
    bad.plan.columns = 1;
    try rejected(error.InvalidTableCell, &bad, .{ .insert_row = 0 }, &.{}, .{ .max_cells = std.math.maxInt(usize), .max_text_bytes = 10000 });
    var empty = try created.create(a, 1, 1, try creation.create(1, 1, 2, 1, 1), &.{1}, source.resources, 1);
    defer empty.deinit(a);
    var inserted = try grid.edit(a, &empty, .{ .insert_column = 0 }, &.{2}, .{ .max_cells = 2, .max_text_bytes = 0 });
    defer inserted.deinit(a);
    try testing.expectEqual(@as(u32, 2), inserted.cells[0].paragraph_id);
    try testing.expectEqual(@as(u32, 1), inserted.cells[1].paragraph_id);
    for (inserted.cells) |cell| try testing.expectEqualStrings("", cell.text);
}

fn allocationCase(allocator: std.mem.Allocator, source: *const created.Table, baseline: *const created.Table, command: grid.Command, ids: []const u32) !void {
    const source_pointer = source.cells.ptr;
    var text_pointers: [64][*]u8 = undefined;
    for (source.cells, 0..) |cell, i| text_pointers[i] = cell.text.ptr;
    var candidate = grid.edit(allocator, source, command, ids, limits) catch |err| {
        try testing.expectEqualDeep(baseline.*, source.*);
        try testing.expect(source_pointer == source.cells.ptr);
        for (baseline.cells, source.cells, 0..) |prior, current, i| {
            try testing.expectEqualStrings(prior.text, current.text);
            try testing.expect(text_pointers[i] == current.text.ptr);
        }
        return err;
    };
    defer candidate.deinit(allocator);
    try oracle(source, command, ids, &candidate);
    try testing.expectEqualDeep(baseline.*, source.*);
    try testing.expect(source_pointer == source.cells.ptr);
    for (source.cells, 0..) |cell, i| try testing.expect(text_pointers[i] == cell.text.ptr);
}

test "created table grid all four commands ordinary leak checked and noresize OOM preserve source" {
    var source = try fixture(3, 4);
    defer source.deinit(a);
    var baseline = try source.clone(a);
    defer baseline.deinit(a);
    const commands = [_]grid.Command{ .{ .insert_row = 1 }, .{ .delete_row = 1 }, .{ .insert_column = 2 }, .{ .delete_column = 2 } };
    const ids = [_][]const u32{ &.{ 1000, 1001, 1002, 1003 }, &.{}, &.{ 1000, 1001, 1002 }, &.{} };
    for (commands, ids) |command, new_ids| {
        try allocationCase(a, &source, &baseline, command, new_ids);
        try @import("../testing/allocation_failures.zig").check(allocationCase, .{ &source, &baseline, command, new_ids });
    }
}

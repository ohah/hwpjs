const std = @import("std");
const batch = @import("cell_vertical_alignment_batch_plan.zig");
const block = @import("../../model/original_cell_block.zig");
const fixture = @import("cell_vertical_alignment_batch_fixture.zig");
const projection = @import("../model_projection.zig");
const ticket: @import("../../model/history_mutation_epoch.zig").Ticket = .{ .binding = .{ .document = 1, .generation = 1, .owner = 1 }, .epoch = 1 };
const Capture = struct {
    cells: []block.Witness,
    table_node: u32,
    pub fn deinit(self: Capture, a: std.mem.Allocator) void {
        for (self.cells) |cell| a.free(cell.paragraphs);
        a.free(self.cells);
    }
    pub fn witness(self: Capture, rectangle: block.Rectangle) batch.Witness {
        return .{ .section = 0, .table_node = self.table_node, .selection = .{ .rows = 2, .columns = 2, .rectangle = rectangle, .cells = self.cells } };
    }
};
const top: block.Rectangle = .{ .top = 0, .left = 0, .bottom = 1, .right = 2 };
const all: block.Rectangle = .{ .top = 0, .left = 0, .bottom = 2, .right = 2 };
fn capture(a: std.mem.Allocator, raw: []const u8, section: @import("../../model/document.zig").Section, rectangle: block.Rectangle) !Capture {
    const bindings = try @import("table_display_bindings.zig").read(a, raw, fixture.version, section.paragraphs);
    defer a.free(bindings);
    if (bindings.len == 0) return error.InvalidOwnFixture;
    var cells: std.ArrayList(block.Witness) = .empty;
    errdefer {
        for (cells.items) |cell| a.free(cell.paragraphs);
        cells.deinit(a);
    }
    var by_list: std.AutoHashMap(u32, usize) = .init(a);
    defer by_list.deinit();
    for (bindings) |binding| {
        if (binding.row >= rectangle.bottom or binding.column >= rectangle.right or binding.row + binding.row_span <= rectangle.top or binding.column + binding.column_span <= rectangle.left) continue;
        if (by_list.get(binding.list_node)) |index| {
            const old = cells.items[index].paragraphs;
            const next = try a.alloc(u32, old.len + 1);
            @memcpy(next[0..old.len], old);
            next[old.len] = binding.paragraph;
            a.free(old);
            cells.items[index].paragraphs = next;
        } else {
            const paragraphs = try a.dupe(u32, &.{binding.paragraph});
            errdefer a.free(paragraphs);
            try by_list.put(binding.list_node, cells.items.len);
            try cells.append(a, .{ .list_node = binding.list_node, .row = binding.row, .column = binding.column, .paragraphs = paragraphs });
        }
    }
    return .{ .cells = try cells.toOwnedSlice(a), .table_node = bindings[0].table_node };
}
test "original cell block H5 immutable two owners prepare one section exact mask only" {
    const a = std.testing.allocator;
    const raw = try fixture.make(a, .plain);
    defer a.free(raw);
    const snapshot = try a.dupe(u8, raw);
    defer a.free(snapshot);
    var document = try projection.fromDecodedSections(a, fixture.version, &.{raw});
    defer document.deinit(a);
    const selected = try capture(a, raw, document.sections[0], top);
    defer selected.deinit(a);
    var before = try batch.observe(a, raw, fixture.version, document.sections[0], 0, selected.witness(top), ticket, false);
    defer before.deinit(a);
    var output = (try batch.prepare(a, raw, fixture.version, document.sections[0], 0, before, .center, ticket, false, raw.len)).?;
    defer output.deinit(a);
    const expected = try fixture.expected(a, raw, &.{ 0, 1 }, 1);
    defer a.free(expected);
    try std.testing.expectEqual(@as(usize, 2), output.changed_cells);
    try std.testing.expectEqualSlices(u8, expected, output.bytes);
    try std.testing.expectEqualSlices(u8, snapshot, raw);
}
test "original cell block H5 merged slots and multiple paragraphs deduplicate physical owners" {
    const a = std.testing.allocator;
    for ([_]fixture.Mode{ .merged_top, .multiparagraph_first }) |mode| {
        const raw = try fixture.make(a, mode);
        defer a.free(raw);
        var document = try projection.fromDecodedSections(a, fixture.version, &.{raw});
        defer document.deinit(a);
        const selected = try capture(a, raw, document.sections[0], top);
        defer selected.deinit(a);
        var before = try batch.observe(a, raw, fixture.version, document.sections[0], 0, selected.witness(top), ticket, false);
        defer before.deinit(a);
        try std.testing.expectEqual(@as(usize, if (mode == .merged_top) 1 else 2), before.entries.len);
        if (mode == .multiparagraph_first) try std.testing.expectEqual(@as(usize, 2), before.entries[0].paragraphs.len);
        var output = (try batch.prepare(a, raw, fixture.version, document.sections[0], 0, before, .bottom, ticket, false, raw.len)).?;
        defer output.deinit(a);
        const expected = try fixture.expected(a, raw, if (mode == .merged_top) &.{0} else &.{ 0, 1 }, 2);
        defer a.free(expected);
        try std.testing.expectEqual(before.entries.len, output.changed_cells);
        try std.testing.expectEqualSlices(u8, expected, output.bytes);
    }
}
test "original cell block H5 final protected reserved owner fails all cells without input mutation" {
    const a = std.testing.allocator;
    for ([_]fixture.Mode{ .protected_last, .reserved_last }) |mode| {
        const raw = try fixture.make(a, mode);
        defer a.free(raw);
        const snapshot = try a.dupe(u8, raw);
        defer a.free(snapshot);
        var document = try projection.fromDecodedSections(a, fixture.version, &.{raw});
        defer document.deinit(a);
        const selected = try capture(a, raw, document.sections[0], all);
        defer selected.deinit(a);
        var before = try batch.observe(a, raw, fixture.version, document.sections[0], 0, selected.witness(all), ticket, false);
        defer before.deinit(a);
        if (mode == .protected_last) try std.testing.expectError(error.CellVerticalAlignmentReadOnly, batch.prepare(a, raw, fixture.version, document.sections[0], 0, before, .center, ticket, false, raw.len)) else try std.testing.expectError(error.UnsupportedCellVerticalAlignment, batch.prepare(a, raw, fixture.version, document.sections[0], 0, before, .center, ticket, false, raw.len));
        try std.testing.expectEqualSlices(u8, snapshot, raw);
    }
}
test "original cell block H5 source ticket scope attributes section and budget are fenced" {
    const a = std.testing.allocator;
    const raw = try fixture.make(a, .plain);
    defer a.free(raw);
    var document = try projection.fromDecodedSections(a, fixture.version, &.{raw});
    defer document.deinit(a);
    const selected = try capture(a, raw, document.sections[0], top);
    defer selected.deinit(a);
    var before = try batch.observe(a, raw, fixture.version, document.sections[0], 0, selected.witness(top), ticket, false);
    defer before.deinit(a);
    var foreign = ticket;
    foreign.binding.document += 1;
    try std.testing.expectError(error.StaleCellVerticalAlignment, batch.prepare(a, raw, fixture.version, document.sections[0], 0, before, .center, foreign, false, raw.len));
    before.source_sha256[0] ^= 1;
    try std.testing.expectError(error.StaleCellVerticalAlignment, batch.prepare(a, raw, fixture.version, document.sections[0], 0, before, .center, ticket, false, raw.len));
    before.source_sha256[0] ^= 1;
    before.entries[1].attributes ^= 0x100;
    try std.testing.expectError(error.StaleCellVerticalAlignment, batch.prepare(a, raw, fixture.version, document.sections[0], 0, before, .center, ticket, false, raw.len));
    before.entries[1].attributes ^= 0x100;
    try std.testing.expectError(error.InvalidSection, batch.prepare(a, raw, fixture.version, document.sections[0], 1, before, .center, ticket, false, raw.len));
    try std.testing.expectError(error.LimitExceeded, batch.prepare(a, raw, fixture.version, document.sections[0], 0, before, .center, ticket, false, raw.len - 1));
}
test "original cell block H5 all noop and mixed noop avoid partial publication" {
    const a = std.testing.allocator;
    const raw = try fixture.make(a, .plain);
    defer a.free(raw);
    var document = try projection.fromDecodedSections(a, fixture.version, &.{raw});
    defer document.deinit(a);
    const selected = try capture(a, raw, document.sections[0], top);
    defer selected.deinit(a);
    var before = try batch.observe(a, raw, fixture.version, document.sections[0], 0, selected.witness(top), ticket, false);
    defer before.deinit(a);
    try std.testing.expect((try batch.prepare(a, raw, fixture.version, document.sections[0], 0, before, .top, ticket, false, raw.len)) == null);
    const mixed = try fixture.expected(a, raw, &.{0}, 2);
    defer a.free(mixed);
    var current = try batch.observe(a, mixed, fixture.version, document.sections[0], 0, selected.witness(top), ticket, false);
    defer current.deinit(a);
    var output = (try batch.prepare(a, mixed, fixture.version, document.sections[0], 0, current, .bottom, ticket, false, mixed.len)).?;
    defer output.deinit(a);
    const expected = try fixture.expected(a, raw, &.{ 0, 1 }, 2);
    defer a.free(expected);
    try std.testing.expectEqual(@as(usize, 1), output.changed_cells);
    try std.testing.expectEqualSlices(u8, expected, output.bytes);
}
test "original cell block H5 checked exhaustive preparation keeps immutable input on all failures" {
    const a = std.testing.allocator;
    const raw = try fixture.make(a, .plain);
    defer a.free(raw);
    const snapshot = try a.dupe(u8, raw);
    defer a.free(snapshot);
    var document = try projection.fromDecodedSections(a, fixture.version, &.{raw});
    defer document.deinit(a);
    const selected = try capture(a, raw, document.sections[0], top);
    defer selected.deinit(a);
    const expected = try fixture.expected(a, raw, &.{ 0, 1 }, 1);
    defer a.free(expected);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, section: @import("../../model/document.zig").Section, witness: batch.Witness, wanted: []const u8, original: []const u8) !void {
            defer std.debug.assert(std.mem.eql(u8, bytes, original));
            var before = try batch.observe(allocator, bytes, fixture.version, section, 0, witness, ticket, false);
            defer before.deinit(allocator);
            var output = (try batch.prepare(allocator, bytes, fixture.version, section, 0, before, .center, ticket, false, bytes.len)).?;
            defer output.deinit(allocator);
            try std.testing.expectEqualSlices(u8, wanted, output.bytes);
        }
    }.run, .{ raw, document.sections[0], selected.witness(top), expected, snapshot });
    try std.testing.expectEqualSlices(u8, snapshot, raw);
}

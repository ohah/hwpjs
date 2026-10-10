//! native 소유 크기 값입니다. 저장 태그는 여기에 캐시하지 않습니다.
const std = @import("std");
const writer = @import("table_cell_size_write.zig");
pub const Entry = struct { cell_node: usize, size: writer.Size };
pub const Values = std.ArrayList(Entry);

pub fn set(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, values: *Values, node: usize, size: writer.Size, max_bytes: usize) !bool {
    const validated = try writer.write(a, tree, node, size, max_bytes);
    defer a.free(validated);
    const source = try @import("table_display_cell.zig").read(a, tree, node);
    const original: writer.Size = .{ .width = source.width orelse return error.MissingCellSizeAttribute, .height = source.height orelse return error.MissingCellSizeAttribute };
    for (values.items, 0..) |*entry, index| {
        if (entry.cell_node != node) continue;
        if (std.meta.eql(entry.size, size)) return false;
        if (std.meta.eql(original, size)) {
            _ = values.orderedRemove(index);
        } else entry.size = size;
        return true;
    }
    if (std.meta.eql(original, size)) return false;
    if (values.items.len >= 100000) return error.LimitExceeded;
    try values.append(a, .{ .cell_node = node, .size = size });
    return true;
}

test "HWPX cell size values own only scalar changes and remove original value restoration" {
    const a = std.testing.allocator;
    var tree = try @import("section_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:tc><p:cellSz width='10' height='20'/></p:tc></s:sec>", 0, 0, .{});
    defer tree.deinit(a);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const @import("xml_part_tree.zig").Tree) !void {
            var values: Values = .empty;
            defer values.deinit(allocator);
            try std.testing.expect(!try set(allocator, source, &values, 1, .{ .width = 10, .height = 20 }, 1000));
            try std.testing.expect(try set(allocator, source, &values, 1, .{ .width = 0, .height = 40 }, 1000));
            try std.testing.expectEqual(@as(usize, 1), values.items.len);
            try std.testing.expect(!try set(allocator, source, &values, 1, .{ .width = 0, .height = 40 }, 1000));
            try std.testing.expect(try set(allocator, source, &values, 1, .{ .width = 10, .height = 20 }, 1000));
            try std.testing.expectEqual(@as(usize, 0), values.items.len);
        }
    }.run, .{&tree});
}

test "HWPX cell size history growth limit rolls back current values and keeps source bytes" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/table.hwpx", a, .limited(2_000_000));
    defer a.free(bytes);
    var session = try @import("editor_session.zig").open(a, bytes, .{});
    defer session.deinit();
    const bindings = try @import("table_display_bindings.zig").read(a, &session, 0);
    defer a.free(bindings);
    const limit = try @import("editor_checkpoint.zig").size(&session, std.math.maxInt(usize));
    var history = try @import("editor_history.zig").History.init(&session, 2, limit);
    defer history.deinit();
    try std.testing.expectError(error.LimitExceeded, history.apply(&session, .{ .kind = .cell_size, .paragraph = 0, .start = 0, .deleted = 0, .inserted = "", .list_node = bindings[0].owner.list_node, .cell_size = .{ .width = 1, .height = 1 } }));
    try std.testing.expectEqual(@as(usize, 0), session.sections[0].cell_sizes.items.len);
    try std.testing.expect(!try history.undo(&session));
    const saved = try session.save();
    defer a.free(saved);
    try std.testing.expectEqualSlices(u8, bytes, saved);
}

//! Physical-order bounded inventory; selected-owner admission remains in History commit.
const std = @import("std");
const wire = @import("page_restart_wire.zig");
const H5 = @import("../hwp5/edit/page_restart_history.zig");
const HX = @import("../hwpx/page_restart_history.zig");
pub const H5Store = wire.Store(H5.Observation);
pub const HXStore = wire.Store(HX.Observation);
fn before(a: std.mem.Allocator, lease: u64, binding: wire.Binding) !wire.Before {
    return .{ .lease = try std.fmt.allocPrint(a, "{d}", .{lease}), .session = binding.session, .revision = binding.revision, .serial = binding.serial };
}
fn reply(a: std.mem.Allocator, format: []const u8, binding: wire.Binding, rows: []const wire.Row) ![]u8 {
    return std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .format = format, .binding = binding, .rows = rows }, .{});
}
pub fn h5(a: std.mem.Allocator, s: *@import("../hwp5/edit/style_preservation.zig").Session, h: *@import("../hwp5/edit/editor_history.zig").History, store: *H5Store, binding: wire.Binding) ![]u8 {
    store.clear(a);
    errdefer store.clear(a);
    if (s.sectionCount() > 512) return error.LimitExceeded;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var rows: std.ArrayList(wire.Row) = .empty;
    for (0..s.sectionCount()) |section| {
        const candidates = try h.pageRestartInventory(s, a, section);
        defer a.free(candidates);
        for (candidates) |candidate| {
            if (rows.items.len >= 20000) return error.LimitExceeded;
            var row: wire.Row = .{ .section = section, .controlNode = candidate.control, .number = candidate.number, .reason = candidate.reason };
            if (candidate.observation) |observed| {
                row.paragraph = observed.anchor.paragraph;
                row.observation = try before(scratch, try store.capture(a, observed), binding);
            }
            try rows.append(scratch, row);
        }
    }
    return reply(a, "hwp5", binding, rows.items);
}
pub fn hx(a: std.mem.Allocator, s: *@import("../hwpx/editor_session.zig").Session, h: *@import("../hwpx/editor_history.zig").History, store: *HXStore, binding: wire.Binding) ![]u8 {
    store.clear(a);
    errdefer store.clear(a);
    if (s.sections.len > 512) return error.LimitExceeded;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    var rows: std.ArrayList(wire.Row) = .empty;
    const context = try h.pageRestartInventoryContext(s);
    for (0..s.sections.len) |ordinal| {
        const candidates = try @import("../hwpx/page_restart_inventory.zig").readWithContext(a, s, ordinal, context);
        defer a.free(candidates);
        for (candidates) |candidate| {
            if (rows.items.len >= 20000) return error.LimitExceeded;
            var row: wire.Row = .{ .section = ordinal, .controlNode = candidate.control, .number = candidate.number, .reason = candidate.reason };
            if (candidate.observation) |observed| {
                if (observed.paragraph == 0) return error.InvalidPageRestartWire;
                row.paragraph = observed.paragraph - 1;
                row.observation = try before(scratch, try store.capture(a, observed), binding);
            }
            try rows.append(scratch, row);
        }
    }
    return reply(a, "hwpx", binding, rows.items);
}

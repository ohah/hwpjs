//! Bounded reference metadata window, without a JS-side editable model.
const std = @import("std");
const codec = @import("hwp5_current_reference.zig");
fn finish(a: std.mem.Allocator, rows: []const codec.Wire, total: usize, first: u32) ![]u8 {
    return std.json.Stringify.valueAlloc(a, .{ .version = @as(u32, 1), .total = total, .first = first, .references = rows }, .{});
}
pub fn write(a: std.mem.Allocator, session: *const @import("../hwp5/edit/style_preservation.zig").Session, epoch: u64, section: u32, first: u32, requested: u32) ![]u8 {
    if (requested > 1024) return error.LimitExceeded;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const refs = try session.currentParagraphReferences(scratch, section, 2_000_000);
    if (first > refs.len) return error.InvalidCurrentWindow;
    const length = @min(requested, refs.len - first);
    const rows = try scratch.alloc(codec.Wire, length);
    for (refs[first..][0..length], rows) |reference, *row| row.* = try codec.encode(scratch, reference, epoch);
    return finish(a, rows, refs.len, first);
}

/// Bounded source-only window. Do not allocate or traverse the full cell view.
pub fn writeSources(a: std.mem.Allocator, session: *const @import("../hwp5/edit/style_preservation.zig").Session, epoch: u64, section: u32, first: u32, requested: u32) ![]u8 {
    if (requested > 1024) return error.LimitExceeded;
    const total = try session.paragraphCount(section);
    if (first > total) return error.InvalidCurrentWindow;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const scratch = arena.allocator();
    const rows = try scratch.alloc(codec.Wire, @min(requested, total - first));
    for (rows, first..) |*row, index| row.* = try codec.encode(scratch, try session.currentSourceParagraphReference(section, index), epoch);
    return finish(a, rows, total, first);
}

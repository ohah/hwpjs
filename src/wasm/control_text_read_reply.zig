//! Borrowed row serialization only; source/Native ordinal authority stays in
//! the live caller. JSON is detached before its request-local context dies.
const std = @import("std");
const model = @import("../hwpx/control_text_read_context.zig");
pub const Row = struct {
    paragraph: u32,
    sourceNode: u32,
    plain: []const u8,
    text: ?[]const u8,
    units: u32,
    controls: []const model.Control,
    coverage: model.Coverage,
    issue: ?model.Issue,
};
pub fn rows(a: std.mem.Allocator, first: usize, context: *const model.Context) ![]Row {
    if (first == 0) return error.SourceBindingMismatch;
    const out = try a.alloc(Row, context.rows.len);
    errdefer a.free(out);
    for (context.rows, out, 0..) |row, *target, index| {
        if (row.currentIndex != index) return error.SourceBindingMismatch;
        target.* = .{ .paragraph = std.math.cast(u32, try std.math.add(usize, first, index)) orelse return error.LimitExceeded, .sourceNode = std.math.cast(u32, row.sourceNode) orelse return error.LimitExceeded, .plain = row.plain, .text = row.text, .units = row.units, .controls = row.controls, .coverage = row.coverage, .issue = row.issue };
    }
    return out;
}
pub fn write(a: std.mem.Allocator, section: u32, session: []const u8, serial: []const u8, values: []const Row, max_bytes: usize) ![]u8 {
    return writeVersion(a, section, session, serial, values, max_bytes, 1);
}
pub fn writeCurrent(a: std.mem.Allocator, section: u32, session: []const u8, serial: []const u8, values: []const Row, max_bytes: usize) ![]u8 {
    return writeVersion(a, section, session, serial, values, max_bytes, 2);
}
fn writeVersion(a: std.mem.Allocator, section: u32, session: []const u8, serial: []const u8, values: []const Row, max_bytes: usize, version: u32) ![]u8 {
    // Every input string byte can escape to at most six JSON bytes; each
    // numeric/control/row wrapper has a bounded overhead. Check before JSON
    // allocation, not just after a potentially unbounded valueAlloc.
    if (session.len > 256 or serial.len > 20) return error.LimitExceeded;
    var bound: usize = 1024 + 6 * session.len + 6 * serial.len;
    for (values) |row| {
        const text_bytes = try std.math.add(usize, row.plain.len, if (row.text) |text| text.len else 0);
        bound = try std.math.add(usize, bound, try std.math.mul(usize, text_bytes, 6));
        bound = try std.math.add(usize, bound, try std.math.mul(usize, row.controls.len, 192));
        bound = try std.math.add(usize, bound, 512);
        if (bound > max_bytes) return error.LimitExceeded;
    }
    if (session.len > 256 or serial.len > 20 or bound > max_bytes) return error.LimitExceeded;
    var complete = true;
    for (values) |row| complete = complete and row.coverage == .complete;
    return std.json.Stringify.valueAlloc(a, .{ .schemaVersion = version, .axis = "native-control-utf16", .section = section, .readStamp = .{ .session = session, .serial = serial }, .coverage = if (complete) "complete" else "partial", .rows = values }, .{});
}

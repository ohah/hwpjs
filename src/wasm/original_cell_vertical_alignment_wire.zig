//! The Native lease retains the full source/ticket witness. Caller data cannot replace it.
const std = @import("std");
const alignment = @import("../model/cell_vertical_alignment.zig");
pub const max_request_bytes = 256;
pub const Request = struct { lease: u64, value: alignment.Alignment };
pub fn decode(a: std.mem.Allocator, bytes: []const u8) !Request {
    if (bytes.len > max_request_bytes) return error.LimitExceeded;
    const Wire = struct { lease: []const u8, value: []const u8 };
    var parsed = try std.json.parseFromSlice(Wire, a, bytes, .{});
    defer parsed.deinit();
    const raw = parsed.value.lease;
    if (raw.len == 0 or raw.len > 20 or raw[0] == '0') return error.InvalidOriginalCellLease;
    for (raw) |c| if (c < '0' or c > '9') return error.InvalidOriginalCellLease;
    return .{ .lease = std.fmt.parseInt(u64, raw, 10) catch return error.InvalidOriginalCellLease, .value = alignment.fromText(parsed.value.value) orelse return error.UnsupportedCellVerticalAlignment };
}
pub fn observation(a: std.mem.Allocator, format: []const u8, section: u32, paragraph: u32, table: u32, list: u32, lease: u64, revision: u32, value: ?alignment.Alignment, read_only: bool) ![]u8 {
    const token = try std.fmt.allocPrint(a, "{d}", .{lease});
    defer a.free(token);
    return std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .format = format, .section = section, .paragraph = paragraph, .tableNode = table, .listNode = list, .lease = token, .historyRevision = revision, .value = if (value) |v| alignment.text(v) else @as(?[]const u8, null), .editable = !read_only }, .{});
}

//! Only a private Native lease selects the retained full source/ticket observation.
const std = @import("std");
const model = @import("../model/original_cell_insets.zig");
pub const max_request_bytes = 1024;
pub const Request = struct { lease: u64, patch: model.Patch };
fn object(value: std.json.Value, count: usize) !std.json.ObjectMap {
    if (value != .object or value.object.count() != count) return error.InvalidOriginalCellInsetsRequest;
    return value.object;
}
fn field(map: std.json.ObjectMap, key: []const u8) !std.json.Value {
    return map.get(key) orelse error.InvalidOriginalCellInsetsRequest;
}
fn text(value: std.json.Value) ![]const u8 {
    if (value != .string) return error.InvalidOriginalCellInsetsRequest;
    return value.string;
}
pub fn decode(a: std.mem.Allocator, bytes: []const u8) !Request {
    if (bytes.len > max_request_bytes) return error.LimitExceeded;
    var parsed = try std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" });
    defer parsed.deinit();
    const root = try object(parsed.value, 2);
    const raw = try text(try field(root, "lease"));
    if (raw.len == 0 or raw.len > 20 or raw[0] == '0') return error.InvalidOriginalCellLease;
    for (raw) |c| if (c < '0' or c > '9') return error.InvalidOriginalCellLease;
    const lease = std.fmt.parseInt(u64, raw, 10) catch return error.InvalidOriginalCellLease;
    const patch = try field(root, "patch");
    if (patch != .object) return error.InvalidOriginalCellInsetsRequest;
    const mode = try text(try field(patch.object, "mode"));
    if (std.mem.eql(u8, mode, "inherit")) {
        _ = try object(patch, 1);
        return .{ .lease = lease, .patch = .inherit };
    }
    if (!std.mem.eql(u8, mode, "custom")) return error.InvalidOriginalCellInsetsRequest;
    const values = patch.object;
    for (values.keys()) |key| {
        var known = std.mem.eql(u8, key, "mode");
        for ([_][]const u8{ "left", "right", "top", "bottom" }) |axis_name| known = known or std.mem.eql(u8, key, axis_name);
        if (!known) return error.InvalidOriginalCellInsetsRequest;
    }
    var axes: [4]?u32 = undefined;
    for ([_][]const u8{ "left", "right", "top", "bottom" }, 0..) |name, i| {
        const value = values.get(name) orelse {
            axes[i] = null;
            continue;
        };
        axes[i] = switch (value) {
            .integer => |number| std.math.cast(u32, number) orelse return error.InvalidOriginalCellInsetsRequest,
            else => return error.InvalidOriginalCellInsetsRequest,
        };
    }
    return .{ .lease = lease, .patch = .{ .custom = axes } };
}
pub fn observation(a: std.mem.Allocator, format: []const u8, section: u32, paragraph: u32, table: u32, list: u32, lease: ?u64, revision: u32, source: model.Source, frame: model.Frame, read_only: bool) ![]u8 {
    const effective = try model.effective(source, frame);
    var defaults: [4]u32 = undefined;
    for (source.table, 0..) |raw, i| defaults[i] = @intCast(raw.?);
    if (lease == 0) return error.InvalidOriginalCellLease;
    if ((lease != null) == read_only) return error.InvalidOriginalCellLease;
    const token = if (lease) |id| try std.fmt.allocPrint(a, "{d}", .{id}) else null;
    defer if (token) |bytes| a.free(bytes);
    return std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .format = format, .section = section, .paragraph = paragraph, .tableNode = table, .listNode = list, .lease = token, .historyRevision = revision, .editable = !read_only, .mode = if (source.use_cell.?) @as([]const u8, "custom") else "inherit", .effective = effective, .tableDefaults = defaults, .frame = frame }, .{});
}

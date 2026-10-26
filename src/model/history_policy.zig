//! V2 policy defaults exist only here. V1 numeric ABI policy is unchanged.
const std = @import("std");
pub const Options = struct {
    max_entries: ?u32 = null,
    max_checkpoint_bytes: ?u32 = null,
    max_checkpoint_owned_bytes: ?u32 = null,
    max_retained_bytes: ?u32 = null,
};
pub const Policy = struct {
    max_entries: u32,
    max_checkpoint_bytes: u32,
    max_checkpoint_owned_bytes: ?u32,
    max_retained_bytes: u32,
};
pub const default_entries: u32 = 256;
pub const default_payload: u32 = 8 * 1024 * 1024;
pub const default_retained: u32 = 128 * 1024 * 1024;
pub const maximum_entries: u32 = 65535;
pub const maximum_bytes: u32 = 128 * 1024 * 1024;
pub const maximum_json_bytes: usize = 4096;
pub fn resolve(o: Options) !Policy {
    const p: Policy = .{ .max_entries = o.max_entries orelse default_entries, .max_checkpoint_bytes = o.max_checkpoint_bytes orelse default_payload, .max_checkpoint_owned_bytes = o.max_checkpoint_owned_bytes, .max_retained_bytes = o.max_retained_bytes orelse default_retained };
    if (p.max_entries == 0 or p.max_entries > maximum_entries or p.max_checkpoint_bytes == 0 or p.max_checkpoint_bytes > maximum_bytes or p.max_retained_bytes == 0 or p.max_retained_bytes > maximum_bytes) return error.InvalidHistoryOptions;
    if (p.max_checkpoint_owned_bytes) |n| if (n == 0 or n > maximum_bytes) return error.InvalidHistoryOptions;
    return p;
}
pub fn parse(a: std.mem.Allocator, bytes: []const u8) !Options {
    if (bytes.len > maximum_json_bytes) return error.InvalidHistoryOptions;
    const parsed = std.json.parseFromSlice(std.json.Value, a, bytes, .{ .duplicate_field_behavior = .@"error" }) catch |err| {
        if (err == error.OutOfMemory) return err;
        return error.InvalidHistoryOptions;
    };
    defer parsed.deinit();
    if (parsed.value != .object) return error.InvalidHistoryOptions;
    var out: Options = .{};
    var it = parsed.value.object.iterator();
    while (it.next()) |row| {
        if (row.value_ptr.* != .integer) return error.InvalidHistoryOptions;
        const value = std.math.cast(u32, row.value_ptr.integer) orelse return error.InvalidHistoryOptions;
        const key = row.key_ptr.*;
        if (std.mem.eql(u8, key, "maxEntries")) out.max_entries = value else if (std.mem.eql(u8, key, "maxCheckpointBytes")) out.max_checkpoint_bytes = value else if (std.mem.eql(u8, key, "maxCheckpointOwnedBytes")) out.max_checkpoint_owned_bytes = value else if (std.mem.eql(u8, key, "maxRetainedBytes")) out.max_retained_bytes = value else return error.InvalidHistoryOptions;
    }
    _ = try resolve(out);
    return out;
}

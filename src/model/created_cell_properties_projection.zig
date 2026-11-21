//! Detached effective values; resource observation and digest are memoized once.
const std = @import("std");
const Value = @import("border_fill_patch.zig").Value;
pub const Stats = struct { cells: usize = 0, resolved_resources: usize = 0, hashed_bytes: usize = 0, document_prepares: usize = 0 };
pub const Origin = enum { save_materialized_resource, owned_absent_profile };
pub const Resolved = struct { value: Value, resource_id: u32, raw_sha256: [64]u8, effects_supported: bool, raw_origin: Origin };
pub const Style = struct { section: u32, identity: []u8, row: u32, column: u32, value: Value, resource_id: u32, raw_sha256: [64]u8, effects_supported: bool, raw_origin: Origin };
pub const Memo = struct {
    values: std.AutoHashMap(u32, Resolved),
    stats: Stats = .{},
    pub fn init(a: std.mem.Allocator) Memo {
        return .{ .values = std.AutoHashMap(u32, Resolved).init(a) };
    }
    pub fn deinit(self: *Memo) void {
        self.values.deinit();
    }
    pub fn get(self: *const Memo, resource: u32) ?Resolved {
        return self.values.get(resource);
    }
    pub fn resolve(self: *Memo, resource: u32, value: Value, raw: []const u8, supported: bool, origin: Origin) !Resolved {
        if (self.values.contains(resource)) return error.DuplicateResolvedCellResource;
        var digest: [32]u8 = undefined;
        std.crypto.hash.sha2.Sha256.hash(raw, &digest, .{});
        const result: Resolved = .{ .value = value, .resource_id = resource, .raw_sha256 = std.fmt.bytesToHex(digest, .lower), .effects_supported = supported, .raw_origin = origin };
        try self.values.put(resource, result);
        self.stats.resolved_resources += 1;
        self.stats.hashed_bytes = try std.math.add(usize, self.stats.hashed_bytes, raw.len);
        return result;
    }
};
pub fn deinit(a: std.mem.Allocator, rows: []Style) void {
    for (rows) |row| a.free(row.identity);
    a.free(rows);
}
pub fn append(a: std.mem.Allocator, out: *std.ArrayList(Style), memo: *Memo, section: u32, identity: u64, row: u32, column: u32, resolved: Resolved) !void {
    if (out.items.len >= 100000) return error.LimitExceeded;
    const id = try std.fmt.allocPrint(a, "{d}", .{identity});
    errdefer a.free(id);
    try out.append(a, .{ .section = section, .identity = id, .row = row, .column = column, .value = resolved.value, .resource_id = resolved.resource_id, .raw_sha256 = resolved.raw_sha256, .effects_supported = resolved.effects_supported, .raw_origin = resolved.raw_origin });
    memo.stats.cells += 1;
}

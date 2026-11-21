//! Supplemental observation. Never changes the strict v1 property projection.
const std = @import("std");
const Table = @import("created_table.zig").Table;
const Alignment = @import("cell_vertical_alignment.zig").Alignment;
pub const Row = struct { section: u32, identity: []u8, row: u32, column: u32, value: ?u8 };
pub const Builder = struct {
    allocator: std.mem.Allocator,
    rows: std.ArrayList(Row) = .empty,
    identities: std.AutoHashMap(u64, void),
    bytes: usize = 0,
    limit: usize,
    pub fn init(a: std.mem.Allocator, limit: usize) Builder {
        return .{ .allocator = a, .identities = .init(a), .limit = limit };
    }
    pub fn deinit(self: *Builder) void {
        for (self.rows.items) |row| self.allocator.free(row.identity);
        self.rows.deinit(self.allocator);
        self.identities.deinit();
        self.* = undefined;
    }
    /// One canonical identity per document; include every generated cell.
    pub fn appendTable(self: *Builder, section: usize, table: *const Table, base: ?Alignment) !void {
        if (table.identity == 0 or (try self.identities.getOrPut(table.identity)).found_existing) return error.InvalidCreatedTableIdentity;
        const count = std.math.mul(usize, table.plan.rows, table.plan.columns) catch return error.LimitExceeded;
        if (count != table.cells.len) return error.InvalidTableCell;
        if (count > 100000 -| self.rows.items.len) return error.LimitExceeded;
        const ordinal = std.math.cast(u32, section) orelse return error.LimitExceeded;
        for (0..table.plan.rows) |row| for (0..table.plan.columns) |column| {
            const alignment = try table.cellVerticalAlignment(@intCast(row), @intCast(column), base);
            const identity = try std.fmt.allocPrint(self.allocator, "{d}", .{table.identity});
            errdefer self.allocator.free(identity);
            const bytes = std.math.add(usize, self.bytes, @sizeOf(Row) + identity.len) catch return error.LimitExceeded;
            if (bytes > self.limit) return error.LimitExceeded;
            try self.rows.append(self.allocator, .{ .section = ordinal, .identity = identity, .row = @intCast(row), .column = @intCast(column), .value = if (alignment) |value| @backingInt(value) else null });
            self.bytes = bytes;
        };
    }
    pub fn json(self: *const Builder, format: []const u8) ![]u8 {
        const bytes = try std.json.Stringify.valueAlloc(self.allocator, .{ .schemaVersion = @as(u32, 1), .format = format, .alignments = self.rows.items }, .{});
        errdefer self.allocator.free(bytes);
        if (bytes.len > self.limit) return error.LimitExceeded;
        return bytes;
    }
};

//! Native-owned new table semantics, without serialized record caches.
const std = @import("std");
const model = @import("../../model/created_table.zig");
const records = @import("created_table_records.zig");

pub const Value = struct {
    table: model.Table,
    options: records.Options,

    pub fn ownedSize(table: *const model.Table, options: records.Options) !usize {
        var size = try std.math.add(usize, @sizeOf(Value), try std.math.mul(usize, table.cells.len, @sizeOf(model.Cell)));
        for (table.cells) |cell| size = try std.math.add(usize, size, cell.text.len);
        return std.math.add(usize, size, options.common.description.len);
    }

    /// Copies borrowed inputs. Resource/ID admission remains the Session's job.
    pub fn initClone(a: std.mem.Allocator, table: *const model.Table, options: records.Options, max_bytes: usize) !Value {
        const size = ownedSize(table, options) catch return error.LimitExceeded;
        if (size > max_bytes) return error.LimitExceeded;
        if (!std.unicode.utf8ValidateSlice(options.common.description)) return error.InvalidObjectDescription;
        var copy = try table.clone(a);
        errdefer copy.deinit(a);
        var copied_options = options;
        copied_options.common.description = try a.dupe(u8, options.common.description);
        return .{ .table = copy, .options = copied_options };
    }

    pub fn clone(self: *const Value, a: std.mem.Allocator, max_bytes: usize) !Value {
        return initClone(a, &self.table, self.options, max_bytes);
    }

    pub fn deinit(self: *Value, a: std.mem.Allocator) void {
        a.free(self.options.common.description);
        self.table.deinit(a);
        self.* = undefined;
    }
};

//! Save-only clone and resource materialization; live generated intents stay semantic.
const std = @import("std");
const Values = @import("created_table_values.zig").Values;
const batch = @import("created_cell_resource_batch.zig");
pub fn has(values: []const Values) bool {
    for (values) |section| for (section.entries) |entry| for (entry.value.table.cell_properties) |property| if (@import("../../model/border_fill_patch.zig").has(property.appearance)) return true;
    return false;
}
pub const Prepared = struct {
    bytes: []u8,
    tables: []Values,
    border_count: usize,
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        for (self.tables) |*table| table.deinit(a);
        a.free(self.tables);
        a.free(self.bytes);
        self.* = undefined;
    }
};
pub fn prepare(a: std.mem.Allocator, docinfo: []const u8, values: []const Values, version: @import("../version.zig").Version, limit: usize) !Prepared {
    const tables = try a.alloc(Values, values.len);
    var initialized: usize = 0;
    errdefer {
        for (tables[0..initialized]) |*table| table.deinit(a);
        a.free(tables);
    }
    var requests: std.ArrayList(batch.Request) = .empty;
    defer requests.deinit(a);
    for (values, tables) |source, *target| {
        target.* = try source.clone(a, limit);
        initialized += 1;
        for (target.entries) |*entry| for (entry.value.table.cell_properties) |property| if (@import("../../model/border_fill_patch.zig").has(property.appearance)) {
            try requests.append(a, .{ .source_id = std.math.cast(u16, entry.value.table.resources.border_fill) orelse return error.InvalidBorderFillReference, .patch = property.appearance });
        };
    }
    const resources = try batch.write(a, docinfo, version, requests.items, limit);
    errdefer a.free(resources.bytes);
    defer a.free(resources.ids);
    var i: usize = 0;
    for (tables) |*section| for (section.entries) |*entry| for (entry.value.table.cell_properties) |*property| if (@import("../../model/border_fill_patch.zig").has(property.appearance)) {
        property.materialized_border_fill = resources.ids[i];
        i += 1;
    };
    return .{ .bytes = resources.bytes, .tables = tables, .border_count = resources.border_count };
}

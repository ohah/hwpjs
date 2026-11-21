//! Materializes generated owner resources in one existing strict header batch.
const std = @import("std");
const editor = @import("editor_session.zig");
const Values = @import("created_table_values.zig").Values;
const resource = @import("border_fill_resource_patch.zig");
const p = @import("../model/border_fill_patch.zig");
pub fn has(sections: []const editor.Section) bool {
    for (sections) |section| for (section.created_tables.entries.items) |entry| for (entry.table.cell_properties) |property| if (p.has(property.appearance)) return true;
    return false;
}
pub const Prepared = struct {
    bytes: []u8,
    tables: []Values,
    pub fn takeBytes(self: *Prepared) []u8 {
        const bytes = self.bytes;
        self.bytes = &.{};
        return bytes;
    }
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        a.free(self.bytes);
        for (self.tables) |*table| table.deinit(a);
        a.free(self.tables);
        self.* = undefined;
    }
};
pub fn prepare(a: std.mem.Allocator, header: []const u8, sections: []const editor.Section, limit: usize, profile: @import("source_color_profile.zig").Profile) !Prepared {
    const tables = try a.alloc(Values, sections.len);
    var initialized: usize = 0;
    errdefer {
        for (tables[0..initialized]) |*table| table.deinit(a);
        a.free(tables);
    }
    var requests: std.ArrayList(resource.PatchRequest) = .empty;
    defer requests.deinit(a);
    for (sections, tables) |section, *target| {
        target.* = try section.created_tables.clone(a);
        initialized += 1;
        for (target.entries.items) |*entry| for (entry.table.cell_properties) |property| if (p.has(property.appearance)) {
            try requests.append(a, .{ .source_id = entry.table.resources.border_fill, .patch = property.appearance });
        };
    }
    var tree = try @import("header_tree.zig").parse(a, header, 0, .{ .max_xml_bytes = limit });
    defer tree.deinit(a);
    var stats: resource.SolidBatchStats = .{};
    const output = try resource.writePatchBatch(a, &tree, requests.items, limit, profile, &stats);
    errdefer a.free(output.bytes);
    defer a.free(output.ids);
    var i: usize = 0;
    for (tables) |*section| for (section.entries.items) |*entry| for (entry.table.cell_properties) |*property| if (p.has(property.appearance)) {
        property.materialized_border_fill = output.ids[i];
        i += 1;
    };
    return .{ .bytes = output.bytes, .tables = tables };
}

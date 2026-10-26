//! Read-only ID plan for the observed legacy empty-fill migration scope.
const std = @import("std");
const Version = @import("../version.zig").Version;
pub fn plan(a: std.mem.Allocator, sections: []const []const u8, version: Version, current_and_reserved: []const u32, count: usize, limit: usize) ![]u32 {
    if (version.raw != 0x05000107) return error.UnsupportedDrawingMigrationTarget;
    if (current_and_reserved.len > limit or count > limit) return error.LimitExceeded;
    var additional: std.ArrayList(u32) = .empty;
    defer additional.deinit(a);
    try additional.appendSlice(a, current_and_reserved);
    for (sections) |raw| {
        var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
        defer tree.deinit(a);
        for (tree.nodes, 0..) |node, index| {
            if (node.record.value == .control_header) {
                const control = node.record.value.control_header;
                const rules = @import("../body/control_rules.zig");
                const common = @import("../body/object_common.zig");
                if (control.id == rules.id("atno")) {
                    // Table142 is exactly12 bytes and has no instance ID.
                    if ((try @import("../body/number_control.zig").Auto.parse(control.properties)).extra.len != 0) return error.UnsupportedDrawingMigrationSource;
                } else if (!common.supports(control.id) and control.id != rules.form_id and rules.expectedCode(control.id) != 3 and control.id != rules.section_id and control.id != rules.column_id) return error.UnsupportedDrawingMigrationSource;
            }
            if (try @import("source_object_ids.zig").fromRecord(node.record.framing)) |id| {
                if (additional.items.len >= limit) return error.LimitExceeded;
                try additional.append(a, id);
            }
            if (node.record.framing.tag != 76) continue;
            const layout = try @import("../body/shape_validation.zig").componentLayout(tree, index);
            const component = try @import("../body/shape_component.zig").Component.parse(node.record.framing.payload, layout);
            if (!@import("../body/drawing_style_validation.zig").supports(component.id)) return error.UnsupportedDrawingMigrationSource;
            try @import("drawing_style_migration.zig").validateSource(component.extra);
        }
    }
    return @import("instance_ids.zig").manyFromSections(a, sections, version, additional.items, count, limit);
}

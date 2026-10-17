//! Owned query result; current edits take precedence over immutable source points.
const std = @import("std");
pub fn nodes(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, section: usize) ![]usize {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    const tree = &session.sections[section].tree;
    var result: std.ArrayList(usize) = .empty;
    defer result.deinit(a);
    for (tree.elements, 0..) |_, index| {
        if (@import("run_switch_anchor.zig").supported(tree, index)) try result.append(a, index);
    }
    return result.toOwnedSlice(a);
}
pub const Snapshot = struct {
    pair: @import("chart_pair_target.zig").Pair,
    values: @import("chart_point_values.zig").Values,
    bindings: []@import("chart_point_roles.zig").Binding,
    pub fn deinit(self: *Snapshot, a: std.mem.Allocator) void {
        self.pair.deinit(a);
        self.values.deinit(a);
        a.free(self.bindings);
    }
};
pub fn read(a: std.mem.Allocator, session: *@import("editor_session.zig").Session, section: usize, wrapper: usize) !Snapshot {
    var source = try @import("chart_source_context.zig").load(a, session, section, wrapper);
    defer source.tree.deinit(a);
    errdefer source.pair.deinit(a);
    var values = if (try session.chart_resources.find(source.pair.chart_path, source.pair.ole_path)) |current| block: {
        try current.points.validateSource(&source.tree);
        break :block try current.points.clone(a);
    } else try @import("chart_point_values.zig").collect(a, &source.tree, .{});
    errdefer values.deinit(a);
    const bindings = try @import("chart_point_roles.zig").collect(a, &source.tree, &values);
    return .{ .pair = source.pair, .values = values, .bindings = bindings };
}

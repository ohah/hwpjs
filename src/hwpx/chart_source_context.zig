//! Shared immutable package binding and owned chart tree for query/edit callers.
const std = @import("std");
pub const Context = struct {
    pair: @import("chart_pair_target.zig").Pair,
    tree: @import("chart_tree.zig").Tree,
    pub fn deinit(self: *Context, a: std.mem.Allocator) void {
        self.tree.deinit(a);
        self.pair.deinit(a);
    }
};
pub fn load(a: std.mem.Allocator, session: *const @import("editor_session.zig").Session, section: usize, wrapper: usize) !Context {
    if (section >= session.sections.len) return error.InvalidSectionIndex;
    var document = try @import("package.zig").inspectDocument(a, session.source, .{});
    defer document.deinit(a);
    var pair = try @import("chart_pair_target.zig").resolve(a, &document, &session.sections[section].tree, wrapper);
    errdefer pair.deinit(a);
    const entry = document.archive.find(pair.chart_path) orelse return error.MissingChartEntry;
    const xml = try document.archive.decode(entry, session.options.max_xml_bytes);
    defer document.archive.allocator.free(xml);
    const tree = try @import("chart_tree.zig").parse(a, xml, 0, .{ .max_xml_bytes = session.options.max_xml_bytes });
    return .{ .pair = pair, .tree = tree };
}

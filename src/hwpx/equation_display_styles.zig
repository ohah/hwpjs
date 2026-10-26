//! Source display attributes only. Script edits do not rewrite these values.
const std = @import("std");
const editor = @import("editor_session.zig");
const fields = @import("equation_fields.zig");
pub const Row = struct {
    node: usize,
    font: ?[]const u8 = null,
    base_unit: ?[]const u8 = null,
    base_line: ?[]const u8 = null,
    text_color: ?[]const u8 = null,
    line_mode: ?[]const u8 = null,
    error_name: ?[]const u8 = null,
    source_size: ?@import("equation_source_size.zig").Size = null,
    size_error: ?[]const u8 = null,
};
pub const Report = struct {
    arena: std.heap.ArenaAllocator,
    rows: []Row,
    pub fn deinit(self: *Report) void {
        self.arena.deinit();
        self.* = undefined;
    }
};
pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize) !Report {
    const sites = try @import("equation_script_sources.zig").read(a, session, section);
    defer a.free(sites);
    var arena = std.heap.ArenaAllocator.init(a);
    errdefer arena.deinit();
    const owned = arena.allocator();
    const rows = try owned.alloc(Row, sites.len);
    var budget: fields.Budget = .{ .max = session.options.max_text_bytes };
    for (sites, rows) |site, *row| {
        row.* = .{ .node = site.node };
        const values = fields.read(a, owned, &session.sections[section].tree, site.node, editor.siteOptions(session.options).max_attribute_bytes, &budget) catch |err| switch (err) {
            error.OutOfMemory, error.LimitExceeded => return err,
            else => {
                row.error_name = @errorName(err);
                continue;
            },
        };
        row.font = values.get(.font);
        row.base_unit = values.get(.base_unit);
        row.base_line = values.get(.base_line);
        row.text_color = values.get(.text_color);
        row.line_mode = values.get(.line_mode);
        row.source_size = @import("equation_source_size.zig").read(a, owned, &session.sections[section].tree, site.node, editor.siteOptions(session.options).max_attribute_bytes, &budget) catch |err| switch (err) {
            error.OutOfMemory, error.LimitExceeded => return err,
            else => blk: {
                row.size_error = @errorName(err);
                break :blk null;
            },
        };
    }
    return .{ .arena = arena, .rows = rows };
}

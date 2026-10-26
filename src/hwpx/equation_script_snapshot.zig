//! Detached current strings: one XML content pass, no mutable source cache.
const std = @import("std");
const editor = @import("editor_session.zig");
const sources = @import("equation_script_sources.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Options = struct { max_text_bytes: usize = (editor.Options{}).max_text_bytes };
pub const Row = struct { source: sources.Site, value: ?[]const u8 = null };
pub const Snapshot = struct {
    allocator: std.mem.Allocator,
    rows: []Row,
    script_bytes: usize,
    pub fn deinit(self: *Snapshot) void {
        for (self.rows) |row| if (row.value) |text| self.allocator.free(text);
        self.allocator.free(self.rows);
        self.* = undefined;
    }
};

pub fn read(a: std.mem.Allocator, session: *const editor.Session, section: usize, options: Options) !Snapshot {
    const sites = try sources.read(a, session, section);
    defer a.free(sites);
    const part = &session.sections[section];
    const limits = @import("equation_script_session.zig").options(session);
    const rows = try a.alloc(Row, sites.len);
    for (rows, sites) |*row, site| row.* = .{ .source = site };
    errdefer {
        for (rows) |row| if (row.value) |text| a.free(text);
        a.free(rows);
    }
    const builders = try a.alloc(std.ArrayList(u8), sites.len);
    @memset(builders, .empty);
    defer {
        for (builders) |*builder| builder.deinit(a);
        a.free(builders);
    }
    var overrides: std.AutoHashMapUnmanaged(usize, []const u8) = .empty;
    defer overrides.deinit(a);
    for (part.equation_scripts.entries.items) |entry| {
        const slot = try overrides.getOrPut(a, entry.equation);
        if (slot.found_existing) return error.DuplicateEquationScriptEdit;
        slot.value_ptr.* = entry.text;
    }
    var leaves: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer leaves.deinit(a);
    var budget: @import("equation_fields.zig").Budget = .{ .max = @min(options.max_text_bytes, session.options.max_text_bytes) };
    var total: usize = 0;
    for (sites, 0..) |site, index| {
        if (site.issue != null) {
            if (overrides.contains(site.node)) return error.InvalidEquationScriptOverride;
            continue;
        }
        if (overrides.fetchRemove(site.node)) |entry| {
            try @import("equation_script_write.zig").validateValue(a, entry.value, limits);
            try budget.note(entry.value.len);
            total += entry.value.len;
            try builders[index].appendSlice(a, entry.value);
        } else {
            const slot = try leaves.getOrPut(a, site.script_node orelse return error.MissingEquationScript);
            if (slot.found_existing) return error.DuplicateEquationScriptNode;
            slot.value_ptr.* = index;
        }
    }
    if (overrides.count() != 0) return error.InvalidEquationScriptOverride;
    const Context = struct {
        allocator: std.mem.Allocator,
        leaves: *const std.AutoHashMapUnmanaged(usize, usize),
        builders: []std.ArrayList(u8),
        budget: *@import("equation_fields.zig").Budget,
        total: *usize,
        max_script_bytes: usize,
        fn content(raw: *anyopaque, event: Tree.ContentEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            const index = self.leaves.get(event.parent_index) orelse return;
            try @import("xml_direct_text.zig").append(self.allocator, self.allocator, &self.builders[index], event.value, self.max_script_bytes, self.budget, self.total);
        }
    };
    if (leaves.count() != 0) {
        var context: Context = .{ .allocator = a, .leaves = &leaves, .builders = builders, .budget = &budget, .total = &total, .max_script_bytes = limits.max_script_bytes };
        try part.tree.visitContent(a, .{ .context = &context, .on_content = Context.content });
    }
    for (rows, builders) |*row, *builder| {
        if (row.source.issue == null) row.value = try builder.toOwnedSlice(a);
    }
    return .{ .allocator = a, .rows = rows, .script_bytes = total };
}

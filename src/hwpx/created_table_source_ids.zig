//! Source-part collection for created-table paragraph and table instance IDs.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Inventory = struct {
    extras: []Tree,
    trees: []Tree,
    generated: std.ArrayList(u32),
    fn deinit(self: *Inventory, a: std.mem.Allocator) void {
        for (self.extras) |*tree| tree.deinit(a);
        a.free(self.extras);
        a.free(self.trees);
        self.generated.deinit(a);
    }
};
pub fn validate(session: *const @import("editor_session.zig").Session, table: *const @import("../model/created_table.zig").Table) !void {
    var inventory = try collect(session);
    defer inventory.deinit(session.allocator);
    const a = session.allocator;
    try @import("created_table_object_ids.zig").validateSource(a, inventory.trees, table.instance_id);
    if (table.cells.len > session.options.max_sites) return error.LimitExceeded;
    const incoming = try a.alloc(u32, table.cells.len);
    defer a.free(incoming);
    for (table.cells, incoming) |cell, *id| id.* = cell.paragraph_id;
    try @import("paragraph_instance_ids.zig").validateAdditional(a, inventory.trees, inventory.generated.items, incoming, session.options.max_sites);
}

pub const Plan = struct {
    identity: u64,
    instance_id: u32,
    paragraph_ids: []u32,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.paragraph_ids);
    }
};
pub fn plan(session: *const @import("editor_session.zig").Session, cells: usize) !Plan {
    const a = session.allocator;
    var inventory = try collect(session);
    defer inventory.deinit(a);
    var instances: std.ArrayList(u32) = .empty;
    defer instances.deinit(a);
    var identities: std.AutoHashMapUnmanaged(u64, void) = .empty;
    defer identities.deinit(a);
    for (session.sections) |section| for (section.created_tables.entries.items) |entry| {
        if (entry.table.identity == 0 or identities.contains(entry.table.identity)) return error.InvalidCreatedTableIdentity;
        try identities.put(a, entry.table.identity, {});
        try instances.append(a, entry.table.instance_id);
    };
    var identity: u64 = 1;
    while (identities.contains(identity)) identity = std.math.add(u64, identity, 1) catch return error.LimitExceeded;
    const instance = try @import("created_table_object_ids.zig").nextSource(a, inventory.trees, instances.items);
    return .{ .identity = identity, .instance_id = instance, .paragraph_ids = try @import("paragraph_instance_ids.zig").nextMany(a, inventory.trees, inventory.generated.items, cells, session.options.max_sites) };
}

fn collect(session: *const @import("editor_session.zig").Session) !Inventory {
    const a = session.allocator;
    var remaining = session.options.max_xml_bytes;
    for (session.sections) |section| {
        if (section.tree.source.len > remaining) return error.LimitExceeded;
        remaining -= section.tree.source.len;
    }
    const extras = try @import("paragraph_id_source_parts.zig").read(a, session.source, remaining);
    errdefer {
        for (extras) |*tree| tree.deinit(a);
        a.free(extras);
    }
    const count = try std.math.add(usize, session.sections.len, extras.len);
    const trees = try a.alloc(@import("xml_part_tree.zig").Tree, count);
    errdefer a.free(trees);
    var generated: std.ArrayList(u32) = .empty;
    errdefer generated.deinit(a);
    for (session.sections, trees[0..session.sections.len]) |section, *tree| {
        tree.* = section.tree;
        if (section.structure_values) |values| for (values.paragraphs) |paragraph| {
            if (paragraph.generated_id) |id| try generated.append(a, id);
        };
        for (section.created_tables.entries.items) |entry| for (entry.table.cells) |cell| {
            if (generated.items.len == session.options.max_sites) return error.LimitExceeded;
            try generated.append(a, cell.paragraph_id);
        };
    }
    @memcpy(trees[session.sections.len..], extras);
    return .{ .extras = extras, .trees = trees, .generated = generated };
}

//! Document-wide creation IDs. Original zero/duplicate IDs are never repaired.
const std = @import("std");
const model = @import("../../model/document.zig");
const Table = @import("../../model/created_table.zig").Table;
const Values = @import("created_table_values.zig").Values;
const Version = @import("../version.zig").Version;
const Inventory = struct {
    paragraphs: std.AutoHashMap(u32, void),
    objects: std.AutoHashMap(u32, void),
    identities: std.AutoHashMap(u64, void),
    fn deinit(self: *Inventory) void {
        self.paragraphs.deinit();
        self.objects.deinit();
        self.identities.deinit();
    }
    fn put(self: *Inventory, map: *std.AutoHashMap(u32, void), id: u32, limit: usize) !void {
        if (id == 0 or map.contains(id)) return;
        if (self.paragraphs.count() + self.objects.count() + self.identities.count() >= limit) return error.LimitExceeded;
        try map.put(id, {});
    }
};

fn collect(a: std.mem.Allocator, sources: []const []const u8, version: Version, document: *const model.Document, pending: []const Values, limit: usize) !Inventory {
    try version.requireSupported();
    if (sources.len != document.sections.len or pending.len != sources.len) return error.SourceBindingMismatch;
    var inventory: Inventory = .{ .paragraphs = .init(a), .objects = .init(a), .identities = .init(a) };
    errdefer inventory.deinit();
    for (sources) |source| {
        var it = @import("../record.zig").Iterator.init(source, .{});
        while (try it.next()) |record| switch (record.tag) {
            66 => try inventory.put(&inventory.paragraphs, (try @import("../body/paragraph_header.zig").Header.parse(record.payload, version)).instance_id, limit),
            else => if (try @import("source_object_ids.zig").fromRecord(record)) |id| try inventory.put(&inventory.objects, id, limit),
        };
    }
    for (document.sections) |section| for (section.paragraphs) |p| try inventory.put(&inventory.paragraphs, p.instance_id, limit);
    for (pending) |tables| for (tables.entries) |entry| {
        if (entry.value.table.identity == 0 or inventory.identities.contains(entry.value.table.identity)) return error.InvalidCreatedTableIdentity;
        if (entry.value.table.instance_id == 0 or inventory.objects.contains(entry.value.table.instance_id)) return error.InvalidCreatedTableIdentity;
        if (inventory.paragraphs.count() + inventory.objects.count() + inventory.identities.count() >= limit) return error.LimitExceeded;
        try inventory.identities.put(entry.value.table.identity, {});
        try inventory.put(&inventory.objects, entry.value.table.instance_id, limit);
        for (entry.value.table.cells) |cell| {
            if (cell.paragraph_id == 0 or inventory.paragraphs.contains(cell.paragraph_id)) return error.InvalidTableParagraphIds;
            try inventory.put(&inventory.paragraphs, cell.paragraph_id, limit);
        }
    };
    return inventory;
}

pub fn validate(a: std.mem.Allocator, sources: []const []const u8, version: Version, document: *const model.Document, pending: []const Values, table: *const Table, limit: usize) !void {
    if (table.identity == 0 or table.instance_id == 0) return error.InvalidCreatedTableIdentity;
    var inventory = try collect(a, sources, version, document, pending, limit);
    defer inventory.deinit();
    if (inventory.identities.contains(table.identity) or inventory.objects.contains(table.instance_id)) return error.InvalidCreatedTableIdentity;
    for (table.cells) |cell| {
        if (cell.paragraph_id == 0 or inventory.paragraphs.contains(cell.paragraph_id)) return error.InvalidTableParagraphIds;
        try inventory.put(&inventory.paragraphs, cell.paragraph_id, limit);
    }
}

pub const Plan = struct {
    identity: u64,
    instance_id: u32,
    paragraph_ids: []u32,
    pub fn deinit(self: *Plan, a: std.mem.Allocator) void {
        a.free(self.paragraph_ids);
        self.* = undefined;
    }
};

/// Planning does not reserve IDs. Validate again at the creation transaction.
pub fn plan(a: std.mem.Allocator, sources: []const []const u8, version: Version, document: *const model.Document, pending: []const Values, cells: usize, limit: usize) !Plan {
    if (cells == 0) return error.InvalidCreatedTableCells;
    var inventory = try collect(a, sources, version, document, pending, limit);
    defer inventory.deinit();
    var identity: u64 = 1;
    while (inventory.identities.contains(identity)) identity = std.math.add(u64, identity, 1) catch return error.LimitExceeded;
    var additional: std.ArrayList(u32) = .empty;
    defer additional.deinit(a);
    var paragraphs = inventory.paragraphs.keyIterator();
    while (paragraphs.next()) |id| try additional.append(a, id.*);
    var objects = inventory.objects.keyIterator();
    while (objects.next()) |id| try additional.append(a, id.*);
    const count = std.math.add(usize, cells, 1) catch return error.LimitExceeded;
    const ids = try @import("instance_ids.zig").manyFromSections(a, sources, version, additional.items, count, limit);
    defer a.free(ids);
    return .{ .identity = identity, .instance_id = ids[cells], .paragraph_ids = try a.dupe(u32, ids[0..cells]) };
}

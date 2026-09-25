const std = @import("std");
const content_manifest = @import("content_manifest.zig");

pub const Kind = enum(u8) {
    header_font,
    header_substitute_font,
    header_brush_image,
    section_picture,
    section_brush_image,
    section_ole,
    master_picture,
    master_brush_image,
    master_ole,
};
pub const kinds = [_]Kind{ .header_font, .header_substitute_font, .header_brush_image, .section_picture, .section_brush_image, .section_ole, .master_picture, .master_brush_image, .master_ole };

pub const Counts = struct {
    sites: usize = 0,
    absent: usize = 0,
    empty: usize = 0,
    resolved_embedded: usize = 0,
    resolved_external: usize = 0,
    missing_target: usize = 0,
};

pub const Report = struct {
    header_xml_bytes: usize = 0,
    section_xml_bytes: usize = 0,
    sections: usize = 0,
    observed_sites: usize = 0,
    counts_by_kind: [kinds.len]Counts = @splat(.{}),
    unclassified_attribute_sites: usize = 0,
    first_missing_id: ?[]u8 = null,
    first_missing_item_index: ?usize = null,
    first_unclassified_id: ?[]u8 = null,
    first_unclassified_item_index: ?usize = null,

    pub fn counts(self: *const Report, kind: Kind) *const Counts {
        return &self.counts_by_kind[@intFromEnum(kind)];
    }

    pub fn deinit(self: *Report, a: std.mem.Allocator) void {
        if (self.first_missing_id) |id| a.free(id);
        if (self.first_unclassified_id) |id| a.free(id);
        self.* = undefined;
    }
};

pub const Index = struct {
    by_id: std.StringHashMapUnmanaged(usize) = .empty,

    pub fn init(a: std.mem.Allocator, manifest: content_manifest.Manifest) !Index {
        var result: Index = .{};
        errdefer result.deinit(a);
        for (manifest.items, 0..) |item, item_index| try result.by_id.put(a, item.id, item_index);
        return result;
    }

    pub fn deinit(self: *Index, a: std.mem.Allocator) void {
        self.by_id.deinit(a);
        self.* = undefined;
    }
};

pub const TargetState = enum { absent, empty, embedded, external, missing };
pub const Target = struct {
    state: TargetState,
    item_index: ?usize = null,
};

/// Exact OPF ID lookup shared by the streaming reference counters and
/// per-brush image links. No ZIP bytes or external URL is opened here.
pub fn resolve(index: *const Index, manifest: content_manifest.Manifest, raw_id: ?[]const u8) Target {
    const id = raw_id orelse return .{ .state = .absent };
    if (id.len == 0) return .{ .state = .empty };
    const item_index = index.by_id.get(id) orelse return .{ .state = .missing };
    return .{
        .state = if (manifest.items[item_index].entry_index != null) .embedded else .external,
        .item_index = item_index,
    };
}

/// Consumes the XML-normalized, owned attribute value. Matching is byte-exact
/// against OPF item IDs; a ZIP filename or a list position is never an ID.
pub fn note(a: std.mem.Allocator, report: *Report, index: *const Index, manifest: content_manifest.Manifest, kind: Kind, source_item_index: usize, raw_id: ?[]u8) !void {
    defer if (raw_id) |id| a.free(id);
    const counts = &report.counts_by_kind[@intFromEnum(kind)];
    counts.sites += 1;
    switch (resolve(index, manifest, raw_id).state) {
        .absent => counts.absent += 1,
        .empty => counts.empty += 1,
        .embedded => counts.resolved_embedded += 1,
        .external => counts.resolved_external += 1,
        .missing => {
            counts.missing_target += 1;
            if (report.first_missing_id == null) {
                report.first_missing_id = try a.dupe(u8, raw_id.?);
                report.first_missing_item_index = source_item_index;
            }
        },
    }
}

pub fn noteUnclassified(a: std.mem.Allocator, report: *Report, source_item_index: usize, raw_id: []u8) !void {
    defer a.free(raw_id);
    report.unclassified_attribute_sites += 1;
    if (report.first_unclassified_id == null) {
        report.first_unclassified_id = try a.dupe(u8, raw_id);
        report.first_unclassified_item_index = source_item_index;
    }
}

//! Request-local linear batch plan. No serialized DocInfo/section cache is retained.
const std = @import("std");
const values = @import("cell_background_values.zig");
const Version = @import("../version.zig").Version;
const model = @import("../../model/document.zig");
const Key = struct { table_node: u32, list_node: u32 };
const Owner = struct { section: usize, table_node: u32, list_node: u32 };
pub const Ref = struct { section: usize, table_node: u32, list_node: u32, source_id: u16, id: u16 };
pub const Prepared = struct {
    bytes: []u8,
    refs: []Ref,
    owners: std.AutoHashMap(Owner, u16),
    sections: std.AutoHashMap(usize, std.ArrayList(Ref)),
    pub fn deinit(self: *Prepared, a: std.mem.Allocator) void {
        var groups = self.sections.valueIterator();
        while (groups.next()) |group| group.deinit(a);
        self.sections.deinit();
        self.owners.deinit();
        a.free(self.bytes);
        a.free(self.refs);
    }
    pub fn lookup(self: Prepared, section_index: usize, table_node: u32, list_node: u32) ?u16 {
        return self.owners.get(.{ .section = section_index, .table_node = table_node, .list_node = list_node });
    }
    pub fn hasSection(self: Prepared, index: usize) bool {
        return self.sections.contains(index);
    }
    pub fn validate(self: Prepared, a: std.mem.Allocator, decoded: []const []u8, document: *const model.Document, version: Version) !void {
        var it = self.sections.iterator();
        while (it.next()) |group| {
            const index = group.key_ptr.*;
            if (index >= document.sections.len or index >= decoded.len) return error.InvalidSection;
            try validateSection(a, decoded[index], version, document.sections[index], group.value_ptr.items);
        }
    }
    pub fn writeSection(self: Prepared, a: std.mem.Allocator, input: []const u8, version: Version, current: model.Section, index: usize, limit: usize) ![]u8 {
        if (input.len > limit) return error.LimitExceeded;
        const selected = (self.sections.get(index) orelse return a.dupe(u8, input)).items;
        try validateSection(a, input, version, current, selected);
        var pending = std.AutoHashMap(u32, Ref).init(a);
        defer pending.deinit();
        for (selected) |ref| try pending.put(ref.list_node, ref);
        const output = try a.dupe(u8, input);
        errdefer a.free(output);
        var it = @import("../record.zig").Iterator.init(input, .{});
        var node: u32 = 0;
        var changed: usize = 0;
        while (try it.next()) |record| : (node += 1) {
            const ref = pending.get(node) orelse continue;
            if (record.tag != 72) return error.InvalidCellDisplayOwner;
            const view = try (try @import("../body/list_header.zig").Header.parse(record.payload)).view(.observed8);
            const cell = try @import("../body/table_cell.zig").Cell.parse(view.extra);
            if (cell.border_fill_id != ref.source_id) return error.SourceBindingMismatch;
            const offset = record.offset + record.raw.len - view.extra.len + 24;
            std.mem.writeInt(u16, output[offset..][0..2], ref.id, .little);
            changed += 1;
        }
        if (changed != selected.len) return error.InvalidCellDisplayOwner;
        return output;
    }
};

fn validateSection(a: std.mem.Allocator, source: []const u8, version: Version, current: model.Section, refs: []const Ref) !void {
    const rows = try @import("cell_layout_sources.zig").read(a, source, version);
    defer a.free(rows);
    var cells = std.AutoHashMap(Key, struct { id: u16, protected: bool }).init(a);
    defer cells.deinit();
    for (rows) |row| {
        const key: Key = .{ .table_node = @intCast(row.table_record_node), .list_node = @intCast(row.list_node) };
        const slot = try cells.getOrPut(key);
        if (slot.found_existing) return error.AmbiguousCellDisplayOwner;
        slot.value_ptr.* = .{ .id = row.border_fill_id, .protected = row.protected };
    }
    const bindings = try @import("table_display_bindings.zig").read(a, source, version, current.paragraphs);
    defer a.free(bindings);
    var live = std.AutoHashMap(Key, void).init(a);
    defer live.deinit();
    for (bindings) |binding| try live.put(.{ .table_node = binding.table_node, .list_node = binding.list_node }, {});
    for (refs) |ref| {
        const key: Key = .{ .table_node = ref.table_node, .list_node = ref.list_node };
        const selected = cells.get(key) orelse return error.InvalidCellDisplayOwner;
        if (selected.protected) return error.ProtectedCell;
        if (!live.contains(key)) return error.InvalidCellDisplayOwner;
        if (selected.id != ref.source_id) return error.SourceBindingMismatch;
    }
}

pub const Resource = struct { payload: []const u8, children: bool = false };
const patch_model = @import("../../model/border_fill_patch.zig");
// Scalar key avoids hashing union storage/padding and groups equal owner patches.
pub const CloneKey = struct {
    source_id: u16,
    styles: [4]?patch_model.Style = @splat(null),
    widths: [4]?u16 = @splat(null),
    colors: [4]?u32 = @splat(null),
    background: ?patch_model.Background = null,
    diagonal_directions: ?patch_model.DiagonalDirections = null,
    diagonal_style: ?patch_model.Style = null,
    diagonal_width: ?u16 = null,
    diagonal_color: ?u32 = null,
    pub fn init(id: u16, patch: patch_model.Patch) !CloneKey {
        var key: CloneKey = .{ .source_id = id };
        for (patch.border.edges, 0..) |edge, i| if (edge) |v| {
            key.styles[i] = v.style;
            key.widths[i] = v.width_hundredth_mm;
            key.colors[i] = v.color;
        };
        try patch_model.validate(patch);
        if (patch.diagonal) |diagonal| {
            key.diagonal_directions = diagonal.directions;
            key.diagonal_style = diagonal.stroke.style;
            key.diagonal_width = diagonal.stroke.width_hundredth_mm;
            key.diagonal_color = diagonal.stroke.color;
        }
        key.background = patch.background;
        return key;
    }
};
/// One input scan, one payload per distinct (source,sparse patch), one append batch.
pub fn info(a: std.mem.Allocator, input: []const u8, version: Version, entries: []const values.Entry, limit: usize) !Prepared {
    var indexed = try resourceIndex(a, input, version, limit);
    defer indexed.deinit(a);
    return infoIndexed(a, input, indexed, entries, limit);
}
pub const Index = struct {
    resources: []Resource,
    mapping: ?usize,
    insertion: ?usize,
    pub fn deinit(self: *Index, a: std.mem.Allocator) void {
        a.free(self.resources);
    }
    pub fn resource(self: Index, id: u16) !Resource {
        if (id == 0) return error.MissingBorderFillReference;
        if (id > self.resources.len) return error.InvalidBorderFillReference;
        return self.resources[id - 1];
    }
};
pub fn resourceIndex(a: std.mem.Allocator, input: []const u8, version: Version, limit: usize) !Index {
    if (input.len > limit) return error.LimitExceeded;
    var resources: std.ArrayList(Resource) = .empty;
    errdefer resources.deinit(a);
    var it = @import("../record.zig").Iterator.init(input, .{});
    var mapping: ?usize = null;
    var declared: i32 = 0;
    var insertion: ?usize = null;
    var active: ?usize = null;
    while (try it.next()) |record| {
        if (record.tag == 17) {
            if (mapping != null) return error.DuplicateIdMappings;
            const parsed = try @import("../docinfo/id_mappings.zig").IdMappings.parse(record.payload, version);
            declared = parsed.get(.border_fill) orelse return error.MissingIdMappings;
            mapping = record.offset + record.raw.len - record.payload.len + 32;
        }
        if (record.tag == 20) {
            if (record.level != 1) return error.InvalidDocInfoLevel;
            try resources.append(a, .{ .payload = record.payload });
            active = resources.items.len - 1;
            insertion = record.offset + record.raw.len;
        } else if (active) |index| {
            if (record.level > 1) {
                resources.items[index].children = true;
                insertion = record.offset + record.raw.len;
            } else active = null;
        }
    }
    if (declared < 0 or @as(usize, @intCast(declared)) != resources.items.len) return error.ResourceCountMismatch;
    return .{ .resources = try resources.toOwnedSlice(a), .mapping = mapping, .insertion = insertion };
}
pub fn infoIndexed(a: std.mem.Allocator, input: []const u8, indexed: Index, entries: []const values.Entry, limit: usize) !Prepared {
    if (input.len > limit) return error.LimitExceeded;
    const resources = indexed.resources;
    const insertion = indexed.insertion;
    const mapping = indexed.mapping;
    var clones = std.AutoHashMap(CloneKey, u16).init(a);
    defer clones.deinit();
    var payloads: std.ArrayList([]u8) = .empty;
    defer {
        for (payloads.items) |payload| a.free(payload);
        payloads.deinit(a);
    }
    const refs = try a.alloc(Ref, entries.len);
    errdefer a.free(refs);
    for (entries, refs) |entry, *ref| {
        if (entry.source_id == 0) return error.MissingBorderFillReference;
        if (entry.source_id > resources.len) return error.InvalidBorderFillReference;
        const source = resources[entry.source_id - 1];
        const patch = try entry.effectivePatch(source.payload);
        const key = try CloneKey.init(entry.source_id, patch);
        const slot = try clones.getOrPut(key);
        if (!slot.found_existing) {
            if (resources.len + payloads.items.len >= std.math.maxInt(u16)) return error.InvalidBorderFillReference;
            if (source.children) return error.UnsupportedBorderFillChildren;
            const payload = try @import("border_fill_payload_patch.zig").write(a, source.payload, patch, limit);
            errdefer a.free(payload);
            try payloads.append(a, payload);
            slot.value_ptr.* = @intCast(resources.len + payloads.items.len);
        }
        ref.* = .{ .section = entry.edit.section, .table_node = entry.edit.table_node, .list_node = entry.edit.list_node, .source_id = entry.source_id, .id = slot.value_ptr.* };
    }
    var output: std.ArrayList(u8) = .empty;
    errdefer output.deinit(a);
    if (entries.len == 0) {
        try output.appendSlice(a, input);
    } else {
        const at = insertion orelse return error.MissingBorderFillReference;
        const count_offset = mapping orelse return error.MissingIdMappings;
        try output.appendSlice(a, input[0..at]);
        for (payloads.items) |payload| try @import("../record_writer.zig").append(a, &output, 20, 1, payload, limit);
        try output.appendSlice(a, input[at..]);
        if (output.items.len > limit) return error.LimitExceeded;
        std.mem.writeInt(i32, output.items[count_offset..][0..4], @intCast(resources.len + payloads.items.len), .little);
    }
    const bytes = try output.toOwnedSlice(a);
    errdefer a.free(bytes);
    var owners = std.AutoHashMap(Owner, u16).init(a);
    errdefer owners.deinit();
    var sections = std.AutoHashMap(usize, std.ArrayList(Ref)).init(a);
    errdefer {
        var groups = sections.valueIterator();
        while (groups.next()) |group| group.deinit(a);
        sections.deinit();
    }
    for (refs) |ref| {
        const owner = try owners.getOrPut(.{ .section = ref.section, .table_node = ref.table_node, .list_node = ref.list_node });
        if (owner.found_existing) return error.AmbiguousCellDisplayOwner;
        owner.value_ptr.* = ref.id;
        const group = try sections.getOrPut(ref.section);
        if (!group.found_existing) group.value_ptr.* = .empty;
        try group.value_ptr.append(a, ref);
    }
    return .{ .bytes = bytes, .refs = refs, .owners = owners, .sections = sections };
}

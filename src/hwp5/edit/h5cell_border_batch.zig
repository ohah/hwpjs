//! Request-local owner/resource indexes; publish only the completely checked state.
const std = @import("std");
const values = @import("cell_background_values.zig");
const borders = @import("cell_border_values.zig");
const writer = @import("cell_background_write.zig");
const p = @import("../../model/border_fill_patch.zig");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Request = borders.Edit;
const Owner = struct { section: usize, table_node: u32, list_node: u32 };
const Bound = struct { id: u16, protected: bool, live: bool = false };
fn owner(edit: anytype) Owner {
    return .{ .section = edit.section, .table_node = edit.table_node, .list_node = edit.list_node };
}

pub fn apply(a: std.mem.Allocator, current: *values.Values, decoded: []const []u8, version: Version, document: *const model.Document, info: []const u8, requests: []const Request, limit: usize) !void {
    if (requests.len == 0) return;
    if (requests.len > 4096) return error.LimitExceeded;
    var selected = std.AutoHashMap(Owner, usize).init(a);
    defer selected.deinit();
    var sections = std.AutoHashMap(usize, void).init(a);
    defer sections.deinit();
    for (requests, 0..) |request, i| {
        _ = try borders.toPatch(request);
        const slot = try selected.getOrPut(owner(request));
        if (slot.found_existing) return error.DuplicateCellBorderOwner;
        slot.value_ptr.* = i;
        try sections.put(request.section, {});
    }
    for (current.entries) |entry| try sections.put(entry.edit.section, {});
    var bound = std.AutoHashMap(Owner, Bound).init(a);
    defer bound.deinit();
    var section_it = sections.keyIterator();
    while (section_it.next()) |index| {
        if (index.* >= document.sections.len or index.* >= decoded.len) return error.InvalidSection;
        const rows = try @import("cell_layout_sources.zig").read(a, decoded[index.*], version);
        defer a.free(rows);
        for (rows) |row| {
            const key: Owner = .{ .section = index.*, .table_node = @intCast(row.table_record_node), .list_node = @intCast(row.list_node) };
            const slot = try bound.getOrPut(key);
            if (slot.found_existing) return error.AmbiguousCellDisplayOwner;
            slot.value_ptr.* = .{ .id = row.border_fill_id, .protected = row.protected };
        }
        const bindings = try @import("table_display_bindings.zig").read(a, decoded[index.*], version, document.sections[index.*].paragraphs);
        defer a.free(bindings);
        for (bindings) |binding| {
            const key: Owner = .{ .section = index.*, .table_node = binding.table_node, .list_node = binding.list_node };
            if (bound.getPtr(key)) |cell| cell.live = true;
        }
    }
    var resources = try writer.resourceIndex(a, info, version, limit);
    defer resources.deinit(a);
    var positions = std.AutoHashMap(Owner, usize).init(a);
    defer positions.deinit();
    var candidate: std.ArrayList(values.Entry) = .empty;
    defer candidate.deinit(a);
    try candidate.appendSlice(a, current.entries);
    for (candidate.items, 0..) |entry, i| {
        const cell = try checked(bound, owner(entry.edit));
        if (cell.id != entry.source_id) return error.SourceBindingMismatch;
        const slot = try positions.getOrPut(owner(entry.edit));
        if (slot.found_existing) return error.AmbiguousCellDisplayOwner;
        slot.value_ptr.* = i;
    }
    // Merge in O(1) per owner. The request slice never escapes this call.
    for (requests) |request| {
        const key = owner(request);
        const cell = try checked(bound, key);
        const source = try resources.resource(cell.id);
        const requested = try borders.toPatch(request);
        const slot = try positions.getOrPut(key);
        if (slot.found_existing) {
            const entry = &candidate.items[slot.value_ptr.*];
            entry.patch = p.merge(try entry.effectivePatch(source.payload), requested);
        } else {
            slot.value_ptr.* = candidate.items.len;
            try candidate.append(a, .{ .edit = .{ .section = request.section, .table_node = request.table_node, .list_node = request.list_node, .color = 0 }, .source_id = cell.id, .patch = requested });
        }
    }
    var validated = std.AutoHashMap(writer.CloneKey, usize).init(a);
    defer validated.deinit();
    var observed = std.AutoHashMap(u16, p.Value).init(a);
    defer observed.deinit();
    var clones = std.AutoHashMap(writer.CloneKey, void).init(a);
    defer clones.deinit();
    var output_bytes = info.len;
    var count: usize = 0;
    for (candidate.items) |entry| {
        const source = try resources.resource(entry.source_id);
        if (source.children) return error.UnsupportedBorderFillChildren;
        const merged = try entry.effectivePatch(source.payload);
        _ = try validatePatch(a, &validated, entry.source_id, source.payload, merged, limit);
        const original = try observed.getOrPut(entry.source_id);
        if (!original.found_existing) original.value_ptr.* = try @import("border_fill_payload_patch.zig").observe(source.payload);
        const normalized = values.canonical(original.value_ptr.*, merged);
        if (!p.has(normalized)) continue;
        const clone = try clones.getOrPut(try writer.CloneKey.init(entry.source_id, normalized));
        if (!clone.found_existing) {
            if (resources.resources.len + clones.count() > std.math.maxInt(u16)) return error.InvalidBorderFillReference;
            const length = try validatePatch(a, &validated, entry.source_id, source.payload, normalized, limit);
            const header: usize = if (length >= 0xfff) 8 else 4;
            output_bytes = std.math.add(usize, output_bytes, length) catch return error.LimitExceeded;
            output_bytes = std.math.add(usize, output_bytes, header) catch return error.LimitExceeded;
            if (output_bytes > limit) return error.LimitExceeded;
        }
        var next = entry;
        next.patch = normalized;
        next.edit.color = if (normalized.background) |bg| if (bg == .solid) bg.solid.color else 0 else 0;
        candidate.items[count] = next;
        count += 1;
    }
    candidate.items.len = count;
    if (count > 100000) return error.LimitExceeded;
    if ((std.math.mul(usize, count, @sizeOf(values.Entry)) catch return error.LimitExceeded) > limit) return error.LimitExceeded;
    const next = try candidate.toOwnedSlice(a);
    a.free(current.entries);
    current.entries = next;
}
fn checked(bound: std.AutoHashMap(Owner, Bound), key: Owner) !Bound {
    const cell = bound.get(key) orelse return error.InvalidCellDisplayOwner;
    if (!cell.live) return error.InvalidCellDisplayOwner;
    if (cell.protected) return error.ProtectedCell;
    if (cell.id == 0) return error.MissingBorderFillReference;
    return cell;
}

fn validatePatch(a: std.mem.Allocator, cache: *std.AutoHashMap(writer.CloneKey, usize), id: u16, payload: []const u8, patch: p.Patch, limit: usize) !usize {
    const key = try writer.CloneKey.init(id, patch);
    const slot = try cache.getOrPut(key);
    if (!slot.found_existing) {
        const bytes = try @import("border_fill_payload_patch.zig").write(a, payload, patch, limit);
        defer a.free(bytes);
        slot.value_ptr.* = bytes.len;
    }
    return slot.value_ptr.*;
}

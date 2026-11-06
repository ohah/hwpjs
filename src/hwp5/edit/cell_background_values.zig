//! HWP5 adapter-owned original-cell intents. No generated-cell or table-wide target.
const std = @import("std");
const model = @import("../../model/document.zig");
const Version = @import("../version.zig").Version;
pub const Edit = struct { section: usize, table_node: u32, list_node: u32, color: u32 };
const patch_model = @import("../../model/border_fill_patch.zig");
/// Null patch accepts the existing background-only Entry constructor.
/// All new intents store a canonical sparse patch in this SAME owner entry.
pub const Entry = struct {
    edit: Edit,
    source_id: u16,
    patch: ?patch_model.Patch = null,
    pub fn effectivePatch(self: Entry, payload: []const u8) !patch_model.Patch {
        return self.patch orelse try solidPatch(payload, self.edit.color);
    }
};
/// New-cell-fill construction, not an observed fallback/default. Existing pattern
/// foreground (including inactive sentinels) is preserved by the strict writer.
pub fn solidPatch(input: []const u8, color_rgb: u32) !@import("../../model/border_fill_patch.zig").Patch {
    try @import("../../model/rgb_color.zig").validate(color_rgb);
    const source = try @import("../docinfo/border_fill.zig").BorderFill.parseWithAdditionalPolicy(input, .observed_absent);
    var foreground: ?u32 = null;
    if (source.fill.data == .known) {
        const old = source.fill.data.known;
        if (source.fill.flags == 0 and old.pattern == null and old.gradient == null and old.image == null and old.additional.len == 0 and old.extra.len == 0)
            foreground = color_rgb;
    }
    return .{ .background = .{ .solid = .{ .color = color_rgb, .hatch_color = foreground } } };
}
pub const Values = struct {
    entries: []Entry = &.{},
    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        a.free(self.entries);
        self.* = .{};
    }
    pub fn byteSize(self: Values) !usize {
        return std.math.mul(usize, self.entries.len, @sizeOf(Entry)) catch error.LimitExceeded;
    }
    pub fn clone(self: Values, a: std.mem.Allocator) !Values {
        return .{ .entries = try a.dupe(Entry, self.entries) };
    }
    pub fn equals(self: Values, other: Values) bool {
        if (self.entries.len != other.entries.len) return false;
        for (self.entries, other.entries) |left, right| if (!std.meta.eql(left, right)) return false;
        return true;
    }
    pub fn hasSection(self: Values, section: usize) bool {
        for (self.entries) |entry| if (entry.edit.section == section) return true;
        return false;
    }
    pub fn color(self: Values, edit: Edit) ?u32 {
        for (self.entries) |entry| if (sameOwner(entry.edit, edit)) {
            if (entry.patch) |patch| {
                const bg = patch.background orelse return null;
                return if (bg == .solid) bg.solid.color else null;
            }
            return entry.edit.color;
        };
        return null;
    }
    pub fn apply(self: *Values, a: std.mem.Allocator, source: []const u8, version: Version, section: model.Section, info: []const u8, edit: Edit, limit: usize) !void {
        try @import("../../model/rgb_color.zig").validate(edit.color);
        const id = try reference(a, source, version, section, edit);
        const payload = try @import("border_fill_docinfo_patch.zig").resource(info, id);
        try self.applyResolved(a, payload, edit, id, try solidPatch(payload, edit.color), limit);
    }
    pub fn applyBorder(self: *Values, a: std.mem.Allocator, source: []const u8, version: Version, section: model.Section, info: []const u8, edit: @import("cell_border_values.zig").Edit, limit: usize) !void {
        const patch = try @import("cell_border_values.zig").toPatch(edit);
        const owner: Edit = .{ .section = edit.section, .table_node = edit.table_node, .list_node = edit.list_node, .color = 0 };
        const id = try reference(a, source, version, section, owner);
        const payload = try @import("border_fill_docinfo_patch.zig").resource(info, id);
        try self.applyResolved(a, payload, owner, id, patch, limit);
    }
    /// Validate and allocate before publishing. History owns the surrounding transaction.
    pub fn applyResolved(self: *Values, a: std.mem.Allocator, payload: []const u8, owner: Edit, id: u16, requested: patch_model.Patch, limit: usize) !void {
        var position: ?usize = null;
        for (self.entries, 0..) |entry, i| if (sameOwner(entry.edit, owner)) {
            if (entry.source_id != id) return error.SourceBindingMismatch;
            position = i;
            break;
        };
        const old: patch_model.Patch = if (position) |i| try self.entries[i].effectivePatch(payload) else .{};
        const merged = patch_model.merge(old, requested);
        // Preserve the background constructor and strict refusal rules. Border-only
        // requests do not synthesize or interpret unknown/image/hatch fills.
        const prepared = try @import("border_fill_payload_patch.zig").write(a, payload, merged, limit);
        defer a.free(prepared);
        const observed = try @import("border_fill_payload_patch.zig").observe(payload);
        const next_patch = canonical(observed, merged);
        if (std.meta.eql(old, next_patch)) return;
        if (!patch_model.has(next_patch)) {
            if (position) |i| {
                const next = try a.alloc(Entry, self.entries.len - 1);
                @memcpy(next[0..i], self.entries[0..i]);
                @memcpy(next[i..], self.entries[i + 1 ..]);
                a.free(self.entries);
                self.entries = next;
            }
            return;
        }
        var entry: Entry = .{ .edit = owner, .source_id = id, .patch = next_patch };
        entry.edit.color = if (next_patch.background) |bg| if (bg == .solid) bg.solid.color else 0 else 0;
        if (position) |i| {
            self.entries[i] = entry;
            return;
        }
        if (self.entries.len >= 100_000) return error.LimitExceeded;
        const bytes = std.math.mul(usize, self.entries.len + 1, @sizeOf(Entry)) catch return error.LimitExceeded;
        if (bytes > limit) return error.LimitExceeded;
        const next = try a.alloc(Entry, self.entries.len + 1);
        @memcpy(next[0..self.entries.len], self.entries);
        next[self.entries.len] = entry;
        a.free(self.entries);
        self.entries = next;
    }
};
pub fn sameOwner(a: Edit, b: Edit) bool {
    return a.section == b.section and a.table_node == b.table_node and a.list_node == b.list_node;
}
pub fn reference(a: std.mem.Allocator, source: []const u8, version: Version, section: model.Section, edit: Edit) !u16 {
    const sources = try @import("cell_layout_sources.zig").read(a, source, version);
    defer a.free(sources);
    var id: ?u16 = null;
    for (sources) |cell| if (cell.table_record_node == edit.table_node and cell.list_node == edit.list_node) {
        if (id != null) return error.AmbiguousCellDisplayOwner;
        if (cell.protected) return error.ProtectedCell;
        id = cell.border_fill_id;
    };
    const selected = id orelse return error.InvalidCellDisplayOwner;
    if (selected == 0) return error.MissingBorderFillReference;
    const bindings = try @import("table_display_bindings.zig").read(a, source, version, section.paragraphs);
    defer a.free(bindings);
    for (bindings) |binding| if (binding.table_node == edit.table_node and binding.list_node == edit.list_node) return selected;
    return error.InvalidCellDisplayOwner;
}

/// Drop only matching scalar components; siblings and the other operation survive.
pub fn canonical(original: patch_model.Value, patch: patch_model.Patch) patch_model.Patch {
    return patch_model.canonical(original, patch);
}

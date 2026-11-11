//! Owned current text keyed by immutable form source identity.
const std = @import("std");
const source = @import("form_text_source.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Entry = struct { form_node: usize, text: []u8 };
pub const max_entries = 100000;
pub const Values = struct {
    entries: std.ArrayList(Entry) = .empty,

    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.entries.items) |entry| a.free(entry.text);
        self.entries.deinit(a);
        self.* = .{};
    }

    fn find(self: *const Values, form_node: usize) !?usize {
        var found: ?usize = null;
        for (self.entries.items, 0..) |entry, index| {
            if (entry.form_node != form_node) continue;
            if (found != null) return error.DuplicateFormTextEdit;
            found = index;
        }
        return found;
    }

    pub fn read(self: *const Values, a: std.mem.Allocator, tree: *const Tree, form_node: usize, limit: usize) ![]u8 {
        _ = limit;
        _ = try source.target(tree, form_node);
        if (try self.find(form_node)) |index| {
            const text = self.entries.items[index].text;
            try source.validateValue(a, tree, form_node, text);
            return a.dupe(u8, text);
        }
        return source.readValue(a, tree, form_node);
    }

    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        if (self.entries.items.len > max_entries) return error.LimitExceeded;
        var result: Values = .{};
        errdefer result.deinit(a);
        var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
        defer seen.deinit(a);
        try result.entries.ensureTotalCapacity(a, self.entries.items.len);
        for (self.entries.items) |entry| {
            if ((try seen.getOrPut(a, entry.form_node)).found_existing) return error.DuplicateFormTextEdit;
            const text = try a.dupe(u8, entry.text);
            result.entries.appendAssumeCapacity(.{ .form_node = entry.form_node, .text = text });
        }
        return result;
    }

    pub fn byteSize(self: *const Values, limit: usize) !usize {
        var total = std.math.mul(usize, self.entries.capacity, @sizeOf(Entry)) catch return error.LimitExceeded;
        if (total > limit) return error.LimitExceeded;
        for (self.entries.items) |entry| {
            if (entry.text.len > limit - total) return error.LimitExceeded;
            total += entry.text.len;
        }
        return total;
    }

    /// All validation/allocation happens before one swap. Restoring the decoded
    /// original removes the override so exact source serialization is possible.
    pub fn set(self: *Values, a: std.mem.Allocator, tree: *const Tree, form_node: usize, text: []const u8, limit: usize, max_owned_bytes: usize) !bool {
        _ = limit;
        const original = try source.readValue(a, tree, form_node);
        defer a.free(original);
        try source.validateValue(a, tree, form_node, text);
        const index = try self.find(form_node);
        const previous = if (index) |at| self.entries.items[at].text else original;
        if (std.mem.eql(u8, previous, text)) return false;
        var candidate = try self.clone(a);
        defer candidate.deinit(a);
        if (index) |at| {
            if (std.mem.eql(u8, original, text)) {
                a.free(candidate.entries.orderedRemove(at).text);
            } else {
                const owned = try a.dupe(u8, text);
                a.free(candidate.entries.items[at].text);
                candidate.entries.items[at].text = owned;
            }
        } else {
            if (candidate.entries.items.len >= max_entries) return error.LimitExceeded;
            const owned = try a.dupe(u8, text);
            errdefer a.free(owned);
            try candidate.entries.append(a, .{ .form_node = form_node, .text = owned });
        }
        _ = try candidate.byteSize(max_owned_bytes);
        std.mem.swap(Values, self, &candidate);
        return true;
    }
};

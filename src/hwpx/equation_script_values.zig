//! Owned current scripts keyed by immutable equation source identity.
const std = @import("std");
const source = @import("equation_script_write.zig");
const Tree = @import("xml_part_tree.zig").Tree;
pub const Entry = struct { equation: usize, text: []u8 };
pub const max_entries = (@import("equation.zig").Options{}).max_equations;
pub const Values = struct {
    entries: std.ArrayList(Entry) = .empty,

    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.entries.items) |entry| a.free(entry.text);
        self.entries.deinit(a);
        self.* = .{};
    }

    fn find(self: *const Values, equation: usize) !?usize {
        var found: ?usize = null;
        for (self.entries.items, 0..) |entry, index| {
            if (entry.equation != equation) continue;
            if (found != null) return error.DuplicateEquationScriptEdit;
            found = index;
        }
        return found;
    }

    pub fn read(self: *const Values, a: std.mem.Allocator, tree: *const Tree, equation: usize, options: source.Options) ![]u8 {
        _ = try source.target(a, tree, equation, options);
        if (try self.find(equation)) |index| {
            const text = self.entries.items[index].text;
            try source.validateValue(a, text, options);
            return a.dupe(u8, text);
        }
        return source.readValue(a, tree, equation, options);
    }

    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        if (self.entries.items.len > max_entries) return error.LimitExceeded;
        var result: Values = .{};
        errdefer result.deinit(a);
        var seen: std.AutoHashMapUnmanaged(usize, void) = .empty;
        defer seen.deinit(a);
        try result.entries.ensureTotalCapacity(a, self.entries.items.len);
        for (self.entries.items) |entry| {
            if ((try seen.getOrPut(a, entry.equation)).found_existing) return error.DuplicateEquationScriptEdit;
            const text = try a.dupe(u8, entry.text);
            result.entries.appendAssumeCapacity(.{ .equation = entry.equation, .text = text });
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
    pub fn set(self: *Values, a: std.mem.Allocator, tree: *const Tree, equation: usize, text: []const u8, options: source.Options, max_owned_bytes: usize) !bool {
        const original = try source.readValue(a, tree, equation, options);
        defer a.free(original);
        try source.validateValue(a, text, options);
        const index = try self.find(equation);
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
            try candidate.entries.append(a, .{ .equation = equation, .text = owned });
        }
        _ = try candidate.byteSize(max_owned_bytes);
        std.mem.swap(Values, self, &candidate);
        return true;
    }
};

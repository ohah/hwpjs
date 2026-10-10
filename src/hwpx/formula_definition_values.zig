//! Owned current formula definitions. Evaluated caches belong to save output.
const std = @import("std");
pub const Entry = struct { begin_element: usize, formula: []u8 };
pub const Values = struct {
    entries: std.ArrayList(Entry) = .empty,

    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.entries.items) |entry| a.free(entry.formula);
        self.entries.deinit(a);
        self.* = .{};
    }

    pub fn get(self: *const Values, begin: usize) ?[]const u8 {
        for (self.entries.items) |entry| if (entry.begin_element == begin) return entry.formula;
        return null;
    }

    /// Grammar is checked against the immutable field's format before mutation.
    /// Restoring the source definition removes the overlay; failures are atomic.
    pub fn set(self: *Values, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, begin: usize, replacement: []const u8) !bool {
        var source = try @import("formula_source_query.zig").read(a, tree, begin);
        defer source.deinit();
        var validated = try @import("formula_command_plan.zig").prepare(a, source.values, replacement, 0);
        defer validated.deinit(a);
        const original = source.values.formula orelse return error.MissingFormulaParameters;
        for (self.entries.items, 0..) |*entry, index| {
            if (entry.begin_element != begin) continue;
            if (std.mem.eql(u8, entry.formula, replacement)) return false;
            if (std.mem.eql(u8, original, replacement)) {
                a.free(self.entries.orderedRemove(index).formula);
            } else {
                const owned = try a.dupe(u8, replacement);
                a.free(entry.formula);
                entry.formula = owned;
            }
            return true;
        }
        if (std.mem.eql(u8, original, replacement)) return false;
        if (self.entries.items.len >= 4096) return error.LimitExceeded;
        const owned = try a.dupe(u8, replacement);
        errdefer a.free(owned);
        try self.entries.append(a, .{ .begin_element = begin, .formula = owned });
        return true;
    }

    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        var result: Values = .{};
        errdefer result.deinit(a);
        try result.entries.ensureTotalCapacity(a, self.entries.items.len);
        for (self.entries.items) |entry| {
            const formula = try a.dupe(u8, entry.formula);
            result.entries.appendAssumeCapacity(.{ .begin_element = entry.begin_element, .formula = formula });
        }
        return result;
    }
};

fn allocationCase(a: std.mem.Allocator) !void {
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    var begin: ?usize = null;
    for (tree.elements, 0..) |element, node| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) begin = node;
    }
    const node = begin orelse return error.MissingFormulaFieldNode;
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expect(!try values.set(a, &tree, node, "=SUM(A1:A1)"));
    try std.testing.expect(try values.set(a, &tree, node, "=AVG(A1:A1)"));
    var copy = try values.clone(a);
    defer copy.deinit(a);
    try std.testing.expect(!try values.set(a, &tree, node, "=AVG(A1:A1)"));
    try std.testing.expect(try values.set(a, &tree, node, "=SUM(A1:A1)"));
    try std.testing.expect(values.get(node) == null);
    try std.testing.expectEqualStrings("=AVG(A1:A1)", copy.get(node).?);
}

test "HWPX formula definitions own expressions and clones under allocation failure" {
    try allocationCase(std.testing.allocator);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{});
}

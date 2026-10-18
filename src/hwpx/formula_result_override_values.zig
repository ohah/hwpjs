//! Owned manual results, separate from calculation caches and source Sites.
//! Source bindings and invalidation remain the caller's transaction responsibility.
const std = @import("std");
pub const Origin = enum { manual, source_display, automatic };
pub const Entry = struct { begin_element: usize, display: []u8, origin: Origin = .manual };
pub const Values = struct {
    entries: std.ArrayList(Entry) = .empty,

    pub fn deinit(self: *Values, a: std.mem.Allocator) void {
        for (self.entries.items) |entry| a.free(entry.display);
        self.entries.deinit(a);
        self.* = .{};
    }

    pub fn get(self: *const Values, begin: usize) ?[]const u8 {
        for (self.entries.items) |entry| if (entry.begin_element == begin) return if (entry.origin == .automatic) null else entry.display;
        return null;
    }

    pub fn origin(self: *const Values, begin: usize) ?Origin {
        for (self.entries.items) |entry| if (entry.begin_element == begin) return entry.origin;
        return null;
    }

    /// Explicit automatic disposition suppresses future source-display seeding.
    /// Stores no derived number/string; evaluation still reads current inputs.
    pub fn recalculate(self: *Values, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, begin: usize) !bool {
        if (!try @import("formula_source_query.zig").isFormula(a, tree, begin)) return error.InvalidFormulaFieldNode;
        for (self.entries.items) |*entry| {
            if (entry.begin_element != begin) continue;
            if (entry.origin == .automatic) return false;
            const empty = try a.dupe(u8, "");
            a.free(entry.display);
            entry.display = empty;
            entry.origin = .automatic;
            return true;
        }
        if (self.entries.items.len >= (@import("formula_section_prepare.zig").Options{}).max_fields) return error.LimitExceeded;
        const empty = try a.dupe(u8, "");
        errdefer a.free(empty);
        try self.entries.append(a, .{ .begin_element = begin, .display = empty, .origin = .automatic });
        return true;
    }

    pub fn clear(self: *Values, a: std.mem.Allocator, begin: usize) bool {
        for (self.entries.items, 0..) |entry, index| {
            if (entry.begin_element != begin) continue;
            a.free(self.entries.orderedRemove(index).display);
            return true;
        }
        return false;
    }

    pub fn set(self: *Values, a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, begin: usize, display: []const u8) !bool {
        if (!try @import("formula_source_query.zig").isFormula(a, tree, begin)) return error.InvalidFormulaFieldNode;
        if (display.len > @import("formula_result_sites.zig").max_display_bytes) return error.LimitExceeded;
        const view = try std.unicode.Utf8View.init(display);
        var scalars = view.iterator();
        while (scalars.nextCodepoint()) |scalar| {
            if (!@import("../xml/characters.zig").valid(scalar)) return error.InvalidXmlCharacter;
        }
        for (self.entries.items) |*entry| {
            if (entry.begin_element != begin) continue;
            if (entry.origin != .automatic and std.mem.eql(u8, entry.display, display)) return false;
            const owned = try a.dupe(u8, display);
            a.free(entry.display);
            entry.display = owned;
            entry.origin = .manual;
            return true;
        }
        if (self.entries.items.len >= (@import("formula_section_prepare.zig").Options{}).max_fields) return error.LimitExceeded;
        const owned = try a.dupe(u8, display);
        errdefer a.free(owned);
        try self.entries.append(a, .{ .begin_element = begin, .display = owned });
        return true;
    }

    pub fn clone(self: *const Values, a: std.mem.Allocator) !Values {
        var result: Values = .{};
        errdefer result.deinit(a);
        try result.entries.ensureTotalCapacity(a, self.entries.items.len);
        for (self.entries.items) |entry| {
            const display = try a.dupe(u8, entry.display);
            result.entries.appendAssumeCapacity(.{ .begin_element = entry.begin_element, .display = display, .origin = entry.origin });
        }
        return result;
    }
};

fn allocationCase(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, begin: usize) !void {
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expect(try values.set(a, tree, begin, "수동😀"));
    var copy = try values.clone(a);
    defer copy.deinit(a);
    try std.testing.expect(!try values.set(a, tree, begin, "수동😀"));
    _ = values.set(a, tree, begin, "다른 값") catch |err| {
        try std.testing.expectEqualStrings("수동😀", values.get(begin).?);
        return err;
    };
    try std.testing.expectEqualStrings("수동😀", copy.get(begin).?);
    try std.testing.expectEqualStrings("다른 값", values.get(begin).?);
    try std.testing.expect(values.clear(a, begin));
    try std.testing.expect(values.get(begin) == null);
    try std.testing.expect(!values.clear(a, begin));
}

test "HWPX manual formula result values own clone replace and clear under OOM" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    const begin = for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    try allocationCase(a, &tree, begin);
    try @import("../testing/allocation_failures.zig").check(allocationCase, .{ &tree, begin });
}

test "HWPX manual formula result values reject invalid replacements without dropping prior override" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    const begin = for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expect(try values.set(a, &tree, begin, "수동😀"));
    try std.testing.expectError(error.InvalidUtf8, values.set(a, &tree, begin, &.{0xff}));
    try std.testing.expectError(error.InvalidXmlCharacter, values.set(a, &tree, begin, &.{0}));
    try std.testing.expectError(error.InvalidFormulaFieldNode, values.set(a, &tree, 0, "9"));
    try std.testing.expectError(error.LimitExceeded, values.set(a, &tree, begin, &@as([@import("formula_result_sites.zig").max_display_bytes + 1]u8, @splat('x'))));
    try std.testing.expectEqualStrings("수동😀", values.get(begin).?);
    const alias = values.get(begin).?[0..6];
    try std.testing.expect(try values.set(a, &tree, begin, alias));
    try std.testing.expectEqualStrings("수동", values.get(begin).?);
    try std.testing.expect(try values.set(a, &tree, begin, ""));
    try std.testing.expectEqualStrings("", values.get(begin).?);
}

fn dispositionCase(a: std.mem.Allocator, tree: *const @import("xml_part_tree.zig").Tree, begin: usize) !void {
    var values: Values = .{};
    defer values.deinit(a);
    try std.testing.expect(try values.set(a, tree, begin, "수동"));
    _ = values.recalculate(a, tree, begin) catch |err| {
        try std.testing.expectEqualStrings("수동", values.get(begin).?);
        return err;
    };
    try std.testing.expect(values.get(begin) == null);
    try std.testing.expectEqual(Origin.automatic, values.origin(begin).?);
    var copy = try values.clone(a);
    defer copy.deinit(a);
    try std.testing.expectEqual(Origin.automatic, copy.origin(begin).?);
    try std.testing.expect(copy.get(begin) == null);
    try std.testing.expect(!try values.recalculate(a, tree, begin));
    try std.testing.expect(try values.set(a, tree, begin, ""));
    try std.testing.expectEqual(Origin.manual, values.origin(begin).?);
    try std.testing.expectEqualStrings("", values.get(begin).?);
}

test "HWPX manual formula result automatic disposition retains intent without a value cache under OOM" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    const begin = for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "fieldBegin")) break index;
    } else return error.TestExpectedEqual;
    try dispositionCase(a, &tree, begin);
    try @import("../testing/allocation_failures.zig").check(dispositionCase, .{ &tree, begin });
}

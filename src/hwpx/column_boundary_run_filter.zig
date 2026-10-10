//! Keep source column controls only in their current explicit owner.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Position = @import("column_boundary_position.zig").Position;
const uri = @import("document_xml.zig").paragraph_uri;

pub fn write(a: std.mem.Allocator, source: *const Tree, run: usize, xml: []const u8, owned: []const Position, limit: usize) ![]u8 {
    if (run >= source.elements.len or !source.elements[run].is(uri, "run")) return error.SourceBindingMismatch;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>";
    const wrapper = try std.mem.concat(a, u8, &.{ prefix, xml, "</p:p></s:sec>" });
    defer a.free(wrapper);
    var parsed = try @import("xml_part_tree.zig").parse(a, wrapper, .section, 0, 0, .{ .max_xml_bytes = wrapper.len });
    defer parsed.deinit(a);
    var run_child = parsed.elements[1].first_child;
    if (run_child == null) return error.SourceBindingMismatch;
    while (run_child) |index| : (run_child = parsed.elements[index].next_sibling) {
        if (!parsed.elements[index].is(uri, "run")) return error.SourceBindingMismatch;
    }
    var changes: std.ArrayList(@import("xml_source_writer.zig").Change) = .empty;
    defer changes.deinit(a);
    var original_child = source.elements[run].first_child;
    var current_cursor: usize = 0;
    while (nextColumn(source, &original_child)) |original| {
        const current = try nextSerializedColumn(&parsed, &current_cursor) orelse return error.SourceBindingMismatch;
        var keep = false;
        for (owned) |boundary| if (boundary.source_element == original) {
            keep = true;
        };
        if (!keep) {
            const control = try @import("column_boundary_xml.zig").control(&parsed, current);
            const node = parsed.elements[control];
            try changes.append(a, .{ .start = node.start_tag.start - prefix.len, .end = node.end - prefix.len, .text = "", .serialized_xml = "" });
        }
    }
    if (try nextSerializedColumn(&parsed, &current_cursor) != null) return error.SourceBindingMismatch;
    return @import("xml_source_writer.zig").write(a, xml, changes.items, limit);
}

test "column run filter partitions identical controls without text or metadata loss" {
    const a = std.testing.allocator;
    const run = "<p:run xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' charPrIDRef='7'><p:ctrl><p:colPr colCount='2'/></p:ctrl><!--keep--><p:t>A😀B</p:t><p:ctrl><p:colPr colCount='2'/></p:ctrl></p:run>";
    const xml = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>", run, "</p:p></s:sec>" });
    defer a.free(xml);
    var tree = try @import("xml_part_tree.zig").parse(a, xml, .section, 0, 0, .{});
    defer tree.deinit(a);
    var ids: [2]usize = undefined;
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(uri, "colPr")) {
        ids[count] = index;
        count += 1;
    };
    for (ids) |id| {
        const Probe = struct {
            fn runProbe(allocator: std.mem.Allocator, original: *const Tree, bytes: []const u8, selected: usize) !void {
                const result = try write(allocator, original, 2, bytes, &.{.{ .source_element = selected, .unit = 1, .affinity = .right }}, 10000);
                defer allocator.free(result);
                try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, result, "colCount"));
                try std.testing.expect(std.mem.indexOf(u8, result, "<!--keep--><p:t>A😀B</p:t>") != null);
                try std.testing.expect(std.mem.indexOf(u8, result, "charPrIDRef='7'") != null);
                var first: ?usize = null;
                for (original.elements, 0..) |element, index| if (element.is(uri, "colPr") and first == null) {
                    first = index;
                };
                const control_at = std.mem.indexOf(u8, result, "<p:ctrl>").?;
                const text_at = std.mem.indexOf(u8, result, "<p:t>").?;
                try std.testing.expectEqual(selected == first.?, control_at < text_at);
            }
        };
        try Probe.runProbe(a, &tree, run, id);
        try std.testing.checkAllAllocationFailures(a, Probe.runProbe, .{ &tree, run, id });
    }
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, 2, run, &.{}, 1));
}

fn nextColumn(tree: *const Tree, cursor: *?usize) ?usize {
    while (cursor.*) |index| {
        cursor.* = tree.elements[index].next_sibling;
        if (!tree.elements[index].is(uri, "ctrl")) continue;
        var child = tree.elements[index].first_child;
        while (child) |item| : (child = tree.elements[item].next_sibling) {
            if (tree.elements[item].is(uri, "colPr")) return item;
        }
    }
    return null;
}

fn nextSerializedColumn(tree: *const Tree, cursor: *usize) !?usize {
    while (cursor.* < tree.elements.len) {
        const index = cursor.*;
        cursor.* += 1;
        if (!tree.elements[index].is(uri, "colPr")) continue;
        const control = tree.elements[index].parent orelse return error.SourceBindingMismatch;
        const run = tree.elements[control].parent orelse return error.SourceBindingMismatch;
        if (!tree.elements[control].is(uri, "ctrl") or !tree.elements[run].is(uri, "run") or tree.elements[run].parent != 1) return error.SourceBindingMismatch;
        return index;
    }
    return null;
}

test "column run filter preserves styles across serialized run fragments" {
    const a = std.testing.allocator;
    const prefix = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p>";
    const original = "<p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀B</p:t><p:ctrl><p:colPr colCount='2'/></p:ctrl></p:run>";
    const fragments = "<p:run charPrIDRef='7'><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀</p:t></p:run><p:run charPrIDRef='9'><p:t>B</p:t><p:ctrl><p:colPr colCount='2'/></p:ctrl></p:run>";
    const source = try std.mem.concat(a, u8, &.{ prefix, original, "</p:p></s:sec>" });
    defer a.free(source);
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var selected: usize = 0;
    for (tree.elements, 0..) |element, index| if (element.is(uri, "colPr")) {
        selected = index;
    };
    const Probe = struct {
        fn run(a1: std.mem.Allocator, parsed: *const Tree, xml: []const u8, owner: usize) !void {
            const result = try write(a1, parsed, 2, xml, &.{.{ .source_element = owner, .unit = 3, .affinity = .right }}, 10000);
            defer a1.free(result);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, result, "colCount="));
            try std.testing.expect(std.mem.indexOf(u8, result, "charPrIDRef='7'") != null);
            try std.testing.expect(std.mem.indexOf(u8, result, "charPrIDRef='9'") != null);
            try std.testing.expect(std.mem.indexOf(u8, result, "A😀") != null);
            try std.testing.expect(std.mem.indexOf(u8, result, "colCount='2'") != null);
        }
    };
    try Probe.run(a, &tree, fragments, selected);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, fragments, selected });
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, 2, "<p:run><p:t>A</p:t></p:run>", &.{}, 10000));
}

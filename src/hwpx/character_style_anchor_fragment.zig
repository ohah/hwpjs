//! One protected anchor in its source run namespace context.
//! The complete assembler must retain other run children exactly once.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Span = @import("character_style_anchor_projection.zig").Span;

pub fn write(a: std.mem.Allocator, tree: *const Tree, span: Span, limit: usize) ![]u8 {
    const index = switch (span.owner) {
        .anchor_element => |index| index,
        else => return error.InvalidTextSites,
    };
    if (span.range.end_unit < span.range.start_unit or span.range.end_unit - span.range.start_unit != 1) return error.InvalidTextSites;
    if (@import("run_anchor.zig").kind(tree, index) == null) return error.UnsupportedParagraphControl;
    const run_index = tree.elements[index].parent orelse return error.SourceBindingMismatch;
    const run = tree.elements[run_index];
    const ending = run.end_tag orelse return error.SourceBindingMismatch;
    const opening = if (span.range.char_shape_id) |id|
        try @import("character_style_tag.zig").write(a, tree, run_index, id, limit)
    else
        try a.dupe(u8, tree.source[run.start_tag.start..run.start_tag.end]);
    defer a.free(opening);
    var result: std.ArrayList(u8) = .empty;
    defer result.deinit(a);
    for ([_][]const u8{ opening, tree.sourceOf(index), tree.source[ending.start..ending.end] }) |part| {
        if (part.len > limit -| result.items.len) return error.LimitExceeded;
        try result.appendSlice(a, part);
    }
    return result.toOwnedSlice(a);
}

test "HWPX protected anchor fragment keeps opaque nested content and absent versus zero IDs" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run custom='keep'><p:rect width='123'><!--opaque--><?keep data?><p:subList><p:p><p:run><p:t>내부😀</p:t></p:run></p:p></p:subList></p:rect><p:t>outside</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var anchor: ?usize = null;
    var text: ?usize = null;
    for (tree.elements, 0..) |element, index| {
        if (element.is(@import("document_xml.zig").paragraph_uri, "rect")) anchor = index;
        if (element.is(@import("document_xml.zig").paragraph_uri, "t")) text = index;
    }
    var span: Span = .{ .range = .{ .start_unit = 0, .end_unit = 1, .char_shape_id = null }, .owner = .{ .anchor_element = anchor.? } };
    const original = try write(a, &tree, span, 4000);
    defer a.free(original);
    try std.testing.expectEqualSlices(u8, "<p:run custom='keep'><p:rect width='123'><!--opaque--><?keep data?><p:subList><p:p><p:run><p:t>내부😀</p:t></p:run></p:p></p:subList></p:rect></p:run>", original);
    span.range.char_shape_id = 0;
    const zero = try write(a, &tree, span, 4000);
    defer a.free(zero);
    try std.testing.expect(std.mem.indexOf(u8, zero, "charPrIDRef=\"0\"") != null);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, zero, tree.sourceOf(anchor.?)));
    span.owner = .{ .anchor_element = text.? };
    try std.testing.expectError(error.UnsupportedParagraphControl, write(a, &tree, span, 4000));
    try std.testing.expectEqualSlices(u8, source, tree.source);
}

test "HWPX protected anchor fragments retain actual table picture equation notes and container payloads" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "table", "shapepict-scaled", "latex", "footnote-endnote", "shapecontainer-2" }) |fixture| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{fixture});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(bytes);
        var session = try @import("editor_session.zig").open(a, bytes, .{});
        defer session.deinit();
        var found: usize = 0;
        for (session.sections) |*section| {
            for (section.tree.elements, 0..) |_, index| {
                if (@import("run_anchor.zig").kind(&section.tree, index) == null) continue;
                const span: Span = .{ .range = .{ .start_unit = 0, .end_unit = 1, .char_shape_id = 0 }, .owner = .{ .anchor_element = index } };
                const fragment = try write(a, &section.tree, span, 4_000_000);
                defer a.free(fragment);
                try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, fragment, section.tree.sourceOf(index)));
                found += 1;
            }
        }
        try std.testing.expect(found > 0);
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, bytes, saved);
    }
}

test "HWPX protected anchor fragment preserves actual object XML and allocation failures" {
    const a = std.testing.allocator;
    const editor = @import("editor_session.zig");
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/shapeline.hwpx", a, .limited(4_000_000));
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    const section = &session.sections[0];
    const positions = try @import("anchor_paragraph_edit.zig").segments(a, &section.tree, &section.sites, section.locations, 1);
    defer a.free(positions);
    const spans = try @import("character_style_anchor_projection.zig").build(a, &section.tree, &section.sites, positions, 1000);
    defer a.free(spans);
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, tree: *const Tree, source: Span) !void {
            var selected = source;
            selected.range.char_shape_id = 987;
            const result = try write(allocator, tree, selected, 4_000_000);
            defer allocator.free(result);
            const index = source.owner.anchor_element;
            const raw = tree.sourceOf(index);
            try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, result, raw));
            try std.testing.expect(std.mem.indexOf(u8, result, "987") != null);
            const wrapped = try std.mem.concat(allocator, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:hp='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:hc='http://www.hancom.co.kr/hwpml/2011/core'><hp:p>", result, "</hp:p></s:sec>" });
            defer allocator.free(wrapped);
            var reopened = try @import("xml_part_tree.zig").parse(allocator, wrapped, .section, 0, 0, .{});
            defer reopened.deinit(allocator);
            var found: usize = 0;
            for (reopened.elements, 0..) |_, element| if (@import("run_anchor.zig").kind(&reopened, element) != null) {
                try std.testing.expectEqualSlices(u8, raw, reopened.sourceOf(element));
                found += 1;
            };
            try std.testing.expectEqual(@as(usize, 1), found);
        }
    };
    var count: usize = 0;
    for (spans) |span| switch (span.owner) {
        .anchor_element => {
            try Probe.run(a, &section.tree, span);
            try @import("../testing/allocation_failures.zig").check(Probe.run, .{ &section.tree, span });
            try std.testing.expectError(error.LimitExceeded, write(a, &section.tree, span, 1));
            var invalid = span;
            invalid.owner = .{ .anchor_element = section.tree.elements.len };
            try std.testing.expectError(error.UnsupportedParagraphControl, write(a, &section.tree, invalid, 1000));
            invalid = span;
            invalid.range.end_unit += 1;
            try std.testing.expectError(error.InvalidTextSites, write(a, &section.tree, invalid, 1000));
            count += 1;
        },
        .text_site => try std.testing.expectError(error.InvalidTextSites, write(a, &section.tree, span, 1000)),
        else => {},
    };
    try std.testing.expectEqual(@as(usize, 2), count);
}

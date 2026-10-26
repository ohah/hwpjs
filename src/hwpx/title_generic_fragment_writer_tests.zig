//! 실제 수집한 source binding에 대한 generic identified-zero 회귀입니다.
const std = @import("std");
const writer = @import("character_style_run_xml.zig");
const identity = @import("title_fragment_identity.zig");
const Span = @import("character_style_paint.zig").Span;
const a = std.testing.allocator;
const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>AB</p:t></p:run></p:p></s:sec>";

const Fixture = struct {
    tree: @import("xml_part_tree.zig").Tree,
    sites: @import("text_sites.zig").Sites,
    spans: [2]Span,
    fn deinit(self: *Fixture, allocator: std.mem.Allocator) void {
        self.sites.deinit(allocator);
        self.tree.deinit(allocator);
    }
};

fn fixture(allocator: std.mem.Allocator) !Fixture {
    var tree = try @import("xml_part_tree.zig").parse(allocator, source, .section, 0, 0, .{});
    errdefer tree.deinit(allocator);
    var sites = try @import("text_sites.zig").collect(allocator, &tree, .{});
    errdefer sites.deinit(allocator);
    const value = try allocator.dupe(u8, "A");
    allocator.free(sites.items[0].text);
    sites.items[0].text = value;
    const run = tree.elements[sites.items[0].element_index].parent.?;
    return .{ .tree = tree, .sites = sites, .spans = .{
        .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = run, .char_shape_id = 7, .canonical_fragment = 10 },
        .{ .start_unit = 1, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = run, .char_shape_id = 9, .canonical_fragment = 11 },
    } };
}

fn exercise(allocator: std.mem.Allocator) !void {
    var input = try fixture(allocator);
    defer input.deinit(allocator);
    const output = try writer.write(allocator, &input.tree, &input.sites, &input.spans, 10000);
    defer allocator.free(output);
    try std.testing.expectEqualStrings("<p:run charPrIDRef='7'><p:t>A</p:t></p:run><p:run charPrIDRef='9'><p:t></p:t></p:run>", output);
    try std.testing.expectEqualStrings(source, input.tree.source);
    try std.testing.expectEqualStrings("A", input.sites.items[0].text);
}

test "generic canonical zero real text preserves both fragment styles" {
    try exercise(a);
    var input = try fixture(a);
    defer input.deinit(a);
    const output = try writer.write(a, &input.tree, &input.sites, &input.spans, 10000);
    defer a.free(output);
    try std.testing.expectError(error.LimitExceeded, writer.write(a, &input.tree, &input.sites, &input.spans, output.len - 1));
    // legacy 단독 empty site는 그대로 허용하고 부분 zero만 계속 거부합니다.
    var legacy = input.spans;
    for (&legacy) |*span| span.canonical_fragment = null;
    try std.testing.expectError(error.InvalidTextSites, writer.write(a, &input.tree, &input.sites, &legacy, 10000));
    input.spans[0].end_unit = 0;
    input.spans[1].start_unit = 0;
    const leading = try writer.write(a, &input.tree, &input.sites, &input.spans, 10000);
    defer a.free(leading);
    try std.testing.expectEqualStrings("<p:run charPrIDRef='7'><p:t></p:t></p:run><p:run charPrIDRef='9'><p:t>A</p:t></p:run>", leading);
    const empty_text = try a.dupe(u8, "");
    a.free(input.sites.items[0].text);
    input.sites.items[0].text = empty_text;
    input.spans[1].end_unit = 0;
    const empty = try writer.write(a, &input.tree, &input.sites, &input.spans, 10000);
    defer a.free(empty);
    try std.testing.expectEqualStrings("<p:run charPrIDRef='7'><p:t></p:t></p:run><p:run charPrIDRef='9'><p:t></p:t></p:run>", empty);
}

test "generic canonical zero rejects mixed duplicate reversed and typed identities" {
    var input = try fixture(a);
    defer input.deinit(a);
    const original = input.spans;
    input.spans[0].canonical_fragment = null;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &input.tree, &input.sites, &input.spans, 10000));
    input.spans = original;
    input.spans[1].canonical_fragment = null;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &input.tree, &input.sites, &input.spans, 10000));
    input.spans = original;
    input.spans[1].canonical_fragment = 10;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &input.tree, &input.sites, &input.spans, 10000));
    input.spans = original;
    input.spans[0].canonical_fragment = 12;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &input.tree, &input.sites, &input.spans, 10000));
    input.spans = original;
    input.spans[0].tab_element = 0;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &input.tree, &input.sites, &input.spans, 10000));
    input.spans = original;
    input.spans[0].anchor_element = 0;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &input.tree, &input.sites, &input.spans, 10000));
    for (&input.spans) |*span| span.canonical_fragment = null;
    input.spans[0].anchor_element = null;
    try std.testing.expect(!try identity.validateRun(&input.spans));
}

test "generic canonical zero IDs never replace source Unicode or inline control checks" {
    var input = try fixture(a);
    defer input.deinit(a);
    const old_start = input.sites.items[0].start;
    input.sites.items[0].start += 1;
    try std.testing.expectError(error.SourceBindingMismatch, writer.write(a, &input.tree, &input.sites, &input.spans, 10000));
    input.sites.items[0].start = old_start;
    const unicode = try a.dupe(u8, "A😀");
    a.free(input.sites.items[0].text);
    input.sites.items[0].text = unicode;
    input.spans[0].end_unit = 2;
    input.spans[1].start_unit = 2;
    input.spans[1].end_unit = 3;
    try std.testing.expectError(error.SplitSurrogatePair, writer.write(a, &input.tree, &input.sites, &input.spans, 10000));
    const typed = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:t>A<p:tab/>B</p:t></p:run></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, typed, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const run = tree.elements[sites.items[0].element_index].parent.?;
    const spans = [_]Span{
        .{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 0, .run_element = run, .char_shape_id = 7, .canonical_fragment = 0 },
        .{ .start_unit = 1, .end_unit = 2, .site_start_unit = 1, .site_index = 1, .run_element = run, .char_shape_id = 9, .canonical_fragment = 1 },
    };
    try std.testing.expectError(error.UnsupportedInlineControl, writer.write(a, &tree, &sites, &spans, 10000));
    try std.testing.expectEqualStrings(source, input.tree.source);
    try std.testing.expectEqualStrings(typed, tree.source);
    const controlled = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='7'><p:ctrl><p:fieldBegin id='1' type='CLICK_HERE' dirty='0'/></p:ctrl><p:t>AB</p:t><p:ctrl><p:fieldEnd beginIDRef='1'/></p:ctrl></p:run></p:p></s:sec>";
    var controlled_tree = try @import("xml_part_tree.zig").parse(a, controlled, .section, 0, 0, .{});
    defer controlled_tree.deinit(a);
    var controlled_sites = try @import("text_sites.zig").collect(a, &controlled_tree, .{});
    defer controlled_sites.deinit(a);
    const replacement = try a.dupe(u8, "A");
    a.free(controlled_sites.items[0].text);
    controlled_sites.items[0].text = replacement;
    const controlled_run = controlled_tree.elements[controlled_sites.items[0].element_index].parent.?;
    var controlled_spans = input.spans;
    controlled_spans[0].run_element = controlled_run;
    controlled_spans[0].end_unit = 1;
    controlled_spans[1].run_element = controlled_run;
    controlled_spans[1].start_unit = 1;
    controlled_spans[1].end_unit = 1;
    const saved = try writer.write(a, &controlled_tree, &controlled_sites, &controlled_spans, 10000);
    defer a.free(saved);
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:fieldBegin"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "<p:fieldEnd"));
    try std.testing.expectEqual(@as(usize, 1), std.mem.count(u8, saved, "dirty='0'"));
    try std.testing.expectEqualStrings(controlled, controlled_tree.source);
}

test "generic canonical zero every allocation failure retains caller source and sites" {
    try @import("../testing/allocation_failures.zig").check(exercise, .{});
}

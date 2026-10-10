//! Owned split text values with immutable site provenance; no XML mutation.
const std = @import("std");
const tree_mod = @import("xml_part_tree.zig");
const sites_mod = @import("text_sites.zig");
const scanner = @import("section_text.zig");
const positions_mod = @import("paragraph_text_positions.zig");
const text_edit = @import("text_site_edit.zig");

pub const Draft = struct {
    paragraph_element: usize,
    left: sites_mod.Sites,
    right: sites_mod.Sites,
    pub fn deinit(self: *Draft, a: std.mem.Allocator) void {
        self.left.deinit(a);
        self.right.deinit(a);
        self.* = undefined;
    }
};

/// Returned bindings identify original run/text templates, not newly indexed
/// XML nodes. The structural serializer must create and bind new paragraphs.
pub fn prepare(a: std.mem.Allocator, tree: *const tree_mod.Tree, sites: *const sites_mod.Sites, locations: []const scanner.Location, paragraph: usize, at: u32, end: u32, max_bytes: usize) !Draft {
    try @import("plain_paragraph_policy.zig").validate(tree, sites, locations, paragraph);
    const owner = try @import("paragraph_site_owner.zig").resolve(tree, sites, locations, paragraph);
    try @import("paragraph_structure_policy.zig").validate(a, tree, owner);
    const positions = try positions_mod.build(a, tree, sites, locations, paragraph);
    defer a.free(positions);
    try positions_mod.validateRange(positions, at, end);
    for (positions) |position| if (position.kind != .text) return error.UnsupportedInlineControl;
    return fromPositions(a, sites, positions, owner, at, end, max_bytes);
}

/// 개체 구조 저장 전용 초안 기반입니다. 기존 일반 분할 명령을 허용하지 않습니다.
pub fn prepareAnchored(a: std.mem.Allocator, tree: *const tree_mod.Tree, sites: *const sites_mod.Sites, locations: []const scanner.Location, paragraph: usize, at: u32, end: u32, max_bytes: usize) !Draft {
    const positions = try @import("anchor_paragraph_edit.zig").segments(a, tree, sites, locations, paragraph);
    defer a.free(positions);
    const owner = try @import("paragraph_site_owner.zig").resolve(tree, sites, locations, paragraph);
    try @import("paragraph_structure_policy.zig").validate(a, tree, owner);
    try positions_mod.validateRange(positions, at, end);
    return fromPositions(a, sites, positions, owner, at, end, max_bytes);
}

pub fn prepareCurrentAnchored(a: std.mem.Allocator, tree: *const tree_mod.Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, at: u32, end: u32, max_bytes: usize) !Draft {
    const positions = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(positions);
    try @import("paragraph_structure_policy.zig").validate(a, tree, paragraph.template_element);
    try positions_mod.validateRange(positions, at, end);
    return fromPositions(a, &paragraph.sites, positions, paragraph.template_element, at, end, max_bytes);
}

/// 위치와 원본 바인딩 검증은 호출자가 소유합니다. 보호 요소는 문자열로 복제하지 않습니다.
pub fn fromPositions(a: std.mem.Allocator, sites: *const sites_mod.Sites, positions: []const positions_mod.Segment, owner: usize, at: u32, end: u32, max_bytes: usize) !Draft {
    var count: usize = 0;
    for (positions) |position| if (position.kind == .text) {
        count += 1;
    };
    const left = try a.alloc(sites_mod.Site, count);
    var left_count: usize = 0;
    errdefer {
        for (left[0..left_count]) |site| a.free(site.text);
        a.free(left);
    }
    const right = try a.alloc(sites_mod.Site, count);
    var right_count: usize = 0;
    errdefer {
        for (right[0..right_count]) |site| a.free(site.text);
        a.free(right);
    }
    var bytes: usize = 0;
    for (positions) |position| {
        if (position.kind != .text) continue;
        const index = left_count;
        const original = sites.items[position.index];
        const left_units = @min(@as(usize, at), position.end_unit) -| position.start_unit;
        const right_units = @min(@max(@as(usize, end), position.start_unit), position.end_unit) - position.start_unit;
        const left_end = try text_edit.bytePosition(original.text, @intCast(left_units));
        const right_start = try text_edit.bytePosition(original.text, @intCast(right_units));
        const amount = std.math.add(usize, left_end, original.text.len - right_start) catch return error.LimitExceeded;
        if (amount > max_bytes -| bytes) return error.LimitExceeded;
        bytes += amount;
        left[index] = original;
        left[index].text = try a.dupe(u8, original.text[0..left_end]);
        left_count += 1;
        right[index] = original;
        right[index].text = try a.dupe(u8, original.text[right_start..]);
        right_count += 1;
    }
    return .{ .paragraph_element = owner, .left = .{ .items = left }, .right = .{ .items = right } };
}

test "HWPX split text draft preserves styled site templates and atomic allocation failures" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='7'><p:run charPrIDRef='3'><p:t>A😀B</p:t></p:run><p:run charPrIDRef='9'><p:t>끝C</p:t></p:run></p:p></s:sec>";
    var tree = try tree_mod.parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try sites_mod.collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var draft = try prepare(a, &tree, &sites, locations, 1, 3, 5, 100);
    defer draft.deinit(a);
    try std.testing.expectEqualStrings("A😀", draft.left.items[0].text);
    try std.testing.expectEqualStrings("", draft.left.items[1].text);
    try std.testing.expectEqualStrings("", draft.right.items[0].text);
    try std.testing.expectEqualStrings("C", draft.right.items[1].text);
    for (sites.items, draft.left.items, draft.right.items) |original, first, second| {
        try std.testing.expectEqual(original.element_index, first.element_index);
        try std.testing.expectEqual(original.element_index, second.element_index);
    }
    try std.testing.expectError(error.SplitSurrogatePair, prepare(a, &tree, &sites, locations, 1, 2, 2, 100));
    try std.testing.expectError(error.InvalidTextPosition, prepare(a, &tree, &sites, locations, 1, 5, 3, 100));
    try std.testing.expectError(error.LimitExceeded, prepare(a, &tree, &sites, locations, 1, 0, 0, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed_tree: *const tree_mod.Tree, borrowed_sites: *const sites_mod.Sites, borrowed_locations: []const scanner.Location) !void {
            var value = try prepare(allocator, borrowed_tree, borrowed_sites, borrowed_locations, 1, 3, 5, 100);
            defer value.deinit(allocator);
        }
    }.run, .{ &tree, &sites, locations });
    try std.testing.expectEqualStrings("A😀B", sites.items[0].text);
    try std.testing.expectEqualStrings("끝C", sites.items[1].text);
}

test "HWPX split text draft real fixtures preserve every selected site and source ZIP" {
    const a = std.testing.allocator;
    var accepted: usize = 0;
    for ([_][]const u8{ "charshape", "table", "table-bug" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwpx", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try @import("editor_session.zig").open(a, input, .{});
        defer session.deinit();
        for (session.sections) |*section| {
            for (section.first_paragraph..section.last_paragraph + 1) |paragraph| {
                @import("plain_paragraph_policy.zig").validate(&section.tree, &section.sites, section.locations, paragraph) catch |err| switch (err) {
                    error.UnsupportedParagraphControl, error.UnsupportedInlineControl, error.MissingTextSite => continue,
                    else => return err,
                };
                const positions = try positions_mod.build(a, &section.tree, &section.sites, section.locations, paragraph);
                defer a.free(positions);
                const end: u32 = @intCast(positions[positions.len - 1].end_unit);
                for ([_]u32{ 0, end / 2, end }) |at| {
                    var draft = prepare(a, &section.tree, &section.sites, section.locations, paragraph, at, at, 4_000_000) catch |err| switch (err) {
                        error.SplitSurrogatePair => continue,
                        else => return err,
                    };
                    defer draft.deinit(a);
                    var left_units: usize = 0;
                    for (positions, draft.left.items, draft.right.items) |position, left, right| {
                        const original = section.sites.items[position.index];
                        try std.testing.expectEqual(original.element_index, left.element_index);
                        try std.testing.expectEqual(original.element_index, right.element_index);
                        try std.testing.expectEqual(original.start, left.start);
                        try std.testing.expectEqual(original.end, right.end);
                        try std.testing.expectEqual(original.text.len, left.text.len + right.text.len);
                        try std.testing.expectEqualStrings(original.text[0..left.text.len], left.text);
                        try std.testing.expectEqualStrings(original.text[left.text.len..], right.text);
                        var offset: usize = 0;
                        while (try @import("../xml/scalars.zig").read(left.text, offset, .utf8)) |scalar| {
                            left_units += if (scalar.value > 0xffff) @as(usize, 2) else 1;
                            offset = scalar.end;
                        }
                    }
                    try std.testing.expectEqual(@as(usize, at), left_units);
                    accepted += 1;
                }
            }
        }
        const saved = try session.save();
        defer a.free(saved);
        try std.testing.expectEqualSlices(u8, input, saved);
    }
    try std.testing.expect(accepted > 100);
}

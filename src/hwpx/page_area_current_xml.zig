//! 원본 문단의 현재 텍스트와 소유 쪽 영역 좌표를 임시 XML로 저장합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Options = @import("text_sites.zig").Options;

pub fn requiresRelocation(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph) !bool {
    const owned = paragraph.page_area_positions orelse return false;
    try @import("page_area_current_validate.zig").validateForRelocation(a, tree, paragraph);
    if (paragraph.pieces != null) return true;
    const segments = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(segments);
    const actual = try @import("page_area_source_positions.zig").collect(a, tree, paragraph.template_element, segments, tree.elements.len);
    defer a.free(actual);
    for (actual, owned) |source, current| if (source.unit != current.unit) return true;
    return false;
}

pub fn write(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, options: Options, limit: usize) ![]u8 {
    if (paragraph.pieces != null) return @import("page_area_joined_xml.zig").write(a, tree, paragraph, options, limit);
    const owned = paragraph.page_area_positions orelse return error.MissingPageAreaPositions;
    try @import("page_area_current_validate.zig").validateForRelocation(a, tree, paragraph);
    const base = try @import("paragraph_split_xml.zig").writeOriginalAnchored(a, tree, paragraph.template_element, &paragraph.sites, options, limit);
    defer a.free(base);
    return relocateRendered(a, tree, paragraph, owned, base, options, limit);
}

/// 검증된 저장 어댑터가 만든 임시 문단의 선언 출처를 다시 연결합니다.
pub fn relocateRendered(a: std.mem.Allocator, tree: *const Tree, paragraph: *const Paragraph, owned: []const @import("page_area_position.zig").Position, base: []const u8, options: Options, limit: usize) ![]u8 {
    if (base.len > limit) return error.LimitExceeded;
    if (paragraph.template_element >= tree.elements.len) return error.SourceBindingMismatch;
    const node = tree.elements[paragraph.template_element];
    const temporary_limit = std.math.add(usize, tree.source.len, limit) catch return error.LimitExceeded;
    const wrapped = try @import("xml_source_writer.zig").write(a, tree.source, &.{.{ .start = node.start_tag.start, .end = node.end, .text = "", .serialized_xml = base }}, temporary_limit);
    defer a.free(wrapped);
    var rendered = try @import("xml_part_tree.zig").parse(a, wrapped, .section, tree.section_ordinal, tree.item_index, .{ .max_xml_bytes = temporary_limit });
    defer rendered.deinit(a);
    const actual = try @import("page_area_source_positions.zig").collect(a, &rendered, paragraph.template_element, &.{}, rendered.elements.len);
    defer a.free(actual);
    if (actual.len != owned.len) return error.SourceBindingMismatch;
    const moves = try a.dupe(@import("page_area_position.zig").Position, owned);
    defer a.free(moves);
    for (moves, actual) |*move, current| {
        if (!std.mem.eql(u8, tree.sourceOf(move.source_element), rendered.sourceOf(current.source_element))) return error.SourceBindingMismatch;
        move.source_element = current.source_element;
        move.source_control = current.source_control;
    }
    var sites = try @import("text_sites.zig").collect(a, &rendered, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &rendered, &sites, options);
    defer a.free(locations);
    var ordinal: ?usize = null;
    for (sites.items, locations) |site, location| {
        if (try @import("paragraph_site_owner.zig").ancestor(&rendered, site.element_index) == paragraph.template_element) {
            ordinal = location.paragraph_ordinal;
            break;
        }
    }
    const changed = try @import("page_area_moves_xml.zig").write(a, &rendered, &sites, locations, ordinal orelse return error.MissingTextSite, moves, temporary_limit);
    defer a.free(changed);
    var result = try @import("xml_part_tree.zig").parse(a, changed, .section, tree.section_ordinal, tree.item_index, .{ .max_xml_bytes = temporary_limit });
    defer result.deinit(a);
    const output = result.sourceOf(paragraph.template_element);
    if (output.len > limit) return error.LimitExceeded;
    return a.dupe(u8, output);
}

test "page area current XML saves real owner relocation with nested prior edits" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx", a, .limited(4000000));
    defer a.free(input);
    var session = try @import("editor_session.zig").open(a, input, .{});
    defer session.deinit();
    _ = try session.splice(0, 2, 0, 0, "AB😀CD");
    _ = try session.spliceAnchored(0, 3, 0, 0, "머리😀");
    _ = try session.spliceAnchored(0, 4, 0, 0, "꼬리<&");
    const section = &session.sections[0];
    const options = @import("editor_session.zig").siteOptions(session.options);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, options, &report);
    defer values.deinit(a);
    const owner = &values.paragraphs[1];
    try @import("page_area_materialize.zig").install(a, &section.tree, owner, 2);
    owner.page_area_positions.?[0].unit = 2;
    owner.page_area_positions.?[1].unit = 4;
    for (owner.page_area_positions.?) |*area| area.affinity = @import("page_area_position.zig").canonicalAffinity(area.unit);
    try std.testing.expect(try requiresRelocation(a, &section.tree, owner));
    const saved = try @import("paragraph_structure_save.zig").write(a, &section.tree, &values, options, &.{}, 4000000);
    defer a.free(saved);
    try std.testing.expect(std.mem.indexOf(u8, saved, "머리😀") != null);
    try std.testing.expect(std.mem.indexOf(u8, saved, "꼬리&lt;&amp;") != null);
    var restored = try @import("xml_part_tree.zig").parse(a, saved, .section, 0, 0, .{});
    defer restored.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &restored, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &restored, &sites, options);
    defer a.free(locations);
    const node = try @import("paragraph_site_owner.zig").resolve(&restored, &sites, locations, 2);
    const segments = try @import("anchor_text_positions.zig").build(a, &restored, &sites, locations, 2);
    defer a.free(segments);
    const actual = try @import("page_area_source_positions.zig").collect(a, &restored, node, segments, 2);
    defer a.free(actual);
    try std.testing.expectEqual(@as(u32, 2), actual[0].unit);
    try std.testing.expectEqual(@as(u32, 4), actual[1].unit);
    const fragment = try write(a, &section.tree, owner, options, 4000000);
    defer a.free(fragment);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, source: *const Tree, current: *const Paragraph, site_options: Options, expected: []const u8) !void {
            const output = try write(allocator, source, current, site_options, 4000000);
            defer allocator.free(output);
            try std.testing.expectEqualSlices(u8, expected, output);
        }
    }.run, .{ &section.tree, owner, options, fragment });
    try std.testing.expectEqual(@as(u32, 2), owner.page_area_positions.?[0].unit);
    try std.testing.expectEqual(@as(u32, 4), owner.page_area_positions.?[1].unit);
    owner.page_area_positions.?[0].unit = 5;
    try std.testing.expectError(error.InvalidPageAreaOrder, requiresRelocation(a, &section.tree, owner));
}

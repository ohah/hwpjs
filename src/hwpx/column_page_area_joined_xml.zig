//! 검증된 혼합 소유 후보를 조립하고 모든 선언을 한 거래로 이동합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;

pub fn writeCurrent(a: std.mem.Allocator, source: *const Tree, paragraph: *const Paragraph, current: *const @import("paragraph_structure_values.zig").Values, original: *const @import("paragraph_structure_values.zig").Values, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    const rendered = try write(a, source, paragraph, options, limit);
    defer a.free(rendered);
    const joined = paragraph.joined().?;
    return @import("paragraph_nested_save.zig").foldJoined(a, source, current, original, &joined, rendered, limit);
}

pub fn write(a: std.mem.Allocator, source: *const Tree, paragraph: *const Paragraph, options: @import("text_sites.zig").Options, limit: usize) ![]u8 {
    try @import("column_page_area_joined_validate.zig").validate(a, source, paragraph);
    const joined = paragraph.joined().?;
    const base = try @import("paragraph_joined_xml.zig").writeWithColumnPageAreas(a, source, &joined, options, limit);
    defer a.free(base);
    const root = source.elements[0];
    const close = root.end_tag orelse return error.InvalidPartKind;
    const wrapped = try std.mem.concat(a, u8, &.{ source.source[root.start_tag.start..root.start_tag.end], base, source.source[close.start..close.end] });
    defer a.free(wrapped);
    const temporary_limit = std.math.add(usize, wrapped.len, limit) catch return error.LimitExceeded;
    var tree = try @import("xml_part_tree.zig").parse(a, wrapped, .section, source.section_ordinal, source.item_index, .{ .max_xml_bytes = temporary_limit });
    defer tree.deinit(a);
    const owner = tree.elements[0].first_child orelse return error.SourceBindingMismatch;
    const columns = try @import("column_boundary_collect.zig").collect(a, &tree, owner, &.{}, .right, tree.elements.len);
    defer a.free(columns);
    const areas = try @import("page_area_source_positions.zig").collect(a, &tree, owner, &.{}, tree.elements.len);
    defer a.free(areas);
    if (columns.len != paragraph.column_boundaries.?.len or areas.len != paragraph.page_area_positions.?.len) return error.SourceBindingMismatch;
    var moves: std.ArrayList(@import("metadata_control_moves.zig").Move) = .empty;
    defer moves.deinit(a);
    for (columns, paragraph.column_boundaries.?) |after, before| try append(a, source, &tree, &moves, before.source_element, after.source_element, before.unit);
    for (areas, paragraph.page_area_positions.?) |after, before| try append(a, source, &tree, &moves, before.source_element, after.source_element, before.unit);
    std.mem.sort(@import("metadata_control_moves.zig").Move, moves.items, {}, struct {
        fn less(_: void, left: @import("metadata_control_moves.zig").Move, right: @import("metadata_control_moves.zig").Move) bool {
            return left.unit < right.unit or (left.unit == right.unit and left.source_element < right.source_element);
        }
    }.less);
    var sites = try @import("text_sites.zig").collect(a, &tree, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
    defer a.free(locations);
    var ordinal: ?usize = null;
    for (sites.items, locations) |site, location| if (try @import("paragraph_site_owner.zig").ancestor(&tree, site.element_index) == owner) {
        ordinal = location.paragraph_ordinal;
        break;
    };
    const moved = try @import("metadata_control_moves.zig").write(a, &tree, &sites, locations, ordinal orelse return error.MissingTextSite, moves.items, temporary_limit, @import("column_page_area_text_xml.zig").writeManyFrom);
    defer a.free(moved);
    var result = try @import("xml_part_tree.zig").parse(a, moved, .section, source.section_ordinal, source.item_index, .{ .max_xml_bytes = temporary_limit });
    defer result.deinit(a);
    const output = result.sourceOf(owner);
    if (output.len > limit) return error.LimitExceeded;
    return a.dupe(u8, output);
}

fn append(a: std.mem.Allocator, source: *const Tree, tree: *const Tree, moves: *std.ArrayList(@import("metadata_control_moves.zig").Move), original: usize, current: usize, unit: u32) !void {
    if (!std.mem.eql(u8, source.sourceOf(original), tree.sourceOf(current))) return error.SourceBindingMismatch;
    try moves.append(a, .{ .source_element = current, .source_control = try @import("column_page_area_text_xml.zig").control(tree, current), .unit = unit });
}

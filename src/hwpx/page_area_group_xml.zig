//! 검증된 원본/생성 문단 그룹의 본문과 쪽 영역 귀속을 임시 XML로 조립합니다.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Paragraph = @import("paragraph_structure_values.zig").Paragraph;
const Options = @import("text_sites.zig").Options;

/// 그룹 안에서 이동한 선언에도 기존 중첩 문단 저장 규칙을 적용합니다.
pub fn writeCurrent(a: std.mem.Allocator, source: *const Tree, paragraphs: []const Paragraph, current: *const @import("paragraph_structure_values.zig").Values, original: *const @import("paragraph_structure_values.zig").Values, options: Options, limit: usize) ![]u8 {
    const rendered = try write(a, source, paragraphs, options, limit);
    defer a.free(rendered);
    return @import("paragraph_nested_save.zig").foldOptions(a, source, current, original, paragraphs[0].template_element, rendered, options, limit);
}

pub fn write(a: std.mem.Allocator, source: *const Tree, paragraphs: []const Paragraph, options: Options, limit: usize) ![]u8 {
    return writeMode(a, source, paragraphs, options, limit, false);
}

pub fn writeWithColumnPageAreas(a: std.mem.Allocator, source: *const Tree, paragraphs: []const Paragraph, options: Options, limit: usize) ![]u8 {
    return writeMode(a, source, paragraphs, options, limit, true);
}

pub fn writeCurrentWithColumnPageAreas(a: std.mem.Allocator, source: *const Tree, paragraphs: []const Paragraph, current: *const @import("paragraph_structure_values.zig").Values, original: *const @import("paragraph_structure_values.zig").Values, options: Options, limit: usize) ![]u8 {
    const rendered = try writeWithColumnPageAreas(a, source, paragraphs, options, limit);
    defer a.free(rendered);
    return @import("paragraph_nested_save.zig").foldJoinedOptions(a, source, current, original, &paragraphs[0].joined().?, rendered, options, limit);
}

fn writeMode(a: std.mem.Allocator, source: *const Tree, paragraphs: []const Paragraph, options: Options, limit: usize, mixed: bool) ![]u8 {
    if (mixed) try @import("column_page_area_group_validate.zig").validate(a, source, paragraphs) else try @import("page_area_group_validate.zig").validate(a, source, paragraphs);
    var base: std.ArrayList(u8) = .empty;
    defer base.deinit(a);
    for (paragraphs, 0..) |*paragraph, index| {
        const bytes = if (mixed) mixed_bytes: {
            const joined = paragraph.joined().?;
            if (index == 0) break :mixed_bytes try @import("paragraph_joined_xml.zig").writeWithColumnPageAreas(a, source, &joined, options, limit -| base.items.len);
            break :mixed_bytes try @import("paragraph_joined_xml.zig").writeColumnPageAreaContinuation(a, source, &paragraphs[0].joined().?, &joined, paragraph.generated_id.?, options, limit -| base.items.len);
        } else if (paragraph.joined()) |joined|
            try @import("paragraph_joined_xml.zig").write(a, source, &joined, options, limit -| base.items.len)
        else
            try @import("paragraph_split_xml.zig").writeSitesWithOptions(a, source, paragraph.template_element, &paragraph.sites, options, index != 0, paragraph.generated_id orelse 0, limit -| base.items.len);
        defer a.free(bytes);
        const formatted = if (paragraph.paragraph_shape_id) |id| try @import("paragraph_format_write.zig").writeCurrent(a, source, paragraph.template_element, bytes, id, limit -| base.items.len) else null;
        defer if (formatted) |value| a.free(value);
        const rendered = formatted orelse bytes;
        if (rendered.len > limit -| base.items.len) return error.LimitExceeded;
        try base.appendSlice(a, rendered);
    }
    const root = source.elements[0];
    const ending = root.end_tag orelse return error.InvalidPartKind;
    const wrapper = try std.mem.concat(a, u8, &.{ source.source[root.start_tag.start..root.start_tag.end], base.items, source.source[ending.start..ending.end] });
    defer a.free(wrapper);
    const temporary_limit = std.math.add(usize, wrapper.len, limit) catch return error.LimitExceeded;
    var tree = try @import("xml_part_tree.zig").parse(a, wrapper, .section, source.section_ordinal, source.item_index, .{ .max_xml_bytes = temporary_limit });
    defer tree.deinit(a);
    const owners = try a.alloc(usize, paragraphs.len);
    defer a.free(owners);
    var count: usize = 0;
    for (tree.elements, 0..) |element, index| {
        if (!element.is(@import("document_xml.zig").paragraph_uri, "p") or element.parent != 0) continue;
        if (count >= owners.len) return error.SourceBindingMismatch;
        owners[count] = index;
        count += 1;
    }
    if (count != owners.len) return error.SourceBindingMismatch;
    const inventory = try @import("page_area_source_positions.zig").collect(a, &tree, owners[0], &.{}, tree.elements.len);
    defer a.free(inventory);
    const original = if (mixed) try collectJoinedAreas(a, source, &paragraphs[0]) else try @import("page_area_source_positions.zig").collect(a, source, paragraphs[0].template_element, &.{}, source.elements.len);
    defer a.free(original);
    if (inventory.len != original.len) return error.SourceBindingMismatch;
    var mapping: std.AutoHashMapUnmanaged(usize, usize) = .empty;
    defer mapping.deinit(a);
    for (original, inventory) |before, after| {
        if (!std.mem.eql(u8, source.sourceOf(before.source_element), tree.sourceOf(after.source_element))) return error.SourceBindingMismatch;
        try mapping.put(a, before.source_element, after.source_element);
    }
    if (mixed) {
        const columns = try @import("column_boundary_collect.zig").collect(a, &tree, owners[0], &.{}, .right, tree.elements.len);
        defer a.free(columns);
        const source_columns = try @import("column_boundary_joined_collect.zig").collect(a, source, &paragraphs[0].joined().?, source.elements.len);
        defer a.free(source_columns);
        if (columns.len != source_columns.len) return error.SourceBindingMismatch;
        for (source_columns, columns) |before, after| {
            if (!std.mem.eql(u8, source.sourceOf(before.source_element), tree.sourceOf(after.source_element))) return error.SourceBindingMismatch;
            try mapping.put(a, before.source_element, after.source_element);
        }
    }
    var sites = try @import("text_sites.zig").collect(a, &tree, options);
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, options);
    defer a.free(locations);
    const common = @import("metadata_control_moves.zig");
    var requests: std.ArrayList(common.Request) = .empty;
    defer requests.deinit(a);
    for (paragraphs, owners) |paragraph, owner| {
        var ordinal: ?usize = null;
        for (sites.items, locations) |site, location| {
            if (try @import("paragraph_site_owner.zig").ancestor(&tree, site.element_index) == owner) {
                ordinal = location.paragraph_ordinal;
                break;
            }
        }
        for (paragraph.page_area_positions.?) |area| {
            const element = mapping.get(area.source_element) orelse return error.SourceBindingMismatch;
            const control = try @import("page_area_text_xml.zig").control(&tree, element);
            try requests.append(a, .{ .paragraph = ordinal orelse return error.MissingTextSite, .move = .{ .source_element = element, .source_control = control, .unit = area.unit } });
        }
        if (mixed) for (paragraph.column_boundaries.?) |column| {
            const element = mapping.get(column.source_element) orelse return error.SourceBindingMismatch;
            try requests.append(a, .{ .paragraph = ordinal orelse return error.MissingTextSite, .move = .{ .source_element = element, .source_control = try @import("column_boundary_xml.zig").control(&tree, element), .unit = column.unit } });
        };
    }
    if (mixed) std.mem.sort(common.Request, requests.items, {}, struct {
        fn less(_: void, left: common.Request, right: common.Request) bool {
            if (left.paragraph != right.paragraph) return left.paragraph < right.paragraph;
            if (left.move.unit != right.move.unit) return left.move.unit < right.move.unit;
            return left.move.source_element < right.move.source_element;
        }
    }.less);
    const moved = if (mixed) try common.writeGroup(a, &tree, &sites, locations, owners[0], owners, requests.items, temporary_limit, @import("column_page_area_text_xml.zig").writeManyFrom) else try common.writeGroup(a, &tree, &sites, locations, owners[0], owners, requests.items, temporary_limit, @import("page_area_text_xml.zig").writeManyFrom);
    defer a.free(moved);
    var result = try @import("xml_part_tree.zig").parse(a, moved, .section, source.section_ordinal, source.item_index, .{ .max_xml_bytes = temporary_limit });
    defer result.deinit(a);
    const last = result.elements[0].end_tag orelse return error.InvalidPartKind;
    const output = result.source[result.elements[0].start_tag.end..last.start];
    if (output.len > limit) return error.LimitExceeded;
    return a.dupe(u8, output);
}

fn collectJoinedAreas(a: std.mem.Allocator, source: *const Tree, paragraph: *const Paragraph) ![]@import("page_area_position.zig").Position {
    var output: std.ArrayList(@import("page_area_position.zig").Position) = .empty;
    defer output.deinit(a);
    for (paragraph.pieces.?) |piece| {
        const local = try @import("page_area_source_positions.zig").collect(a, source, piece.template_element, &.{}, source.elements.len);
        defer a.free(local);
        try output.appendSlice(a, local);
    }
    return output.toOwnedSlice(a);
}

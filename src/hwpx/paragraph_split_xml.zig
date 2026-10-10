//! Transient paragraph serialization from current split values and raw templates.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Draft = @import("paragraph_split_text.zig").Draft;
const writer = @import("xml_source_writer.zig");
const uri = @import("document_xml.zig").paragraph_uri;

/// Caller owns topology, ID collision checks and structural metadata permission.
/// No generated XML is cached as editable state.
pub fn write(a: std.mem.Allocator, tree: *const Tree, draft: *const Draft, continuation: bool, id: u32, max_bytes: usize) ![]u8 {
    return writeSites(a, tree, draft.paragraph_element, if (continuation) &draft.right else &draft.left, continuation, id, max_bytes);
}

/// Serialize an authoritative current paragraph, including a repeatedly split
/// generated paragraph, without manufacturing a two-sided split draft.
pub fn writeSites(a: std.mem.Allocator, tree: *const Tree, paragraph_element: usize, sites: *const @import("text_sites.zig").Sites, continuation: bool, id: u32, max_bytes: usize) ![]u8 {
    return writeSitesWithOptions(a, tree, paragraph_element, sites, .{}, continuation, id, max_bytes);
}

pub fn writeSitesWithOptions(a: std.mem.Allocator, tree: *const Tree, paragraph_element: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, continuation: bool, id: u32, max_bytes: usize) ![]u8 {
    return writeMode(a, tree, paragraph_element, sites, options, continuation, id, max_bytes, null);
}
pub fn writeCurrentTitles(a: std.mem.Allocator, tree: *const Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    return writeModePolicyTitles(a, tree, paragraph.template_element, &paragraph.sites, options, paragraph.generated_id != null, paragraph.generated_id orelse 0, max_bytes, null, false, false, null, &.{}, paragraph.title_positions);
}

pub fn writeSitesWithTabs(a: std.mem.Allocator, tree: *const Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    const locations = try @import("paragraph_structure_locations.zig").build(a, tree, paragraph);
    defer a.free(locations);
    try @import("plain_paragraph_policy.zig").validateWithTabs(tree, &paragraph.sites, locations, 1, true);
    return writeModePolicyTitles(a, tree, paragraph.template_element, &paragraph.sites, options, paragraph.generated_id != null, paragraph.generated_id orelse 0, max_bytes, &.{}, false, false, null, &.{}, paragraph.title_positions);
}

/// Serialize an original paragraph with all source anchors retained in place.
/// This does not authorize generated topology or moved anchor ownership.
pub fn writeOriginalAnchored(a: std.mem.Allocator, tree: *const Tree, paragraph_element: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    return writeModePolicy(a, tree, paragraph_element, sites, options, false, 0, max_bytes, &.{}, true, false, null, &.{});
}

/// Internal column writer permission after whole ownership/partition validation.
pub fn writeColumnStructure(a: std.mem.Allocator, tree: *const Tree, paragraph_element: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    return writeModePolicy(a, tree, paragraph_element, sites, options, false, 0, max_bytes, null, false, true, null, &.{});
}

/// 원본 개체 귀속을 내부에서 계산합니다. 호출자는 구역 조립·ID 권한을 소유합니다.
pub fn writeAnchored(a: std.mem.Allocator, tree: *const Tree, current: *const @import("text_sites.zig").Sites, locations: []const @import("section_text.zig").Location, options: @import("text_sites.zig").Options, paragraph: usize, start: u32, end: u32, continuation: bool, id: u32, max_bytes: usize) ![]u8 {
    var draft = try @import("paragraph_split_text.zig").prepareAnchored(a, tree, current, locations, paragraph, start, end, options.max_text_bytes);
    defer draft.deinit(a);
    const moves = try @import("anchor_split_plan.zig").build(a, tree, current, locations, paragraph, start, end);
    defer a.free(moves);
    return writeMode(a, tree, draft.paragraph_element, if (continuation) &draft.right else &draft.left, options, continuation, id, max_bytes, moves);
}

pub fn writeProtected(a: std.mem.Allocator, tree: *const Tree, paragraph: *const @import("paragraph_structure_values.zig").Paragraph, options: @import("text_sites.zig").Options, max_bytes: usize) ![]u8 {
    const owned = paragraph.protected_positions orelse return error.MissingProtectedPositions;
    if (paragraph.pieces != null or paragraph.character_styles != null) return error.UnsupportedAnchoredStructure;
    const checked = try @import("paragraph_protected_positions.zig").build(a, tree, paragraph);
    defer a.free(checked);
    var inherited = paragraph.*;
    inherited.protected_positions = null;
    const original = try @import("paragraph_protected_positions.zig").build(a, tree, &inherited);
    defer a.free(original);
    var retained: std.AutoHashMapUnmanaged(usize, void) = .empty;
    defer retained.deinit(a);
    for (owned) |item| try retained.put(a, item.element_index, {});
    var moves: std.ArrayList(@import("anchor_split_plan.zig").Move) = .empty;
    defer moves.deinit(a);
    const continuation = paragraph.generated_id != null;
    for (original) |segment| {
        if (segment.kind == .text) continue;
        const keep = retained.contains(segment.index);
        try moves.append(a, .{ .element_index = segment.index, .kind = if (segment.kind == .anchor) .anchor else .tab, .side = if (keep == continuation) .right else .left, .unit = segment.start_unit });
    }
    return writeModePolicyTitles(a, tree, paragraph.template_element, &paragraph.sites, options, continuation, paragraph.generated_id orelse 0, max_bytes, moves.items, false, false, null, &.{}, paragraph.title_positions);
}

fn writeMode(a: std.mem.Allocator, tree: *const Tree, paragraph_element: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, continuation: bool, id: u32, max_bytes: usize, moves: ?[]const @import("anchor_split_plan.zig").Move) ![]u8 {
    return writeModePolicy(a, tree, paragraph_element, sites, options, continuation, id, max_bytes, moves, false, false, null, &.{});
}

/// 필드 연결·좌표 계획의 검증은 호출자가 소유하며 ctrl 식별은 내부에서 검사합니다.
pub fn writeFields(a: std.mem.Allocator, tree: *const Tree, paragraph_element: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, continuation: bool, id: u32, planned: []const @import("field_split_plan.zig").Move, max_bytes: usize) ![]u8 {
    return writeFieldsDirty(a, tree, paragraph_element, sites, options, continuation, id, planned, &.{}, max_bytes);
}

pub fn writeFieldsDirty(a: std.mem.Allocator, tree: *const Tree, paragraph_element: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, continuation: bool, id: u32, planned: []const @import("field_split_plan.zig").Move, fields: []const @import("text_sites_save.zig").FieldDirty, max_bytes: usize) ![]u8 {
    try @import("field_split_controls.zig").validate(a, tree, paragraph_element, planned);
    return writeModePolicy(a, tree, paragraph_element, sites, options, continuation, id, max_bytes, null, false, false, planned, fields);
}

fn writeModePolicy(a: std.mem.Allocator, tree: *const Tree, paragraph_element: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, continuation: bool, id: u32, max_bytes: usize, moves: ?[]const @import("anchor_split_plan.zig").Move, retain_geometry: bool, allow_column_sites: bool, field_moves: ?[]const @import("field_split_plan.zig").Move, fields: []const @import("text_sites_save.zig").FieldDirty) ![]u8 {
    return writeModePolicyTitles(a, tree, paragraph_element, sites, options, continuation, id, max_bytes, moves, retain_geometry, allow_column_sites, field_moves, fields, null);
}
fn writeModePolicyTitles(a: std.mem.Allocator, tree: *const Tree, paragraph_element: usize, sites: *const @import("text_sites.zig").Sites, options: @import("text_sites.zig").Options, continuation: bool, id: u32, max_bytes: usize, moves: ?[]const @import("anchor_split_plan.zig").Move, retain_geometry: bool, allow_column_sites: bool, field_moves: ?[]const @import("field_split_plan.zig").Move, fields: []const @import("text_sites_save.zig").FieldDirty, titles: ?[]const @import("title_mark_position.zig").Position) ![]u8 {
    if (paragraph_element >= tree.elements.len) return error.InvalidParagraphElement;
    const paragraph = tree.elements[paragraph_element];
    if (!paragraph.is(uri, "p") or paragraph.end_tag == null) return error.InvalidParagraphElement;
    try @import("paragraph_structure_policy.zig").validate(a, tree, paragraph_element);
    const base = paragraph.start_tag.start;
    const raw = tree.source[base..paragraph.end];
    var changes: std.ArrayList(writer.Change) = .empty;
    defer changes.deinit(a);
    var dirty_tags: std.ArrayList([]u8) = .empty;
    defer {
        for (dirty_tags.items) |bytes| a.free(bytes);
        dirty_tags.deinit(a);
    }
    for (fields, 0..) |field, index| {
        for (fields[0..index]) |previous| if (previous.element_index == field.element_index) return error.DuplicateFieldDirty;
        const planned = field_moves orelse return error.InvalidFieldElement;
        var retained = false;
        for (planned) |move| if (move.position.element_index == field.element_index and move.position.kind == .begin and (move.side == .right) == continuation) {
            retained = true;
        };
        if (!retained) continue;
        const bytes = try @import("field_dirty_tag.zig").write(a, tree, field.element_index, field.dirty, max_bytes);
        dirty_tags.append(a, bytes) catch |err| {
            a.free(bytes);
            return err;
        };
        const span = tree.elements[field.element_index].start_tag;
        if (!std.mem.eql(u8, bytes, tree.source[span.start..span.end])) try changes.append(a, .{ .start = span.start - base, .end = span.end - base, .text = "", .start_tag = bytes });
    }
    const tag = if (continuation) try @import("paragraph_continuation_tag.zig").write(a, tree, paragraph_element, id, max_bytes) else null;
    defer if (tag) |bytes| a.free(bytes);
    if (tag) |bytes| try changes.append(a, .{ .start = 0, .end = paragraph.start_tag.end - base, .text = "", .start_tag = bytes });
    var original = try @import("text_sites.zig").collect(a, tree, options);
    defer original.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, tree, &original, options);
    defer a.free(locations);
    var ordinal: ?usize = null;
    for (original.items, locations) |site, location| {
        if (try @import("paragraph_site_owner.zig").ancestor(tree, site.element_index) != paragraph_element) continue;
        if (ordinal) |previous| {
            if (previous != location.paragraph_ordinal) return error.SourceBindingMismatch;
        } else ordinal = location.paragraph_ordinal;
    }
    const selected_ordinal = ordinal orelse return error.MissingTextSite;
    if (field_moves != null) try @import("plain_paragraph_policy.zig").validateForCharacterFormat(tree, &original, locations, selected_ordinal) else if (moves != null) try @import("plain_paragraph_policy.zig").validateWithAnchors(tree, &original, locations, selected_ordinal) else try @import("plain_paragraph_policy.zig").validate(tree, &original, locations, selected_ordinal);
    if (try @import("paragraph_site_owner.zig").resolve(tree, &original, locations, selected_ordinal) != paragraph_element) return error.SourceBindingMismatch;
    var selected_count: usize = 0;
    for (original.items, locations) |before, location| {
        if (location.paragraph_ordinal != selected_ordinal) continue;
        if (selected_count >= sites.items.len) return error.InvalidTextSites;
        var match: ?@import("text_sites.zig").Site = null;
        for (sites.items) |site| if (site.element_index == before.element_index and site.start == before.start) {
            if (match != null) return error.SourceBindingMismatch;
            match = site;
        };
        const after = match orelse return error.SourceBindingMismatch;
        if (before.element_index != after.element_index or before.start != after.start or before.end != after.end or before.empty_element != after.empty_element or before.missing_text != after.missing_text or before.anchor_boundary != after.anchor_boundary) return error.SourceBindingMismatch;
        selected_count += 1;
    }
    for (sites.items, 0..) |site, index| {
        var bound = false;
        for (original.items, locations) |before, location| {
            if (location.paragraph_ordinal == selected_ordinal and before.element_index == site.element_index and before.start == site.start) {
                bound = true;
                break;
            }
        }
        if (bound) continue;
        if ((!continuation and !allow_column_sites) or !@import("continuation_empty_run.zig").valid(tree, paragraph_element, site)) return error.SourceBindingMismatch;
        for (sites.items[0..index]) |prior| if (prior.element_index == site.element_index and prior.start == site.start) return error.SourceBindingMismatch;
        selected_count += 1;
    }
    if (selected_count != sites.items.len) return error.InvalidTextSites;
    for (sites.items) |site| {
        if (retain_geometry) {
            var unchanged = false;
            var matched = false;
            for (original.items) |before| {
                if (before.element_index == site.element_index and before.start == site.start) {
                    unchanged = try @import("text_sites_save.zig").siteChange(tree, before, site) == null;
                    matched = true;
                    break;
                }
            }
            if (!matched) return error.SourceBindingMismatch;
            if (unchanged) continue;
        }
        if (site.element_index >= tree.elements.len or site.start < paragraph.start_tag.end or site.end > paragraph.end_tag.?.start or site.start > site.end) return error.InvalidTextSites;
        const element = tree.elements[site.element_index];
        if (element.start_tag.start < base or element.end > paragraph.end) return error.SourceBindingMismatch;
        // 아직 입력하지 않은 가상 경계는 XML 수정이 아닙니다.
        // 실제 빈 hp:t와 같은 위치일 수 있으므로 빈 삽입 patch를 만들지 않습니다.
        if (site.anchor_boundary and site.text.len == 0) continue;
        if (site.start == site.end and site.text.len == 0 and !site.missing_text and !site.empty_element) continue;
        if (moves != null and site.missing_text and site.text.len == 0) continue;
        if (moves != null and site.start == site.end and site.text.len == 0) continue;
        try changes.append(a, .{
            .start = site.start - base,
            .end = site.end - base,
            .text = site.text,
            .expand_empty_element = site.empty_element,
            .run_opening = if (site.missing_text) .{ .start = element.start_tag.start - base, .end = element.start_tag.end - base } else null,
        });
    }
    if (moves) |planned| for (planned) |move| {
        if ((move.side == .right) == continuation) continue;
        const element = tree.elements[move.element_index];
        try changes.append(a, .{ .start = element.start_tag.start - base, .end = element.end - base, .text = "" });
    };
    if (field_moves) |planned| for (planned) |move| {
        if ((move.side == .right) == continuation) continue;
        const control = tree.elements[tree.elements[move.position.element_index].parent.?];
        try changes.append(a, .{ .start = control.start_tag.start - base, .end = control.end - base, .text = "" });
    };
    var removed_end: usize = base;
    for (tree.elements, 0..) |element, element_index| {
        if (retain_geometry and element.is(uri, "linesegarray")) continue;
        if (element.start_tag.start < paragraph.start_tag.end or element.end > paragraph.end_tag.?.start or element.start_tag.start < removed_end) continue;
        const direct_parent = element.parent orelse continue;
        if (direct_parent != paragraph_element and !(tree.elements[direct_parent].is(uri, "run") and tree.elements[direct_parent].parent == paragraph_element)) continue;
        if (moves != null or field_moves != null) {
            if (moves != null and @import("run_anchor.zig").kind(tree, element_index) != null) continue;
            if (field_moves != null and @import("retained_field_marker.zig").supported(tree, element_index)) continue;
            const parent = element.parent orelse continue;
            if (parent != paragraph_element and !(tree.elements[parent].is(uri, "run") and tree.elements[parent].parent == paragraph_element)) continue;
        }
        // Original line positions are not valid for either split paragraph.
        // Section/control metadata remains only on the original left paragraph.
        if (!@import("paragraph_continuation_metadata.zig").remove(element, continuation)) continue;
        try changes.append(a, .{ .start = element.start_tag.start - base, .end = element.end - base, .text = "" });
        removed_end = element.end;
    }
    const title_owner: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = paragraph_element, .source_ordinal = null, .sites = sites.*, .title_positions = if (titles) |items| @constCast(items) else null };
    try @import("title_mark_source_changes.zig").append(a, tree, &title_owner, &changes);
    std.mem.sort(writer.Change, changes.items, {}, struct {
        fn less(_: void, left: writer.Change, right: writer.Change) bool {
            if (left.start == right.start) return left.end < right.end;
            return left.start < right.start;
        }
    }.less);
    if (moves != null or titles != null) return @import("paragraph_boundary_changes.zig").write(a, raw, changes.items, max_bytes);
    return writer.write(a, raw, changes.items, max_bytes);
}

test "HWPX split XML preserves runs escapes text and does not duplicate section metadata" {
    const a = std.testing.allocator;
    const source = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='7' pageBreak='1'><p:run charPrIDRef='3'><p:secPr/><p:t>A&amp;B</p:t></p:run><p:run charPrIDRef='9'><p:t>C</p:t></p:run><p:linesegarray/></p:p></s:sec>";
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var draft = try @import("paragraph_split_text.zig").prepare(a, &tree, &sites, locations, 1, 2, 2, 1000);
    defer draft.deinit(a);
    const left = try write(a, &tree, &draft, false, 0, 1000);
    defer a.free(left);
    const right = try write(a, &tree, &draft, true, 8, 1000);
    defer a.free(right);
    try std.testing.expectEqualStrings("<p:p id='7' pageBreak='1'><p:run charPrIDRef='3'><p:secPr/><p:t>A&amp;</p:t></p:run><p:run charPrIDRef='9'><p:t></p:t></p:run></p:p>", left);
    try std.testing.expectEqualStrings("<p:p id='8' pageBreak='0'><p:run charPrIDRef='3'><p:t>B</p:t></p:run><p:run charPrIDRef='9'><p:t>C</p:t></p:run></p:p>", right);
    const owner = tree.elements[draft.paragraph_element];
    const complete = try std.fmt.allocPrint(a, "{s}{s}{s}{s}", .{ tree.source[0..owner.start_tag.start], left, right, tree.source[owner.end..] });
    defer a.free(complete);
    var reopened = try @import("xml_part_tree.zig").parse(a, complete, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var reopened_sites = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer reopened_sites.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), reopened_sites.items.len);
    for (reopened_sites.items, [_][]const u8{ "A&", "", "B", "C" }) |site, expected| try std.testing.expectEqualStrings(expected, site.text);
    var paragraph_count: usize = 0;
    var section_count: usize = 0;
    for (reopened.elements) |element| {
        if (element.is(uri, "p")) paragraph_count += 1;
        if (element.is(uri, "secPr")) section_count += 1;
        try std.testing.expect(!element.is(uri, "linesegarray"));
    }
    try std.testing.expectEqual(@as(usize, 2), paragraph_count);
    try std.testing.expectEqual(@as(usize, 1), section_count);
    try std.testing.expectEqualStrings(source, tree.source);
    const bound_start = draft.right.items[0].start;
    draft.right.items[0].start += 1;
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, &draft, true, 8, 1000));
    draft.right.items[0].start = bound_start;
    draft.right.items[0].empty_element = !draft.right.items[0].empty_element;
    try std.testing.expectError(error.SourceBindingMismatch, write(a, &tree, &draft, true, 8, 1000));
    draft.right.items[0].empty_element = !draft.right.items[0].empty_element;
    try std.testing.expectError(error.LimitExceeded, write(a, &tree, &draft, true, 8, 1));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, borrowed_tree: *const Tree, current: *const Draft) !void {
            const output = try write(allocator, borrowed_tree, current, true, 8, 1000);
            defer allocator.free(output);
        }
    }.run, .{ &tree, &draft });
}

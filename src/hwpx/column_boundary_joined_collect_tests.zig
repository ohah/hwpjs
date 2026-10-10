//! Joined inventory is a prerequisite, not public cross-original merge support.
const std = @import("std");
const Tree = @import("xml_part_tree.zig").Tree;
const Joined = @import("paragraph_joined_values.zig").Joined;
const collect = @import("column_boundary_joined_collect.zig").collect;

test "joined column inventory keeps source piece order and global Unicode coordinates" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:ctrl><p:colPr colCount='1'/></p:ctrl><p:t>A😀</p:t></p:run></p:p><p:p id='2'><p:run><p:ctrl><p:colPr colCount='2'/></p:ctrl><p:t>B</p:t></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &sites, .{});
    defer a.free(locations);
    var report: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &tree, &sites, locations, .{}, &report);
    defer values.deinit(a);
    var pieces = [_]@import("paragraph_joined_values.zig").Piece{
        .{ .template_element = values.paragraphs[0].template_element, .source_ordinal = 1, .generated_id = null, .first_site = 0, .site_count = 1 },
        .{ .template_element = values.paragraphs[1].template_element, .source_ordinal = 2, .generated_id = null, .first_site = 1, .site_count = 1 },
    };
    const joined: Joined = .{ .pieces = &pieces, .sites = sites };
    var owned_paragraph: @import("paragraph_structure_values.zig").Paragraph = .{
        .template_element = pieces[0].template_element,
        .source_ordinal = 1,
        .sites = try sites.clone(a),
        .pieces = null,
    };
    defer owned_paragraph.deinit(a);
    owned_paragraph.pieces = try a.dupe(@import("paragraph_joined_values.zig").Piece, &pieces);
    const install = @import("column_boundary_joined_materialize.zig").install;
    try install(a, &tree, &owned_paragraph, 10);
    const current_ptr = owned_paragraph.column_boundaries.?.ptr;
    try install(a, &tree, &owned_paragraph, 0);
    try std.testing.expectEqual(current_ptr, owned_paragraph.column_boundaries.?.ptr);
    const written = try @import("column_boundary_joined_xml.zig").write(a, &tree, &owned_paragraph, .{}, 10000);
    defer a.free(written);
    try std.testing.expect(std.mem.indexOf(u8, written, "colCount='1'") != null);
    try std.testing.expect(std.mem.indexOf(u8, written, "colCount='2'") != null);
    try std.testing.expect(std.mem.indexOf(u8, written, "A😀") != null);
    try std.testing.expect(std.mem.indexOf(u8, written, ">B</p:t>") != null);
    var cloned_paragraph = try owned_paragraph.clone(a);
    defer cloned_paragraph.deinit(a);
    cloned_paragraph.column_boundaries.?[1].unit = 4;
    const relocated = try @import("column_boundary_joined_xml.zig").write(a, &tree, &cloned_paragraph, .{}, 10000);
    defer a.free(relocated);
    try std.testing.expect(std.mem.indexOf(u8, relocated, "colCount='2'") != null);
    const relocated_wrapper = try std.mem.concat(a, u8, &.{ "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'>", relocated, "</s:sec>" });
    defer a.free(relocated_wrapper);
    var reopened = try @import("xml_part_tree.zig").parse(a, relocated_wrapper, .section, 0, 0, .{});
    defer reopened.deinit(a);
    var reopened_sites = try @import("text_sites.zig").collect(a, &reopened, .{});
    defer reopened_sites.deinit(a);
    const reopened_locations = try @import("text_site_locations.zig").build(a, &reopened, &reopened_sites, .{});
    defer a.free(reopened_locations);
    const reopened_positions = try @import("anchor_text_positions.zig").build(a, &reopened, &reopened_sites, reopened_locations, 1);
    defer a.free(reopened_positions);
    const relocated_columns = try @import("column_boundary_collect.zig").collect(a, &reopened, 1, reopened_positions, .right, 10);
    defer a.free(relocated_columns);
    try std.testing.expectEqual(@as(usize, 2), relocated_columns.len);
    try std.testing.expectEqual(@as(u32, 0), relocated_columns[0].unit);
    try std.testing.expectEqual(@as(u32, 4), relocated_columns[1].unit);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            const bytes = try @import("column_boundary_joined_xml.zig").write(allocator, parsed, current, .{}, 10000);
            defer allocator.free(bytes);
        }
    }.run, .{ &tree, &owned_paragraph });
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const @import("paragraph_structure_values.zig").Paragraph) !void {
            const bytes = try @import("column_boundary_joined_xml.zig").write(allocator, parsed, current, .{}, 10000);
            defer allocator.free(bytes);
        }
    }.run, .{ &tree, &cloned_paragraph });
    try std.testing.expectEqual(@as(u32, 3), owned_paragraph.column_boundaries.?[1].unit);
    try install(a, &tree, &cloned_paragraph, 0);
    cloned_paragraph.column_boundaries.?[1].unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, install(a, &tree, &cloned_paragraph, 0));
    try std.testing.expectEqual(@as(u32, 2), cloned_paragraph.column_boundaries.?[1].unit);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, view: *const Joined) !void {
            var candidate: @import("paragraph_structure_values.zig").Paragraph = .{ .template_element = view.pieces[0].template_element, .source_ordinal = 1, .sites = try view.sites.clone(allocator) };
            defer candidate.deinit(allocator);
            candidate.pieces = try allocator.dupe(@import("paragraph_joined_values.zig").Piece, view.pieces);
            @import("column_boundary_joined_materialize.zig").install(allocator, parsed, &candidate, 10) catch |err| {
                try std.testing.expect(candidate.column_boundaries == null);
                return err;
            };
        }
    }.run, .{ &tree, &joined });
    const boundaries = try collect(a, &tree, &joined, 10);
    defer a.free(boundaries);
    try std.testing.expectEqual(@as(usize, 2), boundaries.len);
    try std.testing.expectEqual(@as(u32, 0), boundaries[0].unit);
    try std.testing.expectEqual(@as(u32, 3), boundaries[1].unit);
    try std.testing.expectEqual(.left, boundaries[0].affinity);
    try std.testing.expectEqual(.right, boundaries[1].affinity);
    try std.testing.expect(boundaries[0].source_element != boundaries[1].source_element);
    const validate = @import("column_boundary_joined_partition.zig").validate;
    try validate(a, &tree, &joined, boundaries);
    const owned = try a.dupe(@import("column_boundary_position.zig").Position, boundaries);
    defer a.free(owned);
    owned[1].unit = 4;
    // Current coordinates are authoritative; source positions are inventory only.
    try validate(a, &tree, &joined, owned);
    owned[1].unit = 2;
    try std.testing.expectError(error.SplitSurrogatePair, validate(a, &tree, &joined, owned));
    owned[1].unit = 5;
    try std.testing.expectError(error.InvalidTextPosition, validate(a, &tree, &joined, owned));
    @memcpy(owned, boundaries);
    owned[1].source_element = owned[0].source_element;
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &joined, owned));
    try std.testing.expectError(error.SourceBindingMismatch, validate(a, &tree, &joined, boundaries[0..1]));
    @memcpy(owned, boundaries);
    owned[0].unit = 4;
    try std.testing.expectError(error.InvalidColumnBoundaryOrder, validate(a, &tree, &joined, owned));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const Joined, boundaries_now: []const @import("column_boundary_position.zig").Position) !void {
            try @import("column_boundary_joined_partition.zig").validate(allocator, parsed, current, boundaries_now);
        }
    }.run, .{ &tree, &joined, boundaries });
    try std.testing.expectError(error.LimitExceeded, collect(a, &tree, &joined, 1));
    pieces[1].template_element = pieces[0].template_element;
    try std.testing.expectError(error.SourceBindingMismatch, collect(a, &tree, &joined, 10));
    pieces[1].template_element = values.paragraphs[1].template_element;
    pieces[1].generated_id = 7;
    try std.testing.expectError(error.SourceBindingMismatch, collect(a, &tree, &joined, 10));
    pieces[1].generated_id = null;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, parsed: *const Tree, current: *const Joined) !void {
            const result = try collect(allocator, parsed, current, 10);
            defer allocator.free(result);
        }
    }.run, .{ &tree, &joined });
    try std.testing.expectEqualStrings("A😀", sites.items[0].text);
    try std.testing.expectEqualStrings("B", sites.items[1].text);
}

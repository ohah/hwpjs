const std = @import("std");
const Joined = @import("paragraph_joined_values.zig").Joined;
const projection = @import("character_style_joined_projection.zig");
const Span = @import("character_style_paint.zig").Span;

test "joined style projection completes only missing hidden source affinities" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p><p:run charPrIDRef='1'><p:t/></p:run><p:run charPrIDRef='2'><p:t>A</p:t></p:run><p:run charPrIDRef='3'><p:t/></p:run></p:p></s:sec>", .section, 0, 0, .{});
    defer tree.deinit(a);
    var sites = try @import("text_sites.zig").collect(a, &tree, .{});
    defer sites.deinit(a);
    var pieces = [_]@import("paragraph_joined_values.zig").Piece{
        .{ .template_element = 1, .source_ordinal = null, .generated_id = 1, .first_site = 0, .site_count = 1, .owns_source = false, .template_only = true },
        .{ .template_element = 1, .source_ordinal = null, .generated_id = 1, .first_site = 1, .site_count = 1, .owns_source = false },
        .{ .template_element = 1, .source_ordinal = null, .generated_id = 1, .first_site = 2, .site_count = 1, .owns_source = false, .output = .inventory_only },
    };
    var styles = [_]Span{.{ .start_unit = 0, .end_unit = 1, .site_start_unit = 0, .site_index = 1, .run_element = 4, .char_shape_id = 7 }};
    const current: Joined = .{ .pieces = &pieces, .sites = sites, .character_styles = &styles };
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, parsed: *const @import("xml_part_tree.zig").Tree, original: *const Joined) !void {
            const output = try projection.complete(allocator, parsed, original);
            defer allocator.free(output);
            try std.testing.expectEqual(@as(usize, 3), output.len);
            for (output, [_]?u32{ 1, 7, 3 }) |span, id| try std.testing.expectEqual(id, span.char_shape_id);
            try std.testing.expectEqual(@as(usize, 1), output[2].start_unit);
            try std.testing.expectEqual(@as(?u32, 7), original.character_styles.?[0].char_shape_id);
            output[0].char_shape_id = 5;
            output[2].char_shape_id = 9;
            var retained = original.*;
            retained.character_styles = output;
            const restored = try projection.complete(allocator, parsed, &retained);
            defer allocator.free(restored);
            try std.testing.expectEqual(@as(?u32, 5), restored[0].char_shape_id);
            try std.testing.expectEqual(@as(?u32, 9), restored[2].char_shape_id);
        }
    };
    try Probe.run(a, &tree, &current);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{ &tree, &current });
    var missing_visible = current;
    missing_visible.character_styles = styles[0..0];
    try std.testing.expectError(error.InvalidTextSites, projection.complete(a, &tree, &missing_visible));
}

test "joined style projection retains hidden affinities and rejects nonempty hidden spans" {
    const a = std.testing.allocator;
    var sites = [_]@import("text_sites.zig").Site{
        .{ .element_index = 0, .start = 0, .end = 0, .text = @constCast("") },
        .{ .element_index = 1, .start = 0, .end = 0, .text = @constCast("😀A") },
        .{ .element_index = 2, .start = 0, .end = 0, .text = @constCast("") },
    };
    var pieces = [_]@import("paragraph_joined_values.zig").Piece{
        .{ .template_element = 0, .source_ordinal = null, .generated_id = 1, .first_site = 0, .site_count = 1, .owns_source = false, .template_only = true },
        .{ .template_element = 1, .source_ordinal = null, .generated_id = 1, .first_site = 1, .site_count = 1, .owns_source = false },
        .{ .template_element = 2, .source_ordinal = null, .generated_id = 1, .first_site = 2, .site_count = 1, .owns_source = false, .output = .inventory_only },
    };
    var spans = [_]Span{
        .{ .start_unit = 0, .end_unit = 0, .site_start_unit = 0, .site_index = 0, .run_element = 0, .char_shape_id = 5 },
        .{ .start_unit = 0, .end_unit = 3, .site_start_unit = 0, .site_index = 1, .run_element = 1, .char_shape_id = 7 },
        .{ .start_unit = 3, .end_unit = 3, .site_start_unit = 3, .site_index = 2, .run_element = 2, .char_shape_id = 9 },
    };
    const original: Joined = .{ .pieces = &pieces, .sites = .{ .items = &sites }, .character_styles = &spans };
    try original.validate();
    const Probe = struct {
        fn run(allocator: std.mem.Allocator, input: *const Joined) !void {
            const visible = try projection.visible(allocator, input);
            defer allocator.free(visible);
            try std.testing.expectEqual(@as(usize, 1), visible.len);
            visible[0].end_unit = 5;
            const edited: Joined = .{ .pieces = input.pieces, .sites = input.sites, .character_styles = visible };
            const restored = try projection.restore(allocator, input, &edited);
            defer allocator.free(restored);
            try std.testing.expectEqual(@as(usize, 3), restored.len);
            try std.testing.expectEqual(@as(?u32, 5), restored[0].char_shape_id);
            try std.testing.expectEqual(@as(?u32, 9), restored[2].char_shape_id);
            try std.testing.expectEqual(@as(usize, 5), restored[2].start_unit);
            try std.testing.expectEqual(restored[2].start_unit, restored[2].end_unit);
        }
    };
    try Probe.run(a, &original);
    try std.testing.checkAllAllocationFailures(a, Probe.run, .{&original});
    spans[0].end_unit = 1;
    try std.testing.expectError(error.InvalidTextSites, projection.visible(a, &original));
    spans[0].end_unit = 0;
    sites[0].text = @constCast("x");
    try std.testing.expectError(error.InvalidTextSites, projection.visible(a, &original));
}

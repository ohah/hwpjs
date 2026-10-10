const std = @import("std");

test "HWPX projected formula transaction allocation failures preserve numeric source and cached result" {
    const a = std.testing.allocator;
    var tree = try @import("xml_part_tree.zig").parse(a, @import("test_formula_fixture.zig").section, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    const options: @import("text_sites.zig").Options = .{ .materialize_tab_boundaries = true, .branch_policy = .{ .mode = .selected } };
    var base = try @import("text_sites.zig").collect(a, &tree, options);
    defer base.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &base, options);
    defer a.free(locations);
    const positions = try @import("paragraph_text_positions.zig").build(a, &tree, &base, locations, locations[0].paragraph_ordinal);
    defer a.free(positions);
    try std.testing.expectError(error.InvalidSectionIndex, @import("formula_splice.zig").spliceProjected(a, &trees, 1, &base, positions, 0, 1, "100", 4096, null));
    try std.testing.expect(!try @import("formula_splice.zig").spliceProjected(a, &trees, 0, &base, positions, 0, 1, "2", 4096, null));
    try std.testing.expectError(error.InvalidTextPosition, @import("formula_splice.zig").spliceProjected(a, &trees, 0, &base, positions, std.math.maxInt(u32), 1, "x", 4096, null));
    try std.testing.expectError(error.LimitExceeded, @import("formula_splice.zig").spliceProjected(a, &trees, 0, &base, positions, 0, 1, "100", 1, null));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const @import("xml_part_tree.zig").Tree, original: *const @import("text_sites.zig").Sites, segments: []const @import("paragraph_text_positions.zig").Segment) !void {
            var sites = try original.clone(allocator);
            defer sites.deinit(allocator);
            const changed = @import("formula_splice.zig").spliceProjected(allocator, input, 0, &sites, segments, 0, 1, "100", 4096, null) catch |err| {
                for (original.items, sites.items) |old, now| try std.testing.expectEqualStrings(old.text, now.text);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqualStrings("100", sites.items[0].text);
            try std.testing.expectEqualStrings("2", sites.items[1].text);
            const current = [_]@import("paragraph_text_positions.zig").Segment{.{ .kind = .text, .index = 0, .source_start = segments[0].source_start, .start_unit = 0, .end_unit = 3 }};
            _ = @import("formula_splice.zig").spliceProjected(allocator, input, 0, &sites, &current, 0, 3, "bad", 4096, null) catch |err| {
                try std.testing.expectEqualStrings("100", sites.items[0].text);
                try std.testing.expectEqualStrings("2", sites.items[1].text);
                if (err == error.InvalidFormulaNumber) return;
                return err;
            };
            return error.InvalidInputAccepted;
        }
    }.run, .{ &trees, &base, positions });
    for (base.items) |site| try std.testing.expectEqualStrings("2", site.text);
}

test "HWPX formula splice allocation failures preserve current input and cached label" {
    const a = std.testing.allocator;
    const source = @import("test_formula_fixture.zig").section;
    var tree = try @import("xml_part_tree.zig").parse(a, source, .section, 0, 0, .{});
    defer tree.deinit(a);
    const trees = [_]@import("xml_part_tree.zig").Tree{tree};
    const options: @import("text_sites.zig").Options = .{ .materialize_tab_boundaries = true, .branch_policy = .{ .mode = .selected } };
    var base = try @import("text_sites.zig").collect(a, &tree, options);
    defer base.deinit(a);
    const locations = try @import("text_site_locations.zig").build(a, &tree, &base, options);
    defer a.free(locations);
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const @import("xml_part_tree.zig").Tree, positions: []const @import("section_text.zig").Location, opts: @import("text_sites.zig").Options) !void {
            var sites = try @import("text_sites.zig").collect(allocator, &input[0], opts);
            defer sites.deinit(allocator);
            const changed = @import("formula_splice.zig").splice(allocator, input, 0, &sites, positions, positions[0].paragraph_ordinal, 0, 1, "100", 4096) catch |err| {
                try std.testing.expectEqualStrings("2", sites.items[0].text);
                try std.testing.expectEqualStrings("2", sites.items[1].text);
                return err;
            };
            try std.testing.expect(changed);
            try std.testing.expectEqualStrings("100", sites.items[0].text);
            try std.testing.expectEqualStrings("2", sites.items[1].text);
            _ = @import("formula_splice.zig").splice(allocator, input, 0, &sites, positions, positions[0].paragraph_ordinal, 0, 3, "bad", 4096) catch |err| {
                try std.testing.expectEqualStrings("100", sites.items[0].text);
                try std.testing.expectEqualStrings("2", sites.items[1].text);
                if (err == error.InvalidFormulaNumber) return;
                return err;
            };
            return error.InvalidInputAccepted;
        }
    }.run, .{ &trees, locations, options });
}

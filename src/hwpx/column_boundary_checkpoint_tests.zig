//! Internal checkpoint coverage; no public column-edit command is implied.
const std = @import("std");
const editor = @import("editor_session.zig");
const checkpoint = @import("editor_checkpoint.zig");

test "column boundary session materializes original ownership only after successful input" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "multicolumns.hwpx", "multicolumns-widths.hwpx" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var session = try editor.open(a, input, .{});
        defer session.deinit();
        const before = try session.anchorText(0, 2);
        defer a.free(before);
        try std.testing.expect(!try session.splice(0, 2, 0, 0, ""));
        try std.testing.expect(session.sections[0].structure_values == null);
        try std.testing.expectError(error.InvalidXmlCharacter, session.splice(0, 2, 0, 0, &.{0}));
        try std.testing.expect(session.sections[0].structure_values == null);
        try std.testing.expect(try session.splice(0, 2, 0, 0, "X"));
        const paragraph = &session.sections[0].structure_values.?.paragraphs[1];
        try std.testing.expectEqual(@as(u32, 0), paragraph.column_boundaries.?[0].unit);
        try std.testing.expectEqual(@as(usize, 0), session.sections[0].sites.items.len);
        const output = try session.save();
        defer a.free(output);
        var reopened = try editor.open(a, output, .{});
        defer reopened.deinit();
        const after = try reopened.anchorText(0, 2);
        defer a.free(after);
        try std.testing.expectEqual(@as(u8, 'X'), after[0]);
        try std.testing.expectEqualStrings(before, after[1..]);
        try std.testing.expectEqualSlices(u8, input, session.source);
        if (std.mem.eql(u8, name, "multicolumns.hwpx")) try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, source: []const u8) !void {
                var current = try editor.open(std.testing.allocator, source, .{});
                defer current.deinit();
                const baseline = try current.anchorText(0, 2);
                defer std.testing.allocator.free(baseline);
                current.allocator = allocator;
                defer current.allocator = std.testing.allocator;
                _ = current.splice(0, 2, 0, 0, "X") catch |err| {
                    current.allocator = std.testing.allocator;
                    try std.testing.expect(current.sections[0].structure_values == null);
                    const unchanged = try current.anchorText(0, 2);
                    defer std.testing.allocator.free(unchanged);
                    try std.testing.expectEqualStrings(baseline, unchanged);
                    try std.testing.expectEqualSlices(u8, source, current.source);
                    return err;
                };
                try std.testing.expectEqual(@as(u32, 0), current.sections[0].structure_values.?.paragraphs[1].column_boundaries.?[0].unit);
            }
        }.run, .{input});
    }
}

test "column boundary checkpoint exchanges text and coordinates with failure atomic capture" {
    try verify("legacy/rust/crates/hwp-core/tests/fixtures/multicolumns.hwpx");
}

test "column boundary checkpoint preserves unequal column widths through session input" {
    try verify("legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-widths.hwpx");
}

fn verify(path: []const u8) !void {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
    defer a.free(input);
    var session = try editor.open(a, input, .{});
    defer session.deinit();
    const section = &session.sections[0];
    var counters: @import("section_text.zig").Report = .{};
    var values = try @import("paragraph_structure_collect.zig").collect(a, &section.tree, &section.sites, section.locations, editor.siteOptions(session.options), &counters);
    var transferred = false;
    defer if (!transferred) values.deinit(a);
    const positions = try @import("anchor_text_positions.zig").build(a, &section.tree, &section.sites, section.locations, 2);
    defer a.free(positions);
    values.paragraphs[1].column_boundaries = try @import("column_boundary_collect.zig").collect(a, &section.tree, values.paragraphs[1].template_element, positions, .right, 8);
    const empty = try a.alloc(@import("text_sites.zig").Site, 0);
    section.sites.deinit(a);
    section.sites = .{ .items = empty };
    section.structure_values = values;
    transferred = true;
    try std.testing.expectEqual(@as(usize, 1), section.structure_values.?.paragraphs[1].column_boundaries.?.len);
    const original_text = try a.dupe(u8, section.structure_values.?.paragraphs[1].sites.items[0].text);
    defer a.free(original_text);
    const required = try checkpoint.size(&session, 4_000_000);
    try std.testing.expectError(error.LimitExceeded, checkpoint.capture(&session, required - 1));
    var saved = try checkpoint.capture(&session, 4_000_000);
    defer saved.deinit();
    // Boundary ownership is installed above; the session moves it with text.
    try std.testing.expect(try session.splice(0, 2, 0, 0, "X"));
    try std.testing.expectEqual(@as(u32, 1), section.structure_values.?.paragraphs[1].column_boundaries.?[0].unit);
    try saved.exchange(&session);
    try std.testing.expectEqual(@as(u32, 0), section.structure_values.?.paragraphs[1].column_boundaries.?[0].unit);
    try std.testing.expectEqualStrings(original_text, section.structure_values.?.paragraphs[1].sites.items[0].text);
    try saved.exchange(&session);
    try std.testing.expectEqual(@as(u32, 1), section.structure_values.?.paragraphs[1].column_boundaries.?[0].unit);
    try std.testing.expectEqual(@as(u8, 'X'), section.structure_values.?.paragraphs[1].sites.items[0].text[0]);
    try std.testing.expectEqualStrings(original_text, section.structure_values.?.paragraphs[1].sites.items[0].text[1..]);
    try std.testing.expectEqual(required + 1, try checkpoint.size(&session, 4_000_000));
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, current: *editor.Session) !void {
            const original_allocator = current.allocator;
            current.allocator = allocator;
            defer current.allocator = original_allocator;
            var copy = checkpoint.capture(current, 4_000_000) catch |err| {
                try std.testing.expectEqual(@as(u32, 1), current.sections[0].structure_values.?.paragraphs[1].column_boundaries.?[0].unit);
                try std.testing.expectEqual(@as(u8, 'X'), current.sections[0].structure_values.?.paragraphs[1].sites.items[0].text[0]);
                return err;
            };
            defer copy.deinit();
            copy.states[0].structure_values.?.paragraphs[1].column_boundaries.?[0].unit = 2;
            try std.testing.expectEqual(@as(u32, 1), current.sections[0].structure_values.?.paragraphs[1].column_boundaries.?[0].unit);
        }
    }.run, .{&session});
    const output = try session.save();
    defer a.free(output);
    var reopened = try editor.open(a, output, .{});
    defer reopened.deinit();
    const changed = &reopened.sections[0];
    const changed_owner = try @import("paragraph_site_owner.zig").resolve(&changed.tree, &changed.sites, changed.locations, 2);
    const changed_positions = try @import("anchor_text_positions.zig").build(a, &changed.tree, &changed.sites, changed.locations, 2);
    defer a.free(changed_positions);
    const changed_boundaries = try @import("column_boundary_collect.zig").collect(a, &changed.tree, changed_owner, changed_positions, .right, 1);
    defer a.free(changed_boundaries);
    try std.testing.expectEqual(@as(usize, 1), changed_boundaries.len);
    try std.testing.expectEqual(@as(u32, 1), changed_boundaries[0].unit);
    const original_boundary = section.structure_values.?.paragraphs[1].column_boundaries.?[0];
    try std.testing.expectEqualStrings(section.tree.sourceOf(original_boundary.source_element), changed.tree.sourceOf(changed_boundaries[0].source_element));
    var restored: std.ArrayList(u8) = .empty;
    defer restored.deinit(a);
    for (changed.sites.items, changed.locations) |site, location| if (location.paragraph_ordinal == 2) {
        try restored.appendSlice(a, site.text);
    };
    try std.testing.expectEqual(@as(u8, 'X'), restored.items[0]);
    try std.testing.expectEqualStrings(original_text, restored.items[1..]);
    try std.testing.expectEqualSlices(u8, input, session.source);
    try std.testing.expect(try session.splice(0, 2, 0, 1, ""));
    try std.testing.expectEqual(@as(u32, 0), section.structure_values.?.paragraphs[1].column_boundaries.?[0].unit);
    try std.testing.expectEqualStrings(original_text, section.structure_values.?.paragraphs[1].sites.items[0].text);
    try std.testing.expect(!try session.splice(0, 2, 0, 0, ""));
}

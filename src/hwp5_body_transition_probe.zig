//! Real-body version interpretation checks, not document conversion permission.
const std = @import("std");

test "body transition actual older fixtures retain parsed ownership and expose unexamined payloads" {
    const a = std.testing.allocator;
    const target: @import("hwp5/version.zig").Version = .{ .raw = 0x05000300 };
    const tree = @import("hwp5/edit/source_tree.zig");
    const rules = @import("hwp5/body/control_rules.zig");
    var sections: usize = 0;
    var paragraphs: usize = 0;
    var tables: usize = 0;
    var unknown: usize = 0;
    var section_extra: usize = 0;
    var unknown_tags: [1024]usize = @splat(0);
    var components: usize = 0;
    var rectangles: usize = 0;
    var pictures: usize = 0;
    var object_extra: usize = 0;
    var style_records: usize = 0;
    var residual_style_bytes: usize = 0;
    var residual_picture_bytes: usize = 0;
    var missing_modern_styles: usize = 0;
    for ([_][]const u8{ "aligns.hwp", "borderfill.hwp", "charshape.hwp", "linespacing.hwp", "lists-bullet.hwp", "multicolumns-in-common-controls.hwp", "noori.hwp", "pagedefs.hwp", "tabdef.hwp", "table-caption.hwp", "table-position.hwp", "table.hwp" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(4_000_000));
        defer a.free(input);
        var source = try @import("hwp5/text_source.zig").Source.open(a, input);
        defer source.deinit();
        const info = try source.decodeDocInfo(a, 4_000_000);
        defer a.free(info);
        const resources = try @import("hwp5/docinfo/resources.zig").inspect(info, source.header.version(), .{});
        try resources.validateKnownCounts();
        for (0..source.section_count) |index| {
            const raw = try source.decodeSection(a, index);
            defer a.free(raw);
            const before = try a.dupe(u8, raw);
            defer a.free(before);
            var original = try tree.parse(a, raw, source.header.version(), .{});
            defer original.deinit(a);
            var current = try tree.parse(a, raw, target, .{});
            defer current.deinit(a);
            const table_options: @import("hwp5/body/table_validation.zig").Options = .{ .list_layout = .observed8, .zone_layout = .observed_row_first, .border_count = resources.count(.border_fill) };
            const old_tables = try @import("hwp5/body/table_validation.zig").inspect(a, original, table_options);
            const new_tables = try @import("hwp5/body/table_validation.zig").inspect(a, current, table_options);
            try std.testing.expectEqualDeep(old_tables, new_tables);
            const shapes = @import("hwp5/body/shape_validation.zig");
            const old_shapes = try shapes.inspect(original);
            try std.testing.expectEqualDeep(old_shapes, try shapes.inspect(current));
            components += old_shapes.components;
            object_extra += old_shapes.extra_bytes;
            const detailed = try shapes.inspectDetailed(original, .{ .tail = .fill_only }, resources.bin_data_count);
            style_records += detailed.styles.parsed;
            residual_style_bytes += detailed.styles.extra_bytes;
            const rects = @import("hwp5/body/rectangle_validation.zig");
            const old_rects = try rects.inspect(original, .observed_points);
            try std.testing.expectEqualDeep(old_rects, try rects.inspect(current, .observed_points));
            rectangles += old_rects.rectangles;
            try std.testing.expectEqual(@as(usize, 0), old_rects.extra_bytes);
            object_extra += old_rects.extra_bytes;
            const images = @import("hwp5/body/picture_validation.zig");
            const old_images = try images.inspect(original, .{ .prefix = .base73 }, resources.bin_data_count);
            try std.testing.expectEqualDeep(old_images, try images.inspect(current, .{ .prefix = .base73 }, resources.bin_data_count));
            pictures += old_images.pictures;
            object_extra += old_images.extra_bytes;
            if (old_images.pictures > 0) {
                // These four pictures belong to the already-modern noori profile.
                try std.testing.expectEqual(@as(u32, 0x05000300), source.header.version().raw);
                const tails = try images.inspect(original, .{ .prefix = .with_instance78, .tail = .{} }, resources.bin_data_count);
                try std.testing.expectEqual(old_images.pictures, tails.parsed_tails);
                residual_picture_bytes += tails.extra_bytes;
            }
            try std.testing.expectEqual(original.nodes.len, current.nodes.len);
            for (original.nodes, current.nodes) |old, new| {
                try std.testing.expectEqualDeep(old, new);
                switch (old.record.value) {
                    .header => paragraphs += 1,
                    .table => tables += 1,
                    .unknown => {
                        unknown += 1;
                        unknown_tags[old.record.framing.tag] += 1;
                    },
                    .control_header => |control| {
                        if (control.id == rules.section_id) {
                            const Definition = @import("hwp5/body/section_def.zig").Definition;
                            const old_definition = try Definition.parse(control.properties, source.header.version());
                            const new_definition = try Definition.parse(control.properties, target);
                            try std.testing.expectEqualDeep(old_definition, new_definition);
                            section_extra += old_definition.extra.len;
                        }
                    },
                    else => {},
                }
            }
            for (original.nodes, 0..) |node, node_index| {
                if (node.record.framing.tag != 76) continue;
                const layout = try shapes.componentLayout(original, node_index);
                const component = try @import("hwp5/body/shape_component.zig").Component.parse(node.record.framing.payload, layout);
                if (!@import("hwp5/body/drawing_style_validation.zig").supports(component.id)) continue;
                try std.testing.expectEqual(@as(u32, 0x05000107), source.header.version().raw);
                // Modern preview selects this profile. Header-only conversion
                // would require absent alpha/shadow/metadata, not just raw reuse.
                try std.testing.expectError(error.UnexpectedEnd, @import("hwp5/body/drawing_style.zig").Style.parseWithTail(component.extra, .observed13, .alpha_shadow_metadata));
                missing_modern_styles += 1;
            }
            sections += 1;
            try std.testing.expectEqualSlices(u8, before, raw);
        }
    }
    try std.testing.expectEqual(@as(usize, 13), sections);
    try std.testing.expectEqual(@as(usize, 378), paragraphs);
    try std.testing.expectEqual(@as(usize, 30), tables);
    try std.testing.expectEqual(@as(usize, 42), unknown);
    var expected_tags: [1024]usize = @splat(0);
    expected_tags[76] = 21;
    expected_tags[79] = 17;
    expected_tags[85] = 4;
    try std.testing.expectEqualSlices(usize, &expected_tags, &unknown_tags);
    try std.testing.expectEqual(@as(usize, 80), section_extra);
    try std.testing.expectEqual(@as(usize, 21), components);
    try std.testing.expectEqual(@as(usize, 17), rectangles);
    try std.testing.expectEqual(@as(usize, 4), pictures);
    try std.testing.expectEqual(@as(usize, 393), object_extra);
    try std.testing.expectEqual(@as(usize, 17), style_records);
    try std.testing.expectEqual(@as(usize, 17), missing_modern_styles);
    try std.testing.expectEqual(@as(usize, 0), residual_style_bytes);
    try std.testing.expectEqual(@as(usize, 0), residual_picture_bytes);
}

test "body transition zero tails can become present fields across older version boundaries" {
    const section: [26]u8 = @splat(0);
    const Definition = @import("hwp5/body/section_def.zig").Definition;
    const old = try Definition.parse(&section, .{ .raw = 0x05000104 });
    const new = try Definition.parse(&section, .{ .raw = 0x05000300 });
    try std.testing.expect(old.language == null);
    try std.testing.expectEqual(@as(?u16, 0), new.language);
    try std.testing.expectEqual(@as(usize, 2), old.extra.len);
    try std.testing.expectEqual(@as(usize, 0), new.extra.len);
    const table: [22]u8 = @splat(0);
    const Table = @import("hwp5/body/table.zig").Table;
    const old_table = try Table.parse(&table, .{ .raw = 0x05000000 });
    const new_table = try Table.parse(&table, .{ .raw = 0x05000300 });
    try std.testing.expect(old_table.zones == null);
    try std.testing.expect(new_table.zones != null);
    try std.testing.expectEqual(@as(usize, 0), new_table.zones.?.count());
    try std.testing.expectEqual(@as(usize, 2), old_table.extra.len);
    try std.testing.expectEqual(@as(usize, 0), new_table.extra.len);
}

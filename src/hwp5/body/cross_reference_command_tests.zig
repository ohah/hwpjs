const std = @import("std");
const command = @import("cross_reference_command.zig");

test "all 334 surveyed cross reference commands preserve targets and supported semantics" {
    const a = std.testing.allocator;
    const cases = .{
        .{ "reference/rhwp/samples/pic-in-head-01.hwp", @as(usize, 13), @as(usize, 8) },
        .{ "reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp", @as(usize, 18), @as(usize, 0) },
        .{ "reference/rhwp/samples/hwp-3.0-HWPML.hwp", @as(usize, 5), @as(usize, 0) },
        .{ "reference/rhwp/samples/hwpctl_ParameterSetID_Item_v1.2.hwp", @as(usize, 3), @as(usize, 3) },
        .{ "reference/rhwp/samples/hwpspec.hwp", @as(usize, 142), @as(usize, 0) },
        .{ "reference/rhwp/samples/pic-in-table-01.hwp", @as(usize, 13), @as(usize, 8) },
        .{ "reference/rhwp/samples/한글문서파일형식_5.0_revision1.3.hwp", @as(usize, 140), @as(usize, 0) },
    };
    inline for (cases) |case| {
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case[0], a, .limited(32_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.openReadOnly(a, input);
        defer source.deinit();
        var count: usize = 0;
        var named: usize = 0;
        for (0..source.section_count) |section| {
            const bytes = try source.decodeSection(a, section);
            defer a.free(bytes);
            var it = @import("../record.zig").Iterator.init(bytes, .{});
            while (try it.next()) |record| {
                if (record.tag != 71) continue;
                const header = try @import("control_header.zig").Header.parse(record.payload);
                if (header.id != @import("control_rules.zig").id("%xrf")) continue;
                const properties = try @import("field_start.zig").Properties.parse(header.properties);
                const view = try command.View.parse(properties.command);
                const semantic = try view.semantics();
                if (case[1] == 13) {
                    try std.testing.expectEqual(command.Content.page, semantic.content);
                    try std.testing.expect(semantic.hyperlink);
                } else if (case[1] == 18) {
                    try std.testing.expectEqual(command.Content.number_or_name, semantic.content);
                    try std.testing.expect(!semantic.hyperlink);
                }
                try std.testing.expectEqualSlices(u8, properties.command, view.raw);
                try std.testing.expectEqualSlices(u8, &.{ 0, 0, 0, 0 }, properties.extra);
                switch (view.target) {
                    .name => |name| {
                        try std.testing.expect(name.len > 0);
                        try std.testing.expectEqual(@as(u32, 6), view.options[0]);
                        named += 1;
                    },
                    .numeric => |id| try std.testing.expect(id != 0),
                }
                count += 1;
            }
        }
        try std.testing.expectEqual(case[1], count);
        try std.testing.expectEqual(case[2], named);
    }
}

test "original cross reference object IDs distinguish four resolved tables from missing targets" {
    const a = std.testing.allocator;
    const targets = @import("cross_reference_object_target.zig");
    const cases = .{
        .{ "reference/rhwp/samples/pic-in-head-01.hwp", @as(usize, 5), @as(usize, 4) },
        .{ "reference/rhwp/samples/issue5941/1490000-201600081_roadmap_research.hwp", @as(usize, 18), @as(usize, 0) },
    };
    inline for (cases) |case| {
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, case[0], a, .limited(32_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        var objects: std.ArrayList(targets.Site) = .empty;
        defer objects.deinit(a);
        var references: std.ArrayList([]const u8) = .empty;
        defer {
            for (references.items) |bytes| a.free(bytes);
            references.deinit(a);
        }
        for (0..source.section_count) |section| {
            const bytes = try source.decodeSection(a, section);
            defer a.free(bytes);
            var it = @import("../record.zig").Iterator.init(bytes, .{});
            while (try it.next()) |record| {
                if (record.tag != 71) continue;
                const header = try @import("control_header.zig").Header.parse(record.payload);
                if (@import("object_common.zig").supports(header.id)) {
                    const object = try @import("object_common.zig").Properties.parse(header.properties);
                    try objects.append(a, .{ .section = section, .record_offset = record.offset, .control_id = header.id, .instance_id = object.instance_id });
                } else if (header.id == @import("control_rules.zig").id("%xrf")) {
                    const properties = try @import("field_start.zig").Properties.parse(header.properties);
                    const view = try command.View.parse(properties.command);
                    if (view.target == .numeric) {
                        try std.testing.expectEqual(command.TargetSpace.object_instance, (try view.semantics()).targetSpace());
                        const owned = try a.dupe(u8, properties.command);
                        references.append(a, owned) catch |err| {
                            a.free(owned);
                            return err;
                        };
                    }
                }
            }
        }
        var resolved: usize = 0;
        for (references.items) |bytes| {
            if (try targets.resolveCommand(try command.View.parse(bytes), objects.items)) |target| {
                try std.testing.expectEqual(@import("control_rules.zig").table_id, target.control_id);
                try std.testing.expectEqual(@as(usize, 0), target.section);
                resolved += 1;
            }
        }
        try std.testing.expectEqual(case[1], references.items.len);
        try std.testing.expectEqual(case[2], resolved);
    }
}

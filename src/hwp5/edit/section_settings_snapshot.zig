//! 구역 원값과 borrowed 확장 바이트. 입력 구역의 수명을 유지해야 합니다.
const std = @import("std");
pub const Setting = struct {
    source_node: usize,
    flags: u32,
    column_gap: i16,
    vertical_grid: i16,
    horizontal_grid: i16,
    tab_spacing: u32,
    numbering_id: u16,
    page_start: u16,
    picture_start: u16,
    table_start: u16,
    equation_start: u16,
    language: ?u16,
    extra_bytes: usize,
    extra_nonzero: bool,
    extra_raw: []const u8,
    observed_extension: ?@import("../body/section_extension.zig").View = null,
    memo_shape_count: ?usize = null,
    memo_list_count: usize = 0,
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) !Setting {
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    const index = try @import("../body/section_validation.zig").definitionOwner(tree);
    const d = try @import("../body/section_def.zig").Definition.parse(tree.nodes[index].record.value.control_header.properties, version);
    var memo_lists: usize = 0;
    for (tree.nodes) |node| if (node.record.value == .memo_list) {
        memo_lists += 1;
    };
    return .{ .source_node = index, .flags = d.flags, .column_gap = d.column_gap, .vertical_grid = d.vertical_grid, .horizontal_grid = d.horizontal_grid, .tab_spacing = d.tab_spacing, .numbering_id = d.numbering_id, .page_start = d.page_start, .picture_start = d.picture_start, .table_start = d.table_start, .equation_start = d.equation_start, .language = d.language, .extra_bytes = d.extra.len, .extra_nonzero = !std.mem.allEqual(u8, d.extra, 0), .extra_raw = d.extra, .observed_extension = d.observed_extension, .memo_list_count = memo_lists };
}
test "HWP5 section settings source actual fields match independent values and allocation failures" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/multicolumns-widths.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    var source = try @import("../text_source.zig").Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: []const u8, version: @import("../version.zig").Version) !void {
            const value = try read(allocator, input, version);
            try std.testing.expectEqual(@as(u32, 0), value.flags);
            try std.testing.expectEqual(@as(i16, 1134), value.column_gap);
            try std.testing.expectEqual(@as(i16, 0), value.vertical_grid);
            try std.testing.expectEqual(@as(i16, 0), value.horizontal_grid);
            try std.testing.expectEqual(@as(u32, 8000), value.tab_spacing);
            try std.testing.expectEqual(@as(usize, 17), value.extra_bytes);
            try std.testing.expect(!value.extra_nonzero);
            try std.testing.expectEqual(@as(usize, 17), value.extra_raw.len);
            try std.testing.expect(std.mem.allEqual(u8, value.extra_raw, 0));
        }
    }.run, .{ raw, source.header.version() });
}
test "section opaque extension actual eight zero and seventeen nonzero allocation failures" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "noori", "software" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(bytes);
        var source = try @import("../text_source.zig").Source.open(a, bytes);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        const setting = try read(a, raw, source.header.version());
        try std.testing.expectEqual(@as(usize, if (std.mem.eql(u8, name, "noori")) 8 else 17), setting.extra_bytes);
        try std.testing.expectEqual(std.mem.eql(u8, name, "software"), setting.extra_nonzero);
        try std.testing.expectEqualSlices(u8, raw[@intFromPtr(setting.extra_raw.ptr) - @intFromPtr(raw.ptr) ..][0..setting.extra_bytes], setting.extra_raw);
        if (setting.extra_nonzero) try std.testing.expectEqual(@as(u8, 1), setting.extra_raw[4]);
        if (std.mem.eql(u8, name, "software")) {
            try std.testing.expectEqual(@as(u16, 1), setting.observed_extension.?.memo_shape_id_ref);
            try std.testing.expect(setting.observed_extension.?.trailing_raw.ptr == setting.extra_raw[6..].ptr);
        } else try std.testing.expectEqual(@as(?@import("../body/section_extension.zig").View, null), setting.observed_extension);
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, input: []const u8, version: @import("../version.zig").Version, expected: Setting) !void {
                try std.testing.expectEqualDeep(expected, try read(allocator, input, version));
            }
        }.run, .{ raw, source.header.version(), setting });
    }
}

test "section memo counts come from actual immutable resources and current section records" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/software.hwp", a, .limited(8_000_000));
    defer a.free(bytes);
    const session = try @import("style_preservation.zig").Session.open(a, bytes);
    defer session.close();
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, value: *const @import("style_preservation.zig").Session) !void {
            const setting = try value.sectionSettings(allocator, 0);
            try std.testing.expectEqual(@as(?usize, 1), setting.memo_shape_count);
            try std.testing.expectEqual(@as(usize, 0), setting.memo_list_count);
            try std.testing.expectEqual(@as(u16, 1), setting.observed_extension.?.memo_shape_id_ref);
        }
    }.run, .{session});
    const saved = try session.save(a, .{});
    defer a.free(saved.bytes);
    try std.testing.expectEqualSlices(u8, bytes, saved.bytes);

    const fixture = @import("../document/test_fixture.zig");
    const base = try fixture.section(a);
    defer a.free(base);
    var section: std.ArrayList(u8) = .empty;
    defer section.deinit(a);
    try section.appendSlice(a, base);
    try fixture.frame(a, &section, 93, 0, &.{ 1, 0, 0, 0 });
    const current = try read(a, section.items, .{ .raw = 0x05000107 });
    try std.testing.expectEqual(@as(usize, 1), current.memo_list_count);
    try std.testing.expectEqual(@as(?usize, null), current.memo_shape_count);
}

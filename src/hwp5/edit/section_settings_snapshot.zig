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
};
pub fn read(a: std.mem.Allocator, raw: []const u8, version: @import("../version.zig").Version) !Setting {
    var tree = try @import("../body/tree.zig").Tree.parse(a, raw, version, .{});
    defer tree.deinit(a);
    const index = try @import("../body/section_validation.zig").definitionOwner(tree);
    const d = try @import("../body/section_def.zig").Definition.parse(tree.nodes[index].record.value.control_header.properties, version);
    return .{ .source_node = index, .flags = d.flags, .column_gap = d.column_gap, .vertical_grid = d.vertical_grid, .horizontal_grid = d.horizontal_grid, .tab_spacing = d.tab_spacing, .numbering_id = d.numbering_id, .page_start = d.page_start, .picture_start = d.picture_start, .table_start = d.table_start, .equation_start = d.equation_start, .language = d.language, .extra_bytes = d.extra.len, .extra_nonzero = !std.mem.allEqual(u8, d.extra, 0), .extra_raw = d.extra };
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
        try std.testing.checkAllAllocationFailures(a, struct {
            fn run(allocator: std.mem.Allocator, input: []const u8, version: @import("../version.zig").Version, expected: Setting) !void {
                try std.testing.expectEqualDeep(expected, try read(allocator, input, version));
            }
        }.run, .{ raw, source.header.version(), setting });
    }
}

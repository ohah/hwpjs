//! Source-owned page declarations; no current page count or paragraph placement.
const std = @import("std");
const Tree = @import("../body/tree.zig").Tree;
const page = @import("../body/page_def.zig");
pub const Setting = struct {
    source_node: usize,
    width: u32,
    height: u32,
    left: u32,
    right: u32,
    top: u32,
    bottom: u32,
    header: u32,
    footer: u32,
    gutter: u32,
    flags: u32,
    orientation: page.Orientation,
    binding: page.Binding,
    extra_bytes: usize,
};

pub fn read(a: std.mem.Allocator, decoded: []const u8, version: @import("../version.zig").Version) !Setting {
    var tree = try Tree.parse(a, decoded, version, .{});
    defer tree.deinit(a);
    const section = try @import("../body/section_validation.zig").definitionOwner(tree);
    var result: ?Setting = null;
    for (tree.nodes, 0..) |node, index| {
        if (node.record.value != .page_definition) continue;
        if (node.parent != section) return error.OrphanSectionRecord;
        if (result != null) return error.DuplicatePageDefinition;
        const d = node.record.value.page_definition;
        result = .{ .source_node = index, .width = d.width, .height = d.height, .left = d.left, .right = d.right, .top = d.top, .bottom = d.bottom, .header = d.header, .footer = d.footer, .gutter = d.gutter, .flags = d.flags, .orientation = d.orientation(), .binding = try d.binding(), .extra_bytes = d.extra.len };
    }
    return result orelse error.MissingPageDefinition;
}

test "HWP5 page settings source actual fixture allocation failures retain owned scalar snapshot" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwp", a, .limited(4_000_000));
    defer a.free(input);
    const plain = (try @import("../password_package.zig").decryptToPlaintext(a, input, "12345", .{})).?;
    defer a.free(plain);
    var source = try @import("../text_source.zig").Source.open(a, plain);
    defer source.deinit();
    const decoded = try source.decodeSection(a, 0);
    defer a.free(decoded);
    const version = source.header.version();
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, v: @import("../version.zig").Version) !void {
            const value = try read(allocator, bytes, v);
            try std.testing.expectEqual(@as(u32, 59528), value.width);
            try std.testing.expectEqual(@as(u32, 84188), value.height);
            try std.testing.expectEqual(@as(u32, 8504), value.left);
            try std.testing.expectEqual(page.Orientation.narrowly, value.orientation);
            try std.testing.expectEqual(page.Binding.one_side, value.binding);
            try std.testing.expectEqual(@as(usize, 0), value.extra_bytes);
        }
    }.run, .{ decoded, version });
}

test "HWP5 page settings source refuses missing duplicate misplaced orphan and unknown binding" {
    const a = std.testing.allocator;
    const version: @import("../version.zig").Version = .{ .raw = 0x05000107 };
    var bytes: [130]u8 = @splat(0);
    // PARA_HEADER(level0,22), CTRL_HEADER(secd,level1,4), PAGE_DEF(level2,40).
    std.mem.writeInt(u32, bytes[0..4], (22 << 20) | 66, .little);
    std.mem.writeInt(u32, bytes[26..30], (4 << 20) | (1 << 10) | 71, .little);
    std.mem.writeInt(u32, bytes[30..34], @import("../body/section_def.zig").control_id, .little);
    std.mem.writeInt(u32, bytes[34..38], (40 << 20) | (2 << 10) | 73, .little);
    const healthy = bytes;
    _ = try read(a, bytes[0..78], version);
    try std.testing.expectError(error.MissingSectionDefinition, read(a, bytes[0..26], version));
    try std.testing.expectError(error.MissingPageDefinition, read(a, bytes[0..34], version));
    @memcpy(bytes[78..122], healthy[34..78]);
    try std.testing.expectError(error.DuplicatePageDefinition, read(a, bytes[0..122], version));
    bytes = healthy;
    @memcpy(bytes[78..86], healthy[26..34]);
    try std.testing.expectError(error.DuplicateSectionDefinition, read(a, bytes[0..86], version));
    bytes = healthy;
    std.mem.writeInt(u32, bytes[34..38], (40 << 20) | (1 << 10) | 73, .little);
    try std.testing.expectError(error.OrphanSectionRecord, read(a, bytes[0..78], version));
    bytes = healthy;
    std.mem.writeInt(u32, bytes[74..78], 6, .little);
    try std.testing.expectError(error.UnsupportedPageBinding, read(a, bytes[0..78], version));
    bytes = healthy;
    @memcpy(bytes[26..52], healthy[0..26]);
    @memcpy(bytes[52..104], healthy[26..78]);
    try std.testing.expectError(error.MisplacedSectionDefinition, read(a, bytes[0..104], version));
    bytes = healthy;
    std.mem.writeInt(u32, bytes[26..30], (4 << 20) | 71, .little);
    try std.testing.expectError(error.OrphanSectionDefinition, read(a, bytes[0..34], version));
    const before = bytes;
    try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, input: []const u8, v: @import("../version.zig").Version) !void {
            _ = read(allocator, input, v) catch |err| {
                if (err == error.OutOfMemory) return err;
                try std.testing.expectEqual(error.OrphanSectionDefinition, err);
                return;
            };
            return error.ExpectedRefusal;
        }
    }.run, .{ bytes[0..34], version });
    try std.testing.expectEqualSlices(u8, &before, &bytes);
}

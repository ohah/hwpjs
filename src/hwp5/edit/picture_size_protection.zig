//! 그림/그룹의 실제 최상위 개체 크기 보호. 표시 기하는 소유하지 않습니다.
const std = @import("std");
const rules = @import("../body/control_rules.zig");

pub fn read(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, picture_node: usize) !bool {
    var tree = try @import("../body/tree.zig").Tree.parse(a, source, version, .{});
    defer tree.deinit(a);
    const root = try rootOwner(tree, picture_node);
    const properties = try @import("../body/object_common.zig").Properties.parse(tree.nodes[root].record.value.control_header.properties);
    return properties.sizeProtected();
}

pub fn rootOwner(tree: @import("../body/tree.zig").Tree, picture_node: usize) !usize {
    _ = try @import("../body/shape_validation.zig").inspect(tree);
    if (picture_node >= tree.nodes.len or tree.nodes[picture_node].record.framing.tag != @import("../body/shape_picture.zig").tag) return error.InvalidPictureOwner;
    var current = tree.nodes[picture_node].parent orelse return error.InvalidPictureOwner;
    const selected = try @import("../body/owned_record.zig").componentChild(tree, current, rules.id("$pic"), @import("../body/shape_picture.zig").tag);
    if (selected != picture_node) return error.InvalidPictureOwner;
    while (true) {
        _ = try @import("../body/shape_validation.zig").componentLayout(tree, current);
        const parent = tree.nodes[current].parent orelse return error.InvalidPictureOwner;
        const owner = tree.nodes[parent];
        if (owner.record.value == .control_header and owner.record.value.control_header.id == rules.drawing_id) {
            return parent;
        }
        current = parent;
    }
}

test "HWP5 picture size protection bit applies only at paragraph vertical reference" {
    const Properties = @import("../body/object_common.zig").Properties;
    for (0..4) |reference| for ([_]bool{ false, true }) |enabled| {
        var bytes = [_]u8{0} ** 40;
        const flags: u32 = (@as(u32, @intCast(reference)) << 3) | (if (enabled) @as(u32, 1) << 20 else 0);
        std.mem.writeInt(u32, bytes[0..4], flags, .little);
        const parsed = try Properties.parse(&bytes);
        try std.testing.expectEqual(reference == 2 and enabled, parsed.sizeProtected());
    };
}

test "HWP5 picture size protection follows actual root and grouped ownership" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "sample-5017", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(bytes);
        var source = try @import("../text_source.zig").Source.open(a, bytes);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        const pictures = try @import("picture_sources.zig").read(a, raw, source.header.version(), .base73);
        defer a.free(pictures);
        var tree = try @import("../body/tree.zig").Tree.parse(a, raw, source.header.version(), .{});
        defer tree.deinit(a);
        for (pictures) |picture| {
            try std.testing.expect(!try read(a, raw, source.header.version(), picture.picture_node));
            var ancestor = picture.component_node;
            while (tree.nodes[ancestor].record.value != .control_header) ancestor = tree.nodes[ancestor].parent orelse return error.InvalidPictureOwner;
            const record = tree.nodes[ancestor].record.framing;
            const flags_offset = record.offset + record.raw.len - record.payload.len + 4;
            const protected = try a.dupe(u8, raw);
            defer a.free(protected);
            const original = std.mem.readInt(u32, protected[flags_offset..][0..4], .little);
            const flags = (original & ~(@as(u32, 3) << 3)) | (@as(u32, 2) << 3) | (@as(u32, 1) << 20);
            std.mem.writeInt(u32, protected[flags_offset..][0..4], flags, .little);
            try std.testing.expect(try read(a, protected, source.header.version(), picture.picture_node));
            var paragraphs: [0]@import("../../model/document.zig").Paragraph = .{};
            var section: @import("../../model/document.zig").Section = .{ .paragraphs = &paragraphs, .source_record_count = tree.nodes.len };
            try std.testing.expectError(error.PictureSizeProtected, @import("picture_current_size_values.zig").apply(a, protected, source.header.version(), &section, .{ .section = 0, .picture_node = @intCast(picture.picture_node), .width = 10000, .height = 6000 }));
            try std.testing.expect(section.picture_current_sizes == null);
        }
        try std.testing.expectError(error.InvalidPictureOwner, read(a, raw, source.header.version(), 0));
    }
}

//! 원본 그림 identity에 대한 현재 크기 intent만 소유합니다.
const std = @import("std");
const model = @import("../../model/document.zig");
pub const Edit = struct { section: usize, picture_node: u32, width: u32, height: u32 };

pub fn apply(a: std.mem.Allocator, source: []const u8, version: @import("../version.zig").Version, section: *model.Section, edit: Edit) !void {
    if (edit.picture_node >= section.source_record_count) return error.InvalidPictureOwner;
    if (try @import("picture_size_protection.zig").read(a, source, version, edit.picture_node)) return error.PictureSizeProtected;
    const pictures = try @import("picture_sources.zig").read(a, source, version, .base73);
    defer a.free(pictures);
    var component_node: ?usize = null;
    for (pictures) |picture| if (picture.picture_node == edit.picture_node) {
        component_node = picture.component_node;
        break;
    };
    const selected = component_node orelse return error.InvalidPictureOwner;
    const components = try @import("drawing_component_sources.zig").read(a, source, version);
    defer a.free(components);
    var original: ?@import("drawing_component_sources.zig").Source = null;
    for (components) |component| if (component.component_node == selected) {
        original = component;
        break;
    };
    const baseline = original orelse return error.InvalidPictureOwner;
    const reset = baseline.current_width == edit.width and baseline.current_height == edit.height;
    var empty: [0]model.PictureCurrentSize = .{};
    const current = section.picture_current_sizes orelse &empty;
    for (current, 0..) |value, index| if (value.source_picture_node == edit.picture_node) {
        if (value.width == edit.width and value.height == edit.height) return;
        if (!reset or value.resize_matrices != null) {
            current[index].width = edit.width;
            current[index].height = edit.height;
            return;
        }
        if (current.len == 1) {
            a.free(current);
            section.picture_current_sizes = null;
            return;
        }
        const next = try a.alloc(model.PictureCurrentSize, current.len - 1);
        @memcpy(next[0..index], current[0..index]);
        @memcpy(next[index..], current[index + 1 ..]);
        a.free(current);
        section.picture_current_sizes = next;
        return;
    };
    if (reset) return;
    if (current.len >= 100_000) return error.LimitExceeded;
    const next = try a.alloc(model.PictureCurrentSize, current.len + 1);
    @memcpy(next[0..current.len], current);
    next[current.len] = .{ .source_picture_node = edit.picture_node, .width = edit.width, .height = edit.height };
    if (section.picture_current_sizes) |owned| a.free(owned);
    section.picture_current_sizes = next;
}

test "HWP5 picture current size intents add update and remove preserve state at every allocation failure" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const version = source.header.version();
    const pictures = try @import("picture_sources.zig").read(a, raw, version, .base73);
    defer a.free(pictures);
    try std.testing.expectEqual(@as(usize, 2), pictures.len);
    const components = try @import("drawing_component_sources.zig").read(a, raw, version);
    defer a.free(components);
    var baseline: ?@import("drawing_component_sources.zig").Source = null;
    for (components) |component| if (component.component_node == pictures[0].component_node) {
        baseline = component;
    };
    const original = baseline orelse return error.MissingPictureComponent;
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    for (0..3) |mode| try std.testing.checkAllAllocationFailures(a, struct {
        fn run(allocator: std.mem.Allocator, bytes: []const u8, selected_version: @import("../version.zig").Version, record_count: usize, left: u32, right: u32, width: u32, height: u32, phase: usize) !void {
            var paragraphs: [0]model.Paragraph = .{};
            const initial = [_]model.PictureCurrentSize{
                .{ .source_picture_node = left, .width = 111, .height = 222 },
                .{ .source_picture_node = right, .width = 333, .height = 444 },
            };
            var section: model.Section = .{ .paragraphs = &paragraphs, .source_record_count = record_count };
            if (phase != 0) section.picture_current_sizes = try allocator.dupe(model.PictureCurrentSize, initial[0..phase]);
            defer if (section.picture_current_sizes) |values| allocator.free(values);
            const command: Edit = if (phase == 2)
                .{ .section = 0, .picture_node = left, .width = width, .height = height }
            else
                .{ .section = 0, .picture_node = left, .width = 10000, .height = 6000 };
            apply(allocator, bytes, selected_version, &section, command) catch |err| {
                if (phase == 0) try std.testing.expect(section.picture_current_sizes == null) else try std.testing.expectEqualSlices(model.PictureCurrentSize, initial[0..phase], section.picture_current_sizes.?);
                return err;
            };
            try std.testing.expectEqual(@as(usize, 1), section.picture_current_sizes.?.len);
            if (phase == 2) try std.testing.expectEqualDeep(initial[1], section.picture_current_sizes.?[0]) else try std.testing.expectEqual(@as(u32, 10000), section.picture_current_sizes.?[0].width);
        }
    }.run, .{ raw, version, tree.nodes.len, @as(u32, @intCast(pictures[0].picture_node)), @as(u32, @intCast(pictures[1].picture_node)), original.current_width, original.current_height, mode });
}

test "HWP5 picture current size intents repeat reset and reject invalid ownership" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var source = try @import("../text_source.zig").Source.open(a, input);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const version = source.header.version();
    const pictures = try @import("picture_sources.zig").read(a, raw, version, .base73);
    defer a.free(pictures);
    const components = try @import("drawing_component_sources.zig").read(a, raw, version);
    defer a.free(components);
    var empty: [0]model.Paragraph = .{};
    var tree = try @import("source_tree.zig").parse(a, raw, version, .{});
    defer tree.deinit(a);
    var section: model.Section = .{ .paragraphs = &empty, .source_record_count = tree.nodes.len };
    defer if (section.picture_current_sizes) |values| a.free(values);
    const command: Edit = .{ .section = 0, .picture_node = @intCast(pictures[0].picture_node), .width = 10000, .height = 6000 };
    try apply(a, raw, version, &section, command);
    const identity = section.picture_current_sizes.?.ptr;
    try apply(a, raw, version, &section, command);
    try std.testing.expect(identity == section.picture_current_sizes.?.ptr);
    try std.testing.expectEqual(@as(usize, 1), section.picture_current_sizes.?.len);
    try std.testing.expectError(error.InvalidPictureOwner, apply(a, raw, version, &section, .{ .section = 0, .picture_node = @intCast(pictures[0].component_node), .width = 1, .height = 2 }));
    try std.testing.expectEqual(@as(u32, 10000), section.picture_current_sizes.?[0].width);
    for (components) |component| if (component.component_node == pictures[0].component_node) {
        try apply(a, raw, version, &section, .{ .section = 0, .picture_node = command.picture_node, .width = component.current_width, .height = component.current_height });
        try std.testing.expect(section.picture_current_sizes == null);
        return;
    };
    return error.MissingPictureComponent;
}

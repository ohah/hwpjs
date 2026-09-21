const std = @import("std");
const set_ts_graphics = @import("emf_plus_set_ts_graphics.zig");
const palette_data = @import("emf_plus_palette.zig");
const image_values = @import("emf_plus_image_values.zig");
const smoothing_mode = @import("emf_plus_smoothing_mode.zig");
const text_rendering_hint = @import("emf_plus_text_rendering_hint.zig");
const compositing_mode = @import("emf_plus_compositing_mode.zig");
const compositing_quality = @import("emf_plus_compositing_quality.zig");
const filter_type = @import("emf_plus_filter_type.zig");
const pixel_offset_mode = @import("emf_plus_pixel_offset_mode.zig");
const transform_matrix = @import("emf_plus_transform_matrix.zig");

pub const OwnedPalette = struct {
    style: image_values.PaletteStyle,
    count: u32,
    entry_bytes: []u8,

    fn fromBorrowed(allocator: std.mem.Allocator, palette: palette_data.Palette) !OwnedPalette {
        return .{
            .style = palette.style,
            .count = palette.count,
            .entry_bytes = try allocator.dupe(u8, palette.entry_bytes),
        };
    }

    fn clone(self: OwnedPalette, allocator: std.mem.Allocator) !OwnedPalette {
        return .{ .style = self.style, .count = self.count, .entry_bytes = try allocator.dupe(u8, self.entry_bytes) };
    }

    fn deinit(self: *OwnedPalette, allocator: std.mem.Allocator) void {
        allocator.free(self.entry_bytes);
        self.* = undefined;
    }
};

pub const Summary = struct {
    flags: u16,
    basic_vga: bool,
    anti_alias_mode: smoothing_mode.SmoothingMode,
    text_render_hint: text_rendering_hint.TextRenderingHint,
    compositing_mode: compositing_mode.CompositingMode,
    compositing_quality: compositing_quality.CompositingQuality,
    render_origin_x: i16,
    render_origin_y: i16,
    text_contrast: u16,
    filter_type: filter_type.FilterType,
    pixel_offset: pixel_offset_mode.PixelOffsetMode,
    world_to_device: transform_matrix.TransformMatrix,
    palette_entries: ?u32,
};

pub const State = struct {
    summary: Summary,
    palette: ?OwnedPalette,

    pub fn fromParsed(allocator: std.mem.Allocator, parsed: set_ts_graphics.SetTSGraphics) !State {
        return .{
            .summary = summaryFromParsed(parsed),
            .palette = if (parsed.palette) |palette| try OwnedPalette.fromBorrowed(allocator, palette) else null,
        };
    }

    pub fn clone(self: State, allocator: std.mem.Allocator) !State {
        return .{
            .summary = self.summary,
            .palette = if (self.palette) |palette| try palette.clone(allocator) else null,
        };
    }

    pub fn deinit(self: *State, allocator: std.mem.Allocator) void {
        if (self.palette) |*palette| palette.deinit(allocator);
        self.* = undefined;
    }
};

fn summaryFromParsed(parsed: set_ts_graphics.SetTSGraphics) Summary {
    return .{
        .flags = parsed.flags,
        .basic_vga = parsed.basic_vga,
        .anti_alias_mode = parsed.anti_alias_mode,
        .text_render_hint = parsed.text_render_hint,
        .compositing_mode = parsed.compositing_mode,
        .compositing_quality = parsed.compositing_quality,
        .render_origin_x = parsed.render_origin_x,
        .render_origin_y = parsed.render_origin_y,
        .text_contrast = parsed.text_contrast,
        .filter_type = parsed.filter_type,
        .pixel_offset = parsed.pixel_offset,
        .world_to_device = parsed.world_to_device,
        .palette_entries = if (parsed.palette) |palette| palette.count else null,
    };
}

fn parsedValue(palette: ?palette_data.Palette) set_ts_graphics.SetTSGraphics {
    return .{
        .flags = if (palette == null) 0xfffc else 0xffff,
        .basic_vga = palette != null,
        .anti_alias_mode = .anti_alias_8x8,
        .text_render_hint = .clear_type_grid_fit,
        .compositing_mode = .source_copy,
        .compositing_quality = .assume_linear,
        .render_origin_x = -7,
        .render_origin_y = 9,
        .text_contrast = 12,
        .filter_type = .gaussian_quad,
        .pixel_offset = .half,
        .world_to_device = .{ .m11 = 1, .m12 = 2, .m21 = 3, .m22 = 4, .dx = 5, .dy = 6 },
        .palette = palette,
    };
}

test "EMF+ terminal-server graphics state owns palette and clones every fixed field" {
    var bytes = [_]u8{ 0x11, 0x22, 0x33, 0x44, 0xaa, 0xbb, 0xcc, 0xdd };
    const borrowed: palette_data.Palette = .{ .style = @bitCast(@as(u32, 0)), .count = 2, .entry_bytes = &bytes };
    var state = try State.fromParsed(std.testing.allocator, parsedValue(borrowed));
    defer state.deinit(std.testing.allocator);
    var copy = try state.clone(std.testing.allocator);
    defer copy.deinit(std.testing.allocator);
    bytes[0] = 0xff;
    state.palette.?.entry_bytes[1] = 0xee;
    try std.testing.expect(copy.palette != null);
    try std.testing.expectEqual(@as(u8, 0x11), copy.palette.?.entry_bytes[0]);
    try std.testing.expectEqual(@as(u8, 0x22), copy.palette.?.entry_bytes[1]);
    try std.testing.expectEqual(@as(u16, 0xffff), copy.summary.flags);
    try std.testing.expect(copy.summary.basic_vga);
    try std.testing.expectEqual(smoothing_mode.SmoothingMode.anti_alias_8x8, copy.summary.anti_alias_mode);
    try std.testing.expectEqual(text_rendering_hint.TextRenderingHint.clear_type_grid_fit, copy.summary.text_render_hint);
    try std.testing.expectEqual(compositing_mode.CompositingMode.source_copy, copy.summary.compositing_mode);
    try std.testing.expectEqual(compositing_quality.CompositingQuality.assume_linear, copy.summary.compositing_quality);
    try std.testing.expectEqual(@as(?u32, 2), copy.summary.palette_entries);
    try std.testing.expectEqual(@as(i16, -7), copy.summary.render_origin_x);
    try std.testing.expectEqual(@as(i16, 9), copy.summary.render_origin_y);
    try std.testing.expectEqual(@as(u16, 12), copy.summary.text_contrast);
    try std.testing.expectEqual(filter_type.FilterType.gaussian_quad, copy.summary.filter_type);
    try std.testing.expectEqual(pixel_offset_mode.PixelOffsetMode.half, copy.summary.pixel_offset);
    try std.testing.expectEqual(@as(f32, 1), copy.summary.world_to_device.m11);
    try std.testing.expectEqual(@as(f32, 2), copy.summary.world_to_device.m12);
    try std.testing.expectEqual(@as(f32, 3), copy.summary.world_to_device.m21);
    try std.testing.expectEqual(@as(f32, 4), copy.summary.world_to_device.m22);
    try std.testing.expectEqual(@as(f32, 5), copy.summary.world_to_device.dx);
    try std.testing.expectEqual(@as(f32, 6), copy.summary.world_to_device.dy);
}

fn allocationExercise(allocator: std.mem.Allocator) !void {
    const bytes = [_]u8{ 1, 2, 3, 4 };
    const borrowed: palette_data.Palette = .{ .style = @bitCast(@as(u32, 0)), .count = 1, .entry_bytes = &bytes };
    var state = try State.fromParsed(allocator, parsedValue(borrowed));
    defer state.deinit(allocator);
    var copy = try state.clone(allocator);
    defer copy.deinit(allocator);
}

test "EMF+ terminal-server graphics state survives every allocation failure" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationExercise, .{});
}

//! BorderFill payload만 소유합니다. 선택/ID발급/History는 상위 기존 계층 책임입니다.
const std = @import("std");
const p = @import("../../model/border_fill_patch.zig");
const Fill = @import("../docinfo/fill.zig");
const RGB = @import("../../model/rgb_color.zig");
pub fn observe(input: []const u8) !p.Value {
    const source = try @import("../docinfo/border_fill.zig").BorderFill.parseWithAdditionalPolicy(input, .observed_absent);
    var out: p.Value = .{};
    for (source.borders[0..4], 0..) |edge, i| out.edges[i] = .{ .style = p.fromHwp5(edge.kind), .width_hundredth_mm = if (edge.width < p.widths.len) p.widths[edge.width] else null, .color = if (edge.color <= 0xffffff) RGB.hwp5(edge.color) else null };
    if (source.fill.data != .known) return out;
    const f = source.fill.data.known;
    if (f.image != null or (f.extra.len != 0 and !(f.extra.len == 1 and (source.fill.flags == 1 or source.fill.flags == 4)))) return out;
    if (source.fill.flags == 0) {
        out.background = .none;
        return out;
    }
    if (source.fill.flags == 1) {
        const pattern = f.pattern orelse return out;
        if (pattern.background > 0xffffff) return out;
        if (pattern.kind == -1) {
            out.background = .{ .solid = .{ .color = RGB.hwp5(pattern.background), .hatch_color = if (pattern.foreground <= 0xffffff) RGB.hwp5(pattern.foreground) else null } };
            return out;
        }
        if (pattern.kind < 1 or pattern.kind > 6 or pattern.foreground > 0xffffff) return out;
        out.background = .{ .hatch = .{ .face = RGB.hwp5(pattern.background), .hatch = RGB.hwp5(pattern.foreground), .style = @fromBackingInt(@intCast(pattern.kind - 1)) } };
        return out;
    }
    if (source.fill.flags == 4) {
        const g = f.gradient orelse return out;
        const center = f.blurCenter() orelse return out;
        if (g.kind != 1 or g.count() != 2 or g.angle >= 360 or g.center_x > 100 or g.center_y > 100 or g.blur > 100 or center > 100) return out;
        const c0 = g.color(0).?;
        const c1 = g.color(1).?;
        if (c0 > 0xffffff or c1 > 0xffffff) return out;
        out.background = .{ .linear = .{ .colors = .{ RGB.hwp5(c0), RGB.hwp5(c1) }, .angle = @intCast(g.angle), .center_x = @intCast(g.center_x), .center_y = @intCast(g.center_y), .step = @intCast(g.blur), .step_center = center } };
    }
    return out;
}
fn appendInt(a: std.mem.Allocator, out: *std.ArrayList(u8), comptime T: type, value: T) !void {
    var raw: [@sizeOf(T)]u8 = undefined;
    std.mem.writeInt(T, &raw, value, .little);
    try out.appendSlice(a, &raw);
}
pub fn write(a: std.mem.Allocator, input: []const u8, patch: p.Patch, limit: usize) ![]u8 {
    if (input.len > limit) return error.LimitExceeded;
    try p.validate(patch);
    const source = try @import("../docinfo/border_fill.zig").BorderFill.parseWithAdditionalPolicy(input, .observed_absent);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    try out.appendSlice(a, input[0..32]);
    for (patch.border.edges, 0..) |edge, i| if (edge) |value| {
        const offset = 2 + i * 6;
        if (value.style) |style| out.items[offset] = try p.hwp5Style(style);
        if (value.width_hundredth_mm) |width| out.items[offset + 1] = try p.widthCode(width);
        if (value.color) |color| std.mem.writeInt(u32, out.items[offset + 2 ..][0..4], RGB.hwp5(color), .little);
    };
    if (patch.background) |background| {
        if (source.fill.data != .known) return error.UnsupportedOpaqueBackground;
        const old = source.fill.data.known;
        if (old.image != null or source.fill.flags & ~@as(u32, 7) != 0) return error.UnsupportedOpaqueBackground;
        if (old.extra.len != 0 and !(old.extra.len == 1 and (source.fill.flags == 1 or source.fill.flags == 4))) return error.UnsupportedBackgroundAlphaCombination;
        if (old.pattern) |pattern| if (pattern.kind != -1 and (pattern.kind < 1 or pattern.kind > 6)) return error.UnsupportedBackgroundPattern;
        if (old.gradient) |g| if (g.kind != 1 or old.additional.len != 1) return error.UnsupportedBackgroundGradient;
        if (old.additional.len != 0 and old.gradient == null) return error.UnsupportedBackgroundExtension;
        switch (background) {
            .none => try appendInt(a, &out, u32, 0),
            .solid => |v| {
                try appendInt(a, &out, u32, 1);
                try appendInt(a, &out, u32, RGB.hwp5(v.color));
                const hatch = if (v.hatch_color) |c| RGB.hwp5(c) else if (old.pattern) |pattern| pattern.foreground else return error.IncompleteBackgroundCreation;
                try appendInt(a, &out, u32, hatch);
                try appendInt(a, &out, i32, -1);
            },
            .hatch => |v| {
                try appendInt(a, &out, u32, 1);
                try appendInt(a, &out, u32, RGB.hwp5(v.face));
                try appendInt(a, &out, u32, RGB.hwp5(v.hatch));
                try appendInt(a, &out, i32, @intCast(@backingInt(v.style) + 1));
            },
            .linear => |g| {
                try appendInt(a, &out, u32, 4);
                try out.append(a, 1);
                try appendInt(a, &out, u32, g.angle);
                try appendInt(a, &out, u32, g.center_x);
                try appendInt(a, &out, u32, g.center_y);
                try appendInt(a, &out, u32, g.step);
                try appendInt(a, &out, u32, 2);
                for (g.colors) |color| try appendInt(a, &out, u32, RGB.hwp5(color));
            },
        }
        if (background == .linear) {
            try appendInt(a, &out, u32, 1);
            try out.append(a, background.linear.step_center);
        } else if (old.additional_present or old.extra.len != 0) {
            try appendInt(a, &out, u32, 0);
        }
        if (background != .none and old.extra.len == 1) try out.appendSlice(a, old.extra);
    } else try out.appendSlice(a, input[32..]);
    if (out.items.len > limit) return error.LimitExceeded;
    return out.toOwnedSlice(a);
}

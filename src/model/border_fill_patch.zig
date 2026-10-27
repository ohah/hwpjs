//! 선택 소유 resource의 sparse intent. 기존 resource를 제자리 변경하지 않습니다.
const std = @import("std");
pub const Style = enum { NONE, SOLID, DASH, DOT, DASH_DOT, DASH_DOT_DOT, LONG_DASH, DOUBLE_SLIM, SLIM_THICK, THICK_SLIM, SLIM_THICK_SLIM, WAVE, DOUBLEWAVE, THICK3D, THICKREV3D, @"3D", REV3D };
pub const widths = [_]u16{ 10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 100, 150, 200, 300, 400, 500 };
pub const Edge = struct { style: ?Style = null, width_hundredth_mm: ?u16 = null, color: ?u32 = null };
pub const Border = struct { edges: [4]?Edge = @splat(null) };
pub const Hatch = enum { HORIZONTAL, VERTICAL, BACK_SLASH, SLASH, CROSS, CROSS_DIAGONAL };
pub const Solid = struct { color: u32, hatch_color: ?u32 = null };
pub const Pattern = struct { face: u32, hatch: u32, style: Hatch };
pub const Linear = struct { colors: [2]u32, angle: u16, center_x: u8, center_y: u8, step: u8, step_center: u8 };
pub const Background = union(enum) { none, solid: Solid, hatch: Pattern, linear: Linear };
pub const Patch = struct { border: Border = .{}, background: ?Background = null };
pub fn edgeHas(v: Edge) bool {
    return v.style != null or v.width_hundredth_mm != null or v.color != null;
}
pub fn has(v: Patch) bool {
    if (v.background != null) return true;
    for (v.border.edges) |e| if (e) |x| if (edgeHas(x)) return true;
    return false;
}
pub fn widthCode(width: u16) !u8 {
    for (widths, 0..) |v, i| if (v == width) return @intCast(i);
    return error.UnsupportedBorderWidth;
}
pub fn validate(patch: Patch) !void {
    for (patch.border.edges) |e| if (e) |x| {
        if (x.width_hundredth_mm) |width| _ = try widthCode(width);
        if (x.color) |color| try @import("rgb_color.zig").validate(color);
    };
    if (patch.background) |background| switch (background) {
        .none => {},
        .solid => |v| {
            try @import("rgb_color.zig").validate(v.color);
            if (v.hatch_color) |color| try @import("rgb_color.zig").validate(color);
        },
        .hatch => |p| {
            try @import("rgb_color.zig").validate(p.face);
            try @import("rgb_color.zig").validate(p.hatch);
        },
        .linear => |g| {
            for (g.colors) |color| try @import("rgb_color.zig").validate(color);
            if (g.angle >= 360 or g.center_x > 100 or g.center_y > 100 or g.step > 100 or g.step_center > 100) return error.InvalidBackgroundGradient;
        },
    };
}
pub fn merge(old: Patch, patch: Patch) Patch {
    var out = old;
    for (patch.border.edges, 0..) |e, i| if (e) |value| {
        var current = out.border.edges[i] orelse Edge{};
        inline for (.{ "style", "width_hundredth_mm", "color" }) |name| if (@field(value, name)) |v| {
            @field(current, name) = v;
        };
        out.border.edges[i] = current;
    };
    if (patch.background) |b| {
        var next = b;
        if (next == .solid and next.solid.hatch_color == null) if (old.background) |previous| {
            next.solid.hatch_color = switch (previous) {
                .solid => |v| v.hatch_color,
                .hatch => |v| v.hatch,
                else => null,
            };
        };
        out.background = next;
    }
    return out;
}
/// BorderFill context만 사용합니다. 장식선 enum table25를 복제하지 않습니다.
/// 나머지 H5 의미 매핑은 독립 원본/Native 검증 전에는 명시 거부합니다.
pub fn hwp5Style(style: Style) !u8 {
    return switch (style) {
        .NONE => 0,
        .SOLID => 1,
        .DOUBLE_SLIM => 8,
        else => error.UnsupportedBorderLineStyle,
    };
}
pub fn fromHwp5(raw: u8) ?Style {
    return switch (raw) {
        0 => .NONE,
        1 => .SOLID,
        8 => .DOUBLE_SLIM,
        else => null,
    };
}
pub const EdgeValue = struct { style: ?Style = null, width_hundredth_mm: ?u16 = null, color: ?u32 = null };
pub const Value = struct { edges: [4]EdgeValue = @splat(.{}), background: ?Background = null };
pub fn matches(value: Value, patch: Patch) bool {
    for (patch.border.edges, 0..) |edge, i| if (edge) |expected| {
        if (expected.style) |v| if (value.edges[i].style != v) return false;
        if (expected.width_hundredth_mm) |v| if (value.edges[i].width_hundredth_mm != v) return false;
        if (expected.color) |v| if (value.edges[i].color != v) return false;
    };
    if (patch.background) |background| {
        if (value.background == null or std.meta.activeTag(value.background.?) != std.meta.activeTag(background)) return false;
        if (background == .solid) {
            if (value.background.?.solid.color != background.solid.color) return false;
            if (background.solid.hatch_color) |color| if (value.background.?.solid.hatch_color != color) return false;
        } else if (!std.meta.eql(value.background.?, background)) return false;
    }
    return true;
}

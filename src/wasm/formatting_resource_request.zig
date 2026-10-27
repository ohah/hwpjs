//! resource별 허용키를 검사합니다. null/미지키를 기본값으로 바꾸지 않습니다.
const std = @import("std");
const p = @import("../model/border_fill_patch.zig");
const r = @import("formatting_patch_request.zig");
const V = std.json.Value;
pub fn decode(owner: V) !p.Patch {
    var result: p.Patch = .{};
    if (r.get(owner, "border")) |border| {
        try r.keys(border, &.{ "left", "right", "top", "bottom" });
        inline for (.{ "left", "right", "top", "bottom" }, 0..) |name, i| if (r.get(border, name)) |edge| {
            try r.keys(edge, &.{ "style", "widthHundredthMm", "color" });
            var value: p.Edge = .{};
            if (r.get(edge, "style")) |v| value.style = try r.enumeration(p.Style, v);
            if (r.get(edge, "widthHundredthMm")) |v| value.width_hundredth_mm = @intCast(try r.uint(v, 500));
            if (r.get(edge, "color")) |v| value.color = @intCast(try r.uint(v, 0xffffff));
            if (p.edgeHas(value)) result.border.edges[i] = value;
        };
    }
    if (r.get(owner, "background")) |background| {
        const Kind = enum { none, solid, hatch, linear };
        const kind = try r.enumeration(Kind, try r.required(background, "kind"));
        result.background = switch (kind) {
            .none => blk: {
                try r.keys(background, &.{"kind"});
                break :blk .none;
            },
            .solid => blk: {
                try r.keys(background, &.{ "kind", "color", "hatchColor" });
                break :blk .{ .solid = .{ .color = @intCast(try r.uint(try r.required(background, "color"), 0xffffff)), .hatch_color = if (r.get(background, "hatchColor")) |v| @as(u32, @intCast(try r.uint(v, 0xffffff))) else null } };
            },
            .hatch => blk: {
                try r.keys(background, &.{ "kind", "faceColor", "hatchColor", "style" });
                break :blk .{ .hatch = .{ .face = @intCast(try r.uint(try r.required(background, "faceColor"), 0xffffff)), .hatch = @intCast(try r.uint(try r.required(background, "hatchColor"), 0xffffff)), .style = try r.enumeration(p.Hatch, try r.required(background, "style")) } };
            },
            .linear => blk: {
                try r.keys(background, &.{ "kind", "colors", "angle", "centerX", "centerY", "step", "stepCenter" });
                const colors = try r.array(try r.required(background, "colors"));
                if (colors.len != 2) return error.UnsupportedBackgroundStops;
                break :blk .{ .linear = .{ .colors = .{ @intCast(try r.uint(colors[0], 0xffffff)), @intCast(try r.uint(colors[1], 0xffffff)) }, .angle = @intCast(try r.uint(try r.required(background, "angle"), 359)), .center_x = @intCast(try r.uint(try r.required(background, "centerX"), 100)), .center_y = @intCast(try r.uint(try r.required(background, "centerY"), 100)), .step = @intCast(try r.uint(try r.required(background, "step"), 100)), .step_center = @intCast(try r.uint(try r.required(background, "stepCenter"), 100)) } };
            },
        };
    }
    try p.validate(result);
    return result;
}

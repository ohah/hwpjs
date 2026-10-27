//! 원본 조회의 unknown과 명시 새 intent의 writer 가능성을 구분합니다.
const std = @import("std");
const p = @import("formatting_projection.zig");
const Resource = @import("border_fill_patch.zig");
pub fn field(a: std.mem.Allocator, value: Resource.Value, name: []const u8) !p.Observation {
    if (std.mem.endsWith(u8, name, ".border")) {
        var out = p.map(a);
        inline for (.{ "left", "right", "top", "bottom" }, 0..) |edge, i| {
            const v = value.edges[i];
            if (v.style == null or v.width_hundredth_mm == null or v.color == null) return p.unknown("UnknownBorderFillValue", "UnknownSourceValue");
            var row = p.map(a);
            try p.put(a, &row, "style", try p.text(a, @tagName(v.style.?)));
            try p.put(a, &row, "widthHundredthMm", p.integer(v.width_hundredth_mm.?));
            try p.put(a, &row, "color", p.integer(v.color.?));
            try p.put(a, &out, edge, row);
        }
        return p.known(out, true, null, null);
    }
    const background = value.background orelse return p.unknown("UnknownBorderFillValue", "UnknownSourceValue");
    var out = p.map(a);
    switch (background) {
        .none => try p.put(a, &out, "kind", try p.text(a, "none")),
        .solid => |v| {
            try p.put(a, &out, "kind", try p.text(a, "solid"));
            try p.put(a, &out, "color", p.integer(v.color));
            if (v.hatch_color) |color| try p.put(a, &out, "hatchColor", p.integer(color));
        },
        .hatch => |v| {
            try p.put(a, &out, "kind", try p.text(a, "hatch"));
            try p.put(a, &out, "faceColor", p.integer(v.face));
            try p.put(a, &out, "hatchColor", p.integer(v.hatch));
            try p.put(a, &out, "style", try p.text(a, @tagName(v.style)));
        },
        .linear => |g| {
            try p.put(a, &out, "kind", try p.text(a, "linear"));
            var colors = p.V{ .array = std.json.Array.init(a) };
            for (g.colors) |color| try colors.array.append(p.integer(color));
            try p.put(a, &out, "colors", colors);
            try p.put(a, &out, "angle", p.integer(g.angle));
            try p.put(a, &out, "centerX", p.integer(g.center_x));
            try p.put(a, &out, "centerY", p.integer(g.center_y));
            try p.put(a, &out, "step", p.integer(g.step));
            try p.put(a, &out, "stepCenter", p.integer(g.step_center));
        },
    }
    return p.known(out, true, null, null);
}
pub fn unavailable(err: anyerror) p.Observation {
    return p.unknown(@errorName(err), "MissingSourceField");
}

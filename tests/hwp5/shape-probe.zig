const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn payload(a: std.mem.Allocator, out: *std.ArrayList(u8), value: core.hwp5.docinfo.Value) !void {
    switch (value) {
        .char_shape => |v| {
            for (v.font_ids) |x| try int(a, out, u16, x);
            for (v.ratios) |x| try int(a, out, u8, x);
            for (v.spacing) |x| try int(a, out, i8, x);
            for (v.relative_sizes) |x| try int(a, out, u8, x);
            for (v.offsets) |x| try int(a, out, i8, x);
            try int(a, out, i32, v.size);
            try int(a, out, u32, v.attributes);
            try int(a, out, i8, v.shadow_x);
            try int(a, out, i8, v.shadow_y);
            try int(a, out, u32, v.text_color);
            try int(a, out, u32, v.underline_color);
            try int(a, out, u32, v.shade_color);
            try int(a, out, u32, v.shadow_color);
            if (v.border_fill_id) |x| try int(a, out, u16, x);
            if (v.strike_color) |x| try int(a, out, u32, x);
            try out.appendSlice(a, v.extra);
        },
        .para_shape => |v| {
            try int(a, out, u32, v.attributes);
            try int(a, out, i32, v.left);
            try int(a, out, i32, v.right);
            try int(a, out, i32, v.indent);
            try int(a, out, i32, v.before);
            try int(a, out, i32, v.after);
            try int(a, out, i32, v.legacy_spacing);
            try int(a, out, u16, v.tab_def_id);
            try int(a, out, u16, v.head_id);
            try int(a, out, u16, v.border_fill_id);
            for (v.border_spacing) |x| try int(a, out, i16, x);
            if (v.attributes2) |x| try int(a, out, u32, x);
            if (v.modern_spacing) |x| {
                try int(a, out, u32, x.attributes);
                try int(a, out, i32, x.value);
            }
            if (v.level) |x| try int(a, out, u32, x);
            try out.appendSlice(a, v.extra);
        },
        .border_fill => |v| {
            try int(a, out, u16, v.attributes);
            for (v.borders) |b| {
                try int(a, out, u8, b.kind);
                try int(a, out, u8, b.width);
                try int(a, out, u32, b.color);
            }
            try int(a, out, u32, v.fill.flags);
            switch (v.fill.data) {
                .unknown => |raw| try out.appendSlice(a, raw),
                .known => |k| {
                    if (k.pattern) |p| {
                        try int(a, out, u32, p.background);
                        try int(a, out, u32, p.foreground);
                        try int(a, out, i32, p.kind);
                    }
                    if (k.gradient) |g| {
                        try int(a, out, u8, g.kind);
                        try int(a, out, u32, g.angle);
                        try int(a, out, u32, g.center_x);
                        try int(a, out, u32, g.center_y);
                        try int(a, out, u32, g.blur);
                        try int(a, out, u32, @intCast(g.count()));
                        for (0..g.positions.len / 4) |i| try int(a, out, i32, g.position(i).?);
                        for (0..g.count()) |i| try int(a, out, u32, g.color(i).?);
                    }
                    if (k.image) |img| {
                        try int(a, out, u8, img.mode);
                        try int(a, out, i8, img.picture.contrast);
                        try int(a, out, i8, img.picture.brightness);
                        try int(a, out, u8, img.picture.effect);
                        try int(a, out, u16, img.picture.bin_data_id);
                    }
                    try int(a, out, u32, @intCast(k.additional.len));
                    try out.appendSlice(a, k.additional);
                    try out.appendSlice(a, k.extra);
                },
            }
        },
        else => unreachable,
    }
}

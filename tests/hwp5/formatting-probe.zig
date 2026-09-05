const std = @import("std");
const core = @import("hwpjs");
const resources = @import("resource-probe.zig");
const int = resources.int;
const string = resources.string;
fn head(a: std.mem.Allocator, out: *std.ArrayList(u8), h: anytype) !void {
    try int(a, out, u32, h.attributes);
    try int(a, out, i16, h.width_adjustment);
    try int(a, out, i16, h.text_distance);
    try int(a, out, u32, h.char_shape_id);
}
fn level(a: std.mem.Allocator, out: *std.ArrayList(u8), l: anytype) !void {
    try head(a, out, l.head);
    try string(a, out, l.format_utf16);
}
/// Test-only typed reconstruction, not a product writer.
pub fn payload(a: std.mem.Allocator, out: *std.ArrayList(u8), value: core.hwp5.docinfo.Value) !void {
    switch (value) {
        .tab_def => |v| {
            try int(a, out, u32, v.attributes);
            try int(a, out, u32, @intCast(v.count()));
            for (0..v.count()) |i| {
                const t = v.get(i).?;
                try int(a, out, u32, t.position);
                try int(a, out, u8, t.kind);
                try int(a, out, u8, t.fill);
                try int(a, out, u16, t.reserved);
            }
            try out.appendSlice(a, v.extra);
        },
        .numbering => |v| {
            for (v.levels) |l| try level(a, out, l);
            try int(a, out, u16, v.start);
            if (v.starts) |starts| {
                for (starts) |s| try int(a, out, u32, s);
            }
            if (v.extension) |ext| {
                for (ext.levels) |l| try level(a, out, l);
                for (ext.starts) |s| try int(a, out, u32, s);
            }
            try out.appendSlice(a, v.extra);
        },
        .bullet => |v| {
            try head(a, out, v.head);
            try int(a, out, u16, v.character);
            if (v.image) |img| {
                try int(a, out, i32, img.identifier);
                try int(a, out, i8, img.contrast);
                try int(a, out, i8, img.brightness);
                try int(a, out, u8, img.effect);
                try int(a, out, u16, img.bin_data_id);
            }
            if (v.check_character) |c| try int(a, out, u16, c);
            try out.appendSlice(a, v.extra);
        },
        .style => |v| {
            try string(a, out, v.local_utf16);
            try string(a, out, v.english_utf16);
            try int(a, out, u8, v.attributes);
            try int(a, out, u8, v.next_style_id);
            try int(a, out, i16, v.language_id);
            try int(a, out, u16, v.para_shape_id);
            try int(a, out, u16, v.char_shape_id);
            try out.appendSlice(a, v.extra);
        },
        else => unreachable,
    }
}

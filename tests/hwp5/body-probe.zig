const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const version = try r.readInt(u32);
    var it = try core.hwp5.body.Iterator.init(bytes[r.offset..], .{ .raw = version }, .{ .max_records = limit });
    var out: std.ArrayList(u8) = .empty;
    defer out.deinit(a);
    while (try it.next()) |record| {
        const f = record.framing;
        try int(a, &out, u32, f.tag);
        try int(a, &out, u32, f.level);
        try int(a, &out, u32, @intCast(f.raw.len));
        try out.appendSlice(a, f.raw[0 .. f.raw.len - f.payload.len]);
        switch (record.value) {
            .header => |h| {
                try int(a, &out, u32, h.chars_raw);
                try int(a, &out, u32, h.control_mask);
                try int(a, &out, u16, h.para_shape_id);
                try int(a, &out, u8, h.style_id);
                try int(a, &out, u8, h.break_flags);
                try int(a, &out, u16, h.char_shape_count);
                try int(a, &out, u16, h.range_tag_count);
                try int(a, &out, u16, h.line_segment_count);
                try int(a, &out, u32, h.instance_id);
                if (h.merge_tracking) |m| try int(a, &out, u16, m);
                try out.appendSlice(a, h.extra);
                try int(a, &out, u32, h.characterUnits());
                try int(a, &out, u32, @intFromBool(h.countHighBit()));
            },
            .text => |text| {
                var tokens = text.tokens();
                var n: u32 = 0;
                while (try tokens.next()) |token| {
                    n += 1;
                    switch (token.value) {
                        .text => |raw| try out.appendSlice(a, raw),
                        .control => |c| {
                            try int(a, &out, u16, c.code);
                            try out.appendSlice(a, c.data);
                            if (c.closing_code) |end| try int(a, &out, u16, end);
                        },
                    }
                }
                try int(a, &out, u32, n);
                tokens = text.tokens();
                while (try tokens.next()) |token| {
                    try int(a, &out, u32, @intCast(token.start_unit));
                    try int(a, &out, u32, @intCast(token.raw.len / 2));
                    switch (token.value) {
                        .text => {
                            try int(a, &out, u32, 0);
                            try int(a, &out, u32, 0xffffffff);
                        },
                        .control => |c| {
                            try int(a, &out, u32, @intFromEnum(c.kind) + 1);
                            try int(a, &out, u32, c.code);
                        },
                    }
                }
            },
            .unknown => try out.appendSlice(a, f.payload),
            .char_runs, .line_segments, .range_tags => try @import("metadata-probe.zig").payload(a, &out, record.value),
        }
    }
    return out.toOwnedSlice(a);
}

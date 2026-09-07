const std = @import("std");
const core = @import("hwpjs");
const int = @import("resource-probe.zig").int;
pub fn run(a: std.mem.Allocator, bytes: []const u8, limit: usize) ![]u8 {
    var r: core.Reader = .{ .bytes = bytes };
    const mode = try r.readInt(u8);
    if (mode > 4) return error.InvalidHistoryProbeMode;
    const max_payload = try r.readInt(u32);
    const raw = bytes[r.offset..];
    const options: core.hwp5.history.record.Options = .{ .max_records = limit, .max_payload_bytes = max_payload };
    const layout: core.hwp5.history.value.StartLayout = if (mode == 2 or mode == 4) .observed_option_first else .spec_flag_first;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(a);
    if (mode != 0) {
        const item = try core.hwp5.history.Item.parse(raw, .{ .start_layout = layout, .framing = options, .date_layout = if (mode >= 3) .observed_systemtime16 else .preserve_raw });
        try int(a, &out, u32, item.start.flags);
        try int(a, &out, u32, item.start.option);
        inline for (std.meta.fields(@TypeOf(item.report))) |field| try int(a, &out, u32, @intCast(@field(item.report, field.name)));
    }
    var it = core.hwp5.history.record.Iterator.init(raw, options);
    while (try it.next()) |rec| {
        try int(a, &out, u8, rec.tag);
        try int(a, &out, u32, @intCast(rec.payload.len));
        if (mode == 0) {
            try out.appendSlice(a, rec.payload);
        } else switch (try core.hwp5.history.value.parse(rec.tag, rec.payload, layout)) {
            .start => |v| {
                if (layout == .spec_flag_first) {
                    try int(a, &out, u16, v.flags);
                    try int(a, &out, u32, v.option);
                } else {
                    try int(a, &out, u32, v.option);
                    try int(a, &out, u16, v.flags);
                }
                try out.appendSlice(a, v.extra);
            },
            .version => |v| {
                try int(a, &out, u32, v.number);
                try out.appendSlice(a, v.extra);
            },
            .end => {},
            .text, .date_deferred, .unknown => |v| try out.appendSlice(a, v),
        }
    }
    return out.toOwnedSlice(a);
}

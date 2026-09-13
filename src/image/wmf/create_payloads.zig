const std = @import("std");
const Header = @import("header.zig").Header;
const records = @import("records.zig");
const color_ref = @import("color_ref.zig");
const pen = @import("pen.zig");
const brush = @import("brush.zig");
const font = @import("font.zig");

pub const Report = struct {
    pens: usize,
    brushes: usize,
    fonts: usize,
    nonzero_color_reserved: usize,
    nonempty_face_names: usize,
    face_name_bytes: usize,
};

pub fn inspect(bytes: []const u8, header: Header, framing: records.Summary, color_policy: color_ref.ReservedPolicy) !Report {
    var iterator = try records.Iterator.init(bytes, header.records_offset, framing.eof_end);
    var report: Report = .{ .pens = 0, .brushes = 0, .fonts = 0, .nonzero_color_reserved = 0, .nonempty_face_names = 0, .face_name_bytes = 0 };
    while (try iterator.next()) |record| switch (record.function) {
        0x02fa => {
            const value = try pen.parse(record, color_policy);
            report.pens += 1;
            if (value.color.reserved != 0) report.nonzero_color_reserved += 1;
        },
        0x02fc => {
            const value = try brush.parse(record, color_policy);
            report.brushes += 1;
            if (value.color.reserved != 0) report.nonzero_color_reserved += 1;
        },
        0x02fb => {
            const value = try font.parse(record);
            report.fonts += 1;
            report.face_name_bytes += value.face_name.len;
            if (value.face_name.len != 0) report.nonempty_face_names += 1;
        },
        else => {},
    };
    return report;
}

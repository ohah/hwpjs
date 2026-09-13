const Header = @import("header.zig").Header;
const records = @import("records.zig");
const text_align = @import("text_align.zig");
const ext_text_out = @import("ext_text_out.zig");
const escape = @import("escape.zig");

pub const Report = struct {
    alignments: usize,
    alignment_baseline: usize,
    alignment_update_cp: usize,
    ext_texts: usize,
    string_bytes: usize,
    string_padding: usize,
    nonzero_string_padding: usize,
    dx_values: usize,
    dx_sum: i64,
    x_sum: i64,
    y_sum: i64,
    escapes: usize,
    enhanced_metafile_escapes: usize,
    escape_bytes: usize,
    escape_padding: usize,
    nonzero_escape_padding: usize,
};

pub fn inspect(bytes: []const u8, header: Header, framing: records.Summary, rectangle_layout: ext_text_out.RectangleLayout) !Report {
    var iterator = try records.Iterator.init(bytes, header.records_offset, framing.eof_end);
    var report: Report = .{ .alignments = 0, .alignment_baseline = 0, .alignment_update_cp = 0, .ext_texts = 0, .string_bytes = 0, .string_padding = 0, .nonzero_string_padding = 0, .dx_values = 0, .dx_sum = 0, .x_sum = 0, .y_sum = 0, .escapes = 0, .enhanced_metafile_escapes = 0, .escape_bytes = 0, .escape_padding = 0, .nonzero_escape_padding = 0 };
    while (try iterator.next()) |record| switch (record.function) {
        0x012e => {
            const value = try text_align.parse(record);
            report.alignments += 1;
            if ((value.raw & 0x18) == 0x18) report.alignment_baseline += 1;
            if ((value.raw & 1) != 0) report.alignment_update_cp += 1;
        },
        0x0a32 => {
            const value = try ext_text_out.parse(record, rectangle_layout);
            report.ext_texts += 1;
            report.string_bytes += value.string.len;
            report.x_sum += value.x;
            report.y_sum += value.y;
            if (value.padding) |padding| {
                report.string_padding += 1;
                if (padding != 0) report.nonzero_string_padding += 1;
            }
            report.dx_values += value.dx_count;
            for (0..value.dx_count) |index| report.dx_sum += try value.dx(index);
        },
        0x0626 => {
            const value = try escape.parse(record);
            report.escapes += 1;
            report.escape_bytes += value.data.len;
            if (value.function_raw == 0x000f) report.enhanced_metafile_escapes += 1;
            if (value.padding) |padding| {
                report.escape_padding += 1;
                if (padding != 0) report.nonzero_escape_padding += 1;
            }
        },
        else => {},
    };
    return report;
}

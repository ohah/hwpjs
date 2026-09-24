const std = @import("std");
const part_tree = @import("xml_part_tree.zig");
const document_xml = @import("document_xml.zig");

pub const line_seg_array_name = "linesegarray";

pub const Options = struct {
    max_paragraphs: usize = 2_000_000,
    max_direct_children: usize = 4_000_000,
};

/// Direct PType structure only. Missing or extra children remain diagnostic;
/// this does not impose a serialization order or interpret line segments.
pub const Report = struct {
    sections: usize = 0,
    paragraphs: usize = 0,
    direct_runs: usize = 0,
    line_seg_arrays: usize = 0,
    paragraphs_without_run: usize = 0,
    paragraphs_without_line_seg_array: usize = 0,
    paragraphs_with_multiple_line_seg_arrays: usize = 0,
    other_direct: usize = 0,
    foreign_direct: usize = 0,
};

pub fn inspect(sections: []const part_tree.Tree, options: Options) !Report {
    var report: Report = .{};
    var direct_children: usize = 0;
    for (sections) |section| {
        if (section.part_kind != .section) return error.InvalidPartKind;
        for (section.elements) |element| {
            if (!element.is(document_xml.paragraph_uri, "p")) continue;
            if (report.paragraphs == options.max_paragraphs) return error.LimitExceeded;
            report.paragraphs += 1;
            var runs: usize = 0;
            var segments: usize = 0;
            var cursor = element.first_child;
            while (cursor) |child_index| : (cursor = section.elements[child_index].next_sibling) {
                if (direct_children == options.max_direct_children) return error.LimitExceeded;
                direct_children += 1;
                const child = section.elements[child_index];
                if (child.is(document_xml.paragraph_uri, "run")) {
                    runs += 1;
                    report.direct_runs += 1;
                } else if (child.is(document_xml.paragraph_uri, line_seg_array_name)) {
                    segments += 1;
                    report.line_seg_arrays += 1;
                } else {
                    report.other_direct += 1;
                    report.foreign_direct += @intFromBool(!std.mem.eql(u8, child.name.uri, document_xml.paragraph_uri));
                }
            }
            report.paragraphs_without_run += @intFromBool(runs == 0);
            report.paragraphs_without_line_seg_array += @intFromBool(segments == 0);
            report.paragraphs_with_multiple_line_seg_arrays += @intFromBool(segments > 1);
        }
        report.sections += 1;
    }
    return report;
}

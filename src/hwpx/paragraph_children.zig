const std = @import("std");
const xml = @import("../xml/root.zig");
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

pub const ScanState = struct { direct_children: usize = 0 };
pub const ParagraphState = struct { runs: usize = 0, arrays: usize = 0 };

pub fn noteParagraph(report: *Report, options: Options) !void {
    if (report.paragraphs == options.max_paragraphs) return error.LimitExceeded;
    report.paragraphs += 1;
}

pub fn noteDirectChild(name: xml.namespaces.ExpandedName, report: *Report, options: Options, scan: *ScanState, paragraph: *ParagraphState) !void {
    if (scan.direct_children == options.max_direct_children) return error.LimitExceeded;
    scan.direct_children += 1;
    if (std.mem.eql(u8, name.uri, document_xml.paragraph_uri) and name.local.equals("run", false)) {
        paragraph.runs += 1;
        report.direct_runs += 1;
    } else if (std.mem.eql(u8, name.uri, document_xml.paragraph_uri) and name.local.equals(line_seg_array_name, false)) {
        paragraph.arrays += 1;
        report.line_seg_arrays += 1;
    } else {
        report.other_direct += 1;
        report.foreign_direct += @intFromBool(!std.mem.eql(u8, name.uri, document_xml.paragraph_uri));
    }
}

pub fn finishParagraph(report: *Report, paragraph: ParagraphState) void {
    report.paragraphs_without_run += @intFromBool(paragraph.runs == 0);
    report.paragraphs_without_line_seg_array += @intFromBool(paragraph.arrays == 0);
    report.paragraphs_with_multiple_line_seg_arrays += @intFromBool(paragraph.arrays > 1);
}

pub fn inspect(sections: []const part_tree.Tree, options: Options) !Report {
    var report: Report = .{};
    var scan: ScanState = .{};
    for (sections) |section| {
        if (section.part_kind != .section) return error.InvalidPartKind;
        for (section.elements) |element| {
            if (!element.is(document_xml.paragraph_uri, "p")) continue;
            try noteParagraph(&report, options);
            var paragraph: ParagraphState = .{};
            var cursor = element.first_child;
            while (cursor) |child_index| : (cursor = section.elements[child_index].next_sibling) {
                try noteDirectChild(section.elements[child_index].name, &report, options, &scan, &paragraph);
            }
            finishParagraph(&report, paragraph);
        }
        report.sections += 1;
    }
    return report;
}

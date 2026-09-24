const std = @import("std");
const xml = @import("../xml/root.zig");
const part_tree = @import("xml_part_tree.zig");
const part_attrs = @import("xml_part_attributes.zig");
const document_xml = @import("document_xml.zig");
const paragraph_children = @import("paragraph_children.zig");
const values = @import("xml_values.zig");

pub const field_names = [_][]const u8{ "textpos", "vertpos", "vertsize", "textheight", "baseline", "spacing", "horzpos", "horzsize", "flags" };
const unsigned_fields = [_]bool{ true, false, false, false, false, false, false, false, true };

pub const Options = struct {
    max_arrays: usize = 2_000_000,
    max_segments: usize = 4_000_000,
    max_attribute_bytes: usize = 4096,
};

/// Direct hp:p/hp:linesegarray/hp:lineseg only. Scalar values are lexical;
/// no pagination or bitfield interpretation is inferred from these counters.
pub const Report = struct {
    sections: usize = 0,
    arrays: usize = 0,
    segments: usize = 0,
    empty_arrays: usize = 0,
    array_other_attributes: usize = 0,
    array_other_direct: usize = 0,
    array_foreign_direct: usize = 0,
    segment_other_attributes: usize = 0,
    segment_direct_children: usize = 0,
    segment_foreign_direct: usize = 0,
    field_present: [field_names.len]usize = @splat(0),
    field_missing: [field_names.len]usize = @splat(0),
    field_zero: [field_names.len]usize = @splat(0),
    field_negative: [field_names.len]usize = @splat(0),
    field_highbit: [field_names.len]usize = @splat(0),
    field_sum: [field_names.len]i64 = @splat(0),
};

pub fn noteArrayTag(tag: xml.tags.Tag, options: Options, report: *Report) !void {
    if (report.arrays == options.max_arrays) return error.LimitExceeded;
    report.arrays += 1;
    for (tag.attributes) |attribute| {
        if (!try xml.namespaces.isDeclaration(attribute.name)) report.array_other_attributes += 1;
    }
}

pub fn noteSegmentTag(a: std.mem.Allocator, tag: xml.tags.Tag, options: Options, report: *Report) !void {
    if (report.segments == options.max_segments) return error.LimitExceeded;
    report.segments += 1;
    var raw: [field_names.len]?xml.attribute_value.Value = @splat(null);
    for (tag.attributes) |attribute| {
        if (try xml.namespaces.isDeclaration(attribute.name)) continue;
        const name = try xml.qname.parse(attribute.name);
        var matched = false;
        if (name.prefix == null) {
            for (field_names, 0..) |field, field_index| {
                if (!name.local.equals(field, false)) continue;
                raw[field_index] = attribute.value;
                matched = true;
                break;
            }
        }
        report.segment_other_attributes += @intFromBool(!matched);
    }
    for (raw, 0..) |maybe, field_index| {
        const present = maybe orelse {
            report.field_missing[field_index] += 1;
            continue;
        };
        const bytes = try present.toUtf8(a, options.max_attribute_bytes);
        defer a.free(bytes);
        const number: i64 = if (unsigned_fields[field_index]) try values.unsigned32(bytes) else try values.signedOrUnsigned32(bytes);
        report.field_present[field_index] += 1;
        report.field_zero[field_index] += @intFromBool(number == 0);
        report.field_negative[field_index] += @intFromBool(number < 0);
        report.field_highbit[field_index] += @intFromBool(number >= 0x80000000);
        report.field_sum[field_index] = std.math.add(i64, report.field_sum[field_index], number) catch return error.LimitExceeded;
    }
}

pub fn inspect(a: std.mem.Allocator, sections: []const part_tree.Tree, options: Options) !Report {
    var report: Report = .{};
    for (sections) |section| {
        if (section.part_kind != .section) return error.InvalidPartKind;
        for (section.elements) |paragraph| {
            if (!paragraph.is(document_xml.paragraph_uri, "p")) continue;
            var child = paragraph.first_child;
            while (child) |array_index| : (child = section.elements[array_index].next_sibling) {
                if (!section.elements[array_index].is(document_xml.paragraph_uri, paragraph_children.line_seg_array_name)) continue;
                var array_tag = try part_attrs.parseStartTag(a, &section, array_index);
                defer array_tag.deinit(a);
                try noteArrayTag(array_tag, options, &report);
                var direct_segments: usize = 0;
                var segment = section.elements[array_index].first_child;
                while (segment) |segment_index| : (segment = section.elements[segment_index].next_sibling) {
                    if (section.elements[segment_index].is(document_xml.paragraph_uri, "lineseg")) {
                        direct_segments += 1;
                        var segment_tag = try part_attrs.parseStartTag(a, &section, segment_index);
                        defer segment_tag.deinit(a);
                        try noteSegmentTag(a, segment_tag, options, &report);
                        var segment_child = section.elements[segment_index].first_child;
                        while (segment_child) |child_index| : (segment_child = section.elements[child_index].next_sibling) {
                            report.segment_direct_children += 1;
                            report.segment_foreign_direct += @intFromBool(!std.mem.eql(u8, section.elements[child_index].name.uri, document_xml.paragraph_uri));
                        }
                    } else {
                        report.array_other_direct += 1;
                        report.array_foreign_direct += @intFromBool(!std.mem.eql(u8, section.elements[segment_index].name.uri, document_xml.paragraph_uri));
                    }
                }
                report.empty_arrays += @intFromBool(direct_segments == 0);
            }
        }
        report.sections += 1;
    }
    return report;
}

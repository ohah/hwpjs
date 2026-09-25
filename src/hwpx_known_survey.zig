const std = @import("std");
const package = @import("hwpx/package.zig");
const expected = @import("hwpx_corpus_expectations.zig");
const para_list_attributes = @import("hwpx/para_list_attributes.zig");
const section_definition = @import("hwpx/section_definition.zig");
const section_direct_settings = @import("hwpx/section_direct_settings.zig");
const section_note_fields = @import("hwpx/section_note_fields.zig");
const xml_values = @import("hwpx/xml_values.zig");
const fill_brush_stats = @import("hwpx_fill_brush_survey_stats.zig");
const master_fill_brush_stats = @import("hwpx_master_fill_brush_survey_stats.zig");

const sub_list_field_count = para_list_attributes.field_names.len;

fn expectCompleteShapeFields(counts: anytype, elements: usize) !void {
    for (counts) |field| {
        try std.testing.expectEqual(elements, field.present);
        try std.testing.expectEqual(@as(usize, 0), field.absent + field.unknown_enum + field.extension_enum);
    }
}

const ShapeTotals = struct {
    tables: usize = 0,
    captions: usize = 0,
    labels: usize = 0,
    dropcap_present: usize = 0,
    wrap_extensions: usize = 0,
    caption_paragraphs: usize = 0,
    id_sum: i64 = 0,
    size_width_sum: i64 = 0,
    size_height_sum: i64 = 0,
    vert_offset_sum: i64 = 0,
    horz_offset_sum: i64 = 0,
    vert_offset_negative: usize = 0,
    vert_offset_highbit: usize = 0,
    horz_offset_highbit: usize = 0,
    outer_margin_sum: [4]i64 = @splat(0),
    caption_width_sum: i64 = 0,
    label_pagewidth_sum: i64 = 0,
    label_pageheight_sum: i64 = 0,

    fn add(self: *ShapeTotals, shape: package.TableShapeReport) void {
        self.tables += shape.tables;
        self.captions += shape.caption.elements;
        self.labels += shape.label.elements;
        self.dropcap_present += shape.table_fields[6].present;
        self.wrap_extensions += shape.table_fields[3].extension_enum;
        self.caption_paragraphs += shape.caption_direct_paragraphs;
        self.id_sum += shape.table_fields[0].sum;
        self.size_width_sum += shape.size.fields[0].sum;
        self.size_height_sum += shape.size.fields[2].sum;
        self.vert_offset_sum += shape.position.fields[9].sum;
        self.horz_offset_sum += shape.position.fields[10].sum;
        self.vert_offset_negative += shape.position.fields[9].negative;
        self.vert_offset_highbit += shape.position.fields[9].highbit;
        self.horz_offset_highbit += shape.position.fields[10].highbit;
        for (&self.outer_margin_sum, shape.out_margin.fields) |*sum, field| sum.* += field.sum;
        self.caption_width_sum += shape.caption.fields[2].sum;
        self.label_pagewidth_sum += shape.label.fields[9].sum;
        self.label_pageheight_sum += shape.label.fields[10].sum;
    }
};

fn runMetadataCounts(report: package.RunMetadataReport) [7]usize {
    return .{ report.runs, report.missing_char_tc_id, report.zero_char_tc_id, report.para_tc_alias_present, report.para_tc_alias_only, report.equal_dual_ids, report.conflicting_dual_ids };
}

fn addRunCounts(total: *[7]usize, values: [7]usize) void {
    for (values, 0..) |value, index| total[index] += value;
}

fn addLineReport(total: *package.LineSegmentsReport, report: package.LineSegmentsReport) void {
    total.sections += report.sections;
    total.arrays += report.arrays;
    total.segments += report.segments;
    total.empty_arrays += report.empty_arrays;
    total.array_other_attributes += report.array_other_attributes;
    total.array_other_direct += report.array_other_direct;
    total.array_foreign_direct += report.array_foreign_direct;
    total.segment_other_attributes += report.segment_other_attributes;
    total.segment_direct_children += report.segment_direct_children;
    total.segment_foreign_direct += report.segment_foreign_direct;
    for (0..total.field_sum.len) |field| {
        total.field_sum[field] += report.field_sum[field];
        total.field_present[field] += report.field_present[field];
        total.field_missing[field] += report.field_missing[field];
        total.field_zero[field] += report.field_zero[field];
        total.field_negative[field] += report.field_negative[field];
        total.field_highbit[field] += report.field_highbit[field];
    }
}

fn addParagraphChildren(total: *package.ParagraphChildrenReport, report: package.ParagraphChildrenReport) void {
    total.sections += report.sections;
    total.paragraphs += report.paragraphs;
    total.direct_runs += report.direct_runs;
    total.line_seg_arrays += report.line_seg_arrays;
    total.paragraphs_without_run += report.paragraphs_without_run;
    total.paragraphs_without_line_seg_array += report.paragraphs_without_line_seg_array;
    total.paragraphs_with_multiple_line_seg_arrays += report.paragraphs_with_multiple_line_seg_arrays;
    total.other_direct += report.other_direct;
    total.foreign_direct += report.foreign_direct;
}

fn selectedTextFields(report: package.SectionTextReport) [5]usize {
    var inline_elements: usize = 0;
    for (report.inline_counts) |count| inline_elements += count;
    return .{ report.paragraphs, report.runs, report.text_elements, report.text_bytes, inline_elements };
}

fn removedTextFields(raw: package.SectionTextReport, selected: package.SectionTextReport) ![5]usize {
    const before = selectedTextFields(raw);
    const after = selectedTextFields(selected);
    var removed: [5]usize = undefined;
    for (&removed, before, after) |*slot, original, retained| {
        try std.testing.expect(original >= retained);
        slot.* = original - retained;
    }
    return removed;
}

fn expectSelectedStyleAgreement(text_report: package.SectionTextReport, style_report: package.ReferenceReport) !void {
    try std.testing.expectEqual(text_report.paragraphs, style_report.paragraphs);
    try std.testing.expectEqual(text_report.runs, style_report.runs);
    try std.testing.expectEqual(style_report.paragraphs, style_report.counts(.paragraph_shape).present + style_report.counts(.paragraph_shape).absent);
    try std.testing.expectEqual(style_report.paragraphs, style_report.counts(.style).present + style_report.counts(.style).absent);
    try std.testing.expectEqual(style_report.runs, style_report.counts(.character_shape).present + style_report.counts(.character_shape).absent);
}

const TopologyStats = struct {
    runs: usize = 0,
    non_direct: usize = 0,
    sec_pr: usize = 0,
    duplicates: usize = 0,
    late: usize = 0,
    classes: [5]usize = @splat(0),
    switches: [21]u64 = @splat(0),

    fn from(report: package.RunTopologyReport) TopologyStats {
        return .{ .runs = report.runs, .non_direct = report.non_direct_runs, .sec_pr = report.sec_pr_children, .duplicates = report.duplicate_sec_pr_runs, .late = report.late_sec_pr_runs, .classes = report.child_classes, .switches = report.switches.counts() };
    }

    fn add(self: *TopologyStats, other: TopologyStats) void {
        self.runs += other.runs;
        self.non_direct += other.non_direct;
        self.sec_pr += other.sec_pr;
        self.duplicates += other.duplicates;
        self.late += other.late;
        for (other.classes, 0..) |count, index| self.classes[index] += count;
        for (other.switches, 0..) |count, index| self.switches[index] += count;
    }
};

const TextNodeStats = struct {
    counts: [6]usize = @splat(0),
    classes: [4]usize = @splat(0),
    tab: [21]u64 = @splat(0),
    markpen: [9]u64 = @splat(0),
    title_mark: [6]u64 = @splat(0),
    track_change_tags: [20]u64 = @splat(0),

    fn from(report: package.TextNodeReport) TextNodeStats {
        return .{
            .counts = .{ report.text_nodes, report.non_direct_text_nodes, report.missing_char_style_id_ref, report.zero_char_style_id_ref, report.over_u32_char_style_id_ref, report.child_classes[1] + report.child_classes[2] + report.child_classes[3] },
            .classes = report.child_classes,
            .tab = report.tab.counts(),
            .markpen = report.markpen.counts(),
            .title_mark = report.title_mark.counts(),
            .track_change_tags = report.track_change_tags.counts(),
        };
    }

    fn add(self: *TextNodeStats, other: TextNodeStats) void {
        for (other.counts, 0..) |value, i| self.counts[i] += value;
        for (other.classes, 0..) |value, i| self.classes[i] += value;
        for (other.tab, 0..) |value, i| self.tab[i] += value;
        for (other.markpen, 0..) |value, i| self.markpen[i] += value;
        for (other.title_mark, 0..) |value, i| self.title_mark[i] += value;
        for (other.track_change_tags, 0..) |value, i| self.track_change_tags[i] += value;
    }
};

const MasterTextStats = struct {
    counts: [5]usize = @splat(0),
    digest_sum: u64 = 0,

    fn from(report: package.MasterPageTextReport, digest: u64) MasterTextStats {
        return .{
            .counts = .{ report.text.paragraphs, report.text.runs, report.text.text_elements, report.text.empty_text_elements, report.text.text_bytes },
            .digest_sum = digest,
        };
    }

    fn add(self: *MasterTextStats, other: MasterTextStats) void {
        for (other.counts, 0..) |count, i| self.counts[i] += count;
        self.digest_sum +%= other.digest_sum;
    }
};

const MasterTextDigest = struct {
    value: u64 = 14695981039346656037,
    text_elements: usize = 0,

    fn feed(self: *MasterTextDigest, bytes: []const u8) void {
        for (bytes) |byte| self.value = (self.value ^ byte) *% 1099511628211;
    }

    fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
        const self: *MasterTextDigest = @ptrCast(@alignCast(raw));
        switch (event) {
            .text_start => {
                self.text_elements += 1;
                self.feed("[");
            },
            .text_end => self.feed("]"),
            .content => |value| self.feed(value.bytes),
            else => {},
        }
    }
};

const MasterBinaryStats = struct {
    counts: [19]usize = @splat(0),

    fn from(report: package.MasterPageBinaryReferenceReport) MasterBinaryStats {
        var result: MasterBinaryStats = .{};
        for ([_]package.BinaryReferenceKind{ .master_picture, .master_brush_image, .master_ole }, 0..) |kind, index| {
            const c = report.counts(kind);
            const base = index * 6;
            result.counts[base..][0..6].* = .{ c.sites, c.absent, c.empty, c.resolved_embedded, c.resolved_external, c.missing_target };
        }
        result.counts[18] = report.links.unclassified_attribute_sites;
        return result;
    }

    fn add(self: *MasterBinaryStats, other: MasterBinaryStats) void {
        for (other.counts, 0..) |count, i| self.counts[i] += count;
    }
};

const MasterStyleStats = struct {
    paragraphs: usize = 0,
    non_direct_paragraphs: usize = 0,
    runs: usize = 0,
    non_direct_runs: usize = 0,
    present: [3]usize = @splat(0),
    absent: [3]usize = @splat(0),
    resolved: [3]usize = @splat(0),
    missing: [3]usize = @splat(0),
    absent_table: [3]usize = @splat(0),

    fn add(self: *MasterStyleStats, other: MasterStyleStats) void {
        self.paragraphs += other.paragraphs;
        self.non_direct_paragraphs += other.non_direct_paragraphs;
        self.runs += other.runs;
        self.non_direct_runs += other.non_direct_runs;
        for (0..3) |i| {
            self.present[i] += other.present[i];
            self.absent[i] += other.absent[i];
            self.resolved[i] += other.resolved[i];
            self.missing[i] += other.missing[i];
            self.absent_table[i] += other.absent_table[i];
        }
    }
};

const Statistics = struct {
    sections: usize,
    page_geometry: PageStats,
    section_definitions: SectionDefinitionStats,
    section_definition_refs: SectionDefinitionRefStats,
    section_settings: SectionSettingsStats,
    section_page_borders: SectionPageBorderStats,
    section_page_border_refs: SectionPageBorderRefStats,
    section_notes: SectionNoteStats,
    section_presentation: PresentationStats,
    fill_brushes: fill_brush_stats.Stats,
    master_fill_brushes: master_fill_brush_stats.Stats,
    paragraphs: usize,
    paragraph_children: package.ParagraphChildrenReport,
    line_segments: package.LineSegmentsReport,
    master_line_segments: package.MasterPageLineSegmentsReport,
    master_paragraph_children: package.MasterPageParagraphChildrenReport,
    begin_present: bool,
    missing_id: usize,
    manifest_xml_entries: usize,
    manifest_xml_bytes: usize,
    manifest_xml_elements: usize,
    manifest_xml_settings: usize,
    manifest_xml_masterpages: usize,
    settings_carets: usize,
    settings_caret_pos_sum: u64,
    settings_config_sets: usize,
    settings_config_items: usize,
    settings_short_sum: i64,
    settings_boolean_true: usize,
    settings_unsupported_types: usize,
    master_page_refs: usize,
    master_page_sub_lists: usize,
    master_sub_list_direct_paragraphs: usize,
    master_sub_list_attribute_presence: [sub_list_field_count]usize,
    master_sub_list_unknown_enums: usize,
    master_sub_list_other_attributes: usize,
    master_sub_list_width_sum: u64,
    master_sub_list_height_sum: u64,
    master_paragraphs: usize,
    master_paragraph_missing_id: usize,
    master_paragraph_zero_id: usize,
    master_paragraph_missing_tc_id: usize,
    master_paragraph_boolean_present: [3]usize,
    master_paragraph_page_break_true: usize,
    master_paragraph_column_break_true: usize,
    master_paragraph_merged_true: usize,
    master_style: MasterStyleStats,
    section_run_metadata: [7]usize,
    master_run_metadata: [7]usize,
    section_run_topology: TopologyStats,
    master_run_topology: TopologyStats,
    section_text_nodes: TextNodeStats,
    master_text_nodes: TextNodeStats,
    master_text: MasterTextStats,
    master_binary: MasterBinaryStats,
    master_page_number_sum: u64,
    master_page_count_declarations: usize,
    master_page_type_counts: [5]usize,
    switch_removed_case: [5]usize,
    switch_removed_default: [5]usize,
    table_geometry: package.TableGeometryReport,
    master_table_geometry: package.MasterPageTableGeometryReport,
};

const Outcome = union(enum) {
    rejected_zip,
    encrypted,
    accepted: Statistics,
};

const SectionDefinitionRefStats = struct {
    outline_zero: usize = 0,
    outline_resolved: usize = 0,
    outline_absent_table: usize = 0,
    memo_zero: usize = 0,
    memo_resolved: usize = 0,

    fn from(report: anytype, definitions: usize) !SectionDefinitionRefStats {
        try std.testing.expectEqual(@as(usize, 0), report.outline.absent + report.outline.missing_target + report.memo.absent + report.memo.absent_table + report.memo.missing_target);
        try std.testing.expectEqual(definitions, report.outline.zero + report.outline.resolved + report.outline.absent_table);
        try std.testing.expectEqual(definitions, report.memo.zero + report.memo.resolved);
        return .{
            .outline_zero = report.outline.zero,
            .outline_resolved = report.outline.resolved,
            .outline_absent_table = report.outline.absent_table,
            .memo_zero = report.memo.zero,
            .memo_resolved = report.memo.resolved,
        };
    }

    fn merge(self: *SectionDefinitionRefStats, other: SectionDefinitionRefStats) void {
        self.outline_zero += other.outline_zero;
        self.outline_resolved += other.outline_resolved;
        self.outline_absent_table += other.outline_absent_table;
        self.memo_zero += other.memo_zero;
        self.memo_resolved += other.memo_resolved;
    }
};

const SectionSettingsStats = struct {
    counts: [4]usize = @splat(0),
    extension_attributes: usize = 0,
    start_odd: usize = 0,
    start_page_sum: u64 = 0,
    fill_show_first: usize = 0,
    visibility_true: [6]usize = @splat(0),

    fn from(a: std.mem.Allocator, definitions: package.SectionDefinitionReport, report: package.SectionDirectSettingsReport) !SectionSettingsStats {
        try std.testing.expectEqual(definitions.sections, report.sections);
        try std.testing.expectEqual(@as(usize, 0), report.other_attributes + report.unknown_enums + report.direct_children);
        const seen = try a.alloc([4]usize, definitions.definitions.len);
        defer a.free(seen);
        for (seen) |*entry| entry.* = @splat(0);
        var stats: SectionSettingsStats = .{};
        const child_kinds = [_]section_definition.Child{ .start_num, .grid, .visibility, .line_number_shape };
        for (report.items) |item| {
            const kind_index = @intFromEnum(item.kind);
            var parent_slot: ?usize = null;
            for (definitions.definitions, 0..) |definition, slot| {
                if (definition.section_ordinal == item.section_ordinal and definition.element_index == item.parent_element_index) {
                    parent_slot = slot;
                    break;
                }
            }
            seen[parent_slot orelse return error.MissingSectionDefinition][kind_index] += 1;
            stats.counts[kind_index] += 1;
            switch (item.kind) {
                .start_num => {
                    inline for (.{ .page_starts_on, .page, .pic, .tbl, .equation }) |field| try std.testing.expect(item.get(field) != null);
                    const starts_on = item.get(.page_starts_on).?;
                    try std.testing.expect(std.mem.eql(u8, starts_on, "BOTH") or std.mem.eql(u8, starts_on, "ODD"));
                    stats.start_odd += @intFromBool(std.mem.eql(u8, starts_on, "ODD"));
                    stats.start_page_sum += try xml_values.unsigned32(item.get(.page).?);
                    inline for (.{ .pic, .tbl, .equation }) |field| try std.testing.expectEqual(@as(u32, 0), try xml_values.unsigned32(item.get(field).?));
                },
                .grid => {
                    inline for (.{ .line_grid, .char_grid, .wonggoji_format }) |field| try std.testing.expect(item.get(field) != null);
                    try std.testing.expectEqual(@as(u32, 0), try xml_values.unsigned32(item.get(.line_grid).?));
                    try std.testing.expectEqual(@as(u32, 0), try xml_values.unsigned32(item.get(.char_grid).?));
                    try std.testing.expect(!(try xml_values.boolean(item.get(.wonggoji_format).?)));
                    if (item.get(.strike_continue)) |raw| {
                        stats.extension_attributes += 1;
                        try std.testing.expectEqualStrings("0", raw);
                    }
                },
                .visibility => {
                    const fields = [_]section_direct_settings.Field{ .hide_first_header, .hide_first_footer, .hide_first_master_page, .hide_first_page_num, .hide_first_empty_line, .show_line_number };
                    for (fields, 0..) |field, slot| stats.visibility_true[slot] += @intFromBool(try xml_values.boolean(item.get(field) orelse return error.MissingVisibilityField));
                    try std.testing.expectEqualStrings("SHOW_ALL", item.get(.border) orelse return error.MissingVisibilityBorder);
                    const fill = item.get(.fill) orelse return error.MissingVisibilityFill;
                    try std.testing.expect(std.mem.eql(u8, fill, "SHOW_ALL") or std.mem.eql(u8, fill, "SHOW_FIRST"));
                    stats.fill_show_first += @intFromBool(std.mem.eql(u8, fill, "SHOW_FIRST"));
                },
                .line_number_shape => {
                    inline for (.{ .restart_type, .count_by, .distance, .start_number }) |field| {
                        try std.testing.expectEqual(@as(u32, 0), try xml_values.unsigned32(item.get(field) orelse return error.MissingLineNumberField));
                    }
                },
            }
        }
        for (definitions.definitions, seen) |definition, observed| {
            for (child_kinds, observed) |child_kind, value| try std.testing.expectEqual(definition.childCount(child_kind), value);
        }
        try std.testing.expectEqual(report.extension_attributes, stats.extension_attributes);
        try std.testing.expectEqualSlices(usize, &report.counts, &stats.counts);
        return stats;
    }

    fn merge(self: *SectionSettingsStats, other: SectionSettingsStats) void {
        for (&self.counts, other.counts) |*slot, value| slot.* += value;
        self.extension_attributes += other.extension_attributes;
        self.start_odd += other.start_odd;
        self.start_page_sum += other.start_page_sum;
        self.fill_show_first += other.fill_show_first;
        for (&self.visibility_true, other.visibility_true) |*slot, value| slot.* += value;
    }
};

const SectionPageBorderStats = struct {
    borders: usize = 0,
    types: [3]usize = @splat(0),
    id_sum: u64 = 0,
    id_zero: usize = 0,
    content: usize = 0,
    header_inside: usize = 0,
    footer_inside: usize = 0,
    offset_sums: [4]u64 = @splat(0),

    fn from(a: std.mem.Allocator, definitions: package.SectionDefinitionReport, report: package.SectionPageBorderReport) !SectionPageBorderStats {
        try std.testing.expectEqual(definitions.sections, report.sections);
        try std.testing.expectEqual(@as(usize, 0), report.other_attributes + report.unknown_enums);
        try std.testing.expectEqual(report.borders, report.offsets);
        try std.testing.expectEqual(report.borders, report.direct_children);
        const seen = try a.alloc(usize, definitions.definitions.len);
        defer a.free(seen);
        @memset(seen, 0);
        var stats: SectionPageBorderStats = .{};
        for (report.items) |item| {
            switch (item.kind) {
                .border => {
                    var parent_slot: ?usize = null;
                    for (definitions.definitions, 0..) |definition, slot| {
                        if (definition.section_ordinal == item.section_ordinal and definition.element_index == item.parent_element_index) {
                            parent_slot = slot;
                            break;
                        }
                    }
                    seen[parent_slot orelse return error.MissingSectionDefinition] += 1;
                    try std.testing.expectEqual(@as(usize, 1), item.direct_children);
                    stats.borders += 1;
                    const page_type = item.get(.page_type) orelse return error.MissingPageBorderType;
                    const slot: usize = if (std.mem.eql(u8, page_type, "BOTH")) 0 else if (std.mem.eql(u8, page_type, "EVEN")) 1 else if (std.mem.eql(u8, page_type, "ODD")) 2 else return error.UnknownPageBorderType;
                    stats.types[slot] += 1;
                    const id = try xml_values.unsigned32(item.get(.border_fill_id_ref) orelse return error.MissingPageBorderId);
                    stats.id_sum += id;
                    stats.id_zero += @intFromBool(id == 0);
                    const text_border = item.get(.text_border) orelse return error.MissingTextBorder;
                    try std.testing.expect(std.mem.eql(u8, text_border, "PAPER") or std.mem.eql(u8, text_border, "CONTENT"));
                    stats.content += @intFromBool(std.mem.eql(u8, text_border, "CONTENT"));
                    stats.header_inside += @intFromBool(try xml_values.boolean(item.get(.header_inside) orelse return error.MissingHeaderInside));
                    stats.footer_inside += @intFromBool(try xml_values.boolean(item.get(.footer_inside) orelse return error.MissingFooterInside));
                    try std.testing.expectEqualStrings("PAPER", item.get(.fill_area) orelse return error.MissingFillArea);
                },
                .offset => {
                    try std.testing.expectEqual(@as(usize, 0), item.direct_children);
                    var parent_found = false;
                    for (report.items) |candidate| {
                        if (candidate.kind == .border and candidate.section_ordinal == item.section_ordinal and candidate.element_index == item.parent_element_index) {
                            parent_found = true;
                            break;
                        }
                    }
                    try std.testing.expect(parent_found);
                    inline for (.{ .left, .right, .top, .bottom }, 0..) |field, slot| {
                        stats.offset_sums[slot] += try xml_values.unsigned32(item.get(field) orelse return error.MissingPageBorderOffset);
                    }
                },
            }
        }
        for (definitions.definitions, seen) |definition, value| try std.testing.expectEqual(definition.childCount(.page_border_fill), value);
        try std.testing.expectEqual(report.borders, stats.borders);
        return stats;
    }

    fn merge(self: *SectionPageBorderStats, other: SectionPageBorderStats) void {
        self.borders += other.borders;
        for (&self.types, other.types) |*slot, value| slot.* += value;
        self.id_sum += other.id_sum;
        self.id_zero += other.id_zero;
        self.content += other.content;
        self.header_inside += other.header_inside;
        self.footer_inside += other.footer_inside;
        for (&self.offset_sums, other.offset_sums) |*slot, value| slot.* += value;
    }
};

const SectionNoteStats = struct {
    counts: [2]usize = @splat(0),
    line_lengths: [2]i64 = @splat(0),
    spacing: [6]u64 = @splat(0),
    new_nums: [2]u64 = @splat(0),
    superscript: [2]usize = @splat(0),
    // Unknown enums, noncanonical colors, foot/end "4 mm", end EACH_COLUMN.
    anomalies: [5]usize = @splat(0),
    // Foot user/prefix/suffix, end user/prefix/suffix.
    missing_chars: [6]usize = @splat(0),
    nonempty_chars: [6]usize = @splat(0),
    // Foot USER_CHAR/ON_PAGE, end noteLine NONE/THICK_SLIM.
    other_enums: [4]usize = @splat(0),

    fn from(a: std.mem.Allocator, definitions: package.SectionDefinitionReport, report: package.SectionNoteShapeReport) !SectionNoteStats {
        try std.testing.expectEqual(definitions.sections, report.sections);
        try std.testing.expectEqual(@as(usize, 0), report.other_attributes);
        const seen = try a.alloc([2]usize, definitions.definitions.len);
        defer a.free(seen);
        for (seen) |*entry| entry.* = @splat(0);
        var stats: SectionNoteStats = .{};
        for (report.notes, 0..) |note, note_index| {
            const note_slot: usize = @intFromEnum(note.kind);
            var parent_slot: ?usize = null;
            for (definitions.definitions, 0..) |definition, slot| {
                if (definition.section_ordinal == note.section_ordinal and definition.element_index == note.parent_element_index) {
                    parent_slot = slot;
                    break;
                }
            }
            seen[parent_slot orelse return error.MissingSectionDefinition][note_slot] += 1;
            stats.counts[note_slot] += 1;
            try std.testing.expectEqual(@as(usize, 0), note.other_attributes);
            try std.testing.expectEqual(@as(usize, 5), note.direct_children);
            for (note.child_counts) |count| try std.testing.expectEqual(@as(usize, 1), count);
            var child_count: usize = 0;
            for (report.children) |child| {
                if (child.note_index != note_index) continue;
                child_count += 1;
                try std.testing.expect(child.element_index > note.element_index);
                try std.testing.expectEqual(@as(usize, 0), child.other_attributes + child.direct_children);
                switch (child.kind) {
                    .auto_num_format => {
                        const number_type = child.get(.number_type) orelse return error.MissingNoteNumberType;
                        try std.testing.expect(std.mem.eql(u8, number_type, "DIGIT") or (note.kind == .foot and std.mem.eql(u8, number_type, "USER_CHAR")));
                        stats.other_enums[0] += @intFromBool(note.kind == .foot and std.mem.eql(u8, number_type, "USER_CHAR"));
                        stats.superscript[note_slot] += @intFromBool(try xml_values.boolean(child.get(.supscript) orelse return error.MissingNoteSupscript));
                        inline for (.{ .user_char, .prefix_char, .suffix_char }, 0..) |field, field_index| {
                            const slot = note_slot * 3 + field_index;
                            if (child.get(field)) |raw| {
                                stats.nonempty_chars[slot] += @intFromBool(raw.len != 0);
                            } else stats.missing_chars[slot] += 1;
                        }
                    },
                    .note_line => {
                        stats.line_lengths[note_slot] += try xml_values.signed32(child.get(.line_length) orelse return error.MissingNoteLineLength);
                        const line_type = child.get(.line_type) orelse return error.MissingNoteLineType;
                        try std.testing.expect(std.mem.eql(u8, line_type, "SOLID") or (note.kind == .end and (std.mem.eql(u8, line_type, "NONE") or std.mem.eql(u8, line_type, "THICK_SLIM"))));
                        if (note.kind == .end) {
                            stats.other_enums[2] += @intFromBool(std.mem.eql(u8, line_type, "NONE"));
                            stats.other_enums[3] += @intFromBool(std.mem.eql(u8, line_type, "THICK_SLIM"));
                        }
                        const width = child.get(.line_width) orelse return error.MissingNoteLineWidth;
                        if (std.mem.eql(u8, width, "4 mm")) stats.anomalies[2 + note_slot] += 1;
                        const color = child.get(.line_color) orelse return error.MissingNoteLineColor;
                        stats.anomalies[1] += @intFromBool(!section_note_fields.canonicalColor(color));
                    },
                    .note_spacing => {
                        inline for (.{ .between_notes, .below_line, .above_line }, 0..) |field, slot| {
                            stats.spacing[note_slot * 3 + slot] += try xml_values.unsigned32(child.get(field) orelse return error.MissingNoteSpacing);
                        }
                    },
                    .numbering => {
                        const numbering_type = child.get(.numbering_type) orelse return error.MissingNoteNumberingType;
                        try std.testing.expect(std.mem.eql(u8, numbering_type, "CONTINUOUS") or (note.kind == .foot and std.mem.eql(u8, numbering_type, "ON_PAGE")));
                        stats.other_enums[1] += @intFromBool(note.kind == .foot and std.mem.eql(u8, numbering_type, "ON_PAGE"));
                        const new_num = try xml_values.unsigned32(child.get(.new_num) orelse return error.MissingNoteNewNum);
                        try std.testing.expect(new_num > 0);
                        stats.new_nums[note_slot] += new_num;
                    },
                    .placement => {
                        const place = child.get(.placement_place) orelse return error.MissingNotePlacement;
                        try std.testing.expect(if (note.kind == .foot) std.mem.eql(u8, place, "EACH_COLUMN") else std.mem.eql(u8, place, "END_OF_DOCUMENT") or std.mem.eql(u8, place, "EACH_COLUMN"));
                        stats.anomalies[4] += @intFromBool(note.kind == .end and std.mem.eql(u8, place, "EACH_COLUMN"));
                        try std.testing.expect(!(try xml_values.boolean(child.get(.beneath_text) orelse return error.MissingNoteBeneathText)));
                    },
                }
            }
            try std.testing.expectEqual(@as(usize, 5), child_count);
        }
        for (definitions.definitions, seen) |definition, observed| {
            try std.testing.expectEqual(definition.childCount(.foot_note_pr), observed[0]);
            try std.testing.expectEqual(definition.childCount(.end_note_pr), observed[1]);
        }
        try std.testing.expectEqual(report.foot_notes, stats.counts[0]);
        try std.testing.expectEqual(report.end_notes, stats.counts[1]);
        try std.testing.expectEqual(report.notes.len * 5, report.children.len);
        try std.testing.expectEqual(report.children.len, report.direct_children);
        stats.anomalies[0] = stats.anomalies[2] + stats.anomalies[3] + stats.anomalies[4];
        try std.testing.expectEqual(report.unknown_enums, stats.anomalies[0]);
        try std.testing.expectEqual(report.noncanonical_colors, stats.anomalies[1]);
        return stats;
    }

    fn merge(self: *SectionNoteStats, other: SectionNoteStats) void {
        inline for (.{ "counts", "line_lengths", "spacing", "new_nums", "superscript", "anomalies", "missing_chars", "nonempty_chars", "other_enums" }) |field| {
            for (&@field(self, field), @field(other, field)) |*slot, value| slot.* += value;
        }
    }
};

const PresentationStats = struct {
    items: usize = 0,
    brushes: usize = 0,
    brush_children: usize = 0,
    invert_true: usize = 0,
    autoshow_true: usize = 0,
    showtime_sum: u64 = 0,

    fn from(a: std.mem.Allocator, definitions: package.SectionDefinitionReport, report: package.SectionPresentationReport) !PresentationStats {
        try std.testing.expectEqual(definitions.sections, report.sections);
        try std.testing.expectEqual(@as(usize, 0), report.other_attributes + report.unknown_enums);
        const seen = try a.alloc(usize, definitions.definitions.len);
        defer a.free(seen);
        @memset(seen, 0);
        var stats: PresentationStats = .{};
        for (report.items, 0..) |item, item_index| {
            var parent_slot: ?usize = null;
            for (definitions.definitions, 0..) |definition, slot| {
                if (definition.section_ordinal == item.section_ordinal and definition.element_index == item.parent_element_index) {
                    parent_slot = slot;
                    break;
                }
            }
            seen[parent_slot orelse return error.MissingSectionDefinition] += 1;
            stats.items += 1;
            try std.testing.expectEqual(@as(usize, 0), item.other_attributes + item.unknown_enums);
            try std.testing.expectEqual(@as(usize, 1), item.direct_children);
            try std.testing.expectEqual(@as(usize, 1), item.fill_brushes);
            try std.testing.expectEqualStrings("none", item.get(.effect) orelse return error.MissingPresentationEffect);
            try std.testing.expectEqualStrings("", item.get(.sound_id_ref) orelse return error.MissingPresentationSound);
            try std.testing.expectEqualStrings("WholeDoc", item.get(.applyto) orelse return error.MissingPresentationApplyTo);
            stats.invert_true += @intFromBool(try xml_values.boolean(item.get(.invert_text) orelse return error.MissingPresentationInvertText));
            stats.autoshow_true += @intFromBool(try xml_values.boolean(item.get(.autoshow) orelse return error.MissingPresentationAutoshow));
            stats.showtime_sum += try xml_values.unsigned32(item.get(.showtime) orelse return error.MissingPresentationShowtime);
            var item_brushes: usize = 0;
            for (report.fill_brushes) |brush| {
                if (brush.presentation_index != item_index) continue;
                item_brushes += 1;
                stats.brushes += 1;
                stats.brush_children += brush.direct_children;
                try std.testing.expectEqual(item.section_ordinal, brush.section_ordinal);
                try std.testing.expect(brush.element_index > item.element_index);
                try std.testing.expectEqual(@as(usize, 0), brush.other_attributes);
                try std.testing.expectEqual(@as(usize, 1), brush.direct_children);
            }
            try std.testing.expectEqual(@as(usize, 1), item_brushes);
        }
        for (definitions.definitions, seen) |definition, count| try std.testing.expectEqual(definition.childCount(.presentation), count);
        try std.testing.expectEqual(stats.items, report.items.len);
        try std.testing.expectEqual(stats.brushes, report.fill_brushes.len);
        try std.testing.expectEqual(stats.brush_children, report.brush_children);
        try std.testing.expectEqual(stats.items, report.direct_children);
        return stats;
    }

    fn merge(self: *PresentationStats, other: PresentationStats) void {
        self.items += other.items;
        self.brushes += other.brushes;
        self.brush_children += other.brush_children;
        self.invert_true += other.invert_true;
        self.autoshow_true += other.autoshow_true;
        self.showtime_sum += other.showtime_sum;
    }
};

const SectionPageBorderRefStats = struct {
    resolved: usize = 0,
    missing_target: usize = 0,

    fn from(raw: package.SectionPageBorderReport, report: package.SectionPageBorderReferenceReport) !SectionPageBorderRefStats {
        var zero_count: usize = 0;
        for (raw.items) |item| {
            if (item.kind != .border) continue;
            const value = item.get(.border_fill_id_ref) orelse continue;
            zero_count += @intFromBool((try xml_values.unsigned32(value)) == 0);
        }
        try std.testing.expectEqual(raw.borders, report.borders);
        try std.testing.expectEqual(@as(usize, 0), report.absent + report.absent_table);
        try std.testing.expectEqual(raw.borders, report.resolved + report.missing_target);
        try std.testing.expectEqual(zero_count, report.zero);
        try std.testing.expectEqual(zero_count, report.missing_target);
        if (report.missing_target == 0) {
            try std.testing.expectEqual(@as(?u32, null), report.first_unresolved_id);
            try std.testing.expectEqual(@as(?usize, null), report.first_unresolved_section);
            try std.testing.expectEqual(@as(?usize, null), report.first_unresolved_element);
        } else {
            try std.testing.expectEqual(@as(?u32, 0), report.first_unresolved_id);
            var found = false;
            for (raw.items) |item| {
                if (item.kind != .border or item.section_ordinal != report.first_unresolved_section.? or item.element_index != report.first_unresolved_element.?) continue;
                found = true;
                try std.testing.expectEqual(@as(u32, 0), try xml_values.unsigned32(item.get(.border_fill_id_ref).?));
                break;
            }
            try std.testing.expect(found);
        }
        return .{ .resolved = report.resolved, .missing_target = report.missing_target };
    }

    fn merge(self: *SectionPageBorderRefStats, other: SectionPageBorderRefStats) void {
        self.resolved += other.resolved;
        self.missing_target += other.missing_target;
    }
};

const PageStats = struct {
    pages: usize = 0,
    widely: usize = 0,
    left_right: usize = 0,
    width_sum: u64 = 0,
    height_sum: u64 = 0,
    margin_sum: [7]u64 = @splat(0),

    fn add(self: *PageStats, report: package.PageGeometryReport) !void {
        try std.testing.expectEqual(@as(usize, 0), report.sections_without_page);
        self.pages += report.pages.len;
        for (report.pages) |page| {
            const orientation = page.orientation orelse return error.MissingPageOrientation;
            const gutter_type = page.gutter_type orelse return error.MissingPageGutterType;
            if (orientation == .widely) self.widely += 1;
            if (gutter_type == .left_right) self.left_right += 1;
            self.width_sum += page.width orelse return error.MissingPageWidth;
            self.height_sum += page.height orelse return error.MissingPageHeight;
            const margin = page.margin orelse return error.MissingPageMargin;
            const values = [_]?u32{ margin.header, margin.footer, margin.gutter, margin.left, margin.right, margin.top, margin.bottom };
            for (values, 0..) |value, index| self.margin_sum[index] += value orelse return error.MissingPageMarginField;
            try std.testing.expectEqual(@as(usize, 0), page.duplicate_margins);
        }
    }
};

const section_number_fields = [_]section_definition.Field{
    .space_columns, .tab_stop, .tab_stop_val, .outline_shape_id_ref, .memo_shape_id_ref, .master_page_count,
};

const SectionDefinitionStats = struct {
    definitions: usize = 0,
    missing_id: usize = 0,
    empty_id: usize = 0,
    missing_tab_stop_val: usize = 0,
    missing_tab_stop_unit: usize = 0,
    direction_horizontal: usize = 0,
    unit_char: usize = 0,
    vertical_width_true: usize = 0,
    numeric_sums: [section_number_fields.len]i64 = @splat(0),
    child_counts: [section_definition.child_names.len]usize = @splat(0),
    direct_children: usize = 0,
    other_paragraph_children: usize = 0,
    foreign_children: usize = 0,
    other_attributes: usize = 0,
    unknown_enums: usize = 0,

    fn add(self: *SectionDefinitionStats, report: package.SectionDefinitionReport) !void {
        try std.testing.expectEqual(@as(usize, 0), report.sections_without_definition);
        self.definitions += report.definitions.len;
        self.direct_children += report.direct_children;
        self.other_paragraph_children += report.other_paragraph_children;
        self.foreign_children += report.foreign_children;
        self.other_attributes += report.other_attributes;
        self.unknown_enums += report.unknown_enums;
        for (report.definitions) |definition| {
            const id = definition.get(.id);
            self.missing_id += @intFromBool(id == null);
            if (id) |value| self.empty_id += @intFromBool(value.len == 0);
            const direction = definition.get(.text_direction) orelse return error.MissingSectionTextDirection;
            self.direction_horizontal += @intFromBool(std.mem.eql(u8, direction, "HORIZONTAL"));
            self.missing_tab_stop_val += @intFromBool(definition.get(.tab_stop_val) == null);
            const unit = definition.get(.tab_stop_unit);
            self.missing_tab_stop_unit += @intFromBool(unit == null);
            if (unit) |value| self.unit_char += @intFromBool(std.mem.eql(u8, value, "CHAR"));
            const vertical = definition.get(.text_vertical_width_head) orelse return error.MissingSectionVerticalWidth;
            self.vertical_width_true += @intFromBool(try xml_values.boolean(vertical));
            for (section_number_fields, 0..) |field, index| {
                const raw = definition.get(field) orelse {
                    if (field == .tab_stop_val) continue;
                    return error.MissingSectionNumberField;
                };
                const value: i64 = switch (field) {
                    .space_columns, .tab_stop, .tab_stop_val => try xml_values.signed32(raw),
                    .outline_shape_id_ref, .memo_shape_id_ref, .master_page_count => try xml_values.unsigned32(raw),
                    else => unreachable,
                };
                self.numeric_sums[index] += value;
            }
            for (definition.child_counts, 0..) |value, index| self.child_counts[index] += value;
        }
    }

    fn merge(self: *SectionDefinitionStats, other: SectionDefinitionStats) void {
        self.definitions += other.definitions;
        self.missing_id += other.missing_id;
        self.empty_id += other.empty_id;
        self.missing_tab_stop_val += other.missing_tab_stop_val;
        self.missing_tab_stop_unit += other.missing_tab_stop_unit;
        self.direction_horizontal += other.direction_horizontal;
        self.unit_char += other.unit_char;
        self.vertical_width_true += other.vertical_width_true;
        self.direct_children += other.direct_children;
        self.other_paragraph_children += other.other_paragraph_children;
        self.foreign_children += other.foreign_children;
        self.other_attributes += other.other_attributes;
        self.unknown_enums += other.unknown_enums;
        for (&self.numeric_sums, other.numeric_sums) |*sum, value| sum.* += value;
        for (&self.child_counts, other.child_counts) |*sum, value| sum.* += value;
    }
};

fn inspectOne(bytes: []const u8) !Outcome {
    var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
    checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
    defer _ = checked.deinit();
    defer if (checked.total_requested_bytes != 0) @panic("HWPX known corpus inspection leaked allocations");
    const a = checked.allocator();
    var document = package.inspectDocument(a, bytes, .{}) catch |err| {
        if (err == error.MissingEndRecord) return .rejected_zip;
        return err;
    };
    defer document.deinit(a);
    var known = document.inspectKnown(a, .{}) catch |err| {
        if (err == error.EncryptedDocument) return .encrypted;
        return err;
    };
    defer known.deinit(a);
    var master_text_digest: MasterTextDigest = .{};
    const standalone_master_text = try document.inspectMasterPageText(a, .{}, .{ .context = &master_text_digest, .on_event = MasterTextDigest.onEvent });
    try std.testing.expectEqualDeep(known.master_page_text, standalone_master_text);
    try std.testing.expectEqual(known.master_page_text.text.text_elements, master_text_digest.text_elements);
    var switch_removed_case: [5]usize = @splat(0);
    var switch_removed_default: [5]usize = @splat(0);
    if (known.run_topology.switches.switches != 0) {
        const chart_namespace = "http://www.hancom.co.kr/hwpml/2016/ooxmlchart";
        const case_charts = known.run_topology.switches.case_chart_children;
        const default_oles = known.run_topology.switches.default_ole_children;
        var fallback = try document.inspectSelectedReferences(a, .{});
        defer fallback.deinit(a);
        var case_branch = try document.inspectSelectedReferences(a, .{ .supported_namespaces = &.{chart_namespace} });
        defer case_branch.deinit(a);
        try std.testing.expectEqual(known.chart_references.chart_sites, fallback.chart.chart_sites + case_charts);
        try std.testing.expectEqual(known.binary_references.counts(.section_ole).sites, fallback.binary.counts(.section_ole).sites);
        try std.testing.expectEqual(known.chart_references.chart_sites, case_branch.chart.chart_sites);
        try std.testing.expectEqual(known.binary_references.counts(.section_ole).sites, case_branch.binary.counts(.section_ole).sites + default_oles);
        const fallback_text = try document.inspectSelectedSectionText(a, .{}, &.{}, null);
        const chart_text = try document.inspectSelectedSectionText(a, .{}, &.{chart_namespace}, null);
        const fallback_style = try document.inspectSelectedStyleReferences(a, .{}, &.{});
        const chart_style = try document.inspectSelectedStyleReferences(a, .{}, &.{chart_namespace});
        try expectSelectedStyleAgreement(fallback_text, fallback_style);
        try expectSelectedStyleAgreement(chart_text, chart_style);
        switch_removed_case = try removedTextFields(known.section_text, fallback_text);
        switch_removed_default = try removedTextFields(known.section_text, chart_text);
    }
    try std.testing.expectEqual(document.archive.entries.len, known.payload_integrity.validated_entries);
    try std.testing.expectEqual(document.archive.entries.len, known.payload_integrity.manifested_entries + known.payload_integrity.unmanifested_entries.len);
    try std.testing.expectEqual(known.manifest_xml.xml_items, known.manifest_xml.external_xml_items + known.manifest_xml.duplicate_xml_bindings + known.manifest_xml.parsed_entry_indices.len);
    var settings: usize = 0;
    var masterpages: usize = 0;
    for (known.manifest_xml.parsed_entry_indices) |index| {
        const name = document.archive.entries[index].name;
        settings += @intFromBool(std.mem.eql(u8, name, "settings.xml"));
        masterpages += @intFromBool(std.mem.startsWith(u8, name, "Contents/masterpage"));
    }
    try std.testing.expectEqual(settings != 0, known.settings.present);
    var caret_pos_sum: u64 = 0;
    for (known.settings.carets) |caret| {
        if (caret.pos) |raw| caret_pos_sum += try std.fmt.parseInt(u32, raw, 10);
    }
    var short_sum: i64 = 0;
    var boolean_true: usize = 0;
    for (known.settings.items) |item| {
        if (item.type_name) |kind| {
            if (std.mem.eql(u8, kind, "short")) short_sum += try std.fmt.parseInt(i16, item.value.items, 10);
            if (std.mem.eql(u8, kind, "boolean")) boolean_true += @intFromBool(std.mem.eql(u8, item.value.items, "true") or std.mem.eql(u8, item.value.items, "1"));
        }
    }
    try std.testing.expectEqual(masterpages, known.master_pages.parts.parts.len);
    try std.testing.expectEqual(masterpages, known.master_page_style_references.parts);
    var master_style: MasterStyleStats = .{
        .paragraphs = known.master_page_style_references.paragraphs,
        .non_direct_paragraphs = known.master_page_style_references.non_direct_paragraphs,
        .runs = known.master_page_style_references.runs,
        .non_direct_runs = known.master_page_style_references.non_direct_runs,
    };
    var master_run_metadata: [7]usize = @splat(0);
    for (known.master_page_style_references.references, 0..) |counts, i| {
        master_style.present[i] = counts.present;
        master_style.absent[i] = counts.absent;
        master_style.resolved[i] = counts.resolved;
        master_style.missing[i] = counts.missing_target;
        master_style.absent_table[i] = counts.absent_table;
    }
    var master_sub_lists: usize = 0;
    var master_sub_list_direct_paragraphs: usize = 0;
    var master_sub_list_attribute_presence: [sub_list_field_count]usize = @splat(0);
    var master_sub_list_unknown_enums: usize = 0;
    var master_sub_list_other_attributes: usize = 0;
    var master_sub_list_width_sum: u64 = 0;
    var master_sub_list_height_sum: u64 = 0;
    var master_paragraphs: usize = 0;
    var master_paragraph_missing_id: usize = 0;
    var master_paragraph_zero_id: usize = 0;
    var master_paragraph_missing_tc_id: usize = 0;
    var master_paragraph_boolean_present: [3]usize = @splat(0);
    var master_paragraph_page_break_true: usize = 0;
    var master_paragraph_column_break_true: usize = 0;
    var master_paragraph_merged_true: usize = 0;
    var master_page_number_sum: u64 = 0;
    var master_type_counts: [5]usize = @splat(0);
    for (known.master_pages.parts.parts) |part| {
        master_sub_lists += part.sub_lists.len;
        for (part.sub_lists) |list| {
            addRunCounts(&master_run_metadata, runMetadataCounts(list.run_metadata));
            master_sub_list_direct_paragraphs += list.direct_paragraphs;
            for (list.attributes.raw, 0..) |raw, index| master_sub_list_attribute_presence[index] += @intFromBool(raw != null);
            master_sub_list_unknown_enums += list.attributes.unknown_enums;
            master_sub_list_other_attributes += list.attributes.other_attributes;
            if (list.attributes.get(.text_width)) |raw| master_sub_list_width_sum += try std.fmt.parseInt(u32, raw, 10);
            if (list.attributes.get(.text_height)) |raw| master_sub_list_height_sum += try std.fmt.parseInt(u32, raw, 10);
            master_paragraphs += list.paragraph_metadata.paragraphs;
            master_paragraph_missing_id += list.paragraph_metadata.missing_id;
            master_paragraph_zero_id += list.paragraph_metadata.zero_id;
            master_paragraph_missing_tc_id += list.paragraph_metadata.missing_para_tc_id;
            master_paragraph_boolean_present[0] += list.paragraph_metadata.page_break.false_value + list.paragraph_metadata.page_break.true_value;
            master_paragraph_boolean_present[1] += list.paragraph_metadata.column_break.false_value + list.paragraph_metadata.column_break.true_value;
            master_paragraph_boolean_present[2] += list.paragraph_metadata.merged.false_value + list.paragraph_metadata.merged.true_value;
            master_paragraph_page_break_true += list.paragraph_metadata.page_break.true_value;
            master_paragraph_column_break_true += list.paragraph_metadata.column_break.true_value;
            master_paragraph_merged_true += list.paragraph_metadata.merged.true_value;
        }
        if (part.page_number) |raw| master_page_number_sum += try std.fmt.parseInt(u32, raw, 10);
        if (part.kind) |kind| master_type_counts[@intFromEnum(kind)] += 1;
    }
    try std.testing.expectEqual(master_paragraphs, master_style.paragraphs);
    try std.testing.expectEqual(master_style.runs, master_run_metadata[0]);
    try std.testing.expectEqual(master_style.runs, known.master_page_run_topology.runs);
    try std.testing.expectEqual(masterpages, known.master_page_run_topology.parts);
    try std.testing.expectEqual(master_sub_lists, known.master_page_run_topology.sub_lists);
    try std.testing.expectEqual(masterpages, known.master_page_text_nodes.parts);
    try std.testing.expectEqual(masterpages, known.master_page_text.parts);
    try std.testing.expectEqual(masterpages, known.master_page_binary_references.parts);
    try std.testing.expectEqual(master_sub_lists, known.master_page_binary_references.sub_lists);
    try std.testing.expectEqual(known.master_page_text.xml_bytes, known.master_page_binary_references.xml_bytes);
    var master_binary_site_total = known.master_page_binary_references.links.unclassified_attribute_sites;
    for ([_]package.BinaryReferenceKind{ .master_picture, .master_brush_image, .master_ole }) |kind| master_binary_site_total += known.master_page_binary_references.counts(kind).sites;
    try std.testing.expectEqual(master_binary_site_total, known.master_page_binary_references.links.observed_sites);
    try std.testing.expectEqual(master_sub_lists, known.master_page_text.sub_lists);
    try std.testing.expectEqual(master_paragraphs, known.master_page_text.text.paragraphs);
    try std.testing.expectEqual(master_sub_list_direct_paragraphs, known.master_page_text.text.direct_paragraphs);
    try std.testing.expectEqual(master_style.runs, known.master_page_text.text.runs);
    try std.testing.expectEqual(known.master_page_text_nodes.text_nodes, known.master_page_text.text.text_elements);
    try std.testing.expectEqual(known.master_page_text_nodes.non_direct_text_nodes, known.master_page_text.text.non_direct_text_elements);
    try std.testing.expectEqual(known.master_page_text_nodes.tab.tabs, known.master_page_text.text.inlineCount(.tab));
    try std.testing.expectEqual(masterpages, known.master_page_chart_references.parts);
    try std.testing.expectEqual(master_sub_lists, known.master_page_chart_references.sub_lists);
    // The independent ElementTree census finds no hp:chart or chartIDRef
    // anywhere under a root-direct master-page subList in this local corpus.
    try std.testing.expectEqual(@as(usize, 0), known.master_page_chart_references.charts.observed_sites);
    try std.testing.expectEqual(@as(usize, 0), known.master_page_chart_references.charts.chart_parts);
    if (masterpages != 0) {
        for ([_][]const []const u8{ &.{}, &.{"http://www.hancom.co.kr/hwpml/2016/ooxmlchart"} }) |capabilities| {
            var chosen_chart = try document.inspectSelectedMasterPageChartReferences(a, .{}, capabilities);
            defer chosen_chart.deinit(a);
            try std.testing.expectEqual(masterpages, chosen_chart.parts);
            try std.testing.expectEqual(master_sub_lists, chosen_chart.sub_lists);
            try std.testing.expectEqual(@as(usize, 0), chosen_chart.charts.observed_sites);
        }
    }
    if (known.master_page_style_references.parts != 0) {
        for ([_][]const []const u8{ &.{}, &.{"http://www.hancom.co.kr/hwpml/2016/ooxmlchart"} }) |capabilities| {
            const chosen_style = try document.inspectSelectedMasterPageStyleReferences(a, .{}, capabilities);
            const chosen_text = try document.inspectMasterPageText(a, .{ .text = .{ .scan = .{ .branch_policy = .{ .mode = .selected, .supported_namespaces = capabilities } } } }, null);
            try std.testing.expectEqual(chosen_text.text.paragraphs, chosen_style.paragraphs);
            try std.testing.expectEqual(chosen_text.text.runs, chosen_style.runs);
            try std.testing.expectEqual(known.master_page_style_references.parts, chosen_style.parts);
            try std.testing.expectEqual(known.master_page_style_references.sub_lists, chosen_style.sub_lists);
            for (chosen_style.references, 0..) |counts, index| {
                const expected_count = if (index == 2) chosen_style.runs else chosen_style.paragraphs;
                try std.testing.expectEqual(expected_count, counts.present + counts.absent);
            }
            if (known.master_page_run_topology.switches.switches == 0) {
                try std.testing.expectEqualDeep(known.master_page_style_references, chosen_style);
            }
        }
    }
    if (known.run_topology.switches.switches != 0) {
        const fallback_tables = try document.inspectSelectedTableGeometry(a, .{}, &.{});
        const chart_tables = try document.inspectSelectedTableGeometry(a, .{}, &.{"http://www.hancom.co.kr/hwpml/2016/ooxmlchart"});
        try std.testing.expectEqual(known.table_geometry.tables, fallback_tables.tables);
        try std.testing.expectEqual(known.table_geometry.tables, chart_tables.tables);
        try std.testing.expectEqual(known.table_geometry.grid_slots, fallback_tables.grid_slots);
        try std.testing.expectEqual(known.table_geometry.grid_slots, chart_tables.grid_slots);
    }
    if (known.master_page_run_topology.switches.switches != 0) {
        const fallback_tables = try document.inspectSelectedMasterPageTableGeometry(a, .{}, &.{});
        const chart_tables = try document.inspectSelectedMasterPageTableGeometry(a, .{}, &.{"http://www.hancom.co.kr/hwpml/2016/ooxmlchart"});
        try std.testing.expectEqual(known.master_page_table_geometry.geometry.tables, fallback_tables.geometry.tables);
        try std.testing.expectEqual(known.master_page_table_geometry.geometry.tables, chart_tables.geometry.tables);
        try std.testing.expectEqual(known.master_page_table_geometry.geometry.grid_slots, fallback_tables.geometry.grid_slots);
        try std.testing.expectEqual(known.master_page_table_geometry.geometry.grid_slots, chart_tables.geometry.grid_slots);
    }
    try std.testing.expectEqual(masterpages, known.master_page_table_geometry.parts);
    try std.testing.expectEqual(master_sub_lists, known.master_page_table_geometry.sub_lists);
    try std.testing.expectEqual(master_sub_lists, known.master_page_text_nodes.sub_lists);
    try std.testing.expectEqual(masterpages, known.master_page_line_segments.parts);
    try std.testing.expectEqual(master_sub_lists, known.master_page_line_segments.sub_lists);
    try std.testing.expectEqual(master_paragraphs, known.master_page_line_segments.paragraphs);
    try std.testing.expectEqual(masterpages, known.master_page_paragraph_children.parts);
    try std.testing.expectEqual(master_sub_lists, known.master_page_paragraph_children.sub_lists);
    try std.testing.expectEqual(master_paragraphs, known.master_page_paragraph_children.children.paragraphs);
    try std.testing.expectEqual(known.master_page_paragraph_children.children.line_seg_arrays, known.master_page_line_segments.lines.arrays);
    var section_child_total: usize = 0;
    var master_child_total: usize = 0;
    for (known.run_topology.child_classes) |value| section_child_total += value;
    for (known.master_page_run_topology.child_classes) |value| master_child_total += value;
    try std.testing.expectEqual(section_child_total, known.run_topology.direct_children);
    try std.testing.expectEqual(master_child_total, known.master_page_run_topology.direct_children);
    try std.testing.expectEqual(known.run_topology.childCount(.switch_element), known.run_topology.switches.switches);
    try std.testing.expectEqual(known.master_page_run_topology.childCount(.switch_element), known.master_page_run_topology.switches.switches);
    try std.testing.expectEqual(@as(usize, 0), known.master_pages.parts.manifest_id_mismatches);
    try std.testing.expectEqual(@as(usize, 0), known.master_pages.parts.unsupported_types);
    try std.testing.expectEqual(@as(usize, 0), known.master_pages.missing_target);
    try std.testing.expectEqual(@as(usize, 0), known.master_pages.absent_id);
    try std.testing.expectEqual(@as(usize, 0), known.master_pages.ambiguous_target);
    try std.testing.expectEqual(@as(usize, 0), known.master_pages.duplicate_part_ids);
    try std.testing.expectEqual(@as(usize, 0), known.master_pages.unreferenced_parts);
    const count = known.structure.sections.len;
    try std.testing.expectEqual(count, known.section_references.sections);
    try std.testing.expectEqual(count, known.binary_references.sections);
    try std.testing.expectEqual(count, known.chart_references.sections);
    try std.testing.expectEqual(count, known.section_text.sections);
    try std.testing.expectEqual(count, known.paragraph_metadata.sections);
    try std.testing.expectEqual(count, known.run_metadata.sections);
    try std.testing.expectEqual(count, known.table_geometry.sections);
    try std.testing.expectEqual(known.section_text.paragraphs, known.paragraph_metadata.paragraphs);
    try std.testing.expectEqual(known.section_references.runs, known.run_metadata.runs);
    try std.testing.expectEqual(known.run_metadata.runs, known.run_topology.runs);
    try std.testing.expectEqual(known.section_text.non_direct_runs, known.run_topology.non_direct_runs);
    try std.testing.expectEqual(known.paragraph_metadata.paragraphs, known.paragraph_children.paragraphs);
    try std.testing.expectEqual(known.section_text.paragraphs_without_direct_run, known.paragraph_children.paragraphs_without_run);
    try std.testing.expectEqual(known.section_text.runs - known.section_text.non_direct_runs, known.paragraph_children.direct_runs);
    try std.testing.expectEqual(known.paragraph_children.sections, known.line_segments.sections);
    try std.testing.expectEqual(count, known.page_geometry.sections);
    try std.testing.expectEqual(count, known.section_definitions.sections);
    try std.testing.expectEqual(known.page_geometry.pages.len, known.section_definitions.definitions.len);
    try std.testing.expectEqual(known.master_pages.count_declarations.len, known.section_definitions.definitions.len);
    for (known.section_definitions.definitions, known.master_pages.count_declarations) |definition, declaration| {
        try std.testing.expectEqualStrings(definition.get(.master_page_count).?, declaration.raw);
        try std.testing.expectEqual(definition.section_ordinal, declaration.section_ordinal);
    }
    try std.testing.expectEqual(known.paragraph_children.line_seg_arrays, known.line_segments.arrays);
    for (known.line_segments.field_present, known.line_segments.field_missing) |present, missing| {
        try std.testing.expectEqual(known.line_segments.segments, present);
        try std.testing.expectEqual(@as(usize, 0), missing);
    }
    try std.testing.expectEqual(count, known.run_topology.parts);
    try std.testing.expectEqual(count, known.text_nodes.parts);
    try std.testing.expectEqual(known.section_text.text_elements, known.text_nodes.text_nodes);
    try std.testing.expectEqual(known.section_text.non_direct_text_elements, known.text_nodes.non_direct_text_nodes);
    try std.testing.expectEqual(known.section_text.inlineCount(.tab), known.text_nodes.tab.tabs);
    try std.testing.expectEqual(known.text_nodes.annotation_markers, known.text_nodes.markpen.begins + known.text_nodes.markpen.ends + known.text_nodes.title_mark.marks);
    try std.testing.expectEqual(known.master_page_text_nodes.annotation_markers, known.master_page_text_nodes.markpen.begins + known.master_page_text_nodes.markpen.ends + known.master_page_text_nodes.title_mark.marks);
    try std.testing.expectEqual(known.section_text.inlineCount(.markpen_begin), known.text_nodes.markpen.begins);
    try std.testing.expectEqual(known.section_text.inlineCount(.markpen_end), known.text_nodes.markpen.ends);
    try std.testing.expectEqual(known.section_text.inlineCount(.title_mark), known.text_nodes.title_mark.marks);
    var page_stats: PageStats = .{};
    try page_stats.add(known.page_geometry);
    var section_definition_stats: SectionDefinitionStats = .{};
    try section_definition_stats.add(known.section_definitions);
    return .{ .accepted = .{
        .sections = count,
        .page_geometry = page_stats,
        .section_definitions = section_definition_stats,
        .section_definition_refs = try SectionDefinitionRefStats.from(known.section_definition_references, known.section_definitions.definitions.len),
        .section_settings = try SectionSettingsStats.from(a, known.section_definitions, known.section_direct_settings),
        .section_page_borders = try SectionPageBorderStats.from(a, known.section_definitions, known.section_page_borders),
        .section_page_border_refs = try SectionPageBorderRefStats.from(known.section_page_borders, known.section_page_border_references),
        .section_notes = try SectionNoteStats.from(a, known.section_definitions, known.section_note_shapes),
        .section_presentation = try PresentationStats.from(a, known.section_definitions, known.section_presentation),
        .fill_brushes = try fill_brush_stats.Stats.from(a, known.fill_brushes, known.section_presentation),
        .master_fill_brushes = try master_fill_brush_stats.Stats.from(known.master_page_fill_brushes, known.master_pages),
        .paragraphs = known.paragraph_metadata.paragraphs,
        .paragraph_children = known.paragraph_children,
        .line_segments = known.line_segments,
        .master_line_segments = known.master_page_line_segments,
        .master_paragraph_children = known.master_page_paragraph_children,
        .begin_present = known.begin_numbers.present,
        .missing_id = known.paragraph_metadata.missing_id,
        .manifest_xml_entries = known.manifest_xml.parsed_entry_indices.len,
        .manifest_xml_bytes = known.manifest_xml.decoded_xml_bytes,
        .manifest_xml_elements = known.manifest_xml.elements,
        .manifest_xml_settings = settings,
        .manifest_xml_masterpages = masterpages,
        .settings_carets = known.settings.carets.len,
        .settings_caret_pos_sum = caret_pos_sum,
        .settings_config_sets = known.settings.sets.len,
        .settings_config_items = known.settings.items.len,
        .settings_short_sum = short_sum,
        .settings_boolean_true = boolean_true,
        .settings_unsupported_types = known.settings.unsupported_types,
        .master_page_refs = known.master_pages.resolved,
        .master_page_sub_lists = master_sub_lists,
        .master_sub_list_direct_paragraphs = master_sub_list_direct_paragraphs,
        .master_sub_list_attribute_presence = master_sub_list_attribute_presence,
        .master_sub_list_unknown_enums = master_sub_list_unknown_enums,
        .master_sub_list_other_attributes = master_sub_list_other_attributes,
        .master_sub_list_width_sum = master_sub_list_width_sum,
        .master_sub_list_height_sum = master_sub_list_height_sum,
        .master_paragraphs = master_paragraphs,
        .master_paragraph_missing_id = master_paragraph_missing_id,
        .master_paragraph_zero_id = master_paragraph_zero_id,
        .master_paragraph_missing_tc_id = master_paragraph_missing_tc_id,
        .master_paragraph_boolean_present = master_paragraph_boolean_present,
        .master_paragraph_page_break_true = master_paragraph_page_break_true,
        .master_paragraph_column_break_true = master_paragraph_column_break_true,
        .master_paragraph_merged_true = master_paragraph_merged_true,
        .master_style = master_style,
        .section_run_metadata = runMetadataCounts(known.run_metadata),
        .master_run_metadata = master_run_metadata,
        .section_run_topology = TopologyStats.from(known.run_topology),
        .master_run_topology = TopologyStats.from(known.master_page_run_topology),
        .section_text_nodes = TextNodeStats.from(known.text_nodes),
        .master_text_nodes = TextNodeStats.from(known.master_page_text_nodes),
        .master_text = MasterTextStats.from(known.master_page_text, if (master_text_digest.text_elements == 0) 0 else master_text_digest.value),
        .master_binary = MasterBinaryStats.from(known.master_page_binary_references),
        .master_page_number_sum = master_page_number_sum,
        .master_page_count_declarations = known.master_pages.count_declarations.len,
        .master_page_type_counts = master_type_counts,
        .switch_removed_case = switch_removed_case,
        .switch_removed_default = switch_removed_default,
        .table_geometry = known.table_geometry,
        .master_table_geometry = known.master_page_table_geometry,
    } };
}

fn surveyShard(shard: usize) !void {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var page_geometry: PageStats = .{};
    var section_definitions: SectionDefinitionStats = .{};
    var section_definition_refs: SectionDefinitionRefStats = .{};
    var section_settings: SectionSettingsStats = .{};
    var section_page_borders: SectionPageBorderStats = .{};
    var section_page_border_refs: SectionPageBorderRefStats = .{};
    var section_notes: SectionNoteStats = .{};
    var section_presentation: PresentationStats = .{};
    var fill_brushes: fill_brush_stats.Stats = .{};
    var master_fill_brushes: master_fill_brush_stats.Stats = .{};
    var paragraphs: usize = 0;
    var paragraph_children: package.ParagraphChildrenReport = .{};
    var line_segments: package.LineSegmentsReport = .{};
    var master_line_segments: package.MasterPageLineSegmentsReport = .{};
    var master_paragraph_children: package.MasterPageParagraphChildrenReport = .{};
    var begin_present: usize = 0;
    var missing_id: usize = 0;
    var manifest_xml_entries: usize = 0;
    var manifest_xml_bytes: usize = 0;
    var manifest_xml_elements: usize = 0;
    var manifest_xml_settings: usize = 0;
    var manifest_xml_masterpages: usize = 0;
    var settings_carets: usize = 0;
    var settings_caret_pos_sum: u64 = 0;
    var settings_config_sets: usize = 0;
    var settings_config_items: usize = 0;
    var settings_short_sum: i64 = 0;
    var settings_boolean_true: usize = 0;
    var settings_unsupported_types: usize = 0;
    var master_page_refs: usize = 0;
    var master_page_sub_lists: usize = 0;
    var master_sub_list_direct_paragraphs: usize = 0;
    var master_sub_list_attribute_presence: [sub_list_field_count]usize = @splat(0);
    var master_sub_list_unknown_enums: usize = 0;
    var master_sub_list_other_attributes: usize = 0;
    var master_sub_list_width_sum: u64 = 0;
    var master_sub_list_height_sum: u64 = 0;
    var master_paragraphs: usize = 0;
    var master_paragraph_missing_id: usize = 0;
    var master_paragraph_zero_id: usize = 0;
    var master_paragraph_missing_tc_id: usize = 0;
    var master_paragraph_boolean_present: [3]usize = @splat(0);
    var master_paragraph_page_break_true: usize = 0;
    var master_paragraph_column_break_true: usize = 0;
    var master_paragraph_merged_true: usize = 0;
    var master_style: MasterStyleStats = .{};
    var section_run_metadata: [7]usize = @splat(0);
    var master_run_metadata: [7]usize = @splat(0);
    var section_run_topology: TopologyStats = .{};
    var master_run_topology: TopologyStats = .{};
    var section_text_nodes: TextNodeStats = .{};
    var master_text_nodes: TextNodeStats = .{};
    var master_text: MasterTextStats = .{};
    var master_binary: MasterBinaryStats = .{};
    var master_page_number_sum: u64 = 0;
    var master_page_count_declarations: usize = 0;
    var master_page_type_counts: [5]usize = @splat(0);
    var switch_removed_case: [5]usize = @splat(0);
    var switch_removed_default: [5]usize = @splat(0);
    var table_geometry: package.TableGeometryReport = .{};
    var master_table_geometry: package.MasterPageTableGeometryReport = .{};
    var table_attributes: package.TableAttributesReport = .{};
    var table_children: package.TableChildrenReport = .{};
    var table_shape: ShapeTotals = .{};
    var table_child_topology: package.TableChildTopologyReport = .{};
    var table_fields: package.TableCellFieldsReport = .{};
    var table_sub_lists: package.TableCellSubListsReport = .{};
    for (roots, 0..) |root, root_index| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            var path_sum: usize = root_index;
            for (entry.path) |byte| path_sum += byte;
            if (path_sum % 8 != shard) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            const outcome = inspectOne(bytes) catch |err| {
                std.debug.print("HWPX known inspections unexpected path={s} error={s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            switch (outcome) {
                .rejected_zip => rejected_zip += 1,
                .encrypted => encrypted += 1,
                .accepted => |stats| {
                    const has_captioned_switch = root_index == 1 and std.mem.eql(u8, entry.path, "issue2006/1790387_prep_final_report.hwpx");
                    const expected_removed: [5]usize = if (has_captioned_switch) .{ 2, 2, 2, 173, 0 } else @splat(0);
                    try std.testing.expectEqualSlices(usize, &expected_removed, &stats.switch_removed_case);
                    try std.testing.expectEqualSlices(usize, &expected_removed, &stats.switch_removed_default);
                    sections += stats.sections;
                    section_definitions.merge(stats.section_definitions);
                    section_definition_refs.merge(stats.section_definition_refs);
                    section_settings.merge(stats.section_settings);
                    section_page_borders.merge(stats.section_page_borders);
                    section_page_border_refs.merge(stats.section_page_border_refs);
                    section_notes.merge(stats.section_notes);
                    section_presentation.merge(stats.section_presentation);
                    fill_brushes.merge(stats.fill_brushes);
                    master_fill_brushes.merge(stats.master_fill_brushes);
                    page_geometry.pages += stats.page_geometry.pages;
                    page_geometry.widely += stats.page_geometry.widely;
                    page_geometry.left_right += stats.page_geometry.left_right;
                    page_geometry.width_sum += stats.page_geometry.width_sum;
                    page_geometry.height_sum += stats.page_geometry.height_sum;
                    for (&page_geometry.margin_sum, stats.page_geometry.margin_sum) |*sum, value| sum.* += value;
                    paragraphs += stats.paragraphs;
                    addParagraphChildren(&paragraph_children, stats.paragraph_children);
                    addLineReport(&line_segments, stats.line_segments);
                    master_line_segments.parts += stats.master_line_segments.parts;
                    master_line_segments.sub_lists += stats.master_line_segments.sub_lists;
                    master_line_segments.paragraphs += stats.master_line_segments.paragraphs;
                    master_line_segments.xml_bytes += stats.master_line_segments.xml_bytes;
                    addLineReport(&master_line_segments.lines, stats.master_line_segments.lines);
                    master_paragraph_children.parts += stats.master_paragraph_children.parts;
                    master_paragraph_children.sub_lists += stats.master_paragraph_children.sub_lists;
                    master_paragraph_children.xml_bytes += stats.master_paragraph_children.xml_bytes;
                    addParagraphChildren(&master_paragraph_children.children, stats.master_paragraph_children.children);
                    missing_id += stats.missing_id;
                    if (stats.begin_present) begin_present += 1;
                    manifest_xml_entries += stats.manifest_xml_entries;
                    manifest_xml_bytes += stats.manifest_xml_bytes;
                    manifest_xml_elements += stats.manifest_xml_elements;
                    manifest_xml_settings += stats.manifest_xml_settings;
                    manifest_xml_masterpages += stats.manifest_xml_masterpages;
                    settings_carets += stats.settings_carets;
                    settings_caret_pos_sum += stats.settings_caret_pos_sum;
                    settings_config_sets += stats.settings_config_sets;
                    settings_config_items += stats.settings_config_items;
                    settings_short_sum += stats.settings_short_sum;
                    settings_boolean_true += stats.settings_boolean_true;
                    settings_unsupported_types += stats.settings_unsupported_types;
                    master_page_refs += stats.master_page_refs;
                    master_page_sub_lists += stats.master_page_sub_lists;
                    master_sub_list_direct_paragraphs += stats.master_sub_list_direct_paragraphs;
                    for (stats.master_sub_list_attribute_presence, 0..) |value, i| master_sub_list_attribute_presence[i] += value;
                    master_sub_list_unknown_enums += stats.master_sub_list_unknown_enums;
                    master_sub_list_other_attributes += stats.master_sub_list_other_attributes;
                    master_sub_list_width_sum += stats.master_sub_list_width_sum;
                    master_sub_list_height_sum += stats.master_sub_list_height_sum;
                    master_paragraphs += stats.master_paragraphs;
                    master_paragraph_missing_id += stats.master_paragraph_missing_id;
                    master_paragraph_zero_id += stats.master_paragraph_zero_id;
                    master_paragraph_missing_tc_id += stats.master_paragraph_missing_tc_id;
                    for (stats.master_paragraph_boolean_present, 0..) |value, i| master_paragraph_boolean_present[i] += value;
                    master_paragraph_page_break_true += stats.master_paragraph_page_break_true;
                    master_paragraph_column_break_true += stats.master_paragraph_column_break_true;
                    master_paragraph_merged_true += stats.master_paragraph_merged_true;
                    master_style.add(stats.master_style);
                    addRunCounts(&section_run_metadata, stats.section_run_metadata);
                    addRunCounts(&master_run_metadata, stats.master_run_metadata);
                    section_run_topology.add(stats.section_run_topology);
                    master_run_topology.add(stats.master_run_topology);
                    section_text_nodes.add(stats.section_text_nodes);
                    master_text_nodes.add(stats.master_text_nodes);
                    master_text.add(stats.master_text);
                    master_binary.add(stats.master_binary);
                    master_page_number_sum += stats.master_page_number_sum;
                    master_page_count_declarations += stats.master_page_count_declarations;
                    for (stats.master_page_type_counts, 0..) |value, i| master_page_type_counts[i] += value;
                    for (stats.switch_removed_case, 0..) |value, i| switch_removed_case[i] += value;
                    for (stats.switch_removed_default, 0..) |value, i| switch_removed_default[i] += value;
                    const t = stats.table_geometry;
                    const mt = stats.master_table_geometry;
                    master_table_geometry.parts += mt.parts;
                    master_table_geometry.sub_lists += mt.sub_lists;
                    master_table_geometry.xml_bytes += mt.xml_bytes;
                    master_table_geometry.elements += mt.elements;
                    master_table_geometry.geometry.tables += mt.geometry.tables;
                    master_table_geometry.geometry.rows += mt.geometry.rows;
                    master_table_geometry.geometry.cells += mt.geometry.cells;
                    master_table_geometry.geometry.grid_slots += mt.geometry.grid_slots;
                    master_table_geometry.geometry.cell_slots += mt.geometry.cell_slots;
                    master_table_geometry.geometry.overlaps += mt.geometry.overlaps;
                    master_table_geometry.geometry.uncovered_slots += mt.geometry.uncovered_slots;
                    master_table_geometry.geometry.table_attributes.border_fill_references.resolved += mt.geometry.table_attributes.border_fill_references.resolved;
                    master_table_geometry.geometry.cell_fields.border_fill_references.resolved += mt.geometry.cell_fields.border_fill_references.resolved;
                    master_table_geometry.geometry.table_shape.label.elements += mt.geometry.table_shape.label.elements;
                    master_table_geometry.geometry.table_shape.table_fields[0].sum += mt.geometry.table_shape.table_fields[0].sum;
                    master_table_geometry.geometry.table_shape.size.fields[0].sum += mt.geometry.table_shape.size.fields[0].sum;
                    master_table_geometry.geometry.cell_fields.size_sum[0] += mt.geometry.cell_fields.size_sum[0];
                    master_table_geometry.geometry.cell_sub_lists.direct_paragraphs += mt.geometry.cell_sub_lists.direct_paragraphs;
                    master_table_geometry.geometry.table_children.margin_sum[0] += mt.geometry.table_children.margin_sum[0];
                    table_geometry.tables += t.tables;
                    table_geometry.rows += t.rows;
                    table_geometry.cells += t.cells;
                    const topology = t.table_child_topology;
                    try std.testing.expectEqual(t.rows, topology.rows);
                    try std.testing.expectEqual(t.cells, topology.cells);
                    try std.testing.expectEqual(@as(usize, 0), topology.row_other_attributes + topology.row_other_direct + topology.row_foreign_direct + topology.cell_other_attributes + topology.cell_other_direct + topology.cell_foreign_direct);
                    try std.testing.expectEqual(t.cells * 5, topology.cell_known_direct);
                    try std.testing.expectEqual(t.cells, topology.cell_first_known_sub_list);
                    try std.testing.expectEqual(t.cells, topology.observed_common_sequence + topology.observed_address_last_sequence + topology.other_known_sequence);
                    try std.testing.expectEqual(@as(usize, 0), topology.other_known_sequence);
                    table_child_topology.rows += topology.rows;
                    table_child_topology.cells += topology.cells;
                    table_child_topology.cell_known_direct += topology.cell_known_direct;
                    table_child_topology.cell_first_known_sub_list += topology.cell_first_known_sub_list;
                    table_child_topology.cell_last_known_address += topology.cell_last_known_address;
                    table_child_topology.observed_common_sequence += topology.observed_common_sequence;
                    table_child_topology.observed_address_last_sequence += topology.observed_address_last_sequence;
                    table_child_topology.other_known_sequence += topology.other_known_sequence;
                    table_geometry.grid_slots += t.grid_slots;
                    table_geometry.cell_slots += t.cell_slots;
                    const attrs = t.table_attributes;
                    try std.testing.expectEqual(t.tables, attrs.tables);
                    try std.testing.expectEqual(t.tables, attrs.page_break.absent + attrs.page_break.none + attrs.page_break.table + attrs.page_break.cell + attrs.page_break.unknown);
                    try std.testing.expectEqual(t.tables, attrs.repeat_header.absent + attrs.repeat_header.false_value + attrs.repeat_header.true_value);
                    try std.testing.expectEqual(t.tables, attrs.no_adjust.absent + attrs.no_adjust.false_value + attrs.no_adjust.true_value);
                    try std.testing.expect(attrs.border_fill_references_checked);
                    try std.testing.expectEqual(t.tables, attrs.border_fill_references.present + attrs.border_fill_references.absent);
                    try std.testing.expectEqual(t.tables, attrs.border_fill_references.resolved + attrs.border_fill_references.missing_target + attrs.border_fill_references.absent_table + attrs.border_fill_references.absent);
                    try std.testing.expectEqual(attrs.border_fill_zero, attrs.border_fill_references.missing_target);
                    if (attrs.border_fill_references.missing_target != 0) try std.testing.expectEqual(@as(?u32, 0), attrs.border_fill_references.first_unresolved_id);
                    table_attributes.tables += attrs.tables;
                    table_attributes.page_break.absent += attrs.page_break.absent;
                    table_attributes.page_break.none += attrs.page_break.none;
                    table_attributes.page_break.table += attrs.page_break.table;
                    table_attributes.page_break.cell += attrs.page_break.cell;
                    table_attributes.page_break.unknown += attrs.page_break.unknown;
                    table_attributes.repeat_header.absent += attrs.repeat_header.absent;
                    table_attributes.repeat_header.true_value += attrs.repeat_header.true_value;
                    table_attributes.repeat_header.false_value += attrs.repeat_header.false_value;
                    table_attributes.no_adjust.absent += attrs.no_adjust.absent;
                    table_attributes.no_adjust.true_value += attrs.no_adjust.true_value;
                    table_attributes.no_adjust.false_value += attrs.no_adjust.false_value;
                    table_attributes.cell_spacing_absent += attrs.cell_spacing_absent;
                    table_attributes.cell_spacing_zero += attrs.cell_spacing_zero;
                    table_attributes.cell_spacing_sum += attrs.cell_spacing_sum;
                    table_attributes.border_fill_absent += attrs.border_fill_absent;
                    table_attributes.border_fill_zero += attrs.border_fill_zero;
                    table_attributes.border_fill_sum += attrs.border_fill_sum;
                    table_attributes.border_fill_references.resolved += attrs.border_fill_references.resolved;
                    table_attributes.border_fill_references.missing_target += attrs.border_fill_references.missing_target;
                    table_attributes.border_fill_references.absent_table += attrs.border_fill_references.absent_table;
                    const children = t.table_children;
                    try std.testing.expectEqual(t.tables, children.tables);
                    try std.testing.expect(children.border_references_checked);
                    try std.testing.expectEqual(t.tables, children.in_margins);
                    try std.testing.expectEqual(@as(usize, 0), children.missing_in_margin + children.duplicate_in_margin + children.duplicate_zone_list + children.empty_zone_lists + children.other_zone_list_children + children.inverted_zones + children.outside_grid + children.border_absent + children.border_zero + children.border_references.missing_target + children.border_references.absent_table);
                    try std.testing.expectEqual(children.zones, children.border_references.resolved);
                    for (children.margin_missing) |value| try std.testing.expectEqual(@as(usize, 0), value);
                    for (children.margin_negative) |value| try std.testing.expectEqual(@as(usize, 0), value);
                    for (children.margin_highbit) |value| try std.testing.expectEqual(@as(usize, 0), value);
                    for (children.coordinate_absent) |value| try std.testing.expectEqual(@as(usize, 0), value);
                    table_children.tables += children.tables;
                    table_children.in_margins += children.in_margins;
                    table_children.zone_lists += children.zone_lists;
                    table_children.zones += children.zones;
                    table_children.border_sum += children.border_sum;
                    const shape = t.table_shape;
                    try std.testing.expectEqual(t.tables, shape.tables);
                    try std.testing.expectEqual(t.tables, shape.size.elements);
                    try std.testing.expectEqual(t.tables, shape.position.elements);
                    try std.testing.expectEqual(t.tables, shape.out_margin.elements);
                    try std.testing.expectEqual(shape.caption.elements, shape.caption_sub_lists);
                    try std.testing.expectEqual(@as(usize, 0), shape.size.missing_tables + shape.size.duplicate_tables + shape.position.missing_tables + shape.position.duplicate_tables + shape.out_margin.missing_tables + shape.out_margin.duplicate_tables + shape.caption.duplicate_tables + shape.label.duplicate_tables + shape.shape_comment.elements + shape.parameter_set.elements + shape.meta_tag.elements + shape.other_direct_children + shape.caption_missing_sub_list + shape.caption_duplicate_sub_list + shape.caption_other_direct_children + shape.caption_unknown_enums + shape.caption_other_attributes);
                    for (shape.table_fields, 0..) |field, i| {
                        if (i != 6) try std.testing.expectEqual(t.tables, field.present);
                        try std.testing.expectEqual(@as(usize, 0), field.unknown_enum);
                        if (i != 3) try std.testing.expectEqual(@as(usize, 0), field.extension_enum);
                    }
                    try expectCompleteShapeFields(shape.size.fields, shape.size.elements);
                    try expectCompleteShapeFields(shape.position.fields, shape.position.elements);
                    try expectCompleteShapeFields(shape.out_margin.fields, shape.out_margin.elements);
                    try expectCompleteShapeFields(shape.caption.fields, shape.caption.elements);
                    try expectCompleteShapeFields(shape.label.fields, shape.label.elements);
                    table_shape.add(shape);
                    for (children.margin_sum, 0..) |value, i| {
                        table_children.margin_sum[i] += value;
                        table_children.margin_zero[i] += children.margin_zero[i];
                    }
                    for (children.coordinate_sum, 0..) |value, i| table_children.coordinate_sum[i] += value;
                    try std.testing.expectEqual(@as(usize, 0), t.missing_row_count + t.missing_column_count + t.row_count_mismatch + t.empty_rows + t.missing_address + t.duplicate_address + t.missing_span + t.duplicate_span + t.missing_coordinate + t.missing_span_value + t.row_address_mismatch + t.zero_span + t.outside_grid + t.overlaps + t.uncovered_slots);
                    const fields = t.cell_fields;
                    try std.testing.expectEqual(t.cells, fields.cells);
                    try std.testing.expectEqual(t.cells, fields.size_elements);
                    try std.testing.expectEqual(t.cells, fields.margin_elements);
                    try std.testing.expectEqual(t.cells, fields.has_margin.true_value + fields.has_margin.false_value);
                    try std.testing.expectEqual(fields.has_margin.false_value, fields.false_with_margin);
                    try std.testing.expectEqual(@as(usize, 0), fields.missing_size + fields.duplicate_size + fields.missing_margin + fields.duplicate_margin + fields.has_margin.absent + fields.true_without_margin + fields.zero_size_field[0]);
                    try std.testing.expectEqual(fields.cells, fields.name_present + fields.name_absent);
                    try std.testing.expectEqual(fields.cells, fields.border_fill_present);
                    try std.testing.expect(fields.border_fill_references_checked);
                    try std.testing.expectEqual(@as(usize, 0), fields.border_fill_absent + fields.border_fill_zero);
                    try std.testing.expectEqual(fields.cells, fields.border_fill_references.present);
                    try std.testing.expectEqual(fields.cells, fields.border_fill_references.resolved);
                    try std.testing.expectEqual(@as(usize, 0), fields.border_fill_references.absent + fields.border_fill_references.missing_target + fields.border_fill_references.absent_table);
                    try std.testing.expectEqual(@as(?u32, null), fields.border_fill_references.first_unresolved_id);
                    for (fields.flags) |flag| try std.testing.expectEqual(fields.cells, flag.true_value + flag.false_value);
                    for (fields.missing_size_field) |value| try std.testing.expectEqual(@as(usize, 0), value);
                    for (fields.missing_margin_field) |value| try std.testing.expectEqual(@as(usize, 0), value);
                    table_fields.has_margin.true_value += fields.has_margin.true_value;
                    table_fields.name_absent += fields.name_absent;
                    table_fields.name_empty += fields.name_empty;
                    table_fields.name_utf8_bytes += fields.name_utf8_bytes;
                    table_fields.border_fill_sum += fields.border_fill_sum;
                    for (fields.flags, 0..) |flag, i| table_fields.flags[i].true_value += flag.true_value;
                    for (fields.size_sum, 0..) |value, i| {
                        table_fields.size_sum[i] += value;
                        table_fields.zero_size_field[i] += fields.zero_size_field[i];
                    }
                    for (fields.margin_sum, 0..) |value, i| {
                        table_fields.margin_sum[i] += value;
                        table_fields.zero_margin_field[i] += fields.zero_margin_field[i];
                        table_fields.negative_margin_field[i] += fields.negative_margin_field[i];
                        table_fields.highbit_margin_field[i] += fields.highbit_margin_field[i];
                    }
                    const lists = t.cell_sub_lists;
                    try std.testing.expectEqual(t.cells, lists.cells);
                    try std.testing.expectEqual(t.cells, lists.sub_lists);
                    try std.testing.expectEqual(@as(usize, 0), lists.missing_cells + lists.duplicate_cells + lists.empty_sub_lists + lists.other_direct_elements + lists.unknown_enums + lists.other_attributes + lists.has_text_ref_true + lists.has_num_ref_true);
                    try std.testing.expectEqual(@as(u64, 0), lists.text_width_sum + lists.text_height_sum);
                    for (lists.field_present, 0..) |value, i| {
                        if (i == @intFromEnum(para_list_attributes.Field.id) or i == @intFromEnum(para_list_attributes.Field.metatag)) continue;
                        try std.testing.expectEqual(lists.sub_lists, value);
                    }
                    table_sub_lists.sub_lists += lists.sub_lists;
                    table_sub_lists.direct_paragraphs += lists.direct_paragraphs;
                    table_sub_lists.field_present[@intFromEnum(para_list_attributes.Field.id)] += lists.field_present[@intFromEnum(para_list_attributes.Field.id)];
                    table_sub_lists.field_present[@intFromEnum(para_list_attributes.Field.metatag)] += lists.field_present[@intFromEnum(para_list_attributes.Field.metatag)];
                    table_sub_lists.field_empty[@intFromEnum(para_list_attributes.Field.id)] += lists.field_empty[@intFromEnum(para_list_attributes.Field.id)];
                    accepted += 1;
                },
            }
        }
    }
    std.debug.print("HWPX known shard={d} accepted={d} rejected_zip={d} encrypted={d} sections={d} paragraphs={d} begin_present={d} missing_id={d}\n", .{ shard, accepted, rejected_zip, encrypted, sections, paragraphs, begin_present, missing_id });
    try std.testing.expectEqual(expected.accepted[shard], accepted);
    try std.testing.expectEqual(expected.rejected_zip[shard], rejected_zip);
    try std.testing.expectEqual(expected.encrypted[shard], encrypted);
    try std.testing.expectEqual(expected.sections[shard], sections);
    try std.testing.expectEqual(expected.page_geometry_pages[shard], page_geometry.pages);
    try std.testing.expectEqual(expected.section_definition_count[shard], section_definitions.definitions);
    try std.testing.expectEqualSlices(usize, &expected.section_setting_counts[shard], &section_settings.counts);
    try std.testing.expectEqual(expected.section_setting_extensions[shard], section_settings.extension_attributes);
    try std.testing.expectEqual(expected.section_setting_start_odd[shard], section_settings.start_odd);
    try std.testing.expectEqual(expected.section_setting_start_page_sum[shard], section_settings.start_page_sum);
    try std.testing.expectEqual(expected.section_setting_fill_show_first[shard], section_settings.fill_show_first);
    try std.testing.expectEqualSlices(usize, &expected.section_setting_visibility_true[shard], &section_settings.visibility_true);
    try std.testing.expectEqual(expected.section_page_border_count[shard], section_page_borders.borders);
    try std.testing.expectEqualSlices(usize, &expected.section_page_border_types[shard], &section_page_borders.types);
    try std.testing.expectEqual(expected.section_page_border_id_sum[shard], section_page_borders.id_sum);
    try std.testing.expectEqual(expected.section_page_border_id_zero[shard], section_page_borders.id_zero);
    try std.testing.expectEqual(expected.section_page_border_content[shard], section_page_borders.content);
    try std.testing.expectEqual(expected.section_page_border_inside[shard], section_page_borders.header_inside);
    try std.testing.expectEqual(expected.section_page_border_inside[shard], section_page_borders.footer_inside);
    try std.testing.expectEqualSlices(u64, &expected.section_page_border_offset_sums[shard], &section_page_borders.offset_sums);
    try std.testing.expectEqual(expected.section_page_border_refs_resolved[shard], section_page_border_refs.resolved);
    try std.testing.expectEqual(expected.section_page_border_refs_missing_target[shard], section_page_border_refs.missing_target);
    try std.testing.expectEqualSlices(usize, &expected.section_note_counts[shard], &section_notes.counts);
    try std.testing.expectEqualSlices(i64, &expected.section_note_line_length_sums[shard], &section_notes.line_lengths);
    try std.testing.expectEqualSlices(u64, &expected.section_note_spacing_sums[shard], &section_notes.spacing);
    try std.testing.expectEqualSlices(u64, &expected.section_note_new_num_sums[shard], &section_notes.new_nums);
    try std.testing.expectEqualSlices(usize, &expected.section_note_supscript_true[shard], &section_notes.superscript);
    try std.testing.expectEqualSlices(usize, &expected.section_note_anomalies[shard], &section_notes.anomalies);
    try std.testing.expectEqualSlices(usize, &expected.section_note_missing_chars[shard], &section_notes.missing_chars);
    try std.testing.expectEqualSlices(usize, &expected.section_note_nonempty_chars[shard], &section_notes.nonempty_chars);
    try std.testing.expectEqualSlices(usize, &expected.section_note_other_enums[shard], &section_notes.other_enums);
    try std.testing.expectEqual(expected.section_presentation_counts[shard], section_presentation.items);
    try std.testing.expectEqual(expected.section_presentation_counts[shard], section_presentation.brushes);
    try std.testing.expectEqual(expected.section_presentation_counts[shard], section_presentation.brush_children);
    try std.testing.expectEqual(expected.section_presentation_counts[shard], section_presentation.invert_true);
    try std.testing.expectEqual(@as(usize, 0), section_presentation.autoshow_true);
    try std.testing.expectEqual(@as(u64, 0), section_presentation.showtime_sum);
    try std.testing.expectEqual(expected.fill_brush_counts[shard], fill_brushes.brushes);
    try std.testing.expectEqual(expected.fill_brush_header_counts[shard], fill_brushes.header_brushes);
    try std.testing.expectEqualSlices(usize, &expected.fill_brush_node_counts[shard], &fill_brushes.nodes);
    try std.testing.expectEqual(expected.fill_brush_direct_children[shard], fill_brushes.direct_children);
    try std.testing.expectEqual(expected.fill_brush_non_six_hex[shard], fill_brushes.non_six_hex_colors);
    try std.testing.expectEqual(expected.fill_brush_multiple_variants[shard], fill_brushes.multiple_variants);
    try std.testing.expectEqual(expected.fill_brush_missing_hatch_style[shard], fill_brushes.missing_hatch_style);
    try std.testing.expectEqual(expected.fill_brush_missing_color_num[shard], fill_brushes.missing_color_num);
    try std.testing.expectEqualSlices(usize, &expected.fill_brush_color_markers[shard], &fill_brushes.color_markers);
    try std.testing.expectEqualSlices(i64, &expected.fill_brush_numeric_sums[shard], &fill_brushes.numeric_sums);
    try std.testing.expectEqualSlices(usize, &expected.fill_brush_gradation_types[shard], &fill_brushes.gradation_types);
    try std.testing.expectEqualSlices(usize, &expected.fill_brush_image_modes[shard], &fill_brushes.image_modes);
    try std.testing.expectEqualSlices(usize, &expected.fill_brush_image_effects[shard], &fill_brushes.image_effects);
    try std.testing.expectEqualSlices(usize, &expected.fill_brush_hatch_styles[shard], &fill_brushes.hatch_styles);
    try std.testing.expectEqual(expected.master_fill_brush_parts[shard], master_fill_brushes.parts);
    try std.testing.expectEqual(expected.master_fill_brush_counts[shard], master_fill_brushes.brushes);
    try std.testing.expectEqual(expected.master_fill_brush_face_sums[shard], master_fill_brushes.face_sum);
    try std.testing.expectEqual(expected.master_fill_brush_hatch_sums[shard], master_fill_brushes.hatch_sum);
    try std.testing.expectEqual(expected.section_outline_zero[shard], section_definition_refs.outline_zero);
    try std.testing.expectEqual(expected.section_outline_resolved[shard], section_definition_refs.outline_resolved);
    try std.testing.expectEqual(expected.section_outline_absent_table[shard], section_definition_refs.outline_absent_table);
    try std.testing.expectEqual(expected.section_memo_zero[shard], section_definition_refs.memo_zero);
    try std.testing.expectEqual(expected.section_memo_resolved[shard], section_definition_refs.memo_resolved);
    try std.testing.expectEqual(expected.section_definition_missing_id[shard], section_definitions.missing_id);
    try std.testing.expectEqual(expected.section_definition_empty_id[shard], section_definitions.empty_id);
    try std.testing.expectEqual(expected.section_definition_missing_new_tabs[shard], section_definitions.missing_tab_stop_val);
    try std.testing.expectEqual(expected.section_definition_missing_new_tabs[shard], section_definitions.missing_tab_stop_unit);
    try std.testing.expectEqual(expected.section_definition_count[shard], section_definitions.direction_horizontal);
    try std.testing.expectEqual(expected.section_definition_unit_char[shard], section_definitions.unit_char);
    try std.testing.expectEqual(@as(usize, 0), section_definitions.vertical_width_true + section_definitions.foreign_children + section_definitions.other_attributes + section_definitions.unknown_enums);
    try std.testing.expectEqual(expected.section_definition_other_children[shard], section_definitions.other_paragraph_children);
    try std.testing.expectEqual(expected.section_definition_direct_children[shard], section_definitions.direct_children);
    try std.testing.expectEqualSlices(i64, &expected.section_definition_numeric_sums[shard], &section_definitions.numeric_sums);
    try std.testing.expectEqualSlices(usize, &expected.section_definition_child_counts[shard], &section_definitions.child_counts);
    try std.testing.expectEqual(expected.page_geometry_widely[shard], page_geometry.widely);
    try std.testing.expectEqual(expected.page_geometry_left_right[shard], page_geometry.left_right);
    try std.testing.expectEqual(expected.page_geometry_width_sum[shard], page_geometry.width_sum);
    try std.testing.expectEqual(expected.page_geometry_height_sum[shard], page_geometry.height_sum);
    try std.testing.expectEqualSlices(u64, &expected.page_geometry_margin_sum[shard], &page_geometry.margin_sum);
    try std.testing.expectEqual(expected.sections[shard], paragraph_children.sections);
    try std.testing.expectEqual(expected.paragraphs[shard], paragraph_children.paragraphs);
    try std.testing.expectEqual(expected.paragraph_direct_runs[shard], paragraph_children.direct_runs);
    try std.testing.expectEqual(expected.paragraph_line_seg_arrays[shard], paragraph_children.line_seg_arrays);
    try std.testing.expectEqual(expected.paragraph_without_runs[shard], paragraph_children.paragraphs_without_run);
    try std.testing.expectEqual(expected.paragraph_without_line_seg_array[shard], paragraph_children.paragraphs_without_line_seg_array);
    try std.testing.expectEqual(@as(usize, 0), paragraph_children.paragraphs_with_multiple_line_seg_arrays + paragraph_children.other_direct + paragraph_children.foreign_direct);
    try std.testing.expectEqual(expected.sections[shard], line_segments.sections);
    try std.testing.expectEqual(paragraph_children.line_seg_arrays, line_segments.arrays);
    try std.testing.expectEqual(expected.line_segment_count[shard], line_segments.segments);
    try std.testing.expectEqual(expected.line_segment_empty_arrays[shard], line_segments.empty_arrays);
    try std.testing.expectEqual(@as(usize, 0), line_segments.array_other_attributes + line_segments.array_other_direct + line_segments.array_foreign_direct + line_segments.segment_other_attributes + line_segments.segment_direct_children + line_segments.segment_foreign_direct);
    try std.testing.expectEqualSlices(i64, &expected.line_segment_field_sums[shard], &line_segments.field_sum);
    try std.testing.expectEqual(expected.line_segment_flags_highbit[shard], line_segments.field_highbit[8]);
    try std.testing.expectEqual(expected.line_segment_spacing_negative[shard], line_segments.field_negative[5]);
    try std.testing.expectEqual(expected.line_segment_horzpos_negative[shard], line_segments.field_negative[6]);
    try std.testing.expectEqual(expected.master_page_sub_lists[shard], master_line_segments.parts);
    try std.testing.expectEqual(expected.master_page_sub_lists[shard], master_line_segments.sub_lists);
    try std.testing.expectEqual(expected.master_line_paragraphs[shard], master_line_segments.paragraphs);
    try std.testing.expectEqual(expected.master_line_paragraphs[shard], master_line_segments.lines.arrays);
    try std.testing.expectEqual(expected.master_line_segments[shard], master_line_segments.lines.segments);
    try std.testing.expectEqual(@as(usize, 0), master_line_segments.lines.sections + master_line_segments.lines.empty_arrays + master_line_segments.lines.array_other_attributes + master_line_segments.lines.array_other_direct + master_line_segments.lines.array_foreign_direct + master_line_segments.lines.segment_other_attributes + master_line_segments.lines.segment_direct_children + master_line_segments.lines.segment_foreign_direct);
    try std.testing.expectEqualSlices(i64, &expected.master_line_field_sums[shard], &master_line_segments.lines.field_sum);
    try std.testing.expectEqual(expected.master_line_spacing_negative[shard], master_line_segments.lines.field_negative[5]);
    for (master_line_segments.lines.field_present, master_line_segments.lines.field_missing) |present, missing| {
        try std.testing.expectEqual(master_line_segments.lines.segments, present);
        try std.testing.expectEqual(@as(usize, 0), missing);
    }
    try std.testing.expectEqual(expected.master_page_sub_lists[shard], master_paragraph_children.parts);
    try std.testing.expectEqual(expected.master_page_sub_lists[shard], master_paragraph_children.sub_lists);
    try std.testing.expectEqual(@as(usize, 0), master_paragraph_children.children.sections);
    try std.testing.expectEqual(expected.master_line_paragraphs[shard], master_paragraph_children.children.paragraphs);
    try std.testing.expectEqual(expected.master_paragraph_direct_runs[shard], master_paragraph_children.children.direct_runs);
    try std.testing.expectEqual(expected.master_line_paragraphs[shard], master_paragraph_children.children.line_seg_arrays);
    try std.testing.expectEqual(@as(usize, 0), master_paragraph_children.children.paragraphs_without_run + master_paragraph_children.children.paragraphs_without_line_seg_array + master_paragraph_children.children.paragraphs_with_multiple_line_seg_arrays + master_paragraph_children.children.other_direct + master_paragraph_children.children.foreign_direct);
    try std.testing.expectEqual(expected.table_count[shard], table_geometry.tables);
    try std.testing.expectEqual(expected.master_table_parts[shard], master_table_geometry.parts);
    try std.testing.expectEqual(expected.master_table_sub_lists[shard], master_table_geometry.sub_lists);
    try std.testing.expectEqual(expected.master_table_xml_bytes[shard], master_table_geometry.xml_bytes);
    try std.testing.expectEqual(expected.master_table_elements[shard], master_table_geometry.elements);
    try std.testing.expectEqual(expected.master_table_count[shard], master_table_geometry.geometry.tables);
    try std.testing.expectEqual(expected.master_table_rows[shard], master_table_geometry.geometry.rows);
    try std.testing.expectEqual(expected.master_table_cells[shard], master_table_geometry.geometry.cells);
    try std.testing.expectEqual(expected.master_table_grid_slots[shard], master_table_geometry.geometry.grid_slots);
    try std.testing.expectEqual(expected.master_table_grid_slots[shard], master_table_geometry.geometry.cell_slots);
    try std.testing.expectEqual(@as(usize, 0), master_table_geometry.geometry.overlaps + master_table_geometry.geometry.uncovered_slots);
    try std.testing.expectEqual(expected.master_table_count[shard], master_table_geometry.geometry.table_attributes.border_fill_references.resolved);
    try std.testing.expectEqual(expected.master_table_cells[shard], master_table_geometry.geometry.cell_fields.border_fill_references.resolved);
    try std.testing.expectEqual(expected.master_table_labels[shard], master_table_geometry.geometry.table_shape.label.elements);
    try std.testing.expectEqual(expected.master_table_id_sum[shard], master_table_geometry.geometry.table_shape.table_fields[0].sum);
    try std.testing.expectEqual(expected.master_table_width_sum[shard], master_table_geometry.geometry.table_shape.size.fields[0].sum);
    try std.testing.expectEqual(expected.master_table_cell_width_sum[shard], master_table_geometry.geometry.cell_fields.size_sum[0]);
    try std.testing.expectEqual(expected.master_table_cell_paragraphs[shard], master_table_geometry.geometry.cell_sub_lists.direct_paragraphs);
    try std.testing.expectEqual(expected.master_table_inside_left_sum[shard], master_table_geometry.geometry.table_children.margin_sum[0]);
    try std.testing.expectEqual(expected.table_rows[shard], table_child_topology.rows);
    try std.testing.expectEqual(expected.table_cells[shard], table_child_topology.cells);
    try std.testing.expectEqual(expected.table_cells[shard] * 5, table_child_topology.cell_known_direct);
    try std.testing.expectEqual(expected.table_cells[shard], table_child_topology.cell_first_known_sub_list);
    try std.testing.expectEqual(expected.table_cell_last_known_address[shard], table_child_topology.cell_last_known_address);
    try std.testing.expectEqual(expected.table_cells[shard] - expected.table_cell_last_known_address[shard], table_child_topology.observed_common_sequence);
    try std.testing.expectEqual(expected.table_cell_last_known_address[shard], table_child_topology.observed_address_last_sequence);
    try std.testing.expectEqual(@as(usize, 0), table_child_topology.other_known_sequence);
    try std.testing.expectEqual(expected.table_rows[shard], table_geometry.rows);
    try std.testing.expectEqual(expected.table_cells[shard], table_geometry.cells);
    try std.testing.expectEqual(expected.table_grid_slots[shard], table_geometry.grid_slots);
    try std.testing.expectEqual(expected.table_cell_slots[shard], table_geometry.cell_slots);
    try std.testing.expectEqual(expected.table_count[shard], table_attributes.tables);
    try std.testing.expectEqual(@as(usize, 0), table_attributes.page_break.absent + table_attributes.page_break.unknown + table_attributes.repeat_header.absent + table_attributes.no_adjust.absent + table_attributes.cell_spacing_absent + table_attributes.border_fill_absent + table_attributes.border_fill_references.absent_table);
    try std.testing.expectEqual(expected.table_page_break_cell[shard], table_attributes.page_break.cell);
    try std.testing.expectEqual(expected.table_page_break_none[shard], table_attributes.page_break.none);
    try std.testing.expectEqual(expected.table_page_break_table[shard], table_attributes.page_break.table);
    try std.testing.expectEqual(expected.table_repeat_header_true[shard], table_attributes.repeat_header.true_value);
    try std.testing.expectEqual(expected.table_no_adjust_true[shard], table_attributes.no_adjust.true_value);
    try std.testing.expectEqual(expected.table_cell_spacing_zero[shard], table_attributes.cell_spacing_zero);
    try std.testing.expectEqual(expected.table_cell_spacing_sum[shard], table_attributes.cell_spacing_sum);
    try std.testing.expectEqual(expected.table_border_zero[shard], table_attributes.border_fill_zero);
    try std.testing.expectEqual(expected.table_border_sum[shard], table_attributes.border_fill_sum);
    try std.testing.expectEqual(expected.table_border_missing_target[shard], table_attributes.border_fill_references.missing_target);
    try std.testing.expectEqual(expected.table_count[shard] - expected.table_border_missing_target[shard], table_attributes.border_fill_references.resolved);
    try std.testing.expectEqual(expected.table_count[shard], table_children.tables);
    try std.testing.expectEqual(expected.table_count[shard], table_shape.tables);
    try std.testing.expectEqual(expected.table_shape_captions[shard], table_shape.captions);
    try std.testing.expectEqual(expected.table_shape_labels[shard], table_shape.labels);
    try std.testing.expectEqual(expected.table_shape_dropcap_present[shard], table_shape.dropcap_present);
    try std.testing.expectEqual(expected.table_shape_wrap_extensions[shard], table_shape.wrap_extensions);
    try std.testing.expectEqual(expected.table_shape_caption_paragraphs[shard], table_shape.caption_paragraphs);
    try std.testing.expectEqual(expected.table_shape_id_sum[shard], table_shape.id_sum);
    try std.testing.expectEqual(expected.table_shape_size_width_sum[shard], table_shape.size_width_sum);
    try std.testing.expectEqual(expected.table_shape_size_height_sum[shard], table_shape.size_height_sum);
    try std.testing.expectEqual(expected.table_shape_vert_offset_sum[shard], table_shape.vert_offset_sum);
    try std.testing.expectEqual(expected.table_shape_horz_offset_sum[shard], table_shape.horz_offset_sum);
    try std.testing.expectEqual(expected.table_shape_vert_offset_negative[shard], table_shape.vert_offset_negative);
    try std.testing.expectEqual(expected.table_shape_vert_offset_highbit[shard], table_shape.vert_offset_highbit);
    try std.testing.expectEqual(expected.table_shape_horz_offset_highbit[shard], table_shape.horz_offset_highbit);
    try std.testing.expectEqualSlices(i64, &expected.table_shape_outer_margin_sum[shard], &table_shape.outer_margin_sum);
    try std.testing.expectEqual(expected.table_shape_caption_width_sum[shard], table_shape.caption_width_sum);
    try std.testing.expectEqual(expected.table_shape_label_pagewidth_sum[shard], table_shape.label_pagewidth_sum);
    try std.testing.expectEqual(expected.table_shape_label_pageheight_sum[shard], table_shape.label_pageheight_sum);
    try std.testing.expectEqual(expected.table_count[shard], table_children.in_margins);
    try std.testing.expectEqual(expected.table_zone_lists[shard], table_children.zone_lists);
    try std.testing.expectEqual(expected.table_zones[shard], table_children.zones);
    try std.testing.expectEqual(expected.table_zone_border_sum[shard], table_children.border_sum);
    try std.testing.expectEqualSlices(i64, &expected.table_inside_margin_sum[shard], &table_children.margin_sum);
    try std.testing.expectEqualSlices(usize, &expected.table_inside_margin_zero[shard], &table_children.margin_zero);
    try std.testing.expectEqualSlices(u64, &expected.table_zone_coordinate_sum[shard], &table_children.coordinate_sum);
    try std.testing.expectEqual(expected.table_has_margin_true[shard], table_fields.has_margin.true_value);
    try std.testing.expectEqual(expected.table_cell_name_absent[shard], table_fields.name_absent);
    try std.testing.expectEqual(expected.table_cell_name_empty[shard], table_fields.name_empty);
    try std.testing.expectEqual(expected.table_cell_name_bytes[shard], table_fields.name_utf8_bytes);
    try std.testing.expectEqual(expected.table_cell_border_sum[shard], table_fields.border_fill_sum);
    try std.testing.expectEqual(expected.table_cells[shard], table_sub_lists.sub_lists);
    try std.testing.expectEqual(expected.table_cell_sublist_direct_paragraphs[shard], table_sub_lists.direct_paragraphs);
    try std.testing.expectEqual(expected.table_cell_sublist_id_absent[shard], table_sub_lists.sub_lists - table_sub_lists.field_present[@intFromEnum(para_list_attributes.Field.id)]);
    try std.testing.expectEqual(table_sub_lists.field_present[@intFromEnum(para_list_attributes.Field.id)], table_sub_lists.field_empty[@intFromEnum(para_list_attributes.Field.id)]);
    try std.testing.expectEqual(expected.table_cell_sublist_metatag_present[shard], table_sub_lists.field_present[@intFromEnum(para_list_attributes.Field.metatag)]);
    for (table_fields.flags, 0..) |flag, i| try std.testing.expectEqual(expected.table_cell_flag_true[shard][i], flag.true_value);
    try std.testing.expectEqual(expected.table_zero_height[shard], table_fields.zero_size_field[1]);
    try std.testing.expectEqualSlices(u64, &expected.table_size_sums[shard], &table_fields.size_sum);
    try std.testing.expectEqualSlices(i64, &expected.table_margin_sums[shard], &table_fields.margin_sum);
    try std.testing.expectEqualSlices(usize, &expected.table_margin_zero[shard], &table_fields.zero_margin_field);
    try std.testing.expectEqualSlices(usize, &expected.table_margin_negative[shard], &table_fields.negative_margin_field);
    try std.testing.expectEqualSlices(usize, &expected.table_margin_highbit[shard], &table_fields.highbit_margin_field);
    try std.testing.expectEqual(expected.paragraphs[shard], paragraphs);
    try std.testing.expectEqual(expected.begin_present[shard], begin_present);
    try std.testing.expectEqual(@as(usize, 0), missing_id);
    try std.testing.expectEqual(expected.manifest_xml_entries[shard], manifest_xml_entries);
    try std.testing.expectEqual(expected.manifest_xml_bytes[shard], manifest_xml_bytes);
    try std.testing.expectEqual(expected.manifest_xml_elements[shard], manifest_xml_elements);
    try std.testing.expectEqual(expected.manifest_xml_settings[shard], manifest_xml_settings);
    try std.testing.expectEqual(expected.manifest_xml_masterpages[shard], manifest_xml_masterpages);
    try std.testing.expectEqual(expected.settings_carets[shard], settings_carets);
    try std.testing.expectEqual(expected.settings_caret_pos_sum[shard], settings_caret_pos_sum);
    try std.testing.expectEqual(expected.settings_config_sets[shard], settings_config_sets);
    try std.testing.expectEqual(expected.settings_config_items[shard], settings_config_items);
    try std.testing.expectEqual(expected.settings_short_sum[shard], settings_short_sum);
    try std.testing.expectEqual(expected.settings_boolean_true[shard], settings_boolean_true);
    try std.testing.expectEqual(expected.settings_unsupported_types[shard], settings_unsupported_types);
    try std.testing.expectEqual(expected.master_page_refs[shard], master_page_refs);
    try std.testing.expectEqual(expected.master_page_sub_lists[shard], master_page_sub_lists);
    try std.testing.expectEqual(expected.master_sub_list_direct_paragraphs[shard], master_sub_list_direct_paragraphs);
    try std.testing.expectEqualSlices(usize, &expected.master_sub_list_attribute_presence[shard], &master_sub_list_attribute_presence);
    try std.testing.expectEqual(expected.master_sub_list_unknown_enums[shard], master_sub_list_unknown_enums);
    try std.testing.expectEqual(expected.master_sub_list_other_attributes[shard], master_sub_list_other_attributes);
    try std.testing.expectEqual(expected.master_sub_list_width_sum[shard], master_sub_list_width_sum);
    try std.testing.expectEqual(expected.master_sub_list_height_sum[shard], master_sub_list_height_sum);
    try std.testing.expectEqual(expected.master_paragraphs[shard], master_paragraphs);
    try std.testing.expectEqual(expected.master_paragraph_missing_id[shard], master_paragraph_missing_id);
    try std.testing.expectEqual(expected.master_paragraph_zero_id[shard], master_paragraph_zero_id);
    try std.testing.expectEqual(expected.master_paragraph_missing_tc_id[shard], master_paragraph_missing_tc_id);
    try std.testing.expectEqualSlices(usize, &expected.master_paragraph_boolean_present[shard], &master_paragraph_boolean_present);
    try std.testing.expectEqual(expected.master_paragraph_page_break_true[shard], master_paragraph_page_break_true);
    try std.testing.expectEqual(expected.master_paragraph_column_break_true[shard], master_paragraph_column_break_true);
    try std.testing.expectEqual(expected.master_paragraph_merged_true[shard], master_paragraph_merged_true);
    try std.testing.expectEqual(expected.master_style_paragraphs[shard], master_style.paragraphs);
    try std.testing.expectEqual(expected.master_style_non_direct_paragraphs[shard], master_style.non_direct_paragraphs);
    try std.testing.expectEqual(expected.master_style_runs[shard], master_style.runs);
    try std.testing.expectEqual(expected.master_style_non_direct_runs[shard], master_style.non_direct_runs);
    try std.testing.expectEqualSlices(usize, &expected.master_style_ref_present[shard], &master_style.present);
    try std.testing.expectEqualSlices(usize, &expected.master_style_ref_absent[shard], &master_style.absent);
    try std.testing.expectEqualSlices(usize, &expected.master_style_ref_resolved[shard], &master_style.resolved);
    try std.testing.expectEqualSlices(usize, &expected.master_style_ref_missing[shard], &master_style.missing);
    try std.testing.expectEqualSlices(usize, &expected.master_style_ref_absent_table[shard], &master_style.absent_table);
    try std.testing.expectEqualSlices(usize, &expected.section_run_metadata[shard], &section_run_metadata);
    try std.testing.expectEqualSlices(usize, &expected.master_run_metadata[shard], &master_run_metadata);
    try std.testing.expectEqual(expected.section_run_metadata[shard][0], section_run_topology.runs);
    try std.testing.expectEqual(expected.master_run_metadata[shard][0], master_run_topology.runs);
    try std.testing.expectEqual(expected.zero_run_topology[shard], section_run_topology.non_direct);
    try std.testing.expectEqual(expected.zero_run_topology[shard], master_run_topology.non_direct);
    try std.testing.expectEqual(expected.zero_run_topology[shard], section_run_topology.duplicates);
    try std.testing.expectEqual(expected.zero_run_topology[shard], master_run_topology.duplicates);
    try std.testing.expectEqual(expected.section_run_topology_sec_pr[shard], section_run_topology.sec_pr);
    try std.testing.expectEqual(expected.zero_run_topology[shard], master_run_topology.sec_pr);
    try std.testing.expectEqual(expected.section_run_topology_late_sec_pr[shard], section_run_topology.late);
    try std.testing.expectEqual(expected.zero_run_topology[shard], master_run_topology.late);
    try std.testing.expectEqualSlices(usize, &expected.section_run_topology_classes[shard], &section_run_topology.classes);
    try std.testing.expectEqualSlices(usize, &expected.master_run_topology_classes[shard], &master_run_topology.classes);
    try std.testing.expectEqualSlices(u64, &expected.section_switch_shape[shard], &section_run_topology.switches);
    try std.testing.expectEqualSlices(u64, &expected.master_switch_shape[shard], &master_run_topology.switches);
    try std.testing.expectEqualSlices(usize, &expected.switch_removed_case[shard], &switch_removed_case);
    try std.testing.expectEqualSlices(usize, &expected.switch_removed_default[shard], &switch_removed_default);
    try std.testing.expectEqualSlices(usize, &expected.section_text_nodes[shard], &section_text_nodes.counts);
    try std.testing.expectEqualSlices(usize, &expected.master_text_nodes[shard], &master_text_nodes.counts);
    try std.testing.expectEqualSlices(usize, &expected.master_text_content[shard], &master_text.counts);
    try std.testing.expectEqual(expected.master_text_digest_sum[shard], master_text.digest_sum);
    try std.testing.expectEqualSlices(usize, &expected.master_binary[shard], &master_binary.counts);
    try std.testing.expectEqualSlices(usize, &expected.section_text_child_classes[shard], &section_text_nodes.classes);
    try std.testing.expectEqualSlices(usize, &expected.master_text_child_classes[shard], &master_text_nodes.classes);
    try std.testing.expectEqualSlices(u64, &expected.section_tab_fields[shard], &section_text_nodes.tab);
    try std.testing.expectEqualSlices(u64, &expected.master_tab_fields[shard], &master_text_nodes.tab);
    try std.testing.expectEqualSlices(u64, &expected.section_markpen_fields[shard], &section_text_nodes.markpen);
    try std.testing.expectEqualSlices(u64, &expected.master_markpen_fields[shard], &master_text_nodes.markpen);
    try std.testing.expectEqualSlices(u64, &expected.section_title_mark_fields[shard], &section_text_nodes.title_mark);
    try std.testing.expectEqualSlices(u64, &expected.master_title_mark_fields[shard], &master_text_nodes.title_mark);
    try std.testing.expectEqualSlices(u64, &expected.section_track_change_tag_fields[shard], &section_text_nodes.track_change_tags);
    try std.testing.expectEqualSlices(u64, &expected.master_track_change_tag_fields[shard], &master_text_nodes.track_change_tags);
    try std.testing.expectEqual(expected.master_page_number_sum[shard], master_page_number_sum);
    try std.testing.expectEqual(expected.master_page_count_declarations[shard], master_page_count_declarations);
    try std.testing.expectEqualSlices(usize, &expected.master_page_type_counts[shard], &master_page_type_counts);
}

test "HWPX known document inspections shard 0" {
    try surveyShard(0);
}
test "HWPX known document inspections shard 1" {
    try surveyShard(1);
}
test "HWPX known document inspections shard 2" {
    try surveyShard(2);
}
test "HWPX known document inspections shard 3" {
    try surveyShard(3);
}
test "HWPX known document inspections shard 4" {
    try surveyShard(4);
}
test "HWPX known document inspections shard 5" {
    try surveyShard(5);
}
test "HWPX known document inspections shard 6" {
    try surveyShard(6);
}
test "HWPX known document inspections shard 7" {
    try surveyShard(7);
}

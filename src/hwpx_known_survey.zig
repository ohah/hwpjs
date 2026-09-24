const std = @import("std");
const package = @import("hwpx/package.zig");
const expected = @import("hwpx_corpus_expectations.zig");
const para_list_attributes = @import("hwpx/para_list_attributes.zig");

const sub_list_field_count = para_list_attributes.field_names.len;

fn runMetadataCounts(report: package.RunMetadataReport) [7]usize {
    return .{ report.runs, report.missing_char_tc_id, report.zero_char_tc_id, report.para_tc_alias_present, report.para_tc_alias_only, report.equal_dual_ids, report.conflicting_dual_ids };
}

fn addRunCounts(total: *[7]usize, values: [7]usize) void {
    for (values, 0..) |value, index| total[index] += value;
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
    paragraphs: usize,
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
    master_page_number_sum: u64,
    master_page_count_declarations: usize,
    master_page_type_counts: [5]usize,
    switch_removed_case: [5]usize,
    switch_removed_default: [5]usize,
};

const Outcome = union(enum) {
    rejected_zip,
    encrypted,
    accepted: Statistics,
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
    try std.testing.expectEqual(master_sub_lists, known.master_page_text_nodes.sub_lists);
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
    try std.testing.expectEqual(known.section_text.paragraphs, known.paragraph_metadata.paragraphs);
    try std.testing.expectEqual(known.section_references.runs, known.run_metadata.runs);
    try std.testing.expectEqual(known.run_metadata.runs, known.run_topology.runs);
    try std.testing.expectEqual(known.section_text.non_direct_runs, known.run_topology.non_direct_runs);
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
    return .{ .accepted = .{
        .sections = count,
        .paragraphs = known.paragraph_metadata.paragraphs,
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
        .master_page_number_sum = master_page_number_sum,
        .master_page_count_declarations = known.master_pages.count_declarations.len,
        .master_page_type_counts = master_type_counts,
        .switch_removed_case = switch_removed_case,
        .switch_removed_default = switch_removed_default,
    } };
}

fn surveyShard(shard: usize) !void {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var paragraphs: usize = 0;
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
    var master_page_number_sum: u64 = 0;
    var master_page_count_declarations: usize = 0;
    var master_page_type_counts: [5]usize = @splat(0);
    var switch_removed_case: [5]usize = @splat(0);
    var switch_removed_default: [5]usize = @splat(0);
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
                    paragraphs += stats.paragraphs;
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
                    master_page_number_sum += stats.master_page_number_sum;
                    master_page_count_declarations += stats.master_page_count_declarations;
                    for (stats.master_page_type_counts, 0..) |value, i| master_page_type_counts[i] += value;
                    for (stats.switch_removed_case, 0..) |value, i| switch_removed_case[i] += value;
                    for (stats.switch_removed_default, 0..) |value, i| switch_removed_default[i] += value;
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

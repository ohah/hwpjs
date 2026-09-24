const std = @import("std");
const package = @import("hwpx/package.zig");
const expected = @import("hwpx_corpus_expectations.zig");

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
    master_page_number_sum: u64,
    master_page_count_declarations: usize,
    master_page_type_counts: [5]usize,
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
    var master_sub_lists: usize = 0;
    var master_page_number_sum: u64 = 0;
    var master_type_counts: [5]usize = @splat(0);
    for (known.master_pages.parts.parts) |part| {
        master_sub_lists += part.sub_lists;
        if (part.page_number) |raw| master_page_number_sum += try std.fmt.parseInt(u32, raw, 10);
        if (part.kind) |kind| master_type_counts[@intFromEnum(kind)] += 1;
    }
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
    try std.testing.expectEqual(known.section_text.paragraphs, known.paragraph_metadata.paragraphs);
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
        .master_page_number_sum = master_page_number_sum,
        .master_page_count_declarations = known.master_pages.count_declarations.len,
        .master_page_type_counts = master_type_counts,
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
    var master_page_number_sum: u64 = 0;
    var master_page_count_declarations: usize = 0;
    var master_page_type_counts: [5]usize = @splat(0);
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
                    master_page_number_sum += stats.master_page_number_sum;
                    master_page_count_declarations += stats.master_page_count_declarations;
                    for (stats.master_page_type_counts, 0..) |value, i| master_page_type_counts[i] += value;
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

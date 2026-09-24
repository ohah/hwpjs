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

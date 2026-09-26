const std = @import("std");
const package = @import("hwpx/package.zig");
const notes = @import("hwpx/note_bodies.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");
const Sha256 = std.crypto.hash.sha2.Sha256;

fn count(hash: *Sha256, n: usize) void {
    var bytes: [8]u8 = undefined;
    std.mem.writeInt(u64, &bytes, @intCast(n), .little);
    hash.update(&bytes);
}
fn value(hash: *Sha256, bytes: []const u8) void {
    count(hash, bytes.len);
    hash.update(bytes);
}
fn optional(hash: *Sha256, bytes: ?[]const u8) void {
    if (bytes) |raw| {
        hash.update(&.{1});
        value(hash, raw);
    } else hash.update(&.{0});
}
fn digest(report: *const notes.Report) u256 {
    var hash = Sha256.init(.{});
    count(&hash, report.sections);
    count(&hash, report.notes.len);
    count(&hash, report.sub_lists.len);
    count(&hash, report.paragraphs.len);
    for (report.notes) |note| {
        count(&hash, note.section_ordinal);
        count(&hash, note.parent_element_index);
        count(&hash, note.element_index);
        count(&hash, @intFromEnum(note.kind));
        value(&hash, note.parent_uri);
        value(&hash, note.parent_local_name);
        for (note.attributes.raw) |raw| optional(&hash, raw);
        count(&hash, note.attributes.other_attributes);
        count(&hash, note.direct_children);
        count(&hash, note.other_direct_children);
        count(&hash, note.sub_list_count);
        for (report.sub_lists[note.first_sub_list..][0..note.sub_list_count]) |list| {
            count(&hash, list.element_index);
            for (list.attributes.raw) |raw| optional(&hash, raw);
            count(&hash, list.attributes.unknown_enums);
            count(&hash, list.attributes.other_attributes);
            count(&hash, list.direct_paragraphs);
            count(&hash, list.other_direct_children);
            for (report.paragraphs[list.first_paragraph..][0..list.direct_paragraphs]) |paragraph| count(&hash, paragraph.element_index);
        }
    }
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

test "HWPX note bodies real files known integration" {
    const a = std.testing.allocator;
    for ([_]struct { root: usize, path: []const u8 }{
        .{ .root = 0, .path = "footnote-endnote.hwpx" },
        .{ .root = 1, .path = "task1725/text_footnote_tail_overpagination.hwpx" },
    }) |case| {
        const path = try std.fmt.allocPrint(a, "{s}/{s}", .{ common.roots[case.root], case.path });
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(25_000_000));
        defer a.free(bytes);
        var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
        defer _ = checked.deinit();
        defer if (checked.total_requested_bytes != 0) @panic("note bodies known inspection leaked allocations");
        const alloc = checked.allocator();
        var document = try package.inspectDocument(alloc, bytes, .{});
        defer document.deinit(alloc);
        var standalone = try document.inspectNoteBodies(alloc, .{});
        defer standalone.deinit();
        var known = try document.inspectKnown(alloc, .{});
        defer known.deinit(alloc);
        try std.testing.expectEqual(digest(&standalone), digest(&known.note_bodies));
        if (case.root == 0) {
            try std.testing.expectEqual(@as(usize, 2), standalone.foot_notes);
            try std.testing.expectEqual(@as(usize, 2), standalone.end_notes);
        }
    }
}

test "HWPX note bodies corpus per-file independent XML digest" {
    const a = std.testing.allocator;
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    for (common.roots, 0..) |root, root_index| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
            checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
            defer _ = checked.deinit();
            defer if (checked.total_requested_bytes != 0) @panic("note bodies corpus leaked allocations");
            const alloc = checked.allocator();
            var document = package.inspectDocument(alloc, bytes, .{}) catch |err| {
                if (err != error.MissingEndRecord) return err;
                rejected_zip += 1;
                std.debug.print("NOTE_CORPUS_REJECTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                continue;
            };
            defer document.deinit(alloc);
            var trees = document.readXmlTrees(alloc, .{}) catch |err| {
                if (err != error.EncryptedDocument) return err;
                encrypted += 1;
                std.debug.print("NOTE_CORPUS_ENCRYPTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                continue;
            };
            defer trees.deinit(alloc);
            var report = try trees.inspectNoteBodies(alloc, .{});
            defer report.deinit();
            for (report.notes) |note| {
                try std.testing.expectEqualSlices(u8, trees.sections[note.section_ordinal].sourceOf(note.element_index), note.raw_xml);
            }
            for (report.sub_lists) |list| {
                try std.testing.expectEqualSlices(u8, trees.sections[list.section_ordinal].sourceOf(list.element_index), list.raw_xml);
            }
            for (report.paragraphs) |paragraph| {
                try std.testing.expectEqualSlices(u8, trees.sections[paragraph.section_ordinal].sourceOf(paragraph.element_index), paragraph.raw_xml);
            }
            accepted += 1;
            std.debug.print("NOTE_CORPUS_FILE {d} {x:0>64} {x:0>64} {d} {d} {d} {d} {d} {d} {d}\n", .{
                root_index,           common.pathDigest(entry.path), digest(&report),          report.foot_notes,          report.end_notes,
                report.sub_lists.len, report.paragraphs.len,         report.missing_sub_lists, report.duplicate_sub_lists, report.other_attributes,
            });
        }
    }
    std.debug.print("NOTE_CORPUS_TOTAL {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

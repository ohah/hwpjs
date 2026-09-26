const std = @import("std");
const package = @import("hwpx/package.zig");
const notes_mod = @import("hwpx/note_bodies.zig");
const text_mod = @import("hwpx/note_text.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");
const Sha256 = std.crypto.hash.sha2.Sha256;

fn count(hash: *Sha256, n: usize) void {
    var bytes: [8]u8 = undefined;
    std.mem.writeInt(u64, &bytes, @intCast(n), .little);
    hash.update(&bytes);
}
fn optionalIndex(hash: *Sha256, n: ?usize) void {
    if (n) |value| {
        hash.update(&.{1});
        count(hash, value);
    } else hash.update(&.{0});
}
fn digest(notes: *const notes_mod.Report, report: *const text_mod.Report) !u256 {
    if (notes.notes.len != report.notes.len or notes.sections != report.sections) return error.InconsistentNoteTextReport;
    var hash = Sha256.init(.{});
    count(&hash, report.sections);
    count(&hash, notes.notes.len);
    count(&hash, report.text_elements.len);
    count(&hash, report.owned_bytes);
    count(&hash, report.notes_without_text_elements);
    var counted_text: usize = 0;
    var counted_bytes: usize = 0;
    for (notes.notes, report.notes, 0..) |note, summary, note_index| {
        count(&hash, @intFromEnum(note.kind));
        count(&hash, note.section_ordinal);
        count(&hash, note.element_index);
        count(&hash, summary.text_elements);
        count(&hash, summary.utf8_bytes);
        var text_index = summary.first_text;
        var seen: usize = 0;
        while (text_index) |index| {
            if (index >= report.text_elements.len or seen >= summary.text_elements) return error.InconsistentNoteTextReport;
            const item = report.text_elements[index];
            if (item.note_index != note_index) return error.InconsistentNoteTextReport;
            count(&hash, item.element_index);
            optionalIndex(&hash, item.paragraph_element_index);
            count(&hash, item.utf8_bytes);
            var text_hash = Sha256.init(.{});
            var chunk_index = item.first_chunk;
            var chunk_seen: usize = 0;
            var text_bytes: usize = 0;
            while (chunk_index) |chunk| {
                if (chunk >= report.chunks.len or chunk_seen >= item.chunks) return error.InconsistentNoteTextReport;
                const value = report.chunks[chunk];
                if (value.text_index != index) return error.InconsistentNoteTextReport;
                text_hash.update(value.bytes);
                text_bytes += value.bytes.len;
                chunk_seen += 1;
                chunk_index = value.next_for_text;
            }
            if (chunk_seen != item.chunks or text_bytes != item.utf8_bytes) return error.InconsistentNoteTextReport;
            var output: [32]u8 = undefined;
            text_hash.final(&output);
            hash.update(&output);
            counted_bytes += text_bytes;
            counted_text += 1;
            seen += 1;
            text_index = item.next_for_note;
        }
        if (seen != summary.text_elements) return error.InconsistentNoteTextReport;
    }
    if (counted_text != report.text_elements.len or counted_bytes != report.owned_bytes) return error.InconsistentNoteTextReport;
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

test "HWPX note text real files standalone and known integration" {
    const a = std.testing.allocator;
    for ([_]struct { root: usize, path: []const u8 }{
        .{ .root = 0, .path = "footnote-endnote.hwpx" },
        .{ .root = 1, .path = "task1725/text_footnote_tail_overpagination.hwpx" },
    }) |case| {
        const path = try std.fmt.allocPrint(a, "{s}/{s}", .{ common.roots[case.root], case.path });
        defer a.free(path);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(25_000_000));
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        var trees = try document.readXmlTrees(a, .{});
        defer trees.deinit(a);
        var notes = try trees.inspectNoteBodies(a, .{});
        defer notes.deinit();
        var direct = try trees.inspectNoteText(a, &notes, .{});
        defer direct.deinit();
        var standalone = try document.inspectNoteText(a, .{});
        defer standalone.deinit();
        var known = try document.inspectKnown(a, .{});
        defer known.deinit(a);
        const expected = try digest(&notes, &direct);
        try std.testing.expectEqual(expected, try digest(&notes, &standalone));
        try std.testing.expectEqual(expected, try digest(&known.note_bodies, &known.note_text));
        if (case.root == 0) {
            try std.testing.expectEqual(@as(usize, 4), notes.notes.len);
            try std.testing.expect(direct.owned_bytes > 0);
        }
    }
}

test "HWPX note text corpus per-file independent XML digest" {
    const a = std.testing.allocator;
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var total_notes: usize = 0;
    var total_text: usize = 0;
    var total_bytes: usize = 0;
    var notes_without: usize = 0;
    for (common.roots, 0..) |root, root_index| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                if (err != error.MissingEndRecord) return err;
                rejected_zip += 1;
                std.debug.print("NOTE_TEXT_REJECTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                continue;
            };
            defer document.deinit(a);
            var trees = document.readXmlTrees(a, .{}) catch |err| {
                if (err != error.EncryptedDocument) return err;
                encrypted += 1;
                std.debug.print("NOTE_TEXT_ENCRYPTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                continue;
            };
            defer trees.deinit(a);
            var notes = try trees.inspectNoteBodies(a, .{});
            defer notes.deinit();
            var report = try trees.inspectNoteText(a, &notes, .{});
            defer report.deinit();
            accepted += 1;
            total_notes += notes.notes.len;
            total_text += report.text_elements.len;
            total_bytes += report.owned_bytes;
            notes_without += report.notes_without_text_elements;
            std.debug.print("NOTE_TEXT_FILE {d} {x:0>64} {x:0>64} {d} {d} {d} {d}\n", .{ root_index, common.pathDigest(entry.path), try digest(&notes, &report), notes.notes.len, report.text_elements.len, report.owned_bytes, report.notes_without_text_elements });
        }
    }
    std.debug.print("NOTE_TEXT_TOTAL {d} {d} {d} {d} {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted, total_notes, total_text, total_bytes, notes_without });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
    try std.testing.expectEqual(@as(usize, 1219), total_notes);
}

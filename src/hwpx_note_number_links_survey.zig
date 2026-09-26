const std = @import("std");
const package = @import("hwpx/package.zig");
const notes_mod = @import("hwpx/note_bodies.zig");
const numbers_mod = @import("hwpx/number_controls.zig");
const links_mod = @import("hwpx/note_number_links.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");
const Sha256 = std.crypto.hash.sha2.Sha256;

fn count(hash: *Sha256, n: usize) void {
    var bytes: [8]u8 = undefined;
    std.mem.writeInt(u64, &bytes, @intCast(n), .little);
    hash.update(&bytes);
}
fn number(hash: *Sha256, n: ?i32) void {
    if (n) |value| {
        hash.update(&.{1});
        var bytes: [4]u8 = undefined;
        std.mem.writeInt(i32, &bytes, value, .little);
        hash.update(&bytes);
    } else hash.update(&.{0});
}
fn digest(notes: *const notes_mod.Report, numbers: *const numbers_mod.Report, links: *const links_mod.Report) u256 {
    var hash = Sha256.init(.{});
    count(&hash, notes.sections);
    count(&hash, notes.notes.len);
    count(&hash, numbers.controls.len);
    count(&hash, links.links.len);
    count(&hash, links.controls_outside_notes);
    count(&hash, links.notes_without_auto_num);
    for (notes.notes, links.notes) |note, summary| {
        count(&hash, @intFromEnum(note.kind));
        count(&hash, note.section_ordinal);
        count(&hash, note.element_index);
        count(&hash, summary.links);
        count(&hash, summary.inside_direct_sub_list);
        count(&hash, summary.matching_type);
        count(&hash, summary.mismatched_type);
        count(&hash, summary.missing_type);
    }
    for (links.links) |link| {
        count(&hash, link.note_index);
        count(&hash, link.control_index);
        count(&hash, link.section_ordinal);
        count(&hash, link.element_index);
        count(&hash, @intFromBool(link.inside_direct_sub_list));
        hash.update(&.{if (link.type_matches_note) |matches| @as(u8, if (matches) 2 else 1) else 0});
        number(&hash, link.num);
    }
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

test "HWPX note number links real files standalone and known integration" {
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
        var numbers = try trees.inspectNumberControls(a, .{});
        defer numbers.deinit();
        var direct = try trees.inspectNoteNumberLinks(a, &notes, &numbers, .{});
        defer direct.deinit();
        var standalone = try document.inspectNoteNumberLinks(a, .{});
        defer standalone.deinit();
        var known = try document.inspectKnown(a, .{});
        defer known.deinit(a);
        const expected = digest(&notes, &numbers, &direct);
        try std.testing.expectEqual(expected, digest(&notes, &numbers, &standalone));
        try std.testing.expectEqual(expected, digest(&known.note_bodies, &known.number_controls, &known.note_number_links));
        if (case.root == 0) {
            try std.testing.expectEqual(@as(usize, 4), direct.links.len);
            for (direct.links) |link| {
                try std.testing.expect(link.inside_direct_sub_list);
                try std.testing.expectEqual(@as(?bool, true), link.type_matches_note);
            }
        }
    }
}

test "HWPX note number links corpus per-file independent XML digest" {
    const a = std.testing.allocator;
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var total_links: usize = 0;
    var mismatched: usize = 0;
    var outside_lists: usize = 0;
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
                std.debug.print("NOTE_LINK_REJECTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                continue;
            };
            defer document.deinit(a);
            var trees = document.readXmlTrees(a, .{}) catch |err| {
                if (err != error.EncryptedDocument) return err;
                encrypted += 1;
                std.debug.print("NOTE_LINK_ENCRYPTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                continue;
            };
            defer trees.deinit(a);
            var notes = try trees.inspectNoteBodies(a, .{});
            defer notes.deinit();
            var numbers = try trees.inspectNumberControls(a, .{});
            defer numbers.deinit();
            var links = try trees.inspectNoteNumberLinks(a, &notes, &numbers, .{});
            defer links.deinit();
            accepted += 1;
            total_links += links.links.len;
            notes_without += links.notes_without_auto_num;
            for (links.links) |link| {
                mismatched += @intFromBool(link.type_matches_note == false);
                outside_lists += @intFromBool(!link.inside_direct_sub_list);
            }
            std.debug.print("NOTE_LINK_FILE {d} {x:0>64} {x:0>64} {d} {d} {d}\n", .{ root_index, common.pathDigest(entry.path), digest(&notes, &numbers, &links), links.links.len, links.controls_outside_notes, links.notes_without_auto_num });
        }
    }
    std.debug.print("NOTE_LINK_TOTAL {d} {d} {d} {d} {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted, total_links, mismatched, outside_lists, notes_without });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
    try std.testing.expectEqual(@as(usize, 1216), total_links);
    try std.testing.expectEqual(@as(usize, 0), mismatched);
    try std.testing.expectEqual(@as(usize, 0), outside_lists);
    try std.testing.expectEqual(@as(usize, 8), notes_without);
}

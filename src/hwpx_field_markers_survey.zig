const std = @import("std");
const package = @import("hwpx/package.zig");
const markers = @import("hwpx/field_markers.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");

const Sha256 = std.crypto.hash.sha2.Sha256;

fn number(hash: *Sha256, count: usize) void {
    var bytes: [8]u8 = undefined;
    std.mem.writeInt(u64, &bytes, @intCast(count), .little);
    hash.update(&bytes);
}

fn value(hash: *Sha256, bytes: []const u8) void {
    number(hash, bytes.len);
    hash.update(bytes);
}

fn optional(hash: *Sha256, bytes: ?[]const u8) void {
    if (bytes) |present| {
        hash.update(&.{1});
        value(hash, present);
    } else hash.update(&.{0});
}

fn digest(report: *const markers.Report) u256 {
    var hash = Sha256.init(.{});
    number(&hash, report.sections);
    number(&hash, report.markers.len);
    for (report.markers) |marker| {
        number(&hash, marker.section_ordinal);
        number(&hash, marker.parent_element_index);
        number(&hash, marker.element_index);
        number(&hash, @intFromEnum(marker.kind));
        value(&hash, marker.parent_uri);
        value(&hash, marker.parent_local_name);
        if (marker.begin) |begin| {
            optional(&hash, begin.id_raw);
            optional(&hash, begin.type_raw);
            optional(&hash, begin.name);
            optional(&hash, begin.editable_raw);
            optional(&hash, begin.dirty_raw);
            optional(&hash, begin.zorder_raw);
            optional(&hash, begin.fieldid_raw);
            number(&hash, begin.other_attributes);
        } else if (marker.end) |end| {
            optional(&hash, end.begin_id_ref_raw);
            optional(&hash, end.fieldid_raw);
            number(&hash, end.other_attributes);
        }
        number(&hash, marker.direct_children);
        number(&hash, marker.parameters_children);
        number(&hash, marker.sub_list_children);
        number(&hash, marker.meta_tag_children);
        number(&hash, marker.unexpected_children);
        number(&hash, marker.matched_marker_index orelse std.math.maxInt(usize));
        number(&hash, @intFromBool(marker.duplicate_begin_id));
        number(&hash, @intFromEnum(marker.link_issue));
        number(&hash, @intFromBool(marker.fieldid_mismatch));
        number(&hash, @intFromBool(marker.non_lifo));
    }
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

const Inspected = union(enum) {
    rejected_zip,
    encrypted,
    accepted: struct { hash: u256, begins: usize, ends: usize, unmatched: usize, unresolved: usize, other_attributes: usize },
};

fn inspectOne(a: std.mem.Allocator, bytes: []const u8) !Inspected {
    var document = package.inspectDocument(a, bytes, .{}) catch |err| {
        if (err == error.MissingEndRecord) return .rejected_zip;
        return err;
    };
    defer document.deinit(a);
    var report = document.inspectFieldMarkers(a, .{}) catch |err| {
        if (err == error.EncryptedDocument) return .encrypted;
        return err;
    };
    defer report.deinit();
    return .{ .accepted = .{
        .hash = digest(&report),
        .begins = report.begins,
        .ends = report.ends,
        .unmatched = report.unmatched_begins,
        .unresolved = report.unresolved_ends,
        .other_attributes = report.other_attributes,
    } };
}

test "HWPX field markers real files known integration" {
    const a = std.testing.allocator;
    for ([_]struct { path: []const u8, unmatched: usize }{
        .{ .path = "issue1891/80168_regulatory_analysis.hwpx", .unmatched = 1 },
        .{ .path = "issue1891/86712_regulatory_analysis.hwpx", .unmatched = 4 },
        .{ .path = "issue5729/stacked_tac_band_om_top.hwpx", .unmatched = 1 },
    }) |case| {
        const name = try std.fmt.allocPrint(a, "reference/rhwp/samples/{s}", .{case.path});
        defer a.free(name);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, name, a, .limited(25_000_000));
        defer a.free(bytes);
        var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
        defer _ = checked.deinit();
        defer if (checked.total_requested_bytes != 0) @panic("field marker known inspection leaked allocations");
        const alloc = checked.allocator();
        var document = try package.inspectDocument(alloc, bytes, .{});
        var standalone = try document.inspectFieldMarkers(alloc, .{});
        var known = try document.inspectKnown(alloc, .{});
        try std.testing.expectEqual(digest(&standalone), digest(&known.field_markers));
        try std.testing.expectEqual(case.unmatched, standalone.unmatched_begins);
        try std.testing.expectEqual(@as(usize, 0), standalone.unresolved_ends);
        known.deinit(alloc);
        standalone.deinit();
        document.deinit(alloc);
    }
}

test "HWPX field markers corpus per-file independent XML digest" {
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
            defer if (checked.total_requested_bytes != 0) @panic("field marker corpus leaked allocations");
            const outcome = inspectOne(checked.allocator(), bytes) catch |err| {
                std.debug.print("FIELD_CORPUS_ERROR root={d} path={s} error={s}\n", .{ root_index, entry.path, @errorName(err) });
                return err;
            };
            const path_hash = common.pathDigest(entry.path);
            switch (outcome) {
                .rejected_zip => {
                    rejected_zip += 1;
                    std.debug.print("FIELD_CORPUS_REJECTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .encrypted => {
                    encrypted += 1;
                    std.debug.print("FIELD_CORPUS_ENCRYPTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .accepted => |row| {
                    accepted += 1;
                    std.debug.print("FIELD_CORPUS_FILE {d} {x:0>64} {x:0>64} {d} {d} {d} {d} {d}\n", .{
                        root_index, path_hash, row.hash, row.begins, row.ends, row.unmatched, row.unresolved, row.other_attributes,
                    });
                },
            }
        }
    }
    std.debug.print("FIELD_CORPUS_TOTAL {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

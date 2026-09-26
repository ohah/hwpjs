const std = @import("std");
const package = @import("hwpx/package.zig");
const meta_tags = @import("hwpx/meta_tags.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");

const cases = [_][]const u8{
    "issue6145/worklife_balance_index_156607916.hwpx",
    "issue6451/underline_run_fragments.hwpx",
    "task2311/156744475_nano_plan_poster.hwpx",
    "issue6299/forest_press_wrap_seg_pairs.hwpx",
};

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

fn digest(report: *const meta_tags.Report) u256 {
    var hash = Sha256.init(.{});
    number(&hash, report.sections);
    number(&hash, report.tags.len);
    for (report.tags) |tag| {
        number(&hash, tag.section_ordinal);
        number(&hash, tag.parent_element_index);
        number(&hash, tag.element_index);
        value(&hash, tag.parent_uri);
        value(&hash, tag.parent_local_name);
        value(&hash, tag.value);
        number(&hash, tag.direct_children);
        number(&hash, tag.other_attributes);
    }
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

test "HWPX meta tags four real files known integration" {
    const a = std.testing.allocator;
    for (cases) |relative| {
        const file_name = try std.fmt.allocPrint(a, "reference/rhwp/samples/{s}", .{relative});
        defer a.free(file_name);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, file_name, a, .limited(25_000_000));
        defer a.free(bytes);
        var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
        defer _ = checked.deinit();
        defer if (checked.total_requested_bytes != 0) @panic("meta tag known inspection leaked allocations");
        const alloc = checked.allocator();
        var document = try package.inspectDocument(alloc, bytes, .{});
        var standalone = try document.inspectMetaTags(alloc, .{});
        var known = try document.inspectKnown(alloc, .{});
        try std.testing.expectEqual(digest(&standalone), digest(&known.meta_tags));
        try std.testing.expectEqual(@as(usize, 1), known.meta_tags.tags.len);
        try std.testing.expectEqual(@as(usize, 18), known.meta_tags.value_bytes);
        known.deinit(alloc);
        standalone.deinit();
        document.deinit(alloc);
    }
}

const Inspected = union(enum) {
    rejected_zip,
    encrypted,
    accepted: struct { hash: u256, tags: usize, value_bytes: usize, direct_children: usize, other_attributes: usize },
};

fn inspectOne(a: std.mem.Allocator, bytes: []const u8) !Inspected {
    var document = package.inspectDocument(a, bytes, .{}) catch |err| {
        if (err == error.MissingEndRecord) return .rejected_zip;
        return err;
    };
    defer document.deinit(a);
    var report = document.inspectMetaTags(a, .{}) catch |err| {
        if (err == error.EncryptedDocument) return .encrypted;
        return err;
    };
    defer report.deinit();
    return .{ .accepted = .{
        .hash = digest(&report),
        .tags = report.tags.len,
        .value_bytes = report.value_bytes,
        .direct_children = report.direct_children,
        .other_attributes = report.other_attributes,
    } };
}

test "HWPX meta tags corpus per-file independent XML digest" {
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
            defer if (checked.total_requested_bytes != 0) @panic("meta tag corpus inspection leaked allocations");
            const outcome = inspectOne(checked.allocator(), bytes) catch |err| {
                std.debug.print("META_CORPUS_ERROR root={d} path={s} error={s}\n", .{ root_index, entry.path, @errorName(err) });
                return err;
            };
            const path_hash = common.pathDigest(entry.path);
            switch (outcome) {
                .rejected_zip => {
                    rejected_zip += 1;
                    std.debug.print("META_CORPUS_REJECTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .encrypted => {
                    encrypted += 1;
                    std.debug.print("META_CORPUS_ENCRYPTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .accepted => |row| {
                    accepted += 1;
                    std.debug.print("META_CORPUS_FILE {d} {x:0>64} {x:0>64} {d} {d} {d} {d}\n", .{
                        root_index,          path_hash,            row.hash, row.tags, row.value_bytes,
                        row.direct_children, row.other_attributes,
                    });
                },
            }
        }
    }
    std.debug.print("META_CORPUS_TOTAL {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

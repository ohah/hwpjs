const std = @import("std");
const package = @import("hwpx/package.zig");
const parameters = @import("hwpx/parameter_lists.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");

const cases = [_][]const u8{
    "issue3637/press_release_topbottom_float.hwpx",
    "issue5731/cell_second_float_flow_anchor.hwpx",
    "issue2373/156689818_kftc_press.hwpx",
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

fn optional(hash: *Sha256, bytes: ?[]const u8) void {
    if (bytes) |present| {
        hash.update(&.{1});
        value(hash, present);
    } else hash.update(&.{0});
}

fn digest(report: *const parameters.Report) u256 {
    var hash = Sha256.init(.{});
    number(&hash, report.sections);
    number(&hash, report.roots.len);
    for (report.roots) |root| {
        number(&hash, root.section_ordinal);
        number(&hash, root.parent_element_index);
        number(&hash, root.element_index);
        number(&hash, @intFromEnum(root.owner));
        value(&hash, root.parent_uri);
        value(&hash, root.parent_local_name);
        number(&hash, root.node_count);
        for (report.nodes[root.first_node..][0..root.node_count]) |node| {
            number(&hash, node.element_index);
            number(&hash, if (node.parent_node_index) |parent| parent - root.first_node + 1 else 0);
            number(&hash, node.depth);
            number(&hash, @intFromEnum(node.kind));
            optional(&hash, node.name);
            optional(&hash, node.cnt);
            optional(&hash, node.value);
            number(&hash, node.direct_children);
            number(&hash, node.unknown_children);
            number(&hash, @intFromBool(node.count_mismatch));
        }
    }
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

test "HWPX parameter lists three real files independent XML digest" {
    const a = std.testing.allocator;
    for (cases) |relative| {
        const file_name = try std.fmt.allocPrint(a, "reference/rhwp/samples/{s}", .{relative});
        defer a.free(file_name);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, file_name, a, .limited(25_000_000));
        defer a.free(bytes);
        var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
        defer _ = checked.deinit();
        defer if (checked.total_requested_bytes != 0) @panic("parameter list survey leaked allocations");
        const alloc = checked.allocator();
        var document = try package.inspectDocument(alloc, bytes, .{});
        var report = try document.inspectParameterLists(alloc, .{});
        const hash = digest(&report);
        std.debug.print("PARAM_FILE {s} {x:0>64} {d} {d} {d} {d} {d}\n", .{
            relative,                hash,                    report.roots.len, report.nodes.len, report.value_bytes,
            report.unknown_children, report.count_mismatches,
        });
        report.deinit();
        document.deinit(alloc);
    }
}

test "HWPX parameter lists three real files known integration" {
    const a = std.testing.allocator;
    for (cases) |relative| {
        const file_name = try std.fmt.allocPrint(a, "reference/rhwp/samples/{s}", .{relative});
        defer a.free(file_name);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, file_name, a, .limited(25_000_000));
        defer a.free(bytes);
        var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
        defer _ = checked.deinit();
        defer if (checked.total_requested_bytes != 0) @panic("known parameter list inspection leaked allocations");
        const alloc = checked.allocator();
        var document = try package.inspectDocument(alloc, bytes, .{});
        var standalone = try document.inspectParameterLists(alloc, .{});
        var known = try document.inspectKnown(alloc, .{});
        try std.testing.expectEqual(digest(&standalone), digest(&known.parameter_lists));
        try std.testing.expectEqual(@as(usize, 1), known.parameter_lists.roots.len);
        try std.testing.expectEqual(@as(usize, 3), known.parameter_lists.nodes.len);
        known.deinit(alloc);
        standalone.deinit();
        document.deinit(alloc);
    }
}

const Inspected = union(enum) {
    rejected_zip,
    encrypted,
    accepted: struct { hash: u256, roots: usize, nodes: usize, value_bytes: usize, unknown: usize, mismatches: usize },
};

fn inspectOne(a: std.mem.Allocator, bytes: []const u8) !Inspected {
    var document = package.inspectDocument(a, bytes, .{}) catch |err| {
        if (err == error.MissingEndRecord) return .rejected_zip;
        return err;
    };
    defer document.deinit(a);
    var report = document.inspectParameterLists(a, .{}) catch |err| {
        if (err == error.EncryptedDocument) return .encrypted;
        return err;
    };
    defer report.deinit();
    return .{ .accepted = .{
        .hash = digest(&report),
        .roots = report.roots.len,
        .nodes = report.nodes.len,
        .value_bytes = report.value_bytes,
        .unknown = report.unknown_children,
        .mismatches = report.count_mismatches,
    } };
}

test "HWPX parameter lists corpus per-file independent XML digest" {
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
            defer if (checked.total_requested_bytes != 0) @panic("parameter list corpus leaked allocations");
            const outcome = inspectOne(checked.allocator(), bytes) catch |err| {
                std.debug.print("PARAM_CORPUS_ERROR root={d} path={s} error={s}\n", .{ root_index, entry.path, @errorName(err) });
                return err;
            };
            const path_hash = common.pathDigest(entry.path);
            switch (outcome) {
                .rejected_zip => {
                    rejected_zip += 1;
                    std.debug.print("PARAM_CORPUS_REJECTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .encrypted => {
                    encrypted += 1;
                    std.debug.print("PARAM_CORPUS_ENCRYPTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .accepted => |row| {
                    accepted += 1;
                    std.debug.print("PARAM_CORPUS_FILE {d} {x:0>64} {x:0>64} {d} {d} {d} {d} {d}\n", .{
                        root_index,      path_hash,   row.hash,       row.roots, row.nodes,
                        row.value_bytes, row.unknown, row.mismatches,
                    });
                },
            }
        }
    }
    std.debug.print("PARAM_CORPUS_TOTAL {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

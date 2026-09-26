const std = @import("std");
const package = @import("hwpx/package.zig");
const columns = @import("hwpx/column_definitions.zig");
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

fn triState(hash: *Sha256, flag: ?bool) void {
    number(hash, if (flag) |present| if (present) @as(usize, 2) else 1 else 0);
}

fn digest(report: *const columns.Report) u256 {
    var hash = Sha256.init(.{});
    number(&hash, report.sections);
    number(&hash, report.columns.len);
    number(&hash, report.children.len);
    for (report.columns) |column| {
        number(&hash, column.section_ordinal);
        number(&hash, column.parent_element_index);
        number(&hash, column.element_index);
        value(&hash, column.parent_uri);
        value(&hash, column.parent_local_name);
        for (column.attributes.raw) |attribute| optional(&hash, attribute);
        triState(&hash, column.attributes.type_known);
        triState(&hash, column.attributes.layout_known);
        number(&hash, column.attributes.other_attributes);
        number(&hash, column.direct_children);
        number(&hash, column.unknown_children);
        number(&hash, column.line_children);
        number(&hash, column.size_children);
        number(&hash, @intFromBool(column.size_count_mismatch));
        number(&hash, @intFromBool(column.uniform_size_children));
        number(&hash, column.child_count);
        for (report.children[column.first_child..][0..column.child_count]) |child| {
            number(&hash, child.element_index);
            number(&hash, @intFromEnum(child.kind));
            if (child.line) |line| {
                for (line.raw) |attribute| optional(&hash, attribute);
                triState(&hash, line.type_known);
                triState(&hash, line.width_known);
                triState(&hash, line.color_canonical);
                number(&hash, line.other_attributes);
            } else if (child.size) |size| {
                for (size.raw) |attribute| optional(&hash, attribute);
                number(&hash, size.other_attributes);
            }
            number(&hash, child.direct_children);
        }
    }
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

const Inspected = union(enum) {
    rejected_zip,
    encrypted,
    accepted: struct { hash: u256, columns: usize, children: usize, unknown_types: usize, unequal: usize, mismatch: usize, uniform_sizes: usize },
};

fn inspectOne(a: std.mem.Allocator, bytes: []const u8) !Inspected {
    var document = package.inspectDocument(a, bytes, .{}) catch |err| {
        if (err == error.MissingEndRecord) return .rejected_zip;
        return err;
    };
    defer document.deinit(a);
    var report = document.inspectColumnDefinitions(a, .{}) catch |err| {
        if (err == error.EncryptedDocument) return .encrypted;
        return err;
    };
    defer report.deinit();
    return .{ .accepted = .{
        .hash = digest(&report),
        .columns = report.columns.len,
        .children = report.children.len,
        .unknown_types = report.unknown_types,
        .unequal = report.unequal_columns,
        .mismatch = report.size_count_mismatches,
        .uniform_sizes = report.uniform_size_children,
    } };
}

test "HWPX column definitions real files known integration" {
    const a = std.testing.allocator;
    for ([_]struct { path: []const u8, root: usize, unknown: usize, unequal: usize }{
        .{ .path = "multicolumns-widths.hwpx", .root = 0, .unknown = 0, .unequal = 2 },
        .{ .path = "hwpx/issue2019_floating_form_74312.hwpx", .root = 1, .unknown = 88, .unequal = 55 },
    }) |case| {
        const name = try std.fmt.allocPrint(a, "{s}/{s}", .{ common.roots[case.root], case.path });
        defer a.free(name);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, name, a, .limited(25_000_000));
        defer a.free(bytes);
        var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
        defer _ = checked.deinit();
        defer if (checked.total_requested_bytes != 0) @panic("column known inspection leaked allocations");
        const alloc = checked.allocator();
        var document = try package.inspectDocument(alloc, bytes, .{});
        var standalone = try document.inspectColumnDefinitions(alloc, .{});
        var known = try document.inspectKnown(alloc, .{});
        try std.testing.expectEqual(digest(&standalone), digest(&known.column_definitions));
        try std.testing.expectEqual(case.unknown, standalone.unknown_types);
        try std.testing.expectEqual(case.unequal, standalone.unequal_columns);
        known.deinit(alloc);
        standalone.deinit();
        document.deinit(alloc);
    }
}

test "HWPX column definitions corpus per-file independent XML digest" {
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
            defer if (checked.total_requested_bytes != 0) @panic("column corpus leaked allocations");
            const outcome = inspectOne(checked.allocator(), bytes) catch |err| {
                std.debug.print("COLUMN_CORPUS_ERROR root={d} path={s} error={s}\n", .{ root_index, entry.path, @errorName(err) });
                return err;
            };
            const path_hash = common.pathDigest(entry.path);
            switch (outcome) {
                .rejected_zip => {
                    rejected_zip += 1;
                    std.debug.print("COLUMN_CORPUS_REJECTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .encrypted => {
                    encrypted += 1;
                    std.debug.print("COLUMN_CORPUS_ENCRYPTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .accepted => |row| {
                    accepted += 1;
                    std.debug.print("COLUMN_CORPUS_FILE {d} {x:0>64} {x:0>64} {d} {d} {d} {d} {d} {d}\n", .{
                        root_index, path_hash, row.hash, row.columns, row.children, row.unknown_types, row.unequal, row.mismatch, row.uniform_sizes,
                    });
                },
            }
        }
    }
    std.debug.print("COLUMN_CORPUS_TOTAL {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

const std = @import("std");
const package = @import("hwpx/package.zig");
const controls = @import("hwpx/inline_string_controls.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");

const cases = [_]struct { path: []const u8, control_count: usize, text_count: usize }{
    .{ .path = "HWP5-nopassword-123456.hwpx", .control_count = 3, .text_count = 3 },
    .{ .path = "hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx", .control_count = 1, .text_count = 2 },
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

fn digest(report: *const controls.Report) u256 {
    var hash = Sha256.init(.{});
    number(&hash, report.sections);
    number(&hash, report.controls.len);
    for (report.controls) |control| {
        number(&hash, control.section_ordinal);
        number(&hash, control.parent_element_index);
        number(&hash, control.element_index);
        number(&hash, @intFromEnum(control.kind));
        value(&hash, control.parent_uri);
        value(&hash, control.parent_local_name);
        value(&hash, control.direct_text);
        optional(&hash, control.attributes.pos_type);
        optional(&hash, control.attributes.sz_ratio);
        optional(&hash, control.attributes.option);
        optional(&hash, control.attributes.style_id_ref);
        optional(&hash, control.attributes.alignment);
        number(&hash, control.direct_children);
        number(&hash, control.unknown_children);
        number(&hash, control.other_attributes);
        number(&hash, control.text_count);
        for (report.texts[control.first_text..][0..control.text_count]) |item| {
            number(&hash, item.element_index);
            number(&hash, @intFromEnum(item.kind));
            value(&hash, item.value);
            number(&hash, item.direct_children);
            number(&hash, item.other_attributes);
        }
    }
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

test "HWPX inline string controls two real files known integration" {
    const a = std.testing.allocator;
    for (cases) |case| {
        const file_name = try std.fmt.allocPrint(a, "reference/rhwp/samples/{s}", .{case.path});
        defer a.free(file_name);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, file_name, a, .limited(25_000_000));
        defer a.free(bytes);
        var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
        defer _ = checked.deinit();
        defer if (checked.total_requested_bytes != 0) @panic("inline string control known inspection leaked allocations");
        const alloc = checked.allocator();
        var document = try package.inspectDocument(alloc, bytes, .{});
        var standalone = try document.inspectInlineStringControls(alloc, .{});
        var known = try document.inspectKnown(alloc, .{});
        try std.testing.expectEqual(digest(&standalone), digest(&known.inline_string_controls));
        try std.testing.expectEqual(case.control_count, standalone.controls.len);
        try std.testing.expectEqual(case.text_count, standalone.texts.len);
        known.deinit(alloc);
        standalone.deinit();
        document.deinit(alloc);
    }
}

const Inspected = union(enum) {
    rejected_zip,
    encrypted,
    accepted: struct { hash: u256, controls: usize, texts: usize, value_bytes: usize, unknown: usize, attributes: usize },
};

fn inspectOne(a: std.mem.Allocator, bytes: []const u8) !Inspected {
    var document = package.inspectDocument(a, bytes, .{}) catch |err| {
        if (err == error.MissingEndRecord) return .rejected_zip;
        return err;
    };
    defer document.deinit(a);
    var report = document.inspectInlineStringControls(a, .{}) catch |err| {
        if (err == error.EncryptedDocument) return .encrypted;
        return err;
    };
    defer report.deinit();
    return .{ .accepted = .{
        .hash = digest(&report),
        .controls = report.controls.len,
        .texts = report.texts.len,
        .value_bytes = report.value_bytes,
        .unknown = report.unknown_children,
        .attributes = report.other_attributes,
    } };
}

test "HWPX inline string controls corpus per-file independent XML digest" {
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
            defer if (checked.total_requested_bytes != 0) @panic("inline string control corpus leaked allocations");
            const outcome = inspectOne(checked.allocator(), bytes) catch |err| {
                std.debug.print("INLINE_CORPUS_ERROR root={d} path={s} error={s}\n", .{ root_index, entry.path, @errorName(err) });
                return err;
            };
            const path_hash = common.pathDigest(entry.path);
            switch (outcome) {
                .rejected_zip => {
                    rejected_zip += 1;
                    std.debug.print("INLINE_CORPUS_REJECTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .encrypted => {
                    encrypted += 1;
                    std.debug.print("INLINE_CORPUS_ENCRYPTED {d} {x:0>64}\n", .{ root_index, path_hash });
                },
                .accepted => |row| {
                    accepted += 1;
                    std.debug.print("INLINE_CORPUS_FILE {d} {x:0>64} {x:0>64} {d} {d} {d} {d} {d}\n", .{
                        root_index,      path_hash,   row.hash,       row.controls, row.texts,
                        row.value_bytes, row.unknown, row.attributes,
                    });
                },
            }
        }
    }
    std.debug.print("INLINE_CORPUS_TOTAL {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

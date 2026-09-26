const std = @import("std");
const package = @import("hwpx/package.zig");
const numbers = @import("hwpx/number_controls.zig");
const common = @import("hwpx_text_snapshot_corpus_common.zig");
const Sha256 = std.crypto.hash.sha2.Sha256;

fn count(hash: *Sha256, n: usize) void {
    var bytes: [8]u8 = undefined;
    std.mem.writeInt(u64, &bytes, @intCast(n), .little);
    hash.update(&bytes);
}
fn value(hash: *Sha256, raw: []const u8) void {
    count(hash, raw.len);
    hash.update(raw);
}
fn optional(hash: *Sha256, raw: ?[]const u8) void {
    if (raw) |bytes| {
        hash.update(&.{1});
        value(hash, bytes);
    } else hash.update(&.{0});
}
fn tri(hash: *Sha256, flag: ?bool) void {
    count(hash, if (flag) |yes| if (yes) @as(usize, 2) else 1 else 0);
}
fn digest(report: *const numbers.Report) u256 {
    var hash = Sha256.init(.{});
    count(&hash, report.sections);
    count(&hash, report.controls.len);
    count(&hash, report.formats.len);
    for (report.controls) |control| {
        count(&hash, control.section_ordinal);
        count(&hash, control.parent_element_index);
        count(&hash, control.element_index);
        count(&hash, @intFromEnum(control.kind));
        value(&hash, control.parent_uri);
        value(&hash, control.parent_local_name);
        if (control.auto) |auto| {
            for (auto.raw) |raw| optional(&hash, raw);
            tri(&hash, auto.type_known);
            count(&hash, auto.other_attributes);
        } else if (control.page) |page| {
            for (page.raw) |raw| optional(&hash, raw);
            tri(&hash, page.pos_known);
            tri(&hash, page.format_known);
            count(&hash, page.other_attributes);
        }
        count(&hash, control.direct_children);
        count(&hash, control.unknown_children);
        count(&hash, control.format_count);
        for (report.formats[control.first_format..][0..control.format_count]) |format| {
            count(&hash, format.element_index);
            for (format.attributes.raw) |raw| optional(&hash, raw);
            tri(&hash, format.attributes.type_known);
            count(&hash, format.attributes.other_attributes);
            count(&hash, format.direct_children);
        }
    }
    var output: [32]u8 = undefined;
    hash.final(&output);
    return std.mem.readInt(u256, &output, .big);
}

test "HWPX number controls real files known integration" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "issue3460/svg_picture_repro.hwpx", "hwpx/issue2019_floating_form_74312.hwpx" }, 0..) |path, index| {
        const name = try std.fmt.allocPrint(a, "{s}/{s}", .{ common.roots[1], path });
        defer a.free(name);
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, name, a, .limited(25_000_000));
        defer a.free(bytes);
        var checked: std.heap.DebugAllocator(.{ .safety = true, .enable_memory_limit = true }) = .init;
        checked.requested_memory_limit = 2 * 1024 * 1024 * 1024;
        defer _ = checked.deinit();
        defer if (checked.total_requested_bytes != 0) @panic("number controls known inspection leaked allocations");
        const alloc = checked.allocator();
        var document = try package.inspectDocument(alloc, bytes, .{});
        var standalone = try document.inspectNumberControls(alloc, .{});
        var known = try document.inspectKnown(alloc, .{});
        try std.testing.expectEqual(digest(&standalone), digest(&known.number_controls));
        if (index == 0) try std.testing.expectEqual(@as(usize, 2), standalone.auto_missing_format);
        known.deinit(alloc);
        standalone.deinit();
        document.deinit(alloc);
    }
}

test "HWPX number controls corpus per-file independent XML digest" {
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
            defer if (checked.total_requested_bytes != 0) @panic("number controls corpus leaked allocations");
            const alloc = checked.allocator();
            var document = package.inspectDocument(alloc, bytes, .{}) catch |err| {
                if (err != error.MissingEndRecord) return err;
                rejected_zip += 1;
                std.debug.print("NUMBER_CORPUS_REJECTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                continue;
            };
            var report = document.inspectNumberControls(alloc, .{}) catch |err| {
                document.deinit(alloc);
                if (err != error.EncryptedDocument) return err;
                encrypted += 1;
                std.debug.print("NUMBER_CORPUS_ENCRYPTED {d} {x:0>64}\n", .{ root_index, common.pathDigest(entry.path) });
                continue;
            };
            accepted += 1;
            std.debug.print("NUMBER_CORPUS_FILE {d} {x:0>64} {x:0>64} {d} {d} {d} {d} {d}\n", .{
                root_index,       common.pathDigest(entry.path), digest(&report),            report.auto_nums, report.new_nums,
                report.page_nums, report.formats.len,            report.auto_missing_format,
            });
            report.deinit();
            document.deinit(alloc);
        }
    }
    std.debug.print("NUMBER_CORPUS_TOTAL {d} {d} {d}\n", .{ accepted, rejected_zip, encrypted });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

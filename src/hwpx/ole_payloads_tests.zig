const std = @import("std");
const zip = @import("../zip/archive.zig");
const writer = @import("../cfb/writer.zig");
const fixture = @import("test_package_fixture.zig");
const manifest = @import("content_manifest.zig");
const ole = @import("ole_payloads.zig");
const package = @import("package.zig");
const header = @import("../cfb/header.zig");

fn item(id: []const u8, href: []const u8, media: []const u8, external: bool, entry_index: ?usize) manifest.Item {
    return .{ .id = @constCast(id), .href = @constCast(href), .media_type = @constCast(media), .embedded = if (external) false else null, .entry_index = entry_index };
}

fn cfbBytes(a: std.mem.Allocator) ![]u8 {
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5 },
        .{ .name = "Contents", .parent = 0, .content = "opaque" },
    };
    return writer.write(a, &nodes, .{});
}

fn prefixed(a: std.mem.Allocator, raw: []const u8) ![]u8 {
    const bytes = try a.alloc(u8, raw.len + 4);
    std.mem.writeInt(u32, bytes[0..4], @intCast(raw.len), .little);
    @memcpy(bytes[4..], raw);
    return bytes;
}

fn sample(a: std.mem.Allocator, corrupt_size: bool, corrupt_cfb: bool, options: ole.Options) !ole.Report {
    const raw = try cfbBytes(a);
    defer a.free(raw);
    const wrapped = try prefixed(a, raw);
    defer a.free(wrapped);
    if (corrupt_size) wrapped[0] ^= 1;
    if (corrupt_cfb) wrapped[4 + 8] = 1;
    const sources = [_]fixture.Source{
        .{ .name = "BinData/ole1.ole", .data = wrapped },
        .{ .name = "BinData/image1.OLE", .data = raw },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{
        item("declared-external", "BinData/ole1.ole", "application/ole", true, null),
        item("embedded", "BinData/image1.OLE", "application/octet-stream", false, 1),
        item("remote", "https://example.invalid/remote.ole", "application/ole", true, null),
        item("missing", "BinData/missing.ole", "application/ole", true, null),
        item("other", "BinData/other.bin", "application/octet-stream", false, null),
    };
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    return ole.inspect(a, archive, opf, options);
}

fn normalizedSample(a: std.mem.Allocator, mini: bool, unsupported_tail: bool, options: ole.Options) !ole.Report {
    const raw = try cfbBytes(a);
    defer a.free(raw);
    const head = try header.Header.parse(raw);
    const root = (@as(usize, head.directory_start) + 1) * head.sector_size;
    const fat = try header.int(u32, raw, 76);
    const fat_tail = (@as(usize, fat) + 1) * head.sector_size + (raw.len / head.sector_size - 1) * 4;
    std.mem.writeInt(u64, raw[root + 100 ..][0..8], 17, .little);
    std.mem.writeInt(u32, raw[fat_tail..][0..4], if (unsupported_tail) 42 else 0, .little);
    if (mini) {
        const mini_tail = (@as(usize, head.mini_start) + 1) * head.sector_size + 4;
        std.mem.writeInt(u32, raw[mini_tail..][0..4], 0, .little);
    }
    const wrapped = try prefixed(a, raw);
    defer a.free(wrapped);
    const sources = [_]fixture.Source{.{ .name = "BinData/deviant.ole", .data = wrapped }};
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var items = [_]manifest.Item{item("deviant", sources[0].name, "application/ole", false, 0)};
    const opf: manifest.Manifest = .{ .items = &items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    return ole.inspect(a, archive, opf, options);
}

test "HWPX OLE payloads candidate MIME token excludes lookalikes" {
    try std.testing.expect(ole.isCandidate(item("a", "BinData/a.bin", " Application/OLE; version=1", false, null)));
    try std.testing.expect(ole.isCandidate(item("b", "BinData/b.OLE", "application/octet-stream", false, null)));
    try std.testing.expect(!ole.isCandidate(item("c", "BinData/c.bin", "application/olex", false, null)));
}

test "HWPX OLE payloads preserve external declaration and inspect exact ZIP copy" {
    const a = std.testing.allocator;
    var report = try sample(a, false, false, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 4), report.candidates);
    try std.testing.expectEqual(@as(usize, 3), report.declared_external);
    try std.testing.expectEqual(@as(usize, 2), report.packaged_copies);
    try std.testing.expectEqual(@as(usize, 1), report.external_packaged_copies);
    try std.testing.expectEqual(@as(usize, 2), report.without_packaged_copy);
    try std.testing.expectEqual(@as(usize, 0), report.inspection_failures);
    try std.testing.expectEqual(ole.Target{ .item_index = 0, .entry_index = 0, .declared_external = true, .encoded_bytes = report.targets[0].encoded_bytes, .layout = .observed_size_prefix, .inspection_error = null, .entries = report.targets[0].entries, .streams = report.targets[0].streams, .stream_bytes = report.targets[0].stream_bytes, .path_bytes = report.targets[0].path_bytes }, report.targets[0]);
    try std.testing.expectEqual(@as(?@import("../ole/envelope.zig").Layout, .raw_cfb), report.targets[1].layout);
    try std.testing.expectEqual(@as(usize, 1), report.targets[0].streams);
    try std.testing.expectEqual(@as(usize, 6), report.targets[0].stream_bytes);
    try std.testing.expectError(error.LimitExceeded, sample(a, false, false, .{ .max_targets = 1 }));
    try std.testing.expectError(error.LimitExceeded, sample(a, false, false, .{ .max_total_encoded_bytes = report.encoded_bytes - 1 }));
    try std.testing.expectError(error.LimitExceeded, sample(a, false, false, .{ .max_total_inner_stream_bytes = 11 }));
    try std.testing.expectError(error.LimitExceeded, sample(a, false, false, .{ .max_total_entries = report.entries - 1 }));
    try std.testing.expectError(error.LimitExceeded, sample(a, false, false, .{ .max_total_path_bytes = report.path_bytes - 1 }));
}

test "HWPX OLE payloads do not fall back from corrupt prefix or CFB" {
    const a = std.testing.allocator;
    for ([_]bool{ false, true }) |corrupt_cfb| {
        var report = try sample(a, !corrupt_cfb, corrupt_cfb, .{});
        defer report.deinit(a);
        try std.testing.expectEqual(@as(usize, 1), report.inspection_failures);
        try std.testing.expectEqual(if (corrupt_cfb) error.InvalidHeader else error.InvalidOleEnvelopeSize, report.targets[0].inspection_error.?);
        try std.testing.expectEqual(@as(?anyerror, null), report.targets[1].inspection_error);
    }
}

test "HWPX OLE payloads ignore forged external ZIP binding and reject embedded mismatch" {
    const a = std.testing.allocator;
    const raw = try cfbBytes(a);
    defer a.free(raw);
    const sources = [_]fixture.Source{
        .{ .name = "remote/object.ole", .data = raw },
        .{ .name = "BinData/exact.ole", .data = raw },
    };
    const bytes = try fixture.storedZip(a, &sources);
    defer a.free(bytes);
    var archive = try zip.open(a, bytes, .{});
    defer archive.deinit();
    var external_items = [_]manifest.Item{
        item("remote", sources[0].name, "application/ole", true, 0),
        item("exact", sources[1].name, "application/ole", true, 0),
    };
    const external_manifest: manifest.Manifest = .{ .items = &external_items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    var report = try ole.inspect(a, archive, external_manifest, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 2), report.candidates);
    try std.testing.expectEqual(@as(usize, 1), report.without_packaged_copy);
    try std.testing.expectEqual(@as(usize, 1), report.targets.len);
    try std.testing.expectEqual(@as(usize, 1), report.targets[0].entry_index);

    var embedded_items = [_]manifest.Item{item("forged", sources[1].name, "application/ole", false, 0)};
    const embedded_manifest: manifest.Manifest = .{ .items = &embedded_items, .spine = @constCast(&[_]manifest.SpineRef{}), .xml_bytes = 0 };
    try std.testing.expectError(error.InvalidManifestEntryIndex, ole.inspect(a, archive, embedded_manifest, .{}));
}

test "HWPX OLE payloads keep strict failure while inspecting narrowly normalized copy" {
    const a = std.testing.allocator;
    var report = try normalizedSample(a, true, false, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.inspection_failures);
    try std.testing.expectEqual(@as(usize, 1), report.normalized_targets);
    try std.testing.expectEqual(@as(usize, 0), report.streams);
    try std.testing.expectEqual(@as(usize, 1), report.normalized_streams);
    try std.testing.expectEqual(error.InvalidFat, report.targets[0].inspection_error.?);
    const normalized = report.targets[0].normalized.?;
    try std.testing.expectEqual(@as(u64, 17), normalized.deviations.original_root_created);
    try std.testing.expectEqual(@as(usize, 1), normalized.deviations.zero_fat_tail_slots);
    try std.testing.expectEqual(@as(usize, 1), normalized.deviations.zero_mini_tail_slots);
    try std.testing.expectEqual(@as(usize, 6), normalized.counts.stream_bytes);
    var strict_only = try normalizedSample(a, true, false, .{ .inspect_observed_repairs = false });
    defer strict_only.deinit(a);
    try std.testing.expectEqual(@as(usize, 0), strict_only.normalized_targets);
    try std.testing.expectEqual(error.InvalidFat, strict_only.targets[0].inspection_error.?);
    try std.testing.expectError(error.LimitExceeded, normalizedSample(a, true, false, .{ .max_total_inner_stream_bytes = 5 }));
    try std.testing.expectError(error.LimitExceeded, normalizedSample(a, true, false, .{ .max_total_entries = normalized.counts.entries - 1 }));
    try std.testing.expectError(error.LimitExceeded, normalizedSample(a, true, false, .{ .max_total_path_bytes = normalized.counts.path_bytes - 1 }));
}

test "HWPX OLE payloads never repair nonzero FAT tail marker" {
    const a = std.testing.allocator;
    var report = try normalizedSample(a, false, true, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.inspection_failures);
    try std.testing.expectEqual(@as(usize, 0), report.normalized_targets);
    try std.testing.expectEqual(error.InvalidFat, report.targets[0].inspection_error.?);
    try std.testing.expectEqual(error.UnsupportedObservedDeviation, report.targets[0].normalization_error.?);
}

test "HWPX OLE payloads normalized path releases all allocation failures" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try normalizedSample(a, true, false, .{});
            report.deinit(a);
        }
    }.run, .{});
}

test "HWPX OLE payloads release all allocation failure paths" {
    try std.testing.checkAllAllocationFailures(std.testing.allocator, struct {
        fn run(a: std.mem.Allocator) !void {
            var report = try sample(a, false, false, .{});
            report.deinit(a);
        }
    }.run, .{});
}

test "HWPX OLE payloads inspect real ZIP copy despite OPF external flag" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "reference/rhwp/samples/SO-SUEOP.hwpx", a, .limited(1_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    var report = try document.inspectOlePayloads(a, .{});
    defer report.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), report.candidates);
    try std.testing.expectEqual(@as(usize, 1), report.declared_external);
    try std.testing.expectEqual(@as(usize, 1), report.external_packaged_copies);
    try std.testing.expectEqual(@as(usize, 0), report.inspection_failures);
    try std.testing.expectEqual(@as(?@import("../ole/envelope.zig").Layout, .observed_size_prefix), report.targets[0].layout);
}

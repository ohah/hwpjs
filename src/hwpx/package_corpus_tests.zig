const std = @import("std");
const package = @import("package.zig");
const corpus = @import("package_corpus_fixture.zig");

test "HWPX corpus package relationships read-only survey" {
    const a = std.testing.allocator;
    var dataset = try corpus.open(a);
    defer dataset.deinit();
    var total: usize = 0;
    var accepted: usize = 0;
    var errors: std.StringHashMapUnmanaged(usize) = .empty;
    defer errors.deinit(a);
    for (dataset.entries()) |entry| {
        total += 1;
        const bytes = try dataset.read(a, entry);
        defer a.free(bytes);
        if (package.inspectDocument(a, bytes, .{})) |value| {
            var document = value;
            document.deinit(a);
            accepted += 1;
        } else |err| {
            const slot = try errors.getOrPut(a, @errorName(err));
            if (!slot.found_existing) slot.value_ptr.* = 0;
            slot.value_ptr.* += 1;
        }
    }
    std.debug.print("HWPX package corpus: total={d} accepted={d}\n", .{ total, accepted });
    var it = errors.iterator();
    while (it.next()) |item| std.debug.print("  {s}: {d}\n", .{ item.key_ptr.*, item.value_ptr.* });
    try std.testing.expectEqual(@as(usize, 484), total);
    try std.testing.expectEqual(@as(usize, 478), accepted);
    try std.testing.expectEqual(@as(usize, 1), errors.count());
    try std.testing.expectEqual(@as(?usize, 6), errors.get("MissingEndRecord"));
}

test "HWPX corpus version XML read-only survey" {
    const a = std.testing.allocator;
    var dataset = try corpus.open(a);
    defer dataset.deinit();
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var old_minor: usize = 0;
    var patch_variant: usize = 0;
    for (dataset.entries()) |entry| {
        const bytes = try dataset.read(a, entry);
        defer a.free(bytes);
        var document = package.inspectDocument(a, bytes, .{}) catch |err| {
            try std.testing.expectEqual(error.MissingEndRecord, err);
            rejected_zip += 1;
            continue;
        };
        defer document.deinit(a);
        var version = try document.inspectVersion(a, .{});
        defer version.deinit(a);
        try std.testing.expectEqual(@as(u32, 5), version.major);
        try std.testing.expect(version.xml_version != null);
        try std.testing.expectEqualStrings("WORDPROCESSOR", version.target_application.?);
        try std.testing.expect(version.application != null);
        try std.testing.expect(version.app_version != null);
        try std.testing.expect(version.os != null);
        if (version.minor == 0) old_minor += 1;
        if (version.patch != null) {
            patch_variant += 1;
            try std.testing.expectEqual(@as(?u32, null), version.micro);
            try std.testing.expectEqual(@as(?u32, null), version.build_number);
        }
        accepted += 1;
    }
    std.debug.print("HWPX version corpus: accepted={d} rejected_zip={d} minor0={d} patch_variant={d}\n", .{ accepted, rejected_zip, old_minor, patch_variant });
    try std.testing.expectEqual(@as(usize, 478), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 6), old_minor);
    try std.testing.expectEqual(@as(usize, 1), patch_variant);
}

test "HWPX corpus protection manifest read-only survey" {
    const a = std.testing.allocator;
    var dataset = try corpus.open(a);
    defer dataset.deinit();
    var with_manifest: usize = 0;
    var without_manifest: usize = 0;
    var encrypted: usize = 0;
    for (dataset.entries()) |entry| {
        const bytes = try dataset.read(a, entry);
        defer a.free(bytes);
        var document = package.inspectDocument(a, bytes, .{}) catch |err| {
            try std.testing.expectEqual(error.MissingEndRecord, err);
            continue;
        };
        defer document.deinit(a);
        var report = try document.inspectProtection(a, .{});
        defer report.deinit(a);
        if (report.manifest_present) with_manifest += 1 else without_manifest += 1;
        if (report.encrypted_paths.len != 0) {
            encrypted += 1;
            try std.testing.expect(report.hasEncryptedPath("Contents/header.xml"));
            try std.testing.expect(report.hasEncryptedPath("Contents/section0.xml"));
        }
    }
    std.debug.print("HWPX protection corpus: manifest={d} absent={d} encrypted={d}\n", .{ with_manifest, without_manifest, encrypted });
    try std.testing.expectEqual(@as(usize, 473), with_manifest);
    try std.testing.expectEqual(@as(usize, 5), without_manifest);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

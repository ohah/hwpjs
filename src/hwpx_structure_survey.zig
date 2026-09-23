const std = @import("std");
const package = @import("hwpx/package.zig");
const xml = @import("xml/root.zig");

test "HWPX corpus XML structure read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var parsed: usize = 0;
    var errors: std.StringHashMapUnmanaged(usize) = .empty;
    defer errors.deinit(a);
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                try std.testing.expectEqual(error.MissingEndRecord, err);
                continue;
            };
            defer document.deinit(a);
            for (document.archive.entries) |member| {
                if (!std.mem.eql(u8, member.name, "version.xml") and
                    !std.mem.eql(u8, member.name, "Contents/header.xml") and
                    !(std.mem.startsWith(u8, member.name, "Contents/section") and std.mem.endsWith(u8, member.name, ".xml"))) continue;
                const decoded = try document.archive.decode(member, 32 * 1024 * 1024);
                defer a.free(decoded);
                _ = xml.document.inspect(a, decoded, .{
                    .validate_namespaces = true,
                    .prolog = .{ .input = .{ .max_bytes = decoded.len, .max_characters = decoded.len } },
                    .max_markup_bytes = decoded.len,
                    .max_text_bytes = decoded.len,
                    .max_elements = decoded.len,
                    .max_events = decoded.len,
                    .max_attributes = decoded.len,
                    .max_references = decoded.len,
                }) catch |err| {
                    const slot = try errors.getOrPut(a, @errorName(err));
                    if (!slot.found_existing) slot.value_ptr.* = 0;
                    slot.value_ptr.* += 1;
                    continue;
                };
                parsed += 1;
            }
        }
    }
    std.debug.print("HWPX XML structure parsed={d}\n", .{parsed});
    var it = errors.iterator();
    while (it.next()) |item| std.debug.print("  {s}: {d}\n", .{ item.key_ptr.*, item.value_ptr.* });
    try std.testing.expectEqual(@as(usize, 1498), parsed);
    try std.testing.expectEqual(@as(usize, 2), errors.count());
    try std.testing.expectEqual(@as(?usize, 3), errors.get("TextOutsideXmlRoot"));
    try std.testing.expectEqual(@as(?usize, 1), errors.get("InvalidXmlEncoding"));
}

test "HWPX encrypted samples account for four XML failures" {
    const a = std.testing.allocator;
    const paths = [_][]const u8{
        "legacy/rust/crates/hwp-core/tests/fixtures/password-12345.hwpx",
        "reference/rhwp/samples/HWP5-password-123456.hwpx",
    };
    var text_outside: usize = 0;
    var encoding: usize = 0;
    for (paths) |path| {
        const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(1_000_000));
        defer a.free(bytes);
        var document = try package.inspectDocument(a, bytes, .{});
        defer document.deinit(a);
        const manifest = document.archive.find("META-INF/manifest.xml") orelse return error.MissingEncryptionManifest;
        const manifest_xml = try document.archive.decode(manifest, 1024 * 1024);
        defer a.free(manifest_xml);
        try std.testing.expect(std.mem.indexOf(u8, manifest_xml, "encryption-data") != null);
        for ([_][]const u8{ "Contents/header.xml", "Contents/section0.xml" }) |name| {
            const member = document.archive.find(name) orelse return error.MissingEncryptedMember;
            const decoded = try document.archive.decode(member, 1024 * 1024);
            defer a.free(decoded);
            if (xml.document.inspect(a, decoded, .{ .validate_namespaces = true })) |_| {
                return error.ExpectedEncryptedXmlFailure;
            } else |err| switch (err) {
                error.TextOutsideXmlRoot => text_outside += 1,
                error.InvalidXmlEncoding => encoding += 1,
                else => return err,
            }
        }
    }
    try std.testing.expectEqual(@as(usize, 3), text_outside);
    try std.testing.expectEqual(@as(usize, 1), encoding);
}

test "HWPX corpus product header and spine structure read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var section_count: usize = 0;
    var mismatched_count: usize = 0;
    var undeclared_count: usize = 0;
    var non_xml_spine: usize = 0;
    var unclassified_spine_xml: usize = 0;
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                try std.testing.expectEqual(error.MissingEndRecord, err);
                rejected_zip += 1;
                continue;
            };
            defer document.deinit(a);
            var structure = document.inspectStructure(a, .{}) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX structure unexpected error in {s}: {s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            defer structure.deinit(a);
            accepted += 1;
            section_count += structure.sections.len;
            non_xml_spine += structure.non_xml_spine_items;
            unclassified_spine_xml += structure.unclassified_spine_xml;
            if (structure.declared_count_matches) |matches| {
                if (!matches) mismatched_count += 1;
            } else undeclared_count += 1;
            try std.testing.expect(structure.header_in_spine);
            try std.testing.expectEqual(@as(?bool, true), structure.numeric_path_order_matches);
        }
    }
    std.debug.print("HWPX structure corpus: accepted={d} rejected_zip={d} encrypted={d} sections={d} mismatched={d} undeclared={d} non_xml_spine={d} unclassified={d}\n", .{ accepted, rejected_zip, encrypted, section_count, mismatched_count, undeclared_count, non_xml_spine, unclassified_spine_xml });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
    try std.testing.expectEqual(@as(usize, 544), section_count);
    try std.testing.expectEqual(@as(usize, 1), mismatched_count);
    try std.testing.expectEqual(@as(usize, 0), undeclared_count);
    try std.testing.expectEqual(@as(usize, 0), unclassified_spine_xml);
}

test "HWPX corpus header resource ID inventory read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var declared_mismatches: [7]usize = @splat(0);
    var missing_groups: [7]usize = @splat(0);
    var undeclared_groups: [7]usize = @splat(0);
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                try std.testing.expectEqual(error.MissingEndRecord, err);
                rejected_zip += 1;
                continue;
            };
            defer document.deinit(a);
            var resources = document.inspectHeaderResources(a, .{}) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX resource inventory unexpected error in {s}: {s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            defer resources.deinit(a);
            accepted += 1;
            for ([_]package.HeaderResourceKind{ .border_fill, .char_shape, .tab, .numbering, .bullet, .para_shape, .style }, 0..) |kind, index| {
                const table = resources.table(kind);
                if (!table.present) missing_groups[index] += 1;
                if (table.countMatches()) |matches| {
                    if (!matches) declared_mismatches[index] += 1;
                } else undeclared_groups[index] += 1;
            }
        }
    }
    std.debug.print("HWPX resource corpus: accepted={d} rejected_zip={d} encrypted={d} mismatches={any} missing={any} undeclared={any}\n", .{ accepted, rejected_zip, encrypted, declared_mismatches, missing_groups, undeclared_groups });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

test "HWPX corpus section format references read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var paragraphs: usize = 0;
    var non_direct_paragraphs: usize = 0;
    var runs: usize = 0;
    var non_direct_runs: usize = 0;
    var resolved: [3]usize = @splat(0);
    var absent: [3]usize = @splat(0);
    var missing_target: [3]usize = @splat(0);
    var absent_table: [3]usize = @splat(0);
    var absent_style_documents: usize = 0;
    var absent_style_minor0: usize = 0;
    var absent_style_minor1: usize = 0;
    var absent_style_first_zero: usize = 0;
    var absent_style_first_nonzero: usize = 0;
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                try std.testing.expectEqual(error.MissingEndRecord, err);
                rejected_zip += 1;
                continue;
            };
            defer document.deinit(a);
            const report = document.inspectReferences(a, .{}) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX reference unexpected error in {s}: {s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            accepted += 1;
            sections += report.sections;
            paragraphs += report.paragraphs;
            non_direct_paragraphs += report.non_direct_paragraphs;
            runs += report.runs;
            non_direct_runs += report.non_direct_runs;
            if (report.counts(.style).absent_table != 0) {
                absent_style_documents += 1;
                var version = try document.inspectVersion(a, .{});
                defer version.deinit(a);
                if (version.minor == 0) absent_style_minor0 += 1;
                if (version.minor == 1) absent_style_minor1 += 1;
                if (report.counts(.style).first_unresolved_id == 0) absent_style_first_zero += 1 else absent_style_first_nonzero += 1;
                if (absent_style_documents <= 3) std.debug.print("HWPX absent style sample: {s} minor={d} first_id={?d}\n", .{ entry.path, version.minor, report.counts(.style).first_unresolved_id });
            }
            for ([_]package.ReferenceKind{ .paragraph_shape, .style, .character_shape }, 0..) |kind, index| {
                const counts = report.counts(kind);
                resolved[index] += counts.resolved;
                absent[index] += counts.absent;
                missing_target[index] += counts.missing_target;
                absent_table[index] += counts.absent_table;
            }
        }
    }
    std.debug.print("HWPX format references: accepted={d} rejected_zip={d} encrypted={d} sections={d} paragraphs={d} non_direct_paragraphs={d} runs={d} non_direct_runs={d} resolved={any} absent={any} missing_target={any} absent_table={any}\n", .{ accepted, rejected_zip, encrypted, sections, paragraphs, non_direct_paragraphs, runs, non_direct_runs, resolved, absent, missing_target, absent_table });
    std.debug.print("HWPX absent style docs={d} minor0={d} minor1={d} first_zero={d} first_nonzero={d}\n", .{ absent_style_documents, absent_style_minor0, absent_style_minor1, absent_style_first_zero, absent_style_first_nonzero });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
}

test "HWPX corpus header resource links read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    const kinds = [_]package.HeaderReferenceKind{
        .style_paragraph_shape,
        .style_character_shape,
        .style_next_style,
        .paragraph_tab,
        .paragraph_border_fill,
        .character_border_fill,
    };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var styles: usize = 0;
    var character_styles: usize = 0;
    var character_style_missing_paragraph_shape: usize = 0;
    var character_style_missing_next_style: usize = 0;
    var paragraph_shapes: usize = 0;
    var character_shapes: usize = 0;
    var paragraph_border_elements: usize = 0;
    var paragraphs_without_border_element: usize = 0;
    var resolved: [kinds.len]usize = @splat(0);
    var absent: [kinds.len]usize = @splat(0);
    var missing_target: [kinds.len]usize = @splat(0);
    var absent_table: [kinds.len]usize = @splat(0);
    var anomaly_documents: [3]usize = @splat(0);
    var anomaly_minor0: [3]usize = @splat(0);
    var anomaly_minor1: [3]usize = @splat(0);
    for (roots) |root| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            const bytes = try dir.readFileAlloc(std.testing.io, entry.path, a, .limited(25_000_000));
            defer a.free(bytes);
            var document = package.inspectDocument(a, bytes, .{}) catch |err| {
                try std.testing.expectEqual(error.MissingEndRecord, err);
                rejected_zip += 1;
                continue;
            };
            defer document.deinit(a);
            const report = document.inspectHeaderReferences(a, .{}) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX header links unexpected error in {s}: {s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            accepted += 1;
            styles += report.styles;
            character_styles += report.character_styles;
            character_style_missing_paragraph_shape += report.character_style_missing_paragraph_shape;
            character_style_missing_next_style += report.character_style_missing_next_style;
            paragraph_shapes += report.paragraph_shapes;
            character_shapes += report.character_shapes;
            paragraph_border_elements += report.paragraph_border_elements;
            paragraphs_without_border_element += report.paragraphs_without_border_element;
            for (kinds, 0..) |kind, index| {
                const counts = report.counts(kind);
                resolved[index] += counts.resolved;
                absent[index] += counts.absent;
                missing_target[index] += counts.missing_target;
                absent_table[index] += counts.absent_table;
            }
            const unusual = [_]bool{
                report.counts(.style_paragraph_shape).missing_target != 0,
                report.counts(.style_next_style).missing_target != 0,
                report.counts(.paragraph_tab).absent_table != 0,
            };
            if (unusual[0] or unusual[1] or unusual[2]) {
                var version = try document.inspectVersion(a, .{});
                defer version.deinit(a);
                const tracked = [_]package.HeaderReferenceKind{ .style_paragraph_shape, .style_next_style, .paragraph_tab };
                for (unusual, 0..) |found, index| {
                    if (!found) continue;
                    anomaly_documents[index] += 1;
                    if (version.minor == 0) anomaly_minor0[index] += 1;
                    if (version.minor == 1) anomaly_minor1[index] += 1;
                    if (anomaly_documents[index] <= 3) std.debug.print("HWPX header link anomaly kind={s} path={s} minor={d} first_id={?d}\n", .{ @tagName(tracked[index]), entry.path, version.minor, report.counts(tracked[index]).first_unresolved_id });
                }
            }
        }
    }
    std.debug.print("HWPX header links: accepted={d} rejected_zip={d} encrypted={d} styles={d} para={d} char={d} borders={d} no_border={d} resolved={any} absent={any} missing_target={any} absent_table={any}\n", .{ accepted, rejected_zip, encrypted, styles, paragraph_shapes, character_shapes, paragraph_border_elements, paragraphs_without_border_element, resolved, absent, missing_target, absent_table });
    std.debug.print("HWPX header link character styles={d} missing_para={d} missing_next={d}\n", .{ character_styles, character_style_missing_paragraph_shape, character_style_missing_next_style });
    std.debug.print("HWPX header link anomaly docs={any} minor0={any} minor1={any}\n", .{ anomaly_documents, anomaly_minor0, anomaly_minor1 });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
    try std.testing.expectEqual([kinds.len]usize{ 1, 0, 6, 0, 0, 0 }, missing_target);
    try std.testing.expectEqual([kinds.len]usize{ 0, 0, 0, 33, 0, 0 }, absent_table);
    try std.testing.expectEqual(@as(usize, 1), character_style_missing_paragraph_shape);
    try std.testing.expectEqual(@as(usize, 6), character_style_missing_next_style);
}

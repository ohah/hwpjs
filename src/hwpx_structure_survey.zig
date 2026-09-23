const std = @import("std");
const package = @import("hwpx/package.zig");
const xml = @import("xml/root.zig");
const hwpx_attrs = @import("hwpx/xml_attributes.zig");

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

test "HWPX corpus fontface language links read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    const languages = [_]package.FontLanguage{ .hangul, .latin, .hanja, .japanese, .other, .symbol, .user };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var fontfaces_absent: usize = 0;
    var group_count_mismatch: usize = 0;
    var char_shapes: usize = 0;
    var font_refs: usize = 0;
    var extra_font_refs: usize = 0;
    var shapes_without_font_ref: usize = 0;
    var languages_present: [languages.len]usize = @splat(0);
    var font_ids: [languages.len]usize = @splat(0);
    var font_count_mismatch: [languages.len]usize = @splat(0);
    var resolved: [languages.len]usize = @splat(0);
    var absent: [languages.len]usize = @splat(0);
    var missing_target: [languages.len]usize = @splat(0);
    var absent_table: [languages.len]usize = @splat(0);
    var absent_table_documents: [languages.len]usize = @splat(0);
    var absent_table_minor0: [languages.len]usize = @splat(0);
    var absent_table_minor1: [languages.len]usize = @splat(0);
    var absent_table_first_zero: [languages.len]usize = @splat(0);
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
            var report = document.inspectFontReferences(a, .{}) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX font links unexpected error in {s}: {s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            defer report.deinit(a);
            accepted += 1;
            if (!report.faces.fontfaces_present) fontfaces_absent += 1;
            if (report.faces.languageCountMatches()) |matches| {
                if (!matches) group_count_mismatch += 1;
            }
            char_shapes += report.references.character_shapes;
            font_refs += report.references.font_ref_elements;
            extra_font_refs += report.references.extra_font_ref_elements;
            shapes_without_font_ref += report.references.character_shapes_without_font_ref;
            for (languages, 0..) |language, index| {
                const table = report.faces.table(language);
                if (table.present) languages_present[index] += 1;
                font_ids[index] += table.ids.items.len;
                if (table.countMatches()) |matches| {
                    if (!matches) font_count_mismatch[index] += 1;
                }
                const counts = report.references.counts(language);
                resolved[index] += counts.resolved;
                absent[index] += counts.absent;
                missing_target[index] += counts.missing_target;
                absent_table[index] += counts.absent_table;
                if (counts.absent_table != 0) {
                    absent_table_documents[index] += 1;
                    if (counts.first_unresolved_id == 0) absent_table_first_zero[index] += 1;
                    if (absent_table_documents[index] <= 2) {
                        std.debug.print("HWPX font absent language path={s} language={s} first_id={?d}\n", .{ entry.path, @tagName(language), counts.first_unresolved_id });
                    }
                }
            }
            var any_absent = false;
            for (languages) |language| {
                if (report.references.counts(language).absent_table != 0) any_absent = true;
            }
            if (any_absent) {
                var version = try document.inspectVersion(a, .{});
                defer version.deinit(a);
                for (languages, 0..) |language, index| {
                    if (report.references.counts(language).absent_table == 0) continue;
                    if (version.minor == 0) absent_table_minor0[index] += 1;
                    if (version.minor == 1) absent_table_minor1[index] += 1;
                }
            }
        }
    }
    std.debug.print("HWPX font links: accepted={d} rejected_zip={d} encrypted={d} fontfaces_absent={d} group_count_mismatch={d} char_shapes={d} font_refs={d} extra_font_refs={d} no_font_ref={d}\n", .{ accepted, rejected_zip, encrypted, fontfaces_absent, group_count_mismatch, char_shapes, font_refs, extra_font_refs, shapes_without_font_ref });
    std.debug.print("HWPX font links: languages_present={any} font_ids={any} font_count_mismatch={any}\n", .{ languages_present, font_ids, font_count_mismatch });
    std.debug.print("HWPX font links: resolved={any} absent={any} missing_target={any} absent_table={any}\n", .{ resolved, absent, missing_target, absent_table });
    std.debug.print("HWPX font absent table docs={any} minor0={any} minor1={any} first_zero={any}\n", .{ absent_table_documents, absent_table_minor0, absent_table_minor1, absent_table_first_zero });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
    try std.testing.expectEqual(@as(usize, 0), fontfaces_absent);
    try std.testing.expectEqual(@as(usize, 0), group_count_mismatch);
    try std.testing.expectEqual(@as(usize, 30_189), char_shapes);
    try std.testing.expectEqual(char_shapes, font_refs);
    try std.testing.expectEqual(@as(usize, 0), extra_font_refs);
    try std.testing.expectEqual(@as(usize, 0), shapes_without_font_ref);
    try std.testing.expectEqual([languages.len]usize{ 476, 457, 457, 457, 457, 457, 457 }, languages_present);
    try std.testing.expectEqual([languages.len]usize{ 3252, 3403, 2912, 2905, 2547, 2888, 2539 }, font_ids);
    try std.testing.expectEqual([languages.len]usize{ 0, 0, 0, 0, 0, 0, 0 }, font_count_mismatch);
    try std.testing.expectEqual([languages.len]usize{ 30_189, 30_169, 30_169, 30_169, 30_169, 30_169, 30_169 }, resolved);
    try std.testing.expectEqual([languages.len]usize{ 0, 0, 0, 0, 0, 0, 0 }, absent);
    try std.testing.expectEqual([languages.len]usize{ 0, 0, 0, 0, 0, 0, 0 }, missing_target);
    try std.testing.expectEqual([languages.len]usize{ 0, 20, 20, 20, 20, 20, 20 }, absent_table);
    try std.testing.expectEqual([languages.len]usize{ 0, 0, 0, 0, 0, 0, 0 }, absent_table_minor0);
    try std.testing.expectEqual([languages.len]usize{ 0, 19, 19, 19, 19, 19, 19 }, absent_table_minor1);
    try std.testing.expectEqual(absent_table_documents, absent_table_first_zero);
}

test "HWPX corpus list definition links read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var paragraph_shapes: usize = 0;
    var headings: usize = 0;
    var without_heading: usize = 0;
    var extra_headings: usize = 0;
    var none: usize = 0;
    var outline: usize = 0;
    var number: @TypeOf(@as(package.ListReferenceReport, undefined).heading_number) = .{};
    var bullet: @TypeOf(@as(package.ListReferenceReport, undefined).heading_bullet) = .{};
    var heading_type_absent: usize = 0;
    var unlinked_id_absent: usize = 0;
    var unlinked_id_nonzero: usize = 0;
    var numbering_para_heads: usize = 0;
    var bullet_para_heads: usize = 0;
    var numbering_character: @TypeOf(@as(package.ListReferenceReport, undefined).numbering_character) = .{};
    var bullet_character: @TypeOf(@as(package.ListReferenceReport, undefined).bullet_character) = .{};
    var numbering_character_max_marker: usize = 0;
    var bullet_character_max_marker: usize = 0;
    var bullet_missing_docs: usize = 0;
    var bullet_missing_minor0: usize = 0;
    var bullet_missing_minor1: usize = 0;
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
            const report = document.inspectListReferences(a, .{}) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX list links unexpected error: {s}\n", .{@errorName(err)});
                return err;
            };
            accepted += 1;
            paragraph_shapes += report.paragraph_shapes;
            headings += report.headings;
            without_heading += report.paragraphs_without_heading;
            extra_headings += report.extra_headings;
            none += report.heading_none;
            outline += report.heading_outline;
            number.present += report.heading_number.present;
            number.absent += report.heading_number.absent;
            number.resolved += report.heading_number.resolved;
            number.missing_target += report.heading_number.missing_target;
            number.absent_table += report.heading_number.absent_table;
            bullet.present += report.heading_bullet.present;
            bullet.absent += report.heading_bullet.absent;
            bullet.resolved += report.heading_bullet.resolved;
            bullet.missing_target += report.heading_bullet.missing_target;
            bullet.absent_table += report.heading_bullet.absent_table;
            heading_type_absent += report.heading_type_absent;
            unlinked_id_absent += report.unlinked_id_absent;
            unlinked_id_nonzero += report.unlinked_id_nonzero;
            numbering_para_heads += report.numbering_para_heads;
            bullet_para_heads += report.bullet_para_heads;
            numbering_character.present += report.numbering_character.present;
            numbering_character.absent += report.numbering_character.absent;
            numbering_character.resolved += report.numbering_character.resolved;
            numbering_character.missing_target += report.numbering_character.missing_target;
            numbering_character.absent_table += report.numbering_character.absent_table;
            bullet_character.present += report.bullet_character.present;
            bullet_character.absent += report.bullet_character.absent;
            bullet_character.resolved += report.bullet_character.resolved;
            bullet_character.missing_target += report.bullet_character.missing_target;
            bullet_character.absent_table += report.bullet_character.absent_table;
            numbering_character_max_marker += report.numbering_character_max_marker;
            bullet_character_max_marker += report.bullet_character_max_marker;
            if (report.heading_bullet.missing_target != 0 or report.heading_bullet.absent_table != 0) {
                bullet_missing_docs += 1;
                try std.testing.expectEqual(@as(?u32, 0), report.heading_bullet.first_unresolved_id);
                var version = try document.inspectVersion(a, .{});
                defer version.deinit(a);
                if (version.minor == 0) bullet_missing_minor0 += 1;
                if (version.minor == 1) bullet_missing_minor1 += 1;
                if (bullet_missing_docs <= 3) std.debug.print("HWPX list missing bullet path={s} first_id={?d}\n", .{ entry.path, report.heading_bullet.first_unresolved_id });
            }
        }
    }
    std.debug.print("HWPX list links: accepted={d} rejected_zip={d} encrypted={d} paragraph_shapes={d} headings={d} without={d} extra={d}\n", .{ accepted, rejected_zip, encrypted, paragraph_shapes, headings, without_heading, extra_headings });
    std.debug.print("HWPX list links: none={d} outline={d} number={any} bullet={any} type_absent={d} unlinked_id_absent={d} unlinked_id_nonzero={d}\n", .{ none, outline, number, bullet, heading_type_absent, unlinked_id_absent, unlinked_id_nonzero });
    std.debug.print("HWPX list links: numbering_para_heads={d} numbering_char={any} numbering_max={d} bullet_para_heads={d} bullet_char={any} bullet_max={d}\n", .{ numbering_para_heads, numbering_character, numbering_character_max_marker, bullet_para_heads, bullet_character, bullet_character_max_marker });
    std.debug.print("HWPX list unresolved bullet docs={d} minor0={d} minor1={d}\n", .{ bullet_missing_docs, bullet_missing_minor0, bullet_missing_minor1 });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
    try std.testing.expectEqual(@as(usize, 28_144), paragraph_shapes);
    try std.testing.expectEqual(@as(usize, 27_766), headings);
    try std.testing.expectEqual(@as(usize, 378), without_heading);
    try std.testing.expectEqual(@as(usize, 0), extra_headings);
    try std.testing.expectEqual(@as(usize, 25_122), none);
    try std.testing.expectEqual(@as(usize, 2358), outline);
    try std.testing.expectEqual(@as(usize, 153), number.resolved);
    try std.testing.expectEqual(@as(usize, 128), bullet.resolved);
    try std.testing.expectEqual(@as(usize, 5), bullet.absent_table);
    try std.testing.expectEqual(@as(usize, 0), number.missing_target + number.absent_table + bullet.missing_target);
    try std.testing.expectEqual(@as(usize, 0), heading_type_absent + unlinked_id_absent + unlinked_id_nonzero);
    try std.testing.expectEqual(@as(usize, 4976), numbering_para_heads);
    try std.testing.expectEqual(@as(usize, 83), bullet_para_heads);
    try std.testing.expectEqual(@as(usize, 644), numbering_character.resolved);
    try std.testing.expectEqual(@as(usize, 3), bullet_character.resolved);
    try std.testing.expectEqual(@as(usize, 4332), numbering_character_max_marker);
    try std.testing.expectEqual(@as(usize, 80), bullet_character_max_marker);
    try std.testing.expectEqual(@as(usize, 0), numbering_character.missing_target + numbering_character.absent_table + bullet_character.missing_target + bullet_character.absent_table);
    try std.testing.expectEqual(@as(usize, 5), bullet_missing_docs);
    try std.testing.expectEqual(@as(usize, 0), bullet_missing_minor0);
    try std.testing.expectEqual(@as(usize, 5), bullet_missing_minor1);
}

test "HWPX corpus binary manifest links read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    const kinds = [_]package.BinaryReferenceKind{ .header_font, .header_substitute_font, .header_brush_image, .section_picture, .section_brush_image, .section_ole };
    const Counts = @TypeOf(@as(package.BinaryReferenceReport, undefined).counts_by_kind[0]);
    var totals: [kinds.len]Counts = @splat(.{});
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var observed_sites: usize = 0;
    var unclassified_sites: usize = 0;
    var missing_docs: usize = 0;
    var unclassified_docs: usize = 0;
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
            var report = document.inspectBinaryReferences(a, .{}) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX binary links unexpected path={s} error={s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            defer report.deinit(a);
            accepted += 1;
            sections += report.sections;
            observed_sites += report.observed_sites;
            unclassified_sites += report.unclassified_attribute_sites;
            if (report.first_unclassified_id != null) {
                unclassified_docs += 1;
                if (unclassified_docs <= 3) std.debug.print("HWPX binary unclassified path={s} first_id={s}\n", .{ entry.path, report.first_unclassified_id.? });
            }
            if (report.first_missing_id != null) {
                missing_docs += 1;
                if (missing_docs <= 3) std.debug.print("HWPX binary missing path={s} first_id={s}\n", .{ entry.path, report.first_missing_id.? });
            }
            for (kinds, 0..) |kind, index| {
                const source = report.counts(kind);
                totals[index].sites += source.sites;
                totals[index].absent += source.absent;
                totals[index].empty += source.empty;
                totals[index].resolved_embedded += source.resolved_embedded;
                totals[index].resolved_external += source.resolved_external;
                totals[index].missing_target += source.missing_target;
            }
        }
    }
    std.debug.print("HWPX binary links accepted={d} rejected_zip={d} encrypted={d} sections={d} observed_sites={d} unclassified_sites={d} missing_docs={d} unclassified_docs={d}\n", .{ accepted, rejected_zip, encrypted, sections, observed_sites, unclassified_sites, missing_docs, unclassified_docs });
    for (kinds, totals) |kind, counts| std.debug.print("HWPX binary {s} {any}\n", .{ @tagName(kind), counts });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
    try std.testing.expectEqual(@as(usize, 544), sections);
    try std.testing.expectEqual(@as(usize, 25_549), observed_sites);
    try std.testing.expectEqual(@as(usize, 0), unclassified_sites);
    try std.testing.expectEqual(@as(usize, 0), missing_docs);
    try std.testing.expectEqual(@as(usize, 0), unclassified_docs);
    try std.testing.expectEqual(@as(usize, 20_446), totals[0].sites);
    try std.testing.expectEqual(@as(usize, 20_445), totals[0].absent);
    try std.testing.expectEqual(@as(usize, 1), totals[0].resolved_embedded);
    try std.testing.expectEqual(@as(usize, 2620), totals[1].sites);
    try std.testing.expectEqual(@as(usize, 2620), totals[1].empty);
    try std.testing.expectEqual(@as(usize, 389), totals[2].resolved_embedded);
    try std.testing.expectEqual(@as(usize, 1993), totals[3].sites);
    try std.testing.expectEqual(@as(usize, 41), totals[3].empty);
    try std.testing.expectEqual(@as(usize, 1945), totals[3].resolved_embedded);
    try std.testing.expectEqual(@as(usize, 7), totals[3].resolved_external);
    try std.testing.expectEqual(@as(usize, 1), totals[4].resolved_embedded);
    try std.testing.expectEqual(@as(usize, 100), totals[5].sites);
    try std.testing.expectEqual(@as(usize, 1), totals[5].empty);
    try std.testing.expectEqual(@as(usize, 34), totals[5].resolved_embedded);
    try std.testing.expectEqual(@as(usize, 65), totals[5].resolved_external);
    for (totals) |counts| try std.testing.expectEqual(@as(usize, 0), counts.missing_target);
}

test "HWPX corpus chart path and XML read-only survey" {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var sites: usize = 0;
    var resolved: usize = 0;
    var chart_parts: usize = 0;
    var unclassified: usize = 0;
    var missing: usize = 0;
    var numeric_caches: usize = 0;
    var string_caches: usize = 0;
    var numeric_literals: usize = 0;
    var string_literals: usize = 0;
    var cache_points: usize = 0;
    var declared_points: usize = 0;
    var cache_issues: usize = 0;
    var value_text_bytes: usize = 0;
    var empty_values: usize = 0;
    var max_value_bytes: usize = 0;
    var xstring_escapes: usize = 0;
    var xstring_decoded_values: usize = 0;
    var xstring_decoded_bytes: usize = 0;
    var unsupported_xstring_surrogates: usize = 0;
    var numeric_references: usize = 0;
    var string_references: usize = 0;
    var formulas: usize = 0;
    var attached_caches: usize = 0;
    var formula_issues: usize = 0;
    var formula_text_bytes: usize = 0;
    var empty_formulas: usize = 0;
    var max_formula_bytes: usize = 0;
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
            var report = document.inspectChartReferences(a, .{}) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX chart unexpected path={s} error={s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            defer report.deinit(a);
            accepted += 1;
            sections += report.sections;
            sites += report.chart_sites;
            resolved += report.resolved;
            chart_parts += report.chart_parts;
            unclassified += report.unclassified_attribute_sites;
            missing += report.missing_entry + report.invalid_path;
            numeric_caches += report.cache.numeric_caches;
            string_caches += report.cache.string_caches;
            numeric_literals += report.cache.numeric_literals;
            string_literals += report.cache.string_literals;
            cache_points += report.cache.points;
            declared_points += report.cache.declared_points;
            cache_issues += report.cache.issues();
            value_text_bytes += report.cache.value_text_bytes;
            empty_values += report.cache.empty_values;
            max_value_bytes = @max(max_value_bytes, report.cache.max_observed_value_bytes);
            xstring_escapes += report.cache.xstring_escape_sequences;
            xstring_decoded_values += report.cache.xstring_decoded_values;
            xstring_decoded_bytes += report.cache.xstring_decoded_bytes;
            unsupported_xstring_surrogates += report.cache.unsupported_xstring_surrogates;
            numeric_references += report.formula.numeric_references;
            string_references += report.formula.string_references;
            formulas += report.formula.formulas;
            attached_caches += report.formula.attached_caches;
            formula_issues += report.formula.issues();
            formula_text_bytes += report.formula.formula_text_bytes;
            empty_formulas += report.formula.empty_formulas;
            max_formula_bytes = @max(max_formula_bytes, report.formula.max_observed_formula_bytes);
            if (report.first_cache_issue_path) |path| std.debug.print("HWPX chart cache diagnostic file={s} part={s} issues={d}\n", .{ entry.path, path, report.cache.issues() });
            if (report.first_formula_issue_path) |path| std.debug.print("HWPX chart formula diagnostic file={s} part={s} issues={d}\n", .{ entry.path, path, report.formula.issues() });
            if (report.chart_sites != report.resolved or report.unclassified_attribute_sites != 0) {
                std.debug.print("HWPX chart link diagnostic path={s} sites={d} resolved={d} absent={d} empty={d} invalid={d} missing={d} unclassified={d}\n", .{ entry.path, report.chart_sites, report.resolved, report.absent, report.empty, report.invalid_path, report.missing_entry, report.unclassified_attribute_sites });
            }
        }
    }
    std.debug.print("HWPX chart accepted={d} rejected_zip={d} encrypted={d} sections={d} sites={d} resolved={d} chart_parts={d} unclassified={d} missing={d}\n", .{ accepted, rejected_zip, encrypted, sections, sites, resolved, chart_parts, unclassified, missing });
    std.debug.print("HWPX chart data numeric_cache={d} string_cache={d} numeric_literal={d} string_literal={d} points={d} declared={d} issues={d}\n", .{ numeric_caches, string_caches, numeric_literals, string_literals, cache_points, declared_points, cache_issues });
    std.debug.print("HWPX chart formula numeric_ref={d} string_ref={d} formulas={d} attached_caches={d} issues={d}\n", .{ numeric_references, string_references, formulas, attached_caches, formula_issues });
    std.debug.print("HWPX chart text value_bytes={d} empty_values={d} max_value_bytes={d} formula_bytes={d} empty_formulas={d} max_formula_bytes={d}\n", .{ value_text_bytes, empty_values, max_value_bytes, formula_text_bytes, empty_formulas, max_formula_bytes });
    std.debug.print("HWPX chart Xstring escapes={d} decoded_values={d} decoded_bytes={d} unsupported_surrogates={d}\n", .{ xstring_escapes, xstring_decoded_values, xstring_decoded_bytes, unsupported_xstring_surrogates });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
    try std.testing.expectEqual(@as(usize, 544), sections);
    try std.testing.expectEqual(@as(usize, 93), sites);
    try std.testing.expectEqual(sites, resolved);
    try std.testing.expectEqual(@as(usize, 0), unclassified);
    try std.testing.expectEqual(@as(usize, 0), missing);
    try std.testing.expectEqual(@as(usize, 259), numeric_caches);
    try std.testing.expectEqual(@as(usize, 477), string_caches);
    try std.testing.expectEqual(@as(usize, 11), numeric_literals);
    try std.testing.expectEqual(@as(usize, 5), string_literals);
    try std.testing.expectEqual(@as(usize, 2296), cache_points);
    try std.testing.expectEqual(cache_points, declared_points);
    try std.testing.expectEqual(@as(usize, 0), cache_issues);
    try std.testing.expectEqual(@as(usize, 259), numeric_references);
    try std.testing.expectEqual(@as(usize, 477), string_references);
    try std.testing.expectEqual(@as(usize, 736), formulas);
    try std.testing.expectEqual(@as(usize, 736), attached_caches);
    try std.testing.expectEqual(@as(usize, 0), formula_issues);
    try std.testing.expectEqual(@as(usize, 0), empty_values);
    try std.testing.expectEqual(@as(usize, 0), empty_formulas);
    try std.testing.expectEqual(@as(usize, 12374), value_text_bytes);
    try std.testing.expectEqual(@as(usize, 21), max_value_bytes);
    try std.testing.expectEqual(@as(usize, 0), xstring_escapes);
    try std.testing.expectEqual(@as(usize, 2296), xstring_decoded_values);
    try std.testing.expectEqual(value_text_bytes, xstring_decoded_bytes);
    try std.testing.expectEqual(@as(usize, 0), unsupported_xstring_surrogates);
    try std.testing.expectEqual(@as(usize, 10540), formula_text_bytes);
    try std.testing.expectEqual(@as(usize, 17), max_formula_bytes);
}

test "HWPX corpus section text and inline token read-only survey" {
    const a = std.testing.allocator;
    const BoundaryCounter = struct {
        paragraph_starts: usize = 0,
        paragraph_ends: usize = 0,
        run_starts: usize = 0,
        run_ends: usize = 0,
        stack: [256]u8 = undefined,
        depth: usize = 0,
        fn push(self: *@This(), kind: u8) !void {
            if (self.depth == self.stack.len) return error.InvalidTextBoundaryDepth;
            self.stack[self.depth] = kind;
            self.depth += 1;
        }
        fn pop(self: *@This(), kind: u8) !void {
            if (self.depth == 0 or self.stack[self.depth - 1] != kind) return error.InvalidTextBoundaryOrder;
            self.depth -= 1;
        }
        fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            switch (event) {
                .paragraph_start => {
                    self.paragraph_starts += 1;
                    try self.push('p');
                },
                .paragraph_end => {
                    self.paragraph_ends += 1;
                    try self.pop('p');
                },
                .run_start => {
                    self.run_starts += 1;
                    try self.push('r');
                },
                .run_end => {
                    self.run_ends += 1;
                    try self.pop('r');
                },
                else => {},
            }
        }
    };
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var direct_paragraphs: usize = 0;
    var sections_without_direct_paragraph: usize = 0;
    var paragraphs: usize = 0;
    var paragraphs_without_direct_run: usize = 0;
    var runs: usize = 0;
    var non_direct_runs: usize = 0;
    var text_elements: usize = 0;
    var empty_text_elements: usize = 0;
    var text_bytes: usize = 0;
    var inline_counts: [@typeInfo(package.SectionTextInlineKind).@"enum".fields.len]usize = @splat(0);
    var other_content_counts: [@typeInfo(package.SectionOtherContentKind).@"enum".fields.len]usize = @splat(0);
    var non_text_content_chunks: usize = 0;
    var issues: usize = 0;
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
            var boundary: BoundaryCounter = .{};
            const report = document.inspectSectionText(a, .{}, .{ .context = &boundary, .on_event = BoundaryCounter.onEvent }) catch |err| {
                if (err == error.EncryptedDocument) {
                    encrypted += 1;
                    continue;
                }
                std.debug.print("HWPX text unexpected path={s} error={s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            try std.testing.expectEqual(@as(usize, 0), boundary.depth);
            try std.testing.expectEqual(report.paragraphs, boundary.paragraph_starts);
            try std.testing.expectEqual(report.paragraphs, boundary.paragraph_ends);
            try std.testing.expectEqual(report.runs, boundary.run_starts);
            try std.testing.expectEqual(report.runs, boundary.run_ends);
            accepted += 1;
            sections += report.sections;
            direct_paragraphs += report.direct_paragraphs;
            sections_without_direct_paragraph += report.sections_without_direct_paragraph;
            paragraphs += report.paragraphs;
            paragraphs_without_direct_run += report.paragraphs_without_direct_run;
            runs += report.runs;
            non_direct_runs += report.non_direct_runs;
            text_elements += report.text_elements;
            empty_text_elements += report.empty_text_elements;
            text_bytes += report.text_bytes;
            for (report.inline_counts, 0..) |count, index| inline_counts[index] += count;
            for (report.other_content_counts, 0..) |count, index| other_content_counts[index] += count;
            non_text_content_chunks += report.non_text_content_chunks;
            issues += report.issues();
        }
    }
    std.debug.print("HWPX text accepted={d} rejected_zip={d} encrypted={d} sections={d} paragraphs={d} runs={d} texts={d} empty={d} bytes={d} issues={d}\n", .{ accepted, rejected_zip, encrypted, sections, paragraphs, runs, text_elements, empty_text_elements, text_bytes, issues });
    std.debug.print("HWPX text structure direct_paragraphs={d} sections_without_direct_paragraph={d} paragraphs_without_direct_run={d} non_direct_runs={d}\n", .{ direct_paragraphs, sections_without_direct_paragraph, paragraphs_without_direct_run, non_direct_runs });
    for (inline_counts, 0..) |count, index| std.debug.print("HWPX text inline {s}={d}\n", .{ @tagName(@as(package.SectionTextInlineKind, @enumFromInt(index))), count });
    std.debug.print("HWPX ancillary XML content chunks={d}\n", .{non_text_content_chunks});
    for (other_content_counts, 0..) |count, index| std.debug.print("HWPX ancillary {s}={d}\n", .{ @tagName(@as(package.SectionOtherContentKind, @enumFromInt(index))), count });
    try std.testing.expectEqual(@as(usize, 476), accepted);
    try std.testing.expectEqual(@as(usize, 6), rejected_zip);
    try std.testing.expectEqual(@as(usize, 2), encrypted);
    try std.testing.expectEqual(@as(usize, 544), sections);
    try std.testing.expectEqual(@as(usize, 76920), direct_paragraphs);
    try std.testing.expectEqual(@as(usize, 0), sections_without_direct_paragraph);
    try std.testing.expectEqual(@as(usize, 1), paragraphs_without_direct_run);
    try std.testing.expectEqual(@as(usize, 0), non_direct_runs);
    try std.testing.expectEqual(@as(usize, 215146), paragraphs);
    try std.testing.expectEqual(@as(usize, 267347), runs);
    try std.testing.expectEqual(@as(usize, 230677), text_elements);
    try std.testing.expectEqual(@as(usize, 14607), empty_text_elements);
    try std.testing.expectEqual(@as(usize, 7975957), text_bytes);
    const expected_inline = [_]usize{ 7582, 2981, 1398, 2852, 367, 27, 31, 17, 0 };
    try std.testing.expectEqualSlices(usize, &expected_inline, &inline_counts);
    const expected_other = [_]usize{ 23227, 1833, 1687, 400, 12, 4, 3, 1, 1, 0 };
    try std.testing.expectEqualSlices(usize, &expected_other, &other_content_counts);
    try std.testing.expectEqual(@as(usize, 27168), non_text_content_chunks);
    try std.testing.expectEqual(@as(usize, 1), issues);
}

test "HWPX layout-only paragraph keeps its real section diagnostic" {
    const a = std.testing.allocator;
    const path = "reference/rhwp/samples/hwpx/opengov/36386761_백제학연구총서위탁판매의뢰목록.hwpx";
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(25_000_000));
    defer a.free(bytes);
    var document = try package.inspectDocument(a, bytes, .{});
    defer document.deinit(a);
    const Capture = struct {
        allocator: std.mem.Allocator,
        ordinals: [64]usize = undefined,
        has_run: [64]bool = @splat(false),
        count: usize = 0,
        fn onEvent(raw: *anyopaque, event: package.SectionTextEvent) anyerror!void {
            const self: *@This() = @ptrCast(@alignCast(raw));
            switch (event) {
                .paragraph_start => |paragraph| {
                    const id = try hwpx_attrs.attribute(self.allocator, paragraph.tag, paragraph.scope, "id", 64);
                    defer if (id) |owned| self.allocator.free(owned);
                    if (id) |owned| if (std.mem.eql(u8, owned, "2147483648")) {
                        if (self.count == self.ordinals.len) return error.TestCapacity;
                        self.ordinals[self.count] = paragraph.location.paragraph_ordinal;
                        self.count += 1;
                    };
                },
                .run_start => |run| {
                    for (self.ordinals[0..self.count], 0..) |ordinal, index| {
                        if (ordinal == run.location.paragraph_ordinal) self.has_run[index] = true;
                    }
                },
                else => {},
            }
        }
    };
    var capture: Capture = .{ .allocator = a };
    const report = try document.inspectSectionText(a, .{}, .{ .context = &capture, .on_event = Capture.onEvent });
    try std.testing.expectEqual(@as(usize, 22), capture.count);
    var matching_without_run: usize = 0;
    for (capture.has_run[0..capture.count]) |has_run| if (!has_run) {
        matching_without_run += 1;
    };
    try std.testing.expectEqual(@as(usize, 1), matching_without_run);
    try std.testing.expectEqual(@as(usize, 1), report.paragraphs_without_direct_run);
    try std.testing.expectEqual(@as(usize, 0), report.sections_without_direct_paragraph);
    try std.testing.expectEqual(@as(usize, 0), report.non_direct_runs);
    try std.testing.expectEqual(@as(usize, 1), report.issues());
}

fn surveySectionTreeShard(shard: usize) !void {
    const a = std.testing.allocator;
    const roots = [_][]const u8{ "legacy/rust/crates/hwp-core/tests/fixtures", "reference/rhwp/samples" };
    var accepted: usize = 0;
    var rejected_zip: usize = 0;
    var encrypted: usize = 0;
    var sections: usize = 0;
    var elements: usize = 0;
    for (roots, 0..) |root, root_index| {
        const dir = try std.Io.Dir.cwd().openDir(std.testing.io, root, .{ .iterate = true });
        defer dir.close(std.testing.io);
        var walker = try dir.walk(a);
        defer walker.deinit();
        while (try walker.next(std.testing.io)) |entry| {
            if (entry.kind != .file or !std.mem.endsWith(u8, entry.path, ".hwpx")) continue;
            var path_sum: usize = root_index;
            for (entry.path) |byte| path_sum += byte;
            if (path_sum % 8 != shard) continue;
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
                std.debug.print("HWPX tree unexpected path={s} error={s}\n", .{ entry.path, @errorName(err) });
                return err;
            };
            defer structure.deinit(a);
            accepted += 1;
            for (structure.sections, 0..) |section_meta, ordinal| {
                var parsed = try document.readSectionTree(a, ordinal, .{});
                defer parsed.deinit(a);
                try std.testing.expectEqual(ordinal, parsed.section_ordinal);
                try std.testing.expectEqual(section_meta.item_index, parsed.item_index);
                try std.testing.expectEqual(section_meta.xml_bytes, parsed.source.len);
                try std.testing.expectEqual(section_meta.elements, parsed.elements.len);
                try std.testing.expectEqual(parsed.xml_report.elements, parsed.elements.len);
                try std.testing.expect(parsed.elements[0].is("http://www.hancom.co.kr/hwpml/2011/section", "sec"));
                var child_edges: usize = 0;
                var linked_children: usize = 0;
                for (parsed.elements, 0..) |node, index| {
                    try std.testing.expect(node.start_tag.start < node.start_tag.end);
                    try std.testing.expect(node.start_tag.end <= node.end and node.end <= parsed.source.len);
                    if (node.end_tag) |closing| {
                        try std.testing.expect(node.start_tag.end <= closing.start and closing.start < closing.end and closing.end == node.end);
                    } else try std.testing.expectEqual(node.start_tag.end, node.end);
                    if (node.parent) |parent_index| {
                        child_edges += 1;
                        try std.testing.expect(parent_index < index);
                        const parent = parsed.elements[parent_index];
                        try std.testing.expect(parent.start_tag.end <= node.start_tag.start and node.end <= parent.end);
                    } else try std.testing.expectEqual(@as(usize, 0), index);
                    if (node.first_child) |first| {
                        try std.testing.expect(first > index and first < parsed.elements.len);
                        try std.testing.expectEqual(@as(?usize, index), parsed.elements[first].parent);
                    } else try std.testing.expect(node.last_child == null);
                    if (node.next_sibling) |next| {
                        try std.testing.expect(next > index and next < parsed.elements.len);
                        try std.testing.expectEqual(node.parent, parsed.elements[next].parent);
                        try std.testing.expect(node.end <= parsed.elements[next].start_tag.start);
                    }
                    var cursor = node.first_child;
                    var final_child: ?usize = null;
                    while (cursor) |child| {
                        try std.testing.expect(child > index and child < parsed.elements.len);
                        try std.testing.expectEqual(@as(?usize, index), parsed.elements[child].parent);
                        linked_children += 1;
                        final_child = child;
                        cursor = parsed.elements[child].next_sibling;
                    }
                    try std.testing.expectEqual(node.last_child, final_child);
                }
                try std.testing.expectEqual(parsed.elements.len - 1, child_edges);
                try std.testing.expectEqual(child_edges, linked_children);
                sections += 1;
                elements += parsed.elements.len;
            }
        }
    }
    std.debug.print("HWPX section tree shard={d} accepted={d} rejected_zip={d} encrypted={d} sections={d} elements={d}\n", .{ shard, accepted, rejected_zip, encrypted, sections, elements });
    const expected_accepted = [_]usize{ 64, 68, 56, 49, 61, 59, 58, 61 };
    const expected_rejected_zip = [_]usize{ 1, 3, 0, 2, 0, 0, 0, 0 };
    const expected_encrypted = [_]usize{ 0, 0, 0, 0, 2, 0, 0, 0 };
    const expected_sections = [_]usize{ 75, 72, 72, 53, 64, 62, 63, 83 };
    const expected_elements = [_]usize{ 299906, 229744, 218284, 124064, 356522, 297849, 252376, 395971 };
    try std.testing.expectEqual(expected_accepted[shard], accepted);
    try std.testing.expectEqual(expected_rejected_zip[shard], rejected_zip);
    try std.testing.expectEqual(expected_encrypted[shard], encrypted);
    try std.testing.expectEqual(expected_sections[shard], sections);
    try std.testing.expectEqual(expected_elements[shard], elements);
}

test "HWPX corpus section tree shard 0" {
    try surveySectionTreeShard(0);
}
test "HWPX corpus section tree shard 1" {
    try surveySectionTreeShard(1);
}
test "HWPX corpus section tree shard 2" {
    try surveySectionTreeShard(2);
}
test "HWPX corpus section tree shard 3" {
    try surveySectionTreeShard(3);
}
test "HWPX corpus section tree shard 4" {
    try surveySectionTreeShard(4);
}
test "HWPX corpus section tree shard 5" {
    try surveySectionTreeShard(5);
}
test "HWPX corpus section tree shard 6" {
    try surveySectionTreeShard(6);
}
test "HWPX corpus section tree shard 7" {
    try surveySectionTreeShard(7);
}

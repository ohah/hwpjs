const std = @import("std");
const editor = @import("editor_session.zig");
const cp = @import("editor_checkpoint.zig");
const source_basis = @import("section_source_basis.zig");
const fixture = @import("test_formula_fixture.zig");
const old_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='1'><p:run><p:t>old</p:t></p:run></p:p></s:sec>";
const new_xml = "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph'><p:p id='2'><p:run><p:t>inserted</p:t></p:run></p:p><p:p id='1'><p:run><p:t>old!</p:t></p:run></p:p></s:sec>";
fn install(s: *editor.Session) !void {
    const original = &s.sections[0];
    var prepared = try source_basis.prepare(s.allocator, new_xml, 0, original.tree.item_index, original.first_paragraph, s.options);
    var transferred = false;
    defer if (!transferred) prepared.deinit(s.allocator);
    var section: editor.Section = .{ .original_basis = original.original_basis, .owned_rebased_basis = prepared.basis, .tree = prepared.basis.tree, .sites = prepared.sites, .locations = prepared.basis.locations, .entry_index = original.entry_index, .first_paragraph = prepared.basis.first_paragraph, .source_first_paragraph = prepared.basis.first_paragraph, .last_paragraph = prepared.basis.last_paragraph };
    const tree_source = original.tree.source.ptr;
    const locations = original.locations.ptr;
    const sites = original.sites.items.ptr;
    s.installSectionSourceBasis(0, &section) catch |err| {
        try std.testing.expect(s.sections[0].tree.source.ptr == tree_source);
        try std.testing.expect(s.sections[0].locations.ptr == locations);
        try std.testing.expect(s.sections[0].sites.items.ptr == sites);
        return err;
    };
    transferred = true;
}
fn roundtrip(a: std.mem.Allocator, input: []const u8) !void {
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const source_ptr = s.source.ptr;
    const original = s.sections[0].original_basis.?;
    try std.testing.expect(try s.splice(0, 1, 3, 0, "!"));
    var before = try cp.capture(&s, 1_000_000);
    defer before.deinit();
    try std.testing.expect(before.states[0].owned_rebased_basis == null);
    var context: @import("formatting_batch_context.zig").Context = .{};
    try s.beginFormattingBatch(&context);
    defer s.endFormattingBatch(&context);
    try context.original_ids.put(a, 7, {});
    const cache: @import("paragraph_query_cache.zig").Cache = .{ .owner = &s.sections[0], .paragraphs = &.{}, .mutation_serial = &s.mutation_serial, .captured_serial = s.mutation_serial };
    s.sections[0].paragraph_query_cache = &cache;
    try install(&s);
    try std.testing.expect(s.sections[0].paragraph_query_cache == null);
    try std.testing.expectEqual(@as(usize, 0), context.original_ids.count());
    try std.testing.expect(s.source_fields == null);
    try std.testing.expect(try s.splice(0, 2, 4, 0, "after😀"));
    const saved = try s.save();
    defer a.free(saved);
    var after = try cp.capture(&s, 1_000_000);
    defer after.deinit();
    try std.testing.expect(try cp.matches(&after, &s, 1_000_000));
    try std.testing.expect(after.states[0].owned_rebased_basis.?.tree.source.ptr != s.sections[0].tree.source.ptr);
    // Reject source alias tampering before changing either owner.
    const tree = s.sections[0].tree;
    s.sections[0].tree = original.tree;
    try std.testing.expectError(error.SourceBindingMismatch, before.exchange(&s));
    s.sections[0].tree = tree;
    const seal = before.states[0].source_first_paragraph;
    before.states[0].source_first_paragraph = 99;
    try std.testing.expectError(error.SourceBindingMismatch, before.exchange(&s));
    before.states[0].source_first_paragraph = seal;
    try before.exchange(&s);
    try std.testing.expect(s.sections[0].tree.source.ptr == original.tree.source.ptr);
    try std.testing.expect(s.sections[0].locations.ptr == original.locations.ptr);
    try std.testing.expectEqual(@as(usize, 1), s.sections[0].first_paragraph);
    try std.testing.expectEqual(@as(usize, 1), s.sections[0].last_paragraph);
    try std.testing.expectEqual(@as(?usize, 1), s.sections[0].source_first_paragraph);
    try std.testing.expectEqualStrings("old!", s.sections[0].sites.items[0].text);
    try std.testing.expect(s.source.ptr == source_ptr);
    try std.testing.expectEqualSlices(u8, input, s.source);
    try before.exchange(&s);
    try std.testing.expectEqualStrings("old!after😀", s.sections[0].sites.items[1].text);
    const redone = try s.save();
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, saved, redone);
    // Retained snapshots clone back into the parent allocator, never swap Meter allocations.
    var parent = try cp.cloneForRestore(&after, &s, 1_000_000);
    defer parent.deinit();
    try parent.exchange(&s);
    try std.testing.expect(try cp.matches(&after, &s, 1_000_000));
    const budget = try cp.size(&s, 1_000_000);
    try std.testing.expectError(error.LimitExceeded, cp.capture(&s, budget - 1));
    var exact = try cp.capture(&s, budget);
    defer exact.deinit();
}
test "section source basis synthetic checkpoint undo redo and allocation failure cleanup" {
    const a = std.testing.allocator;
    const input = try fixture.zipWithSection(a, old_xml);
    defer a.free(input);
    try roundtrip(a, input);
    try @import("../testing/allocation_failures.zig").check(roundtrip, .{input});
}
test "section source basis foreign owner rejects same raw source binding and exact Meter budget" {
    const a = std.testing.allocator;
    const input = try fixture.zipWithSection(a, old_xml);
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    var other = try editor.open(a, input, .{});
    defer other.deinit();
    var before = try cp.capture(&s, 1_000_000);
    defer before.deinit();
    var forged = other;
    forged.source = s.source;
    try std.testing.expectError(error.SourceBindingMismatch, before.exchange(&forged));
    try std.testing.expectError(error.SourceBindingMismatch, cp.cloneForRestore(&before, &forged, 1_000_000));
    try install(&s);
    const Owner = @import("history_checkpoint_owner.zig").CheckpointOwner;
    const owner = try Owner.create(a, &s, 1_000_000, 1_000_000);
    const exact = owner.ownedBytes();
    owner.deinit();
    const bounded = try Owner.create(a, &s, exact, 1_000_000);
    defer bounded.deinit();
    try std.testing.expectEqual(exact, bounded.ownedBytes());
    try std.testing.expectError(error.HistoryEntryOwnedLimitExceeded, Owner.create(a, &s, exact - 1, 1_000_000));
    try std.testing.expectError(error.SourceBindingMismatch, bounded.value.exchange(&s));
    var parent = try cp.cloneForRestore(&bounded.value, &s, 1_000_000);
    defer parent.deinit();
    try parent.exchange(&s);
    // Digest catches mutation of owned XML before restore; put it back for cleanup.
    const old = bounded.value.states[0].owned_rebased_basis.?.tree.source[0];
    bounded.value.states[0].owned_rebased_basis.?.tree.source[0] = '!';
    try std.testing.expectError(error.SourceBindingMismatch, cp.cloneForRestore(&bounded.value, &s, 1_000_000));
    bounded.value.states[0].owned_rebased_basis.?.tree.source[0] = old;
}
test "section source basis managed suffix delta keeps original borrowed basis" {
    const a = std.testing.allocator;
    const input = try fixture.zipWithSection(a, old_xml);
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    s.history_delta_managed = true;
    const original = s.sections[0].original_basis.?;
    var h = try @import("editor_history.zig").History.initV2(&s, .{});
    defer h.deinit();
    const captures = h.owned.?.counters.capture;
    // A deliberately invalid receipt proves suffix apply/undo/redo never call
    // source-basis validation (and therefore never hash immutable source).
    const seal = original.seal;
    original.seal ^= 1;
    defer original.seal = seal;
    try std.testing.expect(try h.apply(&s, .{ .paragraph = 1, .start = 3, .deleted = 0, .inserted = "!" }));
    try std.testing.expectEqual(@as(usize, 1), h.owned.?.counters.delta);
    try std.testing.expectEqual(captures, h.owned.?.counters.capture);
    try std.testing.expect(s.sections[0].original_basis == original);
    try std.testing.expect(s.sections[0].owned_rebased_basis == null);
    try std.testing.expect(try h.undo(&s));
    try std.testing.expect(try h.redo(&s));
}

test "section source basis later section global coordinates restore with their original locations" {
    const a = std.testing.allocator;
    const zip = @import("test_package_fixture.zig");
    const input = try zip.storedZip(a, &.{
        .{ .name = "mimetype", .data = @import("package.zig").mime },
        .{ .name = "META-INF/container.xml", .data = zip.package_container },
        .{ .name = "Contents/content.hpf", .data = "<o:package xmlns:o='http://www.idpf.org/2007/opf/'><o:manifest><o:item id='h' href='Contents/header.xml' media-type='application/xml'/><o:item id='s' href='Contents/section0.xml' media-type='application/xml'/><o:item id='s1' href='Contents/section1.xml' media-type='application/xml'/></o:manifest><o:spine><o:itemref idref='h'/><o:itemref idref='s'/><o:itemref idref='s1'/></o:spine></o:package>" },
        .{ .name = "Contents/header.xml", .data = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' secCnt='2'/>" },
        .{ .name = "Contents/section0.xml", .data = old_xml },
        .{ .name = "Contents/section1.xml", .data = old_xml },
    });
    defer a.free(input);
    var s = try editor.open(a, input, .{});
    defer s.deinit();
    const locations = s.sections[1].locations;
    var before = try cp.capture(&s, 1_000_000);
    defer before.deinit();
    try install(&s);
    try std.testing.expectEqual(@as(usize, 3), s.sections[1].first_paragraph);
    try std.testing.expectEqual(@as(?usize, 2), s.sections[1].source_first_paragraph);
    try std.testing.expect(s.sections[1].locations.ptr == locations.ptr);
    try std.testing.expect(try s.splice(1, 3, 3, 0, "later"));
    try before.exchange(&s);
    try std.testing.expectEqual(@as(usize, 2), s.sections[1].first_paragraph);
    try std.testing.expectEqual(@as(usize, 2), s.sections[1].last_paragraph);
    try std.testing.expectEqualStrings("old", s.sections[1].sites.items[0].text);
    try before.exchange(&s);
    try std.testing.expectEqual(@as(usize, 3), s.sections[1].first_paragraph);
    try std.testing.expectEqualStrings("oldlater", s.sections[1].sites.items[0].text);
    try std.testing.expect(s.sections[1].locations.ptr == locations.ptr);
}

test "section source basis canonical seal hashes long shared URI once and clones without address identity" {
    const a = std.testing.allocator;
    var previous_bytes: usize = 0;
    var previous_old_uri_bytes: usize = 0;
    inline for (.{ @as(usize, 1024), @as(usize, 2048) }) |scale| {
        var xml: std.ArrayList(u8) = .empty;
        defer xml.deinit(a);
        try xml.appendSlice(a, "<s:sec xmlns:s='http://www.hancom.co.kr/hwpml/2011/section' xmlns:p='http://www.hancom.co.kr/hwpml/2011/paragraph' xmlns:x='urn:");
        try xml.appendNTimes(a, 'a', scale * 4);
        try xml.appendSlice(a, "'><p:p><p:run><p:t>text</p:t></p:run></p:p>");
        for (0..scale) |_| try xml.appendSlice(a, "<x:n/>");
        try xml.appendSlice(a, "</s:sec>");
        var prepared = try source_basis.prepare(a, xml.items, 0, 0, 1, .{});
        defer prepared.deinit(a);
        const work = try prepared.basis.sealWork();
        var unique_uri_bytes: usize = 0;
        for (prepared.basis.tree.uris) |uri| unique_uri_bytes += uri.len;
        var old_uri_bytes: usize = 0;
        for (prepared.basis.tree.elements) |element| old_uri_bytes += element.name.uri.len;
        try std.testing.expectEqual(xml.items.len, work.source_bytes);
        try std.testing.expectEqual(unique_uri_bytes, work.uri_bytes);
        try std.testing.expectEqual(prepared.basis.tree.elements.len, work.elements);
        try std.testing.expectEqual(prepared.basis.locations.len, work.locations);
        try std.testing.expect(old_uri_bytes > 100 * work.uri_bytes);
        const bytes = work.source_bytes + work.uri_bytes;
        if (previous_bytes != 0) {
            try std.testing.expect(bytes <= previous_bytes * 2);
            try std.testing.expect(old_uri_bytes > previous_old_uri_bytes * 3);
        }
        previous_bytes = bytes;
        previous_old_uri_bytes = old_uri_bytes;
        var copy = try prepared.basis.clone(a);
        defer copy.deinit(a);
        try copy.validate();
        try std.testing.expectEqual(prepared.basis.seal, copy.seal);
        try std.testing.expect(try prepared.basis.equal(&copy));
        try std.testing.expect(prepared.basis.tree.source.ptr != copy.tree.source.ptr);
        const old = copy.uri_indices[0];
        copy.uri_indices[0] = std.math.maxInt(usize);
        try std.testing.expectError(error.SourceBindingMismatch, copy.validate());
        copy.uri_indices[0] = old;
    }
}

const std = @import("std");
const editor = @import("editor_session.zig");
const analysis = @import("source_field_analysis.zig");
const xml = @import("document_xml.zig");

test "document text field metadata boundary selected fieldBegin descendant is never exterior text" {
    const a = std.testing.allocator;
    const fixture = @embedFile("test_fixtures/document_text_field_metadata_boundary.xml");
    const bytes = try @import("document_text_test_fixture.zig").inputWithSection(a, fixture);
    defer a.free(bytes);
    var session = try editor.open(a, bytes, .{});
    defer session.deinit();
    session.history_delta_managed = true;
    var history = try @import("editor_history.zig").History.initV2(&session, .{ .max_entries = 8 });
    defer history.deinit();
    var lifetime: @import("../model/formatting_binding.zig").State = .{ .epoch = 7, .opened = true };
    const name = try lifetime.session(a);
    defer a.free(name);
    const revision = history.revision();
    const serial = session.mutation_serial;
    const before = try session.save();
    defer a.free(before);
    // The original inactive id7 still makes the raw graph ambiguous. The
    // selected graph itself must be valid before exercising writer admission.
    try @import("test_expect_owned_error.zig").expect(a, error.InvalidFieldLinks, analysis.leaseForExterior(&session));
    var selected = try analysis.selectedForExterior(&session);
    defer selected.deinit(a);
    try std.testing.expectEqual(@as(usize, 1), selected.fields.len);
    try std.testing.expectEqual(@as(usize, 0), selected.report.duplicate_begin_ids);
    var observed = try @import("document_text_snapshot.zig").observe(a, &session, lifetime, revision);
    defer observed.deinit();
    var metadata_rows: usize = 0;
    for (observed.snapshot.rows.items) |row| {
        try std.testing.expect(std.mem.indexOf(u8, row.text, "DECOY") == null);
        if (!std.mem.eql(u8, row.text, "FIELD_METADATA")) continue;
        metadata_rows += 1;
        try std.testing.expect(row.source == .paragraph);
    }
    try std.testing.expectEqual(@as(usize, 1), metadata_rows);
    // Prove the actual text site's physical ancestor. XML id attributes and
    // display ordinals never stand in for source ownership in this test.
    var owned_sites: usize = 0;
    const tree = &session.sections[0].tree;
    for (session.sections[0].sites.items) |site| {
        if (!std.mem.eql(u8, site.text, "FIELD_METADATA")) continue;
        var node: ?usize = site.element_index;
        var owning_field: ?usize = null;
        while (node) |at| {
            if (tree.elements[at].is(xml.paragraph_uri, "fieldBegin")) {
                owning_field = at;
                break;
            }
            node = tree.elements[at].parent;
        }
        const owner = owning_field orelse return error.MissingFieldMetadataOwner;
        try std.testing.expectEqual(selected.report.markers[selected.fields[0].begin_marker].element_index, owner);
        owned_sites += 1;
    }
    try std.testing.expectEqual(@as(usize, 1), owned_sites);
    const service: @import("document_replace_all.zig").Service = .{ .session = &session, .history = &history, .lifetime = &lifetime };
    std.debug.print("SEARCH_METADATA_BOUNDARY stage=preconditions-complete\n", .{});
    var rejected: ?anyerror = null;
    const changed = service.apply(a, .{ .binding = .{ .session = name, .revision = revision }, .query = "FIELD_METADATA", .replacement = "UNAUTHORIZED" }) catch |err| result: {
        rejected = err;
        break :result false;
    };
    const after = try session.save();
    defer a.free(after);
    // Emit actual observations before asserting so an unexpected success keeps
    // its outcome and atomicity evidence rather than merely an expected-error failure.
    std.debug.print("SEARCH_METADATA_BOUNDARY apply_error={s} changed={} same_history={} same_serial={} same_saved_bytes={}\n", .{
        if (rejected) |err| @errorName(err) else "none",
        changed,
        revision == history.revision(),
        serial == session.mutation_serial,
        std.mem.eql(u8, before, after),
    });
    try std.testing.expect(rejected != null);
    try std.testing.expect(rejected.? == error.ProtectedFieldRange);
    try std.testing.expect(!changed);
    try std.testing.expectEqual(revision, history.revision());
    try std.testing.expectEqual(serial, session.mutation_serial);
    try std.testing.expectEqualSlices(u8, before, after);
}

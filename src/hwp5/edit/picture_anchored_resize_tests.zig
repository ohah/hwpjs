//! Prepared Native-only anchored picture cohort. No runtime result is claimed by source preparation.
const std = @import("std");
const a = std.testing.allocator;
const anchored = @import("picture_anchored_resize.zig");
const Session = @import("style_preservation.zig").Session;
const History = @import("editor_history.zig").History;
const Source = @import("../text_source.zig").Source;
const anchors = [_]anchored.Anchor{ .top_left, .top_center, .top_right, .center_left, .center_right, .bottom_left, .bottom_center, .bottom_right };
const fixed = [_][2]i64{ .{ 0, 0 }, .{ 1, 0 }, .{ 2, 0 }, .{ 0, 1 }, .{ 2, 1 }, .{ 0, 2 }, .{ 1, 2 }, .{ 2, 2 } };
fn fixture() ![]u8 {
    const original = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "apps/docs/docs/public/editor/fixtures/picture-resize.hwp", a, .limited(8_000_000));
    defer a.free(original);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(original, &digest, .{});
    try std.testing.expectEqualStrings("6b2010227e9d6cd41c242e0a29281eddb58f8f618c5df137c4ca3d518665dda2", &std.fmt.bytesToHex(digest, .lower));
    const floating = try @import("object_outer_margins_fixture.zig").prepare(a, original, .picture, 0);
    defer a.free(floating);
    return rewriteFixture(floating, (4 << 15) | (2 << 18) | (1 << 3) | (1 << 8) | (1 << 14));
}
fn rewriteFixture(bytes: []const u8, flags: u32) ![]u8 {
    var source = try Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const pictures = try @import("picture_sources.zig").read(a, raw, source.header.version(), .base73);
    defer a.free(pictures);
    try std.testing.expectEqual(@as(usize, 1), pictures.len);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const root = try @import("picture_size_protection.zig").rootOwner(tree, pictures[0].picture_node);
    const record = tree.nodes[root].record.framing;
    const at = record.offset + record.raw.len - record.payload.len;
    std.mem.writeInt(u32, raw[at + 4 ..][0..4], flags, .little);
    std.mem.writeInt(i32, raw[at + 8 ..][0..4], 1500, .little);
    const encoded = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, raw, 32 * 1024 * 1024) else try a.dupe(u8, raw);
    defer a.free(encoded);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", encoded, .{ .max_output_bytes = 64 * 1024 * 1024 });
}
fn observe(s: *const Session) !anchored.Observation {
    const pictures = try s.pictureSources(a, 0, .base73);
    defer a.free(pictures);
    try std.testing.expectEqual(@as(usize, 1), pictures.len);
    return s.anchoredPictureGeometry(.{ .section = 0, .kind = .picture, .node = @intCast(pictures[0].picture_node) });
}
fn request(observed: anchored.Observation, anchor: anchored.Anchor) anchored.Request {
    return .{ .target = observed.target, .expected = observed.frame, .width = 9000, .height = 4500, .anchor = anchor };
}
fn point(frame: anchored.Frame, fraction: [2]i64) [2]i64 {
    return .{ @as(i64, frame.horizontalOffset) * 2 + @as(i64, frame.width) * fraction[0], @as(i64, frame.verticalOffset) * 2 + @as(i64, frame.height) * fraction[1] };
}
fn compareStreams(before: []const u8, after: []const u8) !void {
    var x = try Source.open(a, before);
    defer x.deinit();
    var y = try Source.open(a, after);
    defer y.deinit();
    var count: usize = 0;
    for (x.file.entries, 0..) |entry, index| if (entry.kind == 2) {
        const path = try x.file.rootRelativePath(index);
        if (!std.mem.eql(u8, path, "/BodyText/Section0")) try std.testing.expectEqualSlices(u8, entry.content, try y.file.readStream(a, path));
        count += 1;
    };
    var actual: usize = 0;
    for (y.file.entries) |entry| if (entry.kind == 2) {
        actual += 1;
    };
    try std.testing.expectEqual(count, actual);
}

test "H5 anchored picture eight fixed points exact signed offsets and side center refusal" {
    const before: anchored.Frame = .{ .width = 7200, .height = 3600, .horizontalOffset = 7200, .verticalOffset = 1500, .treatAsCharacter = false };
    for (anchors, fixed) |anchor, fraction| {
        for ([_][2]u32{ .{ 9000, 4500 }, .{ 6000, 3000 }, .{ 7200, 3600 }, .{ 7200, 4500 }, .{ 9000, 3600 } }) |size| {
            const next = try anchored.after(before, size[0], size[1], anchor);
            try std.testing.expectEqualDeep(point(before, fraction), point(next, fraction));
        }
    }
    try std.testing.expectError(error.UnrepresentableAnchoredPictureOffset, anchored.after(before, 9001, 4500, .top_center));
    try std.testing.expectError(error.UnrepresentableAnchoredPictureOffset, anchored.after(before, 9000, 4501, .center_left));
    try std.testing.expectError(error.InvalidAnchoredPictureSize, anchored.after(before, 0, 4500, .top_left));
    var boundary = before;
    boundary.horizontalOffset = std.math.minInt(i32);
    try std.testing.expectError(error.AnchoredPictureOffsetOverflow, anchored.after(boundary, 9000, 4500, .top_right));
    boundary.horizontalOffset = std.math.maxInt(i32);
    try std.testing.expectError(error.AnchoredPictureOffsetOverflow, anchored.after(boundary, 6000, 3600, .top_right));
    const unchanged_x = try anchored.after(boundary, 7200, 4500, .top_right);
    try std.testing.expectEqual(boundary.horizontalOffset, unchanged_x.horizontalOffset);
    boundary = before;
    boundary.verticalOffset = std.math.minInt(i32);
    try std.testing.expectError(error.AnchoredPictureOffsetOverflow, anchored.after(boundary, 7200, 4500, .bottom_left));
    boundary.verticalOffset = std.math.maxInt(i32);
    try std.testing.expectError(error.AnchoredPictureOffsetOverflow, anchored.after(boundary, 7200, 3000, .bottom_left));
}

test "H5 anchored picture eight Native single transactions save reopen undo redo preserve source streams" {
    const bytes = try fixture();
    defer a.free(bytes);
    for (anchors, fixed) |anchor, fraction| {
        const s = try Session.open(a, bytes);
        defer s.close();
        s.enableHistoryDelta();
        var h = try History.initV2(a, s, .{});
        defer h.deinit();
        const baseline = try s.save(a, .{ .allow_stale_layout = true });
        defer a.free(baseline.bytes);
        const before = try observe(s);
        try std.testing.expect(try h.apply(s, .{ .resize_picture_anchored = request(before, anchor) }));
        try std.testing.expectEqual(@as(u32, 1), h.revision());
        const current = try observe(s);
        try std.testing.expectEqualDeep(point(before.frame, fraction), point(current.frame, fraction));
        const saved = try s.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        try compareStreams(baseline.bytes, saved.bytes);
        const reopened = try Session.open(a, saved.bytes);
        defer reopened.close();
        reopened.enableHistoryDelta();
        try std.testing.expectEqualDeep(current.frame, (try observe(reopened)).frame);
        try std.testing.expect(try h.undo(s));
        const undo = try s.save(a, .{ .allow_stale_layout = true });
        defer a.free(undo.bytes);
        try std.testing.expectEqualSlices(u8, baseline.bytes, undo.bytes);
        try std.testing.expect(try h.redo(s));
        const redo = try s.save(a, .{ .allow_stale_layout = true });
        defer a.free(redo.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, redo.bytes);
    }
}

test "H5 anchored picture selected legacy intent is absorbed and other intent values remain owned" {
    const bytes = try fixture();
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const initial = try observe(s);
    try std.testing.expect(try h.apply(s, .{ .resize_picture = .{ .section = 0, .picture_node = initial.target.selector.node, .width = 10000, .height = 6000 } }));
    const prior = try observe(s);
    try std.testing.expectEqual(@as(u32, 10000), prior.frame.width);
    const saved_prior = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved_prior.bytes);
    try std.testing.expect(try h.apply(s, .{ .resize_picture_anchored = request(prior, .bottom_right) }));
    const current = try observe(s);
    try std.testing.expectEqualDeep(point(prior.frame, .{ 2, 2 }), point(current.frame, .{ 2, 2 }));
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try Session.open(a, saved.bytes);
    defer reopened.close();
    reopened.enableHistoryDelta();
    try std.testing.expectEqualDeep(current.frame, (try observe(reopened)).frame);
    try std.testing.expect(try h.undo(s));
    const undo = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undo.bytes);
    try std.testing.expectEqualSlices(u8, saved_prior.bytes, undo.bytes);
    const pending = [_]@import("../../model/document.zig").PictureCurrentSize{ .{ .source_picture_node = 1, .width = 5, .height = 6 }, .{ .source_picture_node = 2, .width = 7, .height = 8 } };
    var paragraphs: [0]@import("../../model/document.zig").Paragraph = .{};
    const rest = (try anchored.withoutSelected(a, .{ .paragraphs = &paragraphs, .source_record_count = 3, .picture_current_sizes = @constCast(&pending) }, 1)).?;
    defer a.free(rest);
    try std.testing.expectEqualDeep(pending[1], rest[0]);
}

test "H5 anchored picture stale foreign wrong expected noop and prior redo stay fenced" {
    const bytes = try fixture();
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const before = try observe(s);
    var wrong = request(before, .bottom_right);
    wrong.expected.horizontalOffset += 1;
    try std.testing.expectError(error.StaleAnchoredPictureTarget, h.apply(s, .{ .resize_picture_anchored = wrong }));
    const fresh = try observe(s);
    try std.testing.expect(try h.apply(s, .{ .resize_picture_anchored = request(fresh, .bottom_right) }));
    try std.testing.expect(try h.undo(s));
    try std.testing.expectError(error.StaleMutationEpoch, h.apply(s, .{ .resize_picture_anchored = request(before, .bottom_right) }));
    const now = try observe(s);
    var noop = request(now, .bottom_right);
    noop.width = now.frame.width;
    noop.height = now.frame.height;
    const redo_count = h.stats().redoCount;
    try std.testing.expect(!try h.apply(s, .{ .resize_picture_anchored = noop }));
    try std.testing.expectEqual(redo_count, h.stats().redoCount);
    const other = try Session.open(a, bytes);
    defer other.close();
    other.enableHistoryDelta();
    var foreign = try History.initV2(a, other, .{});
    defer foreign.deinit();
    try std.testing.expectError(error.StaleMutationEpoch, foreign.apply(other, .{ .resize_picture_anchored = request(now, .bottom_right) }));
}

test "H5 anchored picture unsupported inline relative paragraph and overlap restrictions remain refused" {
    const bytes = try fixture();
    defer a.free(bytes);
    const profile: u32 = (4 << 15) | (2 << 18) | (1 << 3) | (1 << 8) | (1 << 14);
    for ([_]u32{ profile | 1, profile & ~@as(u32, 7 << 15), (profile & ~@as(u32, 3 << 3)) | (2 << 3), profile & ~@as(u32, 1 << 14), profile | (1 << 13) }) |flags| {
        const input = try rewriteFixture(bytes, flags);
        defer a.free(input);
        const s = try Session.open(a, input);
        defer s.close();
        s.enableHistoryDelta();
        if (observe(s)) |_| return error.UnexpectedAnchoredPictureProfile else |_| {}
        const unchanged = try s.save(a, .{ .allow_stale_layout = true });
        defer a.free(unchanged.bytes);
        try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
    }
}

test "H5 anchored picture complete allocation failures preserve a single atomic saved result" {
    const bytes = try fixture();
    defer a.free(bytes);
    // Normal allocator controls are separate from the exhaustive failing allocator.
    const normal = try Session.open(a, bytes);
    defer normal.close();
    normal.enableHistoryDelta();
    var history = try History.initV2(a, normal, .{});
    defer history.deinit();
    const before = try normal.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    try std.testing.expect(try history.apply(normal, .{ .resize_picture_anchored = request(try observe(normal), .bottom_right) }));
    const expected = try normal.save(a, .{ .allow_stale_layout = true });
    defer a.free(expected.bytes);
    try @import("../../testing/allocation_failures.zig").check(struct {
        fn run(allocator: std.mem.Allocator, input: []const u8, baseline: []const u8, expected_saved: []const u8) !void {
            const s = try Session.open(allocator, input);
            defer s.close();
            s.enableHistoryDelta();
            var h = try History.initV2(allocator, s, .{});
            defer h.deinit();
            const pictures = try s.pictureSources(allocator, 0, .base73);
            defer allocator.free(pictures);
            const observed = try s.anchoredPictureGeometry(.{ .section = 0, .kind = .picture, .node = @intCast(pictures[0].picture_node) });
            const changed = h.apply(s, .{ .resize_picture_anchored = request(observed, .bottom_right) }) catch |err| {
                const rollback = try s.save(std.testing.allocator, .{ .allow_stale_layout = true });
                defer std.testing.allocator.free(rollback.bytes);
                try std.testing.expectEqualSlices(u8, baseline, rollback.bytes);
                try std.testing.expectEqual(@as(u32, 0), h.revision());
                return err;
            };
            try std.testing.expect(changed);
            const current = try s.anchoredPictureGeometry(observed.target.selector);
            try std.testing.expectEqualDeep(point(observed.frame, .{ 2, 2 }), point(current.frame, .{ 2, 2 }));
            const saved = s.save(allocator, .{ .allow_stale_layout = true }) catch |err| {
                const committed = try s.save(std.testing.allocator, .{ .allow_stale_layout = true });
                defer std.testing.allocator.free(committed.bytes);
                try std.testing.expectEqualSlices(u8, expected_saved, committed.bytes);
                return err;
            };
            defer allocator.free(saved.bytes);
            try std.testing.expectEqualSlices(u8, expected_saved, saved.bytes);
            const reopened = try Session.open(allocator, saved.bytes);
            defer reopened.close();
            reopened.enableHistoryDelta();
            const restored = try reopened.anchoredPictureGeometry(current.target.selector);
            try std.testing.expectEqualDeep(current.frame, restored.frame);
        }
    }.run, .{ bytes, before.bytes, expected.bytes });
}

const FixtureMutation = enum { group, rotation, flip, local_offset, translation, mismatched_size };
fn transformedFixture(bytes: []const u8, change: FixtureMutation) ![]u8 {
    var source = try Source.open(a, bytes);
    defer source.deinit();
    const raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const pictures = try @import("picture_sources.zig").read(a, raw, source.header.version(), .base73);
    defer a.free(pictures);
    var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
    defer tree.deinit(a);
    const r = tree.nodes[pictures[0].component_node].record.framing;
    const at = r.offset + r.raw.len - r.payload.len;
    switch (change) {
        .group => std.mem.writeInt(u16, raw[at + 16 ..][0..2], 1, .little),
        .rotation => std.mem.writeInt(i16, raw[at + 40 ..][0..2], 1, .little),
        .flip => std.mem.writeInt(u32, raw[at + 36 ..][0..4], std.mem.readInt(u32, raw[at + 36 ..][0..4], .little) | 1, .little),
        .local_offset => std.mem.writeInt(i32, raw[at + 8 ..][0..4], 1, .little),
        .translation => std.mem.writeInt(u64, raw[at + 68 ..][0..8], @bitCast(@as(f64, 1)), .little),
        .mismatched_size => std.mem.writeInt(u32, raw[at + 28 ..][0..4], 1, .little),
    }
    const encoded = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, raw, 32 * 1024 * 1024) else try a.dupe(u8, raw);
    defer a.free(encoded);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", encoded, .{ .max_output_bytes = 64 * 1024 * 1024 });
}

test "H5 anchored picture rotation flip translated matrix and mismatched dimensions remain closed" {
    const bytes = try fixture();
    defer a.free(bytes);
    for ([_]FixtureMutation{ .group, .rotation, .flip, .local_offset, .translation, .mismatched_size }) |change| {
        const input = try transformedFixture(bytes, change);
        defer a.free(input);
        const s = try Session.open(a, input);
        defer s.close();
        s.enableHistoryDelta();
        try std.testing.expectError(if (change == .group) error.UnsupportedOuterMarginGroup else error.UnsupportedAnchoredPictureProfile, observe(s));
    }
}

test "H5 anchored picture forged physical owner and unmanaged writes refuse before publishing" {
    const bytes = try fixture();
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    try std.testing.expect(try h.apply(s, .{ .resize_picture_anchored = request(try observe(s), .bottom_right) }));
    try std.testing.expectError(error.LayoutReflowRequired, s.save(a, .{}));
    try std.testing.expect(try h.undo(s));
    const observed = try observe(s);
    const before_ticket = try s.historyTicket();
    const before_stats = h.stats();
    const before = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(before.bytes);
    const command: @import("style_preservation.zig").Command = .{ .resize_picture_anchored = request(observed, .bottom_right) };
    try std.testing.expectError(error.HistoryProtocol2Required, s.apply(command));
    try std.testing.expectError(error.HistoryProtocol2Required, s.applyWithFontCache(command, null));
    const checkpoint = try s.createCheckpoint(16 * 1024 * 1024);
    defer checkpoint.deinit();
    try std.testing.expectError(error.HistoryProtocol2Required, s.applyCheckpointed(checkpoint, 16 * 1024 * 1024, command));
    try std.testing.expectError(error.HistoryProtocol2Required, s.applyBatchCheckpointed(checkpoint, 16 * 1024 * 1024, &.{command}));
    try std.testing.expectEqualDeep(before_ticket, try s.historyTicket());
    try std.testing.expectEqualDeep(before_stats, h.stats());
    const unchanged = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, before.bytes, unchanged.bytes);
    var forged = request(try observe(s), .bottom_right);
    forged.target.control_node += 1;
    try std.testing.expectError(error.StaleAnchoredPictureTarget, h.apply(s, .{ .resize_picture_anchored = forged }));
    try std.testing.expectEqual(before_stats.revision, h.stats().revision);
    try std.testing.expectEqual(before_stats.redoCount, h.stats().redoCount);
    const other = try Session.open(a, bytes);
    defer other.close();
    other.enableHistoryDelta();
    var legacy = try History.init(a, other, 16, 16 * 1024 * 1024);
    defer legacy.deinit();
    const legacy_owner = try observe(other);
    try std.testing.expect(try legacy.apply(other, .{ .resize_picture = .{ .section = 0, .picture_node = legacy_owner.target.selector.node, .width = 10000, .height = 6000 } }));
    try std.testing.expect(try legacy.undo(other));
    const legacy_bytes_before = try other.save(a, .{ .allow_stale_layout = true });
    defer a.free(legacy_bytes_before.bytes);
    const legacy_before = legacy.stats();
    const legacy_ticket = try other.historyTicket();
    try std.testing.expectError(error.HistoryProtocol2Required, legacy.apply(other, .{ .resize_picture_anchored = request(try observe(other), .bottom_right) }));
    try std.testing.expectEqualDeep(legacy_before, legacy.stats());
    try std.testing.expectEqualDeep(legacy_ticket, try other.historyTicket());
    const legacy_bytes_after = try other.save(a, .{ .allow_stale_layout = true });
    defer a.free(legacy_bytes_after.bytes);
    try std.testing.expectEqualSlices(u8, legacy_bytes_before.bytes, legacy_bytes_after.bytes);
}

fn twoPicturesFixture() ![]u8 {
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp", a, .limited(8_000_000));
    defer a.free(input);
    var digest: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(input, &digest, .{});
    try std.testing.expectEqualStrings("aaf11bbc0f89e25ce01f3fac7e7fab8c4d16a7780f7573223e9edfde64957098", &std.fmt.bytesToHex(digest, .lower));
    var source = try Source.open(a, input);
    defer source.deinit();
    var raw = try source.decodeSection(a, 0);
    defer a.free(raw);
    const pictures = try @import("picture_sources.zig").read(a, raw, source.header.version(), .base73);
    defer a.free(pictures);
    try std.testing.expectEqual(@as(usize, 2), pictures.len);
    for (pictures, 0..) |picture, i| {
        var tree = try @import("source_tree.zig").parse(a, raw, source.header.version(), .{});
        defer tree.deinit(a);
        const root = try @import("picture_size_protection.zig").rootOwner(tree, picture.picture_node);
        const control = tree.nodes[root].record.framing;
        const at = control.offset + control.raw.len - control.payload.len;
        std.mem.writeInt(u32, raw[at + 4 ..][0..4], (4 << 15) | (2 << 18) | (1 << 3) | (1 << 8) | (1 << 14), .little);
        std.mem.writeInt(i32, raw[at + 8 ..][0..4], @intCast(1500 + i * 9000), .little);
        std.mem.writeInt(i32, raw[at + 12 ..][0..4], 7200, .little);
        const component_record = tree.nodes[picture.component_node].record.framing;
        const begin = component_record.offset + component_record.raw.len - component_record.payload.len;
        const parsed = try @import("../body/shape_component.zig").Component.parse(component_record.payload, .double_id);
        try std.testing.expectEqual(@as(u16, 0), parsed.group_count);
        try std.testing.expectEqual(@as(i16, 0), parsed.rotation_angle);
        try std.testing.expectEqual(@as(usize, 1), parsed.rendering.pairs.count());
        // Test-only normalization establishes an explicit declared positive basis.
        const matrix_writer = @import("drawing_matrix_payload.zig");
        const translation = try matrix_writer.write(a, raw[begin..][0..component_record.payload.len], .double_id, .translation, .{ 1, 0, 0, 0, 1, 0 }, component_record.payload.len);
        defer a.free(translation);
        const scaled = try matrix_writer.write(a, translation, .double_id, .{ .scale = 0 }, .{ 1, 0, 0, 0, 1, 0 }, component_record.payload.len);
        defer a.free(scaled);
        const rotated = try matrix_writer.write(a, scaled, .double_id, .{ .rotation = 0 }, .{ 1, 0, 0, 0, 1, 0 }, component_record.payload.len);
        defer a.free(rotated);
        @memcpy(raw[begin..][0..rotated.len], rotated);
        const resized = try @import("picture_resize_section.zig").write(a, raw, source.header.version(), picture.picture_node, .{ 7200, 3600 }, raw.len);
        a.free(raw);
        raw = resized;
    }
    const encoded = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, raw, 32 * 1024 * 1024) else try a.dupe(u8, raw);
    defer a.free(encoded);
    return @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", encoded, .{ .max_output_bytes = 64 * 1024 * 1024 });
}

test "H5 anchored picture other real pending target and legacy position compatibility survive one history swap" {
    const bytes = try twoPicturesFixture();
    defer a.free(bytes);
    const s = try Session.open(a, bytes);
    defer s.close();
    s.enableHistoryDelta();
    var h = try History.initV2(a, s, .{});
    defer h.deinit();
    const pictures = try s.pictureSources(a, 0, .base73);
    defer a.free(pictures);
    const first: @import("object_outer_margins.zig").Selector = .{ .section = 0, .kind = .picture, .node = @intCast(pictures[0].picture_node) };
    const second: @import("object_outer_margins.zig").Selector = .{ .section = 0, .kind = .picture, .node = @intCast(pictures[1].picture_node) };
    try std.testing.expect(try h.apply(s, .{ .resize_picture = .{ .section = 0, .picture_node = second.node, .width = 10000, .height = 6000 } }));
    const second_before = try s.anchoredPictureGeometry(second);
    const prior = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(prior.bytes);
    const first_before = try s.anchoredPictureGeometry(first);
    const revision = h.revision();
    try std.testing.expect(try h.apply(s, .{ .resize_picture_anchored = request(first_before, .bottom_right) }));
    try std.testing.expectEqual(revision + 1, h.revision());
    const second_after = try s.anchoredPictureGeometry(second);
    try std.testing.expectEqualDeep(second_before.frame, second_after.frame);
    const first_after = try s.anchoredPictureGeometry(first);
    const saved = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    try compareStreams(prior.bytes, saved.bytes);
    var prior_source = try Source.open(a, prior.bytes);
    defer prior_source.deinit();
    var saved_source = try Source.open(a, saved.bytes);
    defer saved_source.deinit();
    const x = try prior_source.decodeSection(a, 0);
    defer a.free(x);
    const y = try saved_source.decodeSection(a, 0);
    defer a.free(y);
    var xt = try @import("source_tree.zig").parse(a, x, prior_source.header.version(), .{});
    defer xt.deinit(a);
    var yt = try @import("source_tree.zig").parse(a, y, saved_source.header.version(), .{});
    defer yt.deinit(a);
    for ([_]u32{ second_before.target.control_node, second_before.target.component_node, second.node }) |node| try std.testing.expectEqualSlices(u8, xt.nodes[node].record.framing.raw, yt.nodes[node].record.framing.raw);
    try std.testing.expect(try h.undo(s));
    const undone = try s.save(a, .{ .allow_stale_layout = true });
    defer a.free(undone.bytes);
    try std.testing.expectEqualSlices(u8, prior.bytes, undone.bytes);
    try std.testing.expect(try h.redo(s));
    try std.testing.expect(try h.apply(s, .{ .resize_picture = .{ .section = 0, .picture_node = first.node, .width = 7000, .height = 3500 } }));
    const legacy_after = try s.anchoredPictureGeometry(first);
    try std.testing.expectEqual(first_after.frame.horizontalOffset, legacy_after.frame.horizontalOffset);
    try std.testing.expectEqual(first_after.frame.verticalOffset, legacy_after.frame.verticalOffset);
}

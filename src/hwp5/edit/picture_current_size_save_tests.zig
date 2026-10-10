const std = @import("std");

test "HWP5 picture current size survives paragraph split before and after edit with moved record identities" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const edit = @import("style_preservation.zig");
    for ([_]bool{ false, true }) |size_first| {
        const session = try edit.Session.open(a, input);
        defer session.close();
        var history = try @import("editor_history.zig").History.init(a, session, 8, 8_000_000);
        defer history.deinit();
        const pictures = try session.pictureSources(a, 0, .base73);
        defer a.free(pictures);
        const original_count = try session.paragraphCount(0);
        try std.testing.expectError(error.UnsupportedStructuralControl, history.apply(session, .{ .split_paragraph = .{ .section = 0, .paragraph = 0, .at_unit = 0 } }));
        const size: edit.Command = .{ .set_picture_current_size = .{ .section = 0, .picture_node = @intCast(pictures[0].picture_node), .width = 10000, .height = 6000 } };
        const split: edit.Command = .{ .split_paragraph = .{ .section = 0, .paragraph = 1, .at_unit = 0 } };
        try std.testing.expect(try history.apply(session, if (size_first) size else split));
        try std.testing.expect(try history.apply(session, if (size_first) split else size));
        const saved = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(saved.bytes);
        const reopened = try edit.Session.open(a, saved.bytes);
        defer reopened.close();
        try std.testing.expectEqual(original_count + 1, try reopened.paragraphCount(0));
        const saved_pictures = try reopened.pictureSources(a, 0, .base73);
        defer a.free(saved_pictures);
        try std.testing.expect(saved_pictures[0].picture_node != pictures[0].picture_node);
        try std.testing.expectEqualDeep(pictures[0].points, saved_pictures[0].points);
        try std.testing.expectEqual(pictures[0].bin_data_id, saved_pictures[0].bin_data_id);
        try std.testing.expectEqual(pictures.len, saved_pictures.len);
        const components = try reopened.drawingComponentSources(a, 0);
        defer a.free(components);
        var found = false;
        for (components) |component| if (component.component_node == saved_pictures[0].component_node) {
            try std.testing.expectEqual(@as(u32, 10000), component.current_width);
            try std.testing.expectEqual(@as(u32, 6000), component.current_height);
            found = true;
        };
        try std.testing.expect(found);
        try std.testing.expect(try history.apply(session, .{ .merge_paragraph = .{ .section = 0, .paragraph = 1 } }));
        const merged = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(merged.bytes);
        const merged_session = try edit.Session.open(a, merged.bytes);
        defer merged_session.close();
        try std.testing.expectEqual(original_count, try merged_session.paragraphCount(0));
        const merged_pictures = try merged_session.pictureSources(a, 0, .base73);
        defer a.free(merged_pictures);
        try std.testing.expectEqual(pictures.len, merged_pictures.len);
        const merged_components = try merged_session.drawingComponentSources(a, 0);
        defer a.free(merged_components);
        var merged_found = false;
        for (merged_components) |component| if (component.component_node == merged_pictures[0].component_node) {
            try std.testing.expectEqual(@as(u32, 10000), component.current_width);
            try std.testing.expectEqual(@as(u32, 6000), component.current_height);
            merged_found = true;
        };
        try std.testing.expect(merged_found);
        try std.testing.expect(try history.undo(session));
        const split_again = try session.save(a, .{ .allow_stale_layout = true });
        defer a.free(split_again.bytes);
        try std.testing.expectEqualSlices(u8, saved.bytes, split_again.bytes);
        try std.testing.expect(try history.undo(session));
        try std.testing.expect(try history.undo(session));
        const restored = try session.save(a, .{});
        defer a.free(restored.bytes);
        try std.testing.expectEqualSlices(u8, input, restored.bytes);
    }
}

test "HWP5 picture current size history actual fourteen live values equal reopened values" {
    const a = std.testing.allocator;
    for ([_][]const u8{ "sample-5017", "sample-5017-pics", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        const edit = @import("style_preservation.zig");
        const session = try edit.Session.open(a, input);
        defer session.close();
        var history = try @import("editor_history.zig").History.init(a, session, 8, 8_000_000);
        defer history.deinit();
        const pictures = try session.pictureSources(a, 0, .base73);
        defer a.free(pictures);
        for (pictures) |picture| {
            try std.testing.expect(try history.apply(session, .{ .set_picture_current_size = .{ .section = 0, .picture_node = @intCast(picture.picture_node), .width = 10000, .height = 6000 } }));
            const live = try session.drawingComponentSources(a, 0);
            defer a.free(live);
            const saved = try session.save(a, .{ .allow_stale_layout = true });
            defer a.free(saved.bytes);
            const reopened = try edit.Session.open(a, saved.bytes);
            defer reopened.close();
            const current = try reopened.drawingComponentSources(a, 0);
            defer a.free(current);
            try std.testing.expectEqualDeep(live, current);
            try std.testing.expect(try history.undo(session));
            const restored = try session.save(a, .{});
            defer a.free(restored.bytes);
            try std.testing.expectEqualSlices(u8, input, restored.bytes);
        }
    }
}

test "HWP5 picture current size late batch refusal rolls back both pictures and preserves redo" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const edit = @import("style_preservation.zig");
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 8_000_000);
    defer history.deinit();
    const pictures = try session.pictureSources(a, 0, .base73);
    defer a.free(pictures);
    const left: edit.Command = .{ .set_picture_current_size = .{ .section = 0, .picture_node = @intCast(pictures[0].picture_node), .width = 10000, .height = 6000 } };
    const right: edit.Command = .{ .set_picture_current_size = .{ .section = 0, .picture_node = @intCast(pictures[1].picture_node), .width = 20000, .height = 12000 } };
    try std.testing.expect(try history.apply(session, left));
    const prior = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(prior.bytes);
    try std.testing.expect(try history.undo(session));
    try std.testing.expectError(error.InvalidSection, history.applyBatch(session, &.{ left, right, .{ .set_picture_current_size = .{ .section = 999, .picture_node = 0, .width = 1, .height = 2 } } }));
    const unchanged = try session.save(a, .{});
    defer a.free(unchanged.bytes);
    try std.testing.expectEqualSlices(u8, input, unchanged.bytes);
    try std.testing.expect(!try history.undo(session));
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, prior.bytes, redone.bytes);
}

test "HWP5 picture current size Session history saves reopens and preserves redo on refusal" {
    const a = std.testing.allocator;
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/sample-5017.hwp", a, .limited(8_000_000));
    defer a.free(input);
    const edit = @import("style_preservation.zig");
    const session = try edit.Session.open(a, input);
    defer session.close();
    var history = try @import("editor_history.zig").History.init(a, session, 8, 8_000_000);
    defer history.deinit();
    const pictures = try session.pictureSources(a, 0, .base73);
    defer a.free(pictures);
    const command: edit.Command = .{ .set_picture_current_size = .{ .section = 0, .picture_node = @intCast(pictures[0].picture_node), .width = 10000, .height = 6000 } };
    try std.testing.expect(try history.apply(session, command));
    try std.testing.expect(!try history.apply(session, command));
    try std.testing.expectError(error.LayoutReflowRequired, session.save(a, .{}));
    const saved = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(saved.bytes);
    const reopened = try edit.Session.open(a, saved.bytes);
    defer reopened.close();
    const current = try reopened.drawingComponentSources(a, 0);
    defer a.free(current);
    var found = false;
    for (current) |component| if (component.component_node == pictures[0].component_node) {
        try std.testing.expectEqual(@as(u32, 10000), component.current_width);
        try std.testing.expectEqual(@as(u32, 6000), component.current_height);
        found = true;
    };
    try std.testing.expect(found);
    try std.testing.expect(try history.undo(session));
    try std.testing.expectError(error.InvalidPictureOwner, history.apply(session, .{ .set_picture_current_size = .{ .section = 0, .picture_node = 0, .width = 1, .height = 2 } }));
    const restored = try session.save(a, .{});
    defer a.free(restored.bytes);
    try std.testing.expectEqualSlices(u8, input, restored.bytes);
    try std.testing.expect(try history.redo(session));
    const redone = try session.save(a, .{ .allow_stale_layout = true });
    defer a.free(redone.bytes);
    try std.testing.expectEqualSlices(u8, saved.bytes, redone.bytes);
}

test "HWP5 picture current size actual CFB save reopens fourteen pictures and preserves other streams" {
    const a = std.testing.allocator;
    var count: usize = 0;
    for ([_][]const u8{ "sample-5017", "sample-5017-pics", "shapecontainer-2" }) |name| {
        const path = try std.fmt.allocPrint(a, "legacy/rust/crates/hwp-core/tests/fixtures/{s}.hwp", .{name});
        defer a.free(path);
        const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, path, a, .limited(8_000_000));
        defer a.free(input);
        var source = try @import("../text_source.zig").Source.open(a, input);
        defer source.deinit();
        const raw = try source.decodeSection(a, 0);
        defer a.free(raw);
        const version = source.header.version();
        const pictures = try @import("picture_sources.zig").read(a, raw, version, .base73);
        defer a.free(pictures);
        const original_nodes = try source.file.toNodes(a);
        defer a.free(original_nodes);
        const target = try source.file.nodeIndex((try source.file.findExact("/BodyText/Section0")).?);
        for (pictures) |picture| {
            const changed = try @import("picture_current_size_section.zig").write(a, raw, version, picture.picture_node, .{ .width = 10000, .height = 6000 }, raw.len);
            defer a.free(changed);
            const encoded = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(a, changed, 8_000_000) else try a.dupe(u8, changed);
            defer a.free(encoded);
            const saved = try @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, "/BodyText/Section0", encoded, .{});
            defer a.free(saved);
            var reopened = try @import("../text_source.zig").Source.open(a, saved);
            defer reopened.deinit();
            const decoded = try reopened.decodeSection(a, 0);
            defer a.free(decoded);
            try std.testing.expectEqualSlices(u8, changed, decoded);
            const components = try @import("drawing_component_sources.zig").read(a, decoded, version);
            defer a.free(components);
            var found = false;
            for (components) |component| if (component.component_node == picture.component_node) {
                try std.testing.expectEqual(@as(u32, 10000), component.current_width);
                try std.testing.expectEqual(@as(u32, 6000), component.current_height);
                found = true;
            };
            try std.testing.expect(found);
            const current_nodes = try reopened.file.toNodes(a);
            defer a.free(current_nodes);
            try std.testing.expectEqual(original_nodes.len, current_nodes.len);
            for (original_nodes, current_nodes, 0..) |before, after, index| {
                try std.testing.expectEqualSlices(u8, before.name, after.name);
                try std.testing.expectEqual(before.kind, after.kind);
                try std.testing.expectEqual(before.parent, after.parent);
                try std.testing.expectEqualSlices(u8, &before.clsid, &after.clsid);
                try std.testing.expectEqual(before.state, after.state);
                try std.testing.expectEqual(before.created, after.created);
                try std.testing.expectEqual(before.modified, after.modified);
                if (index != target) try std.testing.expectEqualSlices(u8, before.content, after.content);
            }
            count += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 14), count);
}

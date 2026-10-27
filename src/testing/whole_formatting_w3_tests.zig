//! 실제 Session/History/Native JSON decoder 집중 회귀 소스. 슬롯 승인 전 미실행입니다.
const std = @import("std");
const Format = @import("../model/document.zig").Format;
const m = @import("../model/formatting_patch.zig");
const p = @import("../model/formatting_projection.zig");
fn open(comptime format: Format, a: std.mem.Allocator, bytes: []const u8) !if (format == .hwp5) *@import("../hwp5/edit/style_preservation.zig").Session else *@import("../hwpx/editor_session.zig").Session {
    if (format == .hwp5) return @import("../hwp5/edit/style_preservation.zig").Session.open(a, bytes);
    const value = try a.create(@import("../hwpx/editor_session.zig").Session);
    errdefer a.destroy(value);
    value.* = try @import("../hwpx/editor_session.zig").open(a, bytes, .{});
    return value;
}
fn close(comptime format: Format, a: std.mem.Allocator, session: anytype) void {
    if (format == .hwp5) session.close() else {
        session.deinit();
        a.destroy(session);
    }
}
fn save(comptime format: Format, a: std.mem.Allocator, session: anytype) ![]u8 {
    return if (format == .hwp5) (try session.save(a, .{ .allow_stale_layout = true })).bytes else try session.save();
}
const EmptyIntent = struct {};
const fields = [_][]const u8{ "character.shadow", "character.border", "character.background", "paragraph.grid", "paragraph.borderConnect", "paragraph.border", "paragraph.background" };
const changed_patch = .{
    .character = .{ .shadow = .{ .kind = "drop", .offsetX = @as(i32, 10), .offsetY = @as(i32, -10), .color = @as(u32, 0x123456) }, .border = .{ .left = .{ .style = "SOLID", .widthHundredthMm = @as(u16, 10), .color = @as(u32, 0x123456) } }, .background = .{ .kind = "hatch", .faceColor = @as(u32, 0x99ccff), .hatchColor = @as(u32, 0x0099ff), .style = "CROSS" } },
    .paragraph = .{ .grid = false, .borderConnect = true, .border = .{ .right = .{ .style = "SOLID", .widthHundredthMm = @as(u16, 12), .color = @as(u32, 0x654321) } }, .background = .{ .kind = "linear", .colors = [_]u32{ 0x123456, 0xabcdef }, .angle = @as(u16, 90), .centerX = @as(u8, 50), .centerY = @as(u8, 50), .step = @as(u8, 10), .stepCenter = @as(u8, 50) } },
};

const BooleanFields = struct { bold: ?bool, grid: ?bool };
fn bools(a: std.mem.Allocator, service: anytype, token: []const u8, revision: ?u32, selectors: []const @import("../wasm/formatting_query_request.zig").Selector) !BooleanFields {
    const bytes = try service.query(a, .{ .binding = .{ .session = token, .revision = revision }, .selectors = selectors, .fields = &.{ "character.bold", "paragraph.grid" } });
    defer a.free(bytes);
    const json = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
    defer json.deinit();
    const fields_map = json.value.object.get("observations").?.object.get("aggregate").?.object;
    var result: BooleanFields = .{ .bold = null, .grid = null };
    inline for (.{ "character.bold", "paragraph.grid" }, .{ "bold", "grid" }) |field, key| {
        const value = fields_map.get(field).?.object;
        if (std.mem.eql(u8, value.get("state").?.string, "known")) @field(result, key) = value.get("value").?.bool;
    }
    return result;
}

fn run(comptime format: Format, comptime reset: ?m.ResetScope) !void {
    const a = std.testing.allocator;
    const filename = if (format == .hwp5) (if (reset == null) "legacy/rust/crates/hwp-core/tests/fixtures/parashape.hwp" else "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp") else "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwpx";
    const input = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, filename, a, .limited(4_000_000));
    defer a.free(input);
    const session = try open(format, a, input);
    defer close(format, a, session);
    const H = if (format == .hwp5) @import("../hwp5/edit/editor_history.zig").History else @import("../hwpx/editor_history.zig").History;
    var history = if (format == .hwp5) try H.initV2(a, session, .{}) else try H.initV2(session, .{});
    defer history.deinit();
    var lifetime: @import("../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    defer lifetime.close();
    const token = try lifetime.session(a);
    defer a.free(token);
    const S = @import("../wasm/formatting_service.zig").Service(format);
    const service: S = .{ .backend = .{ .session = session, .allocator = a }, .history = &history, .lifetime = &lifetime };
    const Selected = struct { paragraph: u32, range: m.Range, query: []u8 };
    const selected: Selected = found: {
        const begin: usize = if (format == .hwp5) 0 else session.sections[0].first_paragraph;
        const end = if (format == .hwp5) try session.paragraphCount(0) else session.sections[0].last_paragraph + 1;
        for (begin..end) |paragraph| {
            const spans = service.backend.spans(a, .{ .section = 0, .paragraph = paragraph }) catch continue;
            defer a.free(spans);
            for (spans) |span| {
                if (span.start >= span.end) continue;
                const ranges = [_]m.Range{.{ .startUnit = span.start, .endUnit = span.start + 1 }};
                const selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = @intCast(paragraph), .ranges = &ranges }};
                const bytes = service.query(a, .{ .binding = .{ .session = token, .revision = history.revision() }, .selectors = &selectors, .fields = &.{ "character.border", "paragraph.border", "reset.style" } }) catch continue;
                var keep = false;
                defer if (!keep) a.free(bytes);
                const json = try std.json.parseFromSlice(std.json.Value, a, bytes, .{});
                defer json.deinit();
                const observations = json.value.object.get("observations").?.object.get("aggregate").?.object;
                const char = observations.get("character.border").?.object;
                const para = observations.get("paragraph.border").?.object;
                if (reset == null and (!char.get("writable").?.bool or !para.get("writable").?.bool)) {
                    std.debug.print("TARGET {s} p{d} query={s}\n", .{ @tagName(format), paragraph, bytes });
                    continue;
                }
                const style = observations.get("reset.style").?.object;
                if (!std.mem.eql(u8, style.get("state").?.string, "known")) {
                    std.debug.print("STYLE {s} p{d} query={s}\n", .{ @tagName(format), paragraph, bytes });
                    continue;
                }
                keep = true;
                break :found .{ .paragraph = @intCast(paragraph), .range = ranges[0], .query = bytes };
            }
        }
        return error.RequiredOriginalFormattingTargetMissing;
    };
    defer a.free(selected.query);
    if (comptime format == .hwp5) {
        if (reset == null) {
            var original = try session.formattingSource(a);
            defer original.deinit();
            const spans = try service.backend.spans(a, .{ .section = 0, .paragraph = selected.paragraph });
            defer a.free(spans);
            var proven = false;
            for (spans) |span| {
                if (span.start > selected.range.startUnit or span.end <= selected.range.startUnit) continue;
                var records = @import("../hwp5/record.zig").Iterator.init(original.bytes, .{});
                var ordinal: u32 = 0;
                while (try records.next()) |row| {
                    if (row.tag != 21) continue;
                    if (ordinal == (span.resource orelse return error.MissingSourceCharacterBinding)) {
                        const shape = try @import("../hwp5/docinfo/char_shape.zig").CharShape.parse(row.payload, original.version);
                        try std.testing.expectEqual(@as(?u16, 1), shape.border_fill_id);
                        _ = try @import("../hwp5/edit/border_fill_docinfo_patch.zig").resource(original.bytes, shape.border_fill_id.?);
                        proven = true;
                        break;
                    }
                    ordinal += 1;
                }
            }
            try std.testing.expect(proven);
        }
    }
    var xml_ordinal: usize = selected.paragraph;
    if (comptime format == .hwpx) {
        const section = &session.sections[0];
        var view = try @import("../hwpx/display_current_paragraphs.zig").read(a, section, session.options);
        defer view.deinit(a);
        const template = view.paragraphs[selected.paragraph - section.first_paragraph].template_element;
        xml_ordinal = 0;
        for (section.tree.elements, 0..) |element, index| {
            if (index == template) break;
            if (element.is(@import("../hwpx/document_xml.zig").paragraph_uri, "p")) xml_ordinal += 1;
        }
    }
    const json = try std.json.parseFromSlice(std.json.Value, a, selected.query, .{});
    defer json.deinit();
    const ranges = [_]m.Range{selected.range};
    const targets = [_]m.Target{.{ .ref = json.value.object.get("observations").?.object.get("perTarget").?.array.items[0].object.get("ref").?.string, .ranges = if (reset == .paragraph) &.{} else &ranges }};
    const selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = selected.paragraph, .ranges = &ranges }};
    // 빈 patch의 기존 생략 no-op과 명시 [] no-op이 같은 실제 서비스를 거칩니다.
    const noop_source = try save(format, a, session);
    defer a.free(noop_source);
    const noop_revision = history.revision();
    inline for (.{ false, true }) |explicit_empty| {
        const no_op_wire = if (comptime explicit_empty) try std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .binding = .{ .session = token, .revision = noop_revision }, .targets = .{.{ .ref = targets[0].ref, .ranges = [_]m.Range{} }}, .patch = EmptyIntent{} }, .{}) else try std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .binding = .{ .session = token, .revision = noop_revision }, .targets = .{.{ .ref = targets[0].ref }}, .patch = EmptyIntent{} }, .{});
        defer a.free(no_op_wire);
        const old_wire = if (comptime explicit_empty) try std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .binding = .{ .session = token, .revision = noop_revision }, .targets = .{.{ .ref = targets[0].ref, .ranges = [_]m.Range{} }}, .patch = .{} }, .{}) else try std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .binding = .{ .session = token, .revision = noop_revision }, .targets = .{.{ .ref = targets[0].ref }}, .patch = .{} }, .{});
        defer a.free(old_wire);
        try std.testing.expectError(error.InvalidFormattingObject, @import("../wasm/formatting_patch_request.zig").decode(a, old_wire));
        if (try @import("evidence_output.zig").Sink.fromEnviron(a, std.testing.io, std.testing.environ, "HWPJS_FORMATTING_WIRE_EVIDENCE_DIR")) |value| {
            var wire_sink = value;
            defer wire_sink.deinit();
            const wire_name = comptime (@tagName(format) ++ "-" ++ (if (reset) |scope| @tagName(scope) else "new7") ++ "-" ++ (if (explicit_empty) "explicit" else "omitted"));
            try wire_sink.writeFile(wire_name ++ "-old.json", old_wire);
            try wire_sink.writeFile(wire_name ++ "-fixed.json", no_op_wire);
        }
        var no_op = try @import("../wasm/formatting_patch_request.zig").decode(a, no_op_wire);
        defer no_op.deinit();
        try std.testing.expectEqual(@as(usize, 0), no_op.value.targets[0].ranges.len);
        try std.testing.expect(!try service.apply(a, no_op.value));
        try std.testing.expectEqual(noop_revision, history.revision());
        const unchanged = try save(format, a, session);
        defer a.free(unchanged);
        try std.testing.expectEqualSlices(u8, noop_source, unchanged);
    }
    var expected_reset_bold: ?bool = null;
    var expected_reset_grid: ?bool = null;
    if (reset) |scope| {
        const style = try service.backend.resetResources(.{ .section = 0, .paragraph = selected.paragraph }, a);
        var preparation: m.Patch = .{};
        if (scope != .paragraph) {
            const value = try service.backend.characterField(a, style.character orelse return error.MissingResetStyleCharacter, "character.bold");
            if (value.state != .known) return error.RequiredStyleBoldUnknown;
            expected_reset_bold = value.value.?.bool;
            preparation.character.bold = !value.value.?.bool;
        }
        if (scope != .character) {
            const identity = style.paragraph orelse return error.MissingResetStyleParagraph;
            var grid: ?bool = null;
            if (comptime format == .hwp5) {
                const shapes = try session.paragraphShapes(a);
                defer a.free(shapes);
                for (shapes) |shape| if (shape.id == identity) {
                    grid = shape.flags.grid;
                    break;
                };
            } else {
                var context = try @import("../hwpx/formatting_preflight.zig").Context.init(a, session);
                defer context.deinit();
                const node = try @import("../hwpx/formatting_preflight.zig").node(a, &context.tree, "paraPr", identity);
                grid = (try @import("../hwpx/paragraph_flags_patch.zig").read(a, &context.tree, node)).grid;
            }
            expected_reset_grid = grid orelse return error.RequiredStyleGridUnknown;
            preparation.paragraph.flags.grid = !expected_reset_grid.?;
        }
        var baseline: m.Patch = .{};
        baseline.character.bold = expected_reset_bold;
        baseline.paragraph.flags.grid = expected_reset_grid;
        const before = try bools(a, service, token, history.revision(), &selectors);
        std.debug.print("RESET {s}/{s} before bold={any} grid={any}; style bold={any} grid={any}\n", .{ @tagName(format), @tagName(scope), before.bold, before.grid, expected_reset_bold, expected_reset_grid });
        _ = try service.apply(a, .{ .binding = .{ .session = token, .revision = history.revision() }, .targets = &targets, .patch = baseline });
        const normalized = try bools(a, service, token, history.revision(), &selectors);
        if (expected_reset_bold) |v| try std.testing.expectEqual(v, normalized.bold.?);
        if (expected_reset_grid) |v| try std.testing.expectEqual(v, normalized.grid.?);
        std.debug.print("STAGE {s}/{s} prepare\n", .{ @tagName(format), @tagName(scope) });
        try std.testing.expect(try service.apply(a, .{ .binding = .{ .session = token, .revision = history.revision() }, .targets = &targets, .patch = preparation }));
    }
    if (reset != null) {
        const prepared = try bools(a, service, token, history.revision(), &selectors);
        if (expected_reset_bold) |v| try std.testing.expectEqual(!v, prepared.bold.?);
        if (expected_reset_grid) |v| try std.testing.expectEqual(!v, prepared.grid.?);
    }
    const raw = try std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .binding = .{ .session = token, .revision = history.revision() }, .targets = &targets, .patch = if (reset) |scope| .{ .reset = .{ .basis = "paragraph-style", .scope = @tagName(scope) } } else changed_patch }, .{});
    defer a.free(raw);
    var request = try @import("../wasm/formatting_patch_request.zig").decode(a, raw);
    defer request.deinit();
    const source = try save(format, a, session);
    defer a.free(source);
    if (reset == null) try std.testing.expectEqualSlices(u8, input, source);
    const initial = history.revision();
    const readonly: S = .{ .backend = service.backend, .history = null, .lifetime = &lifetime };
    var ro = request.value;
    ro.binding.revision = null;
    try std.testing.expectError(error.HistoryNotEnabled, readonly.apply(a, ro));
    var failing = std.testing.FailingAllocator.init(a, .{ .fail_index = 0 });
    try std.testing.expectError(error.OutOfMemory, service.apply(failing.allocator(), request.value));
    try std.testing.expectEqual(initial, history.revision());
    const after_rejections = try save(format, a, session);
    defer a.free(after_rejections);
    try std.testing.expectEqualSlices(u8, source, after_rejections);
    std.debug.print("STAGE {s}/{s} apply\n", .{ @tagName(format), if (reset) |v| @tagName(v) else "new7" });
    const changed = try service.apply(a, request.value);
    try std.testing.expect(changed);
    if (changed) try std.testing.expectEqual(initial + 1, history.revision()) else try std.testing.expectEqual(initial, history.revision());
    if (reset != null) {
        const actual = try bools(a, service, token, history.revision(), &selectors);
        if (expected_reset_bold) |v| try std.testing.expectEqual(v, actual.bold.?);
        if (expected_reset_grid) |v| try std.testing.expectEqual(v, actual.grid.?);
    }
    const after_query = try service.query(a, .{ .binding = .{ .session = token, .revision = history.revision() }, .selectors = &selectors, .fields = if (reset == null) &fields else &.{"reset.style"} });
    defer a.free(after_query);
    if (reset == null) {
        const projection = try std.json.parseFromSlice(std.json.Value, a, after_query, .{});
        defer projection.deinit();
        const aggregate = projection.value.object.get("observations").?.object.get("aggregate").?.object;
        const shadow = aggregate.get("character.shadow").?.object.get("value").?.object;
        try std.testing.expectEqualStrings("drop", shadow.get("kind").?.string);
        try std.testing.expectEqual(@as(i64, 10), shadow.get("offsetX").?.integer);
        try std.testing.expectEqual(@as(i64, -10), shadow.get("offsetY").?.integer);
        try std.testing.expectEqual(@as(i64, 0x123456), shadow.get("color").?.integer);
        const cb = aggregate.get("character.border").?.object.get("value").?.object.get("left").?.object;
        try std.testing.expectEqualStrings("SOLID", cb.get("style").?.string);
        try std.testing.expectEqual(@as(i64, 10), cb.get("widthHundredthMm").?.integer);
        try std.testing.expectEqual(@as(i64, 0x123456), cb.get("color").?.integer);
        const bg = aggregate.get("character.background").?.object.get("value").?.object;
        try std.testing.expectEqualStrings("hatch", bg.get("kind").?.string);
        try std.testing.expectEqual(@as(i64, 0x99ccff), bg.get("faceColor").?.integer);
        try std.testing.expectEqual(@as(i64, 0x0099ff), bg.get("hatchColor").?.integer);
        try std.testing.expect(!aggregate.get("paragraph.grid").?.object.get("value").?.bool);
        try std.testing.expect(aggregate.get("paragraph.borderConnect").?.object.get("value").?.bool);
        const pb = aggregate.get("paragraph.border").?.object.get("value").?.object.get("right").?.object;
        try std.testing.expectEqual(@as(i64, 0x654321), pb.get("color").?.integer);
        const grad = aggregate.get("paragraph.background").?.object.get("value").?.object;
        try std.testing.expectEqualStrings("linear", grad.get("kind").?.string);
        try std.testing.expectEqual(@as(i64, 0x123456), grad.get("colors").?.array.items[0].integer);
        try std.testing.expectEqual(@as(i64, 0xabcdef), grad.get("colors").?.array.items[1].integer);
    }
    const edited = try save(format, a, session);
    defer a.free(edited);
    std.debug.print("STAGE {s}/{s} noop\n", .{ @tagName(format), if (reset) |v| @tagName(v) else "new7" });
    request.value.binding.revision = history.revision();
    try std.testing.expect(!try service.apply(a, request.value));
    const noop = try save(format, a, session);
    defer a.free(noop);
    try std.testing.expectEqualSlices(u8, edited, noop);
    if (changed) {
        try std.testing.expect(try history.undo(session));
    }
    const restored = try save(format, a, session);
    defer a.free(restored);
    try std.testing.expectEqualSlices(u8, source, restored);
    if (changed) {
        try std.testing.expect(try history.redo(session));
    }
    const redone = try save(format, a, session);
    defer a.free(redone);
    try std.testing.expectEqualSlices(u8, edited, redone);
    const reopened = try open(format, a, edited);
    defer close(format, a, reopened);
    var fresh: @import("../model/formatting_binding.zig").State = .{};
    try fresh.open();
    defer fresh.close();
    const fresh_token = try fresh.session(a);
    defer a.free(fresh_token);
    const reading: S = .{ .backend = .{ .session = reopened, .allocator = a }, .history = null, .lifetime = &fresh };
    if (reset != null) {
        const actual = try bools(a, reading, fresh_token, null, &selectors);
        if (expected_reset_bold) |v| try std.testing.expectEqual(v, actual.bold.?);
        if (expected_reset_grid) |v| try std.testing.expectEqual(v, actual.grid.?);
    }
    const replay = try reading.query(a, .{ .binding = .{ .session = fresh_token, .revision = null }, .selectors = &selectors, .fields = if (reset == null) &fields else &.{"reset.style"} });
    defer a.free(replay);
    const parsed = try std.json.parseFromSlice(std.json.Value, a, replay, .{});
    defer parsed.deinit();
    var it = parsed.value.object.get("observations").?.object.get("aggregate").?.object.iterator();
    while (it.next()) |entry| try std.testing.expectEqualStrings("known", entry.value_ptr.object.get("state").?.string);
    const after_parsed = try std.json.parseFromSlice(std.json.Value, a, after_query, .{});
    defer after_parsed.deinit();
    const original_fields = after_parsed.value.object.get("observations").?.object.get("aggregate").?.object;
    var replay_fields = parsed.value.object.get("observations").?.object.get("aggregate").?.object.iterator();
    while (replay_fields.next()) |entry| try std.testing.expect(p.equal(original_fields.get(entry.key_ptr.*).?.object.get("value").?, entry.value_ptr.object.get("value").?));
    var sink = (try @import("evidence_output.zig").Sink.fromEnviron(a, std.testing.io, std.testing.environ, "HWPJS_FORMATTING_EVIDENCE_DIR")) orelse return;
    defer sink.deinit();
    const folder = comptime ("" ++ @tagName(format) ++ "-" ++ (if (reset) |scope| "reset-" ++ @tagName(scope) else "new7"));
    inline for (.{ .{ "source", source }, .{ "edited", edited }, .{ "restored", restored }, .{ "redone", redone }, .{ "noop", noop } }) |entry| try sink.writeCaseFile(folder, entry[0], entry[1]);
    const metadata = try std.json.Stringify.valueAlloc(a, .{ .format = @tagName(format), .nativeParagraph = selected.paragraph, .changed = changed, .command = .{ .section = @as(u32, 0), .paragraph = if (format == .hwp5) @as(usize, selected.paragraph) else xml_ordinal, .startUnit = selected.range.startUnit, .endUnit = selected.range.endUnit, .patch = if (reset) |scope| .{ .reset = .{ .basis = "paragraph-style", .scope = @tagName(scope) } } else changed_patch } }, .{});
    defer a.free(metadata);
    try sink.writeCaseFile(folder, "metadata.json", metadata);
}
test "whole-w3/HWP5 new7 single batch save undo redo reopen" {
    try run(.hwp5, null);
}
test "whole-w3/HWPX new7 single batch save undo redo reopen" {
    try run(.hwpx, null);
}
test "whole-w3/HWP5 explicit paragraph-style full reset scopes" {
    inline for (.{ m.ResetScope.character, .paragraph, .all }) |scope| try run(.hwp5, scope);
}
test "whole-w3/HWPX explicit paragraph-style full reset scopes" {
    inline for (.{ m.ResetScope.character, .paragraph, .all }) |scope| try run(.hwpx, scope);
}

test "whole-w3/resource kind별 unknown키·null·reset충돌 거부" {
    const a = std.testing.allocator;
    const prefix = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s:1\",\"revision\":0},\"targets\":[{\"ref\":\"p:1:0:0\",\"ranges\":[{\"startUnit\":0,\"endUnit\":1}]}],\"patch\":";
    inline for (.{
        "{\"character\":{\"border\":{\"left\":{\"unknown\":1}}}}",
        "{\"character\":{\"background\":{\"kind\":\"solid\",\"color\":0,\"style\":\"CROSS\"}}}",
        "{\"paragraph\":{\"background\":{\"kind\":\"hatch\",\"faceColor\":0,\"hatchColor\":1,\"style\":\"CROSS\",\"angle\":0}}}",
        "{\"reset\":{\"basis\":\"id-zero\",\"scope\":\"all\"}}",
        "{\"reset\":{\"basis\":\"paragraph-style\",\"scope\":\"all\"},\"character\":{\"bold\":false}}",
        "{\"character\":{\"border\":null}}",
        "{\"paragraph\":{\"background\":{\"kind\":\"radial\"}}}",
    }) |patch| {
        const result = @import("../wasm/formatting_patch_request.zig").decode(a, prefix ++ patch ++ "}");
        if (result) |value| {
            var owned = value;
            owned.deinit();
            return error.InvalidRequestAccepted;
        } else |err| {
            try std.testing.expect(err != error.OutOfMemory);
        }
    }
}
test "whole-w3/sparse resource merge는 밖의 edge·background·7언어를 보존" {
    const r = @import("../model/border_fill_patch.zig");
    var before: r.Patch = .{};
    before.border.edges[0] = .{ .style = .SOLID, .color = 0x123456 };
    before.border.edges[1] = .{ .width_hundredth_mm = 12 };
    before.background = .{ .hatch = .{ .face = 0x99ccff, .hatch = 0x0099ff, .style = .CROSS } };
    var update: r.Patch = .{};
    update.border.edges[0] = .{ .color = 0 };
    const original: @import("../model/document.zig").CharacterPropertyPatch = .{ .border_fill = before, .ratio = .{ 120, null, null, null, null, null, null }, .size = 1700 };
    const after = @import("../model/character_properties.zig").merge(original, .{ .border_fill = update });
    try std.testing.expectEqual(@as(?r.Style, .SOLID), after.border_fill.?.border.edges[0].?.style);
    try std.testing.expectEqual(@as(?u32, 0), after.border_fill.?.border.edges[0].?.color);
    try std.testing.expectEqualDeep(before.border.edges[1], after.border_fill.?.border.edges[1]);
    try std.testing.expectEqualDeep(before.background, after.border_fill.?.background);
    try std.testing.expectEqualDeep(original.ratio, after.ratio);
    try std.testing.expectEqual(original.size, after.size);
    const solid = r.merge(before, .{ .background = .{ .solid = .{ .color = 0x123456 } } });
    try std.testing.expectEqual(@as(?u32, 0x0099ff), solid.background.?.solid.hatch_color);
    const Eq = @import("../model/equality.zig");
    try std.testing.expect(!Eq.semantic(@import("../model/document.zig").CharacterPropertyPatch, .{ .border_fill = .{ .background = .none } }, .{ .border_fill = .{ .background = .{ .solid = .{ .color = 0 } } } }));
    try std.testing.expect(!Eq.semantic(r.Background, .{ .solid = .{ .color = 0 } }, .{ .solid = .{ .color = 0, .hatch_color = 0 } }));
    try std.testing.expect(Eq.semantic(r.Background, .{ .hatch = .{ .face = 0, .hatch = 1, .style = .CROSS } }, .{ .hatch = .{ .face = 0, .hatch = 1, .style = .CROSS } }));
}
test "whole-w3/HWP5 opaque fill border-only exact tail·배경교체 거부" {
    const a = std.testing.allocator;
    var input: [51]u8 = @splat(0xa5);
    std.mem.writeInt(u32, input[32..36], 0x80, .little);
    var patch: @import("../model/border_fill_patch.zig").Patch = .{};
    patch.border.edges[0] = .{ .width_hundredth_mm = 20 };
    const result = try @import("../hwp5/edit/border_fill_payload_patch.zig").write(a, &input, patch, 1024);
    defer a.free(result);
    var expected = input;
    expected[3] = 3;
    try std.testing.expectEqualSlices(u8, &expected, result);
    try std.testing.expectError(error.UnsupportedOpaqueBackground, @import("../hwp5/edit/border_fill_payload_patch.zig").write(a, &input, .{ .background = .none }, 1024));
}
test "whole-w3/HWPX opaque fill은 선 변경에 보존·배경교체는 명시 거부" {
    const a = std.testing.allocator;
    const xml = "<h:head xmlns:h='http://www.hancom.co.kr/hwpml/2011/head' xmlns:c='http://www.hancom.co.kr/hwpml/2011/core' xmlns:f='urn:future'><h:borderFill id='9'><h:leftBorder type='NONE' width='0.1 mm' color='#000000'/><c:fillBrush><f:future raw='keep'/></c:fillBrush></h:borderFill></h:head>";
    var tree = try @import("../hwpx/xml_part_tree.zig").parse(a, xml, .header, null, 0, .{});
    defer tree.deinit(a);
    var patch: @import("../model/border_fill_patch.zig").Patch = .{};
    patch.border.edges[0] = .{ .width_hundredth_mm = 20 };
    const result = try @import("../hwpx/border_fill_xml_patch.zig").write(a, &tree, 1, patch, 4096, .{});
    defer a.free(result);
    try std.testing.expect(std.mem.indexOf(u8, result, "<c:fillBrush><f:future raw='keep'/></c:fillBrush>") != null);
    try std.testing.expect(std.mem.indexOf(u8, result, "width='0.20 mm'") != null);
    try std.testing.expectError(error.UnsupportedOpaqueBackground, @import("../hwpx/border_fill_xml_patch.zig").write(a, &tree, 1, .{ .background = .none }, 4096, .{}));
    try std.testing.expectEqualStrings(xml, tree.source);
}
test "whole-w3/reset부재는 ID0이 아닌 명시 오류·명령예산선검사" {
    const a = std.testing.allocator;
    var calls: usize = 0;
    const R = struct {
        calls: *usize,
        pub fn checkBinding(_: @This(), _: m.Binding) !void {}
        pub fn resolve(self: @This(), _: []const u8) !m.Owner {
            self.calls.* += 1;
            return .{ .section = 0, .paragraph = 0 };
        }
        pub fn validate(_: @This(), _: m.Owner, _: []const m.Range, _: m.Patch) !void {}
        pub fn resolveReset(_: @This(), _: m.Owner) !m.ResetResources {
            return .{ .style_id = 0 };
        }
    };
    const range = [_]m.Range{.{ .startUnit = 0, .endUnit = 1 }};
    const targets = [_]m.Target{.{ .ref = "p:1:0:0", .ranges = &range }};
    try std.testing.expectError(error.MissingResetStyleCharacter, m.plan(a, .{ .binding = .{ .session = "s:1", .revision = 0 }, .targets = &targets, .patch = .{ .reset = .all } }, R{ .calls = &calls }));
    try std.testing.expectEqual(@as(usize, 1), calls);
    calls = 0;
    var ranges: [4096]m.Range = undefined;
    for (&ranges, 0..) |*r, i| r.* = .{ .startUnit = @intCast(i), .endUnit = @intCast(i + 1) };
    const over = [_]m.Target{.{ .ref = "p:1:0:0", .ranges = &ranges }};
    try std.testing.expectError(error.LimitExceeded, m.plan(a, .{ .binding = .{ .session = "s:1", .revision = 0 }, .targets = &over, .patch = .{ .reset = .all } }, R{ .calls = &calls }));
    try std.testing.expectEqual(@as(usize, 0), calls);
}

test "whole-w3/HWP5 absent character border reference is not resource zero and writes nothing" {
    const a = std.testing.allocator;
    const bytes = try std.Io.Dir.cwd().readFileAlloc(std.testing.io, "legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp", a, .limited(4_000_000));
    defer a.free(bytes);
    const session = try open(.hwp5, a, bytes);
    defer close(.hwp5, a, session);
    var history = try @import("../hwp5/edit/editor_history.zig").History.initV2(a, session, .{});
    defer history.deinit();
    var lifetime: @import("../model/formatting_binding.zig").State = .{};
    try lifetime.open();
    defer lifetime.close();
    const token = try lifetime.session(a);
    defer a.free(token);
    const S = @import("../wasm/formatting_service.zig").Service(.hwp5);
    const service: S = .{ .backend = .{ .session = session, .allocator = a }, .history = &history, .lifetime = &lifetime };
    var selected = false;
    for (0..try session.paragraphCount(0)) |paragraph| {
        const spans = try service.backend.spans(a, .{ .section = 0, .paragraph = paragraph });
        defer a.free(spans);
        for (spans) |span| {
            if (span.start >= span.end) continue;
            const ranges = [_]m.Range{.{ .startUnit = span.start, .endUnit = span.start + 1 }};
            const selectors = [_]@import("../wasm/formatting_query_request.zig").Selector{.{ .section = 0, .paragraph = @intCast(paragraph), .ranges = &ranges }};
            const query = service.query(a, .{ .binding = .{ .session = token, .revision = history.revision() }, .selectors = &selectors, .fields = &.{"character.border"} }) catch continue;
            defer a.free(query);
            const json = try std.json.parseFromSlice(std.json.Value, a, query, .{});
            defer json.deinit();
            const value = json.value.object.get("observations").?.object.get("aggregate").?.object.get("character.border").?.object;
            const reason = value.get("reason") orelse continue;
            if (!std.mem.eql(u8, reason.string, "MissingBorderFillReference")) continue;
            try std.testing.expect(!value.get("writable").?.bool);
            try std.testing.expectEqualStrings("unknown", value.get("state").?.string);
            const targets = [_]m.Target{.{ .ref = json.value.object.get("observations").?.object.get("perTarget").?.array.items[0].object.get("ref").?.string, .ranges = &ranges }};
            var patch: m.Patch = .{};
            var border: @import("../model/border_fill_patch.zig").Patch = .{};
            border.border.edges[0] = .{ .color = 0x123456 };
            patch.character.border_fill = border;
            const revision = history.revision();
            try std.testing.expectError(error.MissingBorderFillReference, service.apply(a, .{ .binding = .{ .session = token, .revision = revision }, .targets = &targets, .patch = patch }));
            try std.testing.expectEqual(revision, history.revision());
            const saved = try save(.hwp5, a, session);
            defer a.free(saved);
            try std.testing.expectEqualSlices(u8, bytes, saved);
            selected = true;
            break;
        }
        if (selected) break;
    }
    try std.testing.expect(selected);
}

test "whole-w3/paragraph empty ranges admitted but character empty null and scalar ranges rejected" {
    const a = std.testing.allocator;
    const decode = @import("../wasm/formatting_patch_request.zig").decode;
    const prefix = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s:1\",\"revision\":0},\"targets\":[{\"ref\":\"p:1:0:0\",\"ranges\":";
    inline for (.{ "{\"reset\":{\"basis\":\"paragraph-style\",\"scope\":\"paragraph\"}}", "{\"paragraph\":{\"grid\":false}}" }) |patch| {
        var request = try decode(a, prefix ++ "[]}],\"patch\":" ++ patch ++ "}");
        defer request.deinit();
        try std.testing.expectEqual(@as(usize, 0), request.value.targets[0].ranges.len);
        try std.testing.expect(!request.value.patch.hasCharacter());
    }
    inline for (.{ "{\"reset\":{\"basis\":\"paragraph-style\",\"scope\":\"character\"}}", "{\"reset\":{\"basis\":\"paragraph-style\",\"scope\":\"all\"}}", "{\"character\":{\"bold\":false}}" }) |patch| try std.testing.expectError(error.EmptyCharacterSelection, decode(a, prefix ++ "[]}],\"patch\":" ++ patch ++ "}"));
    inline for (.{ "null", "false", "0", "{}" }) |bad| try std.testing.expectError(error.InvalidFormattingType, decode(a, prefix ++ bad ++ "}],\"patch\":{\"paragraph\":{\"grid\":false}}}"));
}

test "whole-w3/paragraph apply targets required range cap and incomplete refs remain rejected" {
    const a = std.testing.allocator;
    const decode = @import("../wasm/formatting_patch_request.zig").decode;
    const base = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s:1\",\"revision\":0},\"targets\":";
    const suffix = ",\"patch\":{\"reset\":{\"basis\":\"paragraph-style\",\"scope\":\"paragraph\"}}}";
    try std.testing.expectError(error.LimitExceeded, decode(a, base ++ "[]" ++ suffix));
    inline for (.{ "[{}]", "[{\"ranges\":[]}]" }) |bad| try std.testing.expectError(error.MissingFormattingField, decode(a, base ++ bad ++ suffix));
    try std.testing.expectError(error.InvalidFormattingType, decode(a, base ++ "null" ++ suffix));
    inline for (.{ "[{\"ref\":\"p:1:0:0\"}]", "[{\"ref\":\"p:1:0:0\",\"ranges\":[]}]" }) |target| {
        var request = try decode(a, base ++ target ++ ",\"patch\":{}}");
        defer request.deinit();
        try std.testing.expect(!request.value.patch.hasCharacter());
        try std.testing.expect(!request.value.patch.hasParagraph());
        try std.testing.expectEqual(@as(usize, 0), request.value.targets[0].ranges.len);
    }
    try std.testing.expectError(error.LimitExceeded, @import("../wasm/formatting_patch_request.zig").decodeRanges(a, .{ .array = std.json.Array.init(a) }));
    const ranges = try a.alloc(m.Range, 4097);
    defer a.free(ranges);
    for (ranges, 0..) |*range, i| range.* = .{ .startUnit = @intCast(i), .endUnit = @intCast(i + 1) };
    const wire = try std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .binding = .{ .session = "s:1", .revision = @as(u32, 0) }, .targets = .{.{ .ref = "p:1:0:0", .ranges = ranges }}, .patch = .{ .paragraph = .{ .grid = false } } }, .{});
    defer a.free(wire);
    try std.testing.expectError(error.LimitExceeded, decode(a, wire));
}

fn targetDecoderAllocation(a: std.mem.Allocator) !void {
    const decode = @import("../wasm/formatting_patch_request.zig").decode;
    const raw = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s:1\",\"revision\":0},\"targets\":[{\"ref\":\"p:1:0:2\",\"ranges\":[{\"startUnit\":0,\"endUnit\":1}]},{\"ref\":\"p:1:0:1\",\"ranges\":[{\"startUnit\":0,\"endUnit\":1}]}],\"patch\":{\"character\":{\"bold\":true}}}";
    var request = try decode(a, raw);
    defer request.deinit();
    try std.testing.expectEqualStrings("p:1:0:2", request.value.targets[0].ref);
    try std.testing.expectEqualStrings("p:1:0:1", request.value.targets[1].ref);
    try std.testing.expectEqualDeep(request.value.targets[0].ranges, request.value.targets[1].ranges);
}
test "whole-w3/target hash membership preserves order exact refs ranges and allocation cleanup" {
    const a = std.testing.allocator;
    try targetDecoderAllocation(a);
    try std.testing.checkAllAllocationFailures(a, targetDecoderAllocation, .{});
    const decode = @import("../wasm/formatting_patch_request.zig").decode;
    const raw = "{\"schemaVersion\":1,\"binding\":{\"session\":\"s:1\",\"revision\":0},\"targets\":[{\"ref\":\"p:1:0:2\",\"ranges\":[]},{\"ref\":\"p:1:0:2\",\"ranges\":[]}],\"patch\":{\"paragraph\":{\"grid\":false}}}";
    try std.testing.expectError(error.DuplicateFormattingTarget, decode(a, raw));
}

test "whole-w3/target hash bucket collisions keep exact membership and original order" {
    const a = std.testing.allocator;
    var targets: std.ArrayList(m.Target) = .empty;
    defer {
        for (targets.items) |target| a.free(target.ref);
        targets.deinit(a);
    }
    var ordinal: u32 = 0;
    while (targets.items.len < 128) : (ordinal += 1) {
        const ref = try std.fmt.allocPrint(a, "p:1:0:{d}", .{ordinal});
        if (((std.hash_map.StringContext{}).hash(ref) & 255) != 0) {
            a.free(ref);
            continue;
        }
        try targets.append(a, .{ .ref = ref });
    }
    try m.requireDistinctTargets(a, targets.items);
    const raw = try std.json.Stringify.valueAlloc(a, .{ .schemaVersion = @as(u32, 1), .binding = .{ .session = "s:1", .revision = @as(u32, 0) }, .targets = targets.items, .patch = .{ .paragraph = .{ .grid = false } } }, .{});
    defer a.free(raw);
    var request = try @import("../wasm/formatting_patch_request.zig").decode(a, raw);
    defer request.deinit();
    try std.testing.expectEqual(@as(usize, 128), request.value.targets.len);
    for (targets.items, request.value.targets) |expected, actual| try std.testing.expectEqualStrings(expected.ref, actual.ref);
    const saved = targets.items[127].ref;
    targets.items[127].ref = targets.items[0].ref;
    defer targets.items[127].ref = saved;
    try std.testing.expectError(error.DuplicateFormattingTarget, m.requireDistinctTargets(a, targets.items));
}

//! Private immutable whole-file adapter. No Session/model/cache mutation.
const std = @import("std");
const grid = @import("source_table_grid.zig");
const framing = @import("../record.zig");
const Source = @import("../text_source.zig").Source;
const Cfb = @import("../../cfb/reader.zig").File;
const stream = @import("../stream.zig");
const Version = @import("../version.zig").Version;
pub const Command = @import("../../model/table_grid_edit_plan.zig").Command;
pub const Request = struct {
    section: usize,
    table_node: usize,
    expected_rows: u32,
    expected_columns: u32,
    command: Command,
    layout: @import("../body/list_header.zig").Layout,
};
pub const Options = struct {
    max_input_bytes: usize = 64 * 1024 * 1024,
    max_output_bytes: usize = 128 * 1024 * 1024,
    max_section_bytes: usize = 32 * 1024 * 1024,
    /// DocInfo plus ALL decoded sections (not compressed stream lengths).
    max_decoded_bytes: usize = 64 * 1024 * 1024,
    /// Aggregate DocInfo and all sections; primitive output has the same cap.
    max_records: usize = 1_000_000,
    /// Counts occurrences, including pre-existing zero/duplicate IDs.
    max_paragraphs: usize = 100_000,
    max_cells: usize = 100_000,
};

/// Caller frees the new CFB bytes. Source and all non-target stream contents
/// remain unchanged. Canonical CFB sectors/directory ordering may differ.
pub fn transform(a: std.mem.Allocator, input: []const u8, request: Request, options: Options) ![]u8 {
    if (input.len == 0 or input.len > options.max_input_bytes) return error.LimitExceeded;
    var arena = std.heap.ArenaAllocator.init(a);
    defer arena.deinit();
    const s = arena.allocator();
    var opened = try openBounded(s, input, options.max_input_bytes, options);
    defer opened.source.deinit();
    const source = &opened.source;
    if (source.header.has(.history) or source.header.has(.digital_signature) or source.header.has(.signature_preview)) return error.UnsupportedSourceTableGridSaveFeatures;
    if (request.section >= source.section_count) return error.InvalidSection;
    const plan = try @import("../../model/table_grid_edit_plan.zig").create(request.expected_rows, request.expected_columns, request.command, options.max_cells);
    var ids: std.AutoHashMap(u32, void) = .init(s);
    defer ids.deinit();
    const inventory = try inspect(s, &opened, request.section, options, &ids);
    if (plan.inserted_count > options.max_paragraphs - inventory.total.paragraphs) return error.LimitExceeded;
    const fresh = try s.alloc(u32, plan.inserted_count);
    // One monotone cursor: expected O(records + paragraphs + inserted cells),
    // independent of existing ID magnitudes, with no wraparound.
    var candidate: u32 = 1;
    for (fresh) |*id| {
        while (ids.contains(candidate)) candidate = std.math.add(u32, candidate, 1) catch return error.InstanceIdExhausted;
        id.* = candidate;
        try ids.put(candidate, {});
    }
    // Reserve the complete non-target inventory before the primitive allocates
    // its output; its local limit alone cannot enforce a document-wide cap.
    var candidate_total = inventory.total;
    candidate_total.bytes -= inventory.target.len;
    candidate_total.records -= inventory.target_records;
    candidate_total.paragraphs -= inventory.target_paragraphs;
    const changed = try grid.prepare(s, inventory.target, source.header.version(), .{
        .table_node = request.table_node,
        .expected_rows = request.expected_rows,
        .expected_columns = request.expected_columns,
        .command = request.command,
        .layout = request.layout,
        .new_paragraph_ids = fresh,
    }, .{
        .max_bytes = @min(options.max_section_bytes, options.max_decoded_bytes - candidate_total.bytes),
        .max_records = options.max_records - candidate_total.records,
        .max_cells = options.max_cells,
    });
    try candidate_total.add(changed, true, source.header.version(), options, null);
    const stored = if (source.header.has(.compressed)) try @import("../../compression/raw_deflate.zig").encodeStored(s, changed, options.max_output_bytes) else changed;
    const path = try std.fmt.allocPrint(s, "/BodyText/Section{d}", .{request.section});
    const output = try @import("../../cfb/stream_replace.zig").rebuildExact(a, &source.file, path, stored, .{ .max_output_bytes = options.max_output_bytes });
    errdefer a.free(output);
    // Strict CFB + bounded source reopen: even DocInfo's initial decode obeys
    // the caller's aggregate budget, unlike the general Source.open defaults.
    var reopened = try openBounded(s, output, options.max_output_bytes, options);
    defer reopened.source.deinit();
    const checked = try inspect(s, &reopened, request.section, options, null);
    if (!std.mem.eql(u8, changed, checked.target) or
        !std.meta.eql(candidate_total, checked.total) or
        source.section_count != reopened.source.section_count or
        !std.mem.eql(u8, &source.header.raw, &reopened.source.header.raw)) return error.OutputValidationFailed;
    try verifyIdentity(s, &source.file, &reopened.source.file, path, stored);
    return output;
}

const Totals = struct {
    bytes: usize = 0,
    records: usize = 0,
    paragraphs: usize = 0,

    fn add(self: *Totals, raw: []const u8, section: bool, version: Version, options: Options, ids: ?*std.AutoHashMap(u32, void)) !void {
        if (raw.len > options.max_decoded_bytes - self.bytes) return error.LimitExceeded;
        self.bytes += raw.len;
        var it = framing.Iterator.init(raw, .{ .max_records = options.max_records - self.records });
        while (try it.next()) |record| {
            self.records += 1;
            if (!section or record.tag != 66) continue;
            if (self.paragraphs >= options.max_paragraphs) return error.LimitExceeded;
            self.paragraphs += 1;
            const id = (try @import("../body/paragraph_header.zig").Header.parse(record.payload, version)).instance_id;
            if (ids) |map| try map.put(id, {});
        }
    }
};
const Inventory = struct {
    total: Totals,
    target: []const u8,
    target_records: usize,
    target_paragraphs: usize,
};
fn inspect(s: std.mem.Allocator, opened: *const Opened, selected: usize, options: Options, ids: ?*std.AutoHashMap(u32, void)) !Inventory {
    const source = &opened.source;
    const info = opened.info;
    var result: Inventory = .{ .total = .{}, .target = &.{}, .target_records = 0, .target_paragraphs = 0 };
    try result.total.add(info, false, source.header.version(), options, null);
    const resources = try @import("../docinfo/resources.zig").inspect(info, source.header.version(), .{ .max_records = options.max_records });
    try resources.validateKnownCounts();
    for (opened.sections, 0..) |encoded, index| {
        const raw = try stream.decode(s, &source.header, encoded, @min(options.max_section_bytes, options.max_decoded_bytes - result.total.bytes));
        const before = result.total;
        try result.total.add(raw, true, source.header.version(), options, ids);
        if (index == selected) {
            result.target = raw;
            result.target_records = result.total.records - before.records;
            result.target_paragraphs = result.total.paragraphs - before.paragraphs;
        }
    }
    return result;
}

// Encoded slices borrow the CFB; this is an index, never a copied opaque model.
const Opened = struct { source: Source, info: []const u8, sections: [][]const u8 };
/// Assemble the existing Source view using the public format APIs, with a
/// bounded first DocInfo decode. Repairs are intentionally never adopted here.
fn openBounded(s: std.mem.Allocator, input: []const u8, byte_limit: usize, options: Options) !Opened {
    var limits = @import("../text_source.zig").cfb_limits;
    limits.max_input_bytes = @min(limits.max_input_bytes, byte_limit);
    var file = Cfb.open(s, input, limits) catch |err| switch (err) {
        error.InvalidRoot, error.InvalidFat, error.InvalidUnusedEntry, error.UnclaimedMiniSector => return error.RepairedSourceUnsupported,
        else => return err,
    };
    errdefer file.deinit();
    const header = try @import("../file_header.zig").Header.parse(try file.readStream(s, "/FileHeader"));
    const info = try stream.decode(s, &header, try file.readStream(s, "/DocInfo"), @min(options.max_section_bytes, options.max_decoded_bytes));
    var total: Totals = .{};
    try total.add(info, false, header.version(), options, null);
    const count = (try @import("../docinfo/section_count.zig").locate(info, header.version())).value;
    if (count == 0 or count > 1024) return error.InvalidSectionCount;
    const body_index = try file.findExact("/BodyText") orelse return error.StreamNotFound;
    if (file.entries[body_index].kind != 1) return error.NotAStorage;
    const sections = try s.alloc([]const u8, count);
    var found: usize = 0;
    for (file.entries) |entry| {
        if (entry.parent != body_index or entry.kind != 2) continue;
        const index = (try @import("../container/numbered_stream.zig").index(u16, "Section", entry.name)) orelse return error.UnexpectedBodyStream;
        if (index >= count) return error.SectionCountMismatch;
        sections[index] = entry.content;
        found += 1;
    }
    if (found != count) return error.SectionCountMismatch;
    return .{ .source = .{ .file = file, .header = header, .section_count = count, .declared_section_count = count }, .info = info, .sections = sections };
}

/// Paths form a single reusable inventory; no per-entry nested manifest scan.
/// Directory sector IDs, colors and sibling indices are physical layout only.
fn verifyIdentity(s: std.mem.Allocator, before: *const Cfb, after: *const Cfb, target: []const u8, stored: []const u8) !void {
    if (before.header.major != after.header.major) return error.OutputValidationFailed;
    var entries: std.StringHashMap(usize) = .init(s);
    defer entries.deinit();
    const selected = try before.findExact(target) orelse return error.StreamNotFound;
    for (before.entries, 0..) |entry, index| {
        if (entry.kind != 0) try entries.put(entry.path, index);
    }
    for (after.entries) |entry| {
        if (entry.kind == 0) continue;
        const match = entries.fetchRemove(entry.path) orelse return error.OutputValidationFailed;
        const old = before.entries[match.value];
        if (old.kind != entry.kind or !std.mem.eql(u8, old.name, entry.name) or
            !std.mem.eql(u8, &old.clsid, &entry.clsid) or old.state != entry.state or
            old.created != entry.created or old.modified != entry.modified) return error.OutputValidationFailed;
        if (old.parent == 0xffffffff or entry.parent == 0xffffffff) {
            if (old.parent != entry.parent) return error.OutputValidationFailed;
        } else if (!std.mem.eql(u8, before.entries[old.parent].path, after.entries[entry.parent].path)) return error.OutputValidationFailed;
        if (entry.kind == 2 and !std.mem.eql(u8, if (match.value == selected) stored else old.content, entry.content)) return error.OutputValidationFailed;
    }
    if (entries.count() != 0) return error.OutputValidationFailed;
}

test "HWP5 source file grid reopened identity rejects altered metadata streams and inventory" {
    const a = std.testing.allocator;
    const writer = @import("../../cfb/writer.zig");
    const nodes = [_]writer.Node{
        .{ .name = "Root Entry", .kind = 5, .clsid = @splat(7), .state = 9, .modified = 11 },
        .{ .name = "BodyText", .parent = 0, .kind = 1, .clsid = @splat(13), .state = 15, .created = 17, .modified = 19 },
        .{ .name = "Section0", .parent = 1, .content = "old section" },
        .{ .name = "DocInfo", .parent = 0, .content = "preserved info", .state = 21 },
    };
    const input = try writer.write(a, &nodes, .{});
    defer a.free(input);
    var before = try Cfb.open(a, input, .{ .strict = true });
    defer before.deinit();
    // Legal canonical output with reordered directory IDs must still pass.
    var reordered = [_]writer.Node{ nodes[0], nodes[3], nodes[1], nodes[2] };
    reordered[3].parent = 2;
    reordered[3].content = "changed section";
    const output = try writer.write(a, &reordered, .{});
    defer a.free(output);
    var after = try Cfb.open(a, output, .{ .strict = true });
    defer after.deinit();
    try verifyIdentity(a, &before, &after, "/BodyText/Section0", "changed section");
    const Mutation = enum { target, other, root_clsid, root_state, root_modified, storage_clsid, storage_state, storage_created, storage_modified, stream_state, missing, extra, parent, kind };
    for (std.enums.values(Mutation)) |mutation| {
        var changed: [5]writer.Node = undefined;
        @memcpy(changed[0..4], &nodes);
        changed[2].content = "changed section";
        var count: usize = 4;
        switch (mutation) {
            .target => changed[2].content = "wrong section",
            .other => changed[3].content = "wrong info",
            .root_clsid => changed[0].clsid = @splat(23),
            .root_state => changed[0].state += 1,
            .root_modified => changed[0].modified += 1,
            .storage_clsid => changed[1].clsid = @splat(25),
            .storage_state => changed[1].state += 1,
            .storage_created => changed[1].created += 1,
            .storage_modified => changed[1].modified += 1,
            .stream_state => changed[3].state += 1,
            .missing => count = 3,
            .extra => {
                changed[4] = .{ .name = "Extra", .parent = 0, .content = "unexpected" };
                count = 5;
            },
            .parent => changed[3].parent = 1,
            .kind => {
                changed[3].kind = 1;
                changed[3].content = "";
            },
        }
        const bytes = try writer.write(a, changed[0..count], .{});
        defer a.free(bytes);
        var bad = try Cfb.open(a, bytes, .{ .strict = true });
        defer bad.deinit();
        try std.testing.expectError(error.OutputValidationFailed, verifyIdentity(a, &before, &bad, "/BodyText/Section0", "changed section"));
    }
}

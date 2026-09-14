const std = @import("std");
const header_types = @import("header.zig");
const palette_records = @import("palette_records.zig");
const records = @import("records.zig");

const Slot = union(enum) {
    empty,
    other,
    palette: u32,
};

pub const Report = struct {
    creates: usize = 0,
    deletes: usize = 0,
    palette_selects: usize = 0,
    palette_updates: usize = 0,
    peak_live: usize = 0,
    final_live: usize = 0,
};

const State = struct {
    slots: []Slot,
    live: usize = 0,
    report: Report = .{},

    fn explicitIndex(self: State, handle: u32) !usize {
        if (handle == 0 or handle & 0x80000000 != 0) return error.InvalidEmfObjectHandle;
        if (handle >= self.slots.len) return error.EmfObjectHandleOutOfBounds;
        return @intCast(handle);
    }

    fn create(self: *State, handle: u32, slot: Slot) !void {
        const index = try self.explicitIndex(handle);
        if (self.slots[index] == .empty) self.live += 1;
        self.slots[index] = slot;
        self.report.creates += 1;
        self.report.peak_live = @max(self.report.peak_live, self.live);
    }

    fn palette(self: State, handle: u32) !u32 {
        const index = try self.explicitIndex(handle);
        return switch (self.slots[index]) {
            .palette => |count| count,
            .empty => error.DeadEmfObjectReference,
            .other => error.InvalidEmfPaletteObjectType,
        };
    }

    fn consume(self: *State, record: records.Record) !void {
        const palette_value = try palette_records.parse(record);
        if (palette_value) |value| switch (value) {
            .create => |create_value| {
                try self.create(create_value.handle, .{ .palette = @intCast(create_value.entries.count) });
                return;
            },
            .select => |handle| {
                if (handle != palette_records.default_palette) _ = try self.palette(handle);
                self.report.palette_selects += 1;
                return;
            },
            .set_entries => |set_value| {
                const current = try self.palette(set_value.handle);
                const end = @as(u64, set_value.start) + set_value.entries.count;
                if (end > current) return error.EmfPaletteUpdateOutOfBounds;
                self.report.palette_updates += 1;
                return;
            },
            .resize => |resize_value| {
                const index = try self.explicitIndex(resize_value.handle);
                _ = try self.palette(resize_value.handle);
                self.slots[index] = .{ .palette = resize_value.entries };
                self.report.palette_updates += 1;
                return;
            },
            .realize => return,
        };

        if (isCreation(record.kind)) {
            if (record.bytes.len < 12) return error.InvalidEmfObjectCreationRecordSize;
            try self.create(std.mem.readInt(u32, record.bytes[8..12], .little), .other);
            return;
        }
        if (record.kind == .deleteobject) {
            if (record.size != 12 or record.bytes.len != 12) return error.InvalidEmfDeleteObjectRecordSize;
            const index = try self.explicitIndex(std.mem.readInt(u32, record.bytes[8..12], .little));
            if (self.slots[index] == .empty) return error.DeadEmfObjectReference;
            self.slots[index] = .empty;
            self.live -= 1;
            self.report.deletes += 1;
        }
    }
};

fn isCreation(kind: records.RecordType) bool {
    return switch (kind) {
        .createpen,
        .createbrushindirect,
        .createpalette,
        .extcreatefontindirectw,
        .createmonobrush,
        .createdibpatternbrushpt,
        .extcreatepen,
        .createcolorspace,
        .createcolorspacew,
        => true,
        else => false,
    };
}

pub fn validate(a: std.mem.Allocator, bytes: []const u8, header: header_types.Header) !Report {
    const slot_count = @as(usize, header.handles) + 1;
    const slots = try a.alloc(Slot, slot_count);
    defer a.free(slots);
    @memset(slots, .empty);
    var state: State = .{ .slots = slots };
    var iterator: records.Iterator = .{ .bytes = bytes };
    while (try iterator.next()) |record| try state.consume(record);
    state.report.final_live = state.live;
    return state.report;
}

fn fixture(kind: records.RecordType, bytes: []const u8) records.Record {
    return .{ .offset = 0, .kind = kind, .size = @intCast(bytes.len), .bytes = bytes, .end = bytes.len };
}

fn handleRecord(handle: u32) [12]u8 {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    return bytes;
}

fn createPalette(handle: u32, count: u16) [20]u8 {
    var bytes = [_]u8{0} ** 20;
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    std.mem.writeInt(u16, bytes[12..14], 0x0300, .little);
    std.mem.writeInt(u16, bytes[14..16], count, .little);
    return bytes;
}

test "object table bounds creation replacement deletion and slot reuse" {
    var slots = [_]Slot{.empty} ** 3;
    var state: State = .{ .slots = &slots };
    _ = try state.consume(fixture(.createpen, &handleRecord(1)));
    _ = try state.consume(fixture(.createbrushindirect, &handleRecord(1)));
    try std.testing.expectError(error.EmfObjectHandleOutOfBounds, state.consume(fixture(.createpen, &handleRecord(3))));
    try std.testing.expectError(error.InvalidEmfObjectHandle, state.consume(fixture(.createpen, &handleRecord(0x80000000))));
    _ = try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try std.testing.expectError(error.DeadEmfObjectReference, state.consume(fixture(.deleteobject, &handleRecord(1))));
    _ = try state.consume(fixture(.createpen, &handleRecord(1)));
    try std.testing.expectEqual(@as(usize, 3), state.report.creates);
    try std.testing.expectEqual(@as(usize, 1), state.report.deletes);
    try std.testing.expectEqual(@as(usize, 1), state.report.peak_live);
}

test "object table tracks every non-palette creation record kind" {
    var slots = [_]Slot{.empty} ** 2;
    var state: State = .{ .slots = &slots };
    for ([_]records.RecordType{
        .createpen,
        .createbrushindirect,
        .extcreatefontindirectw,
        .createmonobrush,
        .createdibpatternbrushpt,
        .extcreatepen,
        .createcolorspace,
        .createcolorspacew,
    }) |kind| {
        _ = try state.consume(fixture(kind, &handleRecord(1)));
        _ = try state.consume(fixture(.deleteobject, &handleRecord(1)));
    }
    try std.testing.expectEqual(@as(usize, 8), state.report.creates);
    try std.testing.expectEqual(@as(usize, 8), state.report.deletes);
    try std.testing.expectEqual(@as(usize, 1), state.report.peak_live);
    try std.testing.expectEqual(@as(usize, 0), state.live);
}

test "palette references require a live palette and current entry bounds" {
    var slots = [_]Slot{.empty} ** 4;
    var state: State = .{ .slots = &slots };
    _ = try state.consume(fixture(.createpalette, &createPalette(1, 1)));
    _ = try state.consume(fixture(.createpen, &handleRecord(2)));
    _ = try state.consume(fixture(.selectpalette, &handleRecord(1)));
    _ = try state.consume(fixture(.selectpalette, &handleRecord(palette_records.default_palette)));
    try std.testing.expectError(error.InvalidEmfPaletteObjectType, state.consume(fixture(.selectpalette, &handleRecord(2))));
    try std.testing.expectError(error.DeadEmfObjectReference, state.consume(fixture(.selectpalette, &handleRecord(3))));

    var set = [_]u8{0} ** 24;
    std.mem.writeInt(u32, set[8..12], 1, .little);
    std.mem.writeInt(u32, set[12..16], 1, .little);
    std.mem.writeInt(u32, set[16..20], 1, .little);
    try std.testing.expectError(error.EmfPaletteUpdateOutOfBounds, state.consume(fixture(.setpaletteentries, &set)));
    std.mem.writeInt(u32, set[12..16], std.math.maxInt(u32), .little);
    try std.testing.expectError(error.EmfPaletteUpdateOutOfBounds, state.consume(fixture(.setpaletteentries, &set)));
    std.mem.writeInt(u32, set[12..16], 0, .little);
    _ = try state.consume(fixture(.setpaletteentries, &set));

    var resize = [_]u8{0} ** 16;
    std.mem.writeInt(u32, resize[8..12], 1, .little);
    std.mem.writeInt(u32, resize[12..16], 2, .little);
    _ = try state.consume(fixture(.resizepalette, &resize));
    std.mem.writeInt(u32, set[12..16], 1, .little);
    _ = try state.consume(fixture(.setpaletteentries, &set));
    try std.testing.expectEqual(@as(usize, 3), state.report.palette_updates);
}

test "object table validates record sizes and allocator failure" {
    var slots = [_]Slot{.empty} ** 2;
    var state: State = .{ .slots = &slots };
    const short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfObjectCreationRecordSize, state.consume(fixture(.createpen, &short)));
    const long_delete = [_]u8{0} ** 16;
    try std.testing.expectError(error.InvalidEmfDeleteObjectRecordSize, state.consume(fixture(.deleteobject, &long_delete)));

    var empty: [0]u8 = .{};
    var fba = std.heap.FixedBufferAllocator.init(&empty);
    const header = std.mem.zeroes(header_types.Header);
    try std.testing.expectError(error.OutOfMemory, validate(fba.allocator(), &.{}, header));
}

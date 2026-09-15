const std = @import("std");
const header_types = @import("header.zig");
const palette_records = @import("palette_records.zig");
const records = @import("records.zig");
const record_extent = @import("record_extent.zig");
const dc_stack = @import("dc_stack.zig");
const stock_object = @import("stock_object.zig");
const color_space_records = @import("color_space_records.zig");
const color_space_creation = @import("color_space_creation.zig");
const basic_object_creation = @import("basic_object_creation.zig");
const extended_pen_creation = @import("extended_pen_creation.zig");
const bitmap_brush_creation = @import("bitmap_brush_creation.zig");
const font_creation = @import("font_creation.zig");
const region_drawing = @import("region_drawing.zig");

const Slot = union(enum) {
    empty,
    object: stock_object.Kind,
    palette: u32,
};

fn slotKind(slot: Slot) ?stock_object.Kind {
    return switch (slot) {
        .empty => null,
        .object => |kind| kind,
        .palette => .palette,
    };
}

const Selection = struct {
    brush: ?u32 = null,
    pen: ?u32 = null,
    font: ?u32 = null,
    palette: ?u32 = null,
    color_space: ?u32 = null,

    fn select(self: *Selection, kind: stock_object.Kind, handle: ?u32) !void {
        switch (kind) {
            .brush => self.brush = handle,
            .pen => self.pen = handle,
            .font => self.font = handle,
            .palette => self.palette = handle,
            .color_space => self.color_space = handle,
        }
    }

    fn clear(self: *Selection, handle: u32) bool {
        var changed = false;
        inline for (.{ "brush", "pen", "font", "palette", "color_space" }) |field| {
            if (@field(self, field) == @as(?u32, handle)) {
                @field(self, field) = null;
                changed = true;
            }
        }
        return changed;
    }

    fn explicitCount(self: Selection) usize {
        return @intFromBool(self.brush != null) + @intFromBool(self.pen != null) + @intFromBool(self.font != null) + @intFromBool(self.palette != null) + @intFromBool(self.color_space != null);
    }
};

pub const Report = struct {
    creates: usize = 0,
    deletes: usize = 0,
    palette_selects: usize = 0,
    palette_updates: usize = 0,
    selections: usize = 0,
    stock_selections: usize = 0,
    default_restores: usize = 0,
    replacement_deactivations: usize = 0,
    color_space_sets: usize = 0,
    color_space_deletes: usize = 0,
    region_brush_uses: usize = 0,
    peak_live: usize = 0,
    final_live: usize = 0,
    final_explicit_selected: usize = 0,
};

const State = struct {
    slots: []Slot,
    snapshots: []Selection = &.{},
    snapshot_count: usize = 0,
    selected: Selection = .{},
    live: usize = 0,
    report: Report = .{},

    fn explicitIndex(self: State, handle: u32) !usize {
        if (handle == 0 or handle & 0x80000000 != 0) return error.InvalidEmfObjectHandle;
        if (handle >= self.slots.len) return error.EmfObjectHandleOutOfBounds;
        return @intCast(handle);
    }

    fn create(self: *State, handle: u32, slot: Slot) !void {
        const index = try self.explicitIndex(handle);
        const previous_kind = slotKind(self.slots[index]);
        if (previous_kind == null) {
            self.live += 1;
        } else if (previous_kind.? != slotKind(slot).?) {
            var deactivated = self.selected.clear(handle);
            for (self.snapshots[0..self.snapshot_count]) |*snapshot| deactivated = snapshot.clear(handle) or deactivated;
            self.report.replacement_deactivations += @intFromBool(deactivated);
        }
        self.slots[index] = slot;
        self.report.creates += 1;
        self.report.peak_live = @max(self.report.peak_live, self.live);
    }

    fn palette(self: State, handle: u32) !u32 {
        const index = try self.explicitIndex(handle);
        return switch (self.slots[index]) {
            .palette => |count| count,
            .empty => error.DeadEmfObjectReference,
            .object => error.InvalidEmfPaletteObjectType,
        };
    }

    fn requireKind(self: State, handle: u32, expected: stock_object.Kind) !usize {
        const index = try self.explicitIndex(handle);
        const actual = slotKind(self.slots[index]) orelse return error.DeadEmfObjectReference;
        if (actual != expected) return error.InvalidEmfObjectType;
        return index;
    }

    fn requireBrush(self: State, handle: u32) !void {
        if (handle & 0x80000000 != 0) {
            if (stock_object.kind(try stock_object.parse(handle)) != .brush) return error.InvalidEmfObjectType;
            return;
        }
        _ = try self.requireKind(handle, .brush);
    }

    fn delete(self: *State, handle: u32, expected: ?stock_object.Kind) !void {
        const index = if (expected) |kind| try self.requireKind(handle, kind) else try self.explicitIndex(handle);
        if (self.slots[index] == .empty) return error.DeadEmfObjectReference;
        if (self.selected.clear(@intCast(index))) self.report.default_restores += 1;
        for (self.snapshots[0..self.snapshot_count]) |*snapshot| _ = snapshot.clear(@intCast(index));
        self.slots[index] = .empty;
        self.live -= 1;
        self.report.deletes += 1;
    }

    fn selectObject(self: *State, record: records.Record) !void {
        if (!record_extent.hasRequiredPrefix(record, 12)) return error.InvalidEmfSelectObjectRecordSize;
        const handle = std.mem.readInt(u32, record.bytes[8..12], .little);
        if (handle == 0) return error.InvalidEmfObjectHandle;
        if (handle & 0x80000000 != 0) {
            const kind = stock_object.kind(try stock_object.parse(handle));
            if (kind == .palette) return error.InvalidEmfSelectableObjectType;
            try self.selected.select(kind, null);
            self.report.selections += 1;
            self.report.stock_selections += 1;
            return;
        }
        const index = try self.explicitIndex(handle);
        const kind = switch (self.slots[index]) {
            .empty => return error.DeadEmfObjectReference,
            .palette => return error.InvalidEmfSelectableObjectType,
            .object => |kind| if (kind == .color_space) return error.InvalidEmfSelectableObjectType else kind,
        };
        try self.selected.select(kind, handle);
        self.report.selections += 1;
    }

    fn consumeDc(self: *State, record: records.Record) !bool {
        const action = (try dc_stack.parse(record)) orelse return false;
        switch (action) {
            .save => {
                if (self.snapshot_count == self.snapshots.len) return error.EmfDcStackOverflow;
                self.snapshots[self.snapshot_count] = self.selected;
                self.snapshot_count += 1;
            },
            .restore => |saved_dc| {
                const distance: usize = @intCast(-@as(i64, saved_dc));
                if (distance > self.snapshot_count) return error.InvalidEmfRestoreDcDepth;
                const target = self.snapshot_count - distance;
                self.selected = self.snapshots[target];
                self.snapshot_count = target;
            },
        }
        return true;
    }

    fn consume(self: *State, record: records.Record) !void {
        if (try self.consumeDc(record)) return;
        if (record.kind == .selectobject) {
            try self.selectObject(record);
            return;
        }
        if (try color_space_records.parse(record)) |action| {
            switch (action) {
                .set => |handle| {
                    _ = try self.requireKind(handle, .color_space);
                    try self.selected.select(.color_space, handle);
                    self.report.color_space_sets += 1;
                },
                .delete => |handle| {
                    try self.delete(handle, .color_space);
                    self.report.color_space_deletes += 1;
                },
            }
            return;
        }
        if (try color_space_creation.parse(record)) |creation| {
            const handle = switch (creation) {
                .ansi => |value| value.handle,
                .wide => |value| value.handle,
            };
            try self.create(handle, .{ .object = .color_space });
            return;
        }
        if (try region_drawing.parse(record)) |drawing| {
            switch (drawing) {
                .fill => |value| {
                    try self.requireBrush(value.brush_handle);
                    self.report.region_brush_uses += 1;
                },
                .frame => |value| {
                    try self.requireBrush(value.brush_handle);
                    self.report.region_brush_uses += 1;
                },
                .invert, .paint => {},
            }
            return;
        }
        if (try basic_object_creation.parse(record)) |creation| {
            switch (creation) {
                .pen => |value| try self.create(value.handle, .{ .object = .pen }),
                .brush => |value| try self.create(value.handle, .{ .object = .brush }),
            }
            return;
        }
        if (try extended_pen_creation.parse(record)) |creation| {
            try self.create(creation.handle, .{ .object = .pen });
            return;
        }
        if (try bitmap_brush_creation.parse(record)) |creation| {
            try self.create(creation.handle, .{ .object = .brush });
            return;
        }
        if (try font_creation.parse(record)) |creation| {
            try self.create(creation.handle, .{ .object = .font });
            return;
        }
        const palette_value = try palette_records.parse(record);
        if (palette_value) |value| switch (value) {
            .create => |create_value| {
                try self.create(create_value.handle, .{ .palette = @intCast(create_value.entries.count) });
                return;
            },
            .select => |handle| {
                if (handle == palette_records.default_palette) {
                    try self.selected.select(.palette, null);
                } else {
                    _ = try self.palette(handle);
                    try self.selected.select(.palette, handle);
                }
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
            try self.create(std.mem.readInt(u32, record.bytes[8..12], .little), .{ .object = creationKind(record.kind).? });
            return;
        }
        if (record.kind == .deleteobject) {
            if (!record_extent.hasRequiredPrefix(record, 12)) return error.InvalidEmfDeleteObjectRecordSize;
            try self.delete(std.mem.readInt(u32, record.bytes[8..12], .little), null);
        }
    }
};

fn isCreation(kind: records.RecordType) bool {
    return creationKind(kind) != null;
}

fn creationKind(kind: records.RecordType) ?stock_object.Kind {
    return switch (kind) {
        .createpalette => .palette,
        else => null,
    };
}

pub fn validate(a: std.mem.Allocator, bytes: []const u8, header: header_types.Header) !Report {
    const slot_count = @as(usize, header.handles) + 1;
    const slots = try a.alloc(Slot, slot_count);
    defer a.free(slots);
    @memset(slots, .empty);
    var save_count: usize = 0;
    var counter: records.Iterator = .{ .bytes = bytes };
    while (try counter.next()) |record|
        save_count += @intFromBool(record.kind == .savedc);
    const snapshots = try a.alloc(Selection, save_count);
    defer a.free(snapshots);
    var state: State = .{ .slots = slots, .snapshots = snapshots };
    var iterator: records.Iterator = .{ .bytes = bytes };
    while (try iterator.next()) |record| try state.consume(record);
    state.report.final_live = state.live;
    state.report.final_explicit_selected = state.selected.explicitCount();
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

fn createPen(handle: u32) [28]u8 {
    var bytes = [_]u8{0} ** 28;
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    std.mem.writeInt(i32, bytes[16..20], 1, .little);
    return bytes;
}

fn createBrush(handle: u32) [24]u8 {
    var bytes = [_]u8{0} ** 24;
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    return bytes;
}

fn regionBrushRecord(kind: records.RecordType, handle: u32) [88]u8 {
    std.debug.assert(kind == .fillrgn or kind == .framergn);
    const fixed_end: usize = if (kind == .fillrgn) 32 else 40;
    var bytes = [_]u8{0} ** 88;
    std.mem.writeInt(u32, bytes[24..28], 48, .little);
    std.mem.writeInt(u32, bytes[28..32], handle, .little);
    std.mem.writeInt(u32, bytes[fixed_end..][0..4], @import("region_data.zig").header_size, .little);
    std.mem.writeInt(u32, bytes[fixed_end + 4 ..][0..4], @import("region_data.zig").rectangle_type, .little);
    std.mem.writeInt(u32, bytes[fixed_end + 8 ..][0..4], 1, .little);
    std.mem.writeInt(u32, bytes[fixed_end + 12 ..][0..4], @import("region_data.zig").rectangle_size, .little);
    return bytes;
}

fn createExtendedPen(handle: u32) [extended_pen_creation.minimum_size]u8 {
    var bytes = [_]u8{0} ** extended_pen_creation.minimum_size;
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    std.mem.writeInt(u32, bytes[32..36], 1, .little);
    return bytes;
}

fn createBitmapBrush(kind: records.RecordType, handle: u32) [60]u8 {
    std.debug.assert(kind == .createmonobrush or kind == .createdibpatternbrushpt);
    var bytes = [_]u8{0} ** 60;
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    std.mem.writeInt(u32, bytes[16..20], 32, .little);
    std.mem.writeInt(u32, bytes[20..24], 18, .little);
    std.mem.writeInt(u32, bytes[24..28], 50, .little);
    std.mem.writeInt(u32, bytes[28..32], 8, .little);
    std.mem.writeInt(u32, bytes[32..36], 12, .little);
    std.mem.writeInt(u16, bytes[36..38], 2, .little);
    std.mem.writeInt(u16, bytes[38..40], 2, .little);
    std.mem.writeInt(u16, bytes[40..42], 1, .little);
    std.mem.writeInt(u16, bytes[42..44], 1, .little);
    return bytes;
}

fn createFont(handle: u32) [font_creation.minimum_size]u8 {
    var bytes = [_]u8{0} ** font_creation.minimum_size;
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    std.mem.writeInt(i32, bytes[28..32], 400, .little);
    return bytes;
}

fn restoreRecord(saved_dc: i32) [12]u8 {
    var bytes = [_]u8{0} ** 12;
    std.mem.writeInt(i32, bytes[8..12], saved_dc, .little);
    return bytes;
}

fn createPalette(handle: u32, count: u16) [20]u8 {
    var bytes = [_]u8{0} ** 20;
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    std.mem.writeInt(u16, bytes[12..14], 0x0300, .little);
    std.mem.writeInt(u16, bytes[14..16], count, .little);
    return bytes;
}

fn createColorSpace(handle: u32) [12 + @import("log_color_space.zig").ansi_size]u8 {
    var bytes: [12 + @import("log_color_space.zig").ansi_size]u8 = undefined;
    @memset(&bytes, 0);
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    initColorSpaceObject(bytes[12..]);
    return bytes;
}

fn createColorSpaceWide(handle: u32) [12 + @import("log_color_space.zig").wide_size + 8]u8 {
    var bytes: [12 + @import("log_color_space.zig").wide_size + 8]u8 = undefined;
    @memset(&bytes, 0);
    std.mem.writeInt(u32, bytes[8..12], handle, .little);
    initColorSpaceObject(bytes[12 .. 12 + @import("log_color_space.zig").wide_size]);
    return bytes;
}

fn initColorSpaceObject(bytes: []u8) void {
    const log = @import("log_color_space.zig");
    const values = @import("color_space_values.zig");
    std.mem.writeInt(u32, bytes[0..4], log.signature, .little);
    std.mem.writeInt(u32, bytes[4..8], log.version, .little);
    std.mem.writeInt(u32, bytes[8..12], @intCast(bytes.len), .little);
    std.mem.writeInt(u32, bytes[12..16], @intFromEnum(values.LogicalColorSpace.srgb), .little);
    std.mem.writeInt(u32, bytes[16..20], @intFromEnum(values.GamutMappingIntent.images), .little);
}

test "object table bounds creation replacement deletion and slot reuse" {
    var slots = [_]Slot{.empty} ** 3;
    var state: State = .{ .slots = &slots };
    _ = try state.consume(fixture(.createpen, &createPen(1)));
    _ = try state.consume(fixture(.createbrushindirect, &createBrush(1)));
    try std.testing.expectError(error.EmfObjectHandleOutOfBounds, state.consume(fixture(.createpen, &createPen(3))));
    try std.testing.expectError(error.InvalidEmfObjectHandle, state.consume(fixture(.createpen, &createPen(0x80000000))));
    _ = try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try std.testing.expectError(error.DeadEmfObjectReference, state.consume(fixture(.deleteobject, &handleRecord(1))));
    _ = try state.consume(fixture(.createpen, &createPen(1)));
    try std.testing.expectEqual(@as(usize, 3), state.report.creates);
    try std.testing.expectEqual(@as(usize, 1), state.report.deletes);
    try std.testing.expectEqual(@as(usize, 1), state.report.peak_live);
}

test "object table tracks every non-palette creation kind" {
    var slots = [_]Slot{.empty} ** 2;
    var state: State = .{ .slots = &slots };
    try state.consume(fixture(.createpen, &createPen(1)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try state.consume(fixture(.createbrushindirect, &createBrush(1)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try state.consume(fixture(.extcreatepen, &createExtendedPen(1)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try state.consume(fixture(.createmonobrush, &createBitmapBrush(.createmonobrush, 1)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try state.consume(fixture(.createdibpatternbrushpt, &createBitmapBrush(.createdibpatternbrushpt, 1)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try state.consume(fixture(.extcreatefontindirectw, &createFont(1)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try state.consume(fixture(.createcolorspace, &createColorSpace(1)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try state.consume(fixture(.createcolorspacew, &createColorSpaceWide(1)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try std.testing.expectEqual(@as(usize, 8), state.report.creates);
    try std.testing.expectEqual(@as(usize, 8), state.report.deletes);
    try std.testing.expectEqual(@as(usize, 1), state.report.peak_live);
    try std.testing.expectEqual(@as(usize, 0), state.live);
}

test "region drawing brush handles require live explicit or brush stock objects" {
    var slots = [_]Slot{.empty} ** 4;
    var state: State = .{ .slots = &slots };
    try state.consume(fixture(.createbrushindirect, &createBrush(1)));
    try state.consume(fixture(.createpen, &createPen(2)));
    const fill = regionBrushRecord(.fillrgn, 1);
    try state.consume(fixture(.fillrgn, fill[0..80]));
    const stock_frame = regionBrushRecord(.framergn, @intFromEnum(stock_object.StockObject.white_brush));
    try state.consume(fixture(.framergn, &stock_frame));
    try std.testing.expectEqual(@as(usize, 2), state.report.region_brush_uses);

    const before = state.report;
    for ([_]u32{ 0, 2, 3, 0x80000009, @intFromEnum(stock_object.StockObject.white_pen) }) |handle| {
        const invalid = regionBrushRecord(.fillrgn, handle);
        _ = state.consume(fixture(.fillrgn, invalid[0..80])) catch {};
        try std.testing.expectEqualDeep(before, state.report);
    }
    const wrong_kind = regionBrushRecord(.fillrgn, 2);
    try std.testing.expectError(error.InvalidEmfObjectType, state.consume(fixture(.fillrgn, wrong_kind[0..80])));
    const dead = regionBrushRecord(.fillrgn, 3);
    try std.testing.expectError(error.DeadEmfObjectReference, state.consume(fixture(.fillrgn, dead[0..80])));
    const zero = regionBrushRecord(.fillrgn, 0);
    try std.testing.expectError(error.InvalidEmfObjectHandle, state.consume(fixture(.fillrgn, zero[0..80])));
    const stock_pen = regionBrushRecord(.fillrgn, @intFromEnum(stock_object.StockObject.white_pen));
    try std.testing.expectError(error.InvalidEmfObjectType, state.consume(fixture(.fillrgn, stock_pen[0..80])));
    const stock_gap = regionBrushRecord(.fillrgn, 0x80000009);
    try std.testing.expectError(error.InvalidEmfStockObject, state.consume(fixture(.fillrgn, stock_gap[0..80])));
    try std.testing.expectEqualDeep(before, state.report);
}

test "palette references require a live palette and current entry bounds" {
    var slots = [_]Slot{.empty} ** 4;
    var state: State = .{ .slots = &slots };
    _ = try state.consume(fixture(.createpalette, &createPalette(1, 1)));
    _ = try state.consume(fixture(.createpen, &createPen(2)));
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
    _ = try state.consume(fixture(.selectpalette, &handleRecord(1)));
    _ = try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try std.testing.expectEqual(null, state.selected.palette);
    try std.testing.expectEqual(@as(usize, 1), state.report.default_restores);
}

fn allocationCheck(a: std.mem.Allocator) !void {
    var header = std.mem.zeroes(header_types.Header);
    header.handles = 1;
    var save = [_]u8{0} ** 8;
    std.mem.writeInt(u32, save[0..4], @intFromEnum(records.RecordType.savedc), .little);
    std.mem.writeInt(u32, save[4..8], save.len, .little);
    _ = try validate(a, &save, header);
}

test "object table validates record sizes and allocator failure" {
    var slots = [_]Slot{.empty} ** 2;
    var state: State = .{ .slots = &slots };
    const short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfCreatePenRecordSize, state.consume(fixture(.createpen, &short)));
    try state.consume(fixture(.createpen, &createPen(1)));
    var long_delete = [_]u8{0} ** 16;
    std.mem.writeInt(u32, long_delete[8..12], 1, .little);
    try state.consume(fixture(.deleteobject, &long_delete));

    var empty: [0]u8 = .{};
    var fba = std.heap.FixedBufferAllocator.init(&empty);
    const header = std.mem.zeroes(header_types.Header);
    try std.testing.expectError(error.OutOfMemory, validate(fba.allocator(), &.{}, header));
    try std.testing.checkAllAllocationFailures(std.testing.allocator, allocationCheck, .{});
}

test "color-space selection and both deletion records share object lifetime" {
    var slots = [_]Slot{.empty} ** 4;
    var snapshots: [2]Selection = undefined;
    var state: State = .{ .slots = &slots, .snapshots = &snapshots };
    try state.consume(fixture(.createcolorspace, &createColorSpace(1)));
    try state.consume(fixture(.setcolorspace, &handleRecord(1)));
    try std.testing.expectEqual(@as(?u32, 1), state.selected.color_space);
    try state.consume(fixture(.deletecolorspace, &handleRecord(1)));
    try std.testing.expectEqual(null, state.selected.color_space);
    try std.testing.expectEqual(@as(usize, 1), state.report.default_restores);

    try state.consume(fixture(.createcolorspacew, &createColorSpaceWide(1)));
    try state.consume(fixture(.setcolorspace, &handleRecord(1)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try std.testing.expectEqual(null, state.selected.color_space);
    try std.testing.expectEqual(@as(usize, 2), state.report.default_restores);
    try std.testing.expectEqual(@as(usize, 2), state.report.color_space_sets);
    try std.testing.expectEqual(@as(usize, 1), state.report.color_space_deletes);
    try std.testing.expectEqual(@as(usize, 2), state.report.deletes);
}

test "color-space records reject dead wrong zero stock and out-of-range handles" {
    var slots = [_]Slot{.empty} ** 3;
    var state: State = .{ .slots = &slots };
    try state.consume(fixture(.createpen, &createPen(1)));
    try std.testing.expectError(error.InvalidEmfObjectType, state.consume(fixture(.setcolorspace, &handleRecord(1))));
    try std.testing.expectError(error.InvalidEmfObjectType, state.consume(fixture(.deletecolorspace, &handleRecord(1))));
    try std.testing.expectError(error.DeadEmfObjectReference, state.consume(fixture(.setcolorspace, &handleRecord(2))));
    try std.testing.expectError(error.DeadEmfObjectReference, state.consume(fixture(.deletecolorspace, &handleRecord(2))));
    for ([_]u32{ 0, 0x80000000 }) |handle| {
        try std.testing.expectError(error.InvalidEmfObjectHandle, state.consume(fixture(.setcolorspace, &handleRecord(handle))));
        try std.testing.expectError(error.InvalidEmfObjectHandle, state.consume(fixture(.deletecolorspace, &handleRecord(handle))));
    }
    try std.testing.expectError(error.EmfObjectHandleOutOfBounds, state.consume(fixture(.setcolorspace, &handleRecord(3))));
    try std.testing.expectError(error.EmfObjectHandleOutOfBounds, state.consume(fixture(.deletecolorspace, &handleRecord(3))));
}

test "color-space DC snapshots cannot restore deleted objects" {
    var slots = [_]Slot{.empty} ** 2;
    var snapshots: [2]Selection = undefined;
    var state: State = .{ .slots = &slots, .snapshots = &snapshots };
    try state.consume(fixture(.createcolorspace, &createColorSpace(1)));
    try state.consume(fixture(.setcolorspace, &handleRecord(1)));
    const save = [_]u8{0} ** 8;
    try state.consume(fixture(.savedc, &save));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try state.consume(fixture(.restoredc, &restoreRecord(-1)));
    try std.testing.expectEqual(null, state.selected.color_space);
}

test "deleting an inactive color space preserves the current selection" {
    var slots = [_]Slot{.empty} ** 3;
    var state: State = .{ .slots = &slots };
    try state.consume(fixture(.createcolorspace, &createColorSpace(1)));
    try state.consume(fixture(.createcolorspacew, &createColorSpaceWide(2)));
    try state.consume(fixture(.setcolorspace, &handleRecord(1)));
    try state.consume(fixture(.setcolorspace, &handleRecord(2)));
    try state.consume(fixture(.deletecolorspace, &handleRecord(1)));
    try std.testing.expectEqual(@as(?u32, 2), state.selected.color_space);
    try std.testing.expectEqual(@as(usize, 0), state.report.default_restores);
}

test "cross-kind replacement deactivates current and saved color-space selections" {
    var slots = [_]Slot{.empty} ** 2;
    var snapshots: [1]Selection = undefined;
    var state: State = .{ .slots = &slots, .snapshots = &snapshots };
    try state.consume(fixture(.createcolorspace, &createColorSpace(1)));
    try state.consume(fixture(.setcolorspace, &handleRecord(1)));
    const save = [_]u8{0} ** 8;
    try state.consume(fixture(.savedc, &save));
    try state.consume(fixture(.createpen, &createPen(1)));
    try std.testing.expectEqual(null, state.selected.color_space);
    try state.consume(fixture(.restoredc, &restoreRecord(-1)));
    try std.testing.expectEqual(null, state.selected.color_space);
    try std.testing.expectEqual(@as(usize, 1), state.report.replacement_deactivations);
}

test "failed color-space operations do not change reports or live objects" {
    var slots = [_]Slot{.empty} ** 2;
    var state: State = .{ .slots = &slots };
    try state.consume(fixture(.createpen, &createPen(1)));
    const before = state.report;
    try std.testing.expectError(error.InvalidEmfObjectType, state.consume(fixture(.setcolorspace, &handleRecord(1))));
    try std.testing.expectError(error.InvalidEmfObjectType, state.consume(fixture(.deletecolorspace, &handleRecord(1))));
    try std.testing.expectEqualDeep(before, state.report);
    try std.testing.expectEqual(@as(usize, 1), state.live);
}

test "invalid basic creation payloads do not occupy or replace slots" {
    var slots = [_]Slot{.empty} ** 3;
    var state: State = .{ .slots = &slots };
    var invalid_pen = createPen(1);
    std.mem.writeInt(i32, invalid_pen[16..20], 0, .little);
    try std.testing.expectError(error.InvalidEmfCosmeticPenWidth, state.consume(fixture(.createpen, &invalid_pen)));
    try std.testing.expectEqual(@as(usize, 0), state.live);
    try std.testing.expectEqual(@as(usize, 0), state.report.creates);

    try state.consume(fixture(.createbrushindirect, &createBrush(1)));
    const before = state.report;
    var invalid_brush = createBrush(1);
    std.mem.writeInt(u32, invalid_brush[20..24], 6, .little);
    std.mem.writeInt(u32, invalid_brush[12..16], 2, .little);
    try std.testing.expectError(error.UnsupportedEmfHatchStyle, state.consume(fixture(.createbrushindirect, &invalid_brush)));
    try std.testing.expectEqualDeep(before, state.report);
    try std.testing.expectEqual(stock_object.Kind.brush, slotKind(state.slots[1]).?);
}

test "invalid extended pen payload does not occupy its object slot" {
    var slots = [_]Slot{.empty} ** 2;
    var state: State = .{ .slots = &slots };
    var invalid = createExtendedPen(1);
    std.mem.writeInt(u32, invalid[48..52], 1, .little);
    try std.testing.expectError(error.TruncatedEmfPenStyleEntries, state.consume(fixture(.extcreatepen, &invalid)));
    try std.testing.expectEqual(@as(usize, 0), state.live);
    try std.testing.expectEqual(@as(usize, 0), state.report.creates);
    try std.testing.expectEqual(@as(?stock_object.Kind, null), slotKind(state.slots[1]));
}

test "invalid bitmap brush payload does not occupy or replace its slot" {
    var slots = [_]Slot{.empty} ** 2;
    var state: State = .{ .slots = &slots };
    var invalid = createBitmapBrush(.createmonobrush, 1);
    std.mem.writeInt(u16, invalid[42..44], 4, .little);
    try std.testing.expectError(error.InvalidEmfMonochromeBrushBitCount, state.consume(fixture(.createmonobrush, &invalid)));
    try std.testing.expectEqual(@as(usize, 0), state.live);
    try std.testing.expectEqual(@as(usize, 0), state.report.creates);

    try state.consume(fixture(.createdibpatternbrushpt, &createBitmapBrush(.createdibpatternbrushpt, 1)));
    const before = state.report;
    std.mem.writeInt(u32, invalid[12..16], 3, .little);
    try std.testing.expectError(error.UnsupportedEmfDibColors, state.consume(fixture(.createdibpatternbrushpt, &invalid)));
    try std.testing.expectEqualDeep(before, state.report);
    try std.testing.expectEqual(stock_object.Kind.brush, slotKind(state.slots[1]).?);
}

test "invalid font payload does not occupy or replace its slot" {
    var slots = [_]Slot{.empty} ** 2;
    var state: State = .{ .slots = &slots };
    var invalid = createFont(1);
    invalid[32] = 2;
    try std.testing.expectError(error.InvalidEmfFontBoolean, state.consume(fixture(.extcreatefontindirectw, &invalid)));
    try std.testing.expectEqual(@as(usize, 0), state.live);
    try std.testing.expectEqual(@as(usize, 0), state.report.creates);

    try state.consume(fixture(.extcreatefontindirectw, &createFont(1)));
    const before = state.report;
    invalid = createFont(1);
    invalid[35] = 3;
    try std.testing.expectError(error.InvalidEmfFontCharacterSet, state.consume(fixture(.extcreatefontindirectw, &invalid)));
    try std.testing.expectEqualDeep(before, state.report);
    try std.testing.expectEqual(stock_object.Kind.font, slotKind(state.slots[1]).?);
}

test "SELECTOBJECT validates explicit and stock object types" {
    var slots = [_]Slot{.empty} ** 5;
    var snapshots: [2]Selection = undefined;
    var state: State = .{ .slots = &slots, .snapshots = &snapshots };
    try state.consume(fixture(.createpen, &createPen(1)));
    try state.consume(fixture(.createbrushindirect, &createBrush(2)));
    try state.consume(fixture(.extcreatefontindirectw, &createFont(3)));
    try state.consume(fixture(.createpalette, &createPalette(4, 1)));
    try state.consume(fixture(.selectobject, &handleRecord(1)));
    try state.consume(fixture(.selectobject, &handleRecord(2)));
    try state.consume(fixture(.selectobject, &handleRecord(3)));
    try std.testing.expectEqual(@as(?u32, 1), state.selected.pen);
    try std.testing.expectEqual(@as(?u32, 2), state.selected.brush);
    try std.testing.expectEqual(@as(?u32, 3), state.selected.font);

    try state.consume(fixture(.selectobject, &handleRecord(0x80000013)));
    try std.testing.expectEqual(null, state.selected.pen);
    try std.testing.expectEqual(@as(usize, 4), state.report.selections);
    try std.testing.expectEqual(@as(usize, 1), state.report.stock_selections);
    try std.testing.expectError(error.InvalidEmfObjectHandle, state.consume(fixture(.selectobject, &handleRecord(0))));
    try state.consume(fixture(.deleteobject, &handleRecord(3)));
    try std.testing.expectError(error.DeadEmfObjectReference, state.consume(fixture(.selectobject, &handleRecord(3))));
    try std.testing.expectError(error.EmfObjectHandleOutOfBounds, state.consume(fixture(.selectobject, &handleRecord(5))));
    try std.testing.expectError(error.InvalidEmfSelectableObjectType, state.consume(fixture(.selectobject, &handleRecord(4))));
    try std.testing.expectError(error.InvalidEmfSelectableObjectType, state.consume(fixture(.selectobject, &handleRecord(0x8000000f))));
    try std.testing.expectError(error.InvalidEmfStockObject, state.consume(fixture(.selectobject, &handleRecord(0x80000009))));
    var extended_select = [_]u8{0} ** 16;
    std.mem.writeInt(u32, extended_select[8..12], 1, .little);
    try state.consume(fixture(.selectobject, &extended_select));
    const short = [_]u8{0} ** 8;
    try std.testing.expectError(error.InvalidEmfSelectObjectRecordSize, state.consume(fixture(.selectobject, &short)));
}

test "delete replacement and DC restore cannot retain dead selected objects" {
    var slots = [_]Slot{.empty} ** 3;
    var snapshots: [3]Selection = undefined;
    var state: State = .{ .slots = &slots, .snapshots = &snapshots };
    try state.consume(fixture(.createpen, &createPen(1)));
    try state.consume(fixture(.selectobject, &handleRecord(1)));
    const save = [_]u8{0} ** 8;
    try state.consume(fixture(.savedc, &save));
    try state.consume(fixture(.selectobject, &handleRecord(0x80000006)));
    try state.consume(fixture(.restoredc, &restoreRecord(-1)));
    try std.testing.expectEqual(@as(?u32, 1), state.selected.pen);
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try std.testing.expectEqual(null, state.selected.pen);
    try std.testing.expectEqual(@as(usize, 1), state.report.default_restores);

    try state.consume(fixture(.createpen, &createPen(1)));
    try state.consume(fixture(.selectobject, &handleRecord(1)));
    try state.consume(fixture(.savedc, &save));
    try state.consume(fixture(.selectobject, &handleRecord(0x80000007)));
    try state.consume(fixture(.deleteobject, &handleRecord(1)));
    try state.consume(fixture(.restoredc, &restoreRecord(-1)));
    try std.testing.expectEqual(null, state.selected.pen);

    try state.consume(fixture(.createpen, &createPen(1)));
    try state.consume(fixture(.selectobject, &handleRecord(1)));
    try state.consume(fixture(.createpen, &createPen(1)));
    try std.testing.expectEqual(@as(?u32, 1), state.selected.pen);
    try state.consume(fixture(.createbrushindirect, &createBrush(1)));
    try std.testing.expectEqual(null, state.selected.pen);
    try std.testing.expectEqual(@as(usize, 1), state.report.replacement_deactivations);
}

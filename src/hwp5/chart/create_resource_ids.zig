//! Own creation-only allocation. DocInfo ordinals and physical storage IDs differ.
const std = @import("std");
const BinData = @import("../docinfo/bin_data.zig").BinData;
const names = @import("../../cfb/name_order.zig");
const upper = @import("../../cfb/simple_uppercase.zig").upper;
pub const Pair = struct { ole: u16, fallback: u16 };
pub const Plan = struct { ordinals: Pair, physical: Pair };

pub fn nextOrdinals(count: usize) !Pair {
    if (count > std.math.maxInt(u16) - 2) return error.LimitExceeded;
    return .{ .ole = @intCast(count + 1), .fallback = @intCast(count + 2) };
}

/// Pass every BinData record (links consume ordinal positions), and every direct
/// /BinData child including orphan streams and storages. Never infer a physical
/// ID from a DocInfo ordinal or only from currently referenced objects.
pub fn plan(records: []const BinData, direct_names: []const []const u8) !Plan {
    const ordinals = try nextOrdinals(records.len);
    var used = std.StaticBitSet(65536).empty;
    used.set(0);
    for (records) |record| switch (record.data) {
        .link => {},
        .embedding => |value| {
            if (value.id == 0) return error.InvalidBinaryResourceId;
            used.set(value.id);
        },
        .storage => |id| {
            if (id == 0) return error.InvalidBinaryResourceId;
            used.set(id);
        },
        .unknown => return error.UnsupportedBinDataType,
    };
    for (direct_names) |name| {
        const parsed = try names.Name.init(name);
        if (physicalId(parsed)) |id| used.set(id);
    }
    var ids: [2]u16 = undefined;
    var count: usize = 0;
    for (1..65536) |id| {
        if (used.isSet(id)) continue;
        ids[count] = @intCast(id);
        count += 1;
        if (count == ids.len) break;
    }
    if (count != ids.len) return error.BinaryResourceIdsExhausted;
    return .{ .ordinals = ordinals, .physical = .{ .ole = ids[0], .fallback = ids[1] } };
}

// Use the actual CFB uppercase/UTF16 key, including non-ASCII case aliases.
// Reserve an ID across extensions, even when only an orphan name uses it.
fn physicalId(name: names.Name) ?u16 {
    const value = name.units[0..name.len];
    if (value.len < 7 or upper(value[0]) != 'B' or upper(value[1]) != 'I' or upper(value[2]) != 'N') return null;
    if (value.len > 7 and value[7] != '.') return null;
    var result: u16 = 0;
    for (value[3..7]) |unit| {
        const digit: u16 = switch (upper(unit)) {
            '0'...'9' => unit - '0',
            'A'...'F' => upper(unit) - 'A' + 10,
            else => return null,
        };
        result = (result << 4) | digit;
    }
    return result;
}

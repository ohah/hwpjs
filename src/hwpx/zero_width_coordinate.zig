//! 폭 없는 선언의 좌표 산술입니다. XML 소유권과 선언 종류는 호출자 책임입니다.
const std = @import("std");
pub const Affinity = enum { left, right };

pub fn splice(unit: u32, affinity: Affinity, start: u32, end: u32, inserted: u32, length: u32) !u32 {
    if (start > end or end > length or unit > length) return error.InvalidTextPosition;
    _ = std.math.add(u32, length - (end - start), inserted) catch return error.LimitExceeded;
    if (start < unit and unit < end) return error.ProtectedMetadataBoundary;
    if (unit < start or (unit == start and affinity == .left)) return unit;
    return std.math.add(u32, if (unit <= end) start else unit - (end - start), inserted) catch error.LimitExceeded;
}

pub const Partition = struct { right: bool, unit: u32 };
pub fn split(unit: u32, affinity: Affinity, at: u32, length: u32) !Partition {
    if (at > length or unit > length) return error.InvalidTextPosition;
    const right = unit > at or (unit == at and affinity == .right);
    return .{ .right = right, .unit = if (right) unit - at else unit };
}

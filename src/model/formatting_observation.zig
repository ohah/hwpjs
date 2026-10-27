//! Query aggregation preserves unreadable targets. Values remain owned by caller.
const std = @import("std");
pub fn Observation(comptime T: type) type {
    return struct {
        state: enum { known, mixed, unknown, unavailable },
        value: ?T = null,
        reason: ?[]const u8 = null,
        writable: bool,
        writeUnavailableReason: ?[]const u8 = null,
        unit: ?[]const u8 = null,
        pub fn validate(self: @This()) !void {
            if ((self.state == .known) != (self.value != null)) return error.InvalidFormattingObservation;
            const requires_reason = self.state == .unknown or self.state == .unavailable;
            if (requires_reason != (self.reason != null)) return error.InvalidFormattingObservation;
            if (self.reason) |reason| if (reason.len == 0) return error.InvalidFormattingObservation;
            if (self.writable == (self.writeUnavailableReason != null)) return error.InvalidFormattingObservation;
            if (self.writeUnavailableReason) |reason| if (reason.len == 0) return error.InvalidFormattingObservation;
        }
    };
}
/// equal is semantic typed equality (not pointer equality for strings/resources).
pub fn aggregate(comptime T: type, inputs: []const Observation(T), equal: anytype) !Observation(T) {
    if (inputs.len == 0) return error.MissingFormattingObservation;
    var output = inputs[0];
    try output.validate();
    for (inputs[1..]) |item| {
        try item.validate();
        if (!item.writable and output.writable) output.writeUnavailableReason = item.writeUnavailableReason;
        output.writable = output.writable and item.writable;
        if (priority(item.state) > priority(output.state)) {
            output.state = item.state;
            output.reason = item.reason;
            output.value = item.value;
        } else if (output.state == .known and item.state == .known and !equal(output.value.?, item.value.?)) {
            output.state = .mixed;
            output.value = null;
        }
        // A difference in units cannot silently become a known numeric value.
        if (!equalUnit(output.unit, item.unit)) {
            output.unit = null;
            if (output.state == .known or output.state == .mixed) {
                output.state = .unknown;
                output.value = null;
                output.reason = "FormattingUnitMismatch";
                if (output.writable) {
                    output.writable = false;
                    output.writeUnavailableReason = "UnprovenSourceUnit";
                }
            }
        }
    }
    try output.validate();
    return output;
}
fn priority(state: anytype) u8 {
    return switch (state) {
        .known => 0,
        .mixed => 1,
        .unknown => 2,
        .unavailable => 3,
    };
}

fn equalUnit(left: ?[]const u8, right: ?[]const u8) bool {
    if (left) |l| return if (right) |r| std.mem.eql(u8, l, r) else false;
    return right == null;
}

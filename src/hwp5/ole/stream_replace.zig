//! Compatibility entry point; the shared OLE layer owns reconstruction.
const common = @import("../../ole/stream_replace.zig");
pub const Options = common.Options;
pub const replaceExact = common.replaceExact;
pub const replaceManyExact = common.replaceManyExact;

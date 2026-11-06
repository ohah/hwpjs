//! Public writer metadata and its standard RGB policy; not producer authentication.
const std = @import("std");
pub const major: u16 = 5;
pub const minor: u16 = 0;
pub const micro: u16 = 1;
pub const build_number: u16 = 7;
pub const os: u16 = 0;
pub const xml_version = "1.5";
pub const target_application = "WORDPROCESSOR";
pub const application = "hwpjs";
pub const app_version = "1.0";
pub const version_xml = "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?>" ++ std.fmt.comptimePrint(
    "<hv:HCFVersion xmlns:hv=\"http://www.hancom.co.kr/hwpml/2011/version\" tagetApplication=\"{s}\" major=\"{d}\" minor=\"{d}\" micro=\"{d}\" buildNumber=\"{d}\" os=\"{d}\" xmlVersion=\"{s}\" application=\"{s}\" appVersion=\"{s}\"/>",
    .{ target_application, major, minor, micro, build_number, os, xml_version, application, app_version },
);

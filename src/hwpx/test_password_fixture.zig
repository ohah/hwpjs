//! Small Node-generated crypto fixture shared only by tests.
pub const prefix = "<m:manifest xmlns:m=\"" ++ @import("encryption_manifest.zig").manifest_uri ++ "\">";
pub const suffix = "</m:manifest>";
pub const entry = "<m:file-entry full-path=\"Contents/section0.xml\" size=\"5\"><m:encryption-data checksum-type=\"" ++ @import("encryption_manifest.zig").manifest_uri ++ "#sha256-1k\" checksum=\"LP&#x4a;Nul+wow4m6DsqxbninhsWHlwfp0JecwQzYpOLmCQ=\">" ++
    "<m:algorithm algorithm-name=\"http://www.w3.org/2001/04/xmlenc#aes256-cbc\" initialisation-vector=\"yXnJDRuDzyaJZY0F5bK2wQ==\"/>" ++
    "<m:key-derivation key-derivation-name=\"" ++ @import("encryption_manifest.zig").manifest_uri ++ "#pbkdf2\" key-size=\"32\" iteration-count=\"1024\" salt=\"yXnJDRuDzyaJZY0F5bK2wQ==\"/>" ++
    "<m:start-key-generation start-key-generation-name=\"http://www.w3.org/2000/09/xmldsig#sha256\" key-size=\"32\"/></m:encryption-data></m:file-entry>";
pub const manifest = prefix ++ entry ++ suffix;

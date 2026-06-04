const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

assert.match(html, /SemStack Admin OS/);
assert.match(html, /Live Active Users/);
assert.match(html, /Peak Activity/);
assert.match(html, /Global Subject Templates/);
assert.match(html, /data-admin-template-form/);
assert.match(html, /data-admin-user-status/);
assert.match(html, /admin-os-mode/);
assert.match(html, /state\.activeTab = isAdmin\(\) \? "admin" : "overview"/);

console.log(JSON.stringify({ ok: true, contract: "admin-os-ui" }));

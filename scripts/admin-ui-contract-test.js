const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

assert.match(html, /Admin Command Center/);
assert.match(html, /data-admin-search/);
assert.match(html, /data-export-admin-users/);
assert.match(html, /admin-mode/);
assert.match(html, /state\.activeTab = isAdmin\(\) \? "admin" : "overview"/);

console.log(JSON.stringify({ ok: true, contract: "admin-ui" }));

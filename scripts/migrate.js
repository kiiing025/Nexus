const { initDb } = require("../models/database");

initDb()
  .then(() => {
    console.log("SemStack database schema is ready.");
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

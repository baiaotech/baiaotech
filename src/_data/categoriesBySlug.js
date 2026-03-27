const categories = require("./categories.json");

module.exports = Object.fromEntries(
  categories.map((category) => [category.slug, category])
);

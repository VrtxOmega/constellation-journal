const eslintPlugin = require("@eslint/js");

module.exports = [
  eslintPlugin.configs.recommended,
  {
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "off",
      "no-prototype-builtins": "off"
    }
  }
];
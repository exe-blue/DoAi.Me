/**
 * @doai/shared — entry (pure JS).
 */
const task = require("./constants/task");
const device = require("./constants/device");
const utils = require("./utils/index");
const supabaseTypes = require("./types/supabase");

module.exports = {
  ...task,
  ...device,
  ...utils,
  ...supabaseTypes,
};

/**
 * @doai/shared — shared utils (pure JS).
 */

/**
 * Merge class names (minimal; for use without clsx/tailwind-merge).
 * @param {...string} args
 * @returns {string}
 */
function cn(...args) {
  return args.filter(Boolean).join(" ");
}

module.exports = {
  cn,
};

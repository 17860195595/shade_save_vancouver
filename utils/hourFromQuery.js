const { getVancouverCurrentHour } = require('../services/shadeService');

/**
 * Parse `?hour=` for API routes; invalid or missing → Vancouver local clock hour.
 * @param {Record<string, string | undefined>} query - typically `req.query`
 */
function hourFromQuery(query) {
  const h = parseInt(query.hour, 10);
  if (!Number.isNaN(h) && h >= 0 && h <= 23) return h;
  return getVancouverCurrentHour();
}

module.exports = { hourFromQuery };

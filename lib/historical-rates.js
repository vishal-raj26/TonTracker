"use strict";

function normalizeTimestamp(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return NaN;
  // Market providers commonly return Unix seconds while CoinGecko returns
  // milliseconds. Normalize at the shared boundary so a valid hourly series
  // cannot silently become a 1970-era series and strand every sale rate.
  return timestamp > 946_684_800 && timestamp < 100_000_000_000
    ? timestamp * 1000
    : timestamp;
}

function normalizePoints(points = []) {
  return [...new Map(points
    .map(([timestamp, rate]) => ({ timestamp: normalizeTimestamp(timestamp), rate: Number(rate) }))
    .filter((point) => Number.isFinite(point.timestamp) && point.rate > 0)
    .map((point) => [point.timestamp, point])).values()]
    .sort((a, b) => a.timestamp - b.timestamp);
}

function historicalRateAt(points, eventTime, options = {}) {
  const target = new Date(eventTime).getTime();
  const rows = Array.isArray(points) ? points : [];
  if (!Number.isFinite(target) || !rows.length) return null;
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (rows[middle].timestamp < target) low = middle + 1;
    else high = middle;
  }
  const after = rows[low];
  const before = rows[Math.max(0, low - 1)];
  const interpolationGap = Number(options.interpolationMaxGapMs || 26 * 60 * 60 * 1000);
  if (before && after && before.timestamp <= target && after.timestamp >= target
    && after.timestamp > before.timestamp && after.timestamp - before.timestamp <= interpolationGap) {
    const progress = (target - before.timestamp) / (after.timestamp - before.timestamp);
    return { rate: before.rate + (after.rate - before.rate) * progress, observedAt: target, method: "linear-interpolation" };
  }
  const nearest = !before || Math.abs(after.timestamp - target) < Math.abs(before.timestamp - target) ? after : before;
  if (!nearest || Math.abs(nearest.timestamp - target) > Number(options.maxGapMs || 2 * 60 * 60 * 1000)) return null;
  return { rate: nearest.rate, observedAt: nearest.timestamp, method: "nearest-observation" };
}

function hasSeriesCoverage(points, fromMs, toMs, options = {}) {
  const rows = Array.isArray(points) ? points : [];
  if (!rows.length) return false;
  const edgeToleranceMs = Number(options.edgeToleranceMs || 4 * 60 * 60 * 1000);
  const maximumGapMs = Number(options.maximumGapMs || 26 * 60 * 60 * 1000);
  if (rows[0].timestamp > fromMs + edgeToleranceMs) return false;
  if (rows[rows.length - 1].timestamp < toMs - edgeToleranceMs) return false;
  for (let index = 1; index < rows.length; index += 1) {
    if (rows[index].timestamp - rows[index - 1].timestamp > maximumGapMs) return false;
  }
  return true;
}

module.exports = { hasSeriesCoverage, historicalRateAt, normalizePoints, normalizeTimestamp };

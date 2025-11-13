// ------------------------------
// CSV helpers (your original functions)
// ------------------------------
function csvEscape(val) {
  if (val === null || typeof val === "undefined") return "";
  if (val && typeof val.toMillis === "function") {
    val = new Date(val.toMillis()).toISOString();
  }
  if (typeof val === "object") val = JSON.stringify(val);
  const s = String(val);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildCSV(rows) {
  if (!rows || !rows.length) return "";
  const keys = [];
  for (const r of rows) {
    Object.keys(r).forEach((k) => {
      if (!keys.includes(k)) keys.push(k);
    });
  }
  const header = keys.join(",");
  const lines = rows.map((r) =>
    keys
      .map((k) => csvEscape(typeof r[k] === "undefined" ? "" : r[k]))
      .join(",")
  );
  return [header, ...lines].join("\n");
}
module.exports = { buildCSV };
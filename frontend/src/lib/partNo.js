// Formats a part number to the customer's preferred display form for HERO:
// - remove dashes and spaces
// - ensure it ends with "S"
// Example: "23121-KST-901" -> "23121KST901S"
export function formatPartNo(partNo) {
  if (!partNo) return "";
  let p = String(partNo).replace(/[-\s]/g, "").toUpperCase();
  if (!p.endsWith("S")) p = p + "S";
  return p;
}

// System-aware formatting. TVS part numbers keep their exact form (uppercased,
// dashes/spaces stripped); Hero parts additionally get an "S" suffix.
export function formatPartNoForSystem(partNo, system) {
  if (!partNo) return "";
  if (system === "tvs") {
    return String(partNo).replace(/[-\s]/g, "").toUpperCase();
  }
  return formatPartNo(partNo);
}

// Normalized key used for duplicate detection (looser, ignores S suffix too)
export function partNoKey(partNo) {
  if (!partNo) return "";
  let p = String(partNo).replace(/[-\s]/g, "").toUpperCase();
  if (p.endsWith("S")) p = p.slice(0, -1);
  return p;
}

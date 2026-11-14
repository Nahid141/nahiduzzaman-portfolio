// grDevices::hcl() (polar LUV -> sRGB) used by the haplotype app's pie palette.
export function hcl(h: number, c: number, l: number) {
  const WHITE_Y = 100, WHITE_u = 0.1978398, WHITE_v = 0.4683363;
  if (l <= 0) return "#000000";
  const hr = (h * Math.PI) / 180;
  const L = l, U = c * Math.cos(hr), V = c * Math.sin(hr);
  const Y = WHITE_Y * (L > 7.999592 ? Math.pow((L + 16) / 116, 3) : L / 903.3);
  const u = U / (13 * L) + WHITE_u;
  const v = V / (13 * L) + WHITE_v;
  const X = (9.0 * Y * u) / (4 * v);
  const Z = -X / 3 - 5 * Y + (3 * Y) / v;
  const g = (x: number) => (x > 0.00304 ? 1.055 * Math.pow(x, 1 / 2.4) - 0.055 : 12.92 * x);
  const rgb = [
    g((3.240479 * X - 1.53715 * Y - 0.498535 * Z) / WHITE_Y),
    g((-0.969256 * X + 1.875992 * Y + 0.041556 * Z) / WHITE_Y),
    g((0.055648 * X - 0.204043 * Y + 1.057311 * Z) / WHITE_Y),
  ];
  return "#" + rgb.map((x) => Math.trunc(255 * Math.min(1, Math.max(0, x)) + 0.5).toString(16).padStart(2, "0").toUpperCase()).join("");
}

/** make_pie_palette(n) in the R app */
export function piePalette(n: number) {
  const out: string[] = [];
  for (let k = 0; k < n; k++) out.push(hcl(15 + (360 * k) / n, 100, 65));
  return out;
}

/** Approximation of R's locale collation used by sort() on labels. */
export function rSortKey(s: string) {
  return s.replace(/[^0-9A-Za-z]/g, "").toLowerCase() + "\u0000" + s.toLowerCase() + "\u0000" + s;
}

export function rSort(values: string[]) {
  return [...values].sort((a, b) => (rSortKey(a) < rSortKey(b) ? -1 : rSortKey(a) > rSortKey(b) ? 1 : 0));
}

// Poisson helpers for the TIMER "Check one comparison" plot (same rules as the backend / R app).

const LANCZOS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];

function lgamma(z: number): number {
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < LANCZOS.length; i++) x += LANCZOS[i] / (z + i + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function dpois(k: number, lambda: number) {
  if (lambda === 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(lambda) - lambda - lgamma(k + 1));
}

export function qpois(p: number, lambda: number) {
  if (lambda === 0 || p <= 0) return 0;
  const target = p * (1 - 64 * Number.EPSILON);
  let cdf = 0;
  for (let k = 0; k < 100000; k++) {
    cdf += dpois(k, lambda);
    if (cdf >= target) return k;
  }
  return Infinity;
}

export const CATEGORY_COLORS: Record<string, string> = {
  "High probability": "#8c001a",
  "Medium probability": "#e98322",
  "Low probability": "#f0c33c",
  "Outside expected distribution": "#2f3542",
  "Unable to evaluate": "#5b5f97",
};

export const CATEGORY_LABELS: Record<string, string> = {
  "High probability": "High probability",
  "Medium probability": "Medium probability",
  "Low probability": "Low probability",
  "Outside expected distribution": "Outside distribution",
  "Unable to evaluate": "Unable to evaluate",
};

export function countCategory(m: number, lambda: number) {
  let cat = "Low probability";
  if (m < qpois(0.025, lambda) || m > qpois(0.975, lambda)) cat = "Outside expected distribution";
  if (m >= qpois(0.1, lambda) && m <= qpois(0.9, lambda)) cat = "Medium probability";
  if (m >= qpois(0.25, lambda) && m <= qpois(0.75, lambda)) cat = "High probability";
  return cat;
}

export function distribution(observed: number, lambda: number, ciUpper: number) {
  let upper = Math.max(20, ciUpper + 10, observed + 10, qpois(0.999, lambda) + 5);
  upper = Math.min(upper, 300);
  const bars = [];
  for (let k = 0; k <= upper; k++) bars.push({ k, p: dpois(k, lambda), zone: countCategory(k, lambda) });
  return bars;
}

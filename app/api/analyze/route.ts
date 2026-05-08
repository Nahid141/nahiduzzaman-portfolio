import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RawRow = Record<string, any>;

type ObsRow = {
  Farm_ID: string;
  Location: string;
  Latitude: number;
  Longitude: number;
  Date: string;
  Observation: number;
  Total_Animals: number;
  S: number;
  E: number;
  I: number;
  R: number;
  Confirmatory_Diagnosis: number;
  Abortion_Count: number;
  Pending_Culled: number;
  Culled: number;
  Pending_Quarantined: number;
  Quarantined: number;
  New_Animals_Moved_In: number;
  New_Animals_Moved_Out: number;
  Susceptible_In_From_MovedIn: number;
  Susceptible_Out_From_MovedOut: number;
};

type NetworkEdge = {
  edgeId: string;
  source: string;
  target: string;
  edgeType: string;
  distanceKm: number;
  movements: number;
};

type StatisticalTestRequest = {
  tests: string[];
  valueColumns: string[];
  groupColumn: string;
  outcomeColumn: string;
  predictorColumns: string[];
  subjectColumn: string;
  pairedColumnA: string;
  pairedColumnB: string;
  oneSampleMean: number;
  alpha: number;
  rawGroupColumn?: string;
};

function safeNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeText(value: any, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isMissing(v: any): boolean {
  return v === null || v === undefined || v === "" || String(v).toLowerCase() === "na";
}

function finite(values: number[]): number[] {
  return values.filter((v) => Number.isFinite(v));
}

function sum(values: number[]): number {
  return finite(values).reduce((a, b) => a + b, 0);
}

function mean(values: number[]): number | null {
  const v = finite(values);
  if (v.length === 0) return null;
  return sum(v) / v.length;
}

function median(values: number[]): number | null {
  const v = finite(values).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function variance(values: number[]): number | null {
  const v = finite(values);
  if (v.length < 2) return null;
  const m = mean(v);
  if (m === null) return null;
  return sum(v.map((x) => (x - m) ** 2)) / (v.length - 1);
}

function sd(values: number[]): number | null {
  const v = variance(values);
  return v === null ? null : Math.sqrt(v);
}

function quantile(values: number[], q: number): number | null {
  const v = finite(values).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const pos = (v.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return v[base + 1] === undefined ? v[base] : v[base] + rest * (v[base + 1] - v[base]);
}

function describeNumeric(values: number[]) {
  const v = finite(values);
  const m = mean(v);
  const s = sd(v);
  const se = s !== null && v.length > 0 ? s / Math.sqrt(v.length) : null;
  const ci95 = m !== null && se !== null ? { lower: m - 1.96 * se, upper: m + 1.96 * se } : { lower: null, upper: null };
  return {
    n: v.length,
    missingExcluded: values.length - v.length,
    mean: m,
    median: median(v),
    sd: s,
    variance: variance(v),
    se,
    ci95,
    min: v.length ? Math.min(...v) : null,
    q1: quantile(v, 0.25),
    q3: quantile(v, 0.75),
    iqr: quantile(v, 0.75) !== null && quantile(v, 0.25) !== null ? Number(quantile(v, 0.75)) - Number(quantile(v, 0.25)) : null,
    max: v.length ? Math.max(...v) : null,
    sum: sum(v),
  };
}

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
  return sign * y;
}

function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function normalTwoSidedP(z: number): number {
  if (!Number.isFinite(z)) return null as any;
  return Math.max(0, Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))));
}

function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < coefficients.length; i++) x += coefficients[i] / (z + i + 1);
  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 200;
  const eps = 3e-12;
  const fpmin = 1e-30;
  let qab = a + b;
  let qap = a + 1;
  let qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < fpmin) d = fpmin;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < fpmin) d = fpmin;
    c = 1 + aa / c;
    if (Math.abs(c) < fpmin) c = fpmin;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betaContinuedFraction(a, b, x)) / a;
  return 1 - (bt * betaContinuedFraction(b, a, 1 - x)) / b;
}

function studentTCDF(t: number, df: number): number | null {
  if (!Number.isFinite(t) || !Number.isFinite(df) || df <= 0) return null;
  const x = df / (df + t * t);
  const ib = regularizedIncompleteBeta(x, df / 2, 0.5);
  return t >= 0 ? 1 - 0.5 * ib : 0.5 * ib;
}

function studentTTwoSidedP(t: number, df: number): number | null {
  const cdf = studentTCDF(Math.abs(t), df);
  if (cdf === null) return null;
  return Math.max(0, Math.min(1, 2 * (1 - cdf)));
}

function gammaLowerRegularized(a: number, x: number): number {
  if (x <= 0) return 0;
  if (x < a + 1) {
    let ap = a;
    let del = 1 / a;
    let sumValue = del;
    for (let n = 1; n <= 200; n++) {
      ap += 1;
      del *= x / ap;
      sumValue += del;
      if (Math.abs(del) < Math.abs(sumValue) * 3e-12) break;
    }
    return sumValue * Math.exp(-x + a * Math.log(x) - logGamma(a));
  }
  let b = x + 1 - a;
  let c = 1 / 1e-30;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= 200; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = b + an / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 3e-12) break;
  }
  return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

function chiSquarePValue(stat: number, df: number): number | null {
  if (!Number.isFinite(stat) || !Number.isFinite(df) || df <= 0) return null;
  const p = 1 - gammaLowerRegularized(df / 2, stat / 2);
  return Math.max(0, Math.min(1, p));
}

function fCDF(f: number, df1: number, df2: number): number | null {
  if (!Number.isFinite(f) || f < 0 || df1 <= 0 || df2 <= 0) return null;
  const x = (df1 * f) / (df1 * f + df2);
  return regularizedIncompleteBeta(x, df1 / 2, df2 / 2);
}

function fPValue(f: number, df1: number, df2: number): number | null {
  const cdf = fCDF(f, df1, df2);
  if (cdf === null) return null;
  return Math.max(0, Math.min(1, 1 - cdf));
}

function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function parseCSV(text: string): RawRow[] {
  const clean = text.trim();
  if (!clean) return [];
  const lines = clean.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = splitCSVLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line);
    const row: RawRow = {};
    headers.forEach((h, i) => {
      const raw = values[i] ?? "";
      const n = Number(raw);
      row[h] = raw !== "" && Number.isFinite(n) ? n : raw;
    });
    return row;
  });
}

async function rowsFromFormFile(formData: FormData, field = "file"): Promise<RawRow[]> {
  const file = formData.get(field);
  if (!file || typeof file === "string") return [];

  const maybeFile = file as File;
  const fileName = safeText((maybeFile as any).name).toLowerCase();

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const loadXlsx = new Function("moduleName", "return import(moduleName)") as (moduleName: string) => Promise<any>;
    const XLSX = await loadXlsx("xlsx");
    const buffer = await maybeFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(sheet) as RawRow[];
  }

  const text = await maybeFile.text();
  return parseCSV(text);
}

function getColumns(rows: RawRow[]): string[] {
  return rows.length ? Object.keys(rows[0]) : [];
}

function uniqueValues(rows: RawRow[], col: string): string[] {
  return Array.from(new Set(rows.map((r) => r[col]).filter((v) => !isMissing(v)).map(String)));
}

function isNumericColumn(rows: RawRow[], col: string): boolean {
  const vals = rows.map((r) => r[col]).filter((v) => !isMissing(v));
  return vals.length > 0 && vals.every((v) => Number.isFinite(Number(v)));
}

function numericVector(rows: RawRow[], col: string): number[] {
  return rows.map((r) => Number(r[col])).filter((v) => Number.isFinite(v));
}

function pairedNumericVectors(rows: RawRow[], a: string, b: string): { x: number[]; y: number[] } {
  const pairs = rows
    .map((r) => ({ x: Number(r[a]), y: Number(r[b]) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return { x: pairs.map((p) => p.x), y: pairs.map((p) => p.y) };
}

function pearsonCorrelation(x: number[], y: number[]): number | null {
  const pairs = x.map((v, i) => [v, y[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 3) return null;
  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);
  const mx = mean(xs);
  const my = mean(ys);
  if (mx === null || my === null) return null;
  const numerator = sum(xs.map((v, i) => (v - mx) * (ys[i] - my)));
  const denominator = Math.sqrt(sum(xs.map((v) => (v - mx) ** 2)) * sum(ys.map((v) => (v - my) ** 2)));
  return denominator === 0 ? null : numerator / denominator;
}

function rank(values: number[]): number[] {
  const indexed = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = Array(values.length).fill(0);
  let i = 0;
  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].v === indexed[i].v) j += 1;
    const avgRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

function spearmanCorrelation(x: number[], y: number[]): number | null {
  const pairs = x.map((v, i) => [v, y[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 3) return null;
  return pearsonCorrelation(rank(pairs.map((p) => p[0])), rank(pairs.map((p) => p[1])));
}

function correlationTest(rows: RawRow[], xCol: string, yCol: string, method: "pearson" | "spearman") {
  const pairs = rows
    .map((r) => ({ x: Number(r[xCol]), y: Number(r[yCol]) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  const x = pairs.map((p) => p.x);
  const y = pairs.map((p) => p.y);
  const r = method === "pearson" ? pearsonCorrelation(x, y) : spearmanCorrelation(x, y);
  if (r === null || pairs.length < 3) return { test: `${method} correlation`, x: xCol, y: yCol, n: pairs.length, correlation: null, pValue: null, message: "Insufficient paired numeric data." };
  const t = r * Math.sqrt((pairs.length - 2) / Math.max(1e-12, 1 - r * r));
  const pValue = studentTTwoSidedP(t, pairs.length - 2);
  return { test: `${method} correlation`, x: xCol, y: yCol, n: pairs.length, correlation: r, tStatistic: t, df: pairs.length - 2, pValue };
}

function independentTTestFromArrays(a: number[], b: number[], equalVariance = false) {
  const x = finite(a);
  const y = finite(b);
  const mx = mean(x);
  const my = mean(y);
  const vx = variance(x);
  const vy = variance(y);
  if (x.length < 2 || y.length < 2 || mx === null || my === null || vx === null || vy === null) {
    return { n1: x.length, n2: y.length, mean1: mx, mean2: my, tStatistic: null, df: null, pValue: null, message: "At least two valid observations are required in both groups." };
  }
  let t: number;
  let df: number;
  let se: number;
  if (equalVariance) {
    const sp2 = ((x.length - 1) * vx + (y.length - 1) * vy) / (x.length + y.length - 2);
    se = Math.sqrt(sp2 * (1 / x.length + 1 / y.length));
    df = x.length + y.length - 2;
    t = (mx - my) / se;
  } else {
    se = Math.sqrt(vx / x.length + vy / y.length);
    const numerator = (vx / x.length + vy / y.length) ** 2;
    const denominator = (vx * vx) / (x.length * x.length * (x.length - 1)) + (vy * vy) / (y.length * y.length * (y.length - 1));
    df = numerator / denominator;
    t = (mx - my) / se;
  }
  const pValue = studentTTwoSidedP(t, df);
  return { n1: x.length, n2: y.length, mean1: mx, mean2: my, sd1: sd(x), sd2: sd(y), meanDifference: mx - my, standardError: se, tStatistic: t, df, pValue };
}

function independentTTest(rows: RawRow[], valueColumn: string, groupColumn: string) {
  const levels = uniqueValues(rows, groupColumn).slice(0, 2);
  if (levels.length !== 2) return { test: "Welch independent t-test", valueColumn, groupColumn, pValue: null, message: "The group column must contain exactly two groups." };
  const groupA = rows.filter((r) => String(r[groupColumn]) === levels[0]).map((r) => Number(r[valueColumn]));
  const groupB = rows.filter((r) => String(r[groupColumn]) === levels[1]).map((r) => Number(r[valueColumn]));
  return { test: "Welch independent t-test", valueColumn, groupColumn, group1: levels[0], group2: levels[1], ...independentTTestFromArrays(groupA, groupB, false) };
}

function pairedTTest(rows: RawRow[], aCol: string, bCol: string) {
  const { x, y } = pairedNumericVectors(rows, aCol, bCol);
  const d = x.map((v, i) => v - y[i]);
  const md = mean(d);
  const s = sd(d);
  if (d.length < 2 || md === null || s === null) return { test: "Paired t-test", columnA: aCol, columnB: bCol, n: d.length, pValue: null, message: "At least two complete pairs are required." };
  const se = s / Math.sqrt(d.length);
  const t = md / se;
  return { test: "Paired t-test", columnA: aCol, columnB: bCol, n: d.length, meanDifference: md, sdDifference: s, standardError: se, tStatistic: t, df: d.length - 1, pValue: studentTTwoSidedP(t, d.length - 1) };
}

function oneSampleTTest(rows: RawRow[], valueColumn: string, mu = 0) {
  const x = numericVector(rows, valueColumn);
  const m = mean(x);
  const s = sd(x);
  if (x.length < 2 || m === null || s === null) return { test: "One-sample t-test", valueColumn, hypothesizedMean: mu, n: x.length, pValue: null, message: "At least two valid observations are required." };
  const se = s / Math.sqrt(x.length);
  const t = (m - mu) / se;
  return { test: "One-sample t-test", valueColumn, hypothesizedMean: mu, n: x.length, mean: m, sd: s, tStatistic: t, df: x.length - 1, pValue: studentTTwoSidedP(t, x.length - 1) };
}

function oneWayANOVA(rows: RawRow[], valueColumn: string, groupColumn: string) {
  const levels = uniqueValues(rows, groupColumn);
  const groups = levels.map((level) => ({ level, values: rows.filter((r) => String(r[groupColumn]) === level).map((r) => Number(r[valueColumn])).filter(Number.isFinite) }));
  const validGroups = groups.filter((g) => g.values.length > 0);
  const all = validGroups.flatMap((g) => g.values);
  const grandMean = mean(all);
  if (validGroups.length < 2 || all.length <= validGroups.length || grandMean === null) return { test: "One-way ANOVA", valueColumn, groupColumn, pValue: null, message: "At least two groups and residual degrees of freedom are required." };
  const ssBetween = sum(validGroups.map((g) => g.values.length * (Number(mean(g.values)) - grandMean) ** 2));
  const ssWithin = sum(validGroups.flatMap((g) => g.values.map((v) => (v - Number(mean(g.values))) ** 2)));
  const dfBetween = validGroups.length - 1;
  const dfWithin = all.length - validGroups.length;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const fStatistic = msBetween / msWithin;
  return {
    test: "One-way ANOVA",
    valueColumn,
    groupColumn,
    groups: validGroups.map((g) => ({ level: g.level, ...describeNumeric(g.values) })),
    ssBetween,
    ssWithin,
    dfBetween,
    dfWithin,
    msBetween,
    msWithin,
    fStatistic,
    pValue: fPValue(fStatistic, dfBetween, dfWithin),
    etaSquared: ssBetween / (ssBetween + ssWithin),
  };
}

function welchANOVA(rows: RawRow[], valueColumn: string, groupColumn: string) {
  const levels = uniqueValues(rows, groupColumn);
  const groups = levels
    .map((level) => ({ level, values: rows.filter((r) => String(r[groupColumn]) === level).map((r) => Number(r[valueColumn])).filter(Number.isFinite) }))
    .filter((g) => g.values.length >= 2 && Number(variance(g.values)) > 0);
  if (groups.length < 2) return { test: "Welch ANOVA", valueColumn, groupColumn, pValue: null, message: "At least two groups with variance are required." };
  const k = groups.length;
  const stats = groups.map((g) => ({ level: g.level, n: g.values.length, mean: Number(mean(g.values)), variance: Number(variance(g.values)) }));
  const weights = stats.map((g) => g.n / g.variance);
  const wSum = sum(weights);
  const weightedMean = sum(stats.map((g, i) => weights[i] * g.mean)) / wSum;
  const numerator = sum(stats.map((g, i) => weights[i] * (g.mean - weightedMean) ** 2)) / (k - 1);
  const lambda = (3 * sum(stats.map((g, i) => ((1 - weights[i] / wSum) ** 2) / (g.n - 1)))) / (k * k - 1);
  const fStatistic = numerator / (1 + (2 * (k - 2) * lambda) / 3);
  const df1 = k - 1;
  const df2 = 1 / lambda;
  return { test: "Welch ANOVA", valueColumn, groupColumn, groups: stats, fStatistic, df1, df2, pValue: fPValue(fStatistic, df1, df2) };
}

function leveneTest(rows: RawRow[], valueColumn: string, groupColumn: string) {
  const levels = uniqueValues(rows, groupColumn);
  const groupMedians = new Map<string, number>();
  levels.forEach((level) => {
    const vals = rows.filter((r) => String(r[groupColumn]) === level).map((r) => Number(r[valueColumn])).filter(Number.isFinite);
    const med = median(vals);
    if (med !== null) groupMedians.set(level, med);
  });
  const transformed = rows
    .filter((r) => groupMedians.has(String(r[groupColumn])) && Number.isFinite(Number(r[valueColumn])))
    .map((r) => ({ ...r, __levene_abs_dev: Math.abs(Number(r[valueColumn]) - Number(groupMedians.get(String(r[groupColumn])))) }));
  return { ...oneWayANOVA(transformed, "__levene_abs_dev", groupColumn), test: "Levene test for equality of variances", originalValueColumn: valueColumn };
}


function nestedModelFTest(reduced: any, full: any, label: string) {
  if (!reduced || !full || reduced.sse === undefined || full.sse === undefined) {
    return { effect: label, fStatistic: null, df1: null, df2: null, pValue: null, message: "Model comparison could not be calculated." };
  }

  const df1 = Number(reduced.dfResidual) - Number(full.dfResidual);
  const df2 = Number(full.dfResidual);
  const sseReduced = Number(reduced.sse);
  const sseFull = Number(full.sse);

  if (!Number.isFinite(df1) || !Number.isFinite(df2) || df1 <= 0 || df2 <= 0 || sseReduced < sseFull) {
    return { effect: label, fStatistic: null, df1, df2, pValue: null, message: "Nested model comparison is not valid for this dataset/design." };
  }

  const fStatistic = ((sseReduced - sseFull) / df1) / (sseFull / df2);
  return { effect: label, fStatistic, df1, df2, pValue: fPValue(fStatistic, df1, df2) };
}

function twoWayANOVA(rows: RawRow[], valueColumn: string, factorA: string, factorB: string) {
  if (!factorA || !factorB || factorA === factorB) {
    return {
      test: "Two-way ANOVA",
      valueColumn,
      factorA,
      factorB,
      pValue: null,
      message: "Two-way ANOVA requires two different factor columns. In the page, enter them as Group / factor column = factorA,factorB.",
    };
  }

  const usable = rows
    .filter((r) => !isMissing(r[factorA]) && !isMissing(r[factorB]) && Number.isFinite(Number(r[valueColumn])))
    .map((r) => ({ ...r, __interaction_factor: `${String(r[factorA])} × ${String(r[factorB])}` }));

  if (usable.length < 6 || uniqueValues(usable, factorA).length < 2 || uniqueValues(usable, factorB).length < 2) {
    return {
      test: "Two-way ANOVA",
      valueColumn,
      factorA,
      factorB,
      pValue: null,
      message: "Two-way ANOVA requires at least two levels in each factor and sufficient complete observations.",
    };
  }

  const interceptOnlyRows = usable.map((r) => ({ ...r, __intercept_only: 1 }));
  const modelA = linearRegression(interceptOnlyRows, valueColumn, [factorA]);
  const modelAB = linearRegression(interceptOnlyRows, valueColumn, [factorA, factorB]);
  const modelFull = linearRegression(interceptOnlyRows, valueColumn, [factorA, factorB, "__interaction_factor"]);
  const nullModel = linearRegression(interceptOnlyRows, valueColumn, ["__intercept_only"]);

  const effects = [
    nestedModelFTest(nullModel, modelA, factorA),
    nestedModelFTest(modelA, modelAB, factorB),
    nestedModelFTest(modelAB, modelFull, `${factorA}:${factorB}`),
  ];

  return {
    test: "Two-way ANOVA",
    method: "Sequential nested-model ANOVA using dummy-coded factors and interaction term",
    valueColumn,
    factorA,
    factorB,
    n: usable.length,
    factorALevels: uniqueValues(usable, factorA),
    factorBLevels: uniqueValues(usable, factorB),
    effects,
    pValue: effects.map((e: any) => e.pValue).filter((p: any) => Number.isFinite(p)).sort((a: number, b: number) => a - b)[0] ?? null,
    fullModel: modelFull,
  };
}

function repeatedMeasuresFromWideColumns(rows: RawRow[], valueColumns: string[], alpha: number) {
  const numericCols = valueColumns.filter((c) => isNumericColumn(rows, c));
  if (numericCols.length < 2) {
    return {
      test: "Repeated-measures ANOVA",
      pValue: null,
      message: "Repeated-measures analysis requires at least two numeric repeated-measure columns.",
    };
  }

  const complete = rows.filter((r) => numericCols.every((c) => Number.isFinite(Number(r[c]))));
  const n = complete.length;
  const k = numericCols.length;

  if (n < 2 || k < 2) {
    return {
      test: "Repeated-measures ANOVA",
      pValue: null,
      message: "Insufficient complete repeated-measures rows.",
    };
  }

  const matrix = complete.map((r) => numericCols.map((c) => Number(r[c])));
  const allValues = matrix.flat();
  const grandMean = mean(allValues);
  if (grandMean === null) {
    return { test: "Repeated-measures ANOVA", pValue: null, message: "No numeric repeated-measures values." };
  }

  const subjectMeans = matrix.map((row) => Number(mean(row)));
  const conditionMeans = numericCols.map((_, j) => Number(mean(matrix.map((row) => row[j]))));
  const ssTotal = sum(allValues.map((v) => (v - grandMean) ** 2));
  const ssSubjects = k * sum(subjectMeans.map((m) => (m - grandMean) ** 2));
  const ssConditions = n * sum(conditionMeans.map((m) => (m - grandMean) ** 2));
  const ssError = ssTotal - ssSubjects - ssConditions;
  const dfConditions = k - 1;
  const dfError = (n - 1) * (k - 1);
  const msConditions = ssConditions / dfConditions;
  const msError = ssError / dfError;
  const fStatistic = msError > 0 ? msConditions / msError : null;

  return {
    test: "Repeated-measures ANOVA",
    method: "One-factor repeated-measures ANOVA from wide repeated-measure columns",
    valueColumns: numericCols,
    nSubjects: n,
    conditions: k,
    conditionMeans: numericCols.map((c, i) => ({ condition: c, mean: conditionMeans[i] })),
    ssTotal,
    ssSubjects,
    ssConditions,
    ssError,
    dfConditions,
    dfError,
    fStatistic,
    pValue: fStatistic === null ? null : fPValue(fStatistic, dfConditions, dfError),
    etaSquaredPartial: ssConditions / (ssConditions + ssError),
    significant: fStatistic === null ? false : (fPValue(fStatistic, dfConditions, dfError) ?? 1) < alpha,
  };
}

function mannWhitneyU(rows: RawRow[], valueColumn: string, groupColumn: string) {
  const levels = uniqueValues(rows, groupColumn).slice(0, 2);
  if (levels.length !== 2) return { test: "Mann-Whitney U test", valueColumn, groupColumn, pValue: null, message: "Exactly two groups are required." };
  const values = rows
    .filter((r) => levels.includes(String(r[groupColumn])) && Number.isFinite(Number(r[valueColumn])))
    .map((r) => ({ value: Number(r[valueColumn]), group: String(r[groupColumn]) }));
  const ranks = rank(values.map((v) => v.value));
  const n1 = values.filter((v) => v.group === levels[0]).length;
  const n2 = values.filter((v) => v.group === levels[1]).length;
  if (n1 < 1 || n2 < 1) return { test: "Mann-Whitney U test", valueColumn, groupColumn, pValue: null, message: "Both groups require at least one numeric value." };
  const r1 = sum(values.map((v, i) => (v.group === levels[0] ? ranks[i] : 0)));
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = (u - mu) / sigma;
  return { test: "Mann-Whitney U test", valueColumn, groupColumn, group1: levels[0], group2: levels[1], n1, n2, uStatistic: u, zStatistic: z, pValue: normalTwoSidedP(z) };
}

function kruskalWallis(rows: RawRow[], valueColumn: string, groupColumn: string) {
  const levels = uniqueValues(rows, groupColumn);
  const values = rows
    .filter((r) => !isMissing(r[groupColumn]) && Number.isFinite(Number(r[valueColumn])))
    .map((r) => ({ value: Number(r[valueColumn]), group: String(r[groupColumn]) }));
  const N = values.length;
  if (levels.length < 2 || N <= levels.length) return { test: "Kruskal-Wallis test", valueColumn, groupColumn, pValue: null, message: "At least two groups and sufficient observations are required." };
  const ranks = rank(values.map((v) => v.value));
  const groupStats = levels.map((level) => {
    const idx = values.map((v, i) => (v.group === level ? i : -1)).filter((i) => i >= 0);
    return { level, n: idx.length, rankSum: sum(idx.map((i) => ranks[i])) };
  }).filter((g) => g.n > 0);
  const H = (12 / (N * (N + 1))) * sum(groupStats.map((g) => (g.rankSum ** 2) / g.n)) - 3 * (N + 1);
  const df = groupStats.length - 1;
  return { test: "Kruskal-Wallis test", valueColumn, groupColumn, groups: groupStats, hStatistic: H, df, pValue: chiSquarePValue(H, df) };
}

function factorialLog(n: number): number {
  return logGamma(n + 1);
}

function hypergeometricProbability(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  return Math.exp(factorialLog(a + b) + factorialLog(c + d) + factorialLog(a + c) + factorialLog(b + d) - factorialLog(a) - factorialLog(b) - factorialLog(c) - factorialLog(d) - factorialLog(n));
}

function fisherExact2x2(a: number, b: number, c: number, d: number) {
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const minA = Math.max(0, col1 - row2);
  const maxA = Math.min(col1, row1);
  const observed = hypergeometricProbability(a, b, c, d);
  let pTwoSided = 0;
  for (let x = minA; x <= maxA; x++) {
    const y = row1 - x;
    const z = col1 - x;
    const w = row2 - z;
    const p = hypergeometricProbability(x, y, z, w);
    if (p <= observed + 1e-12) pTwoSided += p;
  }
  return Math.max(0, Math.min(1, pTwoSided));
}

function contingencyTable(rows: RawRow[], rowColumn: string, colColumn: string) {
  const rowLevels = uniqueValues(rows, rowColumn);
  const colLevels = uniqueValues(rows, colColumn);
  const table = rowLevels.map((r) => colLevels.map((c) => rows.filter((row) => String(row[rowColumn]) === r && String(row[colColumn]) === c).length));
  return { rowLevels, colLevels, table };
}

function chiSquareIndependence(rows: RawRow[], rowColumn: string, colColumn: string) {
  const { rowLevels, colLevels, table } = contingencyTable(rows, rowColumn, colColumn);
  const r = rowLevels.length;
  const c = colLevels.length;
  if (r < 2 || c < 2) return { test: "Chi-square test of independence", rowColumn, colColumn, pValue: null, message: "Both variables require at least two levels." };
  const rowTotals = table.map((row) => sum(row));
  const colTotals = colLevels.map((_, j) => sum(table.map((row) => row[j])));
  const n = sum(rowTotals);
  let chiSquare = 0;
  let minExpected = Infinity;
  for (let i = 0; i < r; i++) {
    for (let j = 0; j < c; j++) {
      const expected = (rowTotals[i] * colTotals[j]) / n;
      minExpected = Math.min(minExpected, expected);
      if (expected > 0) chiSquare += ((table[i][j] - expected) ** 2) / expected;
    }
  }
  const df = (r - 1) * (c - 1);
  const result: any = { test: "Chi-square test of independence", rowColumn, colColumn, rowLevels, colLevels, table, chiSquare, df, pValue: chiSquarePValue(chiSquare, df), minimumExpectedCellCount: minExpected };
  if (r === 2 && c === 2) {
    result.fisherExactTwoSidedP = fisherExact2x2(table[0][0], table[0][1], table[1][0], table[1][1]);
    result.recommendedExactTest = minExpected < 5;
  }
  return result;
}

function normalityJarqueBera(values: number[], variable = "value") {
  const x = finite(values);
  const n = x.length;
  const m = mean(x);
  const s = sd(x);
  if (n < 5 || m === null || s === null || s === 0) return { test: "Jarque-Bera normality test", variable, n, pValue: null, message: "At least five non-constant values are required." };
  const skewness = sum(x.map((v) => ((v - m) / s) ** 3)) / n;
  const kurtosis = sum(x.map((v) => ((v - m) / s) ** 4)) / n;
  const jb = (n / 6) * (skewness ** 2 + ((kurtosis - 3) ** 2) / 4);
  return { test: "Jarque-Bera normality test", variable, n, skewness, kurtosis, jbStatistic: jb, df: 2, pValue: chiSquarePValue(jb, 2) };
}

function transpose(A: number[][]): number[][] {
  return A[0].map((_, j) => A.map((row) => row[j]));
}

function matMul(A: number[][], B: number[][]): number[][] {
  return A.map((row) => B[0].map((_, j) => sum(row.map((v, k) => v * B[k][j]))));
}

function matVecMul(A: number[][], v: number[]): number[] {
  return A.map((row) => sum(row.map((x, i) => x * v[i])));
}

function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
}

function inverse(A: number[][]): number[][] | null {
  const n = A.length;
  if (n === 0 || A.some((row) => row.length !== n)) return null;
  const M = A.map((row, i) => [...row, ...identity(n)[i]]);
  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    if (Math.abs(M[maxRow][i]) < 1e-12) return null;
    [M[i], M[maxRow]] = [M[maxRow], M[i]];
    const pivot = M[i][i];
    for (let j = 0; j < 2 * n; j++) M[i][j] /= pivot;
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = M[k][i];
      for (let j = 0; j < 2 * n; j++) M[k][j] -= factor * M[i][j];
    }
  }
  return M.map((row) => row.slice(n));
}

function buildDesignMatrix(rows: RawRow[], predictors: string[]) {
  const metadata: any[] = [{ name: "Intercept", type: "intercept" }];
  const categoricalLevels = new Map<string, string[]>();
  predictors.forEach((p) => {
    if (isNumericColumn(rows, p)) {
      metadata.push({ name: p, source: p, type: "numeric" });
    } else {
      const levels = uniqueValues(rows, p);
      categoricalLevels.set(p, levels);
      levels.slice(1).forEach((level) => metadata.push({ name: `${p}=${level}`, source: p, level, reference: levels[0], type: "dummy" }));
    }
  });
  const X = rows.map((row) => metadata.map((m) => {
    if (m.type === "intercept") return 1;
    if (m.type === "numeric") return Number(row[m.source]);
    return String(row[m.source]) === m.level ? 1 : 0;
  }));
  return { X, metadata };
}

function linearRegression(rows: RawRow[], outcome: string, predictors: string[]) {
  const completeRows = rows.filter((r) => Number.isFinite(Number(r[outcome])) && predictors.every((p) => !isMissing(r[p]) && (isNumericColumn(rows, p) ? Number.isFinite(Number(r[p])) : true)));
  if (completeRows.length < predictors.length + 2) return { test: "Multiple linear regression", outcome, predictors, n: completeRows.length, pValue: null, message: "Insufficient complete observations." };
  const y = completeRows.map((r) => Number(r[outcome]));
  const { X, metadata } = buildDesignMatrix(completeRows, predictors);
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtXInv = inverse(XtX);
  if (!XtXInv) return { test: "Multiple linear regression", outcome, predictors, n: completeRows.length, pValue: null, message: "Design matrix is singular; remove collinear predictors." };
  const Xty = matVecMul(Xt, y);
  const beta = matVecMul(XtXInv, Xty);
  const fitted = matVecMul(X, beta);
  const residuals = y.map((v, i) => v - fitted[i]);
  const yMean = Number(mean(y));
  const sse = sum(residuals.map((e) => e * e));
  const sst = sum(y.map((v) => (v - yMean) ** 2));
  const ssr = sst - sse;
  const n = y.length;
  const p = beta.length - 1;
  const dfResidual = n - p - 1;
  const mse = sse / dfResidual;
  const vcov = XtXInv.map((row) => row.map((v) => v * mse));
  const coefficients = beta.map((b, i) => {
    const se = Math.sqrt(Math.max(0, vcov[i][i]));
    const t = b / se;
    return { term: metadata[i].name, estimate: b, standardError: se, tStatistic: t, df: dfResidual, pValue: studentTTwoSidedP(t, dfResidual), ci95: { lower: b - 1.96 * se, upper: b + 1.96 * se }, metadata: metadata[i] };
  });
  const rSquared = sst > 0 ? 1 - sse / sst : null;
  const adjustedRSquared = rSquared !== null ? 1 - (1 - rSquared) * ((n - 1) / dfResidual) : null;
  const fStatistic = p > 0 ? (ssr / p) / mse : null;
  return { test: "Multiple linear regression", outcome, predictors, n, coefficients, fitted, residuals, sse, ssr, sst, dfModel: p, dfResidual, mse, rSquared, adjustedRSquared, fStatistic, pValue: fStatistic === null ? null : fPValue(fStatistic, p, dfResidual) };
}

function binaryOutcomeEncode(rows: RawRow[], outcome: string) {
  const levels = uniqueValues(rows, outcome);
  if (levels.length !== 2) return null;
  const positive = levels.includes("1") ? "1" : levels[1];
  const negative = levels.find((x) => x !== positive) ?? levels[0];
  return { positive, negative };
}

function logisticRegression(rows: RawRow[], outcome: string, predictors: string[]) {
  const enc = binaryOutcomeEncode(rows, outcome);
  if (!enc) return { test: "Multivariable logistic regression", outcome, predictors, pValue: null, message: "Outcome must contain exactly two levels." };
  const completeRows = rows.filter((r) => !isMissing(r[outcome]) && predictors.every((p) => !isMissing(r[p]) && (isNumericColumn(rows, p) ? Number.isFinite(Number(r[p])) : true)));
  const y = completeRows.map((r) => (String(r[outcome]) === enc.positive ? 1 : 0));
  if (completeRows.length < predictors.length + 5 || new Set(y).size !== 2) return { test: "Multivariable logistic regression", outcome, predictors, positiveLevel: enc.positive, n: completeRows.length, pValue: null, message: "Insufficient complete observations or no outcome variation." };
  const { X, metadata } = buildDesignMatrix(completeRows, predictors);
  const p = X[0].length;
  let beta = Array(p).fill(0);
  let converged = false;
  let iterations = 0;
  for (let iter = 0; iter < 75; iter++) {
    iterations = iter + 1;
    const eta = matVecMul(X, beta);
    const mu = eta.map((e) => Math.min(1 - 1e-8, Math.max(1e-8, 1 / (1 + Math.exp(-e)))));
    const W = mu.map((m) => m * (1 - m));
    const XtWX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => sum(X.map((row, k) => row[i] * W[k] * row[j]))));
    const XtResidual = Array.from({ length: p }, (_, i) => sum(X.map((row, k) => row[i] * (y[k] - mu[k]))));
    const inv = inverse(XtWX);
    if (!inv) return { test: "Multivariable logistic regression", outcome, predictors, n: completeRows.length, pValue: null, message: "Hessian is singular; reduce predictors or remove collinear variables." };
    const step = matVecMul(inv, XtResidual);
    beta = beta.map((b, i) => b + step[i]);
    if (Math.max(...step.map(Math.abs)) < 1e-7) {
      converged = true;
      break;
    }
  }
  const eta = matVecMul(X, beta);
  const mu = eta.map((e) => Math.min(1 - 1e-8, Math.max(1e-8, 1 / (1 + Math.exp(-e)))));
  const W = mu.map((m) => m * (1 - m));
  const XtWX = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => sum(X.map((row, k) => row[i] * W[k] * row[j]))));
  const cov = inverse(XtWX);
  const coefficients = beta.map((b, i) => {
    const se = cov ? Math.sqrt(Math.max(0, cov[i][i])) : null;
    const z = se && se > 0 ? b / se : null;
    return { term: metadata[i].name, estimateLogOdds: b, standardError: se, zStatistic: z, pValue: z === null ? null : normalTwoSidedP(z), oddsRatio: Math.exp(b), ci95OddsRatio: se === null ? { lower: null, upper: null } : { lower: Math.exp(b - 1.96 * se), upper: Math.exp(b + 1.96 * se) }, metadata: metadata[i] };
  });
  const logLik = sum(y.map((v, i) => v * Math.log(mu[i]) + (1 - v) * Math.log(1 - mu[i])));
  const nullMean = Math.min(1 - 1e-8, Math.max(1e-8, Number(mean(y))));
  const nullLogLik = sum(y.map((v) => v * Math.log(nullMean) + (1 - v) * Math.log(1 - nullMean)));
  const lrStatistic = 2 * (logLik - nullLogLik);
  const dfModel = p - 1;
  return { test: "Multivariable logistic regression", outcome, predictors, positiveLevel: enc.positive, negativeLevel: enc.negative, n: completeRows.length, converged, iterations, coefficients, fittedProbabilities: mu, logLikelihood: logLik, nullLogLikelihood: nullLogLik, likelihoodRatioStatistic: lrStatistic, dfModel, pValue: chiSquarePValue(lrStatistic, dfModel), pseudoR2McFadden: 1 - logLik / nullLogLik };
}

function analyzeCategoricalRisk(rows: RawRow[], outcome: string, predictor: string) {
  const enc = binaryOutcomeEncode(rows, outcome);
  if (!enc) return { variable: predictor, test: "failed", pValue: null, message: "Outcome must have exactly two levels." };
  const levels = uniqueValues(rows, predictor);
  if (levels.length < 1) return { variable: predictor, test: "failed", pValue: null, message: "Predictor has no valid levels." };
  const level = levels.includes("1") ? "1" : levels[0];
  const valid = rows.filter((r) => !isMissing(r[outcome]) && !isMissing(r[predictor]));
  const a0 = valid.filter((r) => String(r[predictor]) === level && String(r[outcome]) === enc.positive).length;
  const b0 = valid.filter((r) => String(r[predictor]) === level && String(r[outcome]) !== enc.positive).length;
  const c0 = valid.filter((r) => String(r[predictor]) !== level && String(r[outcome]) === enc.positive).length;
  const d0 = valid.filter((r) => String(r[predictor]) !== level && String(r[outcome]) !== enc.positive).length;
  const a = a0 + 0.5, b = b0 + 0.5, c = c0 + 0.5, d = d0 + 0.5;
  const oddsRatio = (a * d) / (b * c);
  const seLogOR = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  const chi = (() => {
    const total = a0 + b0 + c0 + d0;
    const den = (a0 + b0) * (c0 + d0) * (a0 + c0) * (b0 + d0);
    return den > 0 ? (total * (a0 * d0 - b0 * c0) ** 2) / den : null;
  })();
  return { variable: predictor, variableType: "categorical", levelCompared: level, test: "univariable 2x2 odds ratio + chi-square/Fisher", pValue: chi === null ? null : chiSquarePValue(chi, 1), fisherExactTwoSidedP: fisherExact2x2(a0, b0, c0, d0), chiSquare: chi, oddsRatio, ciLower: Math.exp(Math.log(oddsRatio) - 1.96 * seLogOR), ciUpper: Math.exp(Math.log(oddsRatio) + 1.96 * seLogOR), table: { exposedPositive: a0, exposedNegative: b0, unexposedPositive: c0, unexposedNegative: d0 } };
}

function analyzeContinuousRisk(rows: RawRow[], outcome: string, predictor: string) {
  const enc = binaryOutcomeEncode(rows, outcome);
  if (!enc) return { variable: predictor, test: "failed", pValue: null, message: "Outcome must have exactly two levels." };
  const positive = rows.filter((r) => String(r[outcome]) === enc.positive && Number.isFinite(Number(r[predictor]))).map((r) => Number(r[predictor]));
  const negative = rows.filter((r) => String(r[outcome]) !== enc.positive && Number.isFinite(Number(r[predictor]))).map((r) => Number(r[predictor]));
  return { variable: predictor, variableType: "continuous", test: "univariable Welch t-test screening", ...independentTTestFromArrays(positive, negative, false) };
}

function analyzeRisk(rows: RawRow[], outcome: string, predictors: string[], threshold: number) {
  const univariable = predictors.map((p) => {
    if (!getColumns(rows).includes(p)) return { variable: p, test: "skipped", pValue: null, message: "Predictor not found." };
    if (isNumericColumn(rows, p) && uniqueValues(rows, p).length > 5) return analyzeContinuousRisk(rows, outcome, p);
    return analyzeCategoricalRisk(rows, outcome, p);
  });
  const selectedVariables = univariable.filter((u: any) => Number.isFinite(u.pValue) && u.pValue < threshold).map((u: any) => u.variable);
  const multivariablePredictors = selectedVariables.length ? selectedVariables : predictors.slice(0, 8);
  const multivariable = logisticRegression(rows, outcome, multivariablePredictors);
  return {
    outcome,
    predictors,
    threshold,
    datasetProfile: describeDataset(rows),
    univariable,
    selectedVariables,
    multivariable,
    regression: { logistic: multivariable },
    summary: {
      totalPredictors: predictors.length,
      significantAt005: univariable.filter((u: any) => Number.isFinite(u.pValue) && u.pValue < 0.05).length,
      selectedForMultivariable: selectedVariables.length,
      strongestPredictor: [...univariable].filter((u: any) => Number.isFinite(u.pValue)).sort((a: any, b: any) => a.pValue - b.pValue)[0] ?? null,
    },
    visualization: {
      pValueBars: univariable.map((u: any) => ({ variable: u.variable, pValue: u.pValue, selected: Number.isFinite(u.pValue) && u.pValue < threshold })),
      forestData: univariable.filter((u: any) => Number.isFinite(u.oddsRatio)).map((u: any) => ({ variable: u.variable, oddsRatio: u.oddsRatio, ciLower: u.ciLower, ciUpper: u.ciUpper, pValue: u.pValue })),
      multivariableForestData: (multivariable as any).coefficients?.filter((c: any) => c.term !== "Intercept").map((c: any) => ({ term: c.term, oddsRatio: c.oddsRatio, ciLower: c.ci95OddsRatio.lower, ciUpper: c.ci95OddsRatio.upper, pValue: c.pValue })) ?? [],
    },
  };
}

function describeDataset(rows: RawRow[]) {
  const columns = getColumns(rows);
  return {
    rows: rows.length,
    columns: columns.length,
    columnNames: columns,
    variableProfile: columns.map((c) => {
      const numeric = isNumericColumn(rows, c);
      const values = rows.map((r) => r[c]).filter((v) => !isMissing(v));
      return {
        variable: c,
        type: numeric ? "numeric" : "categorical/text",
        uniqueValues: uniqueValues(rows, c).length,
        missing: rows.filter((r) => isMissing(r[c])).length,
        numericSummary: numeric ? describeNumeric(values.map(Number)) : null,
        categories: numeric ? null : uniqueValues(rows, c).slice(0, 30).map((level) => ({ level, count: rows.filter((r) => String(r[c]) === level).length })),
      };
    }),
  };
}

function parseList(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== "string") return [];
  return value.split(",").map((x) => x.trim()).filter(Boolean);
}

function getStatRequest(formData: FormData, rows: RawRow[]): StatisticalTestRequest {
  const columns = getColumns(rows);
  const numericColumns = columns.filter((c) => isNumericColumn(rows, c));
  const categoricalColumns = columns.filter((c) => !isNumericColumn(rows, c));
  return {
    tests: parseList(formData.get("tests")).length ? parseList(formData.get("tests")) : ["descriptive", "normality", "correlation", "t_test", "anova", "chi_square", "regression"],
    valueColumns: parseList(formData.get("valueColumns")).length ? parseList(formData.get("valueColumns")) : numericColumns.slice(0, 6),
    groupColumn: parseList(formData.get("groupColumn"))[0] ?? safeText(formData.get("groupColumn"), categoricalColumns[0] ?? ""),
    outcomeColumn: safeText(formData.get("outcomeColumn"), categoricalColumns[0] ?? numericColumns[0] ?? ""),
    predictorColumns: parseList(formData.get("predictorColumns")).length ? parseList(formData.get("predictorColumns")) : columns.filter((c) => c !== (categoricalColumns[0] ?? numericColumns[0])).slice(0, 8),
    subjectColumn: safeText(formData.get("subjectColumn"), ""),
    pairedColumnA: safeText(formData.get("pairedColumnA"), numericColumns[0] ?? ""),
    pairedColumnB: safeText(formData.get("pairedColumnB"), numericColumns[1] ?? ""),
    oneSampleMean: safeNumber(formData.get("oneSampleMean"), 0),
    alpha: safeNumber(formData.get("alpha"), 0.05),
    rawGroupColumn: safeText(formData.get("groupColumn")),
  };
}

function analyzeStatistics(rows: RawRow[], request: StatisticalTestRequest) {
  const profile = describeDataset(rows);
  const numericColumns = profile.columnNames.filter((c) => isNumericColumn(rows, c));
  const categoricalColumns = profile.columnNames.filter((c) => !isNumericColumn(rows, c));
  const tests = new Set(request.tests.map((t) => t.toLowerCase().replace(/[\s-]+/g, "_")));
  const valueColumns = request.valueColumns.filter((c) => numericColumns.includes(c));
  const rawGroupFactors = parseList((request as any).rawGroupColumn ?? null);
  const groupFactors = rawGroupFactors.length >= 2 ? rawGroupFactors : [request.groupColumn, categoricalColumns.find((c) => c !== request.groupColumn) ?? ""].filter(Boolean);
  const results: any = {
    request,
    dataset: profile,
    numericColumns,
    categoricalColumns,
    descriptiveStatistics: valueColumns.map((col) => ({ variable: col, ...describeNumeric(numericVector(rows, col)) })),
    tests: {},
    regression: {},
    univariable: [],
    multivariable: null,
    visualization: {},
    notes: [
      "All calculations are performed in this route.ts using implemented statistical formulas; no fake backend result is fabricated.",
      "Exact Fisher test is provided for 2x2 tables. Parametric p-values use Student t, F, chi-square/gamma, or normal approximations as appropriate.",
      "For publication-grade final inference, verify assumptions and sample size adequacy; this backend is intended for real analytical screening and dashboard reporting.",
    ],
  };
  if (tests.has("normality") || tests.has("normality_tests")) {
    results.tests.normality = valueColumns.map((col) => normalityJarqueBera(numericVector(rows, col), col));
  }
  if (tests.has("t_test") || tests.has("ttest") || tests.has("t")) {
    results.tests.tTests = valueColumns.map((col) => independentTTest(rows, col, request.groupColumn));
  }
  if (tests.has("paired_t_test") || tests.has("paired_ttest")) {
    results.tests.pairedTTest = pairedTTest(rows, request.pairedColumnA, request.pairedColumnB);
  }
  if (tests.has("one_sample_t_test") || tests.has("one_sample_ttest")) {
    results.tests.oneSampleTTests = valueColumns.map((col) => oneSampleTTest(rows, col, request.oneSampleMean));
  }
  if (tests.has("anova") || tests.has("one_way_anova")) {
    results.tests.anova = valueColumns.map((col) => oneWayANOVA(rows, col, request.groupColumn));
  }
  if (tests.has("two_way_anova")) {
    results.tests.twoWayAnova = valueColumns.map((col) => twoWayANOVA(rows, col, groupFactors[0] ?? "", groupFactors[1] ?? ""));
  }
  if (tests.has("repeated_measures_anova")) {
    results.tests.repeatedMeasuresAnova = repeatedMeasuresFromWideColumns(rows, valueColumns, request.alpha);
  }
  if (tests.has("welch_anova")) {
    results.tests.welchAnova = valueColumns.map((col) => welchANOVA(rows, col, request.groupColumn));
  }
  if (tests.has("levene") || tests.has("levene_test")) {
    results.tests.levene = valueColumns.map((col) => leveneTest(rows, col, request.groupColumn));
  }
  if (tests.has("mann_whitney") || tests.has("mann_whitney_u")) {
    results.tests.mannWhitney = valueColumns.map((col) => mannWhitneyU(rows, col, request.groupColumn));
  }
  if (tests.has("kruskal_wallis") || tests.has("kruskal")) {
    results.tests.kruskalWallis = valueColumns.map((col) => kruskalWallis(rows, col, request.groupColumn));
  }
  if (tests.has("chi_square") || tests.has("fisher") || tests.has("categorical")) {
    const pairs = categoricalColumns.flatMap((a, i) => categoricalColumns.slice(i + 1).map((b) => [a, b]));
    results.tests.chiSquareAndFisher = pairs.slice(0, 30).map(([a, b]) => chiSquareIndependence(rows, a, b));
  }
  if (tests.has("correlation") || tests.has("pearson") || tests.has("spearman")) {
    const pairs = numericColumns.flatMap((a, i) => numericColumns.slice(i + 1).map((b) => [a, b]));
    results.tests.correlations = pairs.slice(0, 100).flatMap(([a, b]) => [correlationTest(rows, a, b, "pearson"), correlationTest(rows, a, b, "spearman")]);
  }
  if (tests.has("linear_regression") || tests.has("regression")) {
    const outcome = numericColumns.includes(request.outcomeColumn) ? request.outcomeColumn : numericColumns[0] ?? "";
    const predictors = request.predictorColumns.filter((p) => p !== outcome && profile.columnNames.includes(p));
    if (outcome && predictors.length) results.regression.linear = linearRegression(rows, outcome, predictors);
  }
  if (tests.has("logistic_regression") || tests.has("multivariable") || tests.has("regression")) {
    const outcome = request.outcomeColumn || categoricalColumns[0] || "";
    const predictors = request.predictorColumns.filter((p) => p !== outcome && profile.columnNames.includes(p));
    if (outcome && predictors.length) {
      results.univariable = predictors.map((p) => (isNumericColumn(rows, p) && uniqueValues(rows, p).length > 5 ? analyzeContinuousRisk(rows, outcome, p) : analyzeCategoricalRisk(rows, outcome, p)));
      const selected = results.univariable.filter((u: any) => Number.isFinite(u.pValue) && u.pValue < request.alpha).map((u: any) => u.variable);
      results.multivariable = logisticRegression(rows, outcome, selected.length ? selected : predictors.slice(0, 8));
      results.regression.logistic = results.multivariable;
    }
  }
  const flattenedInferentialTests = [
    ...(results.tests.normality ?? []),
    ...(results.tests.tTests ?? []),
    ...(results.tests.oneSampleTTests ?? []),
    ...(results.tests.anova ?? []),
    ...(results.tests.twoWayAnova ?? []),
    ...(results.tests.welchAnova ?? []),
    ...(results.tests.levene ?? []),
    ...(results.tests.mannWhitney ?? []),
    ...(results.tests.kruskalWallis ?? []),
    ...(results.tests.chiSquareAndFisher ?? []),
    ...(Array.isArray(results.tests.pairedTTest) ? results.tests.pairedTTest : results.tests.pairedTTest ? [results.tests.pairedTTest] : []),
    ...(Array.isArray(results.tests.repeatedMeasuresAnova) ? results.tests.repeatedMeasuresAnova : results.tests.repeatedMeasuresAnova ? [results.tests.repeatedMeasuresAnova] : []),
  ];

  results.inferentialTests = flattenedInferentialTests;
  results.inferential = flattenedInferentialTests;
  results.correlations = results.tests.correlations ?? [];
  results.correlationMatrix = results.tests.correlations ?? [];

  results.visualization = {
    variableCards: profile.variableProfile,
    numericSummaryBars: valueColumns.map((col) => ({ variable: col, mean: mean(numericVector(rows, col)), sd: sd(numericVector(rows, col)) })),
    pValueSummary: [
      ...(results.tests.tTests ?? []),
      ...(results.tests.anova ?? []),
      ...(results.tests.twoWayAnova ?? []),
      ...(results.tests.welchAnova ?? []),
      ...(results.tests.mannWhitney ?? []),
      ...(results.tests.kruskalWallis ?? []),
      ...(results.univariable ?? []),
    ].filter((r: any) => r && "pValue" in r).map((r: any) => ({ test: r.test, variable: r.variable ?? r.valueColumn ?? r.predictor ?? r.groupColumn, pValue: r.pValue, significant: Number.isFinite(r.pValue) && r.pValue < request.alpha })),
    correlationHeatmap: results.tests.correlations ?? [],
  };
  return results;
}

function confirmationFromAny(row: RawRow): number {
  return safeNumber(row.Confirmatory_Diagnosis ?? row["Confirmatory Diagnosis"] ?? row.confirmatoryDiagnosis ?? row.confirmatory_diagnosis ?? row.I ?? row.Infected ?? row.Positive ?? row.positive);
}

function normalizeLogicRows(rows: RawRow[]): ObsRow[] {
  return rows.map((r, index) => {
    const N = safeNumber(r.Total_Animals ?? r.N ?? r.Total ?? r.total_animals);
    const E = safeNumber(r.E ?? r.Exposed ?? r.exposed);
    const I = confirmationFromAny(r);
    const R = safeNumber(r.R ?? r.Recovered ?? r.recovered);
    return {
      Farm_ID: safeText(r.Farm_ID ?? r.Farm ?? r.farm_id, `Farm_${index + 1}`),
      Location: safeText(r.Location ?? r.location),
      Latitude: safeNumber(r.Latitude ?? r.lat ?? r.latitude, NaN),
      Longitude: safeNumber(r.Longitude ?? r.lon ?? r.lng ?? r.longitude, NaN),
      Date: safeText(r.Date ?? r.date, today()),
      Observation: safeNumber(r.Observation ?? r.Obs ?? r.observation, index + 1),
      Total_Animals: N,
      S: safeNumber(r.S ?? r.Susceptible ?? r.susceptible, Math.max(0, N - (E + I + R))),
      E,
      I,
      R,
      Confirmatory_Diagnosis: I,
      Abortion_Count: safeNumber(r.Abortion_Count ?? r.Abortions ?? r.abortions),
      Pending_Culled: safeNumber(r.Pending_Culled ?? r.pending_culled),
      Culled: safeNumber(r.Culled ?? r.culled),
      Pending_Quarantined: safeNumber(r.Pending_Quarantined ?? r.pending_quarantined, Math.max(0, I - safeNumber(r.Pending_Culled ?? r.pending_culled))),
      Quarantined: safeNumber(r.Quarantined ?? r.quarantined),
      New_Animals_Moved_In: safeNumber(r.New_Animals_Moved_In ?? r.MovedIn ?? r.moved_in),
      New_Animals_Moved_Out: safeNumber(r.New_Animals_Moved_Out ?? r.MovedOut ?? r.moved_out),
      Susceptible_In_From_MovedIn: safeNumber(r.Susceptible_In_From_MovedIn ?? r.SusIn ?? r.susceptible_in),
      Susceptible_Out_From_MovedOut: safeNumber(r.Susceptible_Out_From_MovedOut ?? r.SusOut ?? r.susceptible_out),
    };
  });
}

function wilsonCI(k: number, n: number, z = 1.96) {
  if (n <= 0) return { lower: null, upper: null };
  const phat = k / n;
  const denom = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const root = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);
  return { lower: Math.max(0, (centre - root) / denom), upper: Math.min(1, (centre + root) / denom) };
}

function logGrowthRate(values: number[]) {
  const usable = values.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
  if (usable.length < 2) return null;
  const x = usable.map((p) => p.i);
  const y = usable.map((p) => Math.log(p.v));
  const mx = mean(x);
  const my = mean(y);
  if (mx === null || my === null) return null;
  const numerator = sum(x.map((xi, i) => (xi - mx) * (y[i] - my)));
  const denominator = sum(x.map((xi) => (xi - mx) ** 2));
  return denominator === 0 ? null : numerator / denominator;
}

function prevalenceCategory(p: number | null) {
  if (p === null) return "unknown";
  if (p === 0) return "zero";
  if (p < 0.05) return "low";
  if (p < 0.15) return "moderate";
  if (p < 0.3) return "high";
  return "very_high";
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number | null {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildHeatFeature(point: any) {
  return {
    type: "Feature",
    properties: {
      farmId: point.farmId,
      location: point.location,
      prevalence: point.prevalence ?? 0,
      prevalencePercent: point.prevalence === null ? null : Number((point.prevalence * 100).toFixed(3)),
      prevalenceCategory: point.prevalenceCategory,
      infected: point.infected ?? 0,
      exposed: point.exposed ?? 0,
      susceptible: point.susceptible ?? 0,
      recovered: point.recovered ?? 0,
      confirmatoryDiagnosis: point.confirmatoryDiagnosis ?? 0,
      totalAnimals: point.totalAnimals ?? 0,
      totalAbortions: point.totalAbortions ?? 0,
      attackRate: point.attackRate ?? 0,
      abortionRate: point.abortionRate ?? 0,
      estimatedR0: point.estimatedR0 ?? null,
      intensityScore: point.intensityScore ?? 0,
      heatWeight: point.heatWeight ?? 1,
      popupHTML: `<strong>${point.farmId}</strong><br/>${point.location || ""}<br/>N: ${point.totalAnimals ?? 0}<br/>I: ${point.infected ?? 0}<br/>Confirmatory Diagnosis: ${point.confirmatoryDiagnosis ?? 0}<br/>Abortions: ${point.totalAbortions ?? 0}<br/>Prevalence: ${point.prevalence == null ? "NA" : `${(point.prevalence * 100).toFixed(2)}%`}<br/>R0: ${point.estimatedR0 == null ? "NA" : Number(point.estimatedR0).toFixed(3)}`,
    },
    geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
  };
}

function analyzeTransmission(inputRows: RawRow[], infectiousPeriodDays: number) {
  const normalized = normalizeLogicRows(inputRows);
  const farms = new Map<string, ObsRow[]>();
  normalized.forEach((row) => {
    if (!farms.has(row.Farm_ID)) farms.set(row.Farm_ID, []);
    farms.get(row.Farm_ID)!.push(row);
  });
  const validation = { warnings: [] as string[], errors: [] as string[] };
  normalized.forEach((r) => {
    if (!r.Farm_ID) validation.errors.push(`Observation ${r.Observation}: Farm_ID missing.`);
    if (r.Total_Animals < 0) validation.errors.push(`${r.Farm_ID} observation ${r.Observation}: N is negative.`);
    if (r.S < 0) validation.warnings.push(`${r.Farm_ID} observation ${r.Observation}: S is negative.`);
    if (!Number.isFinite(r.Latitude) || !Number.isFinite(r.Longitude)) validation.warnings.push(`${r.Farm_ID} observation ${r.Observation}: latitude/longitude missing or invalid for map.`);
  });
  const farmSummaries = Array.from(farms.entries()).map(([farmId, rows]) => {
    const ordered = [...rows].sort((a, b) => a.Observation - b.Observation);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const totalConfirmatoryDiagnosis = sum(ordered.map((r) => r.Confirmatory_Diagnosis));
    const totalAbortions = sum(ordered.map((r) => r.Abortion_Count));
    const totalCulled = sum(ordered.map((r) => r.Culled));
    const totalQuarantined = sum(ordered.map((r) => r.Quarantined));
    const totalMovedIn = sum(ordered.map((r) => r.New_Animals_Moved_In));
    const totalMovedOut = sum(ordered.map((r) => r.New_Animals_Moved_Out));
    const apparentPrevalence = last.Total_Animals > 0 ? last.Confirmatory_Diagnosis / last.Total_Animals : null;
    const attackRate = first.S > 0 ? totalConfirmatoryDiagnosis / first.S : null;
    const abortionRate = last.Total_Animals > 0 ? totalAbortions / last.Total_Animals : null;
    const r = logGrowthRate(ordered.map((x) => x.I));
    const gamma = infectiousPeriodDays > 0 ? 1 / infectiousPeriodDays : null;
    const beta = r !== null && gamma !== null ? r + gamma : null;
    const estimatedR0 = beta !== null && gamma !== null && gamma > 0 ? beta / gamma : null;
    const transmissionIntensityScore = (apparentPrevalence ?? 0) * 40 + (attackRate ?? 0) * 35 + (estimatedR0 && estimatedR0 > 1 ? Math.min(estimatedR0, 5) * 5 : 0) + (abortionRate ?? 0) * 20;
    const heatWeight = Math.max(1, last.I) + Math.max(0, (apparentPrevalence ?? 0) * 100) + Math.max(0, totalAbortions * 0.5) + Math.max(0, transmissionIntensityScore * 0.25);
    const peak = ordered.reduce((best, row) => (row.I > best.I ? row : best), ordered[0]);
    const mapPoint = { farmId, location: last.Location, latitude: last.Latitude, longitude: last.Longitude, prevalence: apparentPrevalence, prevalenceCategory: prevalenceCategory(apparentPrevalence), infected: last.I, exposed: last.E, susceptible: last.S, recovered: last.R, confirmatoryDiagnosis: last.Confirmatory_Diagnosis, totalAnimals: last.Total_Animals, totalAbortions, attackRate, abortionRate, estimatedR0, intensityScore: transmissionIntensityScore, heatWeight };
    return {
      farmId,
      observations: ordered.length,
      firstDate: first.Date,
      lastDate: last.Date,
      initialPopulation: first.Total_Animals,
      finalPopulation: last.Total_Animals,
      populationChange: last.Total_Animals - first.Total_Animals,
      finalSEIR: { S: last.S, E: last.E, I: last.I, R: last.R },
      totalConfirmatoryDiagnosis,
      totalAbortions,
      totalCulled,
      totalQuarantined,
      totalMovedIn,
      totalMovedOut,
      netMovement: totalMovedIn - totalMovedOut,
      apparentPrevalence,
      apparentPrevalenceCI95: wilsonCI(last.Confirmatory_Diagnosis, last.Total_Animals),
      attackRate,
      abortionRate,
      growthRateR: r,
      infectiousPeriodDays,
      beta,
      gamma,
      estimatedR0,
      doublingTimeDays: r !== null && r > 0 ? Math.log(2) / r : null,
      peakInfection: { observation: peak.Observation, date: peak.Date, I: peak.I },
      transmissionIntensityScore,
      heatWeight,
      prevalenceCategory: prevalenceCategory(apparentPrevalence),
      mapPoint,
      trend: ordered.map((r) => ({ farmId, observation: r.Observation, date: r.Date, S: r.S, E: r.E, I: r.I, R: r.R, N: r.Total_Animals, confirmatoryDiagnosis: r.Confirmatory_Diagnosis, abortions: r.Abortion_Count, pendingCulled: r.Pending_Culled, culledApplied: r.Culled, pendingQuarantined: r.Pending_Quarantined, quarantinedApplied: r.Quarantined, movedIn: r.New_Animals_Moved_In, movedOut: r.New_Animals_Moved_Out })),
      rows: ordered,
    };
  });
  const totalN = sum(farmSummaries.map((x: any) => x.finalPopulation));
  const allTrends = farmSummaries.flatMap((f: any) => f.trend);
  const maxObs = Math.max(...allTrends.map((t: any) => t.observation), 0);
  const overallTrend = Array.from({ length: maxObs }, (_, i) => {
    const obs = i + 1;
    const rowsAtObs = allTrends.filter((t: any) => t.observation === obs);
    return { observation: obs, S: sum(rowsAtObs.map((r: any) => r.S)), E: sum(rowsAtObs.map((r: any) => r.E)), I: sum(rowsAtObs.map((r: any) => r.I)), R: sum(rowsAtObs.map((r: any) => r.R)), N: sum(rowsAtObs.map((r: any) => r.N)), confirmatoryDiagnosis: sum(rowsAtObs.map((r: any) => r.confirmatoryDiagnosis)), abortions: sum(rowsAtObs.map((r: any) => r.abortions)), pendingCulled: sum(rowsAtObs.map((r: any) => r.pendingCulled)), culledApplied: sum(rowsAtObs.map((r: any) => r.culledApplied)) };
  });
  const mapPoints = farmSummaries.map((x: any) => x.mapPoint).filter((p: any) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180);
  const farmDistanceMatrix = mapPoints.flatMap((a: any) => mapPoints.filter((b: any) => b.farmId !== a.farmId).map((b: any) => ({ from: a.farmId, to: b.farmId, distanceKm: haversineKm(a.latitude, a.longitude, b.latitude, b.longitude) })));
  const heatmapGeoJSON = { type: "FeatureCollection", features: mapPoints.map(buildHeatFeature) };
  const mapBounds = mapPoints.length ? { minLongitude: Math.min(...mapPoints.map((p: any) => p.longitude)), maxLongitude: Math.max(...mapPoints.map((p: any) => p.longitude)), minLatitude: Math.min(...mapPoints.map((p: any) => p.latitude)), maxLatitude: Math.max(...mapPoints.map((p: any) => p.latitude)) } : null;
  const mapCenter = mapPoints.length ? { longitude: mean(mapPoints.map((p: any) => p.longitude)), latitude: mean(mapPoints.map((p: any) => p.latitude)) } : { longitude: 90.4125, latitude: 23.8103 };
  const mapConfig = { defaultView: "normal", availableViews: [{ id: "normal", label: "Normal", mapboxStyle: "mapbox://styles/mapbox/dark-v11" }, { id: "satellite", label: "Satellite", mapboxStyle: "mapbox://styles/mapbox/satellite-streets-v12" }], center: mapCenter, bounds: mapBounds, heatmapLayer: { sourceId: "transmission-heatmap-source", layerId: "transmission-heatmap-layer", pointLayerId: "transmission-point-layer", weightProperty: "heatWeight", popupProperty: "popupHTML" } };
  return {
    totalFarms: farmSummaries.length,
    totalObservations: normalized.length,
    validation,
    overallSEIR: { N: totalN, S: sum(farmSummaries.map((x: any) => x.finalSEIR.S)), E: sum(farmSummaries.map((x: any) => x.finalSEIR.E)), I: sum(farmSummaries.map((x: any) => x.finalSEIR.I)), R: sum(farmSummaries.map((x: any) => x.finalSEIR.R)), overallPrevalence: totalN > 0 ? sum(farmSummaries.map((x: any) => x.finalSEIR.I)) / totalN : null },
    overallTotals: { totalConfirmatoryDiagnosis: sum(farmSummaries.map((x: any) => x.totalConfirmatoryDiagnosis)), totalAbortions: sum(farmSummaries.map((x: any) => x.totalAbortions)), totalCulled: sum(farmSummaries.map((x: any) => x.totalCulled)), totalQuarantined: sum(farmSummaries.map((x: any) => x.totalQuarantined)), totalMovedIn: sum(farmSummaries.map((x: any) => x.totalMovedIn)), totalMovedOut: sum(farmSummaries.map((x: any) => x.totalMovedOut)) },
    rankings: { byPrevalence: [...farmSummaries].sort((a: any, b: any) => (b.apparentPrevalence ?? 0) - (a.apparentPrevalence ?? 0)), byAttackRate: [...farmSummaries].sort((a: any, b: any) => (b.attackRate ?? 0) - (a.attackRate ?? 0)), byR0: [...farmSummaries].sort((a: any, b: any) => (b.estimatedR0 ?? 0) - (a.estimatedR0 ?? 0)), byIntensityScore: [...farmSummaries].sort((a: any, b: any) => (b.transmissionIntensityScore ?? 0) - (a.transmissionIntensityScore ?? 0)) },
    visualization: { overallTrend, farmTrends: farmSummaries.map((f: any) => ({ farmId: f.farmId, trend: f.trend })), seirStackedArea: overallTrend.map((t: any) => ({ observation: t.observation, susceptible: t.S, exposed: t.E, infected: t.I, recovered: t.R })), prevalenceBars: farmSummaries.map((f: any) => ({ farmId: f.farmId, prevalence: f.apparentPrevalence, category: f.prevalenceCategory })), r0Bars: farmSummaries.map((f: any) => ({ farmId: f.farmId, r0: f.estimatedR0 })), mapPoints, farmDistanceMatrix, heatmapGeoJSON, mapConfig },
    mapPoints,
    heatmapGeoJSON,
    mapConfig,
    farmDistanceMatrix,
    farmSummaries,
  };
}

function normalizeNetworkRows(rows: RawRow[]): NetworkEdge[] {
  return rows.map((r, i) => ({ edgeId: safeText(r.Edge_ID ?? r["Edge ID"] ?? r.edgeId, `E${i + 1}`), source: safeText(r.From_Node ?? r["From Node"] ?? r.source ?? r.Source), target: safeText(r.To_Node ?? r["To Node"] ?? r.target ?? r.Target), edgeType: safeText(r.Edge_Type ?? r["Edge Type"] ?? r.type, "movement"), distanceKm: safeNumber(r.Road_Distance_km ?? r["Road Distance (km)"] ?? r.distanceKm), movements: safeNumber(r.Avg_Movements ?? r["Avg Movements"] ?? r.movements, 1) })).filter((e) => e.source && e.target);
}

function connectedComponents(nodes: string[], edges: NetworkEdge[]) {
  const adj = new Map<string, Set<string>>();
  nodes.forEach((n) => adj.set(n, new Set()));
  edges.forEach((e) => { adj.get(e.source)?.add(e.target); adj.get(e.target)?.add(e.source); });
  const visited = new Set<string>();
  const components: string[][] = [];
  nodes.forEach((start) => {
    if (visited.has(start)) return;
    const stack = [start];
    const comp: string[] = [];
    visited.add(start);
    while (stack.length) {
      const node = stack.pop()!;
      comp.push(node);
      adj.get(node)?.forEach((nei) => { if (!visited.has(nei)) { visited.add(nei); stack.push(nei); } });
    }
    components.push(comp);
  });
  return components;
}

function analyzeNetwork(edges: NetworkEdge[]) {
  const nodes = Array.from(new Set(edges.flatMap((e) => [e.source, e.target]).filter(Boolean)));
  const directedAdj = new Map<string, string[]>();
  const undirectedAdj = new Map<string, Set<string>>();
  nodes.forEach((n) => { directedAdj.set(n, []); undirectedAdj.set(n, new Set()); });
  edges.forEach((e) => { directedAdj.get(e.source)?.push(e.target); undirectedAdj.get(e.source)?.add(e.target); undirectedAdj.get(e.target)?.add(e.source); });
  const maxMovement = Math.max(...edges.map((e) => e.movements), 1);
  const degree = nodes.map((node) => {
    const incident = edges.filter((e) => e.source === node || e.target === node);
    const outgoing = edges.filter((e) => e.source === node);
    const incoming = edges.filter((e) => e.target === node);
    const degreeValue = undirectedAdj.get(node)?.size ?? 0;
    const weightedMovements = sum(incident.map((e) => e.movements));
    const inStrength = sum(incoming.map((e) => e.movements));
    const outStrength = sum(outgoing.map((e) => e.movements));
    return { node, degree: degreeValue, inDegree: new Set(incoming.map((e) => e.source)).size, outDegree: new Set(outgoing.map((e) => e.target)).size, weightedMovements, inStrength, outStrength, meanDistanceKm: mean(incident.map((e) => e.distanceKm)), betweennessProxy: degreeValue * weightedMovements };
  });
  const components = connectedComponents(nodes, edges);
  const sortedDegree = [...degree].sort((a, b) => b.degree - a.degree || b.weightedMovements - a.weightedMovements);
  const density = nodes.length > 1 ? edges.length / (nodes.length * (nodes.length - 1)) : 0;
  const undirectedDensity = nodes.length > 1 ? (2 * edges.length) / (nodes.length * (nodes.length - 1)) : 0;
  const edgeTypeSummary = Array.from(new Set(edges.map((e) => e.edgeType))).map((type) => ({ edgeType: type, count: edges.filter((e) => e.edgeType === type).length, totalMovements: sum(edges.filter((e) => e.edgeType === type).map((e) => e.movements)), meanDistanceKm: mean(edges.filter((e) => e.edgeType === type).map((e) => e.distanceKm)) }));
  const adjacencyMatrix = nodes.map((source) => ({ source, values: nodes.map((target) => sum(edges.filter((e) => e.source === source && e.target === target).map((e) => e.movements))) }));
  const graphNodes = nodes.map((node, idx) => {
    const angle = (2 * Math.PI * idx) / Math.max(nodes.length, 1);
    const d = degree.find((x) => x.node === node)!;
    const riskScore = d.degree * 2 + d.weightedMovements * 0.5 + d.outStrength * 0.75;
    return { id: node, label: node, degree: d.degree, inDegree: d.inDegree, outDegree: d.outDegree, weightedMovements: d.weightedMovements, inStrength: d.inStrength, outStrength: d.outStrength, riskScore, radius: 8 + Math.sqrt(Math.max(0, d.weightedMovements)) * 2, x: Math.cos(angle), y: Math.sin(angle), tooltip: `${node} | degree=${d.degree} | weighted movements=${d.weightedMovements}` };
  });
  const graphEdges = edges.map((e) => ({ ...e, id: e.edgeId, width: 1 + (e.movements / maxMovement) * 8, opacity: 0.25 + (e.movements / maxMovement) * 0.75, label: `${e.source} → ${e.target}`, tooltip: `${e.source} → ${e.target}\nType: ${e.edgeType}\nMovements: ${e.movements}\nDistance: ${e.distanceKm} km`, riskWeight: e.movements / Math.max(1, e.distanceKm || 1) }));
  return {
    nodes: graphNodes,
    edges,
    graph: { nodes: graphNodes, edges: graphEdges, adjacencyMatrix },
    statistics: { nodeCount: nodes.length, edgeCount: edges.length, density, undirectedDensity, totalMovements: sum(edges.map((e) => e.movements)), meanDistanceKm: mean(edges.map((e) => e.distanceKm)), medianDistanceKm: median(edges.map((e) => e.distanceKm)), componentCount: components.length, largestComponentSize: Math.max(...components.map((c) => c.length), 0), highestDegreeNode: sortedDegree[0] ?? null, topNodesByDegree: sortedDegree.slice(0, 10), complexityIndex: density * 100 + sum(edges.map((e) => e.movements)) / Math.max(1, nodes.length) + components.length * 2 },
    centrality: { degree, topSpreaders: [...degree].sort((a, b) => b.outStrength - a.outStrength).slice(0, 10), topReceivers: [...degree].sort((a, b) => b.inStrength - a.inStrength).slice(0, 10), bridgeCandidates: [...degree].sort((a, b) => b.betweennessProxy - a.betweennessProxy).slice(0, 10) },
    components,
    edgeTypeSummary,
    filters: { minMovement: Math.min(...edges.map((e) => e.movements), 0), maxMovement, edgeTypes: Array.from(new Set(edges.map((e) => e.edgeType))) },
    visualization: { degreeBars: sortedDegree, movementHistogram: edges.map((e) => ({ edgeId: e.edgeId, movements: e.movements, distanceKm: e.distanceKm })), edgeTypeSummary, adjacencyMatrix, graphNodes, graphEdges },
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const module = safeText(formData.get("module")).toLowerCase();

    if (module === "transmission") {
      const mode = safeText(formData.get("mode"), "logic");
      const infectiousPeriodDays = safeNumber(formData.get("infectiousPeriodDays"), 14);
      let rows: RawRow[] = [];
      if (mode === "import") rows = await rowsFromFormFile(formData, "file");
      else rows = JSON.parse(safeText(formData.get("rows"), "[]"));
      if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: "No transmission rows supplied." }, { status: 400 });
      return NextResponse.json({ module: "transmission", analysis: analyzeTransmission(rows, infectiousPeriodDays) });
    }

    if (module === "risk") {
      const rows = await rowsFromFormFile(formData, "file");
      const outcome = safeText(formData.get("outcome"));
      const predictors = parseList(formData.get("predictors"));
      const threshold = safeNumber(formData.get("threshold"), 0.2);
      if (!rows.length) return NextResponse.json({ error: "Upload a CSV file for risk analysis." }, { status: 400 });
      if (!outcome || !predictors.length) return NextResponse.json({ error: "Outcome and predictors are required." }, { status: 400 });
      return NextResponse.json({ module: "risk", risk: analyzeRisk(rows, outcome, predictors, threshold) });
    }

    if (module === "statistics") {
      const rows = await rowsFromFormFile(formData, "file");
      if (!rows.length) return NextResponse.json({ error: "Upload a CSV file for statistics." }, { status: 400 });
      const requestConfig = getStatRequest(formData, rows);
      return NextResponse.json({ module: "statistics", statistics: analyzeStatistics(rows, requestConfig) });
    }

    if (module === "network") {
      let edges: NetworkEdge[] = [];
      const edgeText = safeText(formData.get("edges"));
      if (edgeText) edges = normalizeNetworkRows(JSON.parse(edgeText));
      else edges = normalizeNetworkRows(await rowsFromFormFile(formData, "file"));
      if (!edges.length) return NextResponse.json({ error: "Add or upload network edges first." }, { status: 400 });
      return NextResponse.json({ module: "network", network: analyzeNetwork(edges) });
    }

    if (module === "evolutionary") {
      return NextResponse.json({ error: "EGStat-N evolutionary analysis has been removed from this API route. Use QI-GeneX-N for genomics/evolutionary workflows." }, { status: 410 });
    }

    return NextResponse.json({ error: `Unknown analysis module: ${module || "empty"}.`, supportedModules: ["transmission", "risk", "statistics", "network"] }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: "Analysis failed.", detail: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

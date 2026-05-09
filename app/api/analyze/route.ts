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

type StatisticalRequest = {
  tests: string[];
  valueColumns: string[];
  groupColumn: string;
  groupColumnA: string;
  groupColumnB: string;
  tTestValueColumn: string;
  tTestGroupColumn: string;
  tTestGroupA: string;
  tTestGroupB: string;
  pairedColumnA: string;
  pairedColumnB: string;
  oneSampleMean: number;
  anovaValueColumn: string;
  anovaFactorColumns: string[];
  anovaPrimaryFactor: string;
  anovaSecondaryFactor: string;
  repeatedMeasureColumns: string[];
  subjectColumn: string;
  outcomeColumn: string;
  predictorColumns: string[];
  alpha: number;
  clarifications: RawRow;
};

function safeText(value: any, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function safeNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function isMissing(value: any): boolean {
  return (
    value === null ||
    value === undefined ||
    value === "" ||
    String(value).trim().toLowerCase() === "na" ||
    String(value).trim().toLowerCase() === "nan" ||
    String(value).trim().toLowerCase() === "null"
  );
}

function finite(values: number[]): number[] {
  return values.filter((v) => Number.isFinite(v));
}

function sum(values: number[]): number {
  return finite(values).reduce((a, b) => a + b, 0);
}

function mean(values: number[]): number | null {
  const v = finite(values);
  return v.length ? sum(v) / v.length : null;
}

function median(values: number[]): number | null {
  const v = finite(values).sort((a, b) => a - b);
  if (!v.length) return null;
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
  if (!v.length) return null;
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
  const q1 = quantile(v, 0.25);
  const q3 = quantile(v, 0.75);

  return {
    n: v.length,
    missingExcluded: values.length - v.length,
    mean: m,
    median: median(v),
    sd: s,
    variance: variance(v),
    se,
    ci95: m !== null && se !== null ? { lower: m - 1.96 * se, upper: m + 1.96 * se } : { lower: null, upper: null },
    min: v.length ? Math.min(...v) : null,
    q1,
    q3,
    iqr: q1 !== null && q3 !== null ? q3 - q1 : null,
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

function normalTwoSidedP(z: number): number | null {
  if (!Number.isFinite(z)) return null;
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

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }

  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < coefficients.length; i++) {
    x += coefficients[i] / (z + i + 1);
  }

  const t = z + coefficients.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a: number, b: number, x: number): number {
  const maxIterations = 220;
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

    for (let n = 1; n <= 220; n++) {
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

  for (let i = 1; i <= 220; i++) {
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

function chiSquarePValue(statistic: number, df: number): number | null {
  if (!Number.isFinite(statistic) || !Number.isFinite(df) || df <= 0) return null;
  const p = 1 - gammaLowerRegularized(df / 2, statistic / 2);
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

function parseRowsJson(value: FormDataEntryValue | null): RawRow[] {
  if (!value || typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function rowsFromFormData(formData: FormData, field = "file"): Promise<RawRow[]> {
  const directRows = parseRowsJson(formData.get("rows"));
  if (directRows.length) return directRows;

  const editedRows = parseRowsJson(formData.get("editedRows"));
  if (editedRows.length) return editedRows;

  const tableRows = parseRowsJson(formData.get("tableRows"));
  if (tableRows.length) return tableRows;

  const file = formData.get(field);
  if (!file || typeof file === "string") return [];

  const maybeFile = file as File;
  const fileName = safeText((maybeFile as any).name).toLowerCase();

  if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
    const dynamicImport = new Function("moduleName", "return import(moduleName)") as (moduleName: string) => Promise<any>;
    const XLSX = await dynamicImport("xlsx");
    const buffer = await maybeFile.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(sheet) as RawRow[];
  }

  const text = await maybeFile.text();
  return parseCSV(text);
}

function getColumns(rows: RawRow[]): string[] {
  return rows.length ? Object.keys(rows[0]) : [];
}

function uniqueValues(rows: RawRow[], column: string): string[] {
  return Array.from(new Set(rows.map((r) => r[column]).filter((v) => !isMissing(v)).map(String)));
}

function isNumericColumn(rows: RawRow[], column: string): boolean {
  const vals = rows.map((r) => r[column]).filter((v) => !isMissing(v));
  return vals.length > 0 && vals.every((v) => Number.isFinite(Number(v)));
}

function numericVector(rows: RawRow[], column: string): number[] {
  return rows.map((r) => Number(r[column])).filter((v) => Number.isFinite(v));
}

function parseList(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== "string") return [];
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseClarifications(formData: FormData): RawRow {
  const keys = [
    "clarifications",
    "dataClarification",
    "analysisClarification",
    "fieldClarifications",
    "variableClarifications",
    "testClarifications",
    "groupClarification",
    "outcomeClarification",
    "predictorClarification",
    "anovaClarification",
    "tTestClarification",
  ];

  const out: RawRow = {};

  for (const key of keys) {
    const val = formData.get(key);
    if (typeof val !== "string" || !val.trim()) continue;

    try {
      out[key] = JSON.parse(val);
    } catch {
      out[key] = val;
    }
  }

  return out;
}


function parseReferenceCategories(formData: FormData): RawRow {
  const candidates = [
    formData.get("referenceCategories"),
    formData.get("referenceCategoryMap"),
    formData.get("categoryReferences"),
    formData.get("references"),
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim()) continue;

    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as RawRow;
    } catch {
      const out: RawRow = {};
      candidate
        .split(";")
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .forEach((chunk) => {
          const [variable, reference] = chunk.split(":").map((x) => safeText(x));
          if (variable && reference) out[variable] = reference;
        });
      if (Object.keys(out).length) return out;
    }
  }

  return {};
}

function referenceForVariable(rows: RawRow[], variable: string, referenceCategories: RawRow = {}): string | null {
  const levels = uniqueValues(rows, variable);
  const requested = safeText(referenceCategories?.[variable]);
  if (requested && levels.includes(requested)) return requested;
  return levels[0] ?? null;
}

function orderedLevelsWithReference(rows: RawRow[], variable: string, referenceCategories: RawRow = {}): string[] {
  const levels = uniqueValues(rows, variable);
  const reference = referenceForVariable(rows, variable, referenceCategories);
  if (!reference) return levels;
  return [reference, ...levels.filter((level) => level !== reference)];
}

function formatComparison(level: string, reference: string | null): string {
  return reference ? `${level} vs ${reference}` : level;
}

function interpretationFromOR(orValue: number | null, pValue: number | null, alpha = 0.05): string {
  if (!Number.isFinite(Number(orValue)) || !Number.isFinite(Number(pValue))) return "Not estimable";
  if (Number(pValue) >= alpha) return "Not statistically significant";
  if (Number(orValue) > 1) return "Higher odds compared with reference";
  if (Number(orValue) < 1) return "Lower odds compared with reference";
  return "No odds difference from reference";
}

function buildUnivariableRiskTable(univariable: RawRow[], alpha = 0.05): RawRow[] {
  return univariable.flatMap((item: any) => {
    if (Array.isArray(item.categoryRows)) {
      return item.categoryRows.map((row: any) => ({
        ...row,
        model: "Univariable",
        interpretation: row.isReference ? "Reference category" : interpretationFromOR(row.oddsRatio ?? null, row.pValue ?? null, alpha),
      }));
    }

    return [
      {
        model: "Univariable",
        variable: item.variable,
        category: item.variableType === "continuous" ? "Per 1-unit increase" : item.levelCompared ?? "Comparison",
        reference: item.reference ?? null,
        comparison: item.comparisonLabel ?? item.test,
        isReference: false,
        outcome: item.outcome,
        positiveLevel: item.positiveLevel ?? null,
        nCategoryPositive: item.table?.categoryPositive ?? item.table?.exposedPositive ?? null,
        nCategoryNegative: item.table?.categoryNegative ?? item.table?.exposedNegative ?? null,
        nReferencePositive: item.table?.referencePositive ?? item.table?.unexposedPositive ?? null,
        nReferenceNegative: item.table?.referenceNegative ?? item.table?.unexposedNegative ?? null,
        oddsRatio: item.oddsRatio ?? null,
        ciLower: item.ciLower ?? null,
        ciUpper: item.ciUpper ?? null,
        pValue: item.pValue ?? null,
        fisherExactTwoSidedP: item.fisherExactTwoSidedP ?? null,
        interpretation: item.interpretation ?? "Screening result",
      },
    ];
  });
}

function buildMultivariableRiskTable(model: any, rows: RawRow[], predictors: string[], referenceCategories: RawRow = {}, alpha = 0.05): RawRow[] {
  if (!model || !Array.isArray(model.coefficients)) return [];

  const coefficientBySourceLevel = new Map<string, any>();
  const coefficientByTerm = new Map<string, any>();

  model.coefficients.forEach((coef: any) => {
    coefficientByTerm.set(coef.term, coef);
    if (coef.metadata?.source && coef.metadata?.level) coefficientBySourceLevel.set(`${coef.metadata.source}|||${coef.metadata.level}`, coef);
  });

  const out: RawRow[] = [];

  predictors.forEach((predictor) => {
    if (isNumericColumn(rows, predictor)) {
      const coef = coefficientByTerm.get(predictor);
      out.push({
        model: "Multivariable",
        variable: predictor,
        category: "Per 1-unit increase",
        reference: null,
        comparison: "Continuous predictor",
        isReference: false,
        adjustedOddsRatio: coef?.oddsRatio ?? null,
        adjustedCiLower: coef?.ci95OddsRatio?.lower ?? null,
        adjustedCiUpper: coef?.ci95OddsRatio?.upper ?? null,
        coefficientLogOdds: coef?.estimateLogOdds ?? null,
        standardError: coef?.standardError ?? null,
        zStatistic: coef?.zStatistic ?? null,
        pValue: coef?.pValue ?? null,
        interpretation: interpretationFromOR(coef?.oddsRatio ?? null, coef?.pValue ?? null, alpha),
      });
      return;
    }

    const levels = orderedLevelsWithReference(rows, predictor, referenceCategories);
    const reference = levels[0] ?? null;

    if (reference) {
      out.push({
        model: "Multivariable",
        variable: predictor,
        category: reference,
        reference,
        comparison: "Reference",
        isReference: true,
        adjustedOddsRatio: 1,
        adjustedCiLower: 1,
        adjustedCiUpper: 1,
        coefficientLogOdds: 0,
        standardError: null,
        zStatistic: null,
        pValue: null,
        pValueLabel: "Reference",
        interpretation: "Reference category",
      });
    }

    levels.slice(1).forEach((level) => {
      const coef = coefficientBySourceLevel.get(`${predictor}|||${level}`) ?? coefficientByTerm.get(`${predictor}=${level}`);
      out.push({
        model: "Multivariable",
        variable: predictor,
        category: level,
        reference,
        comparison: formatComparison(level, reference),
        isReference: false,
        adjustedOddsRatio: coef?.oddsRatio ?? null,
        adjustedCiLower: coef?.ci95OddsRatio?.lower ?? null,
        adjustedCiUpper: coef?.ci95OddsRatio?.upper ?? null,
        coefficientLogOdds: coef?.estimateLogOdds ?? null,
        standardError: coef?.standardError ?? null,
        zStatistic: coef?.zStatistic ?? null,
        pValue: coef?.pValue ?? null,
        interpretation: interpretationFromOR(coef?.oddsRatio ?? null, coef?.pValue ?? null, alpha),
      });
    });
  });

  return out;
}

function buildLinearMultivariableTable(model: any, rows: RawRow[], predictors: string[], referenceCategories: RawRow = {}, alpha = 0.05): RawRow[] {
  if (!model || !Array.isArray(model.coefficients)) return [];

  const coefficientBySourceLevel = new Map<string, any>();
  const coefficientByTerm = new Map<string, any>();

  model.coefficients.forEach((coef: any) => {
    coefficientByTerm.set(coef.term, coef);
    if (coef.metadata?.source && coef.metadata?.level) coefficientBySourceLevel.set(`${coef.metadata.source}|||${coef.metadata.level}`, coef);
  });

  const out: RawRow[] = [];

  predictors.forEach((predictor) => {
    if (isNumericColumn(rows, predictor)) {
      const coef = coefficientByTerm.get(predictor);
      out.push({
        model: "Multivariable linear",
        variable: predictor,
        category: "Per 1-unit increase",
        reference: null,
        comparison: "Continuous predictor",
        isReference: false,
        beta: coef?.estimate ?? null,
        ciLower: coef?.ci95?.lower ?? null,
        ciUpper: coef?.ci95?.upper ?? null,
        standardError: coef?.standardError ?? null,
        tStatistic: coef?.tStatistic ?? null,
        pValue: coef?.pValue ?? null,
        interpretation: Number.isFinite(coef?.pValue) && coef.pValue < alpha ? "Statistically significant coefficient" : "Not statistically significant",
      });
      return;
    }

    const levels = orderedLevelsWithReference(rows, predictor, referenceCategories);
    const reference = levels[0] ?? null;

    if (reference) {
      out.push({
        model: "Multivariable linear",
        variable: predictor,
        category: reference,
        reference,
        comparison: "Reference",
        isReference: true,
        beta: 0,
        ciLower: 0,
        ciUpper: 0,
        standardError: null,
        tStatistic: null,
        pValue: null,
        pValueLabel: "Reference",
        interpretation: "Reference category",
      });
    }

    levels.slice(1).forEach((level) => {
      const coef = coefficientBySourceLevel.get(`${predictor}|||${level}`) ?? coefficientByTerm.get(`${predictor}=${level}`);
      out.push({
        model: "Multivariable linear",
        variable: predictor,
        category: level,
        reference,
        comparison: formatComparison(level, reference),
        isReference: false,
        beta: coef?.estimate ?? null,
        ciLower: coef?.ci95?.lower ?? null,
        ciUpper: coef?.ci95?.upper ?? null,
        standardError: coef?.standardError ?? null,
        tStatistic: coef?.tStatistic ?? null,
        pValue: coef?.pValue ?? null,
        interpretation: Number.isFinite(coef?.pValue) && coef.pValue < alpha ? "Statistically significant coefficient" : "Not statistically significant",
      });
    });
  });

  return out;
}

function describeDataset(rows: RawRow[]) {
  const columns = getColumns(rows);
  return {
    rows: rows.length,
    columns: columns.length,
    columnNames: columns,
    numericColumns: columns.filter((c) => isNumericColumn(rows, c)),
    categoricalColumns: columns.filter((c) => !isNumericColumn(rows, c)),
    variableProfile: columns.map((c) => {
      const numeric = isNumericColumn(rows, c);
      const validValues = rows.map((r) => r[c]).filter((v) => !isMissing(v));

      return {
        variable: c,
        type: numeric ? "numeric" : "categorical/text",
        uniqueValues: uniqueValues(rows, c).length,
        missing: rows.filter((r) => isMissing(r[c])).length,
        completeness: rows.length ? validValues.length / rows.length : null,
        numericSummary: numeric ? describeNumeric(validValues.map(Number)) : null,
        categories: numeric
          ? null
          : uniqueValues(rows, c)
              .slice(0, 40)
              .map((level) => ({
                level,
                count: rows.filter((r) => String(r[c]) === level).length,
              })),
      };
    }),
  };
}

function rank(values: number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
  const ranks = Array(values.length).fill(0);
  let i = 0;

  while (i < indexed.length) {
    let j = i;
    while (j + 1 < indexed.length && indexed[j + 1].value === indexed[i].value) j += 1;
    const averageRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[indexed[k].index] = averageRank;
    i = j + 1;
  }

  return ranks;
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

function spearmanCorrelation(x: number[], y: number[]): number | null {
  const pairs = x.map((v, i) => [v, y[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 3) return null;
  return pearsonCorrelation(rank(pairs.map((p) => p[0])), rank(pairs.map((p) => p[1])));
}

function correlationTest(rows: RawRow[], xColumn: string, yColumn: string, method: "pearson" | "spearman") {
  const pairs = rows
    .map((r) => ({ x: Number(r[xColumn]), y: Number(r[yColumn]) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  const x = pairs.map((p) => p.x);
  const y = pairs.map((p) => p.y);
  const r = method === "pearson" ? pearsonCorrelation(x, y) : spearmanCorrelation(x, y);

  if (r === null || pairs.length < 3) {
    return {
      test: `${method} correlation`,
      x: xColumn,
      y: yColumn,
      n: pairs.length,
      correlation: null,
      pValue: null,
      message: "Insufficient paired numeric observations.",
    };
  }

  const t = r * Math.sqrt((pairs.length - 2) / Math.max(1e-12, 1 - r * r));

  return {
    test: `${method} correlation`,
    x: xColumn,
    y: yColumn,
    n: pairs.length,
    correlation: r,
    tStatistic: t,
    df: pairs.length - 2,
    pValue: studentTTwoSidedP(t, pairs.length - 2),
  };
}

function independentTTestFromArrays(groupAValues: number[], groupBValues: number[], equalVariance = false) {
  const x = finite(groupAValues);
  const y = finite(groupBValues);
  const mx = mean(x);
  const my = mean(y);
  const vx = variance(x);
  const vy = variance(y);

  if (x.length < 2 || y.length < 2 || mx === null || my === null || vx === null || vy === null) {
    return {
      n1: x.length,
      n2: y.length,
      mean1: mx,
      mean2: my,
      pValue: null,
      message: "At least two numeric observations are required in both selected groups.",
    };
  }

  let tStatistic: number;
  let df: number;
  let standardError: number;

  if (equalVariance) {
    const pooledVariance = ((x.length - 1) * vx + (y.length - 1) * vy) / (x.length + y.length - 2);
    standardError = Math.sqrt(pooledVariance * (1 / x.length + 1 / y.length));
    df = x.length + y.length - 2;
    tStatistic = (mx - my) / standardError;
  } else {
    standardError = Math.sqrt(vx / x.length + vy / y.length);
    const numerator = (vx / x.length + vy / y.length) ** 2;
    const denominator = (vx * vx) / (x.length * x.length * (x.length - 1)) + (vy * vy) / (y.length * y.length * (y.length - 1));
    df = numerator / denominator;
    tStatistic = (mx - my) / standardError;
  }

  return {
    n1: x.length,
    n2: y.length,
    mean1: mx,
    mean2: my,
    sd1: sd(x),
    sd2: sd(y),
    meanDifference: mx - my,
    standardError,
    tStatistic,
    df,
    pValue: studentTTwoSidedP(tStatistic, df),
    ci95Difference: {
      lower: mx - my - 1.96 * standardError,
      upper: mx - my + 1.96 * standardError,
    },
  };
}

function independentTTestBySelectedGroups(
  rows: RawRow[],
  valueColumn: string,
  groupColumn: string,
  groupA?: string,
  groupB?: string
) {
  const levels = uniqueValues(rows, groupColumn);
  const selectedA = groupA || levels[0];
  const selectedB = groupB || levels.find((x) => x !== selectedA) || levels[1];

  if (!selectedA || !selectedB || selectedA === selectedB) {
    return {
      test: "Welch independent t-test",
      valueColumn,
      groupColumn,
      group1: selectedA,
      group2: selectedB,
      pValue: null,
      message: "Choose two different group levels for t-test.",
      availableGroups: levels,
    };
  }

  const groupAValues = rows.filter((r) => String(r[groupColumn]) === selectedA).map((r) => Number(r[valueColumn]));
  const groupBValues = rows.filter((r) => String(r[groupColumn]) === selectedB).map((r) => Number(r[valueColumn]));

  return {
    test: "Welch independent t-test",
    valueColumn,
    groupColumn,
    group1: selectedA,
    group2: selectedB,
    availableGroups: levels,
    ...independentTTestFromArrays(groupAValues, groupBValues, false),
  };
}

function pairedNumericVectors(rows: RawRow[], columnA: string, columnB: string): { x: number[]; y: number[] } {
  const pairs = rows
    .map((r) => ({ x: Number(r[columnA]), y: Number(r[columnB]) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  return {
    x: pairs.map((p) => p.x),
    y: pairs.map((p) => p.y),
  };
}

function pairedTTest(rows: RawRow[], columnA: string, columnB: string) {
  const { x, y } = pairedNumericVectors(rows, columnA, columnB);
  const differences = x.map((v, i) => v - y[i]);
  const md = mean(differences);
  const s = sd(differences);

  if (differences.length < 2 || md === null || s === null) {
    return {
      test: "Paired t-test",
      columnA,
      columnB,
      n: differences.length,
      pValue: null,
      message: "At least two complete numeric pairs are required.",
    };
  }

  const standardError = s / Math.sqrt(differences.length);
  const tStatistic = md / standardError;

  return {
    test: "Paired t-test",
    columnA,
    columnB,
    n: differences.length,
    meanDifference: md,
    sdDifference: s,
    standardError,
    tStatistic,
    df: differences.length - 1,
    pValue: studentTTwoSidedP(tStatistic, differences.length - 1),
  };
}

function oneSampleTTest(rows: RawRow[], valueColumn: string, hypothesizedMean = 0) {
  const x = numericVector(rows, valueColumn);
  const m = mean(x);
  const s = sd(x);

  if (x.length < 2 || m === null || s === null) {
    return {
      test: "One-sample t-test",
      valueColumn,
      hypothesizedMean,
      n: x.length,
      pValue: null,
      message: "At least two numeric observations are required.",
    };
  }

  const standardError = s / Math.sqrt(x.length);
  const tStatistic = (m - hypothesizedMean) / standardError;

  return {
    test: "One-sample t-test",
    valueColumn,
    hypothesizedMean,
    n: x.length,
    mean: m,
    sd: s,
    standardError,
    tStatistic,
    df: x.length - 1,
    pValue: studentTTwoSidedP(tStatistic, x.length - 1),
  };
}

function oneWayANOVA(rows: RawRow[], valueColumn: string, groupColumn: string) {
  const levels = uniqueValues(rows, groupColumn);
  const groups = levels
    .map((level) => ({
      level,
      values: rows.filter((r) => String(r[groupColumn]) === level).map((r) => Number(r[valueColumn])).filter(Number.isFinite),
    }))
    .filter((g) => g.values.length > 0);

  const allValues = groups.flatMap((g) => g.values);
  const grandMean = mean(allValues);

  if (groups.length < 2 || allValues.length <= groups.length || grandMean === null) {
    return {
      test: "One-way ANOVA",
      valueColumn,
      groupColumn,
      pValue: null,
      message: "ANOVA requires at least two groups and enough residual degrees of freedom.",
      availableGroups: levels,
    };
  }

  const ssBetween = sum(groups.map((g) => g.values.length * (Number(mean(g.values)) - grandMean) ** 2));
  const ssWithin = sum(groups.flatMap((g) => g.values.map((v) => (v - Number(mean(g.values))) ** 2)));
  const dfBetween = groups.length - 1;
  const dfWithin = allValues.length - groups.length;
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;
  const fStatistic = msBetween / msWithin;

  return {
    test: "One-way ANOVA",
    valueColumn,
    groupColumn,
    groups: groups.map((g) => ({ level: g.level, ...describeNumeric(g.values) })),
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
  const groups = uniqueValues(rows, groupColumn)
    .map((level) => ({
      level,
      values: rows.filter((r) => String(r[groupColumn]) === level).map((r) => Number(r[valueColumn])).filter(Number.isFinite),
    }))
    .filter((g) => g.values.length >= 2 && Number(variance(g.values)) > 0);

  if (groups.length < 2) {
    return {
      test: "Welch ANOVA",
      valueColumn,
      groupColumn,
      pValue: null,
      message: "Welch ANOVA needs at least two groups with non-zero variance.",
    };
  }

  const k = groups.length;
  const stats = groups.map((g) => ({ level: g.level, n: g.values.length, mean: Number(mean(g.values)), variance: Number(variance(g.values)) }));
  const weights = stats.map((g) => g.n / g.variance);
  const weightSum = sum(weights);
  const weightedMean = sum(stats.map((g, i) => weights[i] * g.mean)) / weightSum;
  const numerator = sum(stats.map((g, i) => weights[i] * (g.mean - weightedMean) ** 2)) / (k - 1);
  const lambda = (3 * sum(stats.map((g, i) => ((1 - weights[i] / weightSum) ** 2) / (g.n - 1)))) / (k * k - 1);
  const fStatistic = numerator / (1 + (2 * (k - 2) * lambda) / 3);
  const df1 = k - 1;
  const df2 = 1 / lambda;

  return {
    test: "Welch ANOVA",
    valueColumn,
    groupColumn,
    groups: stats,
    fStatistic,
    df1,
    df2,
    pValue: fPValue(fStatistic, df1, df2),
  };
}

function leveneTest(rows: RawRow[], valueColumn: string, groupColumn: string) {
  const groupMedians = new Map<string, number>();

  uniqueValues(rows, groupColumn).forEach((level) => {
    const vals = rows.filter((r) => String(r[groupColumn]) === level).map((r) => Number(r[valueColumn])).filter(Number.isFinite);
    const med = median(vals);
    if (med !== null) groupMedians.set(level, med);
  });

  const transformed = rows
    .filter((r) => groupMedians.has(String(r[groupColumn])) && Number.isFinite(Number(r[valueColumn])))
    .map((r) => ({
      ...r,
      __levene_absolute_deviation: Math.abs(Number(r[valueColumn]) - Number(groupMedians.get(String(r[groupColumn])))),
    }));

  return {
    ...oneWayANOVA(transformed, "__levene_absolute_deviation", groupColumn),
    test: "Levene test for equality of variances",
    originalValueColumn: valueColumn,
  };
}

function mannWhitneyU(rows: RawRow[], valueColumn: string, groupColumn: string, groupA?: string, groupB?: string) {
  const levels = uniqueValues(rows, groupColumn);
  const selectedA = groupA || levels[0];
  const selectedB = groupB || levels.find((x) => x !== selectedA) || levels[1];

  if (!selectedA || !selectedB || selectedA === selectedB) {
    return {
      test: "Mann-Whitney U test",
      valueColumn,
      groupColumn,
      pValue: null,
      message: "Choose two different groups.",
      availableGroups: levels,
    };
  }

  const values = rows
    .filter((r) => [selectedA, selectedB].includes(String(r[groupColumn])) && Number.isFinite(Number(r[valueColumn])))
    .map((r) => ({ value: Number(r[valueColumn]), group: String(r[groupColumn]) }));

  const n1 = values.filter((v) => v.group === selectedA).length;
  const n2 = values.filter((v) => v.group === selectedB).length;

  if (n1 < 1 || n2 < 1) {
    return {
      test: "Mann-Whitney U test",
      valueColumn,
      groupColumn,
      group1: selectedA,
      group2: selectedB,
      pValue: null,
      message: "Both selected groups require at least one numeric observation.",
    };
  }

  const ranks = rank(values.map((v) => v.value));
  const rankSum1 = sum(values.map((v, i) => (v.group === selectedA ? ranks[i] : 0)));
  const u1 = rankSum1 - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);
  const mu = (n1 * n2) / 2;
  const sigma = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = (u - mu) / sigma;

  return {
    test: "Mann-Whitney U test",
    valueColumn,
    groupColumn,
    group1: selectedA,
    group2: selectedB,
    n1,
    n2,
    uStatistic: u,
    zStatistic: z,
    pValue: normalTwoSidedP(z),
  };
}

function kruskalWallis(rows: RawRow[], valueColumn: string, groupColumn: string) {
  const levels = uniqueValues(rows, groupColumn);
  const values = rows
    .filter((r) => !isMissing(r[groupColumn]) && Number.isFinite(Number(r[valueColumn])))
    .map((r) => ({ value: Number(r[valueColumn]), group: String(r[groupColumn]) }));

  const N = values.length;
  if (levels.length < 2 || N <= levels.length) {
    return {
      test: "Kruskal-Wallis test",
      valueColumn,
      groupColumn,
      pValue: null,
      message: "At least two groups and sufficient numeric observations are required.",
    };
  }

  const ranks = rank(values.map((v) => v.value));
  const groupStats = levels
    .map((level) => {
      const indexes = values.map((v, i) => (v.group === level ? i : -1)).filter((i) => i >= 0);
      return { level, n: indexes.length, rankSum: sum(indexes.map((i) => ranks[i])) };
    })
    .filter((g) => g.n > 0);

  const H = (12 / (N * (N + 1))) * sum(groupStats.map((g) => (g.rankSum ** 2) / g.n)) - 3 * (N + 1);
  const df = groupStats.length - 1;

  return {
    test: "Kruskal-Wallis test",
    valueColumn,
    groupColumn,
    groups: groupStats,
    hStatistic: H,
    df,
    pValue: chiSquarePValue(H, df),
  };
}

function factorialLog(n: number): number {
  return logGamma(n + 1);
}

function hypergeometricProbability(a: number, b: number, c: number, d: number): number {
  const n = a + b + c + d;
  return Math.exp(
    factorialLog(a + b) +
      factorialLog(c + d) +
      factorialLog(a + c) +
      factorialLog(b + d) -
      factorialLog(a) -
      factorialLog(b) -
      factorialLog(c) -
      factorialLog(d) -
      factorialLog(n)
  );
}

function fisherExact2x2(a: number, b: number, c: number, d: number): number {
  const row1 = a + b;
  const row2 = c + d;
  const col1 = a + c;
  const minA = Math.max(0, col1 - row2);
  const maxA = Math.min(col1, row1);
  const observed = hypergeometricProbability(a, b, c, d);
  let p = 0;

  for (let x = minA; x <= maxA; x++) {
    const y = row1 - x;
    const z = col1 - x;
    const w = row2 - z;
    const prob = hypergeometricProbability(x, y, z, w);
    if (prob <= observed + 1e-12) p += prob;
  }

  return Math.max(0, Math.min(1, p));
}

function chiSquareIndependence(rows: RawRow[], rowColumn: string, colColumn: string) {
  const rowLevels = uniqueValues(rows, rowColumn);
  const colLevels = uniqueValues(rows, colColumn);

  if (rowLevels.length < 2 || colLevels.length < 2) {
    return {
      test: "Chi-square test of independence",
      rowColumn,
      colColumn,
      pValue: null,
      message: "Both variables require at least two categories.",
    };
  }

  const table = rowLevels.map((r) => colLevels.map((c) => rows.filter((row) => String(row[rowColumn]) === r && String(row[colColumn]) === c).length));
  const rowTotals = table.map((row) => sum(row));
  const colTotals = colLevels.map((_, j) => sum(table.map((row) => row[j])));
  const n = sum(rowTotals);
  let statistic = 0;
  let minExpected = Infinity;

  for (let i = 0; i < rowLevels.length; i++) {
    for (let j = 0; j < colLevels.length; j++) {
      const expected = (rowTotals[i] * colTotals[j]) / n;
      minExpected = Math.min(minExpected, expected);
      if (expected > 0) statistic += ((table[i][j] - expected) ** 2) / expected;
    }
  }

  const df = (rowLevels.length - 1) * (colLevels.length - 1);
  const result: RawRow = {
    test: "Chi-square test of independence",
    rowColumn,
    colColumn,
    rowLevels,
    colLevels,
    table,
    chiSquare: statistic,
    df,
    pValue: chiSquarePValue(statistic, df),
    minimumExpectedCellCount: minExpected,
    recommendedExactTest: minExpected < 5,
  };

  if (rowLevels.length === 2 && colLevels.length === 2) {
    result.fisherExactTwoSidedP = fisherExact2x2(table[0][0], table[0][1], table[1][0], table[1][1]);
  }

  return result;
}

function normalityJarqueBera(values: number[], variable: string) {
  const x = finite(values);
  const n = x.length;
  const m = mean(x);
  const s = sd(x);

  if (n < 5 || m === null || s === null || s === 0) {
    return {
      test: "Jarque-Bera normality test",
      variable,
      n,
      pValue: null,
      message: "At least five non-constant values are required.",
    };
  }

  const skewness = sum(x.map((v) => ((v - m) / s) ** 3)) / n;
  const kurtosis = sum(x.map((v) => ((v - m) / s) ** 4)) / n;
  const jbStatistic = (n / 6) * (skewness ** 2 + ((kurtosis - 3) ** 2) / 4);

  return {
    test: "Jarque-Bera normality test",
    variable,
    n,
    skewness,
    kurtosis,
    jbStatistic,
    df: 2,
    pValue: chiSquarePValue(jbStatistic, 2),
  };
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
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) maxRow = k;
    }

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

function buildDesignMatrix(rows: RawRow[], predictors: string[], referenceCategories: RawRow = {}) {
  const metadata: RawRow[] = [{ name: "Intercept", type: "intercept" }];

  predictors.forEach((p) => {
    if (isNumericColumn(rows, p)) {
      metadata.push({ name: p, source: p, type: "numeric" });
    } else {
      const levels = orderedLevelsWithReference(rows, p, referenceCategories);
      const reference = levels[0] ?? null;
      levels.slice(1).forEach((level) => {
        metadata.push({
          name: `${p}=${level}`,
          source: p,
          level,
          reference,
          type: "dummy",
        });
      });
    }
  });

  const X = rows.map((row) =>
    metadata.map((m) => {
      if (m.type === "intercept") return 1;
      if (m.type === "numeric") return Number(row[m.source]);
      return String(row[m.source]) === m.level ? 1 : 0;
    })
  );

  return { X, metadata };
}


function variableNameForVIF(metadata: RawRow): string {
  if (metadata.type === "intercept") return "Intercept";
  if (metadata.type === "numeric") return safeText(metadata.source ?? metadata.name);
  if (metadata.source && metadata.level) return `${metadata.source}=${metadata.level}`;
  return safeText(metadata.name, "Unknown");
}

function sourceNameForVIF(metadata: RawRow): string {
  if (metadata.type === "intercept") return "Intercept";
  return safeText(metadata.source ?? metadata.name, "Unknown");
}

function colMean(values: number[]): number {
  const m = mean(values);
  return m === null ? 0 : m;
}

function centeredR2(observed: number[], fitted: number[]): number | null {
  const m = colMean(observed);
  const sst = sum(observed.map((v) => (v - m) ** 2));
  if (sst <= 1e-12) return null;
  const sse = sum(observed.map((v, i) => (v - fitted[i]) ** 2));
  return Math.max(0, Math.min(1, 1 - sse / sst));
}

function varianceInflationFactorsFromDesign(X: number[][], metadata: RawRow[]) {
  const designColumns = metadata
    .map((m, index) => ({ metadata: m, index }))
    .filter((item) => item.metadata.type !== "intercept");

  if (designColumns.length === 0) {
    return {
      method: "Variance inflation factor from model design matrix",
      available: false,
      message: "No predictors were available for VIF calculation.",
      variables: [],
      summaryByVariable: [],
      maximumVIF: null,
      severeMulticollinearity: false,
    };
  }

  if (designColumns.length === 1) {
    const only = designColumns[0];
    const row = {
      term: variableNameForVIF(only.metadata),
      variable: sourceNameForVIF(only.metadata),
      source: sourceNameForVIF(only.metadata),
      type: only.metadata.type,
      level: only.metadata.level ?? null,
      reference: only.metadata.reference ?? null,
      rSquaredWithOtherPredictors: 0,
      tolerance: 1,
      vif: 1,
      status: "No multicollinearity: only one model predictor term",
    };
    return {
      method: "Variance inflation factor from model design matrix",
      available: true,
      message: "Only one non-intercept model term was present; VIF is 1.",
      variables: [row],
      summaryByVariable: [row],
      maximumVIF: 1,
      severeMulticollinearity: false,
      moderateMulticollinearity: false,
      thresholds: { moderate: 5, severe: 10 },
    };
  }

  const variables = designColumns.map((target) => {
    const y = X.map((row) => Number(row[target.index]));
    const otherIndexes = metadata
      .map((m, index) => ({ m, index }))
      .filter((item) => item.index !== target.index)
      .map((item) => item.index);
    const XOther = X.map((row) => otherIndexes.map((index) => Number(row[index])));
    const Xt = transpose(XOther);
    const XtX = matMul(Xt, XOther);
    const inv = inverse(XtX);

    if (!inv) {
      return {
        term: variableNameForVIF(target.metadata),
        variable: sourceNameForVIF(target.metadata),
        source: sourceNameForVIF(target.metadata),
        type: target.metadata.type,
        level: target.metadata.level ?? null,
        reference: target.metadata.reference ?? null,
        rSquaredWithOtherPredictors: 1,
        tolerance: 0,
        vif: Infinity,
        status: "Severe/singular multicollinearity: auxiliary design matrix could not be inverted",
      };
    }

    const Xty = matVecMul(Xt, y);
    const beta = matVecMul(inv, Xty);
    const fitted = matVecMul(XOther, beta);
    const rSquared = centeredR2(y, fitted);

    if (rSquared === null) {
      return {
        term: variableNameForVIF(target.metadata),
        variable: sourceNameForVIF(target.metadata),
        source: sourceNameForVIF(target.metadata),
        type: target.metadata.type,
        level: target.metadata.level ?? null,
        reference: target.metadata.reference ?? null,
        rSquaredWithOtherPredictors: null,
        tolerance: null,
        vif: null,
        status: "Not estimable: term has no variance after coding",
      };
    }

    const tolerance = Math.max(0, 1 - rSquared);
    const vif = tolerance <= 1e-12 ? Infinity : 1 / tolerance;
    const status =
      !Number.isFinite(vif) || vif >= 10
        ? "Severe multicollinearity"
        : vif >= 5
        ? "Moderate multicollinearity"
        : "Acceptable";

    return {
      term: variableNameForVIF(target.metadata),
      variable: sourceNameForVIF(target.metadata),
      source: sourceNameForVIF(target.metadata),
      type: target.metadata.type,
      level: target.metadata.level ?? null,
      reference: target.metadata.reference ?? null,
      rSquaredWithOtherPredictors: rSquared,
      tolerance,
      vif,
      status,
    };
  });

  const grouped = new Map<string, RawRow[]>();
  variables.forEach((row: any) => {
    const key = safeText(row.source ?? row.variable ?? row.term, "Unknown");
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });

  const summaryByVariable = Array.from(grouped.entries()).map(([variable, rows]) => {
    const finiteVifs = rows.map((row: any) => Number(row.vif)).filter((v) => Number.isFinite(v));
    const hasInfinite = rows.some((row: any) => row.vif === Infinity || row.status?.includes("singular"));
    const maxVIF = hasInfinite ? Infinity : finiteVifs.length ? Math.max(...finiteVifs) : null;
    return {
      variable,
      terms: rows.map((row: any) => row.term),
      maxVIF,
      minTolerance: rows.map((row: any) => row.tolerance).filter((v: any) => Number.isFinite(v)).sort((a: number, b: number) => a - b)[0] ?? null,
      status:
        maxVIF === Infinity || Number(maxVIF) >= 10
          ? "Severe multicollinearity"
          : Number(maxVIF) >= 5
          ? "Moderate multicollinearity"
          : maxVIF === null
          ? "Not estimable"
          : "Acceptable",
    };
  });

  const finiteVifs = variables.map((row: any) => Number(row.vif)).filter((v) => Number.isFinite(v));
  const maximumVIF = variables.some((row: any) => row.vif === Infinity) ? Infinity : finiteVifs.length ? Math.max(...finiteVifs) : null;

  return {
    method: "Variance inflation factor from model design matrix",
    available: true,
    variables,
    summaryByVariable,
    maximumVIF,
    severeMulticollinearity: maximumVIF === Infinity || Number(maximumVIF) >= 10,
    moderateMulticollinearity: Number(maximumVIF) >= 5 && Number(maximumVIF) < 10,
    thresholds: { moderate: 5, severe: 10 },
    interpretation:
      maximumVIF === Infinity || Number(maximumVIF) >= 10
        ? "At least one model term has severe multicollinearity; coefficients, standard errors, and p-values may be unstable."
        : Number(maximumVIF) >= 5
        ? "At least one model term has moderate multicollinearity; interpret model coefficients carefully."
        : "No major multicollinearity signal was detected by VIF thresholds.",
  };
}


function predictorSetMulticollinearity(rows: RawRow[], predictors: string[], referenceCategories: RawRow = {}) {
  const cleanPredictors = predictors.filter((p) => getColumns(rows).includes(p));
  const completeRows = rows.filter((r) =>
    cleanPredictors.every((p) => !isMissing(r[p]) && (isNumericColumn(rows, p) ? Number.isFinite(Number(r[p])) : true))
  );

  if (!cleanPredictors.length || !completeRows.length) {
    return {
      method: "Variance inflation factor from predictor-only design matrix",
      available: false,
      message: "No complete predictor rows were available for VIF calculation.",
      variables: [],
      summaryByVariable: [],
      maximumVIF: null,
      severeMulticollinearity: false,
      moderateMulticollinearity: false,
      thresholds: { moderate: 5, severe: 10 },
    };
  }

  const { X, metadata } = buildDesignMatrix(completeRows, cleanPredictors, referenceCategories);
  const diagnostics = varianceInflationFactorsFromDesign(X, metadata);
  return {
    ...diagnostics,
    method: "Variance inflation factor from predictor-only design matrix used for risk screening",
    predictors: cleanPredictors,
    completeRows: completeRows.length,
  };
}

function termVIFForRiskRow(row: RawRow, multicollinearity: any): RawRow | null {
  const variables = Array.isArray(multicollinearity?.variables) ? multicollinearity.variables : [];
  const summary = Array.isArray(multicollinearity?.summaryByVariable) ? multicollinearity.summaryByVariable : [];
  const variable = safeText(row.variable);
  const category = safeText(row.category);

  if (!variable) return null;

  if (!row.isReference && category && category !== "Per 1-unit increase") {
    const byLevel = variables.find((v: any) => safeText(v.source ?? v.variable) === variable && safeText(v.level) === category);
    if (byLevel) return byLevel;
  }

  const byTerm = variables.find((v: any) => safeText(v.term) === variable || safeText(v.source ?? v.variable) === variable);
  if (byTerm) return byTerm;

  const byVariable = summary.find((v: any) => safeText(v.variable) === variable || safeText(v.source) === variable);
  return byVariable ?? null;
}

function variableVIFSummaryForRiskRow(row: RawRow, multicollinearity: any): RawRow | null {
  const summary = Array.isArray(multicollinearity?.summaryByVariable) ? multicollinearity.summaryByVariable : [];
  const variable = safeText(row.variable);
  if (!variable) return null;
  return summary.find((v: any) => safeText(v.variable) === variable || safeText(v.source) === variable) ?? null;
}

function decorateRiskRowsWithVIF(rows: RawRow[], multicollinearity: any, sourceLabel: string): RawRow[] {
  return rows.map((row) => {
    const term = termVIFForRiskRow(row, multicollinearity);
    const variableSummary = variableVIFSummaryForRiskRow(row, multicollinearity);
    const termVIF = term?.vif ?? term?.maxVIF ?? null;
    const variableMaxVIF = variableSummary?.maxVIF ?? termVIF ?? null;
    const tolerance = term?.tolerance ?? variableSummary?.minTolerance ?? null;
    const status = term?.status ?? variableSummary?.status ?? "Not available";

    return {
      ...row,
      vifSource: sourceLabel,
      vif: row.isReference ? null : termVIF,
      tolerance: row.isReference ? null : tolerance,
      vifStatus: row.isReference ? "Reference category; VIF is assessed through non-reference dummy terms and variable-level maximum VIF" : status,
      variableMaxVIF,
      variableMinTolerance: variableSummary?.minTolerance ?? tolerance,
      variableVIFStatus: variableSummary?.status ?? status,
    };
  });
}

function linearRegression(rows: RawRow[], outcome: string, predictors: string[], referenceCategories: RawRow = {}) {
  const completeRows = rows.filter(
    (r) =>
      Number.isFinite(Number(r[outcome])) &&
      predictors.every((p) => !isMissing(r[p]) && (isNumericColumn(rows, p) ? Number.isFinite(Number(r[p])) : true))
  );

  if (completeRows.length < predictors.length + 2) {
    return {
      test: "Multiple linear regression",
      outcome,
      predictors,
      n: completeRows.length,
      pValue: null,
      message: "Insufficient complete observations.",
    };
  }

  const y = completeRows.map((r) => Number(r[outcome]));
  const { X, metadata } = buildDesignMatrix(completeRows, predictors, referenceCategories);
  const multicollinearity = varianceInflationFactorsFromDesign(X, metadata);
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtXInverse = inverse(XtX);

  if (!XtXInverse) {
    return {
      test: "Multiple linear regression",
      outcome,
      predictors,
      n: completeRows.length,
      pValue: null,
      message: "Design matrix is singular; remove collinear predictors or categories.",
    };
  }

  const Xty = matVecMul(Xt, y);
  const beta = matVecMul(XtXInverse, Xty);
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
  const vcov = XtXInverse.map((row) => row.map((v) => v * mse));

  const coefficients = beta.map((estimate, i) => {
    const standardError = Math.sqrt(Math.max(0, vcov[i][i]));
    const tStatistic = standardError > 0 ? estimate / standardError : null;

    return {
      term: metadata[i].name,
      estimate,
      standardError,
      tStatistic,
      df: dfResidual,
      pValue: tStatistic === null ? null : studentTTwoSidedP(tStatistic, dfResidual),
      ci95: {
        lower: estimate - 1.96 * standardError,
        upper: estimate + 1.96 * standardError,
      },
      metadata: metadata[i],
    };
  });

  const rSquared = sst > 0 ? 1 - sse / sst : null;
  const adjustedRSquared = rSquared !== null ? 1 - (1 - rSquared) * ((n - 1) / dfResidual) : null;
  const fStatistic = p > 0 ? (ssr / p) / mse : null;

  return {
    test: "Multiple linear regression",
    outcome,
    predictors,
    n,
    coefficients,
    fitted,
    residuals,
    sse,
    ssr,
    sst,
    dfModel: p,
    dfResidual,
    mse,
    rSquared,
    adjustedRSquared,
    fStatistic,
    pValue: fStatistic === null ? null : fPValue(fStatistic, p, dfResidual),
    multicollinearity,
    vif: multicollinearity.variables,
    vifSummary: multicollinearity.summaryByVariable,
  };
}

function binaryOutcomeEncode(rows: RawRow[], outcome: string) {
  const levels = uniqueValues(rows, outcome);
  if (levels.length !== 2) return null;
  const positive = levels.includes("1") ? "1" : levels.includes("positive") ? "positive" : levels[1];
  const negative = levels.find((x) => x !== positive) ?? levels[0];
  return { positive, negative, levels };
}


function stableSigmoid(value: number): number {
  if (value >= 35) return 1 - 1e-15;
  if (value <= -35) return 1e-15;
  return 1 / (1 + Math.exp(-value));
}

function clampProbability(value: number): number {
  return Math.min(1 - 1e-12, Math.max(1e-12, value));
}

function logit(value: number): number {
  const p = clampProbability(value);
  return Math.log(p / (1 - p));
}

function logisticLogLikelihood(y: number[], mu: number[]): number {
  return sum(y.map((actual, i) => actual * Math.log(clampProbability(mu[i])) + (1 - actual) * Math.log(clampProbability(1 - mu[i]))));
}

function logisticDeviance(logLikelihood: number): number {
  return -2 * logLikelihood;
}

function logisticModelWarning(beta: number[], standardErrors: (number | null)[], fittedProbabilities: number[]): string[] {
  const warnings: string[] = [];
  if (beta.some((b) => Math.abs(b) > 15)) warnings.push("Large absolute coefficient detected; possible quasi-complete separation or sparse category cells.");
  if (standardErrors.some((se) => se !== null && Number.isFinite(se) && se > 10)) warnings.push("Very large standard error detected; odds ratio and p-value may be unstable.");
  if (fittedProbabilities.some((p) => p < 1e-6 || p > 1 - 1e-6)) warnings.push("Fitted probabilities are extremely close to 0 or 1; check separation and sparse cells.");
  return warnings;
}

function coefficientByTerm(model: any, term: string) {
  return Array.isArray(model?.coefficients) ? model.coefficients.find((coef: any) => coef.term === term) ?? null : null;
}

function logisticRegression(rows: RawRow[], outcome: string, predictors: string[], referenceCategories: RawRow = {}) {
  const enc = binaryOutcomeEncode(rows, outcome);

  if (!enc) {
    return {
      test: "Multivariable logistic regression",
      outcome,
      predictors,
      pValue: null,
      message: "Logistic regression requires a binary/categorical outcome with exactly two levels.",
    };
  }

  const completeRows = rows.filter(
    (r) =>
      !isMissing(r[outcome]) &&
      predictors.every((p) => !isMissing(r[p]) && (isNumericColumn(rows, p) ? Number.isFinite(Number(r[p])) : true))
  );

  const y = completeRows.map((r) => (String(r[outcome]) === enc.positive ? 1 : 0));

  if (new Set(y).size !== 2) {
    return {
      test: "Multivariable logistic regression",
      outcome,
      predictors,
      positiveLevel: enc.positive,
      negativeLevel: enc.negative,
      n: completeRows.length,
      pValue: null,
      message: "Logistic regression requires both positive and negative outcome observations after complete-case filtering.",
    };
  }

  const { X, metadata } = buildDesignMatrix(completeRows, predictors, referenceCategories);
  const multicollinearity = varianceInflationFactorsFromDesign(X, metadata);
  const n = completeRows.length;
  const p = X[0]?.length ?? 0;

  if (p < 2) {
    return {
      test: "Multivariable logistic regression",
      outcome,
      predictors,
      positiveLevel: enc.positive,
      negativeLevel: enc.negative,
      n,
      pValue: null,
      message: "No usable non-intercept predictor term was available after coding.",
      multicollinearity,
      vif: multicollinearity.variables,
      vifSummary: multicollinearity.summaryByVariable,
    };
  }

  if (n <= p + 1) {
    return {
      test: "Multivariable logistic regression",
      outcome,
      predictors,
      positiveLevel: enc.positive,
      negativeLevel: enc.negative,
      n,
      modelTerms: p,
      pValue: null,
      message: "Insufficient complete observations after dummy coding. Logistic regression needs more complete rows than model terms.",
      multicollinearity,
      vif: multicollinearity.variables,
      vifSummary: multicollinearity.summaryByVariable,
    };
  }

  let beta = Array(p).fill(0);
  beta[0] = logit(Number(mean(y)));
  let converged = false;
  let iterations = 0;
  let lastLogLikelihood = -Infinity;
  let stepHalvingCount = 0;

  for (let iter = 0; iter < 120; iter++) {
    iterations = iter + 1;
    const eta = matVecMul(X, beta);
    const mu = eta.map(stableSigmoid);
    const W = mu.map((m) => Math.max(1e-12, m * (1 - m)));
    const currentLogLikelihood = logisticLogLikelihood(y, mu);
    const XtWX = Array.from({ length: p }, (_, i) =>
      Array.from({ length: p }, (_, j) => sum(X.map((row, k) => row[i] * W[k] * row[j])))
    );
    const XtResidual = Array.from({ length: p }, (_, i) => sum(X.map((row, k) => row[i] * (y[k] - mu[k]))));
    const inv = inverse(XtWX);

    if (!inv) {
      return {
        test: "Multivariable logistic regression",
        outcome,
        predictors,
        positiveLevel: enc.positive,
        negativeLevel: enc.negative,
        n,
        modelTerms: p,
        pValue: null,
        message: "Weighted Hessian matrix is singular; reduce collinear predictors, combine sparse categories, or change the reference category.",
        multicollinearity,
        vif: multicollinearity.variables,
        vifSummary: multicollinearity.summaryByVariable,
      };
    }

    const fullStep = matVecMul(inv, XtResidual);
    let stepScale = 1;
    let acceptedBeta = beta.map((b, i) => b + fullStep[i]);
    let acceptedMu = matVecMul(X, acceptedBeta).map(stableSigmoid);
    let acceptedLogLikelihood = logisticLogLikelihood(y, acceptedMu);

    while (acceptedLogLikelihood < currentLogLikelihood - 1e-9 && stepScale > 1 / 1024) {
      stepHalvingCount += 1;
      stepScale /= 2;
      acceptedBeta = beta.map((b, i) => b + fullStep[i] * stepScale);
      acceptedMu = matVecMul(X, acceptedBeta).map(stableSigmoid);
      acceptedLogLikelihood = logisticLogLikelihood(y, acceptedMu);
    }

    const scaledStep = fullStep.map((v) => v * stepScale);
    beta = acceptedBeta;

    if (Math.max(...scaledStep.map(Math.abs)) < 1e-7 || Math.abs(acceptedLogLikelihood - lastLogLikelihood) < 1e-9) {
      converged = true;
      lastLogLikelihood = acceptedLogLikelihood;
      break;
    }

    lastLogLikelihood = acceptedLogLikelihood;
  }

  const eta = matVecMul(X, beta);
  const mu = eta.map(stableSigmoid);
  const W = mu.map((m) => Math.max(1e-12, m * (1 - m)));
  const XtWX = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => sum(X.map((row, k) => row[i] * W[k] * row[j])))
  );
  const cov = inverse(XtWX);

  const standardErrors = beta.map((_, i) => (cov ? Math.sqrt(Math.max(0, cov[i][i])) : null));
  const coefficients = beta.map((estimateLogOdds, i) => {
    const standardError = standardErrors[i];
    const zStatistic = standardError && standardError > 0 ? estimateLogOdds / standardError : null;
    const ciLowerLogOdds = standardError === null ? null : estimateLogOdds - 1.96 * standardError;
    const ciUpperLogOdds = standardError === null ? null : estimateLogOdds + 1.96 * standardError;

    return {
      term: metadata[i].name,
      estimateLogOdds,
      standardError,
      zStatistic,
      pValue: zStatistic === null ? null : normalTwoSidedP(zStatistic),
      oddsRatio: Math.exp(estimateLogOdds),
      ci95LogOdds: {
        lower: ciLowerLogOdds,
        upper: ciUpperLogOdds,
      },
      ci95OddsRatio:
        standardError === null
          ? { lower: null, upper: null }
          : {
              lower: Math.exp(Number(ciLowerLogOdds)),
              upper: Math.exp(Number(ciUpperLogOdds)),
            },
      metadata: metadata[i],
    };
  });

  const logLikelihood = logisticLogLikelihood(y, mu);
  const nullMean = clampProbability(Number(mean(y)));
  const nullLogLikelihood = sum(y.map((v) => v * Math.log(nullMean) + (1 - v) * Math.log(1 - nullMean)));
  const likelihoodRatioStatistic = Math.max(0, 2 * (logLikelihood - nullLogLikelihood));
  const dfModel = Math.max(0, p - 1);
  const warnings = logisticModelWarning(beta, standardErrors, mu);

  return {
    test: "Multivariable logistic regression",
    method: "Maximum-likelihood logistic regression using Newton-Raphson/IRLS with step-halving",
    outcome,
    predictors,
    positiveLevel: enc.positive,
    negativeLevel: enc.negative,
    n,
    events: sum(y),
    nonEvents: y.length - sum(y),
    modelTerms: p,
    dfModel,
    converged,
    iterations,
    stepHalvingCount,
    coefficients,
    fittedProbabilities: mu,
    logLikelihood,
    nullLogLikelihood,
    deviance: logisticDeviance(logLikelihood),
    nullDeviance: logisticDeviance(nullLogLikelihood),
    likelihoodRatioStatistic,
    pValue: dfModel > 0 ? chiSquarePValue(likelihoodRatioStatistic, dfModel) : null,
    aic: 2 * p - 2 * logLikelihood,
    bic: Math.log(n) * p - 2 * logLikelihood,
    pseudoR2McFadden: nullLogLikelihood !== 0 ? 1 - logLikelihood / nullLogLikelihood : null,
    warnings,
    multicollinearity,
    vif: multicollinearity.variables,
    vifSummary: multicollinearity.summaryByVariable,
  };
}

function categoricalRisk2x2(rows: RawRow[], outcome: string, predictor: string, referenceCategories: RawRow = {}) {
  const enc = binaryOutcomeEncode(rows, outcome);

  if (!enc) {
    return {
      variable: predictor,
      test: "categorical risk screening",
      pValue: null,
      message: "Outcome must contain exactly two levels for category-level odds-ratio screening.",
    };
  }

  const levels = orderedLevelsWithReference(rows, predictor, referenceCategories);
  const reference = levels[0] ?? null;

  if (!reference) {
    return {
      variable: predictor,
      test: "categorical risk screening",
      pValue: null,
      message: "Predictor has no valid levels.",
    };
  }

  const valid = rows.filter((r) => !isMissing(r[outcome]) && !isMissing(r[predictor]));
  const referencePositive = valid.filter((r) => String(r[predictor]) === reference && String(r[outcome]) === enc.positive).length;
  const referenceNegative = valid.filter((r) => String(r[predictor]) === reference && String(r[outcome]) !== enc.positive).length;

  const categoryRows: RawRow[] = [
    {
      model: "Univariable",
      variable: predictor,
      variableType: "categorical",
      category: reference,
      reference,
      comparison: "Reference",
      isReference: true,
      outcome,
      positiveLevel: enc.positive,
      negativeLevel: enc.negative,
      nCategoryPositive: referencePositive,
      nCategoryNegative: referenceNegative,
      nCategoryTotal: referencePositive + referenceNegative,
      categoryEventProportion: referencePositive + referenceNegative > 0 ? referencePositive / (referencePositive + referenceNegative) : null,
      nReferencePositive: referencePositive,
      nReferenceNegative: referenceNegative,
      nReferenceTotal: referencePositive + referenceNegative,
      referenceEventProportion: referencePositive + referenceNegative > 0 ? referencePositive / (referencePositive + referenceNegative) : null,
      oddsRatio: null,
      oddsRatioLabel: "Reference",
      ciLower: null,
      ciUpper: null,
      ci95Label: "Reference",
      chiSquare: null,
      chiSquarePValue: null,
      pValue: null,
      pValueLabel: "Reference",
      fisherExactTwoSidedP: null,
      primaryPMethod: "Reference",
      correctionUsed: false,
      interpretation: "Reference category",
    },
  ];

  levels.slice(1).forEach((level) => {
    const categoryPositive = valid.filter((r) => String(r[predictor]) === level && String(r[outcome]) === enc.positive).length;
    const categoryNegative = valid.filter((r) => String(r[predictor]) === level && String(r[outcome]) !== enc.positive).length;
    const zeroCell = [categoryPositive, categoryNegative, referencePositive, referenceNegative].some((v) => v === 0);
    const correction = zeroCell ? 0.5 : 0;
    const a = categoryPositive + correction;
    const b = categoryNegative + correction;
    const c = referencePositive + correction;
    const d = referenceNegative + correction;
    const oddsRatio = b > 0 && c > 0 ? (a * d) / (b * c) : null;
    const seLogOR = oddsRatio !== null && a > 0 && b > 0 && c > 0 && d > 0 ? Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d) : null;

    const total = categoryPositive + categoryNegative + referencePositive + referenceNegative;
    const denominator = (categoryPositive + categoryNegative) * (referencePositive + referenceNegative) * (categoryPositive + referencePositive) * (categoryNegative + referenceNegative);
    const chiSquare = denominator > 0 ? (total * (categoryPositive * referenceNegative - categoryNegative * referencePositive) ** 2) / denominator : null;
    const chiSquareP = chiSquare === null ? null : chiSquarePValue(chiSquare, 1);
    const fisherP = fisherExact2x2(categoryPositive, categoryNegative, referencePositive, referenceNegative);
    const expectedCategoryPositive = total > 0 ? ((categoryPositive + categoryNegative) * (categoryPositive + referencePositive)) / total : null;
    const expectedCategoryNegative = total > 0 ? ((categoryPositive + categoryNegative) * (categoryNegative + referenceNegative)) / total : null;
    const expectedReferencePositive = total > 0 ? ((referencePositive + referenceNegative) * (categoryPositive + referencePositive)) / total : null;
    const expectedReferenceNegative = total > 0 ? ((referencePositive + referenceNegative) * (categoryNegative + referenceNegative)) / total : null;
    const minimumExpectedCell = Math.min(
      ...[expectedCategoryPositive, expectedCategoryNegative, expectedReferencePositive, expectedReferenceNegative].filter((v): v is number => Number.isFinite(Number(v)))
    );
    const useFisherAsPrimary = !Number.isFinite(minimumExpectedCell) || minimumExpectedCell < 5;
    const pValue = useFisherAsPrimary ? fisherP : chiSquareP;
    const ciLower = oddsRatio !== null && seLogOR !== null ? Math.exp(Math.log(oddsRatio) - 1.96 * seLogOR) : null;
    const ciUpper = oddsRatio !== null && seLogOR !== null ? Math.exp(Math.log(oddsRatio) + 1.96 * seLogOR) : null;
    const categoryEventProportion = categoryPositive + categoryNegative > 0 ? categoryPositive / (categoryPositive + categoryNegative) : null;
    const referenceEventProportion = referencePositive + referenceNegative > 0 ? referencePositive / (referencePositive + referenceNegative) : null;

    categoryRows.push({
      model: "Univariable",
      variable: predictor,
      variableType: "categorical",
      category: level,
      reference,
      comparison: formatComparison(level, reference),
      isReference: false,
      outcome,
      positiveLevel: enc.positive,
      negativeLevel: enc.negative,
      nCategoryPositive: categoryPositive,
      nCategoryNegative: categoryNegative,
      nCategoryTotal: categoryPositive + categoryNegative,
      categoryEventProportion,
      nReferencePositive: referencePositive,
      nReferenceNegative: referenceNegative,
      nReferenceTotal: referencePositive + referenceNegative,
      referenceEventProportion,
      riskDifference: categoryEventProportion !== null && referenceEventProportion !== null ? categoryEventProportion - referenceEventProportion : null,
      oddsRatio,
      oddsRatioMethod: zeroCell ? "Haldane-Anscombe corrected crude odds ratio" : "Crude odds ratio",
      correctionUsed: zeroCell,
      ciLower,
      ciUpper,
      chiSquare,
      chiSquarePValue: chiSquareP,
      pValue,
      fisherExactTwoSidedP: fisherP,
      primaryPMethod: useFisherAsPrimary ? "Fisher exact test because at least one expected cell count was <5" : "Pearson chi-square test",
      minimumExpectedCell,
      interpretation: interpretationFromOR(oddsRatio, pValue),
    });
  });

  const comparableRows = categoryRows.filter((row) => !row.isReference);
  const strongest = [...comparableRows].filter((row) => Number.isFinite(row.pValue)).sort((a, b) => Number(a.pValue) - Number(b.pValue))[0] ?? comparableRows[0] ?? null;
  const univariableLogistic = logisticRegression(rows, outcome, [predictor], referenceCategories);

  return {
    variable: predictor,
    variableType: "categorical",
    reference,
    levels,
    levelCompared: strongest?.category ?? null,
    comparisonLabel: strongest?.comparison ?? null,
    outcome,
    positiveLevel: enc.positive,
    negativeLevel: enc.negative,
    test: "category-level univariable odds ratio vs selected reference",
    pValue: strongest?.pValue ?? null,
    primaryPMethod: strongest?.primaryPMethod ?? null,
    fisherExactTwoSidedP: strongest?.fisherExactTwoSidedP ?? null,
    chiSquarePValue: strongest?.chiSquarePValue ?? null,
    chiSquare: strongest?.chiSquare ?? null,
    oddsRatio: strongest?.oddsRatio ?? null,
    ciLower: strongest?.ciLower ?? null,
    ciUpper: strongest?.ciUpper ?? null,
    categoryRows,
    univariableLogistic,
    table: strongest
      ? {
          categoryPositive: strongest.nCategoryPositive,
          categoryNegative: strongest.nCategoryNegative,
          referencePositive: strongest.nReferencePositive,
          referenceNegative: strongest.nReferenceNegative,
        }
      : null,
  };
}

function continuousPredictorBinaryOutcome(rows: RawRow[], outcome: string, predictor: string) {
  const enc = binaryOutcomeEncode(rows, outcome);

  if (!enc) {
    return {
      variable: predictor,
      test: "continuous predictor vs binary outcome",
      pValue: null,
      message: "Outcome must contain exactly two levels.",
    };
  }

  const positive = rows.filter((r) => String(r[outcome]) === enc.positive && Number.isFinite(Number(r[predictor]))).map((r) => Number(r[predictor]));
  const negative = rows.filter((r) => String(r[outcome]) !== enc.positive && Number.isFinite(Number(r[predictor]))).map((r) => Number(r[predictor]));

  const univariableLogistic = logisticRegression(rows, outcome, [predictor], {});
  const coefficient = coefficientByTerm(univariableLogistic, predictor);

  return {
    variable: predictor,
    variableType: "continuous",
    outcome,
    positiveLevel: enc.positive,
    negativeLevel: enc.negative,
    test: "continuous predictor vs binary outcome: Welch t-test + univariable logistic regression",
    ...independentTTestFromArrays(positive, negative, false),
    univariableLogistic,
    oddsRatioPerUnit: coefficient?.oddsRatio ?? null,
    ciLower: coefficient?.ci95OddsRatio?.lower ?? null,
    ciUpper: coefficient?.ci95OddsRatio?.upper ?? null,
    logisticCoefficient: coefficient?.estimateLogOdds ?? null,
    logisticStandardError: coefficient?.standardError ?? null,
    logisticPValue: coefficient?.pValue ?? null,
  };
}

function numericOutcomeUnivariable(rows: RawRow[], outcome: string, predictor: string, referenceCategories: RawRow = {}) {
  if (isNumericColumn(rows, predictor)) {
    const model = linearRegression(rows, outcome, [predictor], referenceCategories);
    return {
      variable: predictor,
      variableType: "continuous",
      outcome,
      test: "univariable linear regression",
      pValue: (model as any).coefficients?.find((c: any) => c.term === predictor)?.pValue ?? model.pValue ?? null,
      regression: model,
    };
  }

  const levels = orderedLevelsWithReference(rows, predictor, referenceCategories);
  if (levels.length === 2) {
    const result = independentTTestBySelectedGroups(rows, outcome, predictor, levels[0], levels[1]);
    return {
      variable: predictor,
      variableType: "categorical",
      outcome,
      test: "numeric outcome by two-group predictor: Welch t-test",
      pValue: result.pValue,
      comparison: result,
    };
  }

  const result = oneWayANOVA(rows, outcome, predictor);
  return {
    variable: predictor,
    variableType: "categorical",
    outcome,
    test: "numeric outcome by multi-group predictor: one-way ANOVA",
    pValue: result.pValue,
    comparison: result,
  };
}

function analyzeRisk(rows: RawRow[], outcome: string, predictors: string[], threshold: number, clarifications: RawRow, referenceCategories: RawRow = {}) {
  const profile = describeDataset(rows);
  const outcomeIsNumeric = isNumericColumn(rows, outcome);
  const validPredictors = predictors.filter((p) => getColumns(rows).includes(p) && p !== outcome);

  if (!getColumns(rows).includes(outcome)) {
    return {
      outcome,
      predictors,
      referenceCategories,
      error: `Outcome/dependent variable "${outcome}" was not found in the uploaded or edited dataset.`,
      datasetProfile: profile,
    };
  }

  if (outcomeIsNumeric) {
    const univariable = validPredictors.map((p) => numericOutcomeUnivariable(rows, outcome, p, referenceCategories));
    const selectedVariables = univariable.filter((u: any) => Number.isFinite(u.pValue) && u.pValue < threshold).map((u: any) => u.variable);
    const multivariablePredictors = selectedVariables.length ? selectedVariables : validPredictors.slice(0, 8);
    const multivariable = multivariablePredictors.length ? linearRegression(rows, outcome, multivariablePredictors, referenceCategories) : null;
    const candidateMulticollinearity = predictorSetMulticollinearity(rows, validPredictors, referenceCategories);
    const finalMulticollinearity = (multivariable as any)?.multicollinearity ?? null;
    const univariableScreeningTable = decorateRiskRowsWithVIF(
      univariable.map((u: any) => ({
        model: "Univariable",
        variable: u.variable,
        variableType: u.variableType,
        test: u.test,
        pValue: u.pValue,
        reference: referenceForVariable(rows, u.variable, referenceCategories),
        details: u.comparison ?? u.regression ?? null,
      })),
      candidateMulticollinearity,
      "Candidate-predictor VIF from all selected predictors"
    );
    const multivariableCategoryTable = decorateRiskRowsWithVIF(
      buildLinearMultivariableTable(multivariable, rows, multivariablePredictors, referenceCategories, 0.05),
      finalMulticollinearity,
      "Final multivariable model VIF"
    );

    return {
      outcome,
      outcomeType: "numeric",
      predictors: validPredictors,
      threshold,
      referenceCategories,
      clarifications,
      datasetProfile: profile,
      univariable,
      selectedVariables,
      multivariable,
      regression: { linear: multivariable },
      multicollinearity: finalMulticollinearity,
      candidateMulticollinearity,
      finalMulticollinearity,
      vif: (multivariable as any)?.vif ?? [],
      vifSummary: (multivariable as any)?.vifSummary ?? [],
      candidateVIF: candidateMulticollinearity?.variables ?? [],
      candidateVIFSummary: candidateMulticollinearity?.summaryByVariable ?? [],
      tables: {
        univariable: univariableScreeningTable,
        multivariable: multivariableCategoryTable,
      },
      univariableCategoryTable: univariableScreeningTable,
      multivariableCategoryTable,
      summary: {
        totalPredictors: validPredictors.length,
        significantAt005: univariable.filter((u: any) => Number.isFinite(u.pValue) && u.pValue < 0.05).length,
        selectedForMultivariable: selectedVariables.length,
        strongestPredictor: [...univariable].filter((u: any) => Number.isFinite(u.pValue)).sort((a: any, b: any) => a.pValue - b.pValue)[0] ?? null,
      },
      visualization: {
        pValueBars: univariable.map((u: any) => ({
          variable: u.variable,
          pValue: u.pValue,
          selected: Number.isFinite(u.pValue) && u.pValue < threshold,
          analysisType: u.test,
        })),
        coefficientPlot:
          (multivariable as any)?.coefficients
            ?.filter((c: any) => c.term !== "Intercept")
            .map((c: any) => ({
              term: c.term,
              estimate: c.estimate,
              ciLower: c.ci95?.lower,
              ciUpper: c.ci95?.upper,
              pValue: c.pValue,
            })) ?? [],
      },
    };
  }

  const outcomeLevels = uniqueValues(rows, outcome);
  const binary = outcomeLevels.length === 2;

  const univariable = validPredictors.map((p) => {
    if (binary) {
      if (isNumericColumn(rows, p) && uniqueValues(rows, p).length > 5) {
        return continuousPredictorBinaryOutcome(rows, outcome, p);
      }
      return categoricalRisk2x2(rows, outcome, p, referenceCategories);
    }

    if (isNumericColumn(rows, p)) {
      return {
        variable: p,
        variableType: "continuous",
        outcome,
        test: "multi-category outcome screening",
        pValue: null,
        message: "For categorical outcomes with more than two levels, use multinomial modelling externally or recode to binary for odds-ratio/logistic screening.",
      };
    }

    const chi = chiSquareIndependence(rows, outcome, p);
    return {
      variable: p,
      variableType: "categorical",
      outcome,
      test: "multi-category outcome chi-square screening",
      pValue: chi.pValue,
      chiSquare: chi,
    };
  });

  const univariableLogisticModels = binary
    ? validPredictors.map((p) => ({
        variable: p,
        model: logisticRegression(rows, outcome, [p], referenceCategories),
      }))
    : [];
  const selectedVariables = univariable.filter((u: any) => Number.isFinite(u.pValue) && u.pValue < threshold).map((u: any) => u.variable);
  const multivariablePredictors = selectedVariables.length ? selectedVariables : validPredictors.slice(0, 8);
  const multivariable = binary && multivariablePredictors.length ? logisticRegression(rows, outcome, multivariablePredictors, referenceCategories) : null;
  const candidateMulticollinearity = predictorSetMulticollinearity(rows, validPredictors, referenceCategories);
  const finalMulticollinearity = (multivariable as any)?.multicollinearity ?? null;
  const univariableCategoryTable = decorateRiskRowsWithVIF(
    buildUnivariableRiskTable(univariable, 0.05),
    candidateMulticollinearity,
    "Candidate-predictor VIF from all selected predictors"
  );
  const multivariableCategoryTable = decorateRiskRowsWithVIF(
    buildMultivariableRiskTable(multivariable, rows, multivariablePredictors, referenceCategories, 0.05),
    finalMulticollinearity,
    "Final multivariable model VIF"
  );

  return {
    outcome,
    outcomeType: binary ? "binary/categorical" : "multi-category categorical",
    outcomeLevels,
    predictors: validPredictors,
    threshold,
    referenceCategories,
    clarifications,
    datasetProfile: profile,
    univariable,
    univariableLogisticModels,
    selectedVariables,
    multivariable,
    regression: { logistic: multivariable, univariable: univariableLogisticModels },
    multicollinearity: finalMulticollinearity,
    candidateMulticollinearity,
    finalMulticollinearity,
    vif: (multivariable as any)?.vif ?? [],
    vifSummary: (multivariable as any)?.vifSummary ?? [],
    candidateVIF: candidateMulticollinearity?.variables ?? [],
    candidateVIFSummary: candidateMulticollinearity?.summaryByVariable ?? [],
    tables: {
      univariable: univariableCategoryTable,
      multivariable: multivariableCategoryTable,
    },
    univariableCategoryTable,
    multivariableCategoryTable,
    summary: {
      totalPredictors: validPredictors.length,
      significantAt005: univariable.filter((u: any) => Number.isFinite(u.pValue) && u.pValue < 0.05).length,
      selectedForMultivariable: selectedVariables.length,
      strongestPredictor: [...univariable].filter((u: any) => Number.isFinite(u.pValue)).sort((a: any, b: any) => a.pValue - b.pValue)[0] ?? null,
    },
    visualization: {
      pValueBars: univariable.map((u: any) => ({
        variable: u.variable,
        pValue: u.pValue,
        selected: Number.isFinite(u.pValue) && u.pValue < threshold,
        analysisType: u.test,
      })),
      forestData: univariableCategoryTable
        .filter((row: any) => !row.isReference && Number.isFinite(row.oddsRatio))
        .map((row: any) => ({
          variable: row.variable,
          category: row.category,
          reference: row.reference,
          comparison: row.comparison,
          oddsRatio: row.oddsRatio,
          ciLower: row.ciLower,
          ciUpper: row.ciUpper,
          pValue: row.pValue,
        })),
      multivariableForestData: multivariableCategoryTable
        .filter((row: any) => !row.isReference && Number.isFinite(row.adjustedOddsRatio))
        .map((row: any) => ({
          variable: row.variable,
          category: row.category,
          reference: row.reference,
          comparison: row.comparison,
          oddsRatio: row.adjustedOddsRatio,
          ciLower: row.adjustedCiLower,
          ciUpper: row.adjustedCiUpper,
          pValue: row.pValue,
        })),
    },
  };
}

function getStatisticalRequest(formData: FormData, rows: RawRow[]): StatisticalRequest {
  const columns = getColumns(rows);
  const numericColumns = columns.filter((c) => isNumericColumn(rows, c));
  const categoricalColumns = columns.filter((c) => !isNumericColumn(rows, c));

  const valueColumns = parseList(formData.get("valueColumns")).length
    ? parseList(formData.get("valueColumns"))
    : numericColumns.slice(0, 6);

  const groupColumnText = safeText(formData.get("groupColumn"));
  const groupFields = parseList(formData.get("groupColumn"));
  const anovaFactorColumns = parseList(formData.get("anovaFactorColumns")).length
    ? parseList(formData.get("anovaFactorColumns"))
    : parseList(formData.get("factorColumns")).length
    ? parseList(formData.get("factorColumns"))
    : groupFields.length >= 2
    ? groupFields
    : [safeText(formData.get("anovaPrimaryFactor")), safeText(formData.get("anovaSecondaryFactor"))].filter(Boolean);

  const outcomeColumn =
    safeText(formData.get("outcomeColumn")) ||
    safeText(formData.get("dependentVariable")) ||
    safeText(formData.get("dependentColumn")) ||
    numericColumns[0] ||
    categoricalColumns[0] ||
    "";

  const predictors =
    parseList(formData.get("predictorColumns")).length
      ? parseList(formData.get("predictorColumns"))
      : parseList(formData.get("independentVariables")).length
      ? parseList(formData.get("independentVariables"))
      : parseList(formData.get("independentColumns")).length
      ? parseList(formData.get("independentColumns"))
      : columns.filter((c) => c !== outcomeColumn).slice(0, 8);

  return {
    tests: parseList(formData.get("tests")).length
      ? parseList(formData.get("tests")).map((x) => x.toLowerCase().replace(/[\s-]+/g, "_"))
      : ["descriptive", "normality", "correlation", "t_test", "anova", "chi_square", "linear_regression"],
    valueColumns,
    groupColumn: groupFields[0] || groupColumnText || categoricalColumns[0] || "",
    groupColumnA: safeText(formData.get("groupColumnA")) || groupFields[0] || "",
    groupColumnB: safeText(formData.get("groupColumnB")) || groupFields[1] || "",
    tTestValueColumn: safeText(formData.get("tTestValueColumn")) || valueColumns[0] || numericColumns[0] || "",
    tTestGroupColumn: safeText(formData.get("tTestGroupColumn")) || groupFields[0] || groupColumnText || categoricalColumns[0] || "",
    tTestGroupA: safeText(formData.get("tTestGroupA")) || safeText(formData.get("groupA")),
    tTestGroupB: safeText(formData.get("tTestGroupB")) || safeText(formData.get("groupB")),
    pairedColumnA: safeText(formData.get("pairedColumnA")) || numericColumns[0] || "",
    pairedColumnB: safeText(formData.get("pairedColumnB")) || numericColumns[1] || "",
    oneSampleMean: safeNumber(formData.get("oneSampleMean"), 0),
    anovaValueColumn: safeText(formData.get("anovaValueColumn")) || valueColumns[0] || numericColumns[0] || "",
    anovaFactorColumns,
    anovaPrimaryFactor: safeText(formData.get("anovaPrimaryFactor")) || anovaFactorColumns[0] || groupFields[0] || groupColumnText || categoricalColumns[0] || "",
    anovaSecondaryFactor: safeText(formData.get("anovaSecondaryFactor")) || anovaFactorColumns[1] || groupFields[1] || categoricalColumns.find((c) => c !== groupColumnText) || "",
    repeatedMeasureColumns: parseList(formData.get("repeatedMeasureColumns")).length
      ? parseList(formData.get("repeatedMeasureColumns"))
      : valueColumns,
    subjectColumn: safeText(formData.get("subjectColumn")),
    outcomeColumn,
    predictorColumns: predictors,
    alpha: safeNumber(formData.get("alpha"), 0.05),
    clarifications: parseClarifications(formData),
  };
}

function nestedModelFTest(reduced: any, full: any, label: string) {
  const df1 = Number(reduced?.dfResidual) - Number(full?.dfResidual);
  const df2 = Number(full?.dfResidual);
  const sseReduced = Number(reduced?.sse);
  const sseFull = Number(full?.sse);

  if (!Number.isFinite(df1) || !Number.isFinite(df2) || df1 <= 0 || df2 <= 0 || !Number.isFinite(sseReduced) || !Number.isFinite(sseFull) || sseReduced < sseFull) {
    return {
      effect: label,
      fStatistic: null,
      df1,
      df2,
      pValue: null,
      message: "Nested model comparison is not valid for this dataset/design.",
    };
  }

  const fStatistic = ((sseReduced - sseFull) / df1) / (sseFull / df2);

  return {
    effect: label,
    fStatistic,
    df1,
    df2,
    pValue: fPValue(fStatistic, df1, df2),
  };
}

function twoWayANOVA(rows: RawRow[], valueColumn: string, factorA: string, factorB: string) {
  if (!factorA || !factorB || factorA === factorB) {
    return {
      test: "Two-way ANOVA",
      valueColumn,
      factorA,
      factorB,
      pValue: null,
      message: "Two-way ANOVA requires two different factor columns.",
    };
  }

  const usable = rows
    .filter((r) => !isMissing(r[factorA]) && !isMissing(r[factorB]) && Number.isFinite(Number(r[valueColumn])))
    .map((r) => ({
      ...r,
      __interaction_factor: `${String(r[factorA])} × ${String(r[factorB])}`,
      __intercept_only: 1,
    }));

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

  const nullModel = linearRegression(usable, valueColumn, ["__intercept_only"]);
  const modelA = linearRegression(usable, valueColumn, [factorA]);
  const modelAB = linearRegression(usable, valueColumn, [factorA, factorB]);
  const modelFull = linearRegression(usable, valueColumn, [factorA, factorB, "__interaction_factor"]);

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
  const numericColumns = valueColumns.filter((c) => isNumericColumn(rows, c));

  if (numericColumns.length < 2) {
    return {
      test: "Repeated-measures ANOVA",
      pValue: null,
      message: "Repeated-measures ANOVA needs at least two numeric repeated-measure columns.",
    };
  }

  const complete = rows.filter((r) => numericColumns.every((c) => Number.isFinite(Number(r[c]))));
  const n = complete.length;
  const k = numericColumns.length;

  if (n < 2 || k < 2) {
    return {
      test: "Repeated-measures ANOVA",
      pValue: null,
      message: "Insufficient complete repeated-measures rows.",
    };
  }

  const matrix = complete.map((r) => numericColumns.map((c) => Number(r[c])));
  const allValues = matrix.flat();
  const grandMean = mean(allValues);

  if (grandMean === null) {
    return {
      test: "Repeated-measures ANOVA",
      pValue: null,
      message: "No valid numeric repeated-measures values.",
    };
  }

  const subjectMeans = matrix.map((row) => Number(mean(row)));
  const conditionMeans = numericColumns.map((_, j) => Number(mean(matrix.map((row) => row[j]))));
  const ssTotal = sum(allValues.map((v) => (v - grandMean) ** 2));
  const ssSubjects = k * sum(subjectMeans.map((m) => (m - grandMean) ** 2));
  const ssConditions = n * sum(conditionMeans.map((m) => (m - grandMean) ** 2));
  const ssError = ssTotal - ssSubjects - ssConditions;
  const dfConditions = k - 1;
  const dfError = (n - 1) * (k - 1);
  const msConditions = ssConditions / dfConditions;
  const msError = ssError / dfError;
  const fStatistic = msError > 0 ? msConditions / msError : null;
  const pValue = fStatistic === null ? null : fPValue(fStatistic, dfConditions, dfError);

  return {
    test: "Repeated-measures ANOVA",
    method: "One-factor repeated-measures ANOVA from wide columns",
    valueColumns: numericColumns,
    nSubjects: n,
    conditions: k,
    conditionMeans: numericColumns.map((condition, i) => ({ condition, mean: conditionMeans[i] })),
    ssTotal,
    ssSubjects,
    ssConditions,
    ssError,
    dfConditions,
    dfError,
    fStatistic,
    pValue,
    etaSquaredPartial: ssConditions / (ssConditions + ssError),
    significant: pValue !== null && pValue < alpha,
  };
}

function analyzeStatistics(rows: RawRow[], request: StatisticalRequest) {
  const profile = describeDataset(rows);
  const numericColumns = profile.numericColumns;
  const categoricalColumns = profile.categoricalColumns;
  const tests = new Set(request.tests);
  const valueColumns = request.valueColumns.filter((c) => numericColumns.includes(c));
  const fallbackValueColumns = valueColumns.length ? valueColumns : numericColumns.slice(0, 6);

  const results: any = {
    request,
    dataset: profile,
    numericColumns,
    categoricalColumns,
    clarifications: request.clarifications,
    descriptiveStatistics: fallbackValueColumns.map((col) => ({
      variable: col,
      ...describeNumeric(numericVector(rows, col)),
    })),
    tests: {},
    regression: {},
    univariable: [],
    multivariable: null,
    notes: [
      "The route accepts test-specific clarification fields such as tTestGroupColumn, tTestGroupA, tTestGroupB, anovaValueColumn, anovaFactorColumns, outcomeColumn, predictorColumns, and clarifications JSON.",
      "T-test uses the selected two group levels when provided. ANOVA uses selected factor/category fields. Numerical outcomes in risk/regression are analyzed with linear regression and group-comparison methods.",
      "These calculations are implemented directly in TypeScript using statistical formulas. Validate final publication results in R/Python/SPSS/GraphPad before submission.",
      "VIF/multicollinearity diagnostics are calculated from the same model design matrix after numeric coding and categorical dummy coding; VIF >=5 is flagged as moderate and VIF >=10 as severe.",
    ],
  };

  if (tests.has("descriptive")) {
    results.tests.descriptive = results.descriptiveStatistics;
  }

  if (tests.has("normality") || tests.has("normality_tests")) {
    results.tests.normality = fallbackValueColumns.map((col) => normalityJarqueBera(numericVector(rows, col), col));
  }

  if (tests.has("t_test") || tests.has("ttest") || tests.has("t")) {
    const tValue = request.tTestValueColumn || fallbackValueColumns[0];
    const tGroup = request.tTestGroupColumn || request.groupColumn;
    results.tests.tTests = tValue && tGroup
      ? [independentTTestBySelectedGroups(rows, tValue, tGroup, request.tTestGroupA, request.tTestGroupB)]
      : fallbackValueColumns.map((col) => independentTTestBySelectedGroups(rows, col, request.groupColumn));
  }

  if (tests.has("paired_t_test") || tests.has("paired_ttest")) {
    results.tests.pairedTTest = pairedTTest(rows, request.pairedColumnA, request.pairedColumnB);
  }

  if (tests.has("one_sample_t_test") || tests.has("one_sample_ttest")) {
    results.tests.oneSampleTTests = fallbackValueColumns.map((col) => oneSampleTTest(rows, col, request.oneSampleMean));
  }

  if (tests.has("anova") || tests.has("one_way_anova")) {
    const anovaValue = request.anovaValueColumn || fallbackValueColumns[0];
    const primaryFactor = request.anovaPrimaryFactor || request.groupColumn;
    results.tests.anova = anovaValue && primaryFactor
      ? [oneWayANOVA(rows, anovaValue, primaryFactor)]
      : fallbackValueColumns.map((col) => oneWayANOVA(rows, col, request.groupColumn));
  }

  if (tests.has("two_way_anova")) {
    const anovaValue = request.anovaValueColumn || fallbackValueColumns[0];
    const factors = request.anovaFactorColumns.length >= 2 ? request.anovaFactorColumns : [request.anovaPrimaryFactor, request.anovaSecondaryFactor].filter(Boolean);
    results.tests.twoWayAnova = anovaValue && factors.length >= 2
      ? [twoWayANOVA(rows, anovaValue, factors[0], factors[1])]
      : [{
          test: "Two-way ANOVA",
          valueColumn: anovaValue,
          pValue: null,
          message: "Two-way ANOVA requires anovaValueColumn and two factor/category columns in anovaFactorColumns.",
        }];
  }

  if (tests.has("welch_anova")) {
    const anovaValue = request.anovaValueColumn || fallbackValueColumns[0];
    const primaryFactor = request.anovaPrimaryFactor || request.groupColumn;
    results.tests.welchAnova = anovaValue && primaryFactor
      ? [welchANOVA(rows, anovaValue, primaryFactor)]
      : fallbackValueColumns.map((col) => welchANOVA(rows, col, request.groupColumn));
  }

  if (tests.has("levene") || tests.has("levene_test")) {
    const value = request.anovaValueColumn || fallbackValueColumns[0];
    const group = request.anovaPrimaryFactor || request.groupColumn;
    results.tests.levene = value && group
      ? [leveneTest(rows, value, group)]
      : fallbackValueColumns.map((col) => leveneTest(rows, col, request.groupColumn));
  }

  if (tests.has("repeated_measures_anova")) {
    results.tests.repeatedMeasuresAnova = repeatedMeasuresFromWideColumns(rows, request.repeatedMeasureColumns.length ? request.repeatedMeasureColumns : fallbackValueColumns, request.alpha);
  }

  if (tests.has("mann_whitney") || tests.has("mann_whitney_u")) {
    const value = request.tTestValueColumn || fallbackValueColumns[0];
    const group = request.tTestGroupColumn || request.groupColumn;
    results.tests.mannWhitney = value && group
      ? [mannWhitneyU(rows, value, group, request.tTestGroupA, request.tTestGroupB)]
      : fallbackValueColumns.map((col) => mannWhitneyU(rows, col, request.groupColumn));
  }

  if (tests.has("kruskal_wallis") || tests.has("kruskal")) {
    const value = request.anovaValueColumn || fallbackValueColumns[0];
    const group = request.anovaPrimaryFactor || request.groupColumn;
    results.tests.kruskalWallis = value && group
      ? [kruskalWallis(rows, value, group)]
      : fallbackValueColumns.map((col) => kruskalWallis(rows, col, request.groupColumn));
  }

  if (tests.has("chi_square") || tests.has("fisher") || tests.has("categorical")) {
    const pairs = categoricalColumns.flatMap((a, i) => categoricalColumns.slice(i + 1).map((b) => [a, b]));
    results.tests.chiSquareAndFisher = pairs.slice(0, 40).map(([a, b]) => chiSquareIndependence(rows, a, b));
  }

  if (tests.has("correlation") || tests.has("pearson") || tests.has("spearman")) {
    const pairs = numericColumns.flatMap((a, i) => numericColumns.slice(i + 1).map((b) => [a, b]));
    results.tests.correlations = pairs.slice(0, 120).flatMap(([a, b]) => [
      correlationTest(rows, a, b, "pearson"),
      correlationTest(rows, a, b, "spearman"),
    ]);
  }

  if (tests.has("linear_regression") || tests.has("regression")) {
    const outcome = numericColumns.includes(request.outcomeColumn) ? request.outcomeColumn : numericColumns[0] ?? "";
    const predictors = request.predictorColumns.filter((p) => p !== outcome && getColumns(rows).includes(p));
    if (outcome && predictors.length) results.regression.linear = linearRegression(rows, outcome, predictors);
  }

  if (tests.has("logistic_regression") || tests.has("multivariable") || tests.has("regression")) {
    const outcome = request.outcomeColumn || categoricalColumns[0] || "";
    const predictors = request.predictorColumns.filter((p) => p !== outcome && getColumns(rows).includes(p));
    if (outcome && predictors.length && !isNumericColumn(rows, outcome)) {
      results.univariable = predictors.map((p) =>
        isNumericColumn(rows, p) && uniqueValues(rows, p).length > 5
          ? continuousPredictorBinaryOutcome(rows, outcome, p)
          : categoricalRisk2x2(rows, outcome, p)
      );
      const selected = results.univariable.filter((u: any) => Number.isFinite(u.pValue) && u.pValue < request.alpha).map((u: any) => u.variable);
      results.multivariable = logisticRegression(rows, outcome, selected.length ? selected : predictors.slice(0, 8));
      results.regression.logistic = results.multivariable;
    }
  }

  if (tests.has("vif") || tests.has("multicollinearity") || tests.has("collinearity") || tests.has("linear_regression") || tests.has("logistic_regression") || tests.has("regression")) {
    const outcomeForVIF = request.outcomeColumn || fallbackValueColumns[0] || categoricalColumns[0] || "";
    const predictorsForVIF = request.predictorColumns.filter((p) => p !== outcomeForVIF && getColumns(rows).includes(p));
    const completeRowsForVIF = rows.filter((r) =>
      predictorsForVIF.every((p) => !isMissing(r[p]) && (isNumericColumn(rows, p) ? Number.isFinite(Number(r[p])) : true))
    );

    if (predictorsForVIF.length && completeRowsForVIF.length) {
      const { X, metadata } = buildDesignMatrix(completeRowsForVIF, predictorsForVIF);
      results.tests.multicollinearity = varianceInflationFactorsFromDesign(X, metadata);
      results.tests.vif = results.tests.multicollinearity.variables;
      results.tests.vifSummary = results.tests.multicollinearity.summaryByVariable;
      results.regression.multicollinearity = results.tests.multicollinearity;
      results.regression.vif = results.tests.vif;
      results.regression.vifSummary = results.tests.vifSummary;
    }
  }

  const flatten = (value: any) => (Array.isArray(value) ? value : value ? [value] : []);

  const inferentialTests = [
    ...flatten(results.tests.normality),
    ...flatten(results.tests.tTests),
    ...flatten(results.tests.pairedTTest),
    ...flatten(results.tests.oneSampleTTests),
    ...flatten(results.tests.anova),
    ...flatten(results.tests.twoWayAnova),
    ...flatten(results.tests.welchAnova),
    ...flatten(results.tests.levene),
    ...flatten(results.tests.repeatedMeasuresAnova),
    ...flatten(results.tests.mannWhitney),
    ...flatten(results.tests.kruskalWallis),
    ...flatten(results.tests.chiSquareAndFisher),
  ];

  results.inferentialTests = inferentialTests;
  results.inferential = inferentialTests;
  results.correlations = results.tests.correlations ?? [];
  results.correlationMatrix = results.tests.correlations ?? [];
  results.visualization = {
    variableCards: profile.variableProfile,
    numericSummaryBars: fallbackValueColumns.map((col) => ({
      variable: col,
      mean: mean(numericVector(rows, col)),
      sd: sd(numericVector(rows, col)),
      n: numericVector(rows, col).length,
    })),
    pValueSummary: [
      ...inferentialTests,
      ...(results.univariable ?? []),
    ]
      .filter((r: any) => r && "pValue" in r)
      .map((r: any) => ({
        test: r.test,
        variable: r.variable ?? r.valueColumn ?? r.rowColumn ?? r.x ?? r.term,
        groupColumn: r.groupColumn,
        pValue: r.pValue,
        significant: Number.isFinite(r.pValue) && r.pValue < request.alpha,
      })),
    correlationHeatmap: results.tests.correlations ?? [],
  };

  return results;
}

function confirmationFromAny(row: RawRow): number {
  return safeNumber(
    row.Confirmatory_Diagnosis ??
      row["Confirmatory Diagnosis"] ??
      row.confirmatoryDiagnosis ??
      row.confirmatory_diagnosis ??
      row.I ??
      row.Infected ??
      row.Positive ??
      row.positive
  );
}

function normalizeTransmissionRows(rows: RawRow[]): ObsRow[] {
  return rows.map((r, index) => {
    const N = safeNumber(r.Total_Animals ?? r.N ?? r.Total ?? r.total_animals);
    const E = safeNumber(r.E ?? r.Exposed ?? r.exposed);
    const I = confirmationFromAny(r);
    const R = safeNumber(r.R ?? r.Recovered ?? r.recovered);
    const pendingCulled = safeNumber(r.Pending_Culled ?? r["Pending Culled"] ?? r.pending_culled);

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
      Pending_Culled: pendingCulled,
      Culled: safeNumber(r.Culled ?? r.culled),
      Pending_Quarantined: safeNumber(r.Pending_Quarantined ?? r["Pending Quarantined"] ?? r.pending_quarantined, Math.max(0, I - pendingCulled)),
      Quarantined: safeNumber(r.Quarantined ?? r.quarantined),
      New_Animals_Moved_In: safeNumber(r.New_Animals_Moved_In ?? r.MovedIn ?? r["Moved In"] ?? r.moved_in),
      New_Animals_Moved_Out: safeNumber(r.New_Animals_Moved_Out ?? r.MovedOut ?? r["Moved Out"] ?? r.moved_out),
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
      confirmatoryDiagnosis: point.confirmatoryDiagnosis ?? 0,
      totalAnimals: point.totalAnimals ?? 0,
      totalAbortions: point.totalAbortions ?? 0,
      estimatedR0: point.estimatedR0 ?? null,
      heatWeight: point.heatWeight ?? 1,
      popupHTML:
        `<strong>${point.farmId}</strong><br/>` +
        `${point.location || ""}<br/>` +
        `N: ${point.totalAnimals ?? 0}<br/>` +
        `I: ${point.infected ?? 0}<br/>` +
        `Confirmatory Diagnosis: ${point.confirmatoryDiagnosis ?? 0}<br/>` +
        `Prevalence: ${point.prevalence === null || point.prevalence === undefined ? "NA" : `${(point.prevalence * 100).toFixed(2)}%`}`,
    },
    geometry: { type: "Point", coordinates: [point.longitude, point.latitude] },
  };
}

function analyzeTransmission(rows: RawRow[], infectiousPeriodDays: number) {
  const normalized = normalizeTransmissionRows(rows);
  const farms = new Map<string, ObsRow[]>();

  normalized.forEach((row) => {
    if (!farms.has(row.Farm_ID)) farms.set(row.Farm_ID, []);
    farms.get(row.Farm_ID)!.push(row);
  });

  const warnings: string[] = [];
  normalized.forEach((r) => {
    if (!Number.isFinite(r.Latitude) || !Number.isFinite(r.Longitude)) warnings.push(`${r.Farm_ID} observation ${r.Observation}: missing/invalid coordinates for heatmap.`);
    if (r.S + r.E + r.I + r.R > r.Total_Animals) warnings.push(`${r.Farm_ID} observation ${r.Observation}: S+E+I+R exceeds total animals.`);
  });

  const farmSummaries = Array.from(farms.entries()).map(([farmId, farmRows]) => {
    const ordered = [...farmRows].sort((a, b) => a.Observation - b.Observation);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    const totalConfirmatoryDiagnosis = sum(ordered.map((r) => r.Confirmatory_Diagnosis));
    const totalAbortions = sum(ordered.map((r) => r.Abortion_Count));
    const apparentPrevalence = last.Total_Animals > 0 ? last.Confirmatory_Diagnosis / last.Total_Animals : null;
    const attackRate = first.S > 0 ? totalConfirmatoryDiagnosis / first.S : null;
    const growthRate = logGrowthRate(ordered.map((x) => x.I));
    const gamma = infectiousPeriodDays > 0 ? 1 / infectiousPeriodDays : null;
    const beta = growthRate !== null && gamma !== null ? growthRate + gamma : null;
    const estimatedR0 = beta !== null && gamma !== null && gamma > 0 ? beta / gamma : null;
    const heatWeight = Math.max(1, last.I) + Math.max(0, (apparentPrevalence ?? 0) * 100) + totalAbortions * 0.5;

    const mapPoint = {
      farmId,
      location: last.Location,
      latitude: last.Latitude,
      longitude: last.Longitude,
      prevalence: apparentPrevalence,
      prevalenceCategory: prevalenceCategory(apparentPrevalence),
      infected: last.I,
      exposed: last.E,
      susceptible: last.S,
      recovered: last.R,
      confirmatoryDiagnosis: last.Confirmatory_Diagnosis,
      totalAnimals: last.Total_Animals,
      totalAbortions,
      attackRate,
      estimatedR0,
      heatWeight,
    };

    return {
      farmId,
      observations: ordered.length,
      firstDate: first.Date,
      lastDate: last.Date,
      initialPopulation: first.Total_Animals,
      finalPopulation: last.Total_Animals,
      finalSEIR: { S: last.S, E: last.E, I: last.I, R: last.R },
      totalConfirmatoryDiagnosis,
      totalAbortions,
      apparentPrevalence,
      apparentPrevalenceCI95: wilsonCI(last.Confirmatory_Diagnosis, last.Total_Animals),
      attackRate,
      growthRate,
      beta,
      gamma,
      estimatedR0,
      prevalenceCategory: prevalenceCategory(apparentPrevalence),
      mapPoint,
      trend: ordered.map((r) => ({
        farmId,
        observation: r.Observation,
        date: r.Date,
        S: r.S,
        E: r.E,
        I: r.I,
        R: r.R,
        N: r.Total_Animals,
        confirmatoryDiagnosis: r.Confirmatory_Diagnosis,
        abortions: r.Abortion_Count,
      })),
      rows: ordered,
    };
  });

  const totalN = sum(farmSummaries.map((x: any) => x.finalPopulation));
  const totalS = sum(farmSummaries.map((x: any) => x.finalSEIR.S));
  const totalE = sum(farmSummaries.map((x: any) => x.finalSEIR.E));
  const totalI = sum(farmSummaries.map((x: any) => x.finalSEIR.I));
  const totalR = sum(farmSummaries.map((x: any) => x.finalSEIR.R));
  const allTrends = farmSummaries.flatMap((f: any) => f.trend);
  const maxObservation = Math.max(...allTrends.map((t: any) => t.observation), 0);

  const overallTrend = Array.from({ length: maxObservation }, (_, i) => {
    const obs = i + 1;
    const rowsAtObs = allTrends.filter((t: any) => t.observation === obs);
    return {
      observation: obs,
      S: sum(rowsAtObs.map((r: any) => r.S)),
      E: sum(rowsAtObs.map((r: any) => r.E)),
      I: sum(rowsAtObs.map((r: any) => r.I)),
      R: sum(rowsAtObs.map((r: any) => r.R)),
      N: sum(rowsAtObs.map((r: any) => r.N)),
      confirmatoryDiagnosis: sum(rowsAtObs.map((r: any) => r.confirmatoryDiagnosis)),
      abortions: sum(rowsAtObs.map((r: any) => r.abortions)),
    };
  });

  const mapPoints = farmSummaries
    .map((x: any) => x.mapPoint)
    .filter((p: any) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180);

  const heatmapGeoJSON = { type: "FeatureCollection", features: mapPoints.map(buildHeatFeature) };
  const mapCenter = mapPoints.length
    ? { longitude: mean(mapPoints.map((p: any) => p.longitude)), latitude: mean(mapPoints.map((p: any) => p.latitude)) }
    : { longitude: 90.4125, latitude: 23.8103 };

  return {
    totalFarms: farmSummaries.length,
    totalObservations: normalized.length,
    validation: { warnings, errors: [] },
    overallSEIR: {
      N: totalN,
      S: totalS,
      E: totalE,
      I: totalI,
      R: totalR,
      overallPrevalence: totalN > 0 ? totalI / totalN : null,
    },
    overallTotals: {
      totalConfirmatoryDiagnosis: sum(farmSummaries.map((x: any) => x.totalConfirmatoryDiagnosis)),
      totalAbortions: sum(farmSummaries.map((x: any) => x.totalAbortions)),
    },
    rankings: {
      byPrevalence: [...farmSummaries].sort((a: any, b: any) => (b.apparentPrevalence ?? 0) - (a.apparentPrevalence ?? 0)),
      byR0: [...farmSummaries].sort((a: any, b: any) => (b.estimatedR0 ?? 0) - (a.estimatedR0 ?? 0)),
    },
    visualization: {
      overallTrend,
      prevalenceBars: farmSummaries.map((f: any) => ({ farmId: f.farmId, prevalence: f.apparentPrevalence, category: f.prevalenceCategory })),
      r0Bars: farmSummaries.map((f: any) => ({ farmId: f.farmId, r0: f.estimatedR0 })),
      mapPoints,
      heatmapGeoJSON,
    },
    heatmapGeoJSON,
    mapConfig: {
      defaultView: "normal",
      availableViews: [
        { id: "normal", label: "Normal", mapboxStyle: "mapbox://styles/mapbox/dark-v11" },
        { id: "satellite", label: "Satellite", mapboxStyle: "mapbox://styles/mapbox/satellite-streets-v12" },
      ],
      center: mapCenter,
      bounds: mapPoints.length
        ? {
            minLongitude: Math.min(...mapPoints.map((p: any) => p.longitude)),
            maxLongitude: Math.max(...mapPoints.map((p: any) => p.longitude)),
            minLatitude: Math.min(...mapPoints.map((p: any) => p.latitude)),
            maxLatitude: Math.max(...mapPoints.map((p: any) => p.latitude)),
          }
        : null,
      heatmapLayer: {
        sourceId: "transmission-heatmap-source",
        layerId: "transmission-heatmap-layer",
        pointLayerId: "transmission-point-layer",
        weightProperty: "heatWeight",
        popupProperty: "popupHTML",
      },
    },
    farmSummaries,
  };
}

function normalizeNetworkRows(rows: RawRow[]): NetworkEdge[] {
  return rows
    .map((r, i) => ({
      edgeId: safeText(r.Edge_ID ?? r["Edge ID"] ?? r.edgeId ?? r.edge_id ?? r.id, `E${i + 1}`),
      source: safeText(r.From_Node ?? r["From Node"] ?? r.source ?? r.Source ?? r.from ?? r.From ?? r.origin ?? r.Origin),
      target: safeText(r.To_Node ?? r["To Node"] ?? r.target ?? r.Target ?? r.to ?? r.To ?? r.destination ?? r.Destination),
      edgeType: safeText(r.Edge_Type ?? r["Edge Type"] ?? r.type ?? r.Type ?? r.edgeType, "movement"),
      distanceKm: safeNumber(r.Road_Distance_km ?? r["Road Distance (km)"] ?? r.distanceKm ?? r.distance_km ?? r.Distance ?? r.distance, 0),
      movements: safeNumber(r.Avg_Movements ?? r["Avg Movements"] ?? r.movements ?? r.Movements ?? r.weight ?? r.Weight ?? r.frequency ?? r.Frequency, 1),
    }))
    .filter((e) => e.source && e.target);
}

function connectedComponents(nodes: string[], edges: NetworkEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((n) => adjacency.set(n, new Set()));
  edges.forEach((e) => {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  });

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
      adjacency.get(node)?.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      });
    }

    components.push(comp);
  });

  return components;
}

function shortestPathLengths(start: string, nodes: string[], edges: NetworkEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((n) => adjacency.set(n, new Set()));
  edges.forEach((e) => {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  });

  const dist = new Map<string, number>();
  nodes.forEach((n) => dist.set(n, Infinity));
  dist.set(start, 0);
  const queue = [start];

  while (queue.length) {
    const node = queue.shift()!;
    adjacency.get(node)?.forEach((neighbor) => {
      if (Number(dist.get(neighbor)) === Infinity) {
        dist.set(neighbor, Number(dist.get(node)) + 1);
        queue.push(neighbor);
      }
    });
  }

  return dist;
}

function analyzeNetwork(edges: NetworkEdge[]) {
  const cleanEdges = edges.filter((e) => e.source && e.target);
  const nodes = Array.from(new Set(cleanEdges.flatMap((e) => [e.source, e.target])));

  const degreeRows = nodes.map((node) => {
    const incident = cleanEdges.filter((e) => e.source === node || e.target === node);
    const outgoing = cleanEdges.filter((e) => e.source === node);
    const incoming = cleanEdges.filter((e) => e.target === node);
    const neighbors = new Set(incident.flatMap((e) => [e.source, e.target]).filter((x) => x !== node));
    const movementStrength = sum(incident.map((e) => e.movements));
    const outgoingStrength = sum(outgoing.map((e) => e.movements));
    const incomingStrength = sum(incoming.map((e) => e.movements));
    const meanDistanceKm = mean(incident.map((e) => e.distanceKm));
    const distances = shortestPathLengths(node, nodes, cleanEdges);
    const reachable = Array.from(distances.values()).filter((d) => Number.isFinite(d) && d > 0);
    const closeness = reachable.length ? reachable.length / sum(reachable) : 0;
    const hubScore = (neighbors.size + movementStrength / Math.max(1, cleanEdges.length)) * closeness;

    return {
      node,
      degree: neighbors.size,
      inDegree: new Set(incoming.map((e) => e.source)).size,
      outDegree: new Set(outgoing.map((e) => e.target)).size,
      movementStrength,
      incomingStrength,
      outgoingStrength,
      meanDistanceKm,
      closenessCentrality: closeness,
      hubScore,
      riskCategory: hubScore >= 5 || movementStrength >= 20 ? "high" : hubScore >= 2 || movementStrength >= 8 ? "moderate" : "low",
    };
  });

  const components = connectedComponents(nodes, cleanEdges);
  const nodeCount = nodes.length;
  const edgeCount = cleanEdges.length;
  const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1)) : 0;
  const maxMovements = Math.max(...cleanEdges.map((e) => e.movements), 1);
  const maxDegree = Math.max(...degreeRows.map((d) => d.degree), 1);

  const graphNodes = degreeRows.map((d, idx) => {
    const angle = (2 * Math.PI * idx) / Math.max(nodeCount, 1);
    const radius = 1 + d.degree / Math.max(maxDegree, 1);
    return {
      id: d.node,
      label: d.node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      size: 12 + 8 * (d.degree / maxDegree) + 10 * (d.movementStrength / Math.max(...degreeRows.map((x) => x.movementStrength), 1)),
      colorGroup: d.riskCategory,
      ...d,
    };
  });

  const graphEdges = cleanEdges.map((e) => ({
    id: e.edgeId,
    source: e.source,
    target: e.target,
    edgeType: e.edgeType,
    distanceKm: e.distanceKm,
    movements: e.movements,
    width: 1 + 6 * (e.movements / maxMovements),
    opacity: 0.25 + 0.75 * (e.movements / maxMovements),
    tooltip: `${e.source} → ${e.target} | ${e.edgeType} | ${e.movements} movements | ${e.distanceKm} km`,
    intensityScore: e.movements / Math.max(1, e.distanceKm || 1),
  }));

  const edgeTypes = Array.from(new Set(cleanEdges.map((e) => e.edgeType))).map((type) => {
    const subset = cleanEdges.filter((e) => e.edgeType === type);
    return {
      edgeType: type,
      edgeCount: subset.length,
      totalMovements: sum(subset.map((e) => e.movements)),
      meanDistanceKm: mean(subset.map((e) => e.distanceKm)),
      meanMovements: mean(subset.map((e) => e.movements)),
    };
  });

  const adjacencyMatrix = nodes.map((source) => ({
    source,
    values: nodes.map((target) => ({
      target,
      movements: sum(cleanEdges.filter((e) => e.source === source && e.target === target).map((e) => e.movements)),
      edgeCount: cleanEdges.filter((e) => e.source === source && e.target === target).length,
    })),
  }));

  const strongestEdges = [...graphEdges].sort((a, b) => b.movements - a.movements).slice(0, 20);
  const bottleneckCandidates = degreeRows
    .filter((d) => d.degree >= 2)
    .sort((a, b) => b.hubScore - a.hubScore)
    .slice(0, 15);

  return {
    nodes: graphNodes,
    edges: graphEdges,
    statistics: {
      nodeCount,
      edgeCount,
      density,
      totalMovements: sum(cleanEdges.map((e) => e.movements)),
      meanMovements: mean(cleanEdges.map((e) => e.movements)),
      meanDistanceKm: mean(cleanEdges.map((e) => e.distanceKm)),
      componentCount: components.length,
      largestComponentSize: Math.max(...components.map((c) => c.length), 0),
      highestDegreeNode: [...degreeRows].sort((a, b) => b.degree - a.degree)[0] ?? null,
      highestMovementNode: [...degreeRows].sort((a, b) => b.movementStrength - a.movementStrength)[0] ?? null,
      highestHubScoreNode: [...degreeRows].sort((a, b) => b.hubScore - a.hubScore)[0] ?? null,
      graphComplexityIndex: density * Math.log2(nodeCount + 1) * Math.log2(edgeCount + 1),
    },
    components,
    edgeTypeSummary: edgeTypes,
    adjacencyMatrix,
    visualization: {
      graph: { nodes: graphNodes, edges: graphEdges },
      degreeBars: [...degreeRows].sort((a, b) => b.degree - a.degree),
      movementStrengthBars: [...degreeRows].sort((a, b) => b.movementStrength - a.movementStrength),
      edgeTypeSummary: edgeTypes,
      movementHistogram: cleanEdges.map((e) => ({ edgeId: e.edgeId, movements: e.movements, distanceKm: e.distanceKm, edgeType: e.edgeType })),
      distanceMovementScatter: cleanEdges.map((e) => ({ edgeId: e.edgeId, x: e.distanceKm, y: e.movements, source: e.source, target: e.target, edgeType: e.edgeType })),
      strongestEdges,
      bottleneckCandidates,
      adjacencyMatrix,
    },
    interpretation: {
      hubs: bottleneckCandidates.length ? "Nodes with high hub scores may represent important movement-control or surveillance targets." : "No strong hub pattern detected.",
      density: density > 0.4 ? "Dense network; rapid spread through movements is plausible." : density > 0.15 ? "Moderately connected network." : "Sparse network; spread may depend on specific bridge nodes.",
    },
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const moduleName = safeText(formData.get("module")).toLowerCase();

    if (moduleName === "transmission") {
      const rows = await rowsFromFormData(formData);
      if (!rows.length) return NextResponse.json({ error: "No transmission rows or file found." }, { status: 400 });
      const infectiousPeriodDays = safeNumber(formData.get("infectiousPeriodDays"), 14);
      return NextResponse.json({
        module: "transmission",
        analysis: analyzeTransmission(rows, infectiousPeriodDays),
      });
    }

    if (moduleName === "risk") {
      const rows = await rowsFromFormData(formData);
      if (!rows.length) return NextResponse.json({ error: "No risk-analysis rows or file found." }, { status: 400 });

      const outcome =
        safeText(formData.get("outcome")) ||
        safeText(formData.get("dependentVariable")) ||
        safeText(formData.get("dependentColumn")) ||
        safeText(formData.get("outcomeColumn"));

      const predictors =
        parseList(formData.get("predictors")).length
          ? parseList(formData.get("predictors"))
          : parseList(formData.get("independentVariables")).length
          ? parseList(formData.get("independentVariables"))
          : parseList(formData.get("predictorColumns"));

      if (!outcome || predictors.length === 0) {
        return NextResponse.json({ error: "Risk analysis requires a dependent/outcome variable and at least one independent/predictor variable." }, { status: 400 });
      }

      const threshold = safeNumber(formData.get("threshold"), 0.2);
      return NextResponse.json({
        module: "risk",
        risk: analyzeRisk(rows, outcome, predictors, threshold, parseClarifications(formData), parseReferenceCategories(formData)),
      });
    }

    if (moduleName === "statistics") {
      const rows = await rowsFromFormData(formData);
      if (!rows.length) return NextResponse.json({ error: "No statistics rows or file found." }, { status: 400 });
      const statRequest = getStatisticalRequest(formData, rows);
      return NextResponse.json({
        module: "statistics",
        statistics: analyzeStatistics(rows, statRequest),
      });
    }

    if (moduleName === "network") {
      let edgeRows = parseRowsJson(formData.get("edges"));
      if (!edgeRows.length) edgeRows = await rowsFromFormData(formData);
      const edges = normalizeNetworkRows(edgeRows as RawRow[]);

      if (!edges.length) {
        return NextResponse.json(
          {
            error: "No network edges found. Expected columns: Edge_ID, From_Node, To_Node, Edge_Type, Road_Distance_km, Avg_Movements.",
          },
          { status: 400 }
        );
      }

      return NextResponse.json({
        module: "network",
        network: analyzeNetwork(edges),
      });
    }

    if (moduleName === "evolutionary") {
      return NextResponse.json(
        {
          module: "evolutionary",
          error: "EGStat-N evolutionary analysis was removed. Use QI-GeneX-N for genomic/evolutionary workflows.",
        },
        { status: 410 }
      );
    }

    return NextResponse.json({ error: `Unknown module: ${moduleName}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Analysis failed.",
        details: String(error),
      },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "EGStat-N analyze API",
    modules: ["transmission", "risk", "statistics", "network"],
    supportedStatisticsFields: [
      "tests",
      "valueColumns",
      "groupColumn",
      "tTestValueColumn",
      "tTestGroupColumn",
      "tTestGroupA",
      "tTestGroupB",
      "pairedColumnA",
      "pairedColumnB",
      "oneSampleMean",
      "anovaValueColumn",
      "anovaFactorColumns",
      "anovaPrimaryFactor",
      "anovaSecondaryFactor",
      "repeatedMeasureColumns",
      "outcomeColumn",
      "predictorColumns",
      "alpha",
      "clarifications",
    ],
    supportedRiskOutcomeTypes: ["binary categorical outcome", "multi-category categorical screening", "numeric dependent/outcome variable"],
    supportedNetworkColumns: ["Edge_ID", "From_Node", "To_Node", "Edge_Type", "Road_Distance_km", "Avg_Movements"],
  });
}

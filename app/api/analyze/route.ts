import { NextResponse } from "next/server";

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
  RBPT_Positive: number;
  iELISA_Positive: number;
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

function safeNumber(value: any, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return sum(values) / values.length;
}

function variance(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  return sum(values.map((v) => Math.pow(v - m, 2))) / (values.length - 1);
}

function sd(values: number[]): number | null {
  const v = variance(values);
  return v === null ? null : Math.sqrt(v);
}

function erf(x: number): number {
  const sign = x >= 0 ? 1 : -1;
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) *
      t *
      Math.exp(-ax * ax));
  return sign * y;
}

function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)));
}

function normalPValue(z: number): number {
  return Math.max(0, Math.min(1, 2 * (1 - normalCDF(Math.abs(z)))));
}

function chiSquarePValueDf1(x: number | null): number | null {
  if (x === null || !Number.isFinite(x)) return null;
  return Math.max(0, Math.min(1, 1 - erf(Math.sqrt(x / 2))));
}

function wilsonCI(k: number, n: number, z = 1.96) {
  if (n <= 0) return { lower: null, upper: null };
  const phat = k / n;
  const denom = 1 + (z * z) / n;
  const centre = phat + (z * z) / (2 * n);
  const root = z * Math.sqrt((phat * (1 - phat) + (z * z) / (4 * n)) / n);
  return {
    lower: Math.max(0, (centre - root) / denom),
    upper: Math.min(1, (centre + root) / denom),
  };
}

function parseCSV(text: string): RawRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());

  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim());
    const row: RawRow = {};
    headers.forEach((h, i) => {
      const raw = values[i] ?? "";
      const n = Number(raw);
      row[h] = raw !== "" && Number.isFinite(n) ? n : raw;
    });
    return row;
  });
}

function normalizeImportedRows(rows: RawRow[]): ObsRow[] {
  return rows.map((r, index) => {
    const total = safeNumber(r.Total_Animals ?? r.N ?? r.Total ?? r.total_animals);
    const E = safeNumber(r.E ?? r.Exposed);
    const I = safeNumber(r.I ?? r.iELISA_Positive ?? r.IELISA_Positive ?? r.Positive);
    const R = safeNumber(r.R ?? r.Recovered);
    const pendingCulled = safeNumber(r.Pending_Culled ?? r["Pending Culled"]);
    const pendingQuarantined = safeNumber(
      r.Pending_Quarantined ?? r["Pending Quarantined"],
      Math.max(0, I - pendingCulled)
    );

    return {
      Farm_ID: String(r.Farm_ID ?? r.Farm ?? r.farm_id ?? "Farm_1"),
      Location: String(r.Location ?? ""),
      Latitude: safeNumber(r.Latitude),
      Longitude: safeNumber(r.Longitude),
      Date: String(r.Date ?? today()),
      Observation: safeNumber(r.Observation ?? r.Obs, index + 1),
      Total_Animals: total,
      S: safeNumber(r.S, Math.max(0, total - (E + I + R))),
      E,
      I,
      R,
      RBPT_Positive: safeNumber(r.RBPT_Positive ?? r.RBPT ?? r["RBPT+"]),
      iELISA_Positive: safeNumber(r.iELISA_Positive ?? r.IELISA_Positive ?? r["IELISA+"] ?? I),
      Abortion_Count: safeNumber(r.Abortion_Count ?? r.Abortions),
      Pending_Culled: pendingCulled,
      Culled: safeNumber(r.Culled),
      Pending_Quarantined: pendingQuarantined,
      Quarantined: safeNumber(r.Quarantined),
      New_Animals_Moved_In: safeNumber(r.New_Animals_Moved_In ?? r.MovedIn ?? r["Moved In"]),
      New_Animals_Moved_Out: safeNumber(r.New_Animals_Moved_Out ?? r.MovedOut ?? r["Moved Out"]),
      Susceptible_In_From_MovedIn: safeNumber(r.Susceptible_In_From_MovedIn ?? r.SusIn),
      Susceptible_Out_From_MovedOut: safeNumber(r.Susceptible_Out_From_MovedOut ?? r.SusOut),
    };
  });
}

function logGrowthRate(values: number[]) {
  const usable = values.map((v, i) => ({ v, i })).filter((x) => x.v > 0);
  if (usable.length < 2) return null;

  const x = usable.map((p) => p.i);
  const y = usable.map((p) => Math.log(p.v));
  const xMean = mean(x);
  const yMean = mean(y);
  if (xMean === null || yMean === null) return null;

  const numerator = sum(x.map((xi, i) => (xi - xMean) * (y[i] - yMean)));
  const denominator = sum(x.map((xi) => Math.pow(xi - xMean, 2)));
  if (denominator === 0) return null;

  return numerator / denominator;
}

function analyzeTransmission(rows: ObsRow[], infectiousPeriodDays: number) {
  const farms = new Map<string, ObsRow[]>();

  rows.forEach((row) => {
    if (!farms.has(row.Farm_ID)) farms.set(row.Farm_ID, []);
    farms.get(row.Farm_ID)!.push(row);
  });

  const farmSummaries = Array.from(farms.entries()).map(([farmId, farmRows]) => {
    const ordered = [...farmRows].sort((a, b) => a.Observation - b.Observation);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];

    const totalIELISA = sum(ordered.map((r) => r.iELISA_Positive));
    const totalI = sum(ordered.map((r) => r.I));
    const totalAbortions = sum(ordered.map((r) => r.Abortion_Count));
    const totalCulled = sum(ordered.map((r) => r.Culled));
    const totalQuarantined = sum(ordered.map((r) => r.Quarantined));
    const totalMovedIn = sum(ordered.map((r) => r.New_Animals_Moved_In));
    const totalMovedOut = sum(ordered.map((r) => r.New_Animals_Moved_Out));
    const netMovement = totalMovedIn - totalMovedOut;

    const apparentPrevalence =
      last.Total_Animals > 0 ? last.iELISA_Positive / last.Total_Animals : null;

    const infectionPrevalence =
      last.Total_Animals > 0 ? last.I / last.Total_Animals : null;

    const attackRate = first.S > 0 ? totalIELISA / first.S : null;

    const abortionRate =
      last.Total_Animals > 0 ? totalAbortions / last.Total_Animals : null;

    const r = logGrowthRate(ordered.map((x) => x.I));
    const gamma = infectiousPeriodDays > 0 ? 1 / infectiousPeriodDays : null;
    const beta = r !== null && gamma !== null ? r + gamma : null;
    const estimatedR0 =
      beta !== null && gamma !== null && gamma > 0 ? beta / gamma : null;

    const doublingTimeDays = r !== null && r > 0 ? Math.log(2) / r : null;
    const peak = ordered.reduce((best, row) => (row.I > best.I ? row : best), ordered[0]);

    return {
      farmId,
      observations: ordered.length,
      firstDate: first.Date,
      lastDate: last.Date,
      initialPopulation: first.Total_Animals,
      finalPopulation: last.Total_Animals,
      finalSEIR: { S: last.S, E: last.E, I: last.I, R: last.R },
      totalIELISAPositive: totalIELISA,
      totalInfectedSum: totalI,
      totalAbortions,
      totalCulled,
      totalQuarantined,
      totalMovedIn,
      totalMovedOut,
      netMovement,
      apparentPrevalence,
      infectionPrevalence,
      apparentPrevalenceCI95: wilsonCI(last.iELISA_Positive, last.Total_Animals),
      attackRate,
      abortionRate,
      growthRateR: r,
      infectiousPeriodDays,
      beta,
      gamma,
      estimatedR0,
      doublingTimeDays,
      meanS: mean(ordered.map((r) => r.S)),
      meanE: mean(ordered.map((r) => r.E)),
      meanI: mean(ordered.map((r) => r.I)),
      meanR: mean(ordered.map((r) => r.R)),
      sdI: sd(ordered.map((r) => r.I)),
      peakInfection: {
        observation: peak.Observation,
        date: peak.Date,
        I: peak.I,
      },
      lastObservationStatus: {
        pendingCulled: last.Pending_Culled,
        pendingQuarantined: last.Pending_Quarantined,
        culledAppliedThisObservation: last.Culled,
        quarantinedAppliedThisObservation: last.Quarantined,
      },
      interpretation: {
        apparentPrevalence:
          apparentPrevalence === null
            ? "Not available"
            : `${(apparentPrevalence * 100).toFixed(2)}% apparent prevalence by iELISA.`,
        attackRate:
          attackRate === null
            ? "Not available"
            : `${(attackRate * 100).toFixed(2)}% cumulative attack rate using initial susceptible animals.`,
        estimatedR0:
          estimatedR0 === null
            ? "Not enough positive infected observations for R0 estimation."
            : estimatedR0 > 1
            ? "R0 > 1 suggests sustained transmission potential."
            : "R0 ≤ 1 suggests limited sustained transmission potential.",
      },
      rows: ordered,
    };
  });

  return {
    totalFarms: farmSummaries.length,
    totalObservations: rows.length,
    farmSummaries,
  };
}

function isMissing(v: any) {
  return v === null || v === undefined || v === "";
}

function uniqueValues(rows: RawRow[], col: string) {
  return Array.from(new Set(rows.map((r) => r[col]).filter((v) => !isMissing(v)))).map(String);
}

function isNumericColumn(rows: RawRow[], col: string) {
  const vals = rows.map((r) => r[col]).filter((v) => !isMissing(v));
  if (vals.length === 0) return false;
  return vals.every((v) => Number.isFinite(Number(v)));
}

function binaryEncodeOutcome(rows: RawRow[], outcome: string) {
  const vals = rows.map((r) => r[outcome]).filter((v) => !isMissing(v));
  const uniques = Array.from(new Set(vals.map(String)));

  if (uniques.length !== 2) {
    return null;
  }

  const positive = uniques.includes("1") ? "1" : uniques[1];
  const negative = uniques.find((v) => v !== positive) ?? uniques[0];

  const y = rows.map((r) => String(r[outcome]) === positive ? 1 : 0);

  return { y, positive, negative };
}

function chiSquare2x2(a0: number, b0: number, c0: number, d0: number) {
  const a = a0;
  const b = b0;
  const c = c0;
  const d = d0;
  const total = a + b + c + d;
  if (total === 0) return null;

  const numerator = total * Math.pow(a * d - b * c, 2);
  const denominator = (a + b) * (c + d) * (a + c) * (b + d);
  if (denominator === 0) return null;
  return numerator / denominator;
}

function oddsRatioCI(a0: number, b0: number, c0: number, d0: number) {
  const a = a0 + 0.5;
  const b = b0 + 0.5;
  const c = c0 + 0.5;
  const d = d0 + 0.5;

  const or = (a * d) / (b * c);
  const se = Math.sqrt(1 / a + 1 / b + 1 / c + 1 / d);
  const lower = Math.exp(Math.log(or) - 1.96 * se);
  const upper = Math.exp(Math.log(or) + 1.96 * se);

  return { oddsRatio: or, ciLower: lower, ciUpper: upper };
}

function riskRatioCI(a0: number, b0: number, c0: number, d0: number) {
  const a = a0 + 0.5;
  const b = b0 + 0.5;
  const c = c0 + 0.5;
  const d = d0 + 0.5;

  const riskExposed = a / (a + b);
  const riskUnexposed = c / (c + d);
  const rr = riskExposed / riskUnexposed;

  const se = Math.sqrt(1 / a - 1 / (a + b) + 1 / c - 1 / (c + d));
  const lower = Math.exp(Math.log(rr) - 1.96 * se);
  const upper = Math.exp(Math.log(rr) + 1.96 * se);

  return { riskRatio: rr, rrLower: lower, rrUpper: upper };
}

function analyzeCategoricalRisk(rows: RawRow[], outcome: string, predictor: string) {
  const enc = binaryEncodeOutcome(rows, outcome);
  if (!enc) {
    return {
      variable: predictor,
      test: "failed",
      pValue: 1,
      message: "Outcome must contain exactly two categories for risk-factor analysis.",
    };
  }

  const levels = uniqueValues(rows, predictor);
  const level = levels.includes("1") ? "1" : levels[0];

  const valid = rows.filter((r) => !isMissing(r[outcome]) && !isMissing(r[predictor]));

  const a = valid.filter((r) => String(r[predictor]) === level && String(r[outcome]) === enc.positive).length;
  const b = valid.filter((r) => String(r[predictor]) === level && String(r[outcome]) !== enc.positive).length;
  const c = valid.filter((r) => String(r[predictor]) !== level && String(r[outcome]) === enc.positive).length;
  const d = valid.filter((r) => String(r[predictor]) !== level && String(r[outcome]) !== enc.positive).length;

  const chiSquare = chiSquare2x2(a, b, c, d);
  const pValue = chiSquarePValueDf1(chiSquare) ?? 1;
  const or = oddsRatioCI(a, b, c, d);
  const rr = riskRatioCI(a, b, c, d);

  return {
    variable: predictor,
    variableType: "categorical",
    levelCompared: level,
    test: "chi-square 2x2",
    pValue,
    chiSquare,
    oddsRatio: or.oddsRatio,
    ciLower: or.ciLower,
    ciUpper: or.ciUpper,
    riskRatio: rr.riskRatio,
    rrLower: rr.rrLower,
    rrUpper: rr.rrUpper,
    table: { exposedPositive: a, exposedNegative: b, unexposedPositive: c, unexposedNegative: d },
    frequency: `${level} vs all other categories`,
    interpretation:
      pValue < 0.05
        ? or.oddsRatio > 1
          ? "Significant possible risk factor"
          : "Significant possible protective factor"
        : "Not statistically significant",
  };
}

function analyzeContinuousRisk(rows: RawRow[], outcome: string, predictor: string) {
  const enc = binaryEncodeOutcome(rows, outcome);
  if (!enc) {
    return {
      variable: predictor,
      test: "failed",
      pValue: 1,
      message: "Outcome must contain exactly two categories.",
    };
  }

  const positive = rows
    .filter((r) => String(r[outcome]) === enc.positive && Number.isFinite(Number(r[predictor])))
    .map((r) => Number(r[predictor]));

  const negative = rows
    .filter((r) => String(r[outcome]) !== enc.positive && Number.isFinite(Number(r[predictor])))
    .map((r) => Number(r[predictor]));

  const m1 = mean(positive);
  const m0 = mean(negative);
  const s1 = sd(positive);
  const s0 = sd(negative);

  if (m1 === null || m0 === null || s1 === null || s0 === null || positive.length < 2 || negative.length < 2) {
    return {
      variable: predictor,
      variableType: "continuous",
      test: "failed",
      pValue: 1,
      message: "Insufficient continuous data.",
    };
  }

  const se = Math.sqrt((s1 * s1) / positive.length + (s0 * s0) / negative.length);
  const z = se > 0 ? (m1 - m0) / se : 0;
  const pValue = normalPValue(z);
  const pooled = Math.sqrt(((positive.length - 1) * s1 * s1 + (negative.length - 1) * s0 * s0) / (positive.length + negative.length - 2));
  const smd = pooled > 0 ? (m1 - m0) / pooled : 0;

  return {
    variable: predictor,
    variableType: "continuous",
    test: "group mean comparison",
    pValue,
    meanPositive: m1,
    meanNegative: m0,
    sdPositive: s1,
    sdNegative: s0,
    standardizedMeanDifference: smd,
    oddsRatio: Math.exp(smd),
    ciLower: Math.exp(smd - 1.96 * Math.abs(se || 0.01)),
    ciUpper: Math.exp(smd + 1.96 * Math.abs(se || 0.01)),
    frequency: `positive n=${positive.length}; negative n=${negative.length}`,
    interpretation:
      pValue < 0.05
        ? "Significant mean difference between outcome groups"
        : "Not statistically significant",
  };
}

function sigmoid(x: number) {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, x))));
}

function buildDesignMatrix(rows: RawRow[], outcome: string, predictors: string[]) {
  const enc = binaryEncodeOutcome(rows, outcome);
  if (!enc) return null;

  const validRows = rows.filter((r) => !isMissing(r[outcome]));
  const y = validRows.map((r) => (String(r[outcome]) === enc.positive ? 1 : 0));
  const features: { name: string; values: number[] }[] = [];

  predictors.forEach((p) => {
    if (isNumericColumn(validRows, p)) {
      const values = validRows.map((r) => safeNumber(r[p]));
      const m = mean(values) ?? 0;
      const s = sd(values) ?? 1;
      features.push({
        name: p,
        values: values.map((v) => (s > 0 ? (v - m) / s : 0)),
      });
    } else {
      const levels = uniqueValues(validRows, p);
      levels.slice(1, 10).forEach((level) => {
        features.push({
          name: `${p}_${level}`,
          values: validRows.map((r) => (String(r[p]) === level ? 1 : 0)),
        });
      });
    }
  });

  const X = validRows.map((_, i) => [1, ...features.map((f) => f.values[i])]);
  return { X, y, featureNames: ["Intercept", ...features.map((f) => f.name)], positive: enc.positive };
}

function logisticRegression(rows: RawRow[], outcome: string, predictors: string[]) {
  const design = buildDesignMatrix(rows, outcome, predictors);
  if (!design || design.X.length < 5 || design.featureNames.length < 2) {
    return null;
  }

  const { X, y, featureNames } = design;
  const p = featureNames.length;
  const beta = new Array(p).fill(0);
  const lr = 0.03;
  const lambda = 0.01;

  for (let iter = 0; iter < 1200; iter++) {
    const grad = new Array(p).fill(0);

    for (let i = 0; i < X.length; i++) {
      const eta = sum(X[i].map((xij, j) => xij * beta[j]));
      const pred = sigmoid(eta);
      for (let j = 0; j < p; j++) {
        grad[j] += (pred - y[i]) * X[i][j];
      }
    }

    for (let j = 0; j < p; j++) {
      const penalty = j === 0 ? 0 : lambda * beta[j];
      beta[j] -= lr * (grad[j] / X.length + penalty);
    }
  }

  const preds = X.map((row) => sigmoid(sum(row.map((x, j) => x * beta[j]))));
  const predClass = preds.map((v) => (v >= 0.5 ? 1 : 0));
  const correct = predClass.filter((v, i) => v === y[i]).length;
  const accuracy = correct / y.length;

  const results = featureNames.slice(1).map((name, idx) => {
    const j = idx + 1;
    const xj = X.map((r) => r[j]);
    const info = sum(xj.map((x, i) => preds[i] * (1 - preds[i]) * x * x));
    const se = info > 0 ? Math.sqrt(1 / info) : 1;
    const z = beta[j] / se;
    const pValue = normalPValue(z);
    return {
      variable: name,
      coefficient: beta[j],
      oddsRatio: Math.exp(beta[j]),
      ciLower: Math.exp(beta[j] - 1.96 * se),
      ciUpper: Math.exp(beta[j] + 1.96 * se),
      stdError: se,
      z,
      pValue,
    };
  });

  return {
    method: "regularized logistic regression",
    nObservations: y.length,
    nVariables: results.length,
    accuracy,
    results,
  };
}

function analyzeRiskFactors(rows: RawRow[], outcome: string, predictors: string[], threshold: number) {
  if (!outcome || predictors.length === 0) {
    return {
      error: "Please provide outcome and predictor variables.",
      univariable: [],
      selectedVariables: [],
      multivariable: null,
      visualizations: null,
    };
  }

  const univariable = predictors.map((p) => {
    const missing = rows.filter((r) => isMissing(r[p])).length;
    if (missing > rows.length * 0.5) {
      return {
        variable: p,
        test: "skipped",
        pValue: 1,
        message: "Skipped because more than 50% values are missing.",
      };
    }

    if (isNumericColumn(rows, p)) {
      const unique = uniqueValues(rows, p);
      if (unique.length <= 10) return analyzeCategoricalRisk(rows, outcome, p);
      return analyzeContinuousRisk(rows, outcome, p);
    }

    return analyzeCategoricalRisk(rows, outcome, p);
  });

  const selectedVariables = univariable
    .filter((r: any) => r.test !== "failed" && r.test !== "skipped" && r.pValue < threshold)
    .map((r: any) => r.variable);

  const multivariable =
    selectedVariables.length > 0
      ? logisticRegression(rows, outcome, selectedVariables)
      : null;

  const ranked = [...univariable]
    .filter((r: any) => Number.isFinite(r.pValue))
    .sort((a: any, b: any) => a.pValue - b.pValue);

  const significantCount = univariable.filter((r: any) => r.pValue < 0.05).length;
  const candidateCount = univariable.filter((r: any) => r.pValue < threshold).length;

  return {
    outcome,
    predictors,
    threshold,
    univariable,
    selectedVariables,
    multivariable,
    summary: {
      totalPredictors: predictors.length,
      significantAt005: significantCount,
      selectedForMultivariable: candidateCount,
      strongestPredictor: ranked[0] ?? null,
    },
    visualizations: {
      pValueBars: univariable.map((r: any) => ({
        variable: r.variable,
        pValue: r.pValue,
        significant: r.pValue < 0.05,
        selected: r.pValue < threshold,
      })),
      forestData: univariable
        .filter((r: any) => Number.isFinite(r.oddsRatio))
        .map((r: any) => ({
          variable: r.variable,
          oddsRatio: r.oddsRatio,
          ciLower: r.ciLower,
          ciUpper: r.ciUpper,
          pValue: r.pValue,
        })),
      multivariableForest:
        multivariable?.results?.map((r: any) => ({
          variable: r.variable,
          oddsRatio: r.oddsRatio,
          ciLower: r.ciLower,
          ciUpper: r.ciUpper,
          pValue: r.pValue,
        })) ?? [],
    },
    interpretation:
      selectedVariables.length > 0
        ? `${selectedVariables.length} variable(s) passed the p-value threshold for multivariable modeling.`
        : "No variables passed the selected p-value threshold for multivariable modeling.",
  };
}

function describeDataset(rows: RawRow[]) {
  if (rows.length === 0) return null;
  const columns = Object.keys(rows[0]);
  return {
    rows: rows.length,
    columns: columns.length,
    columnNames: columns,
    variableTypes: columns.map((c) => ({
      variable: c,
      type: isNumericColumn(rows, c) ? "numeric" : "categorical/text",
      uniqueValues: uniqueValues(rows, c).length,
      missing: rows.filter((r) => isMissing(r[c])).length,
    })),
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const moduleName = String(formData.get("module") || "transmission");

    if (moduleName === "risk") {
      const file = formData.get("file") as File | null;
      const outcome = String(formData.get("outcome") || "").trim();
      const predictorsRaw = String(formData.get("predictors") || "").trim();
      const threshold = safeNumber(formData.get("threshold"), 0.2);

      if (!file) {
        return NextResponse.json({ error: "No CSV file uploaded." }, { status: 400 });
      }

      const text = await file.text();
      const rows = parseCSV(text);
      const predictors = predictorsRaw
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);

      const dataset = describeDataset(rows);
      const risk = analyzeRiskFactors(rows, outcome, predictors, threshold);

      return NextResponse.json({
        status: "success",
        module: "Risk Factor Analysis",
        rows: rows.length,
        dataset,
        risk,
        notes: [
          "Univariable analysis uses chi-square 2x2 for binary/categorical predictors and group mean comparison for continuous predictors.",
          "Variables below the p-value threshold are automatically selected for multivariable logistic regression.",
          "The web version uses lightweight TypeScript statistics suitable for Vercel. Advanced Cox models, XGBoost, and full statsmodels-style output require a Python backend.",
        ],
      });
    }

    const mode = String(formData.get("mode") || "import");
    const infectiousPeriodDays = safeNumber(formData.get("infectiousPeriodDays"), 14);

    let rows: ObsRow[] = [];

    if (mode === "import") {
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No CSV file uploaded." }, { status: 400 });
      }

      const text = await file.text();
      rows = normalizeImportedRows(parseCSV(text));
    } else {
      const rowsText = String(formData.get("rows") || "[]");
      rows = JSON.parse(rowsText) as ObsRow[];
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No observation data found." }, { status: 400 });
    }

    return NextResponse.json({
      status: "success",
      module: "Transmission Dynamics",
      mode,
      rows: rows.length,
      analysis: analyzeTransmission(rows, infectiousPeriodDays),
      notes: [
        "First observation has Culled=0 and Quarantined=0.",
        "Each next observation applies previous Pending_Culled and Pending_Quarantined.",
        "Total animals are recalculated as previous N - applied culled + moved in - moved out.",
        "S is recalculated as N - (E + I + R).",
      ],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Analysis failed." },
      { status: 500 }
    );
  }
}
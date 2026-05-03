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

type NetworkEdge = {
  edgeId: string;
  source: string;
  target: string;
  edgeType: string;
  distanceKm: number;
  movements: number;
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

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function mean(values: number[]): number | null {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length === 0) return null;
  return sum(usable) / usable.length;
}

function median(values: number[]): number | null {
  const usable = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (usable.length === 0) return null;
  const mid = Math.floor(usable.length / 2);
  return usable.length % 2 === 0 ? (usable[mid - 1] + usable[mid]) / 2 : usable[mid];
}

function variance(values: number[]): number | null {
  const usable = values.filter((v) => Number.isFinite(v));
  if (usable.length < 2) return null;

  const m = mean(usable);
  if (m === null) return null;

  return sum(usable.map((v) => Math.pow(v - m, 2))) / (usable.length - 1);
}

function sd(values: number[]): number | null {
  const v = variance(values);
  return v === null ? null : Math.sqrt(v);
}

function quantile(values: number[], q: number): number | null {
  const usable = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (usable.length === 0) return null;

  const pos = (usable.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;

  if (usable[base + 1] !== undefined) {
    return usable[base] + rest * (usable[base + 1] - usable[base]);
  }

  return usable[base];
}

function describeNumeric(values: number[]) {
  const usable = values.filter((v) => Number.isFinite(v));

  return {
    n: usable.length,
    mean: mean(usable),
    median: median(usable),
    sd: sd(usable),
    variance: variance(usable),
    min: usable.length ? Math.min(...usable) : null,
    q1: quantile(usable, 0.25),
    q3: quantile(usable, 0.75),
    max: usable.length ? Math.max(...usable) : null,
    sum: sum(usable),
  };
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
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
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

function splitCSVLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
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

function isMissing(v: any) {
  return v === null || v === undefined || v === "";
}

function uniqueValues(rows: RawRow[], col: string) {
  return Array.from(
    new Set(rows.map((r) => r[col]).filter((v) => !isMissing(v)))
  ).map(String);
}

function isNumericColumn(rows: RawRow[], col: string) {
  const vals = rows.map((r) => r[col]).filter((v) => !isMissing(v));
  if (vals.length === 0) return false;
  return vals.every((v) => Number.isFinite(Number(v)));
}

function missingCount(rows: RawRow[], col: string) {
  return rows.filter((r) => isMissing(r[col])).length;
}

function pearsonCorrelation(x: number[], y: number[]) {
  const pairs = x
    .map((v, i) => [v, y[i]])
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));

  if (pairs.length < 3) return null;

  const xs = pairs.map((p) => p[0]);
  const ys = pairs.map((p) => p[1]);

  const mx = mean(xs);
  const my = mean(ys);

  if (mx === null || my === null) return null;

  const numerator = sum(xs.map((v, i) => (v - mx) * (ys[i] - my)));
  const denominator = Math.sqrt(
    sum(xs.map((v) => Math.pow(v - mx, 2))) *
      sum(ys.map((v) => Math.pow(v - my, 2)))
  );

  if (denominator === 0) return null;

  return numerator / denominator;
}

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number | null {
  if (![lat1, lon1, lat2, lon2].every((x) => Number.isFinite(x))) return null;

  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

function normalizeImportedRows(rows: RawRow[]): ObsRow[] {
  const grouped = new Map<string, RawRow[]>();

  rows.forEach((r) => {
    const farm = safeText(r.Farm_ID ?? r.Farm ?? r.farm_id ?? "Farm_1");
    if (!grouped.has(farm)) grouped.set(farm, []);
    grouped.get(farm)!.push(r);
  });

  const output: ObsRow[] = [];

  grouped.forEach((farmRows, farmId) => {
    const orderedRaw = [...farmRows].sort(
      (a, b) =>
        safeNumber(a.Observation ?? a.Obs, 999999) -
        safeNumber(b.Observation ?? b.Obs, 999999)
    );

    orderedRaw.forEach((r, index) => {
      const N = safeNumber(
        r.Total_Animals ?? r.N ?? r.Total ?? r.total_animals
      );
      const E = safeNumber(r.E ?? r.Exposed);
      const I = safeNumber(
        r.I ?? r.iELISA_Positive ?? r.IELISA_Positive ?? r.Positive
      );
      const R = safeNumber(r.R ?? r.Recovered);

      const pendingCulled = safeNumber(
        r.Pending_Culled ?? r["Pending Culled"]
      );

      const pendingQuarantined = safeNumber(
        r.Pending_Quarantined ?? r["Pending Quarantined"],
        Math.max(0, I - pendingCulled)
      );

      output.push({
        Farm_ID: farmId,
        Location: safeText(r.Location),
        Latitude: safeNumber(r.Latitude ?? r.lat),
        Longitude: safeNumber(r.Longitude ?? r.lon ?? r.lng),
        Date: safeText(r.Date, today()),
        Observation: safeNumber(r.Observation ?? r.Obs, index + 1),
        Total_Animals: N,
        S: safeNumber(r.S, Math.max(0, N - (E + I + R))),
        E,
        I,
        R,
        RBPT_Positive: safeNumber(r.RBPT_Positive ?? r.RBPT ?? r["RBPT+"]),
        iELISA_Positive: safeNumber(
          r.iELISA_Positive ?? r.IELISA_Positive ?? r["IELISA+"] ?? I
        ),
        Abortion_Count: safeNumber(
          r.Abortion_Count ??
            r.Abortions ??
            r.Initial_Abortion_Count ??
            r["Initial Abortion Count"]
        ),
        Pending_Culled: pendingCulled,
        Culled: safeNumber(r.Culled),
        Pending_Quarantined: pendingQuarantined,
        Quarantined: safeNumber(r.Quarantined),
        New_Animals_Moved_In: safeNumber(
          r.New_Animals_Moved_In ?? r.MovedIn ?? r["Moved In"]
        ),
        New_Animals_Moved_Out: safeNumber(
          r.New_Animals_Moved_Out ?? r.MovedOut ?? r["Moved Out"]
        ),
        Susceptible_In_From_MovedIn: safeNumber(
          r.Susceptible_In_From_MovedIn ?? r.SusIn
        ),
        Susceptible_Out_From_MovedOut: safeNumber(
          r.Susceptible_Out_From_MovedOut ?? r.SusOut
        ),
      });
    });
  });

  return output;
}

function validateTransmissionRows(rows: ObsRow[]) {
  const warnings: string[] = [];
  const errors: string[] = [];

  rows.forEach((r) => {
    if (!r.Farm_ID) errors.push(`Observation ${r.Observation}: Farm_ID missing.`);

    if (r.Total_Animals < 0) {
      errors.push(`${r.Farm_ID} observation ${r.Observation}: N is negative.`);
    }

    if (r.S < 0) {
      warnings.push(`${r.Farm_ID} observation ${r.Observation}: S is negative.`);
    }

    if (r.S + r.E + r.I + r.R > r.Total_Animals) {
      warnings.push(
        `${r.Farm_ID} observation ${r.Observation}: S+E+I+R exceeds N.`
      );
    }

    if (!r.Latitude || !r.Longitude) {
      warnings.push(`${r.Farm_ID}: latitude/longitude missing for map.`);
    }
  });

  return { warnings, errors };
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

function prevalenceCategory(p: number | null) {
  if (p === null) return "unknown";
  if (p === 0) return "zero";
  if (p < 0.05) return "low";
  if (p < 0.15) return "moderate";
  if (p < 0.3) return "high";
  return "very_high";
}

function analyzeTransmission(rows: ObsRow[], infectiousPeriodDays: number) {
  const validation = validateTransmissionRows(rows);
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
    const totalPendingCulled = sum(ordered.map((r) => r.Pending_Culled));
    const totalQuarantined = sum(ordered.map((r) => r.Quarantined));
    const totalPendingQuarantined = sum(
      ordered.map((r) => r.Pending_Quarantined)
    );
    const totalMovedIn = sum(ordered.map((r) => r.New_Animals_Moved_In));
    const totalMovedOut = sum(ordered.map((r) => r.New_Animals_Moved_Out));
    const netMovement = totalMovedIn - totalMovedOut;

    const apparentPrevalence =
      last.Total_Animals > 0 ? last.iELISA_Positive / last.Total_Animals : null;

    const infectionPrevalence =
      last.Total_Animals > 0 ? last.I / last.Total_Animals : null;

    const cumulativeApparentPrevalence =
      last.Total_Animals > 0 ? totalIELISA / last.Total_Animals : null;

    const attackRate = first.S > 0 ? totalIELISA / first.S : null;

    const abortionRate =
      last.Total_Animals > 0 ? totalAbortions / last.Total_Animals : null;

    const cullingRate =
      first.Total_Animals > 0 ? totalCulled / first.Total_Animals : null;

    const quarantineRate =
      first.Total_Animals > 0 ? totalQuarantined / first.Total_Animals : null;

    const r = logGrowthRate(ordered.map((x) => x.I));
    const gamma = infectiousPeriodDays > 0 ? 1 / infectiousPeriodDays : null;
    const beta = r !== null && gamma !== null ? r + gamma : null;
    const estimatedR0 =
      beta !== null && gamma !== null && gamma > 0 ? beta / gamma : null;

    const doublingTimeDays = r !== null && r > 0 ? Math.log(2) / r : null;

    const peak = ordered.reduce(
      (best, row) => (row.I > best.I ? row : best),
      ordered[0]
    );

    const transmissionIntensityScore =
      (apparentPrevalence ?? 0) * 40 +
      (attackRate ?? 0) * 35 +
      (estimatedR0 && estimatedR0 > 1 ? Math.min(estimatedR0, 5) * 5 : 0) +
      (abortionRate ?? 0) * 20;

    return {
      farmId,
      observations: ordered.length,
      firstDate: first.Date,
      lastDate: last.Date,
      initialPopulation: first.Total_Animals,
      finalPopulation: last.Total_Animals,
      populationChange: last.Total_Animals - first.Total_Animals,
      finalSEIR: {
        S: last.S,
        E: last.E,
        I: last.I,
        R: last.R,
      },
      initialAbortionCount: first.Abortion_Count,
      totalIELISAPositive: totalIELISA,
      totalInfectedSum: totalI,
      totalAbortions,
      totalCulled,
      totalPendingCulled,
      totalQuarantined,
      totalPendingQuarantined,
      totalMovedIn,
      totalMovedOut,
      netMovement,
      apparentPrevalence,
      infectionPrevalence,
      cumulativeApparentPrevalence,
      apparentPrevalenceCI95: wilsonCI(
        last.iELISA_Positive,
        last.Total_Animals
      ),
      attackRate,
      abortionRate,
      cullingRate,
      quarantineRate,
      prevalenceCategory: prevalenceCategory(apparentPrevalence),
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
      transmissionIntensityScore,
      mapPoint: {
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
        totalAnimals: last.Total_Animals,
        attackRate,
        abortionRate,
        estimatedR0,
        intensityScore: transmissionIntensityScore,
      },
      trend: ordered.map((r) => ({
        farmId,
        observation: r.Observation,
        date: r.Date,
        S: r.S,
        E: r.E,
        I: r.I,
        R: r.R,
        N: r.Total_Animals,
        rbptPositive: r.RBPT_Positive,
        ielisaPositive: r.iELISA_Positive,
        abortions: r.Abortion_Count,
        pendingCulled: r.Pending_Culled,
        culledApplied: r.Culled,
        pendingQuarantined: r.Pending_Quarantined,
        quarantinedApplied: r.Quarantined,
        movedIn: r.New_Animals_Moved_In,
        movedOut: r.New_Animals_Moved_Out,
      })),
      rows: ordered,
      interpretation: {
        apparentPrevalence:
          apparentPrevalence === null
            ? "Not available"
            : `${(apparentPrevalence * 100).toFixed(
                2
              )}% apparent prevalence by iELISA.`,
        attackRate:
          attackRate === null
            ? "Not available"
            : `${(attackRate * 100).toFixed(
                2
              )}% cumulative attack rate using initial susceptible animals.`,
        estimatedR0:
          estimatedR0 === null
            ? "Not enough positive infected observations for R0 estimation."
            : estimatedR0 > 1
            ? "R0 > 1 suggests sustained transmission potential."
            : "R0 ≤ 1 suggests limited sustained transmission potential.",
      },
    };
  });

  const totalN = sum(farmSummaries.map((x: any) => x.finalPopulation));
  const totalS = sum(farmSummaries.map((x: any) => x.finalSEIR.S));
  const totalE = sum(farmSummaries.map((x: any) => x.finalSEIR.E));
  const totalI = sum(farmSummaries.map((x: any) => x.finalSEIR.I));
  const totalR = sum(farmSummaries.map((x: any) => x.finalSEIR.R));

  const allTrends = farmSummaries.flatMap((f: any) => f.trend);
  const maxObs = Math.max(...allTrends.map((t: any) => t.observation), 0);

  const overallTrend = Array.from({ length: maxObs }, (_, i) => {
    const obsNo = i + 1;
    const rowsAtObs = allTrends.filter((t: any) => t.observation === obsNo);

    return {
      observation: obsNo,
      S: sum(rowsAtObs.map((r: any) => r.S)),
      E: sum(rowsAtObs.map((r: any) => r.E)),
      I: sum(rowsAtObs.map((r: any) => r.I)),
      R: sum(rowsAtObs.map((r: any) => r.R)),
      N: sum(rowsAtObs.map((r: any) => r.N)),
      abortions: sum(rowsAtObs.map((r: any) => r.abortions)),
      pendingCulled: sum(rowsAtObs.map((r: any) => r.pendingCulled)),
      culledApplied: sum(rowsAtObs.map((r: any) => r.culledApplied)),
    };
  });

  const mapPoints = farmSummaries
    .map((x: any) => x.mapPoint)
    .filter((p: any) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));

  const farmDistanceMatrix = mapPoints.flatMap((a: any) =>
    mapPoints
      .filter((b: any) => b.farmId !== a.farmId)
      .map((b: any) => ({
        from: a.farmId,
        to: b.farmId,
        distanceKm: haversineKm(
          a.latitude,
          a.longitude,
          b.latitude,
          b.longitude
        ),
      }))
  );

  return {
    totalFarms: farmSummaries.length,
    totalObservations: rows.length,
    validation,
    overallSEIR: {
      N: totalN,
      S: totalS,
      E: totalE,
      I: totalI,
      R: totalR,
      overallPrevalence: totalN > 0 ? totalI / totalN : null,
      susceptibleProportion: totalN > 0 ? totalS / totalN : null,
      exposedProportion: totalN > 0 ? totalE / totalN : null,
      recoveredProportion: totalN > 0 ? totalR / totalN : null,
    },
    overallTotals: {
      totalIELISAPositive: sum(
        farmSummaries.map((x: any) => x.totalIELISAPositive)
      ),
      totalAbortions: sum(farmSummaries.map((x: any) => x.totalAbortions)),
      totalCulled: sum(farmSummaries.map((x: any) => x.totalCulled)),
      totalQuarantined: sum(farmSummaries.map((x: any) => x.totalQuarantined)),
      totalMovedIn: sum(farmSummaries.map((x: any) => x.totalMovedIn)),
      totalMovedOut: sum(farmSummaries.map((x: any) => x.totalMovedOut)),
    },
    rankings: {
      byPrevalence: [...farmSummaries].sort(
        (a: any, b: any) =>
          (b.apparentPrevalence ?? 0) - (a.apparentPrevalence ?? 0)
      ),
      byAttackRate: [...farmSummaries].sort(
        (a: any, b: any) => (b.attackRate ?? 0) - (a.attackRate ?? 0)
      ),
      byR0: [...farmSummaries].sort(
        (a: any, b: any) => (b.estimatedR0 ?? 0) - (a.estimatedR0 ?? 0)
      ),
      byAbortionRate: [...farmSummaries].sort(
        (a: any, b: any) => (b.abortionRate ?? 0) - (a.abortionRate ?? 0)
      ),
      byIntensityScore: [...farmSummaries].sort(
        (a: any, b: any) =>
          (b.transmissionIntensityScore ?? 0) -
          (a.transmissionIntensityScore ?? 0)
      ),
    },
    visualization: {
      overallTrend,
      farmTrends: farmSummaries.map((f: any) => ({
        farmId: f.farmId,
        trend: f.trend,
      })),
      seirStackedArea: overallTrend.map((t: any) => ({
        observation: t.observation,
        susceptible: t.S,
        exposed: t.E,
        infected: t.I,
        recovered: t.R,
      })),
      prevalenceBars: farmSummaries.map((f: any) => ({
        farmId: f.farmId,
        prevalence: f.apparentPrevalence,
        category: f.prevalenceCategory,
      })),
      abortionBars: farmSummaries.map((f: any) => ({
        farmId: f.farmId,
        abortionRate: f.abortionRate,
        totalAbortions: f.totalAbortions,
      })),
      r0Bars: farmSummaries.map((f: any) => ({
        farmId: f.farmId,
        r0: f.estimatedR0,
      })),
      cullingTrend: overallTrend.map((t: any) => ({
        observation: t.observation,
        pendingCulled: t.pendingCulled,
        appliedCulled: t.culledApplied,
      })),
      mapPoints,
      farmDistanceMatrix,
    },
    mapPoints,
    farmDistanceMatrix,
    farmSummaries,
  };
}

function binaryEncodeOutcome(rows: RawRow[], outcome: string) {
  const vals = rows.map((r) => r[outcome]).filter((v) => !isMissing(v));
  const uniques = Array.from(new Set(vals.map(String)));

  if (uniques.length !== 2) return null;

  const positive = uniques.includes("1") ? "1" : uniques[1];
  const negative = uniques.find((v) => v !== positive) ?? uniques[0];

  return { positive, negative };
}

function chiSquare2x2(a0: number, b0: number, c0: number, d0: number) {
  const total = a0 + b0 + c0 + d0;
  if (total === 0) return null;

  const numerator = total * Math.pow(a0 * d0 - b0 * c0, 2);
  const denominator = (a0 + b0) * (c0 + d0) * (a0 + c0) * (b0 + d0);

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

  return {
    oddsRatio: or,
    ciLower: Math.exp(Math.log(or) - 1.96 * se),
    ciUpper: Math.exp(Math.log(or) + 1.96 * se),
  };
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

  return {
    riskRatio: rr,
    rrLower: Math.exp(Math.log(rr) - 1.96 * se),
    rrUpper: Math.exp(Math.log(rr) + 1.96 * se),
    riskExposed,
    riskUnexposed,
  };
}

function analyzeCategoricalRisk(
  rows: RawRow[],
  outcome: string,
  predictor: string
) {
  const enc = binaryEncodeOutcome(rows, outcome);

  if (!enc) {
    return {
      variable: predictor,
      test: "failed",
      pValue: 1,
      message: "Outcome must contain exactly two categories.",
    };
  }

  const levels = uniqueValues(rows, predictor);
  const level = levels.includes("1") ? "1" : levels[0];

  const valid = rows.filter(
    (r) => !isMissing(r[outcome]) && !isMissing(r[predictor])
  );

  const a = valid.filter(
    (r) =>
      String(r[predictor]) === level && String(r[outcome]) === enc.positive
  ).length;

  const b = valid.filter(
    (r) =>
      String(r[predictor]) === level && String(r[outcome]) !== enc.positive
  ).length;

  const c = valid.filter(
    (r) =>
      String(r[predictor]) !== level && String(r[outcome]) === enc.positive
  ).length;

  const d = valid.filter(
    (r) =>
      String(r[predictor]) !== level && String(r[outcome]) !== enc.positive
  ).length;

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
    riskExposed: rr.riskExposed,
    riskUnexposed: rr.riskUnexposed,
    table: {
      exposedPositive: a,
      exposedNegative: b,
      unexposedPositive: c,
      unexposedNegative: d,
    },
    interpretation:
      pValue < 0.05
        ? or.oddsRatio > 1
          ? "Significant possible risk factor."
          : "Significant possible protective factor."
        : "Not statistically significant.",
  };
}

function analyzeContinuousRisk(
  rows: RawRow[],
  outcome: string,
  predictor: string
) {
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
    .filter(
      (r) =>
        String(r[outcome]) === enc.positive &&
        Number.isFinite(Number(r[predictor]))
    )
    .map((r) => Number(r[predictor]));

  const negative = rows
    .filter(
      (r) =>
        String(r[outcome]) !== enc.positive &&
        Number.isFinite(Number(r[predictor]))
    )
    .map((r) => Number(r[predictor]));

  const m1 = mean(positive);
  const m0 = mean(negative);
  const s1 = sd(positive);
  const s0 = sd(negative);

  if (
    m1 === null ||
    m0 === null ||
    s1 === null ||
    s0 === null ||
    positive.length < 2 ||
    negative.length < 2
  ) {
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

  const pooled = Math.sqrt(
    ((positive.length - 1) * s1 * s1 +
      (negative.length - 1) * s0 * s0) /
      (positive.length + negative.length - 2)
  );

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
    interpretation:
      pValue < 0.05
        ? "Significant mean difference between outcome groups."
        : "Not statistically significant.",
  };
}

function analyzeRisk(rows: RawRow[], outcome: string, predictors: string[], threshold: number) {
  const datasetProfile = describeDataset(rows);

  const univariable = predictors.map((p) => {
    const missing = rows.filter((r) => isMissing(r[p])).length;

    if (missing > rows.length * 0.5) {
      return {
        variable: p,
        test: "skipped",
        pValue: 1,
        missing,
        message: "Skipped because more than 50% values are missing.",
      };
    }

    if (isNumericColumn(rows, p) && uniqueValues(rows, p).length > 10) {
      return analyzeContinuousRisk(rows, outcome, p);
    }

    return analyzeCategoricalRisk(rows, outcome, p);
  });

  const selectedVariables = univariable
    .filter(
      (x: any) =>
        x.test !== "failed" &&
        x.test !== "skipped" &&
        Number.isFinite(x.pValue) &&
        x.pValue < threshold
    )
    .map((x: any) => x.variable);

  const ranked = [...univariable]
    .filter((r: any) => Number.isFinite(r.pValue))
    .sort((a: any, b: any) => a.pValue - b.pValue);

  return {
    outcome,
    predictors,
    threshold,
    datasetProfile,
    univariable,
    selectedVariables,
    summary: {
      totalPredictors: predictors.length,
      significantAt005: univariable.filter((x: any) => x.pValue < 0.05).length,
      selectedForMultivariable: selectedVariables.length,
      strongestPredictor: ranked[0] ?? null,
      protectiveFactors: univariable.filter(
        (x: any) =>
          Number.isFinite(x.oddsRatio) && x.oddsRatio < 1 && x.pValue < 0.05
      ),
      riskFactors: univariable.filter(
        (x: any) =>
          Number.isFinite(x.oddsRatio) && x.oddsRatio > 1 && x.pValue < 0.05
      ),
    },
    visualization: {
      pValueBars: univariable.map((x: any) => ({
        variable: x.variable,
        pValue: x.pValue,
        significant: x.pValue < 0.05,
        selected: x.pValue < threshold,
      })),
      forestData: univariable
        .filter((x: any) => Number.isFinite(x.oddsRatio))
        .map((x: any) => ({
          variable: x.variable,
          oddsRatio: x.oddsRatio,
          ciLower: x.ciLower,
          ciUpper: x.ciUpper,
          pValue: x.pValue,
        })),
    },
  };
}

function describeDataset(rows: RawRow[]) {
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return {
    rows: rows.length,
    columns: columns.length,
    columnNames: columns,
    variableProfile: columns.map((c) => {
      const numeric = isNumericColumn(rows, c);
      const values = rows
        .map((r) => r[c])
        .filter((v) => !isMissing(v))
        .map((v) => (numeric ? Number(v) : v));

      return {
        variable: c,
        type: numeric ? "numeric" : "categorical/text",
        uniqueValues: uniqueValues(rows, c).length,
        missing: missingCount(rows, c),
        numericSummary: numeric ? describeNumeric(values as number[]) : null,
        categories: numeric
          ? null
          : uniqueValues(rows, c)
              .slice(0, 20)
              .map((level) => ({
                level,
                count: rows.filter((r) => String(r[c]) === level).length,
              })),
      };
    }),
  };
}

function normalizeNetworkRows(rows: RawRow[]): NetworkEdge[] {
  return rows
    .map((r, i) => ({
      edgeId: safeText(r.Edge_ID ?? r["Edge ID"] ?? r.edgeId, `E${i + 1}`),
      source: safeText(r.From_Node ?? r["From Node"] ?? r.source ?? r.Source),
      target: safeText(r.To_Node ?? r["To Node"] ?? r.target ?? r.Target),
      edgeType: safeText(r.Edge_Type ?? r["Edge Type"] ?? r.type, "movement"),
      distanceKm: safeNumber(
        r.Road_Distance_km ?? r["Road Distance (km)"] ?? r.distanceKm
      ),
      movements: safeNumber(
        r.Avg_Movements ?? r["Avg Movements"] ?? r.movements,
        1
      ),
    }))
    .filter((e) => e.source && e.target);
}

function connectedComponents(nodes: string[], edges: NetworkEdge[]) {
  const adj = new Map<string, Set<string>>();
  nodes.forEach((n) => adj.set(n, new Set()));

  edges.forEach((e) => {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
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

      adj.get(node)?.forEach((nei) => {
        if (!visited.has(nei)) {
          visited.add(nei);
          stack.push(nei);
        }
      });
    }

    components.push(comp);
  });

  return components;
}

function analyzeNetwork(edges: NetworkEdge[]) {
  const nodes = Array.from(
    new Set(edges.flatMap((e) => [e.source, e.target]).filter(Boolean))
  );

  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((n) => adjacency.set(n, new Set()));

  edges.forEach((e) => {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  });

  const degree = nodes.map((node) => ({
    node,
    degree: adjacency.get(node)?.size ?? 0,
    weightedMovements: sum(
      edges
        .filter((e) => e.source === node || e.target === node)
        .map((e) => e.movements)
    ),
    meanDistanceKm: mean(
      edges
        .filter((e) => e.source === node || e.target === node)
        .map((e) => e.distanceKm)
    ),
  }));

  const components = connectedComponents(nodes, edges);
  const sortedDegree = [...degree].sort((a, b) => b.degree - a.degree);

  const density =
    nodes.length > 1
      ? (2 * edges.length) / (nodes.length * (nodes.length - 1))
      : 0;

  const totalMovements = sum(edges.map((e) => e.movements));
  const meanDistance = mean(edges.map((e) => e.distanceKm));

  return {
    nodes: nodes.map((node, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(nodes.length, 1);
      const deg = degree.find((d) => d.node === node);

      return {
        id: node,
        degree: deg?.degree ?? 0,
        weightedMovements: deg?.weightedMovements ?? 0,
        x: Math.cos(angle),
        y: Math.sin(angle),
      };
    }),
    edges,
    statistics: {
      nodeCount: nodes.length,
      edgeCount: edges.length,
      density,
      totalMovements,
      meanDistanceKm: meanDistance,
      componentCount: components.length,
      largestComponentSize: Math.max(...components.map((c) => c.length), 0),
      highestDegreeNode: sortedDegree[0] ?? null,
      topNodesByDegree: sortedDegree.slice(0, 10),
    },
    components,
    visualization: {
      degreeBars: sortedDegree,
      movementHistogram: edges.map((e) => ({
        edgeId: e.edgeId,
        movements: e.movements,
        distanceKm: e.distanceKm,
      })),
    },
  };
}

function analyzeStatistics(rows: RawRow[]) {
  const profile = describeDataset(rows);
  const numericColumns = profile.columnNames.filter((c) => isNumericColumn(rows, c));

  const correlationMatrix = numericColumns.flatMap((a) =>
    numericColumns.map((b) => ({
      x: a,
      y: b,
      correlation: pearsonCorrelation(
        rows.map((r) => Number(r[a])),
        rows.map((r) => Number(r[b]))
      ),
    }))
  );

  return {
    dataset: profile,
    numericColumns,
    descriptiveStatistics: numericColumns.map((col) => ({
      variable: col,
      ...describeNumeric(rows.map((r) => Number(r[col]))),
    })),
    correlationMatrix,
    visualization: {
      variableCards: profile.variableProfile,
      correlationHeatmap: correlationMatrix,
      numericSummaryBars: numericColumns.map((col) => ({
        variable: col,
        mean: mean(rows.map((r) => Number(r[col]))),
        sd: sd(rows.map((r) => Number(r[col]))),
      })),
    },
  };
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const moduleName = String(formData.get("module") || "transmission");

    if (moduleName === "risk") {
      const file = formData.get("file") as File | null;
      const outcome = String(formData.get("outcome") || "").trim();
      const predictors = String(formData.get("predictors") || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const threshold = safeNumber(formData.get("threshold"), 0.2);

      if (!file) {
        return NextResponse.json(
          { error: "No CSV file uploaded." },
          { status: 400 }
        );
      }

      const rows = parseCSV(await file.text());

      return NextResponse.json({
        status: "success",
        module: "Risk Factor Analysis",
        rows: rows.length,
        risk: analyzeRisk(rows, outcome, predictors, threshold),
        notes: [
          "Univariable analysis includes chi-square 2x2 for categorical/binary predictors and group mean comparison for continuous predictors.",
          "Variables below the threshold are selected for further multivariable modeling in advanced backend versions.",
        ],
      });
    }

    if (moduleName === "network") {
      const source = String(formData.get("source") || "manual");
      let edges: NetworkEdge[] = [];

      if (source === "manual") {
        edges = JSON.parse(String(formData.get("edges") || "[]"));
      } else {
        const file = formData.get("file") as File | null;

        if (!file) {
          return NextResponse.json(
            { error: "No network CSV uploaded." },
            { status: 400 }
          );
        }

        edges = normalizeNetworkRows(parseCSV(await file.text()));
      }

      return NextResponse.json({
        status: "success",
        module: "Network Analysis",
        rows: edges.length,
        network: analyzeNetwork(edges),
      });
    }

    if (moduleName === "statistics") {
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json(
          { error: "No CSV file uploaded." },
          { status: 400 }
        );
      }

      const rows = parseCSV(await file.text());

      return NextResponse.json({
        status: "success",
        module: "Statistical Summary",
        rows: rows.length,
        statistics: analyzeStatistics(rows),
      });
    }

    const mode = String(formData.get("mode") || "logic");
    const infectiousPeriodDays = safeNumber(
      formData.get("infectiousPeriodDays"),
      14
    );

    let rows: ObsRow[] = [];

    if (mode === "import") {
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json(
          { error: "No CSV file uploaded." },
          { status: 400 }
        );
      }

      rows = normalizeImportedRows(parseCSV(await file.text()));
    } else {
      rows = JSON.parse(String(formData.get("rows") || "[]")) as ObsRow[];
    }

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No observation data found." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      status: "success",
      module: "Transmission Dynamics",
      mode,
      rows: rows.length,
      analysis: analyzeTransmission(rows, infectiousPeriodDays),
      notes: [
        "First observation has Culled=0 and Quarantined=0.",
        "Initial observation now supports Abortion_Count.",
        "Each new farm must be appended to the existing rows array from page.tsx; otherwise previous farm data will disappear.",
        "Correct N logic: New N = previous N - previous Pending_Culled + moved in - moved out.",
        "S is recalculated as N - (E + I + R).",
        "Output includes farm-wise table data, overall SEIR dynamics, farm rankings, map points, trend data, abortion summaries, and visualization-ready arrays.",
      ],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Analysis failed." },
      { status: 500 }
    );
  }
}
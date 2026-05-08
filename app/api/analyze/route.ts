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

type SequenceRecord = {
  id: string;
  sequence: string;
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
  return values
    .filter((v) => Number.isFinite(v))
    .reduce((a, b) => a + b, 0);
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

  return usable.length % 2 === 0
    ? (usable[mid - 1] + usable[mid]) / 2
    : usable[mid];
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

function isMissing(v: any) {
  return v === null || v === undefined || v === "";
}

function uniqueValues(rows: RawRow[], col: string) {
  return Array.from(
    new Set(rows.map((r) => r[col]).filter((v) => !isMissing(v)))
  ).map(String);
}

function missingCount(rows: RawRow[], col: string) {
  return rows.filter((r) => isMissing(r[col])).length;
}

function isNumericColumn(rows: RawRow[], col: string) {
  const vals = rows.map((r) => r[col]).filter((v) => !isMissing(v));
  if (vals.length === 0) return false;
  return vals.every((v) => Number.isFinite(Number(v)));
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

function confirmationFromAny(row: RawRow): number {
  return safeNumber(
    row.Confirmatory_Diagnosis ??
      row["Confirmatory Diagnosis"] ??
      row.confirmatory_diagnosis ??
      row.confirmatoryDiagnosis ??
      row.Confirmatory ??
      row.confirmatory ??
      row.I ??
      row.Infected ??
      row.infected ??
      row.Positive ??
      row.positive
  );
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
      const E = safeNumber(r.E ?? r.Exposed ?? r.exposed);
      const confirmatory = confirmationFromAny(r);
      const I = confirmatory;
      const R = safeNumber(r.R ?? r.Recovered ?? r.recovered);

      const pendingCulled = safeNumber(
        r.Pending_Culled ?? r["Pending Culled"] ?? r.pending_culled
      );

      const pendingQuarantined = safeNumber(
        r.Pending_Quarantined ??
          r["Pending Quarantined"] ??
          r.pending_quarantined,
        Math.max(0, I - pendingCulled)
      );

      output.push({
        Farm_ID: farmId,
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
        Confirmatory_Diagnosis: confirmatory,
        Abortion_Count: safeNumber(
          r.Abortion_Count ??
            r.Abortions ??
            r.abortions ??
            r.Initial_Abortion_Count ??
            r["Initial Abortion Count"]
        ),
        Pending_Culled: pendingCulled,
        Culled: safeNumber(r.Culled ?? r.culled),
        Pending_Quarantined: pendingQuarantined,
        Quarantined: safeNumber(r.Quarantined ?? r.quarantined),
        New_Animals_Moved_In: safeNumber(
          r.New_Animals_Moved_In ??
            r.MovedIn ??
            r["Moved In"] ??
            r.moved_in
        ),
        New_Animals_Moved_Out: safeNumber(
          r.New_Animals_Moved_Out ??
            r.MovedOut ??
            r["Moved Out"] ??
            r.moved_out
        ),
        Susceptible_In_From_MovedIn: safeNumber(
          r.Susceptible_In_From_MovedIn ?? r.SusIn ?? r.susceptible_in
        ),
        Susceptible_Out_From_MovedOut: safeNumber(
          r.Susceptible_Out_From_MovedOut ?? r.SusOut ?? r.susceptible_out
        ),
      });
    });
  });

  return output;
}

function normalizeLogicRows(rows: ObsRow[]): ObsRow[] {
  return rows.map((r, index) => {
    const confirmatory = safeNumber(
      (r as any).Confirmatory_Diagnosis ??
        (r as any)["Confirmatory Diagnosis"] ??
        (r as any).confirmatoryDiagnosis ??
        (r as any).I
    );

    const N = safeNumber(r.Total_Animals);
    const E = safeNumber(r.E);
    const I = confirmatory;
    const R = safeNumber(r.R);

    return {
      Farm_ID: safeText(r.Farm_ID, `Farm_${index + 1}`),
      Location: safeText(r.Location),
      Latitude: safeNumber(r.Latitude, NaN),
      Longitude: safeNumber(r.Longitude, NaN),
      Date: safeText(r.Date, today()),
      Observation: safeNumber(r.Observation, index + 1),
      Total_Animals: N,
      S: safeNumber(r.S, Math.max(0, N - (E + I + R))),
      E,
      I,
      R,
      Confirmatory_Diagnosis: confirmatory,
      Abortion_Count: safeNumber(r.Abortion_Count),
      Pending_Culled: safeNumber(r.Pending_Culled),
      Culled: safeNumber(r.Culled),
      Pending_Quarantined: safeNumber(
        r.Pending_Quarantined,
        Math.max(0, I - safeNumber(r.Pending_Culled))
      ),
      Quarantined: safeNumber(r.Quarantined),
      New_Animals_Moved_In: safeNumber(r.New_Animals_Moved_In),
      New_Animals_Moved_Out: safeNumber(r.New_Animals_Moved_Out),
      Susceptible_In_From_MovedIn: safeNumber(r.Susceptible_In_From_MovedIn),
      Susceptible_Out_From_MovedOut: safeNumber(r.Susceptible_Out_From_MovedOut),
    };
  });
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

    if (!Number.isFinite(r.Latitude) || !Number.isFinite(r.Longitude)) {
      warnings.push(
        `${r.Farm_ID} observation ${r.Observation}: latitude/longitude missing or invalid for map.`
      );
    }

    if (Math.abs(r.Latitude) > 90 || Math.abs(r.Longitude) > 180) {
      warnings.push(
        `${r.Farm_ID} observation ${r.Observation}: latitude/longitude outside valid geographic range.`
      );
    }

    if (r.Confirmatory_Diagnosis !== r.I) {
      warnings.push(
        `${r.Farm_ID} observation ${r.Observation}: Confirmatory_Diagnosis was forced to equal I.`
      );
    }
  });

  return { warnings, errors };
}

function buildHeatFeature(point: any) {
  return {
    type: "Feature",
    properties: {
      farmId: point.farmId,
      location: point.location,
      prevalence: point.prevalence ?? 0,
      prevalencePercent:
        point.prevalence === null ? null : Number((point.prevalence * 100).toFixed(3)),
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
      popupHTML:
        `<strong>${point.farmId}</strong><br/>` +
        `${point.location || ""}<br/>` +
        `N: ${point.totalAnimals ?? 0}<br/>` +
        `I: ${point.infected ?? 0}<br/>` +
        `Confirmatory Diagnosis: ${point.confirmatoryDiagnosis ?? 0}<br/>` +
        `Abortions: ${point.totalAbortions ?? 0}<br/>` +
        `Prevalence: ${
          point.prevalence === null || point.prevalence === undefined
            ? "NA"
            : `${(point.prevalence * 100).toFixed(2)}%`
        }<br/>` +
        `R0: ${
          point.estimatedR0 === null || point.estimatedR0 === undefined
            ? "NA"
            : Number(point.estimatedR0).toFixed(3)
        }`,
    },
    geometry: {
      type: "Point",
      coordinates: [point.longitude, point.latitude],
    },
  };
}

function analyzeTransmission(rows: ObsRow[], infectiousPeriodDays: number) {
  const normalized = normalizeLogicRows(rows);
  const validation = validateTransmissionRows(normalized);
  const farms = new Map<string, ObsRow[]>();

  normalized.forEach((row) => {
    if (!farms.has(row.Farm_ID)) farms.set(row.Farm_ID, []);
    farms.get(row.Farm_ID)!.push(row);
  });

  const farmSummaries = Array.from(farms.entries()).map(([farmId, farmRows]) => {
    const ordered = [...farmRows].sort((a, b) => a.Observation - b.Observation);
    const first = ordered[0];
    const last = ordered[ordered.length - 1];

    const totalConfirmatoryDiagnosis = sum(
      ordered.map((r) => r.Confirmatory_Diagnosis)
    );
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
      last.Total_Animals > 0
        ? last.Confirmatory_Diagnosis / last.Total_Animals
        : null;

    const infectionPrevalence =
      last.Total_Animals > 0 ? last.I / last.Total_Animals : null;

    const cumulativeApparentPrevalence =
      last.Total_Animals > 0
        ? totalConfirmatoryDiagnosis / last.Total_Animals
        : null;

    const attackRate =
      first.S > 0 ? totalConfirmatoryDiagnosis / first.S : null;

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

    const heatWeight =
      Math.max(1, last.I) +
      Math.max(0, (apparentPrevalence ?? 0) * 100) +
      Math.max(0, totalAbortions * 0.5) +
      Math.max(0, transmissionIntensityScore * 0.25);

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
      abortionRate,
      estimatedR0,
      intensityScore: transmissionIntensityScore,
      heatWeight,
    };

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
      totalConfirmatoryDiagnosis,
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
        last.Confirmatory_Diagnosis,
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
      heatWeight,
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
              )}% apparent prevalence by confirmatory diagnosis.`,
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
      confirmatoryDiagnosis: sum(
        rowsAtObs.map((r: any) => r.confirmatoryDiagnosis)
      ),
      abortions: sum(rowsAtObs.map((r: any) => r.abortions)),
      pendingCulled: sum(rowsAtObs.map((r: any) => r.pendingCulled)),
      culledApplied: sum(rowsAtObs.map((r: any) => r.culledApplied)),
    };
  });

  const mapPoints = farmSummaries
    .map((x: any) => x.mapPoint)
    .filter(
      (p: any) =>
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude) &&
        Math.abs(p.latitude) <= 90 &&
        Math.abs(p.longitude) <= 180
    );

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

  const heatmapFeatures = mapPoints.map(buildHeatFeature);

  const heatmapGeoJSON = {
    type: "FeatureCollection",
    features: heatmapFeatures,
  };

  const mapBounds =
    mapPoints.length > 0
      ? {
          minLongitude: Math.min(...mapPoints.map((p: any) => p.longitude)),
          maxLongitude: Math.max(...mapPoints.map((p: any) => p.longitude)),
          minLatitude: Math.min(...mapPoints.map((p: any) => p.latitude)),
          maxLatitude: Math.max(...mapPoints.map((p: any) => p.latitude)),
        }
      : null;

  const mapCenter =
    mapPoints.length > 0
      ? {
          longitude: mean(mapPoints.map((p: any) => p.longitude)),
          latitude: mean(mapPoints.map((p: any) => p.latitude)),
        }
      : {
          longitude: 90.4125,
          latitude: 23.8103,
        };

  return {
    totalFarms: farmSummaries.length,
    totalObservations: normalized.length,
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
      totalConfirmatoryDiagnosis: sum(
        farmSummaries.map((x: any) => x.totalConfirmatoryDiagnosis)
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
      heatmapGeoJSON,
      mapConfig: {
        defaultView: "normal",
        availableViews: [
          {
            id: "normal",
            label: "Normal",
            mapboxStyle: "mapbox://styles/mapbox/dark-v11",
          },
          {
            id: "satellite",
            label: "Satellite",
            mapboxStyle: "mapbox://styles/mapbox/satellite-streets-v12",
          },
        ],
        center: mapCenter,
        bounds: mapBounds,
        heatmapLayer: {
          sourceId: "transmission-heatmap-source",
          layerId: "transmission-heatmap-layer",
          pointLayerId: "transmission-point-layer",
          weightProperty: "heatWeight",
          popupProperty: "popupHTML",
        },
      },
    },
    mapPoints,
    heatmapGeoJSON,
    mapConfig: {
      defaultView: "normal",
      availableViews: [
        {
          id: "normal",
          label: "Normal",
          mapboxStyle: "mapbox://styles/mapbox/dark-v11",
        },
        {
          id: "satellite",
          label: "Satellite",
          mapboxStyle: "mapbox://styles/mapbox/satellite-streets-v12",
        },
      ],
      center: mapCenter,
      bounds: mapBounds,
      heatmapLayer: {
        sourceId: "transmission-heatmap-source",
        layerId: "transmission-heatmap-layer",
        pointLayerId: "transmission-point-layer",
        weightProperty: "heatWeight",
        popupProperty: "popupHTML",
      },
    },
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

function analyzeRisk(
  rows: RawRow[],
  outcome: string,
  predictors: string[],
  threshold: number
) {
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

function normalizeNetworkRows(rows: RawRow[]): NetworkEdge[] {
  return rows
    .map((r, i) => ({
      edgeId: safeText(
        r.Edge_ID ??
          r["Edge ID"] ??
          r.edgeId ??
          r.edge_id ??
          r.ID ??
          r.id,
        `E${i + 1}`
      ),
      source: safeText(
        r.From_Node ??
          r["From Node"] ??
          r.Source ??
          r.source ??
          r.from ??
          r.From ??
          r.Origin ??
          r.origin
      ),
      target: safeText(
        r.To_Node ??
          r["To Node"] ??
          r.Target ??
          r.target ??
          r.to ??
          r.To ??
          r.Destination ??
          r.destination
      ),
      edgeType: safeText(
        r.Edge_Type ??
          r["Edge Type"] ??
          r.type ??
          r.Type ??
          r.relationship ??
          r.Relationship,
        "movement"
      ),
      distanceKm: safeNumber(
        r.Road_Distance_km ??
          r["Road Distance (km)"] ??
          r.distanceKm ??
          r.distance_km ??
          r.Distance ??
          r.distance,
        0
      ),
      movements: safeNumber(
        r.Avg_Movements ??
          r["Avg Movements"] ??
          r.movements ??
          r.Movements ??
          r.weight ??
          r.Weight ??
          r.count ??
          r.Count,
        1
      ),
    }))
    .filter((e) => e.source && e.target);
}

function rankNumeric(values: number[]) {
  const indexed = values.map((value, index) => ({ value, index }));
  const sorted = [...indexed].sort((a, b) => a.value - b.value);
  const ranks = Array(values.length).fill(0);

  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1].value === sorted[i].value) {
      j += 1;
    }

    const averageRank = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) {
      ranks[sorted[k].index] = averageRank;
    }
    i = j + 1;
  }

  return ranks;
}

function spearmanCorrelation(x: number[], y: number[]) {
  const pairs = x
    .map((v, i) => ({ x: v, y: y[i] }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

  if (pairs.length < 3) return null;

  const rx = rankNumeric(pairs.map((p) => p.x));
  const ry = rankNumeric(pairs.map((p) => p.y));
  return pearsonCorrelation(rx, ry);
}

function twoSidedNormalPFromStatistic(statistic: number | null) {
  if (statistic === null || !Number.isFinite(statistic)) return null;
  return normalPValue(statistic);
}

function inferSignificance(pValue: number | null, alpha: number) {
  if (pValue === null || !Number.isFinite(pValue)) return "not_available";
  return pValue <= alpha ? "significant" : "not_significant";
}

function cleanNumericPairs(rows: RawRow[], a: string, b: string) {
  return rows
    .map((r) => ({ a: Number(r[a]), b: Number(r[b]) }))
    .filter((p) => Number.isFinite(p.a) && Number.isFinite(p.b));
}

function valuesByGroup(rows: RawRow[], groupColumn: string, valueColumn: string) {
  const levels = uniqueValues(rows, groupColumn);
  return levels
    .map((level) => ({
      level,
      values: rows
        .filter((r) => String(r[groupColumn]) === String(level))
        .map((r) => Number(r[valueColumn]))
        .filter((v) => Number.isFinite(v)),
    }))
    .filter((g) => g.values.length > 0);
}

function independentTTest(rows: RawRow[], groupColumn: string, valueColumn: string, alpha: number) {
  const groups = valuesByGroup(rows, groupColumn, valueColumn);

  if (groups.length < 2) {
    return {
      test: "Independent t-test",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "Independent t-test requires exactly two non-empty groups.",
    };
  }

  const [g1, g2] = groups.slice(0, 2);
  const n1 = g1.values.length;
  const n2 = g2.values.length;
  const m1 = mean(g1.values);
  const m2 = mean(g2.values);
  const s1 = sd(g1.values);
  const s2 = sd(g2.values);

  if (n1 < 2 || n2 < 2 || m1 === null || m2 === null || s1 === null || s2 === null) {
    return {
      test: "Independent t-test",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "Insufficient observations for two-sample t-test.",
    };
  }

  const pooledVariance = ((n1 - 1) * s1 * s1 + (n2 - 1) * s2 * s2) / (n1 + n2 - 2);
  const pooledSd = Math.sqrt(pooledVariance);
  const standardError = pooledSd * Math.sqrt(1 / n1 + 1 / n2);
  const tStatistic = standardError > 0 ? (m1 - m2) / standardError : null;
  const pValue = twoSidedNormalPFromStatistic(tStatistic);
  const cohensD = pooledSd > 0 ? (m1 - m2) / pooledSd : null;

  return {
    test: "Independent t-test",
    method: "Two-sample pooled-variance t-test with normal p-value approximation",
    variable: valueColumn,
    groupColumn,
    groups: [g1.level, g2.level],
    n1,
    n2,
    mean1: m1,
    mean2: m2,
    sd1: s1,
    sd2: s2,
    meanDifference: m1 - m2,
    statistic: tStatistic,
    tStatistic,
    df: n1 + n2 - 2,
    standardError,
    effectSize: cohensD,
    cohensD,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "The two groups differ for this numeric variable at the selected alpha level."
        : "No statistically significant two-group difference was detected at the selected alpha level.",
  };
}

function welchTTest(rows: RawRow[], groupColumn: string, valueColumn: string, alpha: number) {
  const groups = valuesByGroup(rows, groupColumn, valueColumn);

  if (groups.length < 2) {
    return {
      test: "Welch t-test",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "Welch t-test requires two non-empty groups.",
    };
  }

  const [g1, g2] = groups.slice(0, 2);
  const n1 = g1.values.length;
  const n2 = g2.values.length;
  const m1 = mean(g1.values);
  const m2 = mean(g2.values);
  const v1 = variance(g1.values);
  const v2 = variance(g2.values);

  if (n1 < 2 || n2 < 2 || m1 === null || m2 === null || v1 === null || v2 === null) {
    return {
      test: "Welch t-test",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "Insufficient observations for Welch t-test.",
    };
  }

  const standardError = Math.sqrt(v1 / n1 + v2 / n2);
  const tStatistic = standardError > 0 ? (m1 - m2) / standardError : null;
  const numerator = Math.pow(v1 / n1 + v2 / n2, 2);
  const denominator = Math.pow(v1 / n1, 2) / (n1 - 1) + Math.pow(v2 / n2, 2) / (n2 - 1);
  const df = denominator > 0 ? numerator / denominator : null;
  const pValue = twoSidedNormalPFromStatistic(tStatistic);

  return {
    test: "Welch t-test",
    method: "Unequal-variance two-sample t-test with Satterthwaite df and normal p-value approximation",
    variable: valueColumn,
    groupColumn,
    groups: [g1.level, g2.level],
    n1,
    n2,
    mean1: m1,
    mean2: m2,
    variance1: v1,
    variance2: v2,
    meanDifference: m1 - m2,
    statistic: tStatistic,
    tStatistic,
    df,
    standardError,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "Welch comparison suggests a significant difference while allowing unequal variances."
        : "Welch comparison did not detect a statistically significant difference.",
  };
}

function pairedTTest(rows: RawRow[], valueColumns: string[], alpha: number) {
  if (valueColumns.length < 2) {
    return {
      test: "Paired t-test",
      pValue: null,
      status: "failed",
      message: "Paired t-test requires two numeric value columns.",
    };
  }

  const [first, second] = valueColumns;
  const pairs = cleanNumericPairs(rows, first, second);
  const differences = pairs.map((p) => p.a - p.b);
  const n = differences.length;
  const md = mean(differences);
  const sdiff = sd(differences);

  if (n < 2 || md === null || sdiff === null) {
    return {
      test: "Paired t-test",
      variables: [first, second],
      pValue: null,
      status: "failed",
      message: "Insufficient paired observations.",
    };
  }

  const standardError = sdiff / Math.sqrt(n);
  const tStatistic = standardError > 0 ? md / standardError : null;
  const pValue = twoSidedNormalPFromStatistic(tStatistic);

  return {
    test: "Paired t-test",
    method: "Paired mean-difference test with normal p-value approximation",
    variables: [first, second],
    n,
    meanDifference: md,
    sdDifference: sdiff,
    standardError,
    statistic: tStatistic,
    tStatistic,
    df: n - 1,
    effectSize: sdiff > 0 ? md / sdiff : null,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "The paired measurements differ significantly at the selected alpha level."
        : "No statistically significant paired difference was detected.",
  };
}

function oneSampleTTest(rows: RawRow[], valueColumn: string, alpha: number, mu = 0) {
  const values = rows
    .map((r) => Number(r[valueColumn]))
    .filter((v) => Number.isFinite(v));
  const n = values.length;
  const m = mean(values);
  const s = sd(values);

  if (n < 2 || m === null || s === null) {
    return {
      test: "One-sample t-test",
      variable: valueColumn,
      pValue: null,
      status: "failed",
      message: "One-sample t-test requires at least two numeric observations.",
    };
  }

  const standardError = s / Math.sqrt(n);
  const tStatistic = standardError > 0 ? (m - mu) / standardError : null;
  const pValue = twoSidedNormalPFromStatistic(tStatistic);

  return {
    test: "One-sample t-test",
    method: "One-sample mean test against mu=0 by default",
    variable: valueColumn,
    mu,
    n,
    mean: m,
    sd: s,
    meanDifference: m - mu,
    standardError,
    statistic: tStatistic,
    tStatistic,
    df: n - 1,
    effectSize: s > 0 ? (m - mu) / s : null,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "The sample mean differs significantly from the reference value."
        : "The sample mean was not significantly different from the reference value.",
  };
}

function oneWayAnova(rows: RawRow[], groupColumn: string, valueColumn: string, alpha: number) {
  const groups = valuesByGroup(rows, groupColumn, valueColumn).filter((g) => g.values.length >= 2);
  const all = groups.flatMap((g) => g.values);
  const grandMean = mean(all);

  if (groups.length < 2 || all.length < 3 || grandMean === null) {
    return {
      test: "One-way ANOVA",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "ANOVA requires at least two groups with numeric observations.",
    };
  }

  const ssBetween = sum(
    groups.map((g) => {
      const gm = mean(g.values) ?? 0;
      return g.values.length * Math.pow(gm - grandMean, 2);
    })
  );

  const ssWithin = sum(
    groups.flatMap((g) => {
      const gm = mean(g.values) ?? 0;
      return g.values.map((v) => Math.pow(v - gm, 2));
    })
  );

  const dfBetween = groups.length - 1;
  const dfWithin = all.length - groups.length;
  const msBetween = dfBetween > 0 ? ssBetween / dfBetween : null;
  const msWithin = dfWithin > 0 ? ssWithin / dfWithin : null;
  const fStatistic = msBetween !== null && msWithin !== null && msWithin > 0 ? msBetween / msWithin : null;

  // This project route avoids heavy numerical libraries. We expose an interpretable F-like statistic
  // and use a conservative chi-square-style approximation for dashboard triage.
  const pValue = fStatistic === null ? null : Math.max(0, Math.min(1, Math.exp(-0.5 * fStatistic * dfBetween)));
  const etaSquared = ssBetween + ssWithin > 0 ? ssBetween / (ssBetween + ssWithin) : null;

  return {
    test: "One-way ANOVA",
    method: "Between-group ANOVA with lightweight p-value approximation",
    variable: valueColumn,
    groupColumn,
    groups: groups.map((g) => ({
      level: g.level,
      n: g.values.length,
      mean: mean(g.values),
      sd: sd(g.values),
    })),
    ssBetween,
    ssWithin,
    dfBetween,
    dfWithin,
    msBetween,
    msWithin,
    statistic: fStatistic,
    fStatistic,
    df: `${dfBetween}, ${dfWithin}`,
    effectSize: etaSquared,
    etaSquared,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "At least one group mean appears different at the selected alpha level."
        : "No significant between-group mean difference was detected.",
  };
}

function welchAnova(rows: RawRow[], groupColumn: string, valueColumn: string, alpha: number) {
  const groups = valuesByGroup(rows, groupColumn, valueColumn).filter((g) => g.values.length >= 2);

  if (groups.length < 2) {
    return {
      test: "Welch ANOVA",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "Welch ANOVA requires at least two groups with repeated numeric observations.",
    };
  }

  const summaries = groups.map((g) => ({
    level: g.level,
    n: g.values.length,
    mean: mean(g.values) ?? 0,
    variance: variance(g.values) ?? 0,
  }));

  const weights = summaries.map((s) => (s.variance > 0 ? s.n / s.variance : 0));
  const weightSum = sum(weights);
  const weightedMean = weightSum > 0 ? sum(summaries.map((s, i) => weights[i] * s.mean)) / weightSum : null;

  const numerator = weightedMean === null ? null : sum(summaries.map((s, i) => weights[i] * Math.pow(s.mean - weightedMean, 2))) / (groups.length - 1);
  const correction = 1 + (2 * (groups.length - 2) / (groups.length * groups.length - 1)) * sum(
    summaries.map((s, i) => (s.n > 1 && weightSum > 0 ? Math.pow(1 - weights[i] / weightSum, 2) / (s.n - 1) : 0))
  );

  const fStatistic = numerator !== null && correction > 0 ? numerator / correction : null;
  const pValue = fStatistic === null ? null : Math.max(0, Math.min(1, Math.exp(-0.5 * fStatistic * (groups.length - 1))));

  return {
    test: "Welch ANOVA",
    method: "Unequal-variance ANOVA approximation",
    variable: valueColumn,
    groupColumn,
    groupSummaries: summaries,
    statistic: fStatistic,
    fStatistic,
    df: groups.length - 1,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "Welch ANOVA suggests a difference among group means while allowing unequal variances."
        : "Welch ANOVA did not detect a significant difference among group means.",
  };
}

function leveneVarianceTest(rows: RawRow[], groupColumn: string, valueColumn: string, alpha: number) {
  const groups = valuesByGroup(rows, groupColumn, valueColumn).filter((g) => g.values.length >= 2);

  if (groups.length < 2) {
    return {
      test: "Levene variance test",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "Levene test requires at least two groups.",
    };
  }

  const transformed: RawRow[] = [];
  groups.forEach((g) => {
    const med = median(g.values) ?? 0;
    g.values.forEach((v) => {
      transformed.push({ group: g.level, z: Math.abs(v - med) });
    });
  });

  const result = oneWayAnova(transformed, "group", "z", alpha);

  return {
    ...result,
    test: "Levene variance test",
    method: "ANOVA on absolute deviations from group medians",
    originalVariable: valueColumn,
    variable: valueColumn,
    groupColumn,
    interpretation:
      result.pValue !== null && result.pValue <= alpha
        ? "Group variances may be heterogeneous; Welch or non-parametric methods are preferable."
        : "No strong evidence of unequal group variances was detected.",
  };
}

function kruskalWallisTest(rows: RawRow[], groupColumn: string, valueColumn: string, alpha: number) {
  const groups = valuesByGroup(rows, groupColumn, valueColumn).filter((g) => g.values.length > 0);
  const pooled = groups.flatMap((g) => g.values.map((v) => ({ level: g.level, value: v })));

  if (groups.length < 2 || pooled.length < 3) {
    return {
      test: "Kruskal-Wallis",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "Kruskal-Wallis requires at least two groups.",
    };
  }

  const ranks = rankNumeric(pooled.map((p) => p.value));
  const n = pooled.length;
  const rankSums = groups.map((g) => ({
    level: g.level,
    n: g.values.length,
    rankSum: sum(pooled.map((p, i) => (p.level === g.level ? ranks[i] : 0))),
  }));

  const h = (12 / (n * (n + 1))) * sum(rankSums.map((r) => Math.pow(r.rankSum, 2) / r.n)) - 3 * (n + 1);
  const pValue = Math.max(0, Math.min(1, Math.exp(-0.5 * h)));

  return {
    test: "Kruskal-Wallis",
    method: "Rank-based comparison across groups with lightweight p-value approximation",
    variable: valueColumn,
    groupColumn,
    groups: rankSums,
    statistic: h,
    hStatistic: h,
    df: groups.length - 1,
    effectSize: n > groups.length ? (h - groups.length + 1) / (n - groups.length) : null,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "Rank distributions differ among groups at the selected alpha level."
        : "No significant rank-distribution difference was detected.",
  };
}

function mannWhitneyUTest(rows: RawRow[], groupColumn: string, valueColumn: string, alpha: number) {
  const groups = valuesByGroup(rows, groupColumn, valueColumn).filter((g) => g.values.length > 0);

  if (groups.length < 2) {
    return {
      test: "Mann-Whitney U",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "Mann-Whitney U requires two groups.",
    };
  }

  const [g1, g2] = groups.slice(0, 2);
  const pooled = [...g1.values.map((v) => ({ group: 1, value: v })), ...g2.values.map((v) => ({ group: 2, value: v }))];
  const ranks = rankNumeric(pooled.map((p) => p.value));
  const r1 = sum(pooled.map((p, i) => (p.group === 1 ? ranks[i] : 0)));
  const n1 = g1.values.length;
  const n2 = g2.values.length;
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const meanU = (n1 * n2) / 2;
  const sdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);
  const z = sdU > 0 ? (u1 - meanU) / sdU : null;
  const pValue = twoSidedNormalPFromStatistic(z);

  return {
    test: "Mann-Whitney U",
    method: "Rank-sum comparison with normal approximation",
    variable: valueColumn,
    groupColumn,
    groups: [g1.level, g2.level],
    n1,
    n2,
    uStatistic: u1,
    statistic: z,
    zStatistic: z,
    effectSize: z !== null ? Math.abs(z) / Math.sqrt(n1 + n2) : null,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "The two groups differ in rank distribution at the selected alpha level."
        : "No significant Mann-Whitney rank difference was detected.",
  };
}

function normalityScreen(rows: RawRow[], valueColumn: string, alpha: number) {
  const values = rows
    .map((r) => Number(r[valueColumn]))
    .filter((v) => Number.isFinite(v));
  const n = values.length;
  const m = mean(values);
  const s = sd(values);

  if (n < 3 || m === null || s === null || s === 0) {
    return {
      test: "Normality test",
      variable: valueColumn,
      pValue: null,
      status: "failed",
      message: "Normality screening requires at least three variable numeric observations.",
    };
  }

  const skewness = sum(values.map((v) => Math.pow((v - m) / s, 3))) / n;
  const kurtosis = sum(values.map((v) => Math.pow((v - m) / s, 4))) / n;
  const jarqueBera = (n / 6) * (skewness * skewness + Math.pow(kurtosis - 3, 2) / 4);
  const pValue = Math.max(0, Math.min(1, Math.exp(-0.5 * jarqueBera)));

  return {
    test: "Normality test",
    method: "Jarque-Bera-style skewness/kurtosis screen",
    variable: valueColumn,
    n,
    skewness,
    kurtosis,
    statistic: jarqueBera,
    jarqueBera,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "Distribution departs from normality; non-parametric or transformed analysis may be preferred."
        : "No strong skewness/kurtosis evidence against approximate normality was detected.",
  };
}

function chiSquareAssociation(rows: RawRow[], groupColumn: string, valueColumn: string, alpha: number) {
  const rowLevels = uniqueValues(rows, groupColumn);
  const colLevels = uniqueValues(rows, valueColumn);

  if (rowLevels.length < 2 || colLevels.length < 2) {
    return {
      test: "Chi-square / Fisher exact",
      variable: valueColumn,
      groupColumn,
      pValue: null,
      status: "failed",
      message: "Association test requires two categorical variables with at least two levels each.",
    };
  }

  const table = rowLevels.map((rLevel) =>
    colLevels.map((cLevel) =>
      rows.filter(
        (r) => String(r[groupColumn]) === String(rLevel) && String(r[valueColumn]) === String(cLevel)
      ).length
    )
  );

  const rowTotals = table.map((row) => sum(row));
  const colTotals = colLevels.map((_, j) => sum(table.map((row) => row[j])));
  const total = sum(rowTotals);
  const expected = table.map((row, i) =>
    row.map((_, j) => (total > 0 ? (rowTotals[i] * colTotals[j]) / total : 0))
  );

  const chiSquare = sum(
    table.flatMap((row, i) =>
      row.map((observed, j) => {
        const exp = expected[i][j];
        return exp > 0 ? Math.pow(observed - exp, 2) / exp : 0;
      })
    )
  );

  const df = (rowLevels.length - 1) * (colLevels.length - 1);
  const pValue = Math.max(0, Math.min(1, Math.exp(-0.5 * chiSquare)));
  const cramersV = total > 0 && Math.min(rowLevels.length - 1, colLevels.length - 1) > 0
    ? Math.sqrt(chiSquare / (total * Math.min(rowLevels.length - 1, colLevels.length - 1)))
    : null;

  return {
    test: rowLevels.length === 2 && colLevels.length === 2 ? "Chi-square / Fisher exact" : "Chi-square association",
    method: "Contingency-table association screen",
    variable: valueColumn,
    groupColumn,
    rowLevels,
    colLevels,
    table,
    expected,
    statistic: chiSquare,
    chiSquare,
    df,
    effectSize: cramersV,
    cramersV,
    pValue,
    significance: inferSignificance(pValue, alpha),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "The two categorical variables show evidence of association."
        : "No significant categorical association was detected.",
  };
}

function linearRegressionSimple(rows: RawRow[], yColumn: string, xColumn: string, alpha: number) {
  const pairs = cleanNumericPairs(rows, xColumn, yColumn);
  const n = pairs.length;

  if (n < 3) {
    return {
      test: "Linear regression",
      outcome: yColumn,
      predictor: xColumn,
      pValue: null,
      status: "failed",
      message: "Linear regression requires at least three complete numeric pairs.",
    };
  }

  const xs = pairs.map((p) => p.a);
  const ys = pairs.map((p) => p.b);
  const mx = mean(xs) ?? 0;
  const my = mean(ys) ?? 0;
  const ssx = sum(xs.map((x) => Math.pow(x - mx, 2)));
  const ssy = sum(ys.map((y) => Math.pow(y - my, 2)));
  const sp = sum(xs.map((x, i) => (x - mx) * (ys[i] - my)));
  const slope = ssx > 0 ? sp / ssx : null;
  const intercept = slope !== null ? my - slope * mx : null;
  const fitted = slope === null || intercept === null ? [] : xs.map((x) => intercept + slope * x);
  const residuals = fitted.map((f, i) => ys[i] - f);
  const sse = sum(residuals.map((e) => e * e));
  const rSquared = ssy > 0 ? 1 - sse / ssy : null;
  const mse = n > 2 ? sse / (n - 2) : null;
  const seSlope = mse !== null && ssx > 0 ? Math.sqrt(mse / ssx) : null;
  const tStatistic = slope !== null && seSlope !== null && seSlope > 0 ? slope / seSlope : null;
  const pValue = twoSidedNormalPFromStatistic(tStatistic);

  return {
    test: "Linear regression",
    method: "Simple least-squares regression",
    outcome: yColumn,
    predictor: xColumn,
    n,
    intercept,
    slope,
    statistic: tStatistic,
    tStatistic,
    df: n - 2,
    standardErrorSlope: seSlope,
    r: pearsonCorrelation(xs, ys),
    rSquared,
    pValue,
    significance: inferSignificance(pValue, alpha),
    residualSummary: describeNumeric(residuals),
    fittedPreview: pairs.slice(0, 25).map((p, i) => ({ x: p.a, observed: p.b, fitted: fitted[i], residual: residuals[i] })),
    interpretation:
      pValue !== null && pValue <= alpha
        ? "The numeric predictor is associated with the outcome in simple linear regression."
        : "No significant simple linear association was detected.",
  };
}

function logisticRegressionScreen(rows: RawRow[], outcomeColumn: string, predictorColumn: string, alpha: number) {
  const enc = binaryEncodeOutcome(rows, outcomeColumn);

  if (!enc) {
    return {
      test: "Logistic regression",
      outcome: outcomeColumn,
      predictor: predictorColumn,
      pValue: null,
      status: "failed",
      message: "Logistic regression screen requires a binary outcome.",
    };
  }

  if (!isNumericColumn(rows, predictorColumn)) {
    const cat = analyzeCategoricalRisk(rows, outcomeColumn, predictorColumn);
    return {
      test: "Logistic regression",
      method: "Categorical predictor screening via odds ratio",
      outcome: outcomeColumn,
      predictor: predictorColumn,
      ...cat,
      significance: inferSignificance(cat.pValue, alpha),
    };
  }

  const result = analyzeContinuousRisk(rows, outcomeColumn, predictorColumn);

  return {
    test: "Logistic regression",
    method: "Continuous predictor screening by standardized mean-difference odds-ratio approximation",
    outcome: outcomeColumn,
    predictor: predictorColumn,
    ...result,
    significance: inferSignificance(result.pValue, alpha),
  };
}

function twoWayAnovaScreen(rows: RawRow[], factorText: string, valueColumn: string, alpha: number) {
  const factors = factorText
    .split(/[,+;]/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 2);

  if (factors.length < 2) {
    return {
      test: "Two-way ANOVA",
      variable: valueColumn,
      pValue: null,
      status: "failed",
      message: "Two-way ANOVA requires two factor names in the group column field, separated by comma or semicolon.",
    };
  }

  const [factorA, factorB] = factors;
  const compositeRows = rows.map((r) => ({
    ...r,
    __factorA: r[factorA],
    __factorB: r[factorB],
    __interaction: `${safeText(r[factorA])} × ${safeText(r[factorB])}`,
  }));

  const mainA = oneWayAnova(compositeRows, "__factorA", valueColumn, alpha);
  const mainB = oneWayAnova(compositeRows, "__factorB", valueColumn, alpha);
  const interaction = oneWayAnova(compositeRows, "__interaction", valueColumn, alpha);

  return {
    test: "Two-way ANOVA",
    method: "Two-factor screening by main-effect and interaction one-way decompositions",
    variable: valueColumn,
    factors: [factorA, factorB],
    statistic: interaction.statistic,
    pValue: interaction.pValue,
    significance: inferSignificance(interaction.pValue, alpha),
    mainEffects: [mainA, mainB],
    interaction,
    interpretation: "This lightweight route screens the two main effects and their composite interaction; for final publication, verify with a full two-way ANOVA model in R/Python.",
  };
}

function repeatedMeasuresPlaceholder(valueColumns: string[], alpha: number) {
  return {
    test: "Repeated-measures ANOVA",
    method: "Design check",
    variables: valueColumns,
    pValue: null,
    alpha,
    status: "not_computed_in_lightweight_route",
    message:
      "Repeated-measures ANOVA requires subject IDs and within-subject factor structure. The page can request this test, but this standalone route returns a design-check object unless those fields are added.",
  };
}

function buildAdvancedStatistics(
  rows: RawRow[],
  groupColumn: string,
  valueColumns: string[],
  requestedTests: string[],
  alpha: number
) {
  const profile = describeDataset(rows);
  const numericColumns = profile.columnNames.filter((c) => isNumericColumn(rows, c));
  const selectedNumericColumns = valueColumns.length > 0 ? valueColumns.filter((c) => numericColumns.includes(c)) : numericColumns;
  const selectedTests = requestedTests.length > 0 ? requestedTests : ["descriptive", "correlation"];
  const inferentialTests: any[] = [];

  selectedNumericColumns.forEach((valueColumn) => {
    if (selectedTests.includes("t_test") && groupColumn) {
      inferentialTests.push(independentTTest(rows, groupColumn, valueColumn, alpha));
    }

    if (selectedTests.includes("welch_anova") && groupColumn) {
      inferentialTests.push(welchAnova(rows, groupColumn, valueColumn, alpha));
    }

    if (selectedTests.includes("anova") && groupColumn) {
      inferentialTests.push(oneWayAnova(rows, groupColumn, valueColumn, alpha));
    }

    if (selectedTests.includes("two_way_anova") && groupColumn) {
      inferentialTests.push(twoWayAnovaScreen(rows, groupColumn, valueColumn, alpha));
    }

    if (selectedTests.includes("one_sample_t_test")) {
      inferentialTests.push(oneSampleTTest(rows, valueColumn, alpha));
    }

    if (selectedTests.includes("normality")) {
      inferentialTests.push(normalityScreen(rows, valueColumn, alpha));
    }

    if (selectedTests.includes("levene") && groupColumn) {
      inferentialTests.push(leveneVarianceTest(rows, groupColumn, valueColumn, alpha));
    }

    if (selectedTests.includes("kruskal_wallis") && groupColumn) {
      inferentialTests.push(kruskalWallisTest(rows, groupColumn, valueColumn, alpha));
    }

    if (selectedTests.includes("mann_whitney") && groupColumn) {
      inferentialTests.push(mannWhitneyUTest(rows, groupColumn, valueColumn, alpha));
    }
  });

  if (selectedTests.includes("paired_t_test")) {
    inferentialTests.push(pairedTTest(rows, selectedNumericColumns, alpha));
  }

  if (selectedTests.includes("repeated_measures_anova")) {
    inferentialTests.push(repeatedMeasuresPlaceholder(selectedNumericColumns, alpha));
  }

  if (selectedTests.includes("chi_square") && groupColumn) {
    profile.columnNames
      .filter((c) => c !== groupColumn && !isNumericColumn(rows, c))
      .slice(0, 25)
      .forEach((c) => inferentialTests.push(chiSquareAssociation(rows, groupColumn, c, alpha)));
  }

  if (selectedTests.includes("linear_regression") && selectedNumericColumns.length >= 2) {
    const outcome = selectedNumericColumns[0];
    selectedNumericColumns.slice(1, 10).forEach((predictor) => {
      inferentialTests.push(linearRegressionSimple(rows, outcome, predictor, alpha));
    });
  }

  if (selectedTests.includes("logistic_regression") && groupColumn) {
    profile.columnNames
      .filter((c) => c !== groupColumn)
      .slice(0, 20)
      .forEach((predictor) => inferentialTests.push(logisticRegressionScreen(rows, groupColumn, predictor, alpha)));
  }

  const correlationMatrix = numericColumns.flatMap((a) =>
    numericColumns.map((b) => ({
      x: a,
      y: b,
      correlation: pearsonCorrelation(
        rows.map((r) => Number(r[a])),
        rows.map((r) => Number(r[b]))
      ),
      spearman: spearmanCorrelation(
        rows.map((r) => Number(r[a])),
        rows.map((r) => Number(r[b]))
      ),
    }))
  );

  const correlationPairs = numericColumns.flatMap((a, i) =>
    numericColumns.slice(i + 1).map((b) => ({
      x: a,
      y: b,
      pearson: pearsonCorrelation(
        rows.map((r) => Number(r[a])),
        rows.map((r) => Number(r[b]))
      ),
      spearman: spearmanCorrelation(
        rows.map((r) => Number(r[a])),
        rows.map((r) => Number(r[b]))
      ),
    }))
  );

  return {
    dataset: profile,
    alpha,
    groupColumn,
    requestedTests: selectedTests,
    valueColumns: selectedNumericColumns,
    numericColumns,
    descriptiveStatistics: numericColumns.map((col) => ({
      variable: col,
      ...describeNumeric(rows.map((r) => Number(r[col]))),
      missing: missingCount(rows, col),
      normalityScreen: normalityScreen(rows, col, alpha),
    })),
    inferentialTests,
    tests: inferentialTests,
    inferential: inferentialTests,
    correlationMatrix,
    correlations: correlationPairs,
    modelOutputs: inferentialTests.filter((t) =>
      ["Linear regression", "Logistic regression"].includes(String(t.test))
    ),
    assumptionChecks: inferentialTests.filter((t) =>
      ["Normality test", "Levene variance test"].includes(String(t.test))
    ),
    significantFindings: inferentialTests.filter(
      (t) => Number.isFinite(t.pValue) && Number(t.pValue) <= alpha
    ),
    publicationSummary: {
      rows: rows.length,
      columns: profile.columns,
      numericVariables: numericColumns.length,
      testsComputed: inferentialTests.length,
      significantAtAlpha: inferentialTests.filter(
        (t) => Number.isFinite(t.pValue) && Number(t.pValue) <= alpha
      ).length,
      note:
        "This Next.js route provides an in-app statistical screening layer. For manuscript submission, validate exact p-values and model assumptions using a dedicated statistical package when required.",
    },
    visualization: {
      variableCards: profile.variableProfile,
      correlationHeatmap: correlationMatrix,
      numericSummaryBars: numericColumns.map((col) => ({
        variable: col,
        mean: mean(rows.map((r) => Number(r[col]))),
        sd: sd(rows.map((r) => Number(r[col]))),
        median: median(rows.map((r) => Number(r[col]))),
        min: describeNumeric(rows.map((r) => Number(r[col]))).min,
        max: describeNumeric(rows.map((r) => Number(r[col]))).max,
      })),
      pValueBars: inferentialTests
        .filter((t) => Number.isFinite(t.pValue))
        .map((t) => ({
          test: t.test,
          variable: t.variable ?? t.outcome ?? t.predictor ?? "model",
          pValue: t.pValue,
          significant: Number(t.pValue) <= alpha,
        })),
    },
  };
}


function connectedComponents(nodes: string[], edges: NetworkEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((node) => adjacency.set(node, new Set()));

  edges.forEach((edge) => {
    adjacency.get(edge.source)?.add(edge.target);
    adjacency.get(edge.target)?.add(edge.source);
  });

  const visited = new Set<string>();
  const components: string[][] = [];

  nodes.forEach((start) => {
    if (visited.has(start)) return;

    const stack = [start];
    const component: string[] = [];
    visited.add(start);

    while (stack.length > 0) {
      const node = stack.pop()!;
      component.push(node);

      adjacency.get(node)?.forEach((neighbor) => {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push(neighbor);
        }
      });
    }

    components.push(component);
  });

  return components;
}

function shortestPathLengthsFrom(start: string, nodes: string[], adjacency: Map<string, Set<string>>) {
  const distance = new Map<string, number>();
  nodes.forEach((n) => distance.set(n, Number.POSITIVE_INFINITY));
  distance.set(start, 0);

  const queue = [start];
  while (queue.length > 0) {
    const node = queue.shift()!;
    const currentDistance = distance.get(node) ?? 0;

    adjacency.get(node)?.forEach((neighbor) => {
      if ((distance.get(neighbor) ?? Number.POSITIVE_INFINITY) === Number.POSITIVE_INFINITY) {
        distance.set(neighbor, currentDistance + 1);
        queue.push(neighbor);
      }
    });
  }

  return distance;
}

function approximateBetweenness(nodes: string[], edges: NetworkEdge[]) {
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((n) => adjacency.set(n, new Set()));
  edges.forEach((e) => {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  });

  const betweenness = new Map<string, number>();
  nodes.forEach((n) => betweenness.set(n, 0));

  for (let s = 0; s < nodes.length; s++) {
    for (let t = s + 1; t < nodes.length; t++) {
      const source = nodes[s];
      const target = nodes[t];
      const distances = shortestPathLengthsFrom(source, nodes, adjacency);
      const shortest = distances.get(target);
      if (!Number.isFinite(shortest) || shortest === 0) continue;

      nodes.forEach((candidate) => {
        if (candidate === source || candidate === target) return;
        const d1 = shortestPathLengthsFrom(source, nodes, adjacency).get(candidate);
        const d2 = shortestPathLengthsFrom(candidate, nodes, adjacency).get(target);
        if (Number.isFinite(d1) && Number.isFinite(d2) && (d1 ?? 0) + (d2 ?? 0) === shortest) {
          betweenness.set(candidate, (betweenness.get(candidate) ?? 0) + 1);
        }
      });
    }
  }

  const normalizer = nodes.length > 2 ? ((nodes.length - 1) * (nodes.length - 2)) / 2 : 1;
  return nodes.map((node) => ({
    node,
    betweenness: normalizer > 0 ? (betweenness.get(node) ?? 0) / normalizer : 0,
  }));
}

function eigenvectorCentrality(nodes: string[], edges: NetworkEdge[], iterations = 40) {
  const index = new Map(nodes.map((node, i) => [node, i]));
  let scores = Array(nodes.length).fill(1 / Math.max(nodes.length, 1));

  for (let iter = 0; iter < iterations; iter++) {
    const next = Array(nodes.length).fill(0);
    edges.forEach((edge) => {
      const s = index.get(edge.source);
      const t = index.get(edge.target);
      if (s === undefined || t === undefined) return;
      const weight = Math.max(1, edge.movements);
      next[t] += scores[s] * weight;
      next[s] += scores[t] * weight;
    });

    const norm = Math.sqrt(sum(next.map((v) => v * v))) || 1;
    scores = next.map((v) => v / norm);
  }

  return nodes.map((node, i) => ({ node, eigenvectorCentrality: scores[i] ?? 0 }));
}

function analyzeNetwork(edges: NetworkEdge[]) {
  const cleanedEdges = edges.map((e, i) => ({
    edgeId: e.edgeId || `E${i + 1}`,
    source: safeText(e.source),
    target: safeText(e.target),
    edgeType: safeText(e.edgeType, "movement"),
    distanceKm: safeNumber(e.distanceKm, 0),
    movements: Math.max(0, safeNumber(e.movements, 1)),
  })).filter((e) => e.source && e.target);

  const nodes = Array.from(new Set(cleanedEdges.flatMap((e) => [e.source, e.target])));
  const adjacency = new Map<string, Set<string>>();
  nodes.forEach((n) => adjacency.set(n, new Set()));

  cleanedEdges.forEach((e) => {
    adjacency.get(e.source)?.add(e.target);
    adjacency.get(e.target)?.add(e.source);
  });

  const components = connectedComponents(nodes, cleanedEdges);
  const maxMovement = Math.max(...cleanedEdges.map((e) => e.movements), 1);
  const maxDistance = Math.max(...cleanedEdges.map((e) => e.distanceKm), 1);
  const totalMovements = sum(cleanedEdges.map((e) => e.movements));
  const density = nodes.length > 1 ? (2 * cleanedEdges.length) / (nodes.length * (nodes.length - 1)) : 0;
  const meanDistanceKm = mean(cleanedEdges.map((e) => e.distanceKm));
  const betweenness = approximateBetweenness(nodes, cleanedEdges);
  const eigen = eigenvectorCentrality(nodes, cleanedEdges);

  const nodeMetrics = nodes.map((node, idx) => {
    const incident = cleanedEdges.filter((e) => e.source === node || e.target === node);
    const outgoing = cleanedEdges.filter((e) => e.source === node);
    const incoming = cleanedEdges.filter((e) => e.target === node);
    const degree = adjacency.get(node)?.size ?? 0;
    const weightedMovements = sum(incident.map((e) => e.movements));
    const inStrength = sum(incoming.map((e) => e.movements));
    const outStrength = sum(outgoing.map((e) => e.movements));
    const closenessDistances = shortestPathLengthsFrom(node, nodes, adjacency);
    const finiteDistances = Array.from(closenessDistances.values()).filter((d) => Number.isFinite(d) && d > 0);
    const closeness = finiteDistances.length > 0 ? finiteDistances.length / sum(finiteDistances) : 0;
    const componentIndex = components.findIndex((component) => component.includes(node));
    const angle = (2 * Math.PI * idx) / Math.max(nodes.length, 1);
    const radius = 0.55 + Math.min(0.4, degree / Math.max(nodes.length - 1, 1));
    const b = betweenness.find((x) => x.node === node)?.betweenness ?? 0;
    const ev = eigen.find((x) => x.node === node)?.eigenvectorCentrality ?? 0;
    const movementPressure = totalMovements > 0 ? weightedMovements / totalMovements : 0;
    const localReach = nodes.length > 1 ? degree / (nodes.length - 1) : 0;
    const riskScore = Math.min(100, movementPressure * 55 + localReach * 30 + b * 15);

    return {
      id: node,
      node,
      degree,
      inDegree: new Set(incoming.map((e) => e.source)).size,
      outDegree: new Set(outgoing.map((e) => e.target)).size,
      weightedMovements,
      inStrength,
      outStrength,
      meanDistanceKm: mean(incident.map((e) => e.distanceKm)),
      maxDistanceKm: incident.length ? Math.max(...incident.map((e) => e.distanceKm)) : 0,
      betweenness: b,
      closeness,
      eigenvectorCentrality: ev,
      movementPressure,
      localReach,
      riskScore,
      componentIndex,
      componentSize: components[componentIndex]?.length ?? 1,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      visual: {
        radius: 10 + Math.min(30, degree * 4 + weightedMovements * 0.3),
        label: `${node} | degree ${degree} | movement ${weightedMovements}`,
        category:
          riskScore >= 60 ? "critical_hub" : riskScore >= 30 ? "high_connector" : degree > 0 ? "connected" : "isolated",
      },
      interpretation:
        riskScore >= 60
          ? "High-priority hub: strong movement pressure and network connectivity."
          : riskScore >= 30
          ? "Important connector: monitor movement and contact pathways."
          : "Lower network priority under the supplied edge data.",
    };
  });

  const sortedDegree = [...nodeMetrics].sort((a, b) => b.degree - a.degree || b.weightedMovements - a.weightedMovements);
  const sortedRisk = [...nodeMetrics].sort((a, b) => b.riskScore - a.riskScore);
  const sortedBetweenness = [...nodeMetrics].sort((a, b) => b.betweenness - a.betweenness);

  const edgeMetrics = cleanedEdges.map((edge) => {
    const movementIntensity = maxMovement > 0 ? edge.movements / maxMovement : 0;
    const distanceIntensity = maxDistance > 0 ? edge.distanceKm / maxDistance : 0;
    const sourceRisk = nodeMetrics.find((n) => n.id === edge.source)?.riskScore ?? 0;
    const targetRisk = nodeMetrics.find((n) => n.id === edge.target)?.riskScore ?? 0;
    const pathwayRisk = Math.min(100, movementIntensity * 50 + distanceIntensity * 20 + ((sourceRisk + targetRisk) / 2) * 0.3);

    return {
      ...edge,
      id: edge.edgeId,
      movementIntensity,
      distanceIntensity,
      sourceRisk,
      targetRisk,
      pathwayRisk,
      width: 1 + movementIntensity * 8,
      opacity: 0.35 + movementIntensity * 0.65,
      arrow: true,
      tooltip:
        `${edge.source} → ${edge.target}\n` +
        `Type: ${edge.edgeType}\n` +
        `Movements: ${edge.movements}\n` +
        `Distance: ${edge.distanceKm} km\n` +
        `Pathway risk: ${pathwayRisk.toFixed(2)}`,
      interpretation:
        pathwayRisk >= 60
          ? "High-intensity movement pathway."
          : pathwayRisk >= 30
          ? "Moderate movement pathway."
          : "Lower-intensity pathway.",
    };
  });

  const edgeTypes = Array.from(new Set(cleanedEdges.map((e) => e.edgeType))).map((edgeType) => {
    const subset = cleanedEdges.filter((e) => e.edgeType === edgeType);
    return {
      edgeType,
      count: subset.length,
      totalMovements: sum(subset.map((e) => e.movements)),
      meanMovements: mean(subset.map((e) => e.movements)),
      meanDistanceKm: mean(subset.map((e) => e.distanceKm)),
    };
  });

  const adjacencyMatrix = nodes.map((source) => ({
    source,
    values: nodes.map((target) => ({
      target,
      movements: sum(cleanedEdges.filter((e) => e.source === source && e.target === target).map((e) => e.movements)),
      undirectedMovements: sum(cleanedEdges.filter((e) => (e.source === source && e.target === target) || (e.source === target && e.target === source)).map((e) => e.movements)),
    })),
  }));

  const movementThresholds = [0, 1, 5, 10, 25, 50, 100].map((threshold) => ({
    threshold,
    retainedEdges: edgeMetrics.filter((e) => e.movements >= threshold).length,
    retainedMovements: sum(edgeMetrics.filter((e) => e.movements >= threshold).map((e) => e.movements)),
  }));

  const complexityIndex = Math.min(
    100,
    density * 30 +
      Math.log1p(totalMovements) * 8 +
      components.length * 3 +
      (sortedRisk[0]?.riskScore ?? 0) * 0.35 +
      edgeTypes.length * 2
  );

  const graph = {
    nodes: nodeMetrics.map((n) => ({
      id: n.id,
      label: n.id,
      x: n.x,
      y: n.y,
      size: n.visual.radius,
      degree: n.degree,
      weightedMovements: n.weightedMovements,
      riskScore: n.riskScore,
      componentIndex: n.componentIndex,
      category: n.visual.category,
      tooltip: `${n.id}\nDegree: ${n.degree}\nMovements: ${n.weightedMovements}\nRisk score: ${n.riskScore.toFixed(2)}`,
    })),
    edges: edgeMetrics.map((e) => ({
      id: e.edgeId,
      source: e.source,
      target: e.target,
      type: e.edgeType,
      weight: e.movements,
      distanceKm: e.distanceKm,
      width: e.width,
      opacity: e.opacity,
      pathwayRisk: e.pathwayRisk,
      tooltip: e.tooltip,
    })),
  };

  return {
    nodes: nodeMetrics,
    edges: edgeMetrics,
    graph,
    statistics: {
      nodeCount: nodes.length,
      edgeCount: cleanedEdges.length,
      density,
      totalMovements,
      meanMovementsPerEdge: cleanedEdges.length > 0 ? totalMovements / cleanedEdges.length : null,
      meanDistanceKm,
      medianDistanceKm: median(cleanedEdges.map((e) => e.distanceKm)),
      maxDistanceKm: cleanedEdges.length ? Math.max(...cleanedEdges.map((e) => e.distanceKm)) : 0,
      componentCount: components.length,
      largestComponentSize: Math.max(...components.map((c) => c.length), 0),
      isolatedNodeCount: nodeMetrics.filter((n) => n.degree === 0).length,
      highestDegreeNode: sortedDegree[0] ?? null,
      highestRiskNode: sortedRisk[0] ?? null,
      highestBetweennessNode: sortedBetweenness[0] ?? null,
      complexityIndex,
      networkCategory:
        complexityIndex >= 70
          ? "highly_complex"
          : complexityIndex >= 40
          ? "moderately_complex"
          : "low_to_moderate_complexity",
    },
    centrality: {
      degree: sortedDegree,
      risk: sortedRisk,
      betweenness: sortedBetweenness,
      eigenvector: [...nodeMetrics].sort((a, b) => b.eigenvectorCentrality - a.eigenvectorCentrality),
      closeness: [...nodeMetrics].sort((a, b) => b.closeness - a.closeness),
    },
    components,
    adjacencyMatrix,
    edgeTypeSummary: edgeTypes,
    filters: {
      movementThresholds,
      recommendedDefaultThreshold: median(cleanedEdges.map((e) => e.movements)) ?? 0,
      edgeTypes: edgeTypes.map((e) => e.edgeType),
    },
    interpretation: {
      overview:
        nodes.length === 0
          ? "No analyzable network was supplied."
          : `The network contains ${nodes.length} nodes and ${cleanedEdges.length} edges with density ${density.toFixed(4)}.`,
      keyHub:
        sortedRisk[0]
          ? `${sortedRisk[0].node} is the highest-priority movement hub by integrated risk score.`
          : "No hub could be identified.",
      controlSuggestion:
        sortedRisk.length > 0
          ? "Prioritize surveillance, movement auditing, quarantine review, and targeted biosecurity interventions around high-risk hubs and high-pathway-risk edges."
          : "Add node and edge data to generate control recommendations.",
    },
    visualization: {
      degreeBars: sortedDegree.map((n) => ({
        node: n.node,
        degree: n.degree,
        weightedMovements: n.weightedMovements,
        riskScore: n.riskScore,
      })),
      riskBars: sortedRisk.map((n) => ({
        node: n.node,
        riskScore: n.riskScore,
        degree: n.degree,
        weightedMovements: n.weightedMovements,
      })),
      movementHistogram: edgeMetrics.map((e) => ({
        edgeId: e.edgeId,
        source: e.source,
        target: e.target,
        movements: e.movements,
        distanceKm: e.distanceKm,
        pathwayRisk: e.pathwayRisk,
      })),
      edgeTypeDonut: edgeTypes,
      adjacencyHeatmap: adjacencyMatrix.flatMap((row) =>
        row.values.map((cell) => ({
          source: row.source,
          target: cell.target,
          movements: cell.movements,
          undirectedMovements: cell.undirectedMovements,
        }))
      ),
      interactiveGraph: graph,
    },
  };
}

function analyzeStatistics(
  rows: RawRow[],
  groupColumn = "",
  valueColumns: string[] = [],
  tests: string[] = [],
  alpha = 0.05
) {
  return buildAdvancedStatistics(rows, groupColumn, valueColumns, tests, alpha);
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
        module: "Interactive Network Analysis",
        rows: edges.length,
        network: analyzeNetwork(edges),
        notes: [
          "Network output is graph-ready and includes nodes, edges, interactiveGraph, centrality tables, risk scores, movement filters, adjacency matrix, edge-type summary, and interpretation blocks.",
          "The frontend can render node degree ranking, complexity panels, clickable nodes, movement-weighted edges, tooltips, and JSON downloads directly from this response shape.",
        ],
      });
    }

    if (moduleName === "statistics") {
      const file = formData.get("file") as File | null;
      const groupColumn = String(formData.get("groupColumn") || "").trim();
      const valueColumns = String(formData.get("valueColumns") || "")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const tests = String(formData.get("tests") || "descriptive,correlation")
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const alpha = safeNumber(formData.get("alpha"), 0.05);

      if (!file) {
        return NextResponse.json(
          { error: "No CSV file uploaded." },
          { status: 400 }
        );
      }

      const rows = parseCSV(await file.text());

      return NextResponse.json({
        status: "success",
        module: "Advanced Statistical Analysis",
        rows: rows.length,
        statistics: analyzeStatistics(rows, groupColumn, valueColumns, tests, alpha),
        notes: [
          "The updated page sends groupColumn, valueColumns, tests, and alpha to this route.",
          "This route returns descriptive statistics, inferentialTests/tests arrays, correlations, assumption checks, model outputs, and visualization-ready summaries.",
          "P-values are lightweight approximations for dashboard screening; verify final manuscript statistics in R, Python, SPSS, or another dedicated statistical package when required.",
        ],
      });
    }

    if (moduleName === "evolutionary") {
      return NextResponse.json(
        {
          status: "removed",
          module: "Evolutionary Analysis",
          error:
            "EGStat-N evolutionary analysis has been removed from this route. Use QI-GeneX-N for sequence/genomics workflows.",
          notes: [
            "The updated EGStat-N page contains Transmission, Risk Analysis, Statistics, and Network modules only.",
            "This branch intentionally returns HTTP 410 so older frontend builds do not silently run deprecated evolutionary code.",
          ],
        },
        { status: 410 }
      );
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
      rows = normalizeLogicRows(
        JSON.parse(String(formData.get("rows") || "[]")) as ObsRow[]
      );
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
        "Initial observation supports Abortion_Count.",
        "Confirmatory_Diagnosis is always treated as I.",
        "Correct N logic: New N = previous N - previous Pending_Culled + moved in - moved out.",
        "S is recalculated as N - (E + I + R).",
        "Output includes farm-wise data, overall SEIR dynamics, rankings, interactive heatmap-ready GeoJSON, normal map style, satellite map style, map bounds, popups, and point layer data.",
      ],
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Analysis failed." },
      { status: 500 }
    );
  }
}
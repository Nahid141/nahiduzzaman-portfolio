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

function parseFASTA(text: string): SequenceRecord[] {
  const clean = text.trim();
  if (!clean) return [];

  const blocks = clean.split(/^>/m).filter(Boolean);

  return blocks
    .map((block, index) => {
      const lines = block.split(/\r?\n/).filter(Boolean);
      const id = lines[0]?.trim() || `sequence_${index + 1}`;
      const sequence = lines
        .slice(1)
        .join("")
        .replace(/\s+/g, "")
        .toUpperCase();

      return { id, sequence };
    })
    .filter((record) => record.sequence.length > 0);
}

function gcContent(sequence: string): number | null {
  if (!sequence.length) return null;

  const gc = sequence
    .split("")
    .filter((base) => base === "G" || base === "C").length;

  return gc / sequence.length;
}

function countAmbiguousBases(sequence: string): number {
  return sequence
    .split("")
    .filter((base) => !["A", "T", "G", "C", "-"].includes(base)).length;
}

function consensusSequence(sequences: string[]): string {
  if (sequences.length === 0) return "";

  const maxLen = Math.max(...sequences.map((seq) => seq.length));
  const bases = ["A", "T", "G", "C", "N", "-"];
  let consensus = "";

  for (let i = 0; i < maxLen; i++) {
    const counts: Record<string, number> = {};

    bases.forEach((base) => {
      counts[base] = 0;
    });

    sequences.forEach((seq) => {
      const base = seq[i] ?? "N";
      counts[base] = (counts[base] ?? 0) + 1;
    });

    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    consensus += best;
  }

  return consensus;
}

function hammingDistance(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let distance = Math.abs(a.length - b.length);

  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) distance += 1;
  }

  return distance;
}

function analyzeGenomics(records: SequenceRecord[]) {
  if (records.length === 0) {
    return {
      count: 0,
      message: "No FASTA sequences supplied.",
      sequenceSummaries: [],
      mutationHotspots: [],
      pairwiseDistances: [],
    };
  }

  const sequences = records.map((record) => record.sequence);
  const consensus = consensusSequence(sequences);

  const sequenceSummaries = records.map((record) => ({
    id: record.id,
    length: record.sequence.length,
    gcContent: gcContent(record.sequence),
    ambiguousBases: countAmbiguousBases(record.sequence),
    distanceToConsensus: hammingDistance(record.sequence, consensus),
  }));

  const mutationProfile = consensus.split("").map((base, index) => {
    const column = sequences.map((seq) => seq[index] ?? "N");
    const unique = Array.from(new Set(column));
    const nonConsensusCount = column.filter((b) => b !== base).length;

    return {
      position: index + 1,
      consensusBase: base,
      variantCount: unique.length,
      variants: unique.join(","),
      nonConsensusCount,
      variabilityScore: unique.length - 1,
      frequencyNonConsensus:
        column.length > 0 ? nonConsensusCount / column.length : null,
    };
  });

  const mutationHotspots = mutationProfile
    .filter((m) => m.variabilityScore > 0)
    .sort((a, b) => {
      if (b.variabilityScore !== a.variabilityScore) {
        return b.variabilityScore - a.variabilityScore;
      }
      return b.nonConsensusCount - a.nonConsensusCount;
    })
    .slice(0, 50);

  const pairwiseDistances: any[] = [];

  for (let i = 0; i < records.length; i++) {
    for (let j = i + 1; j < records.length; j++) {
      pairwiseDistances.push({
        from: records[i].id,
        to: records[j].id,
        distance: hammingDistance(records[i].sequence, records[j].sequence),
      });
    }
  }

  return {
    count: records.length,
    uniqueSequenceCount: new Set(sequences).size,
    consensusLength: consensus.length,
    meanLength: mean(records.map((record) => record.sequence.length)),
    meanGCContent: mean(
      records
        .map((record) => gcContent(record.sequence))
        .filter((x): x is number => x !== null)
    ),
    meanAmbiguousBases: mean(
      records.map((record) => countAmbiguousBases(record.sequence))
    ),
    consensusPreview: consensus.slice(0, 500),
    sequenceSummaries,
    mutationHotspots,
    pairwiseDistances,
    nucleotideDiversityApproximation: mean(
      pairwiseDistances.map((p) => p.distance)
    ),
    interpretation: {
      diversity:
        new Set(sequences).size > 1
          ? "Multiple sequence types/haplotypes detected."
          : "No sequence diversity detected among supplied sequences.",
      hotspots:
        mutationHotspots.length > 0
          ? "Variable sites were detected and ranked as mutation hotspots."
          : "No variable sites detected from supplied sequences.",
    },
  };
}

function normalizeAnimalRows(rows: RawRow[]) {
  return rows.map((r, index) => ({
    animalId: safeText(r.animal_id ?? r.Animal_ID ?? r.id, `animal_${index + 1}`),
    species: safeText(r.species ?? r.Species),
    age: safeNumber(r.age ?? r.Age, NaN),
    sex: safeText(r.sex ?? r.Sex),
    diseaseState: safeText(
      r.disease_state ?? r["Disease State"] ?? r.Disease_State
    ),
    immunityScore: safeNumber(
      r.immunity_score ?? r["Immunity Score"] ?? r.Immunity_Score,
      NaN
    ),
    serumPathogenLoad: safeNumber(
      r.serum_pathogen_load ??
        r["Serum Pathogen Load"] ??
        r.Serum_Pathogen_Load,
      NaN
    ),
    vaccineStrain: safeText(
      r.vaccine_strain ?? r["Vaccine Strain"] ?? r.Vaccine_Strain
    ),
    vaccineStrainSequence: safeText(
      r.vaccine_strain_sequence ??
        r["Vaccine Strain Sequence"] ??
        r.Vaccine_Strain_Sequence
    ),
    vaccinationDate: safeText(
      r.vaccination_date ?? r["Vaccination Date"] ?? r.Vaccination_Date
    ),
    antibodyTiter: safeNumber(
      r.antibody_titer ?? r["Antibody Titer"] ?? r.Antibody_Titer,
      NaN
    ),
    coInfections: safeText(
      r.co_infections ?? r["Co-infections"] ?? r.coinfections
    ),
    bodyTemperature: safeNumber(
      r.body_temperature ?? r["Body Temperature"] ?? r.Body_Temperature,
      NaN
    ),
    clinicalScore: safeNumber(
      r.clinical_score ?? r["Clinical Score"] ?? r.Clinical_Score,
      NaN
    ),
    weight: safeNumber(r.weight ?? r.Weight, NaN),
    farmId: safeText(r.farm_id ?? r.Farm_ID ?? r.Farm),
    location: safeText(r.location ?? r.Location),
  }));
}

function analyzeAnimalLevel(rows: RawRow[]) {
  const normalized = normalizeAnimalRows(rows);

  if (normalized.length === 0) {
    return {
      count: 0,
      message: "No animal-level data supplied.",
    };
  }

  const diseaseStates = Array.from(
    new Set(normalized.map((r) => r.diseaseState).filter(Boolean))
  ).map((level) => ({
    level,
    count: normalized.filter((r) => r.diseaseState === level).length,
  }));

  const speciesDistribution = Array.from(
    new Set(normalized.map((r) => r.species).filter(Boolean))
  ).map((level) => ({
    level,
    count: normalized.filter((r) => r.species === level).length,
  }));

  const sexDistribution = Array.from(
    new Set(normalized.map((r) => r.sex).filter(Boolean))
  ).map((level) => ({
    level,
    count: normalized.filter((r) => r.sex === level).length,
  }));

  const vaccineStrainDistribution = Array.from(
    new Set(normalized.map((r) => r.vaccineStrain).filter(Boolean))
  ).map((level) => ({
    level,
    count: normalized.filter((r) => r.vaccineStrain === level).length,
  }));

  const coInfectionDistribution = Array.from(
    new Set(normalized.map((r) => r.coInfections).filter(Boolean))
  ).map((level) => ({
    level,
    count: normalized.filter((r) => r.coInfections === level).length,
  }));

  return {
    count: normalized.length,
    speciesDistribution,
    sexDistribution,
    diseaseStates,
    vaccineStrainDistribution,
    coInfectionDistribution,
    numericSummary: {
      age: describeNumeric(normalized.map((r) => r.age)),
      immunityScore: describeNumeric(normalized.map((r) => r.immunityScore)),
      serumPathogenLoad: describeNumeric(
        normalized.map((r) => r.serumPathogenLoad)
      ),
      antibodyTiter: describeNumeric(normalized.map((r) => r.antibodyTiter)),
      bodyTemperature: describeNumeric(
        normalized.map((r) => r.bodyTemperature)
      ),
      clinicalScore: describeNumeric(normalized.map((r) => r.clinicalScore)),
      weight: describeNumeric(normalized.map((r) => r.weight)),
    },
    correlationSignals: [
      {
        x: "immunityScore",
        y: "serumPathogenLoad",
        correlation: pearsonCorrelation(
          normalized.map((r) => r.immunityScore),
          normalized.map((r) => r.serumPathogenLoad)
        ),
      },
      {
        x: "antibodyTiter",
        y: "serumPathogenLoad",
        correlation: pearsonCorrelation(
          normalized.map((r) => r.antibodyTiter),
          normalized.map((r) => r.serumPathogenLoad)
        ),
      },
      {
        x: "clinicalScore",
        y: "serumPathogenLoad",
        correlation: pearsonCorrelation(
          normalized.map((r) => r.clinicalScore),
          normalized.map((r) => r.serumPathogenLoad)
        ),
      },
    ],
    riskSignals: {
      lowImmunityCount: normalized.filter(
        (r) => Number.isFinite(r.immunityScore) && r.immunityScore < 40
      ).length,
      highPathogenLoadCount: normalized.filter(
        (r) => Number.isFinite(r.serumPathogenLoad) && r.serumPathogenLoad > 7
      ).length,
      highClinicalScoreCount: normalized.filter(
        (r) => Number.isFinite(r.clinicalScore) && r.clinicalScore >= 3
      ).length,
      coInfectedCount: normalized.filter((r) => r.coInfections).length,
    },
    rows: normalized,
  };
}

function normalizeGeoTemporalRows(rows: RawRow[]) {
  return rows.map((r, index) => ({
    id: safeText(r.id ?? r.ID, `geo_${index + 1}`),
    farmId: safeText(r.farm_id ?? r.Farm_ID ?? r.Farm),
    location: safeText(r.location ?? r.Location),
    latitude: safeNumber(r.latitude ?? r.Latitude ?? r.lat, NaN),
    longitude: safeNumber(r.longitude ?? r.Longitude ?? r.lon ?? r.lng, NaN),
    date: safeText(r.date ?? r.Date, today()),
    cases: safeNumber(r.cases ?? r.Cases ?? r.ill_animals ?? r.Ill_Animals, 0),
    deaths: safeNumber(r.deaths ?? r.Deaths, 0),
    clusterId: safeText(r.cluster_id ?? r.Cluster_ID ?? r.cluster),
    siteType: safeText(r.site_type ?? r.Site_Type ?? r.site),
    movementExposure: safeNumber(
      r.movement_exposure ?? r.Movement_Exposure,
      0
    ),
  }));
}

function analyzeGeoTemporal(rows: RawRow[]) {
  const normalized = normalizeGeoTemporalRows(rows);

  if (normalized.length === 0) {
    return {
      count: 0,
      message: "No geospatial/temporal data supplied.",
      heatmapGeoJSON: {
        type: "FeatureCollection",
        features: [],
      },
    };
  }

  const validDates = normalized.map((r) => r.date).filter(Boolean).sort();

  const heatmapFeatures = normalized
    .filter(
      (r) =>
        Number.isFinite(r.latitude) &&
        Number.isFinite(r.longitude) &&
        Math.abs(r.latitude) <= 90 &&
        Math.abs(r.longitude) <= 180
    )
    .map((r) => ({
      type: "Feature",
      properties: {
        id: r.id,
        farmId: r.farmId,
        location: r.location,
        date: r.date,
        cases: r.cases,
        deaths: r.deaths,
        clusterId: r.clusterId,
        siteType: r.siteType,
        movementExposure: r.movementExposure,
        heatWeight: Math.max(1, r.cases + r.deaths * 2 + r.movementExposure),
        popupHTML:
          `<strong>${r.farmId || r.location || r.id}</strong><br/>` +
          `Date: ${r.date}<br/>` +
          `Cases: ${r.cases}<br/>` +
          `Deaths: ${r.deaths}<br/>` +
          `Cluster: ${r.clusterId || "NA"}`,
      },
      geometry: {
        type: "Point",
        coordinates: [r.longitude, r.latitude],
      },
    }));

  const locations = Array.from(
    new Set(normalized.map((r) => r.location).filter(Boolean))
  );

  const timeline = Array.from(new Set(validDates)).map((date) => ({
    date,
    count: normalized.filter((r) => r.date === date).length,
    totalCases: sum(normalized.filter((r) => r.date === date).map((r) => r.cases)),
    totalDeaths: sum(
      normalized.filter((r) => r.date === date).map((r) => r.deaths)
    ),
  }));

  return {
    count: normalized.length,
    firstDate: validDates[0] ?? null,
    lastDate: validDates[validDates.length - 1] ?? null,
    locations,
    locationCount: locations.length,
    timeline,
    totalCases: sum(normalized.map((r) => r.cases)),
    totalDeaths: sum(normalized.map((r) => r.deaths)),
    heatmapGeoJSON: {
      type: "FeatureCollection",
      features: heatmapFeatures,
    },
    rows: normalized,
  };
}

function normalizeCircumstantialRows(rows: RawRow[]) {
  return rows.map((r, index) => ({
    id: safeText(r.id ?? r.ID, `circumstantial_${index + 1}`),
    farmId: safeText(r.farm_id ?? r.Farm_ID ?? r.Farm),
    numberOfAnimalsReared: safeNumber(
      r.number_of_animals_reared ??
        r["Number of Animals Reared"] ??
        r.animals_reared,
      NaN
    ),
    howManyIll: safeNumber(
      r.how_many_ill ?? r["How Many Ill"] ?? r.ill_animals,
      NaN
    ),
    similarSymptomsSeenIn: safeText(
      r.similar_symptoms_seen_in ??
        r["Similar Symptoms Seen In"] ??
        r.similar_symptoms
    ),
    durationDays: safeNumber(
      r.duration_days ?? r["Duration Days"] ?? r.duration,
      NaN
    ),
    drugAdministered: safeText(
      r.drug_administered ?? r["Drug Administered"] ?? r.drug
    ),
    managementSystem: safeText(
      r.management_system ?? r["Management System"] ?? r.management
    ),
    biosecurityScore: safeNumber(
      r.biosecurity_score ?? r["Biosecurity Score"] ?? r.biosecurity,
      NaN
    ),
    feedSource: safeText(r.feed_source ?? r["Feed Source"]),
    waterSource: safeText(r.water_source ?? r["Water Source"]),
    vectorExposure: safeText(r.vector_exposure ?? r["Vector Exposure"]),
    recentAnimalIntroduction: safeText(
      r.recent_animal_introduction ?? r["Recent Animal Introduction"]
    ),
  }));
}

function analyzeCircumstantial(rows: RawRow[]) {
  const normalized = normalizeCircumstantialRows(rows);

  if (normalized.length === 0) {
    return {
      count: 0,
      message: "No circumstantial evidence supplied.",
    };
  }

  const morbidityRates = normalized
    .map((r) =>
      Number.isFinite(r.numberOfAnimalsReared) && r.numberOfAnimalsReared > 0
        ? r.howManyIll / r.numberOfAnimalsReared
        : NaN
    )
    .filter((v) => Number.isFinite(v));

  const drugUse = Array.from(
    new Set(normalized.map((r) => r.drugAdministered).filter(Boolean))
  ).map((level) => ({
    level,
    count: normalized.filter((r) => r.drugAdministered === level).length,
  }));

  const managementSystems = Array.from(
    new Set(normalized.map((r) => r.managementSystem).filter(Boolean))
  ).map((level) => ({
    level,
    count: normalized.filter((r) => r.managementSystem === level).length,
  }));

  const symptomDistribution = Array.from(
    new Set(normalized.map((r) => r.similarSymptomsSeenIn).filter(Boolean))
  ).map((level) => ({
    level,
    count: normalized.filter((r) => r.similarSymptomsSeenIn === level).length,
  }));

  return {
    count: normalized.length,
    animalsRearedSummary: describeNumeric(
      normalized.map((r) => r.numberOfAnimalsReared)
    ),
    illAnimalsSummary: describeNumeric(normalized.map((r) => r.howManyIll)),
    durationSummary: describeNumeric(normalized.map((r) => r.durationDays)),
    biosecuritySummary: describeNumeric(
      normalized.map((r) => r.biosecurityScore)
    ),
    morbidityRateMean: mean(morbidityRates),
    morbidityRateMedian: median(morbidityRates),
    drugUse,
    managementSystems,
    symptomDistribution,
    feedSources: Array.from(
      new Set(normalized.map((r) => r.feedSource).filter(Boolean))
    ),
    waterSources: Array.from(
      new Set(normalized.map((r) => r.waterSource).filter(Boolean))
    ),
    vectorExposureCount: normalized.filter((r) => r.vectorExposure).length,
    recentAnimalIntroductionCount: normalized.filter(
      (r) => r.recentAnimalIntroduction
    ).length,
    rows: normalized,
  };
}

function analyzeEvolutionary(
  animalRows: RawRow[],
  geoRows: RawRow[],
  circumstantialRows: RawRow[],
  fastaText: string
) {
  const animal = analyzeAnimalLevel(animalRows);
  const geoTemporal = analyzeGeoTemporal(geoRows);
  const circumstantial = analyzeCircumstantial(circumstantialRows);
  const genomics = analyzeGenomics(parseFASTA(fastaText));

  const lowImmunityCount = Number(animal?.riskSignals?.lowImmunityCount ?? 0);
  const highPathogenLoadCount = Number(
    animal?.riskSignals?.highPathogenLoadCount ?? 0
  );
  const highClinicalScoreCount = Number(
    animal?.riskSignals?.highClinicalScoreCount ?? 0
  );
  const uniqueSequenceCount = Number(genomics?.uniqueSequenceCount ?? 0);
  const hotspotCount = Number(genomics?.mutationHotspots?.length ?? 0);
  const morbidityRate = Number(circumstantial?.morbidityRateMean ?? 0);
  const geoCaseCount = Number(geoTemporal?.totalCases ?? 0);
  const geoLocationCount = Number(geoTemporal?.locationCount ?? 0);

  const evolutionaryRiskScore =
    lowImmunityCount * 1.5 +
    highPathogenLoadCount * 1.5 +
    highClinicalScoreCount * 1.2 +
    uniqueSequenceCount * 2 +
    hotspotCount * 0.5 +
    morbidityRate * 100 * 0.25 +
    geoCaseCount * 0.1 +
    geoLocationCount * 0.8;

  const suggestedDrivers = [
    lowImmunityCount > 0 ? "Low host immunity" : null,
    highPathogenLoadCount > 0 ? "High serum pathogen load" : null,
    highClinicalScoreCount > 0 ? "High clinical severity" : null,
    uniqueSequenceCount > 1 ? "Multiple pathogen haplotypes/sequence types" : null,
    hotspotCount > 0 ? "Detected genomic mutation hotspots" : null,
    morbidityRate > 0.2 ? "Elevated morbidity at farm/population level" : null,
    geoLocationCount > 1 ? "Spatial spread across multiple locations" : null,
  ].filter(Boolean);

  return {
    animalLevel: animal,
    geoTemporal,
    genomics,
    circumstantial,
    integratedSummary: {
      evolutionaryRiskScore,
      riskCategory:
        evolutionaryRiskScore >= 50
          ? "high"
          : evolutionaryRiskScore >= 25
          ? "moderate"
          : "low",
      interpretation:
        evolutionaryRiskScore >= 50
          ? "High evolutionary and transmission concern based on integrated host, pathogen, spatial, and circumstantial evidence."
          : evolutionaryRiskScore >= 25
          ? "Moderate concern; further genomic and epidemiological confirmation is recommended."
          : "Lower concern based on currently supplied evidence, but interpretation depends on data completeness.",
      suggestedDrivers,
    },
    visualization: {
      genomicHotspots: genomics.mutationHotspots ?? [],
      pairwiseDistances: genomics.pairwiseDistances ?? [],
      geoHeatmap: geoTemporal.heatmapGeoJSON,
      diseaseStateDistribution: animal.diseaseStates ?? [],
      speciesDistribution: animal.speciesDistribution ?? [],
      vaccineStrainDistribution: animal.vaccineStrainDistribution ?? [],
      circumstantialMorbidity: {
        mean: circumstantial.morbidityRateMean ?? null,
        median: circumstantial.morbidityRateMedian ?? null,
      },
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

    if (moduleName === "evolutionary") {
      const animalFile = formData.get("animalFile") as File | null;
      const geoFile = formData.get("geoFile") as File | null;
      const circumstantialFile = formData.get("circumstantialFile") as File | null;
      const fastaFile = formData.get("fastaFile") as File | null;

      const animalRowsText = String(formData.get("animalRows") || "");
      const geoRowsText = String(formData.get("geoRows") || "");
      const circumstantialRowsText = String(
        formData.get("circumstantialRows") || ""
      );
      const fastaTextInput = String(formData.get("fastaText") || "");

      const animalRows = animalFile
        ? parseCSV(await animalFile.text())
        : animalRowsText
        ? JSON.parse(animalRowsText)
        : [];

      const geoRows = geoFile
        ? parseCSV(await geoFile.text())
        : geoRowsText
        ? JSON.parse(geoRowsText)
        : [];

      const circumstantialRows = circumstantialFile
        ? parseCSV(await circumstantialFile.text())
        : circumstantialRowsText
        ? JSON.parse(circumstantialRowsText)
        : [];

      const fastaText = fastaFile ? await fastaFile.text() : fastaTextInput;

      return NextResponse.json({
        status: "success",
        module: "Evolutionary Analysis",
        evolutionary: analyzeEvolutionary(
          animalRows,
          geoRows,
          circumstantialRows,
          fastaText
        ),
        notes: [
          "Animal-level data may include species, age, sex, disease_state, immunity_score, serum_pathogen_load, vaccine_strain, vaccine_strain_sequence, vaccination_date, antibody_titer, co_infections, body_temperature, clinical_score, weight, farm_id, and location.",
          "Geospatial/temporal data may include farm_id, location, latitude, longitude, date, cases, deaths, cluster_id, site_type, and movement_exposure.",
          "Genomics data expects FASTA text or a FASTA file from the isolated pathogen.",
          "Circumstantial evidence may include number_of_animals_reared, how_many_ill, similar_symptoms_seen_in, duration_days, drug_administered, management_system, biosecurity_score, feed_source, water_source, vector_exposure, and recent_animal_introduction.",
        ],
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
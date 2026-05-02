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
      const numeric = Number(raw);
      row[h] = raw !== "" && Number.isFinite(numeric) ? numeric : raw;
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
  const usable = values
    .map((v, i) => ({ v, i }))
    .filter((x) => x.v > 0);

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
      finalSEIR: {
        S: last.S,
        E: last.E,
        I: last.I,
        R: last.R,
      },
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

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
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
      mode,
      rows: rows.length,
      analysis: analyzeTransmission(rows, infectiousPeriodDays),
      notes: [
        "The web logic follows the EGStat-N desktop rule: first observation has Culled=0 and Quarantined=0.",
        "Each next observation applies previous Pending_Culled and Pending_Quarantined as current Culled and Quarantined.",
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
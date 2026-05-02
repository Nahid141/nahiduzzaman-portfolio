"use client";

import { useMemo, useState } from "react";

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

type MainTab = "transmission" | "risk";
type Step = "choose" | "setup" | "observe" | "table" | "analysis";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function num(value: string | number, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function percent(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "NA";
  return `${(value * 100).toFixed(2)}%`;
}

function valueText(value: any) {
  if (value === null || value === undefined || Number.isNaN(value)) return "NA";
  if (typeof value === "number") return value.toFixed(4);
  return String(value);
}

export default function Tools() {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("transmission");

  const [mode, setMode] = useState<"import" | "logic">("logic");
  const [step, setStep] = useState<Step>("choose");

  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");

  const [riskFile, setRiskFile] = useState<File | null>(null);
  const [riskFileName, setRiskFileName] = useState("");
  const [riskOutcome, setRiskOutcome] = useState("");
  const [riskPredictors, setRiskPredictors] = useState("");
  const [riskThreshold, setRiskThreshold] = useState("0.2");
  const [riskResult, setRiskResult] = useState<any>(null);

  const [infectiousPeriodDays, setInfectiousPeriodDays] = useState("14");
  const [rows, setRows] = useState<ObsRow[]>([]);
  const [result, setResult] = useState<any>(null);

  const [log, setLog] = useState<string[]>([
    "> EGStat-N web engine initialized.",
    "> Select Transmission Dynamics or Risk Factor Analysis.",
  ]);

  const [setup, setSetup] = useState({
    Farm_ID: "Farm_1",
    Location: "",
    Latitude: "0",
    Longitude: "0",
    Date: today(),
    Total_Animals: "100",
    E: "0",
    I: "0",
    R: "0",
    RBPT_Positive: "0",
    iELISA_Positive: "0",
    Pending_Culled: "0",
  });

  const [obs, setObs] = useState({
    Date: today(),
    E: "0",
    RBPT_Positive: "0",
    iELISA_Positive: "0",
    Abortion_Count: "0",
    New_Animals_Moved_In: "0",
    New_Animals_Moved_Out: "0",
    Susceptible_In_From_MovedIn: "0",
    Susceptible_Out_From_MovedOut: "0",
    Pending_Culled: "0",
  });

  const currentFarm = rows.length > 0 ? rows[0].Farm_ID : "";
  const last = rows.length > 0 ? rows[rows.length - 1] : null;

  const nextPreview = useMemo(() => {
    if (!last) return null;

    const movedIn = num(obs.New_Animals_Moved_In);
    const movedOut = num(obs.New_Animals_Moved_Out);
    const appliedCulled = last.Pending_Culled;
    const appliedQuarantined = last.Pending_Quarantined;
    const Nnew = last.Total_Animals - appliedCulled + movedIn - movedOut;
    const Enew = num(obs.E, last.E);
    const Inew = num(obs.iELISA_Positive);
    const Rnew = last.R;
    const pendingCulled = num(obs.Pending_Culled);
    const pendingQuarantined = Math.max(0, Inew - pendingCulled);
    const Snew = Nnew - (Enew + Inew + Rnew);

    return {
      Observation: last.Observation + 1,
      Nnew,
      Snew,
      Enew,
      Inew,
      Rnew,
      appliedCulled,
      appliedQuarantined,
      pendingCulled,
      pendingQuarantined,
    };
  }, [last, obs]);

  function resetTransmission() {
    setRows([]);
    setResult(null);
    setFile(null);
    setFileName("");
    setStep("choose");
    setLog([
      "> EGStat-N transmission module reset.",
      "> Select direct import or logic-wise observation entry.",
    ]);
  }

  function createInitialObservation() {
    const N = num(setup.Total_Animals);
    const E = num(setup.E);
    const I = num(setup.I);
    const R = num(setup.R);
    const pendingCulled = num(setup.Pending_Culled);
    const pendingQuarantined = Math.max(0, I - pendingCulled);
    const S = N - (E + I + R);

    if (!setup.Farm_ID.trim()) {
      setLog((old) => [...old, "> ERROR: Farm ID is required."]);
      return;
    }

    if (N < 0 || S < 0) {
      setLog((old) => [
        ...old,
        `> ERROR: Invalid initial values. Calculated S=${S}. Check N, E, I, and R.`,
      ]);
      return;
    }

    const initial: ObsRow = {
      Farm_ID: setup.Farm_ID,
      Location: setup.Location,
      Latitude: num(setup.Latitude),
      Longitude: num(setup.Longitude),
      Date: setup.Date || today(),
      Observation: 1,
      Total_Animals: N,
      S,
      E,
      I,
      R,
      RBPT_Positive: num(setup.RBPT_Positive),
      iELISA_Positive: num(setup.iELISA_Positive, I),
      Abortion_Count: 0,
      Pending_Culled: pendingCulled,
      Culled: 0,
      Pending_Quarantined: pendingQuarantined,
      Quarantined: 0,
      New_Animals_Moved_In: 0,
      New_Animals_Moved_Out: 0,
      Susceptible_In_From_MovedIn: 0,
      Susceptible_Out_From_MovedOut: 0,
    };

    setRows([initial]);
    setResult(null);
    setStep("observe");

    setObs({
      Date: today(),
      E: String(E),
      RBPT_Positive: "0",
      iELISA_Positive: "0",
      Abortion_Count: "0",
      New_Animals_Moved_In: "0",
      New_Animals_Moved_Out: "0",
      Susceptible_In_From_MovedIn: "0",
      Susceptible_Out_From_MovedOut: "0",
      Pending_Culled: "0",
    });

    setLog((old) => [
      ...old,
      `> Farm created: ${setup.Farm_ID}.`,
      `> Initial observation added: N=${N}, S=${S}, E=${E}, I=${I}, R=${R}.`,
      `> Pending culled=${pendingCulled}, pending quarantined=${pendingQuarantined}.`,
      "> Observation Entry window opened for the next observation.",
    ]);
  }

  function addNextObservation() {
    if (!last || !nextPreview) {
      setLog((old) => [...old, "> ERROR: Create initial farm observation first."]);
      return;
    }

    if (nextPreview.Nnew < 0) {
      setLog((old) => [
        ...old,
        `> ERROR: Calculated total animals is negative: ${nextPreview.Nnew}.`,
      ]);
      return;
    }

    if (nextPreview.Snew < 0) {
      setLog((old) => [
        ...old,
        `> ERROR: Calculated susceptible animals is negative: ${nextPreview.Snew}.`,
      ]);
      return;
    }

    const movedIn = num(obs.New_Animals_Moved_In);
    const movedOut = num(obs.New_Animals_Moved_Out);
    const susIn = num(obs.Susceptible_In_From_MovedIn);
    const susOut = num(obs.Susceptible_Out_From_MovedOut);

    if (susIn > movedIn) {
      setLog((old) => [...old, "> ERROR: Susceptible moved-in cannot be greater than total moved-in."]);
      return;
    }

    if (susOut > movedOut) {
      setLog((old) => [...old, "> ERROR: Susceptible moved-out cannot be greater than total moved-out."]);
      return;
    }

    const newRow: ObsRow = {
      Farm_ID: last.Farm_ID,
      Location: last.Location,
      Latitude: last.Latitude,
      Longitude: last.Longitude,
      Date: obs.Date || today(),
      Observation: nextPreview.Observation,
      Total_Animals: nextPreview.Nnew,
      S: nextPreview.Snew,
      E: nextPreview.Enew,
      I: nextPreview.Inew,
      R: nextPreview.Rnew,
      RBPT_Positive: num(obs.RBPT_Positive),
      iELISA_Positive: nextPreview.Inew,
      Abortion_Count: num(obs.Abortion_Count),
      Pending_Culled: nextPreview.pendingCulled,
      Culled: nextPreview.appliedCulled,
      Pending_Quarantined: nextPreview.pendingQuarantined,
      Quarantined: nextPreview.appliedQuarantined,
      New_Animals_Moved_In: movedIn,
      New_Animals_Moved_Out: movedOut,
      Susceptible_In_From_MovedIn: susIn,
      Susceptible_Out_From_MovedOut: susOut,
    };

    setRows((old) => [...old, newRow]);
    setResult(null);

    setObs({
      Date: today(),
      E: String(newRow.E),
      RBPT_Positive: "0",
      iELISA_Positive: "0",
      Abortion_Count: "0",
      New_Animals_Moved_In: "0",
      New_Animals_Moved_Out: "0",
      Susceptible_In_From_MovedIn: "0",
      Susceptible_Out_From_MovedOut: "0",
      Pending_Culled: "0",
    });

    setStep("observe");

    setLog((old) => [
      ...old,
      `> Observation ${newRow.Observation} added for ${newRow.Farm_ID}.`,
      `> Applied previous pending: culled=${newRow.Culled}, quarantined=${newRow.Quarantined}.`,
      `> Auto-calculated: N=${newRow.Total_Animals}, S=${newRow.S}, E=${newRow.E}, I=${newRow.I}, R=${newRow.R}.`,
      `> New pending: culled=${newRow.Pending_Culled}, quarantined=${newRow.Pending_Quarantined}.`,
      "> New observation entry window is ready.",
    ]);
  }

  async function runTransmissionAnalysis() {
    setResult(null);

    const formData = new FormData();
    formData.append("module", "transmission");
    formData.append("mode", mode);
    formData.append("infectiousPeriodDays", infectiousPeriodDays);

    if (mode === "import") {
      if (!file) {
        setLog((old) => [...old, "> ERROR: Upload a CSV file first."]);
        return;
      }

      formData.append("file", file);
      setLog((old) => [...old, `> Uploading ${file.name}...`]);
    } else {
      if (rows.length === 0) {
        setLog((old) => [...old, "> ERROR: Create initial observation first."]);
        return;
      }

      formData.append("rows", JSON.stringify(rows));
      setLog((old) => [...old, "> Sending logic-wise observation table to analysis engine..."]);
    }

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Analysis failed.");
      }

      setResult(data);
      setStep("analysis");

      setLog((old) => [
        ...old,
        "> Transmission analysis completed.",
        `> Rows analyzed: ${data.rows}.`,
        `> Farms detected: ${data.analysis.totalFarms}.`,
      ]);
    } catch (error: any) {
      setLog((old) => [...old, `> ERROR: ${error.message}`]);
    }
  }

  async function runRiskAnalysis() {
    setRiskResult(null);

    if (!riskFile) {
      setLog((old) => [...old, "> ERROR: Upload a risk-factor CSV file first."]);
      return;
    }

    if (!riskOutcome.trim() || !riskPredictors.trim()) {
      setLog((old) => [
        ...old,
        "> ERROR: Outcome and predictor variables are required for risk-factor analysis.",
      ]);
      return;
    }

    const formData = new FormData();
    formData.append("module", "risk");
    formData.append("file", riskFile);
    formData.append("outcome", riskOutcome.trim());
    formData.append("predictors", riskPredictors.trim());
    formData.append("threshold", riskThreshold);

    setLog((old) => [
      ...old,
      `> Uploading risk-factor dataset: ${riskFile.name}.`,
      "> Running univariable screening, variable selection, and multivariable model...",
    ]);

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Risk analysis failed.");
      }

      setRiskResult(data);

      setLog((old) => [
        ...old,
        "> Risk-factor analysis completed.",
        `> Predictors tested: ${data.risk.summary.totalPredictors}.`,
        `> Significant at p<0.05: ${data.risk.summary.significantAt005}.`,
        `> Selected for multivariable: ${data.risk.summary.selectedForMultivariable}.`,
      ]);
    } catch (error: any) {
      setLog((old) => [...old, `> ERROR: ${error.message}`]);
    }
  }

  function downloadJSON(data: any, name: string) {
    if (!data) return;

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const farmSummary = result?.analysis?.farmSummaries?.[0];

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-20 text-white">
      <section className="mx-auto max-w-7xl">
        <div className="mb-12 text-center">
          <p className="mb-3 text-sm font-black uppercase tracking-[0.3em] text-cyan-300">
            Research Tools
          </p>

          <h1 className="mb-6 text-5xl font-black">EGStat-N</h1>

          <p className="mx-auto max-w-3xl text-lg leading-8 text-slate-300">
            Epidemiological Graphics and Statistics Tool for Networks —
            transmission dynamics, logic-wise SEIR bookkeeping, risk-factor
            analysis, odds ratios, multivariable screening, and research-ready
            visual summaries.
          </p>
        </div>

        <div className="mx-auto max-w-5xl rounded-[2rem] border border-white/10 bg-white/[0.06] p-8 shadow-2xl backdrop-blur-xl">
          <div className="grid gap-8 md:grid-cols-2">
            <div>
              <h2 className="mb-4 text-3xl font-black text-cyan-300">
                Launch EGStat-N Web Tool
              </h2>

              <p className="mb-6 leading-8 text-slate-300">
                Use the web version for transmission dynamics, risk-factor
                screening, automatic variable selection, multivariable logistic
                modeling, and visualization-ready summaries.
              </p>

              <button
                onClick={() => setOpen(true)}
                className="rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 transition hover:-translate-y-1 hover:bg-white"
              >
                Open Tool Window
              </button>
            </div>

            <div className="rounded-3xl border border-cyan-300/20 bg-slate-900/80 p-6">
              <p className="mb-3 text-sm font-bold text-cyan-300">
                Main Modules
              </p>

              <div className="grid gap-3 text-sm font-semibold text-slate-300">
                <div className="rounded-xl bg-white/5 p-3">Transmission Dynamics</div>
                <div className="rounded-xl bg-white/5 p-3">Logic-wise Farm Observation</div>
                <div className="rounded-xl bg-white/5 p-3">Risk Factor Analysis</div>
                <div className="rounded-xl bg-white/5 p-3">Univariable and Multivariable Models</div>
                <div className="rounded-xl bg-white/5 p-3">Visual Result Panels</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur">
          <div
            className={`border border-white/10 bg-slate-950 shadow-2xl ${
              fullscreen
                ? "h-full w-full rounded-none"
                : "h-[92vh] w-full max-w-7xl rounded-[2rem]"
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div>
                <h2 className="text-2xl font-black text-cyan-300">
                  EGStat-N Analysis Window
                </h2>
                <p className="text-sm text-slate-400">
                  Transmission dynamics and risk-factor analysis
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setFullscreen(!fullscreen)}
                  className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-300 hover:text-cyan-300"
                >
                  {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
                </button>

                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white hover:bg-red-600"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="h-[calc(100%-88px)] overflow-auto p-6">
              <div className="mb-6 grid gap-3 md:grid-cols-2">
                <button
                  onClick={() => setMainTab("transmission")}
                  className={`rounded-2xl px-5 py-4 font-black transition ${
                    mainTab === "transmission"
                      ? "bg-cyan-400 text-slate-950"
                      : "border border-white/10 bg-white/5 text-slate-300 hover:border-cyan-300 hover:text-cyan-300"
                  }`}
                >
                  Transmission Dynamics
                </button>

                <button
                  onClick={() => setMainTab("risk")}
                  className={`rounded-2xl px-5 py-4 font-black transition ${
                    mainTab === "risk"
                      ? "bg-cyan-400 text-slate-950"
                      : "border border-white/10 bg-white/5 text-slate-300 hover:border-cyan-300 hover:text-cyan-300"
                  }`}
                >
                  Risk Factor Analysis
                </button>
              </div>

              {mainTab === "transmission" && (
                <>
                  <div className="mb-6 grid gap-3 md:grid-cols-5">
                    <StepButton label="1. Mode" active={step === "choose"} onClick={() => setStep("choose")} />
                    <StepButton label="2. Farm Setup" active={step === "setup"} onClick={() => setStep("setup")} />
                    <StepButton label="3. Observation" active={step === "observe"} onClick={() => rows.length > 0 && setStep("observe")} />
                    <StepButton label="4. Data Table" active={step === "table"} onClick={() => setStep("table")} />
                    <StepButton label="5. Analysis" active={step === "analysis"} onClick={() => setStep("analysis")} />
                  </div>

                  {step === "choose" && (
                    <div className="grid gap-6 lg:grid-cols-3">
                      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
                        <h3 className="mb-4 text-2xl font-black text-cyan-300">
                          Select Transmission Input Mode
                        </h3>

                        <div className="grid gap-4 md:grid-cols-2">
                          <button
                            onClick={() => {
                              setMode("logic");
                              setStep(rows.length > 0 ? "observe" : "setup");
                              setLog((old) => [...old, "> Logic-wise data input selected."]);
                            }}
                            className={`rounded-3xl border p-6 text-left transition ${
                              mode === "logic"
                                ? "border-cyan-300 bg-cyan-300/10"
                                : "border-white/10 bg-white/5 hover:border-cyan-300"
                            }`}
                          >
                            <h4 className="mb-3 text-xl font-black text-cyan-300">
                              Logic-wise Data Input
                            </h4>
                            <p className="leading-7 text-slate-300">
                              Create the initial observation, then add each next
                              observation. Applied culled, applied quarantined,
                              total animals, susceptible animals, and new pending
                              values are calculated automatically.
                            </p>
                          </button>

                          <button
                            onClick={() => {
                              setMode("import");
                              setLog((old) => [...old, "> Direct CSV import selected."]);
                            }}
                            className={`rounded-3xl border p-6 text-left transition ${
                              mode === "import"
                                ? "border-cyan-300 bg-cyan-300/10"
                                : "border-white/10 bg-white/5 hover:border-cyan-300"
                            }`}
                          >
                            <h4 className="mb-3 text-xl font-black text-cyan-300">
                              Direct Data Import
                            </h4>
                            <p className="leading-7 text-slate-300">
                              Upload a prepared CSV containing Farm_ID, Date,
                              Observation, Total_Animals, S, E, I, R,
                              iELISA_Positive, Pending_Culled, and
                              Pending_Quarantined.
                            </p>
                          </button>
                        </div>

                        {mode === "import" && (
                          <div className="mt-6 rounded-3xl border border-white/10 bg-slate-900 p-6">
                            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/40 bg-cyan-300/5 p-8 text-center transition hover:bg-cyan-300/10">
                              <span className="mb-2 text-lg font-bold text-cyan-300">
                                Upload Transmission CSV
                              </span>
                              <span className="text-sm text-slate-400">CSV only</span>

                              <input
                                type="file"
                                className="hidden"
                                accept=".csv"
                                onChange={(e) => {
                                  const selected = e.target.files?.[0] || null;
                                  setFile(selected);
                                  setFileName(selected?.name || "");
                                  setResult(null);
                                  if (selected) {
                                    setLog((old) => [...old, `> File selected: ${selected.name}.`]);
                                  }
                                }}
                              />
                            </label>

                            {fileName && (
                              <p className="mt-4 rounded-xl bg-black p-3 text-sm text-cyan-200">
                                Loaded: {fileName}
                              </p>
                            )}

                            <button
                              onClick={runTransmissionAnalysis}
                              className="mt-5 w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-white"
                            >
                              Run Imported Transmission Analysis
                            </button>
                          </div>
                        )}
                      </div>

                      <Console log={log} />
                    </div>
                  )}

                  {step === "setup" && (
                    <div className="grid gap-6 lg:grid-cols-3">
                      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
                        <h3 className="mb-4 text-2xl font-black text-cyan-300">
                          Farm Setup: Initial Observation
                        </h3>

                        <div className="mb-6 rounded-2xl border border-cyan-300/20 bg-cyan-300/5 p-4 text-sm leading-7 text-slate-300">
                          First observation rule: Culled = 0, Quarantined = 0,
                          Pending_Quarantined = I - Pending_Culled if positive,
                          and S = N - (E + I + R).
                        </div>

                        <div className="grid gap-4 md:grid-cols-3">
                          <Input label="Farm_ID" value={setup.Farm_ID} onChange={(v) => setSetup({ ...setup, Farm_ID: v })} />
                          <Input label="Location" value={setup.Location} onChange={(v) => setSetup({ ...setup, Location: v })} />
                          <Input label="Date" value={setup.Date} onChange={(v) => setSetup({ ...setup, Date: v })} />
                          <Input label="Latitude" value={setup.Latitude} onChange={(v) => setSetup({ ...setup, Latitude: v })} />
                          <Input label="Longitude" value={setup.Longitude} onChange={(v) => setSetup({ ...setup, Longitude: v })} />
                          <Input label="Total_Animals / N" value={setup.Total_Animals} onChange={(v) => setSetup({ ...setup, Total_Animals: v })} />
                          <Input label="Exposed / E" value={setup.E} onChange={(v) => setSetup({ ...setup, E: v })} />
                          <Input label="Infected / I" value={setup.I} onChange={(v) => setSetup({ ...setup, I: v })} />
                          <Input label="Recovered / R" value={setup.R} onChange={(v) => setSetup({ ...setup, R: v })} />
                          <Input label="RBPT_Positive" value={setup.RBPT_Positive} onChange={(v) => setSetup({ ...setup, RBPT_Positive: v })} />
                          <Input label="iELISA_Positive" value={setup.iELISA_Positive} onChange={(v) => setSetup({ ...setup, iELISA_Positive: v })} />
                          <Input label="Pending_Culled" value={setup.Pending_Culled} onChange={(v) => setSetup({ ...setup, Pending_Culled: v })} />
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-4">
                          <PreviewCard title="Calculated S" value={String(num(setup.Total_Animals) - (num(setup.E) + num(setup.I) + num(setup.R)))} />
                          <PreviewCard title="Pending Quarantined" value={String(Math.max(0, num(setup.I) - num(setup.Pending_Culled)))} />
                          <PreviewCard title="Culled" value="0" />
                          <PreviewCard title="Quarantined" value="0" />
                        </div>

                        <button
                          onClick={createInitialObservation}
                          className="mt-6 rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 transition hover:bg-white"
                        >
                          Create Initial Observation and Open Next Observation
                        </button>
                      </div>

                      <Console log={log} />
                    </div>
                  )}

                  {step === "observe" && (
                    <div className="grid gap-6 lg:grid-cols-3">
                      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                          <div>
                            <h3 className="text-2xl font-black text-cyan-300">
                              Observation Entry Window
                            </h3>
                            <p className="text-sm text-slate-400">
                              Farm: {currentFarm || "No farm created"} | Last observation:{" "}
                              {last?.Observation ?? "NA"}
                            </p>
                          </div>

                          <button
                            onClick={() => setStep("table")}
                            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-300 hover:text-cyan-300"
                          >
                            View Data Table
                          </button>
                        </div>

                        {last && (
                          <div className="mb-6 grid gap-4 md:grid-cols-4">
                            <PreviewCard title="Last N" value={String(last.Total_Animals)} />
                            <PreviewCard title="Last S" value={String(last.S)} />
                            <PreviewCard title="Previous Pending Culled" value={String(last.Pending_Culled)} />
                            <PreviewCard title="Previous Pending Quarantined" value={String(last.Pending_Quarantined)} />
                          </div>
                        )}

                        <div className="grid gap-4 md:grid-cols-3">
                          <Input label="Date" value={obs.Date} onChange={(v) => setObs({ ...obs, Date: v })} />
                          <Input label="Exposed / E" value={obs.E} onChange={(v) => setObs({ ...obs, E: v })} />
                          <Input label="RBPT_Positive" value={obs.RBPT_Positive} onChange={(v) => setObs({ ...obs, RBPT_Positive: v })} />
                          <Input label="iELISA_Positive / I" value={obs.iELISA_Positive} onChange={(v) => setObs({ ...obs, iELISA_Positive: v })} />
                          <Input label="Abortion_Count" value={obs.Abortion_Count} onChange={(v) => setObs({ ...obs, Abortion_Count: v })} />
                          <Input label="Pending_Culled input" value={obs.Pending_Culled} onChange={(v) => setObs({ ...obs, Pending_Culled: v })} />
                          <Input label="New_Animals_Moved_In" value={obs.New_Animals_Moved_In} onChange={(v) => setObs({ ...obs, New_Animals_Moved_In: v })} />
                          <Input label="Susceptible_In_From_MovedIn" value={obs.Susceptible_In_From_MovedIn} onChange={(v) => setObs({ ...obs, Susceptible_In_From_MovedIn: v })} />
                          <Input label="New_Animals_Moved_Out" value={obs.New_Animals_Moved_Out} onChange={(v) => setObs({ ...obs, New_Animals_Moved_Out: v })} />
                          <Input label="Susceptible_Out_From_MovedOut" value={obs.Susceptible_Out_From_MovedOut} onChange={(v) => setObs({ ...obs, Susceptible_Out_From_MovedOut: v })} />
                        </div>

                        {nextPreview && (
                          <div className="mt-6 rounded-3xl border border-cyan-300/20 bg-cyan-300/5 p-5">
                            <h4 className="mb-4 text-lg font-black text-cyan-300">
                              Auto-calculated Preview for Observation {nextPreview.Observation}
                            </h4>

                            <div className="grid gap-4 md:grid-cols-4">
                              <PreviewCard title="Applied Culled" value={String(nextPreview.appliedCulled)} />
                              <PreviewCard title="Applied Quarantined" value={String(nextPreview.appliedQuarantined)} />
                              <PreviewCard title="New N" value={String(nextPreview.Nnew)} />
                              <PreviewCard title="New S" value={String(nextPreview.Snew)} />
                              <PreviewCard title="New E" value={String(nextPreview.Enew)} />
                              <PreviewCard title="New I" value={String(nextPreview.Inew)} />
                              <PreviewCard title="New R" value={String(nextPreview.Rnew)} />
                              <PreviewCard title="New Pending Quarantined" value={String(nextPreview.pendingQuarantined)} />
                            </div>
                          </div>
                        )}

                        <div className="mt-6 flex flex-wrap gap-3">
                          <button
                            onClick={addNextObservation}
                            className="rounded-2xl bg-cyan-400 px-7 py-4 font-black text-slate-950 transition hover:bg-white"
                          >
                            Add Observation and Open Next Window
                          </button>

                          <button
                            onClick={runTransmissionAnalysis}
                            className="rounded-2xl bg-blue-500 px-7 py-4 font-black text-white transition hover:bg-blue-600"
                          >
                            Run Analysis
                          </button>

                          <button
                            onClick={resetTransmission}
                            className="rounded-2xl bg-red-500 px-7 py-4 font-black text-white transition hover:bg-red-600"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      <Console log={log} />
                    </div>
                  )}

                  {step === "table" && (
                    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
                      <div className="mb-5 flex flex-wrap justify-between gap-3">
                        <div>
                          <h3 className="text-2xl font-black text-cyan-300">
                            Data Table and Trend
                          </h3>
                          <p className="text-sm text-slate-400">
                            All observations created by logic-wise entry.
                          </p>
                        </div>

                        <div className="flex gap-3">
                          <button
                            onClick={() => setStep("observe")}
                            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-bold hover:border-cyan-300 hover:text-cyan-300"
                          >
                            Add Next Observation
                          </button>

                          <button
                            onClick={runTransmissionAnalysis}
                            className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-white"
                          >
                            Run Analysis
                          </button>
                        </div>
                      </div>

                      <ObservationTable rows={rows} />
                    </div>
                  )}

                  {step === "analysis" && (
                    <div className="grid gap-6 lg:grid-cols-3">
                      <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
                        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="text-2xl font-black text-cyan-300">
                              Transmission Analysis Results
                            </h3>
                            <p className="text-sm text-slate-400">
                              Transmission dynamics summary.
                            </p>
                          </div>

                          <div className="flex gap-3">
                            <button
                              onClick={runTransmissionAnalysis}
                              className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-black text-slate-950 hover:bg-white"
                            >
                              Re-run Analysis
                            </button>

                            {result && (
                              <button
                                onClick={() => downloadJSON(result, "egstat_n_transmission_analysis.json")}
                                className="rounded-xl bg-blue-500 px-4 py-2 text-sm font-black text-white hover:bg-blue-600"
                              >
                                Download JSON
                              </button>
                            )}
                          </div>
                        </div>

                        {farmSummary ? (
                          <>
                            <div className="grid gap-4 md:grid-cols-3">
                              <ResultCard title="Apparent Prevalence" value={percent(farmSummary.apparentPrevalence)} />
                              <ResultCard title="Attack Rate" value={percent(farmSummary.attackRate)} />
                              <ResultCard title="Abortion Rate" value={percent(farmSummary.abortionRate)} />
                              <ResultCard title="Estimated R0" value={valueText(farmSummary.estimatedR0)} />
                              <ResultCard title="Growth Rate r" value={valueText(farmSummary.growthRateR)} />
                              <ResultCard title="Doubling Time" value={valueText(farmSummary.doublingTimeDays)} />
                              <ResultCard title="Final Population" value={String(farmSummary.finalPopulation)} />
                              <ResultCard title="Total Culled" value={String(farmSummary.totalCulled)} />
                              <ResultCard title="Total Quarantined" value={String(farmSummary.totalQuarantined)} />
                            </div>

                            <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5">
                              <h4 className="mb-3 text-lg font-black text-cyan-300">
                                Interpretation
                              </h4>
                              <div className="space-y-2 text-sm leading-7 text-slate-300">
                                <p>{farmSummary.interpretation.apparentPrevalence}</p>
                                <p>{farmSummary.interpretation.attackRate}</p>
                                <p>{farmSummary.interpretation.estimatedR0}</p>
                              </div>
                            </div>

                            <div className="mt-6 rounded-2xl border border-white/10 bg-black p-5">
                              <pre className="max-h-96 overflow-auto text-sm text-slate-300">
                                {JSON.stringify(result.analysis, null, 2)}
                              </pre>
                            </div>
                          </>
                        ) : (
                          <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-300">
                            No result yet. Run analysis first.
                          </div>
                        )}
                      </div>

                      <Console log={log} />
                    </div>
                  )}
                </>
              )}

              {mainTab === "risk" && (
                <div className="grid gap-6 lg:grid-cols-3">
                  <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
                    <h3 className="mb-4 text-2xl font-black text-cyan-300">
                      Risk Factor Data Input
                    </h3>

                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-cyan-300/40 bg-cyan-300/5 p-8 text-center transition hover:bg-cyan-300/10">
                      <span className="mb-2 text-lg font-bold text-cyan-300">
                        Upload Risk Dataset
                      </span>
                      <span className="text-sm text-slate-400">
                        CSV with outcome and predictor columns
                      </span>

                      <input
                        type="file"
                        className="hidden"
                        accept=".csv"
                        onChange={(e) => {
                          const selected = e.target.files?.[0] || null;
                          setRiskFile(selected);
                          setRiskFileName(selected?.name || "");
                          setRiskResult(null);
                          if (selected) {
                            setLog((old) => [...old, `> Risk dataset selected: ${selected.name}.`]);
                          }
                        }}
                      />
                    </label>

                    {riskFileName && (
                      <p className="mt-4 rounded-xl bg-black p-3 text-sm text-cyan-200">
                        Loaded: {riskFileName}
                      </p>
                    )}

                    <div className="mt-5 grid gap-4">
                      <Input
                        label="Dependent / Outcome Variable"
                        value={riskOutcome}
                        onChange={setRiskOutcome}
                      />

                      <Input
                        label="Independent Variables"
                        value={riskPredictors}
                        onChange={setRiskPredictors}
                        placeholder="Age,Breed,Vaccination,Farm_Size"
                      />

                      <Input
                        label="P-value Threshold for Multivariable"
                        value={riskThreshold}
                        onChange={setRiskThreshold}
                      />
                    </div>

                    <button
                      onClick={runRiskAnalysis}
                      className="mt-6 w-full rounded-2xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-white"
                    >
                      Find Risk Factors
                    </button>

                    {riskResult && (
                      <button
                        onClick={() => downloadJSON(riskResult, "egstat_n_risk_factor_analysis.json")}
                        className="mt-4 w-full rounded-2xl bg-blue-500 px-5 py-3 font-black text-white transition hover:bg-blue-600"
                      >
                        Download Risk Result
                      </button>
                    )}
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6 lg:col-span-2">
                    <h3 className="mb-4 text-2xl font-black text-cyan-300">
                      Risk Factor Results and Visualization
                    </h3>

                    {riskResult ? (
                      <>
                        <div className="mb-6 grid gap-4 md:grid-cols-4">
                          <ResultCard title="Predictors" value={String(riskResult.risk.summary.totalPredictors)} />
                          <ResultCard title="p < 0.05" value={String(riskResult.risk.summary.significantAt005)} />
                          <ResultCard title="Selected" value={String(riskResult.risk.summary.selectedForMultivariable)} />
                          <ResultCard title="Model Accuracy" value={valueText(riskResult.risk.multivariable?.accuracy)} />
                        </div>

                        <div className="grid gap-6 xl:grid-cols-2">
                          <RiskPValuePlot data={riskResult.risk.visualizations.pValueBars} threshold={Number(riskThreshold)} />
                          <RiskForestPlot data={riskResult.risk.visualizations.forestData} title="Univariable Odds Ratio Plot" />
                        </div>

                        {riskResult.risk.visualizations.multivariableForest.length > 0 && (
                          <div className="mt-6">
                            <RiskForestPlot data={riskResult.risk.visualizations.multivariableForest} title="Multivariable Forest Plot" />
                          </div>
                        )}

                        <div className="mt-6 rounded-2xl border border-white/10 bg-slate-900 p-5">
                          <h4 className="mb-3 text-lg font-black text-cyan-300">
                            Univariable Results
                          </h4>
                          <RiskTable rows={riskResult.risk.univariable} />
                        </div>

                        <div className="mt-6 rounded-2xl border border-white/10 bg-black p-5">
                          <pre className="max-h-96 overflow-auto text-sm text-slate-300">
                            {JSON.stringify(riskResult.risk, null, 2)}
                          </pre>
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-300">
                        Upload a CSV, enter outcome and predictors, then run the
                        risk-factor analysis.
                      </div>
                    )}
                  </div>

                  <Console log={log} />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StepButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
        active
          ? "bg-cyan-400 text-slate-950"
          : "border border-white/10 bg-white/5 text-slate-300 hover:border-cyan-300 hover:text-cyan-300"
      }`}
    >
      {label}
    </button>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </label>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-white outline-none focus:border-cyan-300"
      />
    </div>
  );
}

function PreviewCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-4">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {title}
      </p>
      <p className="mt-2 text-xl font-black text-cyan-300">{value}</p>
    </div>
  );
}

function ResultCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
        {title}
      </p>
      <p className="mt-2 text-2xl font-black text-cyan-300">{value}</p>
    </div>
  );
}

function Console({ log }: { log: string[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.05] p-6">
      <h3 className="mb-4 text-xl font-black text-cyan-300">
        Analysis Console
      </h3>

      <div className="h-96 overflow-auto rounded-2xl bg-black p-5 font-mono text-sm text-green-300">
        {log.map((line, index) => (
          <p key={index}>{line}</p>
        ))}
      </div>
    </div>
  );
}

function ObservationTable({ rows }: { rows: ObsRow[] }) {
  return (
    <div className="overflow-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[1200px] border-collapse text-sm">
        <thead className="bg-slate-900 text-cyan-300">
          <tr>
            {[
              "Farm_ID",
              "Date",
              "Obs",
              "N",
              "S",
              "E",
              "I",
              "R",
              "Pending_Culled",
              "Pending_Quarantined",
              "Culled",
              "Quarantined",
              "MovedIn",
              "MovedOut",
              "SusIn",
              "SusOut",
            ].map((h) => (
              <th key={h} className="border border-white/10 px-3 py-2 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white/[0.03] even:bg-white/[0.06]">
              <td className="border border-white/10 px-3 py-2">{r.Farm_ID}</td>
              <td className="border border-white/10 px-3 py-2">{r.Date}</td>
              <td className="border border-white/10 px-3 py-2">{r.Observation}</td>
              <td className="border border-white/10 px-3 py-2">{r.Total_Animals}</td>
              <td className="border border-white/10 px-3 py-2">{r.S}</td>
              <td className="border border-white/10 px-3 py-2">{r.E}</td>
              <td className="border border-white/10 px-3 py-2">{r.I}</td>
              <td className="border border-white/10 px-3 py-2">{r.R}</td>
              <td className="border border-white/10 px-3 py-2">{r.Pending_Culled}</td>
              <td className="border border-white/10 px-3 py-2">{r.Pending_Quarantined}</td>
              <td className="border border-white/10 px-3 py-2">{r.Culled}</td>
              <td className="border border-white/10 px-3 py-2">{r.Quarantined}</td>
              <td className="border border-white/10 px-3 py-2">{r.New_Animals_Moved_In}</td>
              <td className="border border-white/10 px-3 py-2">{r.New_Animals_Moved_Out}</td>
              <td className="border border-white/10 px-3 py-2">{r.Susceptible_In_From_MovedIn}</td>
              <td className="border border-white/10 px-3 py-2">{r.Susceptible_Out_From_MovedOut}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-auto rounded-xl border border-white/10">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="bg-black text-cyan-300">
          <tr>
            {["Variable", "Test", "p-value", "OR", "95% CI", "RR", "Interpretation"].map((h) => (
              <th key={h} className="border border-white/10 px-3 py-2 text-left">
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="odd:bg-white/[0.03] even:bg-white/[0.06]">
              <td className="border border-white/10 px-3 py-2">{r.variable}</td>
              <td className="border border-white/10 px-3 py-2">{r.test}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.pValue)}</td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.oddsRatio)}</td>
              <td className="border border-white/10 px-3 py-2">
                {valueText(r.ciLower)} - {valueText(r.ciUpper)}
              </td>
              <td className="border border-white/10 px-3 py-2">{valueText(r.riskRatio)}</td>
              <td className="border border-white/10 px-3 py-2">{r.interpretation || r.message}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RiskPValuePlot({
  data,
  threshold,
}: {
  data: any[];
  threshold: number;
}) {
  const sorted = [...data].sort((a, b) => a.pValue - b.pValue).slice(0, 12);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">
        Univariable p-value Plot
      </h4>

      <div className="space-y-3">
        {sorted.map((d, i) => {
          const width = Math.max(3, Math.min(100, (1 - Math.min(d.pValue, 1)) * 100));
          return (
            <div key={i}>
              <div className="mb-1 flex justify-between text-xs text-slate-300">
                <span>{d.variable}</span>
                <span>p={valueText(d.pValue)}</span>
              </div>
              <div className="h-3 rounded-full bg-white/10">
                <div
                  className={`h-3 rounded-full ${
                    d.pValue < 0.05
                      ? "bg-cyan-300"
                      : d.pValue < threshold
                      ? "bg-blue-400"
                      : "bg-slate-500"
                  }`}
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-xs text-slate-400">
        Cyan = p&lt;0.05; blue = selected under threshold.
      </p>
    </div>
  );
}

function RiskForestPlot({
  data,
  title,
}: {
  data: any[];
  title: string;
}) {
  const rows = [...data]
    .filter((d) => Number.isFinite(d.oddsRatio))
    .slice(0, 12);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900 p-5">
      <h4 className="mb-4 text-lg font-black text-cyan-300">{title}</h4>

      {rows.length === 0 ? (
        <p className="text-sm text-slate-400">No odds-ratio data available.</p>
      ) : (
        <div className="space-y-4">
          {rows.map((d, i) => {
            const or = Number(d.oddsRatio);
            const pos = Math.max(5, Math.min(95, 50 + Math.log(or) * 22));
            return (
              <div key={i}>
                <div className="mb-1 flex justify-between text-xs text-slate-300">
                  <span>{d.variable}</span>
                  <span>
                    OR={valueText(d.oddsRatio)} | p={valueText(d.pValue)}
                  </span>
                </div>

                <div className="relative h-5 rounded-full bg-white/10">
                  <div className="absolute left-1/2 top-0 h-5 w-[2px] bg-white/40" />
                  <div
                    className="absolute top-1 h-3 w-3 -translate-x-1/2 rounded-full bg-cyan-300"
                    style={{ left: `${pos}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-400">
        Center line approximates OR=1. Points to the right suggest increased odds.
      </p>
    </div>
  );
}
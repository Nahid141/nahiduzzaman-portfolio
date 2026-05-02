from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import pandas as pd
import os
import uuid

app = FastAPI(title="EGStat-N Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://fnunahiduzzaman.com",
        "https://www.fnunahiduzzaman.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
OUTPUT_DIR = os.path.join(BASE_DIR, "outputs")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


@app.get("/")
def home():
    return {"message": "EGStat-N Python backend is running"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    file_id = str(uuid.uuid4())
    filename = file.filename or "uploaded_file"
    ext = os.path.splitext(filename)[1].lower()

    input_path = os.path.join(UPLOAD_DIR, f"{file_id}_{filename}")

    with open(input_path, "wb") as buffer:
        buffer.write(await file.read())

    if ext == ".csv":
        df = pd.read_csv(input_path)
    elif ext in [".xlsx", ".xls"]:
        df = pd.read_excel(input_path)
    elif ext in [".txt"]:
        df = pd.read_csv(input_path, sep=None, engine="python")
    elif ext in [".fasta", ".fa"]:
        output_file = f"egstat_fasta_summary_{file_id}.txt"
        output_path = os.path.join(OUTPUT_DIR, output_file)

        with open(input_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        sequence_count = content.count(">")

        with open(output_path, "w", encoding="utf-8") as f:
            f.write("EGStat-N FASTA Summary\n")
            f.write("======================\n")
            f.write(f"Input file: {filename}\n")
            f.write(f"Detected sequences: {sequence_count}\n")

        return {
            "message": "FASTA analysis completed",
            "rows": sequence_count,
            "columns": 1,
            "output_file": output_file,
        }
    else:
        return {"error": "Unsupported file type"}

    summary = pd.DataFrame({
        "column": df.columns,
        "dtype": [str(df[col].dtype) for col in df.columns],
        "missing_values": [int(df[col].isna().sum()) for col in df.columns],
        "unique_values": [int(df[col].nunique()) for col in df.columns],
    })

    output_file = f"egstat_summary_{file_id}.csv"
    output_path = os.path.join(OUTPUT_DIR, output_file)

    summary.to_csv(output_path, index=False)

    return {
        "message": "Analysis completed",
        "rows": int(df.shape[0]),
        "columns": int(df.shape[1]),
        "output_file": output_file,
    }


@app.get("/download/{filename}")
def download(filename: str):
    file_path = os.path.join(OUTPUT_DIR, filename)

    if not os.path.exists(file_path):
        return {"error": "File not found"}

    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        filename=filename,
    )
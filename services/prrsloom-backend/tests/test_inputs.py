import pytest

from prrsloom.fasta import InputError, decode_upload, make_unique, parse_fasta, read_csv_text


def test_fasta_requires_header():
    with pytest.raises(InputError, match="must start with a header"):
        parse_fasta("ACGT")


def test_fasta_empty():
    with pytest.raises(InputError, match="Upload a FASTA"):
        parse_fasta("   ")


def test_fasta_keeps_full_header_and_joins_lines():
    recs = parse_fasta(">seq 1 farm A\nACG\nTTA\n>s2\nAC-GT\n")
    assert recs == [("seq 1 farm A", "ACGTTA"), ("s2", "AC-GT")]


def test_fasta_rejects_non_nucleotide_characters():
    with pytest.raises(InputError, match="not valid"):
        parse_fasta(">a\nACGT1<script>\n")


def test_fasta_min_and_duplicates():
    with pytest.raises(InputError, match="two valid sequences"):
        parse_fasta(">a\nACGT\n", min_sequences=2)
    with pytest.raises(InputError, match="Duplicated names: a"):
        parse_fasta(">a\nACGT\n>a\nACGA\n", unique_names=True)


def test_fasta_sequence_limit(monkeypatch):
    from prrsloom.config import settings

    monkeypatch.setattr(settings, "max_sequences", 2)
    with pytest.raises(InputError, match="limit is 2"):
        parse_fasta(">a\nA\n>b\nC\n>c\nG\n")


def test_csv_header_repair_and_blank_rows():
    header, rows = read_csv_text("SequenceName,,SequenceName\nx,1,2\n,,\n")
    assert header == ["SequenceName", "extra_column_2", "SequenceName_1"]
    assert rows == [{"SequenceName": "x", "extra_column_2": "1", "SequenceName_1": "2"}]


def test_make_unique_matches_r():
    # base::make.unique(c("a", "a", "a")) and with a pre-existing "a.1"
    assert make_unique(["a", "a", "a"], sep=".") == ["a", "a.1", "a.2"]
    assert make_unique(["a", "a", "a.1"], sep=".") == ["a", "a.2", "a.1"]


def test_decode_upload_limits(monkeypatch):
    from prrsloom.config import settings

    monkeypatch.setattr(settings, "max_upload_bytes", 10)
    with pytest.raises(InputError, match="larger than"):
        decode_upload(b"x" * 11, "fasta file")
    with pytest.raises(InputError, match="binary"):
        decode_upload(b"\x00\x01", "fasta file")

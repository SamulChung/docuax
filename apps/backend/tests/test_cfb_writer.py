"""CFB(OLE Compound File Binary) 라이터 왕복 테스트 — olefile(읽기 전용)로 검증."""
import io

import olefile

from app.renderers.hwp.cfb_writer import CfbWriter


def _roundtrip(streams: dict[str, bytes]) -> olefile.OleFileIO:
    w = CfbWriter()
    for name, data in streams.items():
        w.add_stream(name, data)
    buf = io.BytesIO(w.build())
    return olefile.OleFileIO(buf)


def test_single_small_stream_roundtrip():
    ole = _roundtrip({"FileHeader": b"\x01" * 256})
    assert ole.exists("FileHeader")
    assert ole.openstream("FileHeader").read() == b"\x01" * 256


def test_large_stream_roundtrip():
    data = bytes(range(256)) * 64  # 16KiB — FAT 스트림 경로
    ole = _roundtrip({"BodyText/Section0": data})
    assert ole.openstream("BodyText/Section0").read() == data


def test_mixed_streams_and_storage():
    streams = {
        "FileHeader": b"H" * 256,
        "DocInfo": b"D" * 5000,
        "BodyText/Section0": b"B" * 300,
    }
    ole = _roundtrip(streams)
    for name, data in streams.items():
        assert ole.openstream(name).read() == data


def test_empty_writer_is_valid_ole():
    ole = _roundtrip({})
    assert ole.listdir() == []

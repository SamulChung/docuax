"""최소 OLE CFB(Compound File Binary) 라이터.

HWP 5.0 컨테이너 생성 전용 — 범용 아님. 지원 범위:
- 512B 섹터(버전 3), FAT/miniFAT, 다단계 스토리지(예: "BodyText/Section0")
- 4096B 미만 스트림은 ministream(64B 미니 섹터), 이상은 FAT 체인
- DIFAT는 헤더 내 109개 슬롯까지 (FAT 섹터 109개 = 약 7MB 페이로드 — HWP에 충분)

olefile은 읽기 전용이라 직접 구현한다. [MS-CFB] 스펙 기준.
"""
from __future__ import annotations

import struct

SECTOR = 512
MINI_SECTOR = 64
MINI_CUTOFF = 4096

FREESECT = 0xFFFFFFFF
ENDOFCHAIN = 0xFFFFFFFE
FATSECT = 0xFFFFFFFD
NOSTREAM = 0xFFFFFFFF

TYPE_EMPTY = 0
TYPE_STORAGE = 1
TYPE_STREAM = 2
TYPE_ROOT = 5

_SIGNATURE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"


class _Entry:
    __slots__ = (
        "name", "kind", "data", "children",
        "start", "size", "index", "left", "right", "child",
    )

    def __init__(self, name: str, kind: int, data: bytes = b"") -> None:
        self.name = name
        self.kind = kind
        self.data = data
        self.children: dict[str, _Entry] = {}
        self.start = ENDOFCHAIN
        self.size = 0
        self.index = -1
        self.left = NOSTREAM
        self.right = NOSTREAM
        self.child = NOSTREAM


class CfbWriter:
    """스트림을 add_stream()으로 넣고 build()로 CFB 바이트를 얻는다."""

    def __init__(self) -> None:
        self.root = _Entry("Root Entry", TYPE_ROOT)

    def add_stream(self, path: str, data: bytes) -> None:
        parts = path.split("/")
        node = self.root
        for storage_name in parts[:-1]:
            child = node.children.get(storage_name)
            if child is None:
                child = _Entry(storage_name, TYPE_STORAGE)
                node.children[storage_name] = child
            node = child
        node.children[parts[-1]] = _Entry(parts[-1], TYPE_STREAM, bytes(data))

    # ── 디렉터리 트리 ──────────────────────────────────────────────────

    @staticmethod
    def _sort_key(e: _Entry) -> tuple[int, str]:
        # CFB 스펙: 이름 길이 우선, 그다음 대문자 비교
        return (len(e.name), e.name.upper())

    def _flatten(self) -> list[_Entry]:
        """루트부터 전위 순회로 인덱스 부여 후, 형제 균형 BST 포인터 구성."""
        order: list[_Entry] = [self.root]

        def collect(node: _Entry) -> None:
            kids = sorted(node.children.values(), key=self._sort_key)
            for k in kids:
                order.append(k)
            for k in kids:
                collect(k)

        collect(self.root)
        for i, e in enumerate(order):
            e.index = i

        def bst(kids: list[_Entry]) -> int:
            if not kids:
                return NOSTREAM
            mid = len(kids) // 2
            node = kids[mid]
            node.left = bst(kids[:mid])
            node.right = bst(kids[mid + 1:])
            return node.index

        def link(node: _Entry) -> None:
            kids = sorted(node.children.values(), key=self._sort_key)
            node.child = bst(kids)
            for k in kids:
                link(k)

        link(self.root)
        return order

    # ── 조립 ──────────────────────────────────────────────────────────

    def build(self) -> bytes:
        entries = self._flatten()

        # 1) ministream 조립 (작은 스트림) + miniFAT
        mini_data = bytearray()
        minifat: list[int] = []
        for e in entries:
            if e.kind != TYPE_STREAM:
                continue
            if not e.data:
                e.start = ENDOFCHAIN
                e.size = 0
            elif len(e.data) < MINI_CUTOFF:
                n = (len(e.data) + MINI_SECTOR - 1) // MINI_SECTOR
                first = len(minifat)
                minifat.extend(range(first + 1, first + n + 1))
                minifat[-1] = ENDOFCHAIN
                e.start = first
                e.size = len(e.data)
                mini_data += e.data
                mini_data += b"\x00" * (n * MINI_SECTOR - len(e.data))

        # 2) 페이로드 섹터 배치: 큰 스트림 → ministream → miniFAT → 디렉터리
        sectors: list[bytes] = []
        fat: list[int] = []

        def add_chain(data: bytes) -> int:
            if not data:
                return ENDOFCHAIN
            n = (len(data) + SECTOR - 1) // SECTOR
            first = len(sectors)
            for i in range(n):
                chunk = data[i * SECTOR:(i + 1) * SECTOR]
                sectors.append(chunk + b"\x00" * (SECTOR - len(chunk)))
                fat.append(first + i + 1)
            fat[-1] = ENDOFCHAIN
            return first

        for e in entries:
            if e.kind == TYPE_STREAM and len(e.data) >= MINI_CUTOFF:
                e.start = add_chain(e.data)
                e.size = len(e.data)

        self.root.start = add_chain(bytes(mini_data))
        self.root.size = len(mini_data)

        minifat_start = ENDOFCHAIN
        minifat_sector_count = 0
        if minifat:
            per = SECTOR // 4
            padded = minifat + [FREESECT] * (-len(minifat) % per)
            blob = struct.pack(f"<{len(padded)}I", *padded)
            minifat_start = add_chain(blob)
            minifat_sector_count = len(padded) // per

        # 디렉터리: 128B 엔트리, 섹터당 4개 — 빈 엔트리로 패딩
        dir_blob = b"".join(self._dir_entry(e) for e in entries)
        dir_blob += self._empty_dir_entry() * (-len(entries) % 4)
        dir_start = add_chain(dir_blob)

        # 3) FAT 섹터 수 (FAT 자신도 FAT에 표시됨 — 고정점 반복)
        n_payload = len(sectors)
        fat_count = 0
        while True:
            needed = -(-(n_payload + fat_count) // (SECTOR // 4))
            if needed == fat_count:
                break
            fat_count = needed
        if fat_count > 109:
            raise ValueError("CFB 파일이 너무 큼 — DIFAT 확장 미지원 (109 FAT 섹터 초과)")

        fat_entries = fat + [FATSECT] * fat_count
        fat_entries += [FREESECT] * (fat_count * (SECTOR // 4) - len(fat_entries))
        fat_sector_ids = list(range(n_payload, n_payload + fat_count))

        # 4) 헤더
        header = bytearray(512)
        header[0:8] = _SIGNATURE
        struct.pack_into("<HHHHH", header, 24, 0x003E, 0x0003, 0xFFFE, 9, 6)
        # 40: dir 섹터 수(v3=0), 44: FAT 섹터 수, 48: dir 시작, 52: 트랜잭션
        struct.pack_into("<IIII", header, 40, 0, fat_count, dir_start, 0)
        struct.pack_into("<III", header, 56, MINI_CUTOFF, minifat_start, minifat_sector_count)
        struct.pack_into("<II", header, 68, ENDOFCHAIN, 0)  # DIFAT 확장 없음
        difat = fat_sector_ids + [FREESECT] * (109 - len(fat_sector_ids))
        struct.pack_into("<109I", header, 76, *difat)

        out = bytearray(header)
        for s in sectors:
            out += s
        for i in range(fat_count):
            chunk = fat_entries[i * (SECTOR // 4):(i + 1) * (SECTOR // 4)]
            out += struct.pack(f"<{SECTOR // 4}I", *chunk)
        return bytes(out)

    # ── 디렉터리 엔트리 직렬화 ─────────────────────────────────────────

    @staticmethod
    def _dir_entry(e: _Entry) -> bytes:
        name_utf16 = e.name.encode("utf-16-le")
        if len(name_utf16) > 62:
            raise ValueError(f"CFB 엔트리 이름이 너무 김: {e.name!r}")
        buf = bytearray(128)
        buf[0:len(name_utf16)] = name_utf16
        struct.pack_into("<H", buf, 64, len(name_utf16) + 2)  # NUL 포함 바이트 길이
        buf[66] = e.kind
        buf[67] = 1  # black
        struct.pack_into("<III", buf, 68, e.left, e.right, e.child)
        # 80: CLSID 16B = 0, 96: state = 0, 100/108: 시간 = 0
        struct.pack_into("<I", buf, 116, e.start & 0xFFFFFFFF)
        struct.pack_into("<II", buf, 120, e.size, 0)  # v3: u32 크기 + 상위 4B는 0
        return bytes(buf)

    @staticmethod
    def _empty_dir_entry() -> bytes:
        buf = bytearray(128)
        buf[66] = TYPE_EMPTY
        struct.pack_into("<III", buf, 68, NOSTREAM, NOSTREAM, NOSTREAM)
        return bytes(buf)

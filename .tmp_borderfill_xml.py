"""기본 borderFill·section pagePr OXML 구조 점검."""
import sys, re
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

import hwpx
from lxml import etree as et

doc = hwpx.HwpxDocument.new()
header_el = doc.headers[0].element

# borderFills 부분 추출
NS = {"hh": "http://www.hancom.co.kr/hwpml/2011/head"}
bfs = header_el.find(".//hh:borderFills", NS)
print(f"=== borderFills (자식 {len(bfs)}) ===")
for bf in bfs[:3]:
    print(et.tostring(bf, encoding="unicode", pretty_print=True)[:600])
    print("---")

# section0 elements
print("\n=== section0 — secPr / pagePr 검색 ===")
sec_el = doc.sections[0].element
print(f"  section root tag: {sec_el.tag}")
print(f"  자식 태그: {[c.tag.split('}')[-1] for c in sec_el]}")

# secPr 가 있는지
secpr = sec_el.find(".//hp:secPr", {"hp": "http://www.hancom.co.kr/hwpml/2011/paragraph"})
print(f"  secPr: {secpr is not None}")
if secpr is not None:
    print(f"    attrs: {dict(secpr.attrib)}")
    # pagePr
    pagepr = secpr.find("hp:pagePr", {"hp": "http://www.hancom.co.kr/hwpml/2011/paragraph"})
    print(f"  pagePr: {pagepr is not None}")
    if pagepr is not None:
        print(f"    {et.tostring(pagepr, encoding='unicode')[:500]}")

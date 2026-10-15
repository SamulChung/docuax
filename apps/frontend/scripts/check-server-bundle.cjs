// Validate the actual traced deployment, not the full development node_modules.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const routeFile = ".next/server/app/api/parse-hwp/route.js";
const traceFile = path.join(root, `${routeFile}.nft.json`);
const files = JSON.parse(fs.readFileSync(traceFile, "utf8")).files;
const sources = [...new Set(files.map((file) => path.resolve(path.dirname(traceFile), file)))];
const size = sources.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const mib = (size / 1024 ** 2).toFixed(1);

// Leave room under Vercel's default 250 MB limit for platform/runtime files.
if (size >= 200 * 1024 ** 2) {
  console.error(sources.map((file) => ({ file: path.relative(root, file), size: fs.statSync(file).size }))
    .sort((a, b) => b.size - a.size).slice(0, 10));
}
assert(size < 200 * 1024 ** 2, `HWP function trace is ${mib} MiB (budget: 200 MiB)`);
assert(!sources.some((file) => /node_modules\/(?:onnxruntime-(?:node|web|common)|@huggingface|@hyzyla\/pdfium|sharp|@img|canvas|@napi-rs\/canvas)\//.test(file)),
  "Unused PDF OCR dependencies leaked into the HWP function");

async function checkPackagedRoute() {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "docuax-hwp-bundle-"));
  try {
    for (const source of [...sources, path.join(root, routeFile)]) {
      const relative = path.relative(root, source);
      assert(!relative.startsWith("..") && !path.isAbsolute(relative), `Trace escapes frontend: ${source}`);
      const target = path.join(staging, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
    }
    // Only these copied files can satisfy the route's runtime dependencies.
    const { POST } = require(path.join(staging, routeFile)).routeModule.userland;
    const JSZip = require("jszip");
    const CFB = require("cfb");
    const text = "DocuAX 한글 파싱";
    const zip = new JSZip();
    zip.file("mimetype", "application/hwp+zip");
    zip.file("Contents/section0.xml", `<?xml version="1.0" encoding="UTF-8"?>
      <hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section"
              xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
        <hp:p><hp:run charPrIDRef="0"><hp:t>${text}</hp:t></hp:run></hp:p>
      </hs:sec>`);

    const cfb = CFB.utils.cfb_new();
    const header = Buffer.alloc(256);
    header.write("HWP Document File");
    header[35] = 5;
    CFB.utils.cfb_add(cfb, "FileHeader", header);
    const para = Buffer.alloc(22);
    para.writeUInt32LE(text.length + 1);
    const body = Buffer.from(`${text}\r`, "utf16le");
    function record(tag, level, content) {
      const prefix = Buffer.alloc(4);
      prefix.writeUInt32LE(tag | (level << 10) | (content.length << 20));
      return Buffer.concat([prefix, content]);
    }
    CFB.utils.cfb_add(cfb, "BodyText/Section0", Buffer.concat([
      record(66, 0, para), record(67, 1, body),
    ]));

    for (const [name, bytes] of [
      ["sample.hwpx", await zip.generateAsync({ type: "nodebuffer" })],
      ["sample.hwp", CFB.write(cfb, { type: "buffer" })],
    ]) {
      const form = new FormData();
      form.append("file", new File([bytes], name));
      const response = await POST(new Request("http://localhost/api/parse-hwp", { method: "POST", body: form }));
      const result = await response.json();
      assert.equal(response.status, 200, `${name}: ${JSON.stringify(result)}`);
      assert(result.markdown.includes(text), `${name}: Korean text missing`);
    }
    console.log(`HWP function: ${mib} MiB; packaged HWP + HWPX parsing passed`);
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

checkPackagedRoute().catch((error) => { console.error(error); process.exitCode = 1; });

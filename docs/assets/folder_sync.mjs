// Reads only the selected directory's EKAP packages and our own fixed report.
// The browser holds the read permission; no local paths or unrelated content are uploaded.
export class FolderSync {
  constructor(upload, log, active = () => true) {
    this.upload = upload;
    this.log = log;
    this.active = active;
    this.seen = new Set();
    this.failed = new Set();
  }
  key(file) { return `${file.name}:${file.size}:${file.lastModified}`; }
  async scan(directory) {
    let changed = false;
    let report;
    try {
      const sub = await directory.getDirectoryHandle("ihale-listele");
      const handle = await sub.getFileHandle("ekap-otomatik-aktarim.json");
      report = await handle.getFile();
    } catch (error) { if (error.name !== "NotFoundError") throw error; }
    if (!this.active()) return false;
    if (report && !this.seen.has(this.key(report))) {
      await this.upload("/api/local/documents/capture", report, 350000);
      this.seen.add(this.key(report));
      this.failed.clear();
      this.log("Yeni ilan raporu alındı.");
      changed = true;
    }
    for await (const handle of directory.values()) {
      if (!this.active()) break;
      if (handle.kind !== "file" || !/^ihale_dokumani_[0-9]{4}_[1-9][0-9]*(?: \([0-9]+\))?\.zip$/i.test(handle.name)) continue;
      const file = await handle.getFile();
      const key = this.key(file);
      if (this.seen.has(key) || this.failed.has(key)) continue;
      try {
        const result = await this.upload(`/api/local/documents/import?filename=${encodeURIComponent(file.name)}`, file, 50000000);
        this.seen.add(key);
        this.log(`${result.ikn}: ${result.created} dosya eklendi, ${result.skipped} dosya zaten mevcut.`);
        changed = true;
      } catch (error) {
        this.failed.add(key);
        this.log(`${file.name}: ${error.message} Yeni ilan raporu geldiğinde tekrar denenecek.`);
      }
    }
    return changed;
  }
}

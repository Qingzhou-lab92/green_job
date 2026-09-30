export type ResumeDocument = {
  text: string;
  filename: string;
  format: string;
  warnings: string[];
};
export async function readResumeDocument(file: File): Promise<ResumeDocument> {
  if (file.size > 15_000_000) throw new Error("简历文件不能超过 15 MB。");
  const format = file.name.split(".").pop()?.toLowerCase() || "";
  let text = "";
  const warnings: string[] = [];
  try {
    if (["txt", "md", "markdown"].includes(format)) text = await file.text();
    else if (format === "docx") {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({
        arrayBuffer: await file.arrayBuffer(),
      });
      text = result.value;
      if (result.messages.length)
        warnings.push("文档部分格式不支持转换，请对照原文件检查。");
    } else if (format === "pdf") {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const { default: worker } =
        await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker;
      const task = pdfjs.getDocument({
        data: await file.arrayBuffer(),

        useSystemFonts: true,
        isEvalSupported: false,
        cMapUrl: import.meta.env.BASE_URL + "pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: import.meta.env.BASE_URL + "pdfjs/standard_fonts/",
      });
      try {
        const doc = await task.promise;
        if (doc.numPages > 100)
          throw new Error("简历 PDF 超过 100 页，请拆分文件。");
        const pages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const content = await page.getTextContent();
          pages.push(
            content.items
              .map((item) =>
                "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
              )
              .join(""),
          );
          page.cleanup();
        }
        text = pages.join("\n\n");
        if (pages.some((p) => !p.trim()))
          warnings.push("部分页面没有文字层，扫描内容未提取，请手动补充。");
        warnings.push("PDF 多栏布局可能影响阅读顺序，请核对提取文本。");
      } finally {
        await task.destroy();
      }
    } else
      throw new Error(
        "支持 PDF、DOCX、TXT 和 Markdown；旧版 DOC 请另存为 DOCX。",
      );
  } catch (e) {
    if (e instanceof Error && /password/i.test(e.name + " " + e.message))
      throw new Error("该 PDF 已加密，请解密后重新导入。");
    throw new Error(
      e instanceof Error
        ? e.message
        : "文档读取失败，请确认文件格式正确且未加密。",
    );
  }
  text = text.replace(/\u0000/g, "").trim();
  if (!text)
    throw new Error(
      "未提取到文字。扫描 PDF 暂不支持 OCR，请先识别文字或粘贴文本。",
    );
  if (text.length > 200000)
    throw new Error("提取文字超过 20 万字，请拆分文档。");
  return { text, filename: file.name, format, warnings };
}

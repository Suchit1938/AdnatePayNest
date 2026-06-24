import api from "../api/axios";

const safeFilename = (value) =>
  String(value || "report")
    .replace(/\.pdf$/i, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "report";

export const downloadPdf = async (filename, title, rows, options = {}) => {
  const response = await api.post(
    "/reports/pdf",
    {
      filename: safeFilename(filename),
      title,
      rows,
      headers: options.headers,
      subtitle: options.subtitle,
      layout: options.layout,
    },
    { responseType: "blob" }
  );
  const blob = new Blob([response.data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${safeFilename(filename)}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

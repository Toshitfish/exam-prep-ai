import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";

const LLAMA_API_BASE = "https://api.cloud.llamaindex.ai";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 90;

type ParseJobStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function getLlamaApiKey() {
  return process.env.LLAMACLOUD_API_KEY ?? process.env.LLAMAPARSE_API_KEY;
}

type UploadMode = {
  vendorKey?: string;
  vendorModelName?: string;
  forceScanFallback?: boolean;
  forceLegacyGpt4o?: boolean;
};

type ParsePassDiagnostic = {
  pass: "primary" | "alternate-mode" | "scan-fallback" | "legacy-gpt4o";
  uploadStatus: number;
  jobId?: string;
  pollStatus?: string;
  extractedChars: number;
  error?: string;
};

function collectNestedText(payload: unknown): string[] {
  const results: string[] = [];
  const seen = new Set<unknown>();

  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return;
    }

    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (typeof child === "string") {
        const normalized = child.trim();
        if (!normalized) {
          continue;
        }

        if (/(^|_)(text|content|markdown|md|ocr)(_|$)/i.test(key)) {
          results.push(normalized);
        }
        continue;
      }

      visit(child);
    }
  };

  visit(payload);
  return results;
}

function buildUploadPayload(file: File, mode: UploadMode) {
  const uploadPayload = new FormData();
  uploadPayload.append("file", file, file.name);

  const useVendorModel = Boolean(mode.vendorKey) && !mode.forceScanFallback;
  const tier = useVendorModel
    ? "cost_effective"
    : mode.forceLegacyGpt4o || mode.forceScanFallback
      ? "agentic_plus"
      : "agentic";
  if (useVendorModel) {
    uploadPayload.append("use_vendor_multimodal_model", "true");
    uploadPayload.append("vendor_multimodal_model_name", mode.vendorModelName || "openai-gpt4o");
    uploadPayload.append("vendor_multimodal_api_key", mode.vendorKey!);
  } else {
    uploadPayload.append("premium_mode", "true");
  }

  uploadPayload.append(
    "configuration",
    JSON.stringify({
      tier,
      version: "latest",
      output_options: {
        markdown: {
          tables: {
            output_tables_as_markdown: true,
            compact_markdown_tables: false,
          },
        },
      },
    }),
  );

  if (mode.forceScanFallback) {
    // Force a scan-oriented parser mode for image-heavy PDFs.
    uploadPayload.append("parse_mode", "parse_page_with_lvm");
  }

  if (mode.forceLegacyGpt4o) {
    // Deprecated but still useful for hard scan reconstruction on some documents.
    uploadPayload.append("gpt4o_mode", "true");
  }

  return uploadPayload;
}

function extractJobId(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.id === "string") {
    return payload.id;
  }

  if (typeof payload.job_id === "string") {
    return payload.job_id;
  }

  const job = payload.job;
  if (job && typeof job === "object" && "id" in job) {
    const id = (job as Record<string, unknown>).id;
    if (typeof id === "string") {
      return id;
    }
  }

  return undefined;
}

function extractMarkdown(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.markdown === "string") {
    return payload.markdown;
  }

  const result = payload.result;
  if (result && typeof result === "object") {
    const markdown = (result as Record<string, unknown>).markdown;
    if (typeof markdown === "string") {
      return markdown;
    }
  }

  const pages = payload.pages;
  if (Array.isArray(pages)) {
    const markdownPages = pages
      .map((page) => {
        if (!page || typeof page !== "object") {
          return "";
        }

        const pageRecord = page as Record<string, unknown>;
        if (typeof pageRecord.markdown === "string") {
          return pageRecord.markdown;
        }

        if (typeof pageRecord.md === "string") {
          return pageRecord.md;
        }

        return "";
      })
      .filter(Boolean);

    if (markdownPages.length > 0) {
      // Preserve source pagination for downstream printable-template mirroring.
      return markdownPages.join("\n\n[[PAGE_BREAK]]\n\n");
    }
  }

  return undefined;
}

function extractText(payload: Record<string, unknown>): string | undefined {
  if (typeof payload.text === "string" && payload.text.trim()) {
    return payload.text;
  }

  if (typeof payload.content === "string" && payload.content.trim()) {
    return payload.content;
  }

  const result = payload.result;
  if (result && typeof result === "object") {
    const resultRecord = result as Record<string, unknown>;
    if (typeof resultRecord.text === "string" && resultRecord.text.trim()) {
      return resultRecord.text;
    }

    if (typeof resultRecord.content === "string" && resultRecord.content.trim()) {
      return resultRecord.content;
    }
  }

  const pages = payload.pages;
  if (Array.isArray(pages)) {
    const pageTexts = pages
      .map((page) => {
        if (!page || typeof page !== "object") {
          return "";
        }

        const pageRecord = page as Record<string, unknown>;
        if (typeof pageRecord.text === "string") {
          return pageRecord.text;
        }

        if (typeof pageRecord.content === "string") {
          return pageRecord.content;
        }

        return "";
      })
      .map((value) => value.trim())
      .filter(Boolean);

    if (pageTexts.length > 0) {
      return pageTexts.join("\n\n");
    }
  }

  const nestedText = collectNestedText(payload)
    .map((line) => line.trim())
    .filter(Boolean);

  if (nestedText.length > 0) {
    return nestedText.join("\n\n");
  }

  return undefined;
}

async function fetchResultFallback(jobId: string, apiKey: string): Promise<string | undefined> {
  const fallbackUrls = [
    `${LLAMA_API_BASE}/api/v2/parse/${jobId}/result/markdown`,
    `${LLAMA_API_BASE}/api/v2/parse/${jobId}/result/text`,
    `${LLAMA_API_BASE}/api/v2/parse/${jobId}/result/json`,
  ];

  for (const url of fallbackUrls) {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const jsonPayload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const extracted = extractMarkdown(jsonPayload) ?? extractText(jsonPayload);
      if (extracted && extracted.trim()) {
        return extracted;
      }

      continue;
    }

    const textPayload = (await response.text().catch(() => "")).trim();
    if (textPayload) {
      return textPayload;
    }
  }

  return undefined;
}


async function pollParseJob(jobId: string, apiKey: string): Promise<{ extracted: string; error?: string; status?: string }> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const statusResponse = await fetch(`${LLAMA_API_BASE}/api/v2/parse/${jobId}?expand=markdown`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: "no-store",
    });

    const statusJson = (await statusResponse.json().catch(() => ({}))) as Record<string, unknown>;

    if (!statusResponse.ok) {
      return {
        extracted: "",
        error: extractErrorMessage(statusJson),
        status: String(statusResponse.status),
      };
    }

    const status = extractStatus(statusJson);

    if (status === "COMPLETED") {
      let extracted = (extractMarkdown(statusJson) ?? extractText(statusJson) ?? "").trim();

      if (!extracted) {
        const fallback = await fetchResultFallback(jobId, apiKey);
        extracted = fallback?.trim() || "";
      }

      return { extracted, status };
    }

    if (status === "FAILED" || status === "CANCELLED") {
      return {
        extracted: "",
        error: extractErrorMessage(statusJson),
        status,
      };
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return {
    extracted: "",
    error: "Timed out waiting for LlamaParse to finish processing.",
    status: "504",
  };
}

function extractStatus(payload: Record<string, unknown>): ParseJobStatus | undefined {
  if (typeof payload.status === "string") {
    return payload.status as ParseJobStatus;
  }

  const job = payload.job;
  if (job && typeof job === "object") {
    const status = (job as Record<string, unknown>).status;
    if (typeof status === "string") {
      return status as ParseJobStatus;
    }
  }

  return undefined;
}

function extractErrorMessage(payload: Record<string, unknown>): string {
  if (typeof payload.error_message === "string" && payload.error_message) {
    return payload.error_message;
  }

  const error = payload.error;
  if (error && typeof error === "object") {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }

  if (typeof payload.message === "string" && payload.message) {
    return payload.message;
  }

  const detail = payload.detail;
  if (typeof detail === "string" && detail) {
    return detail;
  }

  if (Array.isArray(detail) && detail.every((item) => typeof item === "string")) {
    const joined = detail.join("; ").trim();
    if (joined) {
      return joined;
    }
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first === "object" && "msg" in first) {
      const msg = (first as Record<string, unknown>).msg;
      if (typeof msg === "string") {
        return msg;
      }
    }
  }

  return "Parsing failed.";
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = getLlamaApiKey();
  if (!apiKey || apiKey.includes("your_llamaparse_api_key_here")) {
    return Response.json(
      {
        error:
          "Missing LLAMACLOUD_API_KEY (or LLAMAPARSE_API_KEY) in .env.local. Add a real key and restart the dev server.",
      },
      { status: 500 },
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file uploaded." }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return Response.json({ error: "Only PDF files are supported." }, { status: 400 });
  }

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;

  const validOpenRouterKey =
    typeof openRouterApiKey === "string" &&
    openRouterApiKey.trim().length > 0 &&
    !openRouterApiKey.includes("sk-or-your-openrouter-key");

  const vendorModelName = process.env.LLAMAPARSE_VENDOR_MULTIMODAL_MODEL_NAME ?? "openrouter/auto";

  const preferredVendorKey = validOpenRouterKey ? openRouterApiKey : undefined;
  const preferredMode: UploadMode = preferredVendorKey
    ? { vendorKey: preferredVendorKey, vendorModelName }
    : {};
  const passDiagnostics: ParsePassDiagnostic[] = [];

  const uploadWithMode = async (mode: UploadMode) => {
    const payload = buildUploadPayload(file, mode);
    const response = await fetch(`${LLAMA_API_BASE}/api/v2/parse/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: payload,
    });

    const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { response, json };
  };

  let { response: uploadResponse, json: uploadJson } = await uploadWithMode(preferredMode);

  const attemptedOpenRouterVendor = Boolean(validOpenRouterKey && preferredVendorKey === openRouterApiKey);
  if (!uploadResponse.ok && attemptedOpenRouterVendor) {
    const fallbackAttempt = await uploadWithMode({});
    uploadResponse = fallbackAttempt.response;
    uploadJson = fallbackAttempt.json;
  }

  if (!uploadResponse.ok) {
    passDiagnostics.push({
      pass: "primary",
      uploadStatus: uploadResponse.status,
      extractedChars: 0,
      error: extractErrorMessage(uploadJson),
    });
    return Response.json({ error: extractErrorMessage(uploadJson) }, { status: uploadResponse.status });
  }

  const jobId = extractJobId(uploadJson);
  if (!jobId) {
    passDiagnostics.push({
      pass: "primary",
      uploadStatus: uploadResponse.status,
      extractedChars: 0,
      error: "Missing job id",
    });
    return Response.json({ error: "Could not find parse job id from LlamaParse." }, { status: 502 });
  }

  const firstPass = await pollParseJob(jobId, apiKey);
  passDiagnostics.push({
    pass: "primary",
    uploadStatus: uploadResponse.status,
    jobId,
    pollStatus: firstPass.status,
    extractedChars: firstPass.extracted.length,
    error: firstPass.error,
  });
  if (firstPass.error && firstPass.status !== "504") {
    return Response.json({ error: firstPass.error, status: firstPass.status }, { status: 502 });
  }

  if (firstPass.extracted) {
    return Response.json({
      markdown: firstPass.extracted,
      diagnostics: {
        selectedPass: "primary",
        passes: passDiagnostics,
      },
    });
  }

  // Second pass: switch strategy (vendor <-> premium) before experimental modes.
  const alternateMode: UploadMode = preferredMode.vendorKey ? {} : preferredVendorKey ? { vendorKey: preferredVendorKey, vendorModelName } : {};
  const alternateAttempt = await uploadWithMode(alternateMode);
  if (alternateAttempt.response.ok) {
    const alternateJobId = extractJobId(alternateAttempt.json);
    if (alternateJobId) {
      const alternatePass = await pollParseJob(alternateJobId, apiKey);
      passDiagnostics.push({
        pass: "alternate-mode",
        uploadStatus: alternateAttempt.response.status,
        jobId: alternateJobId,
        pollStatus: alternatePass.status,
        extractedChars: alternatePass.extracted.length,
        error: alternatePass.error,
      });

      if (alternatePass.extracted) {
        return Response.json({
          markdown: alternatePass.extracted,
          diagnostics: {
            selectedPass: "alternate-mode",
            passes: passDiagnostics,
          },
        });
      }
    }
  }

  // Third pass: retry with scan-focused mode for hard scanned documents.
  const retryAttempt = await uploadWithMode({ forceScanFallback: true });
  let retryJobId: string | undefined;
  let retryRejectedAsUnsupported = false;
  if (retryAttempt.response.ok) {
    retryJobId = extractJobId(retryAttempt.json);
    if (retryJobId) {
      const secondPass = await pollParseJob(retryJobId, apiKey);
      passDiagnostics.push({
        pass: "scan-fallback",
        uploadStatus: retryAttempt.response.status,
        jobId: retryJobId,
        pollStatus: secondPass.status,
        extractedChars: secondPass.extracted.length,
        error: secondPass.error,
      });
      if (secondPass.extracted) {
        return Response.json({
          markdown: secondPass.extracted,
          diagnostics: {
            selectedPass: "scan-fallback",
            passes: passDiagnostics,
          },
        });
      }
    } else {
      passDiagnostics.push({
        pass: "scan-fallback",
        uploadStatus: retryAttempt.response.status,
        extractedChars: 0,
        error: "Missing job id",
      });
    }
  } else {
    retryRejectedAsUnsupported = retryAttempt.response.status === 400;
    passDiagnostics.push({
      pass: "scan-fallback",
      uploadStatus: retryAttempt.response.status,
      extractedChars: 0,
      error: extractErrorMessage(retryAttempt.json),
    });
  }

  // Fourth pass: legacy GPT-4o mode can recover text on certain difficult scans.
  // Skip if scan-focused mode was rejected as unsupported by API.
  if (retryRejectedAsUnsupported) {
    return Response.json({
      markdown: "",
      warning:
        "Parsing completed, but OCR returned no extractable text. Advanced scan fallback options are unsupported for this API setup (400). Try a clearer PDF, ensure OPENROUTER_API_KEY is set, or use OCR-exported PDF.",
      diagnostics: {
        selectedPass: null,
        passes: passDiagnostics,
      },
    });
  }

  const legacyAttempt = await uploadWithMode({ forceLegacyGpt4o: true });
  let legacyJobId: string | undefined;
  if (legacyAttempt.response.ok) {
    legacyJobId = extractJobId(legacyAttempt.json);
    if (legacyJobId) {
      const thirdPass = await pollParseJob(legacyJobId, apiKey);
      passDiagnostics.push({
        pass: "legacy-gpt4o",
        uploadStatus: legacyAttempt.response.status,
        jobId: legacyJobId,
        pollStatus: thirdPass.status,
        extractedChars: thirdPass.extracted.length,
        error: thirdPass.error,
      });
      if (thirdPass.extracted) {
        return Response.json({
          markdown: thirdPass.extracted,
          diagnostics: {
            selectedPass: "legacy-gpt4o",
            passes: passDiagnostics,
          },
        });
      }
    } else {
      passDiagnostics.push({
        pass: "legacy-gpt4o",
        uploadStatus: legacyAttempt.response.status,
        extractedChars: 0,
        error: "Missing job id",
      });
    }
  } else {
    passDiagnostics.push({
      pass: "legacy-gpt4o",
      uploadStatus: legacyAttempt.response.status,
      extractedChars: 0,
      error: extractErrorMessage(legacyAttempt.json),
    });
  }

  return Response.json({
    markdown: "",
    warning:
      "Parsing completed, but OCR returned no extractable text. This often happens on low-quality scans. Try a clearer PDF or set OPENROUTER_API_KEY for stronger vendor OCR.",
    diagnostics: {
      selectedPass: null,
      passes: passDiagnostics,
    },
  });
}

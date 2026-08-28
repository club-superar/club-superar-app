type TicketData = {
  issuerCuit: string | null;
  receiptType: string | null;
  pointOfSale: string | null;
  receiptNumber: string | null;
  issuedOn: string | null;
  totalAmount: number | null;
  cae: string | null;
  caeExpiresOn: string | null;
};

const emptyTicket: TicketData = {
  issuerCuit: null,
  receiptType: null,
  pointOfSale: null,
  receiptNumber: null,
  issuedOn: null,
  totalAmount: null,
  cae: null,
  caeExpiresOn: null,
};

function digits(value: unknown, length?: number) {
  const result = typeof value === "string" ? value.replace(/\D/g, "") : "";
  return result && (!length || result.length === length) ? result : null;
}

function date(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

export async function readTicketWithGemini(bytes: Buffer, mimeType: string): Promise<TicketData> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("Ticket reader: GEMINI_API_KEY is missing");
    return emptyTicket;
  }

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        signal: AbortSignal.timeout(50_000),
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType, data: bytes.toString("base64") } },
            { text: "Lee esta factura argentina. Extrae solo datos visibles. No inventes nada. Fecha en YYYY-MM-DD. Importe como numero decimal. CUIT y CAE solo digitos. Punto de venta y numero de factura separados. Devuelve null si un dato no se distingue." },
          ] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseJsonSchema: {
              type: "object",
              properties: {
                issuerCuit: { type: ["string", "null"] },
                receiptType: { type: ["string", "null"] },
                pointOfSale: { type: ["string", "null"] },
                receiptNumber: { type: ["string", "null"] },
                issuedOn: { type: ["string", "null"] },
                totalAmount: { type: ["number", "null"] },
                cae: { type: ["string", "null"] },
                caeExpiresOn: { type: ["string", "null"] },
              },
              required: ["issuerCuit", "receiptType", "pointOfSale", "receiptNumber", "issuedOn", "totalAmount", "cae", "caeExpiresOn"],
              additionalProperties: false,
            },
          },
        }),
      },
    );
    if (!response.ok) {
      console.error("Ticket reader: Gemini API rejected the request", response.status, (await response.text()).slice(0, 500));
      if ([429, 503, 524].includes(response.status)) throw new Error("TICKET_READER_BUSY");
      return emptyTicket;
    }
    const payload = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return emptyTicket;
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const amount = typeof parsed.totalAmount === "number" && Number.isFinite(parsed.totalAmount) && parsed.totalAmount > 0 ? parsed.totalAmount : null;
    return {
      issuerCuit: digits(parsed.issuerCuit, 11),
      receiptType: typeof parsed.receiptType === "string" ? parsed.receiptType.trim().slice(0, 40) || null : null,
      pointOfSale: digits(parsed.pointOfSale),
      receiptNumber: digits(parsed.receiptNumber),
      issuedOn: date(parsed.issuedOn),
      totalAmount: amount,
      cae: digits(parsed.cae, 14),
      caeExpiresOn: date(parsed.caeExpiresOn),
    };
  } catch (error) {
    if (error instanceof Error && (error.message === "TICKET_READER_BUSY" || error.name === "TimeoutError")) {
      throw new Error("TICKET_READER_BUSY");
    }
    console.error("Ticket reader: unexpected error", error instanceof Error ? error.message : "unknown");
    return emptyTicket;
  }
}

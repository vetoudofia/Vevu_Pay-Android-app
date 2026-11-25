function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sanitizeLinkUrl(rawUrl: string): string {
  // Decode basic HTML entities so encoded schemes like &#106;avascript: can't bypass checks
  const decoded = rawUrl
    .trim()
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/gi, "&")
    .trim();

  if (!decoded) return "#";

  // Allow relative internal paths (like "/terms"), rejecting protocol-relative "//evil.com"
  if (decoded.startsWith("/") && !decoded.startsWith("//")) {
    return escapeHtmlAttr(decoded);
  }

  try {
    const parsed = new URL(decoded);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === "https:" || protocol === "http:" || protocol === "mailto:") {
      return escapeHtmlAttr(parsed.toString());
    }
  } catch {
    return "#";
  }

  return "#";
}

// Tiny, no-dependency markdown renderer for legal pages
export function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold text-foreground mt-6 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold text-foreground mt-8 mb-3">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-bold text-foreground mt-8 mb-3">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Sanitize links and escape attribute values to prevent XSS / attribute breakout
    .replace(/\[(.+?)\]\((.+?)\)/g, (_, text, url) => {
      const safeHref = sanitizeLinkUrl(url);
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">${text}</a>`;
    })
    .replace(/^- (.+)$/gm, '<li class="ml-5 list-disc">$1</li>')
    .replace(/(<li.*<\/li>(\n|$))+/g, '<ul class="space-y-1 my-3">$&</ul>')
    .split(/\n\n+/)
    .map((block) => {
      block = block.trim();
      if (!block) return "";
      if (block.startsWith("<h") || block.startsWith("<ul") || block.startsWith("<li")) return block;
      return `<p class="mb-3 leading-relaxed">${block.replace(/\n/g, " ")}</p>`;
    })
    .join("\n");

  return html;
}

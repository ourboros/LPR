(function bootstrapMarkdownRenderer(global) {
  function normalizeText(text) {
    return String(text || "")
      .replace(/\r\n/g, "\n")
      .trim();
  }

  function renderFallback(container, text, emptyText) {
    const normalized = normalizeText(text)
      .replace(/^\s{0,3}#{1,6}\s*/gm, "")
      .trim();

    const paragraphs = normalized
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);

    if (paragraphs.length === 0) {
      container.textContent = emptyText;
      return;
    }

    paragraphs.forEach((paragraph) => {
      const p = document.createElement("p");
      p.textContent = paragraph;
      container.appendChild(p);
    });
  }

  function createSafeHtml(markdownText) {
    if (typeof global.marked === "undefined") {
      throw new Error("marked is not loaded");
    }

    const rawHtml = global.marked.parse(normalizeText(markdownText), {
      breaks: true,
      gfm: true,
    });

    if (typeof global.DOMPurify === "undefined") {
      throw new Error("DOMPurify is not loaded");
    }

    return global.DOMPurify.sanitize(rawHtml, {
      USE_PROFILES: { html: true },
      ADD_ATTR: ["target", "rel"],
    });
  }

  function hardenLinks(container) {
    container.querySelectorAll("a").forEach((anchor) => {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    });
  }

  function renderToContainer(container, text, options) {
    const config = {
      emptyText: "AI 未回傳內容",
      className: "markdown-content",
      ...(options || {}),
    };

    container.innerHTML = "";

    if (config.className) {
      container.classList.add(config.className);
    }

    const normalized = normalizeText(text);

    if (!normalized) {
      container.textContent = config.emptyText;
      return;
    }

    try {
      container.innerHTML = createSafeHtml(normalized);
      hardenLinks(container);
    } catch (error) {
      console.warn("Markdown render fallback:", error.message);
      renderFallback(container, normalized, config.emptyText);
    }
  }

  global.LPRMarkdown = {
    renderToContainer,
  };
})(window);

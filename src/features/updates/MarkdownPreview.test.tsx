import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MarkdownPreview from "./MarkdownPreview";

describe("MarkdownPreview", () => {
  it("renders GitHub release-note headings, emphasis, lists, and tables", () => {
    const html = renderToStaticMarkup(
      <MarkdownPreview markdown={"## Cervical Guard 0.1.3\n\n- **fix:** background downloads\n\n| Version | Status |\n| --- | --- |\n| 0.1.3 | ready |"} />,
    );

    expect(html).toContain("<h2");
    expect(html).toContain("<strong>fix:</strong>");
    expect(html).toContain("<li>");
    expect(html).toContain("<table>");
    expect(html).not.toContain("## Cervical Guard");
  });

  it("does not execute raw HTML from release notes", () => {
    const html = renderToStaticMarkup(<MarkdownPreview markdown={'<script>alert("unsafe")</script>'} />);
    expect(html).not.toContain("<script>");
  });
});

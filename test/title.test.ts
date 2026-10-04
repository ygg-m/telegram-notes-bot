import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchTitle } from "../src/title.js";

function html(body: string, type = "text/html; charset=utf-8", ok = true) {
  return new Response(body, { status: ok ? 200 : 404, headers: { "content-type": type } });
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchTitle", () => {
  it("extracts and cleans the page title", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html("<html><head><title>\n  Nice &amp; Cheap   Lamp \n</title></head>")));
    expect(await fetchTitle("https://shop.example/p")).toBe("Nice & Cheap Lamp");
  });

  it("truncates very long titles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html(`<title>${"a".repeat(500)}</title>`)));
    expect((await fetchTitle("https://shop.example/p"))!.length).toBe(120);
  });

  it("returns undefined for non-html, errors and missing titles", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => html("{}", "application/json")));
    expect(await fetchTitle("https://a.example")).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => html("<title>x</title>", "text/html", false)));
    expect(await fetchTitle("https://a.example")).toBeUndefined();
    vi.stubGlobal("fetch", vi.fn(async () => html("<p>no title</p>")));
    expect(await fetchTitle("https://a.example")).toBeUndefined();
  });

  it("never throws when the request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("boom"))));
    expect(await fetchTitle("https://a.example")).toBeUndefined();
    expect(await fetchTitle("not a url")).toBeUndefined();
  });

  it.each([
    "http://localhost:8080/",
    "http://127.0.0.1/",
    "http://10.1.2.3/",
    "http://192.168.0.5/",
    "http://172.20.0.1/",
    "http://169.254.169.254/latest",
    "http://app.internal/",
    "http://[::1]/",
    "ftp://example.com/file",
  ])("refuses to fetch %s", async (url) => {
    const spy = vi.fn(async () => html("<title>secret</title>"));
    vi.stubGlobal("fetch", spy);
    expect(await fetchTitle(url)).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });

  it("still fetches public addresses that merely look similar", async () => {
    const spy = vi.fn(async () => html("<title>ok</title>"));
    vi.stubGlobal("fetch", spy);
    expect(await fetchTitle("http://172.32.0.1/")).toBe("ok");
    expect(await fetchTitle("http://100.example.com/")).toBe("ok");
  });
});

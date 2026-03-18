/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

do_get_profile();

const {
  replaceUrlsWithIds,
  restoreUrlIds,
  defangHallucinatedUrls,
  stripUnresolvedUrlIds,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/aiwindow/models/Tools.sys.mjs"
);

add_task(function test_replaceUrlsWithIds_basic() {
  const urlIdMap = new Map();
  const result = replaceUrlsWithIds(
    "Visit https://www.example.com/page for details.",
    urlIdMap
  );
  Assert.equal(result, "Visit [URL_1] for details.");
  Assert.equal(urlIdMap.size, 1);
  Assert.equal(urlIdMap.get("URL_1"), "https://www.example.com/page");
});

add_task(function test_replaceUrlsWithIds_multiple_urls() {
  const urlIdMap = new Map();
  const result = replaceUrlsWithIds(
    "See https://a.com/article and https://b.com/item for info.",
    urlIdMap
  );
  Assert.equal(result, "See [URL_1] and [URL_2] for info.");
  Assert.equal(urlIdMap.size, 2);
  Assert.equal(urlIdMap.get("URL_1"), "https://a.com/article");
  Assert.equal(urlIdMap.get("URL_2"), "https://b.com/item");
});

add_task(function test_replaceUrlsWithIds_deduplicates() {
  const urlIdMap = new Map();
  const result = replaceUrlsWithIds(
    "https://a.com/article appears twice: https://a.com/article",
    urlIdMap
  );
  Assert.equal(result, "[URL_1] appears twice: [URL_1]");
  Assert.equal(urlIdMap.size, 1);
});

add_task(function test_replaceUrlsWithIds_continues_counter_across_calls() {
  const urlIdMap = new Map();
  replaceUrlsWithIds("First: https://a.com/article", urlIdMap);
  const result = replaceUrlsWithIds("Second: https://b.com/item", urlIdMap);
  Assert.equal(result, "Second: [URL_2]");
  Assert.equal(urlIdMap.size, 2);
});

add_task(function test_replaceUrlsWithIds_strips_trailing_punctuation() {
  const urlIdMap = new Map();
  const result = replaceUrlsWithIds(
    "See https://example.com/page, and https://other.com/item.",
    urlIdMap
  );
  Assert.equal(result, "See [URL_1], and [URL_2].");
  Assert.equal(urlIdMap.get("URL_1"), "https://example.com/page");
  Assert.equal(urlIdMap.get("URL_2"), "https://other.com/item");
});

add_task(function test_replaceUrlsWithIds_empty_string() {
  const urlIdMap = new Map();
  Assert.equal(replaceUrlsWithIds("", urlIdMap), "");
  Assert.equal(urlIdMap.size, 0);
});

add_task(function test_replaceUrlsWithIds_no_urls() {
  const urlIdMap = new Map();
  const text = "No links here, just plain text.";
  Assert.equal(replaceUrlsWithIds(text, urlIdMap), text);
  Assert.equal(urlIdMap.size, 0);
});

add_task(function test_restoreUrlIds_basic() {
  const urlIdMap = new Map([["URL_1", "https://www.example.com/page"]]);
  const result = restoreUrlIds("Visit [URL_1] for details.", urlIdMap);
  Assert.equal(
    result,
    "Visit [https://www.example.com/page](https://www.example.com/page) for details."
  );
});

add_task(function test_restoreUrlIds_multiple() {
  const urlIdMap = new Map([
    ["URL_1", "https://a.com/article"],
    ["URL_2", "https://b.com/item"],
  ]);
  const result = restoreUrlIds("See [URL_1] and [URL_2].", urlIdMap);
  Assert.equal(
    result,
    "See [https://a.com/article](https://a.com/article) and [https://b.com/item](https://b.com/item)."
  );
});

add_task(function test_restoreUrlIds_unknown_id_preserved() {
  const urlIdMap = new Map([["URL_1", "https://a.com/article"]]);
  const result = restoreUrlIds("[URL_99] is unknown", urlIdMap);
  Assert.equal(result, "[URL_99] is unknown");
});

add_task(function test_restoreUrlIds_empty_map() {
  const urlIdMap = new Map();
  const text = "Some text [URL_1] here";
  Assert.equal(restoreUrlIds(text, urlIdMap), text);
});

add_task(function test_roundtrip() {
  const original =
    "Check https://first.com/path?q=1 and https://second.org/article for details.";
  const urlIdMap = new Map();
  const replaced = replaceUrlsWithIds(original, urlIdMap);
  // Bare [URL_n] tokens are restored as self-referencing markdown links.
  const restored = restoreUrlIds(replaced, urlIdMap);
  Assert.equal(
    restored,
    "Check [https://first.com/path?q=1](https://first.com/path?q=1) and [https://second.org/article](https://second.org/article) for details."
  );
});

add_task(function test_replaceUrlsWithIds_strips_root_domain_with_slash() {
  const urlIdMap = new Map();
  const result = replaceUrlsWithIds(
    "Visit https://www.allclad.com/ for info.",
    urlIdMap
  );
  Assert.equal(result, "Visit  for info.", "Root domain URL should be stripped");
  Assert.equal(urlIdMap.size, 0);
});

add_task(function test_replaceUrlsWithIds_strips_root_domain_no_slash() {
  const urlIdMap = new Map();
  const result = replaceUrlsWithIds(
    "Visit https://www.madeincookware.com for info.",
    urlIdMap
  );
  Assert.equal(result, "Visit  for info.", "Root domain URL should be stripped");
  Assert.equal(urlIdMap.size, 0);
});

add_task(function test_replaceUrlsWithIds_keeps_path_url() {
  const urlIdMap = new Map();
  const result = replaceUrlsWithIds(
    "Visit https://www.allclad.com/products/d5 for info.",
    urlIdMap
  );
  Assert.equal(result, "Visit [URL_1] for info.", "URL with path should be kept");
  Assert.equal(urlIdMap.get("URL_1"), "https://www.allclad.com/products/d5");
});

add_task(function test_replaceUrlsWithIds_prefix_dedup_slash() {
  const urlIdMap = new Map();
  const full = "https://www.amazon.com/3-quart-stock-pots/s?k=3+quart+stock+pots";
  const canonical = "https://www.amazon.com/3-quart-stock-pots";
  // Full URL appears first (e.g. in the get_page_content header)
  const text = `from ${full}:\n\nSee also ${canonical} for details.`;
  const result = replaceUrlsWithIds(text, urlIdMap);
  Assert.equal(
    result,
    "from [URL_1]:\n\nSee also [URL_1] for details.",
    "Canonical prefix URL should reuse the longer URL's ID"
  );
  Assert.equal(urlIdMap.size, 1);
  Assert.equal(urlIdMap.get("URL_1"), full);
});

add_task(function test_replaceUrlsWithIds_prefix_dedup_query() {
  const urlIdMap = new Map();
  const full = "https://example.com/page?ref=nav";
  const base = "https://example.com/page";
  replaceUrlsWithIds(`${full} and ${base}`, urlIdMap);
  Assert.equal(urlIdMap.size, 1, "Base URL without query should reuse full URL's ID");
  Assert.equal(urlIdMap.get("URL_1"), full);
});

add_task(function test_replaceUrlsWithIds_junk_fragment_dedup() {
  const urlIdMap = new Map();
  const base = "https://www.foodandwine.com/best-saucepans-8716729";
  replaceUrlsWithIds(`${base} is the clean URL.`, urlIdMap);
  Assert.equal(urlIdMap.size, 1);
  Assert.equal(urlIdMap.get("URL_1"), base);

  // Junk-fragment variants that Google ad sitelinks produce should reuse URL_1
  for (const junk of ["??&#", "?#", "?#&$", "?&"]) {
    const result = replaceUrlsWithIds(`See ${base}${junk} here.`, urlIdMap);
    Assert.equal(
      result,
      "See [URL_1] here.",
      `Junk variant ${junk} should reuse base URL's ID`
    );
  }
  Assert.equal(urlIdMap.size, 1, "No new IDs should be created for junk variants");
});

add_task(function test_replaceUrlsWithIds_resolves_google_redirect() {
  const urlIdMap = new Map();
  const actual = "https://elegoo.com/products/centauri-carbon";
  const googleUrl = `https://www.google.com/url?q=${encodeURIComponent(actual)}&sa=T&ved=123`;
  const result = replaceUrlsWithIds(`Check out ${googleUrl} here.`, urlIdMap);
  Assert.equal(result, "Check out [URL_1] here.");
  Assert.equal(urlIdMap.get("URL_1"), actual, "Should store the resolved URL");
});

add_task(function test_replaceUrlsWithIds_strips_google_search_urls() {
  const urlIdMap = new Map();
  const searchUrl =
    "https://www.google.com/search?client=firefox-b-1-d&q=Elegoo+Centauri";
  const result = replaceUrlsWithIds(`See ${searchUrl} results.`, urlIdMap);
  Assert.equal(result, "See  results.", "Google search URL should be removed");
  Assert.equal(urlIdMap.size, 0, "Google search URL should not be stored");
});

add_task(function test_roundtrip_in_markdown_link() {
  const original = "Read [the article](https://example.com/article/123) now.";
  const urlIdMap = new Map();
  const replaced = replaceUrlsWithIds(original, urlIdMap);
  Assert.equal(replaced, "Read [the article]([URL_1]) now.");
  const restored = restoreUrlIds(replaced, urlIdMap);
  Assert.equal(restored, original);
});

// defangHallucinatedUrls tests

add_task(function test_defang_keeps_valid_markdown_link() {
  const valid = new Set(["https://real.com/page"]);
  const text = "See [the page](https://real.com/page) for details.";
  Assert.equal(defangHallucinatedUrls(text, valid), text);
});

add_task(function test_defang_strips_invalid_markdown_link() {
  const valid = new Set(["https://real.com/page"]);
  const text = "See [fake link](https://hallucinated.com/page) here.";
  Assert.equal(defangHallucinatedUrls(text, valid), "See fake link here.");
});

add_task(function test_defang_keeps_valid_bare_url() {
  const valid = new Set(["https://real.com/page"]);
  const text = "Visit https://real.com/page today.";
  Assert.equal(
    defangHallucinatedUrls(text, valid),
    "Visit [https://real.com/page](https://real.com/page) today."
  );
});

add_task(function test_defang_wraps_invalid_bare_url() {
  const valid = new Set(["https://real.com/page"]);
  const text = "Visit https://hallucinated.com/page today.";
  Assert.equal(
    defangHallucinatedUrls(text, valid),
    "Visit `https://hallucinated.com/page` today."
  );
});

add_task(function test_defang_mixed_valid_and_invalid() {
  const valid = new Set(["https://real.com/products"]);
  const text =
    "[good](https://real.com/products) and [bad](https://fake.com/item) and https://also-fake.com/thing";
  Assert.equal(
    defangHallucinatedUrls(text, valid),
    "[good](https://real.com/products) and bad and `https://also-fake.com/thing`"
  );
});

add_task(function test_defang_full_pipeline() {
  const urlIdMap = new Map();
  const pageContent = "Product at https://elegoo.com/centauri for details.";
  const replaced = replaceUrlsWithIds(pageContent, urlIdMap);
  const reconstructedUrls = new Set(urlIdMap.values());

  const llmResponse =
    "Buy it at [Elegoo]([URL_1]) or try https://hallucinated.com/fake";
  const restored = restoreUrlIds(llmResponse, urlIdMap);
  Assert.equal(
    restored,
    "Buy it at [Elegoo](https://elegoo.com/centauri) or try https://hallucinated.com/fake"
  );
  const defanged = defangHallucinatedUrls(restored, reconstructedUrls);
  Assert.equal(
    defanged,
    "Buy it at [Elegoo](https://elegoo.com/centauri) or try `https://hallucinated.com/fake`"
  );
});

// stripUnresolvedUrlIds tests

add_task(function test_stripUnresolvedUrlIds_markdown_link() {
  Assert.equal(
    stripUnresolvedUrlIds("[All-Clad Saucepan]([URL_1])"),
    "All-Clad Saucepan"
  );
});

add_task(function test_stripUnresolvedUrlIds_bare_token() {
  Assert.equal(stripUnresolvedUrlIds("See [URL_1] for details."), "See  for details.");
});

add_task(function test_stripUnresolvedUrlIds_leaves_real_urls() {
  const text = "[product](https://example.com/page)";
  Assert.equal(stripUnresolvedUrlIds(text), text);
});

add_task(function test_stripUnresolvedUrlIds_no_tokens() {
  const text = "Plain text with no tokens.";
  Assert.equal(stripUnresolvedUrlIds(text), text);
});

add_task(function test_stripUnresolvedUrlIds_mixed() {
  const text =
    "[good](https://real.com/page) and [bad link]([URL_3]) and bare [URL_5] here.";
  Assert.equal(
    stripUnresolvedUrlIds(text),
    "[good](https://real.com/page) and bad link and bare  here."
  );
});

// ==UserScript==
// @name         Stella Uploader link customizer
// @namespace    https://stellabms.xyz/
// @version      1.0.2
// @description  Stella Uploader の譜面リンクボタンを差し替える
// @author       Frs1pw
// @match        https://stellabms.xyz/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
  "use strict";

  /*
   * 設定欄
   * enabledをtrue/false にするとボタンのON/OFFが切り替わる。
   * この配列の並び順を変えると実際の並び順にも反映される。
   */
  const BUTTONS = [
    { key: "mocha", enabled: true },
    { key: "bmsIr", enabled: true },
    { key: "viewer", enabled: true },
    { key: "stellaverse", enabled: false },
    { key: "minir", enabled: false },
    { key: "bokutachi", enabled: false },
  ];

  const HASH_BY_MD5 = new Map();
  const HASH_BY_SHA256 = new Map();
  const STYLE_ID = "stella-uploader-link-customizer-style";
  const READY_CLASS = "stella-uploader-link-customizer-ready";

  const LINK_DEFINITIONS = {
    mocha: {
      label: "Mocha",
      needs: ["sha256"],
      url: ({ sha256 }) => `https://mocha-repository.info/song.php?sha256=${sha256}`,
    },
    bmsIr: {
      label: "BMS-IR",
      needs: ["md5"],
      url: ({ md5 }) => `https://bms-ir.org/new/song?songmd5=${md5}`,
    },
    viewer: {
      label: "Viewer",
      needs: ["md5"],
      url: ({ md5 }) => `https://bms-score-viewer.pages.dev/view?md5=${md5}`,
    },
    stellaverse: {
      label: "Stellaverse IR",
      needs: ["md5"],
      url: ({ md5 }) => `https://ir.stellabms.xyz/charts/${md5}`,
    },
    minir: {
      label: "MinIR",
      needs: ["sha256"],
      url: ({ sha256 }) => `https://www.gaftalk.com/minir/#/viewer/song/${sha256}/0`,
    },
    bokutachi: {
      label: "Bokutachi",
      needs: [],
      url: () => "https://boku.tachi.ac/games/bms-7k/songs/",
    },
  };

  const KNOWN_LINK_SELECTOR = [
    'a[href*="ir.stellabms.xyz/charts/"]',
    'a[href*="gaftalk.com/minir/"]',
    'a[href*="boku.tachi.ac/games/bms-7k/songs/"]',
    'a[href*="bms-score-viewer.pages.dev/view"]',
    'a[href*="mocha-repository.info/song.php"]',
    'a[href*="bms-ir.org/new/song"]',
  ].join(",");

  const HIDE_GROUP_SELECTOR = [
    'span:has(> a[href*="ir.stellabms.xyz/charts/"])',
    'span:has(> a[href*="gaftalk.com/minir/"])',
    'span:has(> a[href*="boku.tachi.ac/games/bms-7k/songs/"])',
    'span:has(> a[href*="bms-score-viewer.pages.dev/view"])',
    'span:has(> a[href*="mocha-repository.info/song.php"])',
    'span:has(> a[href*="bms-ir.org/new/song"])',
  ].join(",");

  const DEFAULT_LINK_CLASS = [
    "inline-flex",
    "items-center",
    "justify-center",
    "whitespace-nowrap",
    "rounded-md",
    "text-sm",
    "font-medium",
    "transition-colors",
    "focus-visible:outline-none",
    "focus-visible:ring-1",
    "focus-visible:ring-ring",
    "disabled:pointer-events-none",
    "disabled:opacity-50",
    "bg-primary",
    "text-primary-foreground",
    "shadow",
    "hover:bg-primary/90",
    "h-9",
    "px-4",
    "py-2",
  ].join(" ");

  function extractFirst(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[1].toLowerCase();
    }
    return "";
  }

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;

    document.documentElement.classList.add("stella-uploader-link-customizer");

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
html.stella-uploader-link-customizer :is(${HIDE_GROUP_SELECTOR}):not(.${READY_CLASS}) {
  visibility: hidden !important;
}
`;
    (document.head || document.documentElement).appendChild(style);
  }

  function rememberHashPair(md5, sha256) {
    if (!md5 || !sha256) return;

    const normalizedMd5 = md5.toLowerCase();
    const normalizedSha256 = sha256.toLowerCase();
    const isNewPair = HASH_BY_MD5.get(normalizedMd5) !== normalizedSha256;
    HASH_BY_MD5.set(normalizedMd5, normalizedSha256);
    HASH_BY_SHA256.set(normalizedSha256, normalizedMd5);
    if (isNewPair) scheduleRender();
  }

  function rememberHashPairsFromText(text) {
    if (!text) return;

    const objectLikePattern = /(?:md5|sha256)\\?["']?\s*[:=]\s*\\?["'][0-9a-f]{32,64}\\?["'][\s\S]{0,800}?(?:md5|sha256)\\?["']?\s*[:=]\s*\\?["'][0-9a-f]{32,64}\\?["']/gi;
    for (const match of text.matchAll(objectLikePattern)) {
      const chunk = match[0];
      const md5 = extractFirst(chunk, [
        /md5\\?["']?\s*[:=]\s*\\?["']([0-9a-f]{32})/i,
      ]);
      const sha256 = extractFirst(chunk, [
        /sha256\\?["']?\s*[:=]\s*\\?["']([0-9a-f]{64})/i,
      ]);
      rememberHashPair(md5, sha256);
    }
  }

  function installFetchHook() {
    const originalFetch = window.fetch;
    if (!originalFetch || originalFetch.stellaUploaderLinkCustomizerHooked) return;

    function hookedFetch(...args) {
      return originalFetch.apply(this, args).then((response) => {
        try {
          const contentType = response.headers.get("content-type") || "";
          if (/json|text|rsc|x-component/i.test(contentType)) {
            response.clone().text().then(rememberHashPairsFromText).catch(() => { });
          }
        } catch {
          // Ignore responses that cannot be cloned/read.
        }
        return response;
      });
    }

    hookedFetch.stellaUploaderLinkCustomizerHooked = true;
    window.fetch = hookedFetch;
  }

  function extractHashes(group) {
    const hrefs = Array.from(group.querySelectorAll("a[href]"), (anchor) => [
      anchor.getAttribute("href") || "",
      anchor.href || "",
    ]).flat();
    const text = hrefs.concat(group.innerHTML).join("\n");

    const md5 = extractFirst(text, [
      /\/charts\/([0-9a-f]{32})(?:[/?#]|$)/i,
      /[?&](?:md5|songmd5)=([0-9a-f]{32})(?:[&#]|$)/i,
    ]);
    const sha256 = extractFirst(text, [
      /\/viewer\/song\/([0-9a-f]{64})(?:[/?#]|$)/i,
      /[?&]sha256=([0-9a-f]{64})(?:[&#]|$)/i,
    ]);

    rememberHashPair(md5, sha256);

    return {
      md5: md5 || HASH_BY_SHA256.get(sha256) || "",
      sha256: sha256 || HASH_BY_MD5.get(md5) || "",
    };
  }

  function findButtonGroup(anchor) {
    const span = anchor.closest("span");
    if (span && span.querySelector(KNOWN_LINK_SELECTOR)) return span;
    return null;
  }

  function isAvailable(definition, hashes) {
    return definition.needs.every((key) => Boolean(hashes[key]));
  }

  function createLink(definition, hashes, className) {
    const link = document.createElement("a");
    link.href = definition.url(hashes);
    link.textContent = definition.label;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.referrerPolicy = "no-referrer";
    link.className = className || DEFAULT_LINK_CLASS;
    return link;
  }

  function renderGroup(group) {
    const hashes = extractHashes(group);
    const activeButtons = BUTTONS
      .filter((button) => button.enabled)
      .map((button) => LINK_DEFINITIONS[button.key])
      .filter(Boolean)
      .filter((definition) => isAvailable(definition, hashes));

    if (activeButtons.length === 0) {
      group.classList.add(READY_CLASS);
      return;
    }

    const signature = [
      hashes.md5,
      hashes.sha256,
      activeButtons.map((definition) => definition.label).join(","),
    ].join("|");

    if (group.dataset.stellaUploaderLinkSignature === signature) return;

    const sampleLink = group.querySelector("a[href]");
    const className = sampleLink ? sampleLink.className : DEFAULT_LINK_CLASS;
    group.replaceChildren(
      ...activeButtons.map((definition) => createLink(definition, hashes, className)),
    );
    group.classList.add(READY_CLASS);
    group.dataset.stellaUploaderLinkSignature = signature;
  }

  function renderAll() {
    if (location.pathname !== "/uploader") return;
    installStyle();
    rememberHashPairsFromText(document.documentElement.textContent || "");

    const groups = new Set();
    for (const anchor of document.querySelectorAll(KNOWN_LINK_SELECTOR)) {
      const group = findButtonGroup(anchor);
      if (group) groups.add(group);
    }

    for (const group of groups) renderGroup(group);
  }

  let timerId = 0;
  function scheduleRender() {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(renderAll, 100);
  }

  installFetchHook();
  renderAll();

  function observe() {
    if (!document.body) {
      window.setTimeout(observe, 50);
      return;
    }

    const observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, { childList: true, subtree: true });
    scheduleRender();
  }

  observe();

  window.addEventListener("popstate", scheduleRender);
})();

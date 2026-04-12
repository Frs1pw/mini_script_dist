// ==UserScript==
// @name         StellaVerse votes viewer
// @namespace    https://stellabms.xyz/
// @version      1.0.0
// @description  スレッドページに経過時間と投票率を表示するだけ
// @author       Frs1pw
// @match        https://stellabms.xyz/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  const ELAPSED_UPDATE_MS = 1000;
  const CONTAINER_ID = "vote-stats-container";
  const DEBUG = false;

  function log(...args) {
    if (DEBUG) console.log("[VoteStats]", ...args);
  }

  function parseTimestamp(str) {
    const m = str.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!m) return null;
    const [, Y, M, D, h, min, s] = m.map(Number);
    return new Date(Date.UTC(Y, M - 1, D, h - 9, min, s));
  }

  function formatElapsed(start) {
    let diff = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
    const days = Math.floor(diff / 86400);
    diff %= 86400;
    const hours = Math.floor(diff / 3600);
    diff %= 3600;
    const minutes = Math.floor(diff / 60);
    return `${days} days ${hours} hours ${minutes} minutes`;
  }

  function detectVoteType(card) {
    for (const svg of card.querySelectorAll("svg")) {
      const cls = (svg.getAttribute("class") || "").toLowerCase();
      if (cls.includes("thumbs-up") || cls.includes("thumbsup")) {
        log(card.id, "→ yes");
        return "yes";
      }
      if (cls.includes("thumbs-down") || cls.includes("thumbsdown")) {
        log(card.id, "→ no");
        return "no";
      }
    }

    log(card.id, "→ comment");
    return "comment";
  }

  function collectVotes() {
    const cards = document.querySelectorAll('[id^="thread-"]');
    let yes = 0;
    let no = 0;
    let firstTimestamp = null;

    for (const card of cards) {
      if (!firstTimestamp) {
        const text = card.textContent;
        const m = text.match(/@\s*(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/);
        if (m) firstTimestamp = parseTimestamp(m[1]);
      }

      const type = detectVoteType(card);
      if (type === "yes") yes++;
      if (type === "no") no++;
    }

    const total = yes + no;
    const yesPercent = total > 0 ? (yes / total) * 100 : 0;

    return { yes, no, total, yesPercent, firstTimestamp };
  }


  function createStatsElement(data) {
    const el = document.createElement("div");
    el.id = CONTAINER_ID;
    el.style.cssText = [
      "margin: 8px 0 12px 0",
      "padding: 12px 16px",
      "border-radius: 8px",
      "background: rgba(128,128,128,0.1)",
      "font-size: 14px",
      "line-height: 1.8",
    ].join(";");

    const elapsedLine = document.createElement("div");
    elapsedLine.id = "vote-stats-elapsed";
    if (data.firstTimestamp) {
      elapsedLine.textContent = `Elapsed time: ${formatElapsed(data.firstTimestamp)}`;
    } else {
      elapsedLine.textContent = "Elapsed time: —";
    }
    el.appendChild(elapsedLine);

    const voteLine = document.createElement("div");
    voteLine.id = "vote-stats-count";
    if (data.total > 0) {
      voteLine.textContent =
        `Yes: ${data.yes} / No: ${data.no} (${data.yesPercent.toFixed(2)}%)`;
    } else {
      voteLine.textContent = "Yes: 0 / No: 0 (no votes yet)";
    }
    el.appendChild(voteLine);

    const bar = document.createElement("div");
    bar.style.cssText = [
      "display: flex",
      "height: 10px",
      "border-radius: 5px",
      "overflow: hidden",
      "margin-top: 6px",
      "background: #333",
    ].join(";");

    if (data.total > 0) {
      const green = document.createElement("div");
      green.id = "vote-stats-bar-green";
      green.style.cssText = `width:${data.yesPercent}%;background:#22c55e;transition:width .3s`;
      bar.appendChild(green);

      const red = document.createElement("div");
      red.id = "vote-stats-bar-red";
      red.style.cssText = `width:${100 - data.yesPercent}%;background:#ef4444;transition:width .3s`;
      bar.appendChild(red);
    }
    el.appendChild(bar);

    return el;
  }

  function findInsertionPoint() {
    const h2 = document.querySelector("h2.text-gray-500")
      || document.querySelector("main h2");
    return h2;
  }

  function render(data) {
    const old = document.getElementById(CONTAINER_ID);
    if (old) old.remove();

    const anchor = findInsertionPoint();
    if (!anchor) {
      log("insertion point not found");
      return;
    }

    const el = createStatsElement(data);
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
  }

  let timerHandle = null;
  let cachedTimestamp = null;

  function run() {
    const data = collectVotes();
    cachedTimestamp = data.firstTimestamp;
    render(data);
    log("rendered", data);

    if (timerHandle) clearInterval(timerHandle);
    if (cachedTimestamp) {
      timerHandle = setInterval(() => {
        const el = document.getElementById("vote-stats-elapsed");
        if (el) el.textContent = `Elapsed time: ${formatElapsed(cachedTimestamp)}`;
      }, ELAPSED_UPDATE_MS);
    }
  }

  function waitForCards() {
    if (document.querySelectorAll('[id^="thread-"]').length > 0) {
      run();
      return;
    }

    const obs = new MutationObserver(() => {
      if (document.querySelectorAll('[id^="thread-"]').length > 0) {
        obs.disconnect();
        run();
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      if (/\/thread\/\d+/.test(location.pathname)) {
        setTimeout(waitForCards, 300);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  if (/\/thread\/\d+/.test(location.pathname)) {
    waitForCards();
  }
})();

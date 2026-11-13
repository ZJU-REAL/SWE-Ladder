const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* Scroll progress bar */
const progress = document.querySelector(".sl-progress");
function updateProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  progress.style.setProperty("--p", max > 0 ? scrollY / max : 0);
}
addEventListener("scroll", updateProgress, { passive: true });
updateProgress();

/* Reveal on scroll */
const revealer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      revealer.unobserve(entry.target);
    });
  },
  { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
);
document.querySelectorAll(".reveal").forEach((el) => revealer.observe(el));

/* Active section in navigation */
const navLinks = [...document.querySelectorAll('.sl-nav nav a[href^="#"]')];
const spy = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      navLinks.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${entry.target.id}`));
    });
  },
  { rootMargin: "-45% 0px -50% 0px" },
);
["method", "results", "analysis", "takeaways"].forEach((id) => spy.observe(document.getElementById(id)));

/* Results: scaffold toggle */
(() => {
  const group = document.querySelector("[data-scaffold]");
  if (!group) return;
  const rows = [...document.querySelectorAll(".sl-res-row[data-v]")];
  const maxes = [20, 90, 100];
  const proto = document.querySelector("[data-proto]");
  const note = document.querySelector("[data-res-note]");
  const protos = [
    "R2E-Gym scaffold · 64K context · max 150 steps · temperature 0.7",
    "OpenHands scaffold · 128K context · max 150 steps · temperature 0.7",
  ];
  const notes = [
    "SWE-Ladder reaches <b>16.4%</b> pass@1 in <b>19.3</b> steps on average and ends on its own in <b>98.6%</b> of rollouts. GRPO alone runs to 82.9 steps and self-terminates in only 36.0%.",
    "SWE-Ladder reaches <b>17.6%</b> pass@1. GRPO and SDAR fall below the base model here (11.2% and 6.8% vs. 13.0%).",
  ];
  function set(i) {
    rows.forEach((row) => {
      const values = row.dataset.v.split("|")[i].split(",").map(Number);
      row.querySelectorAll(".m").forEach((cell, k) => {
        cell.querySelector("i").style.setProperty("--w", (values[k] / maxes[k]) * 100);
        cell.querySelector("b").textContent = values[k].toFixed(1);
      });
    });
    proto.textContent = protos[i];
    note.innerHTML = notes[i];
  }
  const buttons = [...group.querySelectorAll("button")];
  buttons.forEach((button, i) =>
    button.addEventListener("click", () => {
      buttons.forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
      set(i);
    }),
  );
  set(0);
})();

/* Probe heat cells: shade within each column, light text on dark cells */
(() => {
  const cells = [...document.querySelectorAll(".sl-probe-grid > i")];
  [0, 1].forEach((col) => {
    const group = cells.filter((_, i) => i % 2 === col);
    const values = group.map((cell) => parseFloat(cell.style.getPropertyValue("--v")));
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    group.forEach((cell, i) => {
      const t = (values[i] - lo) / (hi - lo || 1);
      cell.style.setProperty("--t", t.toFixed(3));
      cell.classList.toggle("dark", t > 0.5);
    });
  });
})();

/* Method figure: rollout → route → ladder */
(() => {
  const fig = document.querySelector("[data-fig]");
  if (!fig) return;
  const stage = fig.querySelector("[data-fig-stage]");
  const svg = fig.querySelector("[data-fig-wires]");
  const roll = fig.querySelector('[data-row="rollout"]');
  const route = fig.querySelector('[data-row="route"]');
  const phases = [...fig.querySelectorAll("[data-phase]")];
  const anchor = (key) => fig.querySelector(`[data-a="${key}"]`);
  const objective = anchor("objective");
  const traj = [...roll.querySelectorAll(".sl-traj li")];
  const seq = [...route.querySelectorAll(".sl-seq li")];
  const states = [...route.querySelectorAll("[data-state]")];
  const rule = route.querySelector("[data-rule]");
  const bubble = roll.querySelector("[data-bubble]");
  const ts = objective.querySelector("[data-ts]");
  const segs = [...objective.querySelectorAll(".sl-sched .seg")];
  const tabs = [...fig.querySelectorAll("[data-fig-tab]")];
  const playButton = fig.querySelector("[data-fig-play]");
  const NS = "http://www.w3.org/2000/svg";
  const stageNames = ["loc", "rep", "patch"];
  const zones = { roll, route, p0: phases[0], p1: phases[1], p2: phases[2], objective };
  Object.entries(zones).forEach(([key, el]) => (el.dataset.zone = key));
  phases.forEach((phase) =>
    phase.querySelectorAll(".sl-mask i").forEach((cell) => cell.classList.toggle("one", cell.textContent.trim() === "1")),
  );

  const calls = [
    { fn: "search", arg: '"proxy.get" oauthlib/', stage: "loc", rule: "a1 · search → <b>LOC</b>: localization comes first." },
    { fn: "file_editor", arg: "create /testbed/reproduce_issue.py", stage: "rep", rule: "a2 · repro script → <b>REP</b>: forward to reproduction." },
    { fn: "file_editor", arg: "str_replace oauthlib/common.py", stage: "patch", rule: "a3 · source edit → <b>PATCH</b>: forward to patching." },
    { fn: "search", arg: '"CaseInsensitiveDict" oauthlib/', stage: "loc", rule: "a4 · one exploration action in PATCH → back to <b>LOC</b>." },
    { fn: "file_editor", arg: "str_replace oauthlib/common.py", stage: "patch", rule: "a5 · patch proposal from LOC → <b>PATCH</b>, skipping REP." },
    { fn: "execute_bash", arg: "python reproduce_issue.py", stage: "rep", rule: "a6 · one test run in PATCH → back to <b>REP</b>." },
  ];
  const defaultRule = rule.innerHTML;
  const finalRule = "Labels annotate distillation only: tool choices, rollouts, and the reward are unchanged.";

  /* ---------- Wires ---------- */
  const colors = { ink: "#8190a6", loc: "var(--loc)", rep: "var(--rep)", patch: "var(--patch)" };
  let wires = {};
  const shown = (el) => el.getClientRects().length > 0;
  function box(el) {
    const r = el.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const l = r.left - s.left;
    const t = r.top - s.top;
    return { l, t, r: l + r.width, b: t + r.height, cx: l + r.width / 2, cy: t + r.height / 2 };
  }
  function link(a, b) {
    if (b.l >= a.r - 4) {
      const mid = (a.r + b.l) / 2;
      return [[a.r, a.cy], [mid, a.cy], [mid, b.cy], [b.l, b.cy]];
    }
    const mid = (a.b + b.t) / 2;
    return [[a.cx, a.b], [a.cx, mid], [b.cx, mid], [b.cx, b.t]];
  }
  function routes() {
    const out = {};
    const gut = parseFloat(getComputedStyle(fig).getPropertyValue("--gut")) || 30;
    const chain = ["issue", "agent", "call", "tests", "reward", "lgrpo"].map((k) => box(anchor(k)));
    for (let i = 0; i < chain.length - 1; i++) out[`roll-${i}`] = ["roll", "ink", link(chain[i], chain[i + 1])];
    const t = box(anchor("traj"));
    const router = box(anchor("router"));
    const rollBox = box(roll);
    const routeBox = box(route);
    const mid = (rollBox.b + routeBox.t) / 2;
    out["traj-router"] = ["route", "ink", [[t.cx, t.b], [t.cx, mid], [router.cx, mid], [router.cx, router.t]]];
    out["router-seq"] = ["route", "ink", link(router, box(anchor("seq")))];
    const obj = box(objective);
    phases.forEach((phase, p) => {
      if (!shown(phase)) return;
      const ph = box(phase);
      out[`seq-p${p}`] = [`p${p}`, stageNames[p], [[ph.cx, routeBox.b], [ph.cx, ph.t]]];
      out[`p${p}-obj`] = [`p${p}`, stageNames[p], [[ph.cx, ph.b], [ph.cx, obj.t]]];
    });
    const g = box(anchor("lgrpo"));
    const gx = obj.r + gut * 0.5;
    out["grpo-obj"] = ["objective", "ink", [[g.r, g.cy], [gx, g.cy], [gx, obj.cy], [obj.r, obj.cy]]];
    return out;
  }
  function pathData(pts, radius = 12) {
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const l1 = Math.hypot(x1 - x0, y1 - y0) || 1;
      const l2 = Math.hypot(x2 - x1, y2 - y1) || 1;
      const k = Math.min(radius, l1 / 2, l2 / 2);
      d += ` L${x1 + ((x0 - x1) / l1) * k},${y1 + ((y0 - y1) / l1) * k}`;
      d += ` Q${x1},${y1} ${x1 + ((x2 - x1) / l2) * k},${y1 + ((y2 - y1) / l2) * k}`;
    }
    const [lx, ly] = pts[pts.length - 1];
    return `${d} L${lx},${ly}`;
  }
  const make = (tag, attrs) => {
    const el = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  };
  function drawWires() {
    const keep = Object.fromEntries(Object.entries(wires).map(([id, w]) => [id, w.g.getAttribute("class")]));
    svg.replaceChildren();
    const defs = make("defs", {});
    Object.entries(colors).forEach(([key, color]) => {
      const marker = make("marker", {
        id: `sl-arrow-${key}`,
        markerWidth: 9,
        markerHeight: 9,
        refX: 8,
        refY: 4.5,
        orient: "auto",
        markerUnits: "userSpaceOnUse",
      });
      marker.append(make("path", { d: "M0,0.5 L9,4.5 L0,8.5 z", style: `fill: ${color}` }));
      defs.append(marker);
    });
    svg.append(defs);
    wires = {};
    Object.entries(routes()).forEach(([id, [zone, color, pts]]) => {
      const d = pathData(pts);
      const g = make("g", { style: `--wc: ${colors[color]}` });
      const base = make("path", { class: "base", d, "marker-end": `url(#sl-arrow-${color})` });
      const flowPath = make("path", { class: "flow", d });
      const dot = make("circle", { class: "dot", r: 4.5, cx: pts[0][0], cy: pts[0][1] });
      g.append(base, flowPath, dot);
      svg.append(g);
      const len = flowPath.getTotalLength();
      flowPath.style.strokeDasharray = `${len} ${len}`;
      flowPath.style.strokeDashoffset = keep[id]?.includes("done") ? 0 : len;
      if (keep[id]) g.setAttribute("class", keep[id]);
      wires[id] = { g, flow: flowPath, dot, len, zone };
    });
    markWires();
  }
  let activeZones = [];
  function markWires() {
    Object.values(wires).forEach((w) => w.g.classList.toggle("on", activeZones.includes(w.zone)));
  }
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  function flow(id, ms) {
    const run = token;
    const start = performance.now();
    return new Promise((resolve) => {
      function frame(now) {
        const w = wires[id];
        if (run !== token || !w) return resolve();
        const t = Math.min(1, (now - start) / ms);
        const at = w.len * ease(t);
        const p = w.flow.getPointAtLength(at);
        w.flow.style.strokeDashoffset = w.len - at;
        w.dot.setAttribute("cx", p.x);
        w.dot.setAttribute("cy", p.y);
        w.g.classList.add("live");
        if (t < 1) return requestAnimationFrame(frame);
        w.g.classList.remove("live");
        w.g.classList.add("done");
        resolve();
      }
      requestAnimationFrame(frame);
    });
  }
  function clearWires() {
    Object.values(wires).forEach((w) => {
      w.g.classList.remove("live", "done");
      w.flow.style.strokeDashoffset = w.len;
    });
  }

  /* ---------- Effects ---------- */
  function bump(el) {
    el.classList.remove("bump");
    void el.offsetWidth;
    el.classList.add("bump");
  }
  function swap(el, html) {
    el.innerHTML = html;
    el.classList.remove("swap");
    void el.offsetWidth;
    el.classList.add("swap");
  }
  const callHtml = (c) =>
    `<span class="k">&lt;function=</span><span class="fn">${c.fn}</span><span class="k">&gt;</span> <span class="arg">${c.arg}</span>`;
  function showCall(k) {
    swap(bubble, callHtml(calls[k]));
    traj.forEach((li, i) => li.classList.toggle("cur", i === k));
    traj[k].classList.add("lit");
  }
  function routeStep(k) {
    states.forEach((s) => s.classList.toggle("on", s.dataset.state === calls[k].stage));
    swap(rule, calls[k].rule);
    seq[k].classList.add("lit");
    bump(seq[k]);
  }
  function setPhase(p) {
    setZones(["route", `p${p}`, "objective"]);
    phases.forEach((phase, i) => phase.classList.toggle("on", i === p));
    showPhase(p);
    drawWires();
    const name = stageNames[p];
    ts.className = `sl-ts ${name}`;
    swap(ts, `T<sub>${name.toUpperCase()}</sub>`);
    seq.forEach((li) => {
      li.classList.toggle("glow", li.classList.contains(name));
      li.classList.toggle("mute", !li.classList.contains(name));
    });
  }
  function litPhase(p, selector) {
    phases[p].querySelectorAll(selector).forEach((el) => el.classList.add("lit"));
  }
  function maskOn(p) {
    phases[p].querySelectorAll(".sl-mask i.one").forEach((cell, i) => setTimeout(() => cell.classList.add("lit"), i * 180));
  }
  function fillSchedule(p, ms) {
    const bar = segs[p].querySelector("i");
    bar.style.transition = `transform ${ms}ms linear`;
    bar.style.transform = "scaleX(1)";
  }
  function showPhase(p) {
    fig.dataset.show = p;
    phases.forEach((phase, i) => phase.classList.toggle("show", i === p));
  }

  /* ---------- Sequences: [duration ms, action] ---------- */
  const sequences = [
    [
      [500, () => bump(anchor("issue"))],
      [650, (ms) => flow("roll-0", ms)],
      [250, () => anchor("agent").classList.add("busy")],
      [650, (ms) => flow("roll-1", ms)],
      ...calls.map((_, k) => [780, () => showCall(k)]),
      [300, () => {
        anchor("agent").classList.remove("busy");
        traj.forEach((li) => li.classList.remove("cur"));
      }],
      [650, (ms) => flow("roll-2", ms)],
      [600, () => anchor("tests").classList.add("lit")],
      [600, (ms) => flow("roll-3", ms)],
      [900, () => anchor("reward").classList.add("lit")],
      [600, (ms) => flow("roll-4", ms)],
      [1700, () => {
        anchor("lgrpo").classList.add("lit");
        bump(anchor("lgrpo"));
      }],
    ],
    [
      [700, (ms) => flow("traj-router", ms)],
      [400, () => bump(anchor("router"))],
      ...calls.map((_, k) => [1250, () => {
        routeStep(k);
        flow("router-seq", 500);
      }]),
      [2000, () => {
        states.forEach((s) => s.classList.remove("on"));
        swap(rule, finalRule);
      }],
    ],
    [
      ...[0, 1, 2].flatMap((p) => [
        [350, () => setPhase(p)],
        [650, (ms) => flow(`seq-p${p}`, ms)],
        [700, () => litPhase(p, ".sl-evidence, .sl-teacher")],
        [800, () => {
          litPhase(p, ".sl-mask");
          maskOn(p);
        }],
        [450, () => litPhase(p, ".sl-lopsd")],
        [700, (ms) => {
          flow(`p${p}-obj`, ms);
          flow("grpo-obj", ms);
        }],
        [1400, (ms) => fillSchedule(p, ms - 200)],
      ]),
      [1200, () => {}],
    ],
  ];
  const tabZones = [["roll"], ["route"], ["route", "p0", "objective"]];

  /* ---------- Player ---------- */
  let token = 0;
  let tabIndex = 0;
  let playing = !reduceMotion;
  let inView = false;
  let running = false;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  function setZones(list) {
    activeZones = list;
    Object.entries(zones).forEach(([key, el]) => el.classList.toggle("on", list.includes(key)));
    markWires();
  }
  function setTab(index, dim) {
    tabIndex = index;
    fig.toggleAttribute("data-dim", dim);
    setZones(tabZones[index]);
    tabs.forEach((tab, i) => tab.setAttribute("aria-pressed", String(i === index)));
  }
  function reset(index) {
    if (index === 0) {
      roll.classList.add("sl-run");
      roll.querySelectorAll(".lit").forEach((el) => el.classList.remove("lit"));
      bubble.innerHTML = '<span class="k">waiting for the first action…</span>';
    }
    if (index === 1) {
      route.classList.add("sl-run");
      seq.forEach((li) => li.classList.remove("lit"));
      swap(rule, defaultRule);
    }
    if (index === 2) {
      phases.forEach((phase) => {
        phase.classList.add("sl-run");
        phase.querySelectorAll(".lit").forEach((el) => el.classList.remove("lit"));
      });
      segs.forEach((seg) => {
        seg.querySelector("i").style.transition = "none";
        seg.querySelector("i").style.transform = "scaleX(0)";
        void seg.offsetWidth;
        seg.querySelector("i").style.transition = "";
      });
    }
    clearWires();
  }
  function settle() {
    [roll, route, ...phases].forEach((el) => el.classList.remove("sl-run"));
    fig.querySelectorAll(".busy").forEach((el) => el.classList.remove("busy"));
    traj.forEach((li) => li.classList.remove("cur"));
    states.forEach((s) => s.classList.remove("on"));
    rule.innerHTML = defaultRule;
    seq.forEach((li) => li.classList.remove("glow", "mute"));
    phases.forEach((phase) => phase.classList.remove("on"));
    segs.forEach((seg) => {
      seg.querySelector("i").style.transition = "";
      seg.querySelector("i").style.transform = "";
    });
    if (bubble.querySelector(".fn") === null) bubble.innerHTML = callHtml(calls[0]);
    ts.className = "sl-ts";
    ts.innerHTML = "T<sub>stage</sub>";
    clearWires();
    tabs.forEach((tab) => tab.style.setProperty("--t", 0));
  }
  function stop() {
    token++;
    running = false;
    settle();
  }
  async function run(index) {
    const my = ++token;
    running = true;
    settle();
    setTab(index, true);
    drawWires();
    reset(index);
    const steps = sequences[index];
    const total = steps.reduce((sum, [ms]) => sum + ms, 0);
    const tab = tabs[index];
    const start = performance.now();
    (function progressFrame(now) {
      if (my !== token) return;
      tab.style.setProperty("--t", Math.min(1, (now - start) / total));
      requestAnimationFrame(progressFrame);
    })(start);
    for (const [ms, action] of steps) {
      action(ms);
      await wait(ms);
      if (my !== token) return;
    }
    running = false;
    settle();
    if (playing && inView) run((index + 1) % sequences.length);
  }
  function select(index) {
    stop();
    if (playing && inView) run(index);
    else {
      setTab(index, true);
      drawWires();
    }
  }
  function setPlaying(next) {
    playing = next;
    fig.toggleAttribute("data-paused", !next);
    playButton.setAttribute("aria-label", next ? "Pause animation" : "Play animation");
    if (next) run(tabIndex);
    else stop();
  }

  tabs.forEach((tab, i) => tab.addEventListener("click", () => select(i)));
  playButton.addEventListener("click", () => setPlaying(!playing));

  new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      if (inView && playing && !running) run(tabIndex);
      if (!inView && running) stop();
    },
    { threshold: 0.25 },
  ).observe(stage);

  let queued = false;
  new ResizeObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      drawWires();
    });
  }).observe(stage);
  document.fonts?.ready.then(drawWires);

  fig.toggleAttribute("data-paused", !playing);
  showPhase(0);
  setTab(0, false);
  drawWires();
})();

/* Copy BibTeX */
document.querySelectorAll("[data-copy]").forEach((button) =>
  button.addEventListener("click", async () => {
    const text = document.getElementById(button.dataset.copy).textContent;
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "copied ✓";
    } catch {
      button.textContent = "select & copy";
    }
    button.classList.add("done");
    setTimeout(() => {
      button.textContent = "copy";
      button.classList.remove("done");
    }, 1800);
  }),
);

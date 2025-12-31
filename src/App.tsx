import React, { useEffect, useId, useMemo, useRef, useState } from "react";

// Water Bottle Tracker — realistic onboarding + simple main UI (React + Tailwind)
// Workflow:
// 0) Welcome
// 1) Onboarding 1/4
// 2) Onboarding 2/4
// 3) Onboarding 3/4
// 4) Onboarding 4/4
// 5) Select bottle (simple)
// 6) Your bottle (setup)
// 7) Daily water target (calculator)
// 8) Summary
// Main screen: bottle shape, title question, scroll wheel (dial), progress bar

const STORAGE_KEY = "wbt_react_v3";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function dayKey(d: Date = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function prevDayKey(d: Date = new Date()) {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return dayKey(x);
}

function ceilDiv(a: number, b: number) {
  return b <= 0 ? 0 : Math.ceil(a / b);
}

function msUntilNextMidnight(d: Date = new Date()) {
  const next = new Date(d);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - d.getTime());
}

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function recommendGoalML({ weightKg, activity, warm }: { weightKg: number; activity: "low" | "moderate" | "high"; warm: boolean }) {
  const base = weightKg * 33;
  let ml = Math.round(base);
  if (activity === "moderate") ml += 300;
  if (activity === "high") ml += 600;
  if (warm) ml += 300;
  const low = Math.round(ml * 0.9);
  const high = Math.round(ml * 1.1);
  return { ml, low, high };
}

function snapValue(v: number, snap: "quarters" | "tenths" | "free") {
  const clamped = clamp(v, 0, 1);
  if (snap === "free") return clamped;
  const step = snap === "tenths" ? 0.1 : 0.25;
  return Math.round(clamped / step) * step;
}

function shapeClasses(shape: string) {
  switch (shape) {
    case "tall":
      return "w-[120px]";
    case "wide":
      return "w-[140px]";
    case "tumbler":
      return "w-[140px]";
    default:
      return "w-[120px]";
  }
}

function bottlePath(shape: string) {
  switch (shape) {
    case "tall":
      return "M62 8 C56 10 54 18 54 26 L54 42 C43 48 38 61 38 75 L38 270 C38 286 49 294 70 294 C91 294 102 286 102 270 L102 75 C102 61 97 48 86 42 L86 26 C86 18 84 10 78 8 Z";
    case "wide":
      return "M55 8 C50 10 48 18 48 26 L48 46 C38 54 32 68 32 85 L32 268 C32 286 48 294 70 294 C92 294 108 286 108 268 L108 85 C108 68 102 54 92 46 L92 26 C92 18 90 10 85 8 Z";
    case "tumbler":
      return "M40 18 C40 12 45 8 52 8 L88 8 C95 8 100 12 100 18 L100 30 C100 36 95 40 88 40 L86 40 L98 276 C99 289 88 294 70 294 C52 294 41 289 42 276 L54 40 L52 40 C45 40 40 36 40 30 Z";
    default:
      return "M58 8 C53 10 51 18 51 26 L51 44 C41 52 36 65 36 80 L36 270 C36 286 49 294 70 294 C91 294 104 286 104 270 L104 80 C104 65 99 52 89 44 L89 26 C89 18 87 10 82 8 Z";
  }
}

function BottleVector({ shape, level, className }: { shape: string; level: number; className?: string }) {
  const id = useId();
  const d = bottlePath(shape);
  const pct = clamp(level, 0, 1);

  const H = 300;
  const W = 140;
  const y = H - pct * H;

  return (
    <svg viewBox="0 0 140 300" className={`h-[300px] ${className || ""}`} aria-hidden="true">
      <defs>
        <clipPath id={`clip-${id}`}>
          <path d={d} />
        </clipPath>
      </defs>

      <g clipPath={`url(#clip-${id})`}>
        <rect x="0" y="0" width={W} height={H} fill="rgba(255,255,255,0.03)" />
        <rect x="0" y={y} width={W} height={pct * H} fill="rgba(10,132,255,0.35)" />
        <rect x="10" y={Math.max(0, y - 2)} width={W - 20} height="2" fill="rgba(10,132,255,0.65)" />
      </g>

      <path d={d} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
      <path d={d} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
    </svg>
  );
}

function formatBottlesDecimal(goalML: number, bottleML: number) {
  if (!bottleML) return "0";
  const v = goalML / bottleML;
  const s = v.toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

function format1(v: number) {
  const s = Number(v || 0).toFixed(1);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

type AppState = ReturnType<typeof makeDefaultState>;

function makeDefaultState() {
  return {
    hasOnboarded: false,
    step: 0 as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8,
    splashSeen: false,

    weightKg: 70,
    activity: "moderate" as "low" | "moderate" | "high",
    warm: false,

    goalML: 2000,
    bottleML: 500,
    shape: "standard" as "tall" | "standard" | "wide" | "tumbler",
    snap: "quarters" as "quarters" | "tenths" | "free",

    bottleModel: "tallSlim" as "tallSlim" | "thirsti" | "stanley",

    thirstiUnlocked: false,
    stanleyUnlocked: false,

    dayKey: dayKey(),
    completedBottles: 0,
    remaining: 1,

    carryML: 0,
    extraML: 0,
    dailyLog: {} as Record<string, { consumedML: number; goalML: number; bottleML: number; carryML: number; extraML: number; at: number }>, 

    history: [] as Array<{ t: number; prevRemaining: number; prevCompleted: number; prevCarry: number; prevExtra: number; action?: string; ml?: number }>,


    celebrate: null as null | { type: "bottle" | "goal"; pct: number; consumedML: number },
  };
}

function totalConsumedFromState(s: AppState) {
  const n = ceilDiv(s.goalML, s.bottleML);
  const completed = clamp(s.completedBottles, 0, n) * s.bottleML;
  const consumedCurrent = Math.round((1 - s.remaining) * s.bottleML);
  const carry = clamp(Math.round(((s as any).carryML || 0) as number), 0, 100000);
  const extra = clamp(Math.round((s.extraML || 0) as number), 0, 100000);
  return Math.min(s.goalML, completed + consumedCurrent + carry + extra);
}

function DropletPlugIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2C9.5 5.8 6.2 9.3 6.2 13.2C6.2 17 8.9 20 12 20s5.8-3 5.8-6.8C17.8 9.3 14.5 5.8 12 2Z"
        fill="#0A84FF"
        opacity="0.95"
      />
      <path
        d="M9.3 10.3c.7-1.4 1.6-2.7 2.7-4.2"
        stroke="rgba(255,255,255,.55)"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.35"
      />
      <rect x="10" y="10" width="4" height="5" rx="1" fill="rgba(255,255,255,.92)" />
      <rect x="9.4" y="9" width="1" height="2" rx="0.4" fill="rgba(255,255,255,.92)" />
      <rect x="13.6" y="9" width="1" height="2" rx="0.4" fill="rgba(255,255,255,.92)" />
      <rect x="11" y="15" width="2" height="2" rx="1" fill="rgba(255,255,255,.92)" />
    </svg>
  );
}

function LockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M7 11V8.5C7 5.5 9.2 3.2 12 3.2C14.8 3.2 17 5.5 17 8.5V11"
        fill="none"
        stroke="rgba(255,255,255,.55)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <rect x="5.5" y="11" width="13" height="10" rx="2.4" fill="rgba(255,255,255,.10)" stroke="rgba(255,255,255,.22)" />
      <path
        d="M12 14.2c.9 0 1.6.7 1.6 1.6c0 .6-.3 1.1-.8 1.4v1.6h-1.6v-1.6c-.5-.3-.8-.8-.8-1.4c0-.9.7-1.6 1.6-1.6Z"
        fill="rgba(255,255,255,.70)"
        opacity="0.85"
      />
    </svg>
  );
}

function QuickAddSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (ml: number) => void }) {
  const items = [
    { label: "A glass", ml: 250 },
    { label: "A can", ml: 330 },
    { label: "A small bottle", ml: 500 },
    { label: "A large bottle", ml: 750 },
  ];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div className="mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-[#121218]/95 shadow-[0_20px_60px_rgba(0,0,0,.55)]">
          <div className="px-5 pt-4 pb-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-lg font-extrabold">Add water</div>
                <div className="mt-1 text-xs font-extrabold text-[#0A84FF]">
                  Tip: use this when you drank water from somewhere else (café, glass, can, etc.).
                </div>
              </div>
              <button
                onClick={onClose}
                className="h-10 w-10 rounded-2xl border border-white/12 bg-white/8 active:bg-white/12 flex items-center justify-center"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="px-5 pb-5">
            <div className="grid gap-2">
              {items.map((it) => (
                <button
                  key={it.label}
                  onClick={() => {
                    onAdd(it.ml);
                    onClose();
                  }}
                  className="w-full rounded-2xl border border-white/12 bg-white/6 px-4 py-4 text-left active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-extrabold">{it.label}</div>
                    <div className="font-extrabold tabular-nums text-[#0A84FF]">+{it.ml}ml</div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-3 text-xs text-white/60">This won’t change your bottle level.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const SPLASH_FILL_MS = 1100;

function SplashBottle({ className, animate = true }: { className?: string; animate?: boolean }) {
  const id = useId();
  const d = bottlePath("standard");
  const H = 300;
  const W = 140;

  return (
    <svg viewBox="0 0 140 300" className={className || ""} aria-hidden="true">
      <defs>
        <clipPath id={`sclip-${id}`}>
          <path d={d} />
        </clipPath>
      </defs>

      <g clipPath={`url(#sclip-${id})`}>
        <rect x="0" y="0" width={W} height={H} fill="rgba(255,255,255,0.03)" />
        <rect x="0" y={animate ? H : 0} width={W} height={animate ? "0" : H} fill="rgba(34,197,94,0.38)">
          {animate && (
            <>
              <animate
                attributeName="y"
                from={H}
                to="0"
                dur="1.1s"
                begin="0s"
                fill="freeze"
                calcMode="spline"
                keySplines="0.2 0 0 1"
              />
              <animate
                attributeName="height"
                from="0"
                to={H}
                dur="1.1s"
                begin="0s"
                fill="freeze"
                calcMode="spline"
                keySplines="0.2 0 0 1"
              />
            </>
          )}
        </rect>

        {animate && (
          <rect x="-30" y="0" width="60" height={H} fill="rgba(255,255,255,0.14)" opacity="0.0" transform="skewX(-18)">
            <animate attributeName="opacity" values="0;0.35;0" dur="1.3s" begin="0.25s" fill="freeze" />
            <animate attributeName="x" from="-60" to="160" dur="1.3s" begin="0.25s" fill="freeze" />
          </rect>
        )}
      </g>

      <path d={d} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="4" />
      <path d={d} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="1" />
    </svg>
  );
}

function WelcomeSplash({ onContinue, instant = false }: { onContinue: () => void; instant?: boolean }) {
  const [showContinue, setShowContinue] = useState(instant);

  useEffect(() => {
    if (instant) return;
    const t = window.setTimeout(() => setShowContinue(true), SPLASH_FILL_MS + 2000);
    return () => window.clearTimeout(t);
  }, [instant]);

  return (
    <div className="min-h-screen bg-[#0B0B0F] text-white flex items-center justify-center">
      <style>{`@keyframes floaty{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}@keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>

      <div className="w-full max-w-md px-5 text-center">
        <div className="mx-auto mb-6 flex h-[360px] items-center justify-center">
          <div className="relative">
            <div className="pointer-events-none absolute -inset-24 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgba(34,197,94,0.16),rgba(0,0,0,0)_68%)] blur-3xl opacity-60 mix-blend-screen" />
            <div className="pointer-events-none absolute -inset-28 rounded-full bg-[radial-gradient(circle_at_50%_60%,rgba(34,197,94,0.08),rgba(0,0,0,0)_72%)] blur-3xl opacity-55" />

            <div style={{ animation: "floaty 2.8s ease-in-out infinite" }} className="w-[160px]">
              <SplashBottle
                animate={!instant}
                className="h-[320px] w-[160px] [filter:drop-shadow(0_22px_55px_rgba(34,197,94,0.16))]"
              />
            </div>
          </div>
        </div>

        <div style={{ animation: "fadeUp .65s ease-out both" }} className="text-4xl md:text-5xl font-extrabold leading-tight">
          Welcome to <span className="text-green-500">1Bottle</span>
        </div>

        <div className={"mt-10 transition-opacity duration-500 " + (showContinue ? "opacity-100" : "opacity-0 pointer-events-none")}>
          <button onClick={onContinue} className="w-full px-4 py-4 rounded-2xl bg-green-500 text-black font-extrabold active:scale-[0.99]">
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

type IntroProps = { onContinue: () => void; onSkip: () => void; onStartOver?: () => void };

function OnboardingFrame({
  stepText,
  title,
  body,
  activeDot,
  buttonLabel,
  buttonTheme,
  onContinue,
  onSkip,
  leftLabel,
  onLeft,
  bottomTight = false,
}: {
  stepText: string;
  title: React.ReactNode;
  body: React.ReactNode;
  activeDot: number;
  buttonLabel: string;
  buttonTheme: "blue" | "green";
  onContinue: () => void;
  onSkip: () => void;
  leftLabel?: string;
  onLeft?: () => void;
  bottomTight?: boolean;
}) {
  const FILL_MS = 1200;
  const [btnReady, setBtnReady] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setBtnReady(true), FILL_MS);
    return () => window.clearTimeout(t);
  }, []);

  const fillClass = buttonTheme === "green" ? "bg-[#22C55E]/55" : "bg-[#0A84FF]/65";
  const bgClass =
    buttonTheme === "green"
      ? "bg-gradient-to-b from-[#0F2416] to-[#0A160F]"
      : "bg-gradient-to-b from-[#111F2E] to-[#0E1621]";
  const labelClass = buttonTheme === "green" ? "text-[#86EFAC]" : "text-[#6EABD4]";

  return (
    <div className="min-h-screen bg-[#0B0B0F] text-white">
      <style>{`
        @keyframes introIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes softFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @keyframes dotPulse { 0%,100% { transform: scale(1); opacity: .65; } 50% { transform: scale(1.25); opacity: .9; } }
        @keyframes fillBar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
        @keyframes labelIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div className="mx-auto max-w-xl min-h-screen px-5 pt-10 pb-10 flex flex-col relative">
        <div style={{ animation: "introIn .55s ease-out both" }} className="relative flex items-center justify-center">
          <div className="text-[18px] font-medium text-[#4D5564] tracking-wide">—&nbsp; {stepText} &nbsp;—</div>

          {onLeft && leftLabel && (
            <button onClick={onLeft} className="absolute left-0 text-[20px] font-medium text-[#FF453A]">
              {leftLabel}
            </button>
          )}

          <button onClick={onSkip} className="absolute right-0 text-[20px] font-medium text-[#85C0E7]">
            Skip
          </button>
        </div>

        <div className="mt-28 text-center" style={{ animation: "introIn .65s ease-out .08s both" }}>
          <div className="text-[46px] leading-[1.06] font-semibold">{title}</div>
        </div>

        <div className="mt-10 flex items-center justify-center" style={{ animation: "introIn .65s ease-out .18s both" }}>
          <div className="max-w-[78%] text-center text-[21px] leading-relaxed text-[#757B8A]" style={{ animation: "softFloat 5.5s ease-in-out .8s infinite" }}>
            {body}
          </div>
        </div>

        <div className={bottomTight ? "mt-4" : "mt-14"} />

        <div
          className={(bottomTight ? "mt-3" : "mt-8") + " flex items-center justify-center gap-4"}
          style={{ animation: "introIn .6s ease-out .28s both" }}
        >
          {Array.from({ length: 4 }).map((_, i) => {
            const active = i === activeDot;
            return (
              <span
                key={i}
                className={"h-[9px] w-[9px] rounded-full " + (active ? "bg-white/65" : "bg-white/20")}
                style={active ? { animation: "dotPulse 1.8s ease-in-out .6s infinite" } : undefined}
              />
            );
          })}
        </div>

        <div
          className={(bottomTight ? "mt-3" : "mt-6") + " flex items-center justify-center"}
          style={{ animation: "introIn .6s ease-out .34s both" }}
        >
          <button
            onClick={onContinue}
            disabled={!btnReady}
            aria-disabled={!btnReady}
            className={
              `relative w-full max-w-md px-4 py-4 rounded-2xl overflow-hidden ${bgClass} shadow-[0_18px_55px_rgba(0,0,0,0.55)] transition active:scale-[0.99] ` +
              (!btnReady ? "opacity-80 cursor-not-allowed" : "")
            }
          >
            {!btnReady && (
              <div className="absolute inset-0">
                <div
                  className={`absolute inset-0 origin-bottom ${fillClass}`}
                  style={{ animation: `fillBar ${FILL_MS}ms cubic-bezier(0.2, 0, 0, 1) both` }}
                />
                <div className="absolute inset-0 bg-[#0B0B0F]/10" />
              </div>
            )}

            <span className="relative" style={btnReady ? { animation: "labelIn .35s ease-out both" } : { opacity: 0 }}>
              <span className={`text-[23px] font-medium ${labelClass}`}>{buttonLabel}</span>
            </span>
          </button>
        </div>

        <div
          className="mt-3 w-full text-center text-[12px] italic text-white/30"
          style={{ animation: "introIn .6s ease-out .42s both" }}
        >
          Artwork will be added here in the next build.
        </div>
      </div>
    </div>
  );
}

function OnboardingIntro1({ onContinue, onSkip }: IntroProps) {
  return (
    <OnboardingFrame
      stepText="1/4"
      activeDot={0}
      buttonTheme="blue"
      buttonLabel="Continue"
      title={
        <>
          <div className="text-white">Hydration shouldn’t</div>
          <div className="mt-3 text-[#78ACD0]">feel like math.</div>
        </>
      }
      body={
        <p>
          Most <span className="text-[#78ACD0]">water tracking apps</span> make you count glasses, track sips, and guess amounts.
        </p>
      }
      onContinue={onContinue}
      onSkip={onSkip}
    />
  );
}

function OnboardingIntro2({ onContinue, onSkip }: IntroProps) {
  return (
    <OnboardingFrame
      stepText="2/4"
      activeDot={1}
      buttonTheme="blue"
      buttonLabel="Continue"
      title={
        <>
          <span className="text-white">One bottle. </span>
          <span className="text-[#78ACD0]">One habit.</span>
        </>
      }
      body={
        <>
          <p>
            As you drink, lower the <span className="text-[#78ACD0]">water level</span> in the app. When it&apos;s empty,
            refill and repeat.
          </p>
          <p className="mt-6">No sip logging. No math.</p>
        </>
      }
      onContinue={onContinue}
      onSkip={onSkip}
    />
  );
}

function OnboardingIntro3({ onContinue, onSkip }: IntroProps) {
  return (
    <OnboardingFrame
      stepText="3/4"
      activeDot={2}
      buttonTheme="blue"
      buttonLabel="Continue"
      title={
        <>
          <span className="text-white">Track what’s </span>
          <span className="text-[#78ACD0]">left</span>
          <span className="text-white"> — not what you drink.</span>
        </>
      }
      body={<p>Your bottle becomes the only thing you need to think about.</p>}
      onContinue={onContinue}
      onSkip={onSkip}
    />
  );
}

function OnboardingIntro4({ onContinue, onSkip, onStartOver }: IntroProps) {
  return (
    <OnboardingFrame
      bottomTight
      leftLabel="Start over"
      onLeft={onStartOver}
      stepText="4/4"
      activeDot={3}
      buttonTheme="green"
      buttonLabel="Start with my bottle"
      title={
        <>
          <span className="text-green-500">Sustainable</span>
          <span className="text-white">, by design.</span>
        </>
      }
      body={
        <>
          <div>Refill the same bottle again and again.</div>
          <div className="mt-2">Less waste. Less effort.</div>
          <div className="mt-6">
            You drink more consistently, reuse one bottle, and build a habit that’s better for you and{" "}
            <span className="text-green-500">the planet</span>.
          </div>
        </>
      }
      onContinue={onContinue}
      onSkip={onSkip}
    />
  );
}

// --- Optional self-tests (won't run unless you opt in) ---
function runSelfTests() {
  // Enable by setting window.__WBT_TESTS__ = true in the console.
  if (typeof window === "undefined") return;
  // @ts-expect-error - dev flag
  if (!(window as any).__WBT_TESTS__) return;

  console.assert(dayKey(new Date("2025-01-02T10:00:00Z")) === "2025-01-02", "dayKey should format YYYY-MM-DD");
  console.assert(formatBottlesDecimal(2000, 500) === "4", "2000/500 should format to 4");
  console.assert(formatBottlesDecimal(2900, 500) === "5.8", "2900/500 should format to 5.8");
  console.assert(snapValue(0.26, "quarters") === 0.25, "quarters snap");
  console.assert(snapValue(0.24, "tenths") === 0.2, "tenths snap");
  console.assert(recommendGoalML({ weightKg: 60, activity: "low", warm: false }).ml === 1980, "recommendGoalML base calc");
  console.assert(formatCountdown(0) === "00:00:00", "formatCountdown zero");
}

export default function WaterBottleTracker() {
  const [state, setState] = useState<AppState>(() => {
    const defaults = makeDefaultState();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaults;
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch {
      return defaults;
    }
  });

  // Enable optional self-tests
  useEffect(() => {
    runSelfTests();
  }, []);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  function persistNow(next: AppState) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    const resetToTodayIfNeeded = () => {
      const today = dayKey();
      setState((s) => {
        if (s.dayKey === today) return s;

        const prevKey = s.dayKey;
        const consumed = totalConsumedFromState(s);
        const nextLog = {
          ...(s.dailyLog || {}),
          [prevKey]: {
            consumedML: consumed,
            goalML: s.goalML,
            bottleML: s.bottleML,
            carryML: Math.round(((s as any).carryML || 0) as number),
            extraML: Math.round((s.extraML || 0) as number),
            at: Date.now(),
          },
        };

        const keys = Object.keys(nextLog).sort();
        const keep = keys.slice(-14);
        const pruned: AppState["dailyLog"] = {};
        for (const k of keep) pruned[k] = nextLog[k];

        const next = {
          ...s,
          dailyLog: pruned,
          dayKey: today,
          completedBottles: 0,
          remaining: 1,
          carryML: 0,
          extraML: 0,
          history: [],
          celebrate: null,
        };
        persistNow(next);
        return next;
      });
    };

    resetToTodayIfNeeded();

    let timeoutId: number | undefined;
    const scheduleNext = () => {
      const ms = msUntilNextMidnight();
      timeoutId = window.setTimeout(() => {
        resetToTodayIfNeeded();
        scheduleNext();
      }, ms + 50);
    };
    scheduleNext();

    const onVisibility = () => {
      if (document.visibilityState === "visible") resetToTodayIfNeeded();
      if (document.visibilityState === "hidden") {
        persistNow(stateRef.current);
      }
    };

    const onPageHide = () => {
      persistNow(stateRef.current);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);

  useEffect(() => {
    persistNow(state);
  }, [state]);

  const [resetMs, setResetMs] = useState(() => msUntilNextMidnight());
  useEffect(() => {
    const tick = () => setResetMs(msUntilNextMidnight());
    tick();
    const id = window.setInterval(tick, 1000);
    const onVis = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const bottlesPerDayText = useMemo(() => formatBottlesDecimal(state.goalML, state.bottleML), [state.goalML, state.bottleML]);

  const totalConsumed = useMemo(() => totalConsumedFromState(state), [state.completedBottles, state.remaining, state.bottleML, state.goalML, (state as any).carryML, state.extraML]);

  const progressFrac = useMemo(() => (state.goalML > 0 ? Math.min(1, totalConsumed / state.goalML) : 0), [totalConsumed, state.goalML]);

  const bottlesLeftText = useMemo(() => {
    if (!state.bottleML) return "0";
    const goalBottles = state.goalML / state.bottleML;
    const consumedBottles = totalConsumed / state.bottleML;
    const left = Math.max(0, goalBottles - consumedBottles);
    return format1(left);
  }, [state.goalML, state.bottleML, totalConsumed]);

  function advanceBottle(s: AppState) {
    const n = ceilDiv(s.goalML, s.bottleML);
    if (n <= 0) return s;

    let completed = s.completedBottles;
    if (completed < n) completed += 1;

    return { ...s, completedBottles: completed, remaining: 1 };
  }

  function setRemaining(nextRemaining: number, meta: { action?: string } = {}) {
    setState((s) => {
      const today = dayKey();
      let ss = s;
      if (ss.dayKey !== today) {
        ss = { ...ss, dayKey: today, completedBottles: 0, remaining: 1, carryML: 0, extraML: 0, history: [], celebrate: null };
      }

      const prev = ss.remaining;
      const prevCompleted = ss.completedBottles;
      const prevCarry = (((ss as any).carryML || 0) as number);
      const prevExtra = (ss.extraML || 0) as number;
      const r = clamp(nextRemaining, 0, 1);
      const entry = { t: Date.now(), prevRemaining: prev, prevCompleted, prevCarry, prevExtra, ...meta };
      const history = [...(ss.history || []), entry].slice(-50);

      const didEmptyBottle = meta.action === "track" && prev > 0.0001 && r <= 0.0001;

      let nextState: AppState = { ...ss, remaining: r, history };
      if (r <= 0.0001) nextState = { ...advanceBottle(nextState), history };

      const afterConsumed = totalConsumedFromState(nextState);
      const pct = nextState.goalML > 0 ? Math.round((afterConsumed / nextState.goalML) * 100) : 0;
      const hitGoal = meta.action === "track" && nextState.goalML > 0 && afterConsumed >= nextState.goalML;

      if (meta.action === "track" && (hitGoal || didEmptyBottle)) {
        nextState = {
          ...nextState,
          celebrate: {
            type: hitGoal ? "goal" : "bottle",
            pct: clamp(pct, 0, 100),
            consumedML: afterConsumed,
          },
        };
      }

      return nextState;
    });
  }

  function addExtra(ml: number) {
    setState((s) => {
      const today = dayKey();
      let ss = s;
      if (ss.dayKey !== today) {
        ss = { ...ss, dayKey: today, completedBottles: 0, remaining: 1, carryML: 0, extraML: 0, history: [], celebrate: null };
      }

      const prev = ss.remaining;
      const prevCompleted = ss.completedBottles;
      const prevCarry = (((ss as any).carryML || 0) as number);
      const prevExtra = (ss.extraML || 0) as number;

      const nextExtra = clamp((ss.extraML || 0) + ml, 0, 100000);
      const entry = { t: Date.now(), prevRemaining: prev, prevCompleted, prevCarry, prevExtra, action: "extra", ml };
      const history = [...(ss.history || []), entry].slice(-50);

      return { ...ss, extraML: nextExtra, history };
    });
  }

  function undo() {
    setState((s) => {
      const h = s.history || [];
      if (h.length === 0) return s;
      const last = h[h.length - 1];
      return {
        ...s,
        remaining: last.prevRemaining,
        completedBottles: last.prevCompleted,
        carryML: typeof (last as any).prevCarry === "number" ? (last as any).prevCarry : (((s as any).carryML || 0) as number),
        extraML: typeof last.prevExtra === "number" ? last.prevExtra : s.extraML,
        history: h.slice(0, -1),
      };
    });
  }

  const dialRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const [pendingRemaining, setPendingRemaining] = useState(state.remaining);
  useEffect(() => {
    if (state.hasOnboarded) setPendingRemaining(state.remaining);
  }, [state.remaining, state.hasOnboarded]);

  function dialValueFromClientY(clientY: number) {
    const el = dialRef.current;
    if (!el) return state.remaining;
    const rect = el.getBoundingClientRect();
    const padTop = 10;
    const padBot = 10;
    const y = clamp(clientY, rect.top + padTop, rect.bottom - padBot);
    const usable = rect.height - padTop - padBot;
    const ratio = 1 - (y - (rect.top + padTop)) / usable;

    const v = snapValue(ratio, state.snap);
    return Math.min(v, state.remaining);
  }

  function onDialPointerDown(e: React.PointerEvent) {
    e.preventDefault();
    setDragging(true);
    setPendingRemaining(dialValueFromClientY(e.clientY));
  }

  function onDialPointerMove(e: PointerEvent) {
    if (!dragging) return;
    setPendingRemaining(dialValueFromClientY(e.clientY));
  }

  function onDialPointerUp() {
    setDragging(false);
  }

  useEffect(() => {
    window.addEventListener("pointermove", onDialPointerMove);
    window.addEventListener("pointerup", onDialPointerUp);
    return () => {
      window.removeEventListener("pointermove", onDialPointerMove);
      window.removeEventListener("pointerup", onDialPointerUp);
    };
  }, [dragging, state.remaining, state.snap]);

  const remainingPct = Math.round(pendingRemaining * 100);

  const dialThumbTop = useMemo(() => {
    const H = 260;
    const padTop = 10;
    const padBot = 10;
    const usable = H - padTop - padBot;
    return padTop + (1 - pendingRemaining) * usable;
  }, [pendingRemaining]);

  const [showQuickAdd, setShowQuickAdd] = useState(false);

  function switchBottleKeepingConsumed(patch: Partial<AppState>) {
    setState((s) => {
      const consumed = totalConsumedFromState(s);
      return {
        ...s,
        ...patch,
        completedBottles: 0,
        remaining: 1,
        carryML: consumed,
        extraML: 0,
        history: [],
        celebrate: null,
      } as any;
    });
  }
  const [showBottleCapacity, setShowBottleCapacity] = useState(false);

  // Ninja Thirsti (locked flow)
  const [showThirstiHint, setShowThirstiHint] = useState(false);
  const [showUnlockOptions, setShowUnlockOptions] = useState(false);
  const [showAmazonRedirect, setShowAmazonRedirect] = useState(false);
  const [showThirstiCapacity, setShowThirstiCapacity] = useState(false);
  const [thirstiCap, setThirstiCap] = useState<530 | 700>(700);

  // Stanley Tumbler (locked flow)
  const [showStanleyHint, setShowStanleyHint] = useState(false);
  const [showStanleyUnlockOptions, setShowStanleyUnlockOptions] = useState(false);
  const [showStanleyAmazonRedirect, setShowStanleyAmazonRedirect] = useState(false);
  const [showStanleyCapacity, setShowStanleyCapacity] = useState(false);
  const [stanleyCap, setStanleyCap] = useState<880 | 1200>(880);

  useEffect(() => {
    // Reset staged UI bits whenever we leave bottle select.
    if (state.step !== 5) {
      setShowBottleCapacity(false);

      // Thirsti
      setShowThirstiHint(false);
      setShowUnlockOptions(false);
      setShowAmazonRedirect(false);
      setShowThirstiCapacity(false);

      // Stanley
      setShowStanleyHint(false);
      setShowStanleyUnlockOptions(false);
      setShowStanleyAmazonRedirect(false);
      setShowStanleyCapacity(false);
    }
  }, [state.step]);

  useEffect(() => {
    // Switching bottle types should reset the staged UI.
    setShowBottleCapacity(false);

    // Thirsti
    setShowThirstiHint(false);
    setShowUnlockOptions(false);
    setShowAmazonRedirect(false);
    setShowThirstiCapacity(false);

    // Stanley
    setShowStanleyHint(false);
    setShowStanleyUnlockOptions(false);
    setShowStanleyAmazonRedirect(false);
    setShowStanleyCapacity(false);
  }, [state.bottleModel]);

  function setStep(step: AppState["step"]) {
    setState((s) => ({ ...s, step }));
  }

  function applyRecommendation() {
    const rec = recommendGoalML({ weightKg: Number(state.weightKg), activity: state.activity, warm: state.warm });
    setState((s) => ({ ...s, goalML: rec.ml }));
  }

  const rec = useMemo(() => {
    if (!state.weightKg || state.weightKg < 30) return null;
    return recommendGoalML({ weightKg: Number(state.weightKg), activity: state.activity, warm: state.warm });
  }, [state.weightKg, state.activity, state.warm]);

  if (!state.hasOnboarded && state.step === 0) {
    return <WelcomeSplash instant={!!state.splashSeen} onContinue={() => setState((s) => ({ ...s, splashSeen: true, step: 1 }))} />;
  }

  if (state.hasOnboarded) {
    return (
      <div className="min-h-screen bg-[#0B0B0F] text-white">
        {showQuickAdd && <QuickAddSheet onClose={() => setShowQuickAdd(false)} onAdd={addExtra} />}

        {state.celebrate && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/70 backdrop-blur" />
            <div className="absolute inset-0 flex items-center justify-center px-5">
              <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#121218]/95 p-6 shadow-[0_20px_60px_rgba(0,0,0,.55)]">
                <div className="text-2xl font-extrabold">{state.celebrate.type === "goal" ? "Well done" : "Good job"}</div>

                <div className="mt-2 text-white/75">
                  {state.celebrate.type === "goal" ? "You hit your water intake for the day." : `You’ve drunk ${state.celebrate.pct}% of your water intake today.`}
                </div>

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-white/60">Today</div>
                  <div className="mt-1 text-xl font-extrabold tabular-nums">
                    {state.celebrate.consumedML} / {state.goalML} ml
                  </div>
                  <div className="mt-1 text-sm text-white/70">{state.celebrate.type === "goal" ? "100% complete ✅" : `${state.celebrate.pct}% complete`}</div>
                </div>

                <button
                  onClick={() => setState((s) => ({ ...s, celebrate: null }))}
                  className={
                    "mt-6 w-full px-5 py-4 rounded-2xl font-extrabold active:scale-[0.99] " +
                    (state.celebrate.type === "goal" ? "bg-green-500 text-black" : "bg-[#0A84FF] text-white")
                  }
                >
                  {state.celebrate.type === "goal" ? "Done" : "Continue"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="px-5 pt-7 pb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-2xl font-extrabold leading-tight">How much water is in your bottle?</div>
              <div className="mt-2 text-sm text-white/60">
                Goal {state.goalML} ml • Bottle {state.bottleML} ml •{" "}
                <span className="font-extrabold text-[#0A84FF]">{bottlesLeftText} bottle(s) till goal</span>
              </div>
              <div className="mt-1 text-xs text-white/50">
                Resets in <span className="font-extrabold tabular-nums text-white/70">{formatCountdown(resetMs)}</span>
              </div>
              <div className="mt-1 text-xs text-white/50">
                Yesterday:{" "}
                {(() => {
                  const y = (state.dailyLog || {})[prevDayKey()];
                  if (!y) return <span className="text-white/40">—</span>;
                  const pct = y.goalML > 0 ? Math.round((y.consumedML / y.goalML) * 100) : 0;
                  return (
                    <span className="font-extrabold tabular-nums text-white/70">
                      {y.consumedML} / {y.goalML} ml ({pct}%)
                    </span>
                  );
                })()}
              </div>
            </div>

            <button
              onClick={() => setState((s) => ({ ...s, hasOnboarded: false, step: 6 }))}
              className="h-10 w-10 rounded-2xl border border-white/12 bg-white/8 active:bg-white/12 flex items-center justify-center"
              aria-label="Edit setup"
              title="Edit setup"
            >
              ⚙︎
            </button>
          </div>
        </div>

        <div className="px-5">
          <div className="flex items-center justify-center gap-6">
            <BottleVector shape={state.shape} level={pendingRemaining} className={shapeClasses(state.shape)} />

            <div className="flex flex-col items-center gap-3">
              <div className="flex flex-col items-start gap-3">
                <div className="w-16 text-center text-lg font-extrabold tabular-nums">{remainingPct}%</div>

                <div className="grid grid-cols-[4rem,3rem] gap-3 items-start">
                  <div
                    ref={dialRef}
                    onPointerDown={onDialPointerDown}
                    className="relative h-[260px] w-16 rounded-2xl border border-white/15 bg-white/6 overflow-hidden select-none touch-none"
                    role="slider"
                    aria-label="Bottle level"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={remainingPct}
                    tabIndex={0}
                    onKeyDown={(e) => {
                      const step = state.snap === "tenths" ? 0.1 : state.snap === "free" ? 0.01 : 0.25;
                      if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setPendingRemaining((p) => Math.min(snapValue(p + step, state.snap), state.remaining));
                      }
                      if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setPendingRemaining((p) => snapValue(p - step, state.snap));
                      }
                    }}
                  >
                    <div className="absolute inset-y-2 left-[18px] right-[18px] rounded-xl bg-white/8" />
                    <div className="absolute inset-y-2 left-0 right-0 flex flex-col justify-between pointer-events-none">
                      {Array.from({ length: 21 }).map((_, i) => {
                        const major = i % 5 === 0;
                        return (
                          <div key={i} className="flex justify-center">
                            <span className={`block h-px ${major ? "w-8 bg-white/45" : "w-[22px] bg-white/25"}`} />
                          </div>
                        );
                      })}
                    </div>
                    <div
                      className="absolute left-1/2 h-[6px] w-[38px] -translate-x-1/2 rounded-full bg-white/90"
                      style={{ top: `${dialThumbTop}px` }}
                    />
                  </div>

                  <button
                    onClick={() => setShowQuickAdd(true)}
                    className="col-start-2 self-center h-12 w-12 rounded-2xl border border-white/10 bg-white/6 active:scale-[0.99] flex items-center justify-center"
                    aria-label="Add water"
                    title="Add water"
                  >
                    <DropletPlugIcon className="h-8 w-8" />
                  </button>

                  <button
                    onClick={undo}
                    disabled={!state.history || state.history.length === 0}
                    className="col-start-1 w-16 px-0 py-2 rounded-2xl border border-white/15 bg-white/8 font-extrabold text-center disabled:opacity-40"
                  >
                    Undo
                  </button>

                  {state.extraML > 0 && (
                    <div className="col-start-1 col-span-2 justify-self-start text-left text-[12px] font-extrabold tabular-nums text-white/55 whitespace-nowrap">
                      Extra today: <span className="text-[#0A84FF]">+{Math.round(state.extraML)}ml</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 flex justify-center">
            <button
              onClick={() => {
                const wasEmpty = pendingRemaining <= 0.0001;
                setRemaining(pendingRemaining, { action: "track" });
                if (wasEmpty) setPendingRemaining(1);
              }}
              disabled={Math.abs(pendingRemaining - state.remaining) < 1e-6}
              className={
                "w-full max-w-md px-5 py-4 rounded-2xl font-extrabold active:scale-[0.99] transition " +
                (Math.abs(pendingRemaining - state.remaining) < 1e-6
                  ? "bg-white/10 text-white/40 border border-white/10"
                  : "bg-green-500 text-black")
              }
            >
              Track
            </button>
          </div>

          <div className="mt-8">
            <div className="flex items-end justify-between">
              <div className="text-sm text-white/70">Daily progress</div>
              <div className="text-sm font-extrabold tabular-nums">
                {totalConsumed} / {state.goalML} ml
              </div>
            </div>
            <div className="mt-2 h-3 rounded-full bg-white/10 overflow-hidden">
              <div className="h-full rounded-full bg-[#0A84FF]" style={{ width: `${Math.round(progressFrac * 100)}%`, transition: "width .15s ease" }} />
            </div>
            <div className="mt-2 text-xs text-white/55">Tip: scroll down to 0% when you finish the bottle — it will auto-start the next one.</div>
            <div className="mt-1 text-xs italic text-[#FF453A]/70">Artwork will be updated in the next build.</div>
          </div>
        </div>
      </div>
    );
  }

  // Onboarding container
  return (
    <div className="min-h-screen bg-[#0B0B0F] text-white">
      <div className="max-w-xl mx-auto px-5 pt-8 pb-10">
        {state.step === 1 && <OnboardingIntro1 onContinue={() => setStep(2)} onSkip={() => setStep(5)} />}
        {state.step === 2 && <OnboardingIntro2 onContinue={() => setStep(3)} onSkip={() => setStep(5)} />}
        {state.step === 3 && <OnboardingIntro3 onContinue={() => setStep(4)} onSkip={() => setStep(5)} />}
        {state.step === 4 && (
          <OnboardingIntro4
            onContinue={() => setStep(5)}
            onSkip={() => setStep(5)}
            onStartOver={() =>
              setState((s) => ({
                ...s,
                hasOnboarded: false,
                step: 0,
                splashSeen: false,
              }))
            }
          />
        )}
        {state.step === 5 && (
          <div>
            <style>{`
              @keyframes selIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
              @keyframes selInSoft { from { opacity: 0; transform: translateY(8px) scale(0.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
              @keyframes floatSel { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
              @keyframes arrowHint { 0%,100% { transform: translateY(0); opacity: .35; } 50% { transform: translateY(-2px); opacity: .55; } }
              @keyframes arrowBlink { 0%,100% { opacity: .72; transform: scale(1); } 50% { opacity: 1; transform: scale(1.06); } }
              @keyframes capIn { from { opacity: 0; transform: translateY(10px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
              @keyframes nudge { 0%,100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
              @keyframes hintIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
              @keyframes unlockPop { from { opacity: 0; transform: translateY(10px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
              @keyframes orbitSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
              .orbitRing {
                padding: 2px;
                border-radius: 1rem;
                background: conic-gradient(
                  from 0deg,
                  rgba(255, 255, 255, 0) 0deg,
                  rgba(255, 255, 255, 0.0) 40deg,
                  rgba(255, 255, 255, 0.85) 70deg,
                  rgba(255, 255, 255, 0.0) 110deg,
                  rgba(255, 255, 255, 0) 360deg
                );
                opacity: 0.7;
                -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
                -webkit-mask-composite: xor;
                mask-composite: exclude;
              }
            `}</style>

            {(() => {
              const models = ["tallSlim", "thirsti", "stanley"] as const;
              const idx = Math.max(0, models.indexOf(state.bottleModel as any));
              const prev = models[(idx + models.length - 1) % models.length];
              const next = models[(idx + 1) % models.length];

              const isTall = state.bottleModel === "tallSlim";
              const isThirsti = state.bottleModel === "thirsti";
              const isStanley = state.bottleModel === "stanley";

              const showHint = (isThirsti && showThirstiHint) || (isStanley && showStanleyHint);

              const locked = (isThirsti && !state.thirstiUnlocked) || (isStanley && !state.stanleyUnlocked);
              const optionsOpen = (isThirsti && showUnlockOptions) || (isStanley && showStanleyUnlockOptions);

              const label = isTall ? "Tall / Slim" : isThirsti ? "Ninja Thirsti" : "Stanley Tumbler";
              const sub = isTall
                ? "More bottle options coming soon."
                : isThirsti
                  ? (state.thirstiUnlocked ? "Unlocked bottle — ready to use." : "Locked bottle — unlock to use.")
                  : (state.stanleyUnlocked ? "Unlocked bottle — ready to use." : "Locked bottle — unlock to use.");

              const showDevLock = (isThirsti && state.thirstiUnlocked) || (isStanley && state.stanleyUnlocked);

              const clearAllOverlays = () => {
                // Tall/Slim
                setShowBottleCapacity(false);

                // Thirsti
                setShowThirstiHint(false);
                setShowUnlockOptions(false);
                setShowAmazonRedirect(false);
                setShowThirstiCapacity(false);

                // Stanley
                setShowStanleyHint(false);
                setShowStanleyUnlockOptions(false);
                setShowStanleyAmazonRedirect(false);
                setShowStanleyCapacity(false);
              };

              const goPrev = () => setState((s) => ({ ...s, bottleModel: prev }));
              const goNext = () => setState((s) => ({ ...s, bottleModel: next }));

              return (
                <>
                  <div className="flex items-start justify-between gap-3" style={{ animation: "selIn .55s ease-out .04s both" }}>
                    <div className="text-2xl font-extrabold">Select your water bottle</div>

                    {showDevLock && (
                      <button
                        onClick={() => {
                          // Dev-only: re-lock so you can retest.
                          if (isThirsti) setState((s) => ({ ...s, thirstiUnlocked: false }));
                          if (isStanley) setState((s) => ({ ...s, stanleyUnlocked: false }));
                          clearAllOverlays();
                        }}
                        className="text-[16px] font-medium text-[#FF453A]"
                        title="Dev: Lock bottle"
                      >
                        Lock bottle
                      </button>
                    )}
                  </div>

                  <div className="mt-2 text-white/70" style={{ animation: "selIn .55s ease-out .10s both" }}>
                    Choose the bottle you’ll be using each day.
                  </div>

                  <div className="mt-6 rounded-3xl border border-white/10 bg-white/6 p-5" style={{ animation: "selInSoft .6s cubic-bezier(0.2,0,0,1) .18s both" }}>
                    <div className="flex items-center justify-center gap-4">
                      <button
                        onClick={goPrev}
                        className={
                          "h-12 w-12 rounded-2xl border border-white/12 bg-white/6 active:scale-[0.99] flex items-center justify-center " +
                          "text-[#0A84FF]"
                        }
                        title="Previous"
                        style={{ animation: "selIn .55s ease-out .24s both" }}
                      >
                        <span
                          className={(idx === 0 ? "text-[30px]" : "text-[30px]") + " w-[1em] text-center leading-none relative -top-[2px]"}
                          style={
                            idx === 0
                              ? { animation: "arrowBlink 2.8s ease-in-out .2s infinite" }
                              : { animation: "arrowHint 3.0s ease-in-out 1.2s infinite" }
                          }
                        >
                          ‹
                        </span>
                      </button>

                      <div
                        className="flex flex-col items-center"
                        style={{
                          animation: "selIn .55s ease-out .26s both" + (showHint ? ", nudge .38s ease-out both" : ""),
                        }}
                      >
                        <div style={{ animation: "floatSel 3.2s ease-in-out .6s infinite" }} className="mt-2">
                          {isTall ? (
                            <BottleVector shape="standard" level={1} className="w-[180px] [filter:drop-shadow(0_22px_55px_rgba(0,0,0,0.55))]" />
                          ) : (isThirsti && state.thirstiUnlocked) ? (
                            <BottleVector shape="standard" level={1} className="w-[180px] [filter:drop-shadow(0_22px_55px_rgba(255,214,10,0.10))]" />
                          ) : (isStanley && state.stanleyUnlocked) ? (
                            <BottleVector shape="tumbler" level={1} className="w-[180px] [filter:drop-shadow(0_22px_55px_rgba(255,214,10,0.10))]" />
                          ) : (
                            <div className="h-[300px] w-[180px] flex items-center justify-center">
                              <div className="flex flex-col items-center">
                                <div className="h-24 w-24 rounded-3xl border border-white/12 bg-white/6 flex items-center justify-center">
                                  <LockIcon className="h-12 w-12" />
                                </div>
                                <div className="mt-3 text-xs text-white/55">image arriving in next build</div>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="mt-3 text-lg font-extrabold">{label}</div>
                        <div className="mt-1 text-xs text-white/55">{sub}</div>

                        {((isThirsti && state.thirstiUnlocked) || (isStanley && state.stanleyUnlocked)) && (
                          <div className="mt-1 text-xs italic text-[#FF453A]/70">Artwork will be updated in the next build.</div>
                        )}
                      </div>

                      <button
                        onClick={goNext}
                        className={
                          "h-12 w-12 rounded-2xl border border-white/12 bg-white/6 active:scale-[0.99] flex items-center justify-center text-[#0A84FF]"
                        }
                        title="Next"
                        style={{ animation: "selIn .55s ease-out .24s both" }}
                      >
                        <span
                          className={"text-[30px] w-[1em] text-center leading-none relative -top-[2px]"}
                          style={
                            idx === 0 || idx === 2
                              ? { animation: "arrowBlink 2.8s ease-in-out .2s infinite" }
                              : { animation: "arrowHint 3.0s ease-in-out 1.2s infinite" }
                          }
                        >
                          ›
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Stage in the capacity question after Continue (Tall/Slim only) */}
                  {showBottleCapacity && isTall && (
                    <div className="mt-5 rounded-3xl border border-white/10 bg-white/6 p-5" style={{ animation: "capIn .5s cubic-bezier(0.2,0,0,1) both" }}>
                      <div className="text-xs text-white/65">How much can the bottle hold? (ml)</div>
                      <input
                        className="mt-1 w-full px-4 py-3 rounded-2xl border border-white/15 bg-white/5 font-extrabold outline-none"
                        type="number"
                        min={100}
                        max={2000}
                        step={50}
                        value={state.bottleML}
                        onChange={(e) => setState((s) => ({ ...s, bottleML: Number((e.target as HTMLInputElement).value || 500) }))}
                      />
                      <div className="mt-2 text-xs text-white/55">Common sizes: 500, 750, 1000 ml</div>
                    </div>
                  )}

                  <div className="mt-6 flex gap-2" style={{ animation: "selIn .55s ease-out .32s both" }}>
                    <button
                      onClick={() => {
                        // Close option sheets first
                        if (optionsOpen) {
                          if (isThirsti) setShowUnlockOptions(false);
                          if (isStanley) setShowStanleyUnlockOptions(false);
                          return;
                        }
                        if (showBottleCapacity) {
                          setShowBottleCapacity(false);
                          return;
                        }
                        setStep(4);
                      }}
                      className="flex-1 px-4 py-4 rounded-2xl border border-white/15 bg-white/8 font-extrabold"
                    >
                      Back
                    </button>

                    <button
                      onClick={() => {
                        if (isThirsti) {
                          if (state.thirstiUnlocked) {
                            switchBottleKeepingConsumed({ shape: "standard" });
                            setStep(7);
                            return;
                          }
                          // reveal options
                          setShowBottleCapacity(false);
                          setShowUnlockOptions(true);
                          setShowThirstiHint(true);
                          window.setTimeout(() => setShowThirstiHint(false), 1600);
                          return;
                        }

                        if (isStanley) {
                          if (state.stanleyUnlocked) {
                            switchBottleKeepingConsumed({ shape: "tumbler" });
                            setStep(7);
                            return;
                          }
                          setShowBottleCapacity(false);
                          setShowStanleyUnlockOptions(true);
                          setShowStanleyHint(true);
                          window.setTimeout(() => setShowStanleyHint(false), 1600);
                          return;
                        }

                        // Tall/Slim
                        if (!showBottleCapacity) {
                          setShowBottleCapacity(true);
                          return;
                        }
                        switchBottleKeepingConsumed({ shape: "standard" });
                        setStep(7);
                      }}
                      className={
                        "relative overflow-hidden flex-1 px-4 py-4 rounded-2xl font-extrabold active:scale-[0.99] transition " +
                        (isThirsti
                          ? (state.thirstiUnlocked ? "bg-[#0A84FF] text-white" : "bg-[#FFD60A] text-black")
                          : isStanley
                            ? (state.stanleyUnlocked ? "bg-[#0A84FF] text-white" : "bg-[#FFD60A] text-black")
                            : "bg-[#0A84FF] text-white") +
                        ((optionsOpen && !locked) ? "" : "") +
                        (optionsOpen ? " opacity-35 pointer-events-none" : "")
                      }
                    >
                      {locked && !optionsOpen && (
                        <span className="pointer-events-none absolute -inset-[2px] orbitRing" style={{ animation: "orbitSpin 2.6s linear infinite" }} />
                      )}
                      <span className="relative">
                        {isThirsti
                          ? (state.thirstiUnlocked ? "Continue" : "Unlock")
                          : isStanley
                            ? (state.stanleyUnlocked ? "Continue" : "Unlock")
                            : (showBottleCapacity ? "Next" : "Continue")}
                      </span>
                    </button>
                  </div>

                  {/* Thirsti unlock options */}
                  {isThirsti && showUnlockOptions && (
                    <div className="mt-4 grid gap-3" style={{ animation: "unlockPop .45s cubic-bezier(0.2,0,0,1) both" }}>
                      <button
                        onClick={() => setShowAmazonRedirect(true)}
                        className="w-full px-4 py-4 rounded-2xl bg-[#FF9F0A] text-black font-extrabold active:scale-[0.99]"
                      >
                        Purchase on Amazon
                      </button>
                      <button
                        onClick={() => {
                          const current = Number(state.bottleML);
                          setThirstiCap(current === 530 ? 530 : 700);
                          setShowThirstiCapacity(true);
                        }}
                        className="w-full px-4 py-3 rounded-2xl border border-white/15 bg-white/8 font-extrabold text-[15px] leading-tight active:scale-[0.99]"
                      >
                        I already have the bottle
                      </button>
                    </div>
                  )}

                  {/* Stanley unlock options */}
                  {isStanley && showStanleyUnlockOptions && (
                    <div className="mt-4 grid gap-3" style={{ animation: "unlockPop .45s cubic-bezier(0.2,0,0,1) both" }}>
                      <button
                        onClick={() => setShowStanleyAmazonRedirect(true)}
                        className="w-full px-4 py-4 rounded-2xl bg-[#FF9F0A] text-black font-extrabold active:scale-[0.99]"
                      >
                        Purchase on Amazon
                      </button>
                      <button
                        onClick={() => {
                          const current = Number(state.bottleML);
                          setStanleyCap(current === 1200 ? 1200 : 880);
                          setShowStanleyCapacity(true);
                        }}
                        className="w-full px-4 py-3 rounded-2xl border border-white/15 bg-white/8 font-extrabold text-[15px] leading-tight active:scale-[0.99]"
                      >
                        I already have the bottle
                      </button>
                    </div>
                  )}

                  {/* Thirsti Amazon modal */}
                  {showAmazonRedirect && (
                    <div className="fixed inset-0 z-50">
                      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowAmazonRedirect(false)} />
                      <div className="absolute inset-0 flex items-center justify-center px-5">
                        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#121218]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,.55)]">
                          <div className="flex items-center justify-between">
                            <div className="text-lg font-extrabold">Amazon redirect</div>
                            <button
                              onClick={() => setShowAmazonRedirect(false)}
                              className="h-10 w-10 rounded-2xl border border-white/12 bg-white/8 active:bg-white/12 flex items-center justify-center"
                              aria-label="Close"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="mt-3 text-sm text-white/75 leading-relaxed">
                            <div>You will be redirected to the Ninja Thirsti Amazon page.</div>
                            <div className="mt-2 text-white/65">If you were not redirected, click the link:</div>
                            <div className="mt-3">
                              <a
                                href="https://www.amazon.co.uk/Ninja-Leak-Proof-Carbonated-Insulated-DW1801EUUKWH/dp/B0CWP4JQ4H/ref=sr_1_7?dib=eyJ2IjoiMSJ9.vNxVihGL7abs5rgTNNQA-3W-Els92fpry8VuCBjDW5zBDQxAQBVeU7yTte3qMUbFlQbtpfNA2ksYwS-WM-n3nznCBsMnk0It9haVDnUL_sVcQQrIsyC3k-4Si_qwReU_S3x3PXClSiCFdpZy8mtLqC8lT2qu4iEEXtwtg9haTJ4qbt599uRTAjzgXQXZHrPqQ3xoFYhg7yZbOSS6aGVu5zqfinupNd7XRB1qsDDNz0ny7AhnxUs31lhLY3qY21a235cOBu51EwYpg5CahwBZIjxH6KNO4F5gkxIYX06Kelo.StknIW14xQLjtsKv_Sj5GDSuNMGTKhkzlBsQF-FTKpk&dib_tag=se&keywords=ninja%2Bthirsty&qid=1767141423&sr=8-7&th=1"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#85C0E7] font-extrabold underline underline-offset-4"
                              >
                                Ninja Thirsti Amazon Page
                              </a>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowAmazonRedirect(false)}
                            className="mt-5 w-full px-4 py-4 rounded-2xl border border-white/15 bg-white/8 font-extrabold active:scale-[0.99]"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Stanley Amazon modal */}
                  {showStanleyAmazonRedirect && (
                    <div className="fixed inset-0 z-50">
                      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowStanleyAmazonRedirect(false)} />
                      <div className="absolute inset-0 flex items-center justify-center px-5">
                        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#121218]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,.55)]">
                          <div className="flex items-center justify-between">
                            <div className="text-lg font-extrabold">Amazon redirect</div>
                            <button
                              onClick={() => setShowStanleyAmazonRedirect(false)}
                              className="h-10 w-10 rounded-2xl border border-white/12 bg-white/8 active:bg-white/12 flex items-center justify-center"
                              aria-label="Close"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="mt-3 text-sm text-white/75 leading-relaxed">
                            <div>You will be redirected to the Stanley Tumbler Amazon page.</div>
                            <div className="mt-2 text-white/65">If you were not redirected, click the link:</div>
                            <div className="mt-3">
                              <a
                                href="https://www.amazon.co.uk/Stanley-Quencher-H2-0-Flowstate-Tumbler/dp/B0F4XTNL3Z/ref=sr_1_1?dib=eyJ2IjoiMSJ9.pVoWK8DmFww-5mPID8YSTZB3Krm_BHNXP053y2WVtVDurSdJ7LybUcCx8DC5B3kpIDD9ts41nJIX_n1s6Gn4269GlxBlmlGinDHHz50Plf88aW-2n09YtOSG2xkQjcbK8Z56jE8gM1Tv_RM7ZSm7q2fUlvcRRsEIfS7yWbDhKQLjzP4Bxa5wrBoboBsM0rjMNQwusaTlaY3LLqEwMsxSKExOW9cuTiAfyL6tgUe8wMlFqlU1f5xbyPuaZvOB6p-MarWf4T5pJ7ii5OcckJ48s2SLYpyMEpHn0lyXDgT909E4.Fhhn3qg90JD5XY0m6BZBvW8IytOYE-_CULJccPMjBKM&dib_tag=se&keywords=stanley%2Bcup&qid=1767143452&sr=8-1&th=1"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[#85C0E7] font-extrabold underline underline-offset-4"
                              >
                                Stanley Tumbler Amazon Page
                              </a>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowStanleyAmazonRedirect(false)}
                            className="mt-5 w-full px-4 py-4 rounded-2xl border border-white/15 bg-white/8 font-extrabold active:scale-[0.99]"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Thirsti capacity modal */}
                  {showThirstiCapacity && (
                    <div className="fixed inset-0 z-50">
                      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowThirstiCapacity(false)} />
                      <div className="absolute inset-0 flex items-center justify-center px-5">
                        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#121218]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,.55)]">
                          <div className="flex items-center justify-between">
                            <div className="text-lg font-extrabold">How much can the bottle hold? (ml)</div>
                            <button
                              onClick={() => setShowThirstiCapacity(false)}
                              className="h-10 w-10 rounded-2xl border border-white/12 bg-white/8 active:bg-white/12 flex items-center justify-center"
                              aria-label="Close"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            {[530, 700].map((ml) => {
                              const active = thirstiCap === ml;
                              return (
                                <button
                                  key={ml}
                                  onClick={() => setThirstiCap(ml as 530 | 700)}
                                  className={
                                    "px-4 py-4 rounded-2xl border font-extrabold tabular-nums transition active:scale-[0.99] " +
                                    (active ? "border-[#FFD60A]/60 bg-[#FFD60A]/15" : "border-white/15 bg-white/6")
                                  }
                                >
                                  <div className="text-xl">{ml}ml</div>
                                </button>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => {
                              setState((s) => ({
                                ...s,
                                bottleModel: "thirsti",
                                thirstiUnlocked: true,
                                bottleML: thirstiCap,
                                shape: "standard",
                              }));
                              setShowThirstiCapacity(false);
                              setShowUnlockOptions(false);
                              setStep(7);
                            }}
                            className="mt-5 w-full px-4 py-4 rounded-2xl bg-[#FFD60A] text-black font-extrabold active:scale-[0.99]"
                          >
                            Unlock my bottle
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Stanley capacity modal */}
                  {showStanleyCapacity && (
                    <div className="fixed inset-0 z-50">
                      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowStanleyCapacity(false)} />
                      <div className="absolute inset-0 flex items-center justify-center px-5">
                        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#121218]/95 p-5 shadow-[0_20px_60px_rgba(0,0,0,.55)]">
                          <div className="flex items-center justify-between">
                            <div className="text-lg font-extrabold">How much can the bottle hold? (ml)</div>
                            <button
                              onClick={() => setShowStanleyCapacity(false)}
                              className="h-10 w-10 rounded-2xl border border-white/12 bg-white/8 active:bg-white/12 flex items-center justify-center"
                              aria-label="Close"
                            >
                              ✕
                            </button>
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-3">
                            {[880, 1200].map((ml) => {
                              const active = stanleyCap === ml;
                              return (
                                <button
                                  key={ml}
                                  onClick={() => setStanleyCap(ml as 880 | 1200)}
                                  className={
                                    "px-4 py-4 rounded-2xl border font-extrabold tabular-nums transition active:scale-[0.99] " +
                                    (active ? "border-[#FFD60A]/60 bg-[#FFD60A]/15" : "border-white/15 bg-white/6")
                                  }
                                >
                                  <div className="text-xl">{ml}ml</div>
                                </button>
                              );
                            })}
                          </div>

                          <button
                            onClick={() => {
                              setState((s) => ({
                                ...s,
                                bottleModel: "stanley",
                                stanleyUnlocked: true,
                                bottleML: stanleyCap,
                                shape: "tumbler",
                              }));
                              setShowStanleyCapacity(false);
                              setShowStanleyUnlockOptions(false);
                              setStep(7);
                            }}
                            className="mt-5 w-full px-4 py-4 rounded-2xl bg-[#FFD60A] text-black font-extrabold active:scale-[0.99]"
                          >
                            Unlock my bottle
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {state.step === 6 && (
          <div>
            <style>{`
              @keyframes setupIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
              @keyframes setupInSoft { from { opacity: 0; transform: translateY(8px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
            `}</style>

            <div className="flex items-start justify-between gap-3" style={{ animation: "setupIn .55s ease-out .04s both" }}>
              <div className="text-2xl font-extrabold">Your bottle</div>
              <button
                onClick={() =>
                  setState((s) => ({
                    ...s,
                    hasOnboarded: true,
                    step: 0,
                  }))
                }
                className="h-10 w-10 rounded-2xl border border-white/12 bg-white/8 active:bg-white/12 flex items-center justify-center"
                aria-label="Close"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="mt-2 text-white/70" style={{ animation: "setupIn .55s ease-out .10s both" }}>
              So you can log with one quick scroll.
            </div>

            <div
              className="mt-6 rounded-3xl border border-white/10 bg-white/6 p-5"
              style={{ animation: "setupInSoft .6s cubic-bezier(0.2,0,0,1) .18s both" }}
            >
              <div className="text-xs text-white/65">Bottle</div>

              <div className="mt-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 flex items-center justify-between">
                <div>
                  <div className="font-extrabold">
                    {state.bottleModel === "tallSlim" ? "Tall / Slim" : state.bottleModel === "thirsti" ? "Ninja Thirsti" : "Stanley Tumbler"}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {state.bottleML} ml • {state.shape === "tumbler" ? "Tumbler" : "Standard"}
                  </div>
                </div>
                <div className="text-xs font-extrabold text-white/45">Selected</div>
              </div>

              <button
                onClick={() => setStep(5)}
                className="mt-4 w-full px-4 py-4 rounded-2xl bg-[#FFD60A] text-black font-extrabold active:scale-[0.99]"
              >
                Change water bottle
              </button>
            </div>

            <div
              className="mt-5 rounded-3xl border border-white/10 bg-white/6 p-5"
              style={{ animation: "setupInSoft .6s cubic-bezier(0.2,0,0,1) .22s both" }}
            >
              <div className="text-xs text-white/65">Scroll wheel snapping</div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {([
                  { k: "quarters" as const, t: "Quarters" },
                  { k: "tenths" as const, t: "Tenths" },
                  { k: "free" as const, t: "Free" },
                ] as const).map((x) => (
                  <button
                    key={x.k}
                    onClick={() => setState((s) => ({ ...s, snap: x.k }))}
                    className={
                      "px-3 py-3 rounded-2xl border font-extrabold " +
                      (state.snap === x.k ? "border-[#0A84FF]/60 bg-[#0A84FF]/20" : "border-white/15 bg-white/5")
                    }
                  >
                    {x.t}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-xs text-white/55">Tip: snapping makes the scroll feel less fussy.</div>
            </div>

            <div className="mt-4" style={{ animation: "setupIn .55s ease-out .26s both" }}>
              <button
                onClick={() => setStep(7)}
                className="w-full px-4 py-3 rounded-2xl border border-[#0A84FF]/35 bg-[#0A84FF]/10 text-[#85C0E7] font-extrabold active:scale-[0.99]"
              >
                Change water target
              </button>
            </div>
          </div>
        )}

        {state.step === 7 && (
          <div>
            <style>{`
              @keyframes setupIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
              @keyframes setupInSoft { from { opacity: 0; transform: translateY(8px) scale(0.99); } to { opacity: 1; transform: translateY(0) scale(1); } }
            `}</style>

            <div className="text-2xl font-extrabold" style={{ animation: "setupIn .55s ease-out .04s both" }}>
              Your daily water target
            </div>
            <div className="mt-2 text-white/70" style={{ animation: "setupIn .55s ease-out .10s both" }}>
              Answer a few questions — you can edit later.
            </div>

            <div
              className="mt-6 rounded-3xl border border-white/10 bg-white/6 p-5"
              style={{ animation: "setupInSoft .6s cubic-bezier(0.2,0,0,1) .18s both" }}
            >
              <label className="block">
                <div className="text-xs text-white/65">Weight (kg)</div>
                <input
                  className="mt-1 w-full px-4 py-3 rounded-2xl border border-white/15 bg-white/5 font-extrabold outline-none"
                  type="number"
                  min={30}
                  max={200}
                  step={0.5}
                  value={state.weightKg}
                  onChange={(e) => setState((s) => ({ ...s, weightKg: Number((e.target as HTMLInputElement).value || 70) }))}
                />
              </label>

              <div className="mt-4">
                <div className="text-xs text-white/65">Activity</div>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {([
                    { k: "low" as const, t: "Low" },
                    { k: "moderate" as const, t: "Moderate" },
                    { k: "high" as const, t: "High" },
                  ] as const).map((x) => (
                    <button
                      key={x.k}
                      onClick={() => setState((s) => ({ ...s, activity: x.k }))}
                      className={
                        "px-3 py-3 rounded-2xl border font-extrabold " +
                        (state.activity === x.k ? "border-[#0A84FF]/60 bg-[#0A84FF]/20" : "border-white/15 bg-white/5")
                      }
                    >
                      {x.t}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div>
                  <div className="font-extrabold">Warm climate / sweaty day</div>
                  <div className="text-xs text-white/60">Adds a small buffer to the estimate</div>
                </div>
                <button
                  onClick={() => setState((s) => ({ ...s, warm: !s.warm }))}
                  className={"h-8 w-14 rounded-full p-1 transition " + (state.warm ? "bg-[#0A84FF]" : "bg-white/15")}
                  aria-label="Toggle warm climate"
                >
                  <div className={"h-6 w-6 rounded-full bg-white transition " + (state.warm ? "translate-x-6" : "translate-x-0")} />
                </button>
              </div>

              <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-xs text-white/65">Recommended</div>
                <div className="mt-1 text-xl font-extrabold tabular-nums">{rec ? `${rec.ml} ml` : "—"}</div>
                <div className="mt-1 text-sm text-white/70">{rec ? `Range: ${rec.low}–${rec.high} ml` : "Enter your weight to calculate."}</div>

                <button
                  onClick={applyRecommendation}
                  disabled={!rec}
                  className="mt-4 w-full px-4 py-3 rounded-2xl border border-white/15 bg-white/8 font-extrabold disabled:opacity-40"
                >
                  Use recommendation
                </button>

                <div className="mt-3">
                  <div className="text-xs text-white/65">Or set your own goal (ml)</div>
                  <input
                    className="mt-1 w-full px-4 py-3 rounded-2xl border border-white/15 bg-white/5 font-extrabold outline-none"
                    type="number"
                    min={500}
                    max={6000}
                    step={50}
                    value={state.goalML}
                    onChange={(e) => setState((s) => ({ ...s, goalML: Number((e.target as HTMLInputElement).value || 2000) }))}
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex gap-2" style={{ animation: "setupIn .55s ease-out .30s both" }}>
              <button onClick={() => setStep(5)} className="flex-1 px-4 py-4 rounded-2xl border border-white/15 bg-white/8 font-extrabold">
                Back
              </button>
              <button onClick={() => setStep(8)} className="flex-1 px-4 py-4 rounded-2xl bg-[#0A84FF] font-extrabold">
                Next
              </button>
            </div>
          </div>
        )}

        {state.step === 8 && (
          <div>
            <div className="text-2xl font-extrabold">You’re set</div>
            <div className="mt-2 text-white/70">Here’s your daily target and bottle setup.</div>

            <div className="mt-6 rounded-3xl border border-white/10 bg-white/6 p-5">
              <div className="text-xs text-white/65">Daily goal</div>
              <div className="mt-1 text-3xl font-extrabold tabular-nums">{state.goalML} ml</div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-white/65">Bottle size</div>
                  <div className="mt-1 text-xl font-extrabold tabular-nums">{state.bottleML} ml</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs text-white/65">Bottles / day</div>
                  <div className="mt-1 text-xl font-extrabold tabular-nums">{bottlesPerDayText}</div>
                </div>
              </div>

              <div className="mt-5 text-xs text-white/55">Tip: you won’t log sips. Just scroll the bottle level down as you drink, then tap Track.</div>
            </div>

            <div className="mt-6 flex gap-2">
              <button onClick={() => setStep(7)} className="flex-1 px-4 py-4 rounded-2xl border border-white/15 bg-white/8 font-extrabold">
                Back
              </button>
              <button
                onClick={() => {
                  setState((s) => ({
                    ...s,
                    hasOnboarded: true,
                    dayKey: dayKey(),
                    completedBottles: 0,
                    remaining: 1,
                    carryML: 0,
                    extraML: 0,
                    history: [],
                    celebrate: null,
                  }));
                }}
                className="flex-1 px-4 py-4 rounded-2xl bg-[#0A84FF] font-extrabold"
              >
                Start tracking
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

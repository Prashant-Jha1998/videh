import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../adminApi";

type Props = { onErr: (msg: string) => void };

function miniChart(rows: { day: string; count: number }[], color: string) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <svg className="mini-chart" viewBox="0 0 300 80" preserveAspectRatio="none">
      {rows.map((r, i) => {
        const h = (r.count / max) * 70;
        const x = rows.length <= 1 ? 0 : (i / (rows.length - 1)) * 280;
        const w = Math.max(4, 280 / Math.max(rows.length, 1) - 2);
        return <rect key={String(r.day)} x={x} y={80 - h} width={w} height={h} fill={color} rx="2" />;
      })}
    </svg>
  );
}

export function AnalyticsTab({ onErr }: Props) {
  const [days, setDays] = useState(30);
  const [series, setSeries] = useState<Record<string, { day: string; count: number }[]>>({});

  const load = useCallback(async () => {
    try {
      const d = await adminApi<{ series: Record<string, { day: string; count: number }[]> }>(
        `/admin/analytics/timeseries?days=${days}`,
      );
      setSeries(d.series);
    } catch (e) {
      onErr(e instanceof Error ? e.message : "Analytics failed");
    }
  }, [days, onErr]);

  useEffect(() => {
    void load();
  }, [load]);

  const total = (key: string) => (series[key] ?? []).reduce((a, b) => a + b.count, 0);

  return (
    <>
      <h2 style={{ marginTop: 0 }}>Analytics</h2>
      <p className="muted">Time-series for signups, messages, reports, and automated suspensions.</p>
      <label>
        Days{" "}
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>7</option>
          <option value={30}>30</option>
          <option value={60}>60</option>
          <option value={90}>90</option>
        </select>
      </label>
      <button type="button" className="btn btn-primary" style={{ width: "auto", marginLeft: 8 }} onClick={() => void load()}>
        Refresh
      </button>

      <div className="grid-stats" style={{ marginTop: 16 }}>
        <div className="stat">
          <b>{total("signups")}</b>
          <span>Signups ({days}d)</span>
          {miniChart(series.signups ?? [], "#5B4FE8")}
        </div>
        <div className="stat">
          <b>{total("messages")}</b>
          <span>Messages ({days}d)</span>
          {miniChart(series.messages ?? [], "#53bdeb")}
        </div>
        <div className="stat">
          <b>{total("reports")}</b>
          <span>Reports ({days}d)</span>
          {miniChart(series.reports ?? [], "#f15c6d")}
        </div>
        <div className="stat">
          <b>{total("suspensions")}</b>
          <span>Suspensions ({days}d)</span>
          {miniChart(series.suspensions ?? [], "#ffa500")}
        </div>
      </div>
    </>
  );
}

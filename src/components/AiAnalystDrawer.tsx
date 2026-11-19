import { useEffect, useState } from 'react';
import { MessageSquare, X } from 'lucide-react';
import type { ChatAction } from '../types/hospital';

interface AiAnalystDrawerProps {
  isOpen: boolean;
  onToggleOpen: () => void;
  analyticsContextJson: string;
  totalRows: number;
  dateSpanLabel: string;
  onExecuteAction: (action: ChatAction) => string | undefined;
}

const questions = [
  'Which department has the longest average wait times?',
  'Forecast admissions and bed occupancy for the next 21 days',
  'Summarize overtime exposure and understaffed shift alerts',
  'What is our peak Day-of-Week and Hour demand window?',
];

export function AiAnalystDrawer({isOpen, onToggleOpen, analyticsContextJson, totalRows, dateSpanLabel, onExecuteAction}: AiAnalystDrawerProps) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('Choose an example question. Answers use only the currently selected fictional dataset.');
  useEffect(() => setAnswer('Choose an example question. Answers use only the currently selected fictional dataset.'), [totalRows, dateSpanLabel]);
  if (!isOpen) return null;
  const explain = (text: string) => {
    setQuestion(text);
    try {
      const a = JSON.parse(analyticsContextJson);
      const q = text.toLowerCase();
      const depts = Array.isArray(a.departments) ? a.departments : [];
      const suffix = `Based on ${a.datasetMeta?.filteredRows ?? totalRows} fictional records · ${a.datasetMeta?.dateSpan ?? dateSpanLabel}.`;
      if (/wait|longest/.test(q)) {
        const top = [...depts].sort((x,y) => Number(y.avgWaitMinutes||0)-Number(x.avgWaitMinutes||0))[0];
        setAnswer(top ? `${top.department} has the longest average wait at ${Number(top.avgWaitMinutes).toFixed(1)} minutes. ${suffix}` : 'No departmental waiting-time data is available.');
      } else if (/forecast|predict|project/.test(q)) {
        const days = Math.min(30,Math.max(7, Number(q.match(/\b(\d+)\s*day/)?.[1] ?? (q.match(/\b(\d+)\s*week/) ? String(Number(q.match(/\b(\d+)\s*week/)?.[1])*7) : '14'))));
        onExecuteAction({type:'set_forecast',horizonDays:days,targetTab:'bottlenecks'});
        setAnswer(`Opened the ${days}-day forecasting dashboard. Forecasts are statistical estimates, not actual future hospital activity. ${suffix}`);
      } else if (/overtime|understaff|staff/.test(q)) {
        const k=a.kpis||{};
        const alerts=Array.isArray(a.topBottleneckAlerts)?a.topBottleneckAlerts:[];
        setAnswer(`Estimated overtime: ${Number(k.estimatedOvertimeHours||0).toFixed(1)} hours. Currently listed bottleneck alerts: ${alerts.length}. These are derived estimates and sample alerts. ${suffix}`);
      } else if (/peak|hour|window|arrival/.test(q)) {
        const peak=Array.isArray(a.topArrivalPeakWindows)?a.topArrivalPeakWindows[0]:null;
        setAnswer(peak?`Top arrival window: ${peak.day} at ${peak.hour}, with ${peak.admissions} encounters. ${suffix}`:'No arrival-window data available.');
      } else if (/admission|total|record/.test(q)) {
        setAnswer(`${a.kpis?.totalAdmissions ?? 0} encounters currently match your filters. ${suffix}`);
      } else {
        setAnswer('The offline guide supports waiting times, admissions, arrival peaks, overtime and forecast navigation. For other questions, use the dashboard charts and filters. No external AI model is connected.');
      }
    } catch {
      setAnswer('The dataset summary is unavailable. Check the imported CSV and column mapping.');
    }
  };
  return <aside aria-label="Offline Analytics Guide" className="no-print fixed top-0 right-0 z-40 flex h-screen w-full max-w-md flex-col border-l border-[#02808F]/30 bg-[#0A2E36] p-5 text-white shadow-2xl">
    <div className="flex items-center justify-between"><h2 className="font-bold">Offline Analytics Guide</h2><button onClick={onToggleOpen} aria-label="Close guide"><X/></button></div>
    <p className="mt-3 text-xs text-white/75">Free demonstration · no Gemini API, server, or external requests. Only fictional records.</p>
    <p className="mt-5 rounded-lg bg-white/10 p-4 text-sm leading-6" role="status">{answer}</p>
    <div className="mt-5 space-y-2">{questions.map(q=><button key={q} onClick={()=>explain(q)} className="block w-full rounded-md border border-white/20 p-3 text-left text-sm hover:bg-white/10">{q}</button>)}</div>
    <form className="mt-auto flex gap-2" onSubmit={e=>{e.preventDefault();explain(question)}}><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ask a supported question" className="min-w-0 flex-1 rounded-md p-2 text-slate-900"/><button className="rounded-md bg-[#00A795] px-4 text-white" type="submit"><MessageSquare size={16}/></button></form>
  </aside>;
}
